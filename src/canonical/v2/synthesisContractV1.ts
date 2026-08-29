import { createHash } from "node:crypto";

import { canonicalJson } from "./canonicalJson.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import type { ContractV1SafeActionCode } from "./knowledge/knowledgeTypes.js";
import type {
  BuildCanonicalEconomicsV2SynthesisInput,
  CanonicalEconomicCounterfactualAdmission,
  CanonicalEconomicDriverAdmission,
  CanonicalEconomicThemeAdmission,
  CanonicalMerchantLeverAdmission,
  CanonicalSynthesisProofAdmission,
} from "./synthesisAnalysis.js";
import type { CanonicalSynthesisCalculationAdmission, CanonicalSynthesisSemanticClaimAdmission } from "./synthesisSemantics.js";
import {
  CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1,
  type CanonicalContractV1Action,
  type CanonicalContractV1Constraint,
  type CanonicalContractV1ConstraintActionEffect,
  type CanonicalSynthesisContractV1Application,
  type CanonicalSynthesisContractV1State,
} from "./synthesisContractV1Types.js";

export type CanonicalSynthesisContractV1Build = Pick<BuildCanonicalEconomicsV2SynthesisInput,
  "claims" | "calculations" | "drivers" | "counterfactuals" | "merchantLevers" | "themes" | "dependencies"> & {
  state: CanonicalSynthesisContractV1State;
};

const VERIFICATION_ACTIONS = new Set<ContractV1SafeActionCode>([
  "request_governing_documentation", "verify_account_capability_or_configuration",
]);

export function compileCanonicalSynthesisContractV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  applications: readonly CanonicalSynthesisContractV1Application[];
}): CanonicalSynthesisContractV1Build {
  const apps = [...input.applications].sort((a, b) => a.atomicClaimId.localeCompare(b.atomicClaimId));
  const errors: string[] = [];
  const warnings: string[] = [];
  const validChargeIds = new Set(input.economic.economicLayer.charges.map((item) => item.id));
  const validOccurrenceIds = new Set(input.economic.pricingAnalysis.foundation.sourceModel.occurrences.map((item) => item.id));
  for (const app of apps) {
    if (app.chargeRefs.length === 0 || app.chargeRefs.some((ref) => !validChargeIds.has(ref))) errors.push(`contract_v1_broken_charge_ref:${app.atomicClaimId}`);
    if (app.occurrenceRefs.length === 0 || app.occurrenceRefs.some((ref) => !validOccurrenceIds.has(ref))) errors.push(`contract_v1_broken_occurrence_ref:${app.atomicClaimId}`);
    if (!app.exactFacetVerified || !app.scopeFingerprintVerified || app.evidenceRefs.length === 0) errors.push(`contract_v1_unverified_application:${app.atomicClaimId}`);
    if (app.sourceKind === "current_run_verified_rg_evidence" && app.assertionBasis !== "external_verified") errors.push(`contract_v1_external_basis_mismatch:${app.atomicClaimId}`);
  }

  const constraints = apps.flatMap((app): CanonicalContractV1Constraint[] => app.value.kind === "synthesis_constraint_identity" ? [{
    constraintId: `contract-v1-constraint-${digest({ atomicClaimId: app.atomicClaimId, scope: app.scopeFingerprint,
      governingAuthorityCode: app.value.governingAuthorityCode, evidenceRefs: unique(app.evidenceRefs) })}`,
    atomicClaimId: app.atomicClaimId, constrainedChargeRefs: app.chargeRefs,
    identityResolutionState: "proven", applicabilityResolutionState: "proven",
    applicability: app.value.applicability, governingAuthorityCode: app.value.governingAuthorityCode,
    governingSourceRefs: app.evidenceRefs,
    scopeFingerprint: app.scopeFingerprint, statementPeriod: app.statementPeriod,
    effectiveFrom: app.effectiveFrom, effectiveTo: app.effectiveTo,
    evidenceRefs: app.evidenceRefs, sourceKind: app.sourceKind,
    limitations: ["Constraint identity is independent from every action effect, merchant influence, and economic impact."],
  }] : []);
  const constraintByAtomic = new Map(constraints.map((item) => [item.atomicClaimId, item]));
  const effects = apps.flatMap((app): CanonicalContractV1ConstraintActionEffect[] => {
    if (app.value.kind !== "synthesis_constraint_action_effect") return [];
    const constraint = constraintByAtomic.get(app.value.constraintAtomicClaimId);
    if (!constraint || !sameSet(constraint.constrainedChargeRefs, app.chargeRefs) || constraint.scopeFingerprint !== app.scopeFingerprint
      || !samePeriod(app.statementPeriod, periodFromConstraint(constraint))) {
      warnings.push(`contract_v1_constraint_effect_withheld_binding_invalid:${app.atomicClaimId}`); return [];
    }
    return [{ effectId: `contract-v1-effect-${digest({ atomicClaimId: app.atomicClaimId })}`, atomicClaimId: app.atomicClaimId,
      constraintRef: constraint.constraintId, safeActionCode: app.value.safeActionCode, effectState: app.value.effectState,
      effectResolutionState: "proven",
      conditionAtomicClaimIds: unique(app.value.conditionAtomicClaimIds), dependencyCodes: unique(app.value.dependencyCodes),
      scopeFingerprint: app.scopeFingerprint, statementPeriod: app.statementPeriod,
      effectiveFrom: app.effectiveFrom, effectiveTo: app.effectiveTo,
      evidenceRefs: app.evidenceRefs,
      limitations: ["This effect applies only to the named constraint/action relationship and implies no adjacent economic or permission claim."] }];
  });

  const claims: CanonicalSynthesisSemanticClaimAdmission[] = [];
  const calculations: CanonicalSynthesisCalculationAdmission[] = [];
  const drivers: CanonicalEconomicDriverAdmission[] = [];
  const counterfactuals: CanonicalEconomicCounterfactualAdmission[] = [];
  const merchantLevers: CanonicalMerchantLeverAdmission[] = [];
  const themes: CanonicalEconomicThemeAdmission[] = [];
  const driverKeyByCharge = new Map<string, string>();
  const recurrenceByCharge = indexApps(apps, "synthesis_recurrence");
  const counterfactualByChargeAndAction = new Map<string, CanonicalSynthesisContractV1Application>();

  for (const app of apps.filter((item) => item.value.kind === "synthesis_economic_driver")) {
    const value = app.value.kind === "synthesis_economic_driver" ? app.value : neverValue();
    for (const chargeRef of app.chargeRefs) {
      const charge = input.economic.economicLayer.charges.find((item) => item.id === chargeRef)!;
      const populationRefs = charge.pricingPopulationRefs;
      if (populationRefs.length === 0 || !charge.observedAmount) {
        warnings.push(`contract_v1_driver_withheld_population_unavailable:${app.atomicClaimId}`); continue;
      }
      const key = `contract_driver_${digest({ atomic: app.atomicClaimId, chargeRef })}`;
      driverKeyByCharge.set(chargeRef, key);
      const populationClaimKey = `${key}_population`;
      const costClaimKey = `${key}_cost`;
      claims.push({ key: populationClaimKey, kind: "driver_population_identity", subjectKey: key,
        claimCode: value.populationPredicateCode, populationRefs, occurrenceRefs: charge.sourceOccurrenceRefs, chargeRefs: [chargeRef],
        periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, scopeCode: app.scopeFingerprint, proof: proof(app) });
      const bucket = input.economic.economicLayer.costStack.buckets.find((item) => item.chargeRefs.includes(chargeRef));
      if (bucket) claims.push({ key: costClaimKey, kind: "driver_cost_pool_relationship", subjectKey: key,
        claimCode: bucket.kind, chargeRefs: [chargeRef], occurrenceRefs: charge.sourceOccurrenceRefs, costBucketKind: bucket.kind,
        periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, scopeCode: app.scopeFingerprint, proof: proof(app) });
      drivers.push({ key, driverType: value.driverType, populationRefs,
        populationPredicateCode: value.populationPredicateCode as CanonicalEconomicDriverAdmission["populationPredicateCode"],
        sourceOccurrenceRefs: charge.sourceOccurrenceRefs, economicChargeRefs: [chargeRef], pricingComponentRefs: charge.pricingComponentRefs,
        observedCost: { ...charge.observedAmount, amountMinor: Math.abs(charge.observedAmount.amountMinor) }, attributionMethod: "exclusive_partition",
        relevantCostPoolRef: bucket?.kind ?? null, populationClaimKey, costPoolClaimKey: bucket ? costClaimKey : null, proof: proof(app) });
      if (app.materiality !== "immaterial") themes.push(themeAdmission({ key: `${key}_theme`, app,
        question: "observed_cost_driver", boundary: "explanation_only", type: "major_economic_driver",
        driverKeys: [key], actionability: "not_applicable", coverage: [value.driverType] }));
    }
  }

  for (const app of apps.filter((item) => item.value.kind === "synthesis_counterfactual")) {
    if (app.value.kind !== "synthesis_counterfactual") continue;
    for (const chargeRef of app.chargeRefs) {
      const charge = input.economic.economicLayer.charges.find((item) => item.id === chargeRef)!;
      if (!charge.observedAmount || charge.pricingPopulationRefs.length === 0) {
        warnings.push(`contract_v1_counterfactual_withheld_population_unavailable:${app.atomicClaimId}`); continue;
      }
      if (VERIFICATION_ACTIONS.has(app.value.safeActionCode)) {
        warnings.push(`contract_v1_counterfactual_withheld_verification_action:${app.atomicClaimId}`); continue;
      }
      const populationRefs = charge.pricingPopulationRefs;
      const key = `contract_counterfactual_${digest({ atomic: app.atomicClaimId, chargeRef })}`;
      const targetKey = `${key}_target`; const altKey = `${key}_alternative`;
      claims.push({ key: targetKey, kind: "counterfactual_target", subjectKey: key, claimCode: "observed_charge_population",
        populationRefs, chargeRefs: [chargeRef], occurrenceRefs: charge.sourceOccurrenceRefs,
        periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, scopeCode: app.scopeFingerprint, proof: proof(app) });
      claims.push({ key: altKey, kind: "counterfactual_alternative_condition", subjectKey: key, claimCode: app.value.safeActionCode,
        populationRefs, chargeRefs: [chargeRef], occurrenceRefs: charge.sourceOccurrenceRefs,
        periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, scopeCode: app.scopeFingerprint, proof: proof(app) });
      const assumptionKeys = app.value.assumptionCodes.map((code, index) => {
        const claimKey = `${key}_assumption_${index}`;
        claims.push({ key: claimKey, kind: "counterfactual_assumption", subjectKey: key, claimCode: code,
          populationRefs, chargeRefs: [chargeRef], occurrenceRefs: charge.sourceOccurrenceRefs,
          periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, scopeCode: app.scopeFingerprint, proof: proof(app) });
        return claimKey;
      });
      const recurrence = recurrenceByCharge.get(chargeRef)?.find((candidate) => sameApplicationScope(candidate, app));
      let cadenceKey: string | null = null;
      if (recurrence?.value.kind === "synthesis_recurrence") {
        cadenceKey = `${key}_cadence`;
        claims.push({ key: cadenceKey, kind: "cadence_recurrence", subjectKey: key, claimCode: recurrence.value.recurrenceBasis,
          populationRefs, chargeRefs: [chargeRef], occurrenceRefs: charge.sourceOccurrenceRefs,
          recurrenceBasis: recurrence.value.recurrenceBasis, occurrencesPerYear: recurrence.value.occurrencesPerYear,
          periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, scopeCode: app.scopeFingerprint, proof: proof(recurrence) });
      }
      let calculationKey: string | null = null;
      let exactDelta = null;
      if (app.value.resultState === "exact_deterministic_delta" && app.value.alternativeAmountMinor !== null) {
        const factor = recurrence?.value.kind === "synthesis_recurrence" ? recurrence.value.occurrencesPerYear : 1;
        exactDelta = { currency: "USD" as const,
          amountMinor: (Math.abs(charge.observedAmount.amountMinor) - app.value.alternativeAmountMinor) * factor };
        calculationKey = `${key}_calculation`;
        calculations.push({ key: calculationKey, kind: "counterfactual_exact_delta", subjectKey: key,
          populationRefs, inputClaimKeys: [targetKey, altKey, ...assumptionKeys, ...(cadenceKey ? [cadenceKey] : [])],
          inputAmounts: [{ currency: "USD", amountMinor: Math.abs(charge.observedAmount.amountMinor) },
            { currency: "USD", amountMinor: app.value.alternativeAmountMinor }], resultAmount: exactDelta,
          annualizationFactor: factor, periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end, proof: proof(app) });
      }
      counterfactuals.push({ key, observedPopulationRefs: populationRefs, observedChargeRefs: [chargeRef],
        observedCost: { currency: "USD", amountMinor: Math.abs(charge.observedAmount.amountMinor) },
        alternativePopulationRefs: populationRefs, populationCompatibility: "compatible",
        alternativeEvidenceRefs: app.evidenceRefs, alternativeProvenanceId: app.applicationId,
        assumptions: unique([...app.value.assumptionCodes, `impact_basis_${app.value.grossOrNet}`,
          ...app.value.implementationDependencyCodes.map((code) => `implementation_dependency_${code}`)]),
        baselinePeriod: periodCode(app), impactPeriod: periodCode(app),
        cadenceEvidenceRefs: recurrence?.evidenceRefs ?? [], recurrenceProven: Boolean(recurrence), annualized: Boolean(recurrence),
        requestedResultState: app.value.resultState, exactDelta, targetClaimKey: targetKey, alternativeConditionClaimKey: altKey,
        assumptionClaimKeys: assumptionKeys, cadenceClaimKey: cadenceKey, calculationKey, proof: proof(app) });
      counterfactualByChargeAndAction.set(actionScopeKey(app.chargeRefs, app.scopeFingerprint,
        app.statementPeriod, app.value.safeActionCode), app);
    }
  }

  const actions: CanonicalContractV1Action[] = [];
  for (const app of apps.filter((item) => item.value.kind === "synthesis_safe_action")) {
    if (app.value.kind !== "synthesis_safe_action") continue;
    const actionCode = app.value.safeActionCode;
    const relevantEffects = effects.filter((effect) => effect.safeActionCode === actionCode && effect.scopeFingerprint === app.scopeFingerprint &&
      samePeriod(periodFromEffect(effect), app.statementPeriod) &&
      constraintById(constraints, effect.constraintRef)?.applicability === "applicable" &&
      sameSet(constraintById(constraints, effect.constraintRef)?.constrainedChargeRefs ?? [], app.chargeRefs));
    const blocked = relevantEffects.some((effect) => effect.effectState === "blocks_action");
    const conditions = relevantEffects.filter((effect) => effect.effectState === "conditions_action").flatMap((effect) => effect.conditionAtomicClaimIds);
    const conditionApps = apps.filter((candidate) => candidate.value.kind === "synthesis_condition_state"
      && candidate.value.safeActionCode === actionCode && conditions.includes(candidate.atomicClaimId)
      && sameApplicationScope(candidate, app));
    const conditionNegative = conditionApps.some((candidate) => candidate.value.kind === "synthesis_condition_state" && candidate.value.state === "not_satisfied");
    const conditionsSatisfied = conditions.length === 0 || conditions.every((id) => conditionApps.some((candidate) => candidate.atomicClaimId === id
      && candidate.value.kind === "synthesis_condition_state" && candidate.value.state === "satisfied"));
    const effectDependenciesReady = relevantEffects.every((effect) => effect.dependencyCodes.length === 0);
    const influenceApps = apps.filter((candidate) => candidate.value.kind === "synthesis_merchant_influence"
      && candidate.value.safeActionCode === actionCode && sameApplicationScope(candidate, app));
    const hasRight = influenceApps.some((candidate) => candidate.value.kind === "synthesis_merchant_influence"
      && candidate.value.influenceKind === "merchant_change_right" && candidate.value.state === "proven");
    const hasControl = influenceApps.some((candidate) => candidate.value.kind === "synthesis_merchant_influence"
      && candidate.value.influenceKind === "merchant_operational_controllability" && candidate.value.state === "proven");
    const influenceReady = app.value.requiredInfluence === "none" || app.value.requiredInfluence === "merchant_change_right" && hasRight
      || app.value.requiredInfluence === "merchant_operational_controllability" && hasControl || app.value.requiredInfluence === "both" && hasRight && hasControl;
    const driverReady = actionCode !== "review_supported_operational_process_change"
      || app.chargeRefs.every((ref) => driverKeyByCharge.has(ref));
    const candidate = VERIFICATION_ACTIONS.has(actionCode);
    const monitoring = actionCode === "establish_monitoring_baseline";
    const materialVerificationSubject = app.materiality === "material";
    const actionContractValid = requiredInfluenceAllowed(actionCode, app.value.requiredInfluence)
      && (!candidate || app.value.verificationRequirementCode !== null);
    const prerequisitesReady = actionContractValid && influenceReady && driverReady && conditionsSatisfied && effectDependenciesReady
      && app.value.implementationDependencyCodes.length === 0 && (!candidate && !monitoring || materialVerificationSubject);
    const state = blocked || conditionNegative ? "not_available" as const
      : candidate && prerequisitesReady ? "documentation_or_monitoring_only" as const
      : prerequisitesReady ? "eligible_supported" as const : "candidate_requires_verification" as const;
    const counterfactual = counterfactualByChargeAndAction.get(actionScopeKey(app.chargeRefs, app.scopeFingerprint,
      app.statementPeriod, actionCode));
    const recurrence = app.chargeRefs.flatMap((ref) => recurrenceByCharge.get(ref) ?? [])
      .find((candidate) => sameApplicationScope(candidate, app));
    const counterfactualDependenciesReady = counterfactual?.value.kind !== "synthesis_counterfactual"
      || counterfactual.value.implementationDependencyCodes.length === 0;
    const permissionCeiling = candidate ? state === "documentation_or_monitoring_only"
      ? "verification_or_document_request" as const : "none" as const
      : state !== "eligible_supported" ? "none" as const
      : counterfactual?.value.kind === "synthesis_counterfactual" && counterfactual.value.resultState === "exact_deterministic_delta"
        && counterfactualDependenciesReady
        ? recurrence ? "supported_action_with_annual_impact" as const : "supported_action_with_statement_period_impact" as const
        : "supported_action_no_quantified_impact" as const;
    const actionId = `contract-v1-action-${digest({ atomic: app.atomicClaimId, actionCode })}`;
    actions.push({ actionId, atomicClaimId: app.atomicClaimId, safeActionCode: actionCode,
      class: candidate ? "candidate_verification" : monitoring ? "supported_evidence_collection" : "supported_action",
      state, chargeRefs: app.chargeRefs, mechanismCode: app.value.mechanismCode,
      verificationRequirementCode: app.value.verificationRequirementCode, requestTargetCode: app.value.requestTargetCode,
      requiredInfluence: app.value.requiredInfluence,
      implementationDependencyCodes: app.value.implementationDependencyCodes,
      influenceApplicationRefs: influenceApps.map((item) => item.applicationId), constraintEffectRefs: relevantEffects.map((item) => item.effectId),
      counterfactualApplicationRef: counterfactual?.applicationId ?? null, recurrenceApplicationRef: recurrence?.applicationId ?? null,
      materiality: app.materiality, permissionCeiling, evidenceRefs: unique([app.evidenceRefs, ...influenceApps.map((item) => item.evidenceRefs)].flat()),
      limitations: unique([
        "Action support does not imply success, entitlement, removability, recommendation, or economic impact.",
        ...(!conditionsSatisfied ? ["One or more exact constraint conditions remain unresolved."] : []),
        ...(!effectDependenciesReady ? ["One or more exact constraint-effect dependencies remain unresolved."] : []),
        ...(app.value.implementationDependencyCodes.length > 0 ? ["Implementation dependencies remain unresolved."] : []),
      ]) });
    const leverKey = `contract_lever_${digest({ atomic: app.atomicClaimId })}`;
    const influence = influenceApps.find((candidate) => candidate.value.kind === "synthesis_merchant_influence" && candidate.value.state === "proven");
    let influenceClaimKey: string | null = null;
    if (influence?.value.kind === "synthesis_merchant_influence") {
      influenceClaimKey = `${leverKey}_influence`;
      claims.push({ key: influenceClaimKey, kind: influence.value.influenceKind, subjectKey: leverKey,
        claimCode: influence.value.authorityRelationshipCode, chargeRefs: app.chargeRefs, occurrenceRefs: app.occurrenceRefs,
        participantRefs: merchantParticipantRefs(input.economic), periodStart: app.statementPeriod.start, periodEnd: app.statementPeriod.end,
        scopeCode: app.scopeFingerprint, proof: proof(influence) });
    }
    const counterfactualKey = counterfactual ? `contract_counterfactual_${digest({ atomic: counterfactual.atomicClaimId, chargeRef: app.chargeRefs[0] })}` : null;
    merchantLevers.push({ key: leverKey, leverType: leverType(actionCode), requestedState: state,
      driverKeys: app.chargeRefs.map((ref) => driverKeyByCharge.get(ref)).filter(isString), chargeRefs: app.chargeRefs,
      counterfactualKey, merchantInfluenceClaimKey: influenceClaimKey, safeActionCode: actionCode,
      prohibitedClaimCodes: prohibitedClaims(actionCode), proof: proof(app) });
    const question = actionCode === "establish_monitoring_baseline" && driverKeyByCharge.size > 0 ? "observed_cost_driver" : "cost_control_and_merchant_action";
    const boundary = permissionCeiling === "none" ? "verification_or_document_request" : permissionCeiling;
    const themeLeverKeys = state === "eligible_supported" || state === "documentation_or_monitoring_only"
      ? [leverKey] : [];
    if (app.materiality !== "immaterial") themes.push(themeAdmission({ key: `${leverKey}_theme`, app, question, boundary,
      type: candidate || state === "candidate_requires_verification" ? "unresolved_cost_control" : "other_supported_question",
      leverKeys: themeLeverKeys, actionability: state, coverage: [actionCode] }));
  }

  for (const theme of themes as Array<CanonicalEconomicThemeAdmission & { __contractThemeClaim?: {
    key: string; app: CanonicalSynthesisContractV1Application; coverage: string[] } }>) {
    const hidden = theme.__contractThemeClaim;
    if (!hidden) continue;
    claims.push({ key: hidden.key, kind: "theme_contribution", subjectKey: theme.key,
      claimCode: unique(hidden.coverage).join("|"), chargeRefs: theme.chargeRefs,
      occurrenceRefs: hidden.app.occurrenceRefs, periodStart: hidden.app.statementPeriod.start,
      periodEnd: hidden.app.statementPeriod.end, scopeCode: hidden.app.scopeFingerprint, proof: proof(hidden.app) });
    delete theme.__contractThemeClaim;
  }

  const state: CanonicalSynthesisContractV1State = {
    contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1, authority: "internal_canonical_analysis_run_only",
    customerReportAuthority: "unchanged", providerExecution: "not_executed_during_convergence", specializedFamilies: "inactive",
    applications: apps, constraints, constraintActionEffects: effects, actions: actions.sort(byId),
    validation: { status: errors.length === 0 ? "valid" : "invalid", errors: unique(errors), warnings: unique(warnings) },
  };
  return { claims, calculations, drivers, counterfactuals, merchantLevers, themes, dependencies: [], state };
}

function proof(app: CanonicalSynthesisContractV1Application): CanonicalSynthesisProofAdmission {
  return { derivabilityTier: app.derivabilityTier, evidenceClass: app.evidenceClass, assertionBasis: app.assertionBasis,
    confidence: "high", evidenceRefs: app.evidenceRefs, effectiveFrom: app.effectiveFrom, effectiveTo: app.effectiveTo,
    limitations: [app.sourceKind === "governed_rf_snapshot" ? "Supported by the immutable run-bound RF snapshot."
      : "Supported only for this AnalysisRun by integrity-checked verified external evidence."] };
}
function themeAdmission(input: { key: string; app: CanonicalSynthesisContractV1Application; question: string; boundary: string;
  type: CanonicalEconomicThemeAdmission["themeType"]; driverKeys?: string[]; leverKeys?: string[];
  actionability: CanonicalEconomicThemeAdmission["actionabilityState"]; coverage: string[] }): CanonicalEconomicThemeAdmission {
  const claimKey = `${input.key}_claim`;
  return { key: input.key, claimKey, economicQuestionCode: input.question, actionBoundaryCode: input.boundary,
    canonicalQuestionScopeFingerprint: input.app.scopeFingerprint, statementPeriod: input.app.statementPeriod,
    themeType: input.type, chargeRefs: input.app.chargeRefs, driverKeys: input.driverKeys, leverKeys: input.leverKeys,
    materiality: input.type === "unresolved_cost_control" && input.app.materiality === "material" ? "unresolved"
      : input.app.materiality === "material" ? "material" : input.app.materiality === "contextual" ? "contextual" : "unresolved",
    actionabilityState: input.actionability,
    priorityClass: input.type === "unresolved_cost_control" && input.app.materiality === "material" ? "unresolved"
      : input.app.materiality === "material" ? "material_economics"
      : input.app.materiality === "contextual" ? "context" : "unresolved", semanticCoverageCodes: input.coverage, proof: proof(input.app),
    __contractThemeClaim: { key: claimKey, app: input.app, coverage: input.coverage } } as CanonicalEconomicThemeAdmission;
}
function indexApps(apps: CanonicalSynthesisContractV1Application[], kind: "synthesis_recurrence") {
  const map = new Map<string, CanonicalSynthesisContractV1Application[]>();
  for (const app of apps.filter((item) => item.value.kind === kind)) for (const ref of app.chargeRefs) map.set(ref, [...(map.get(ref) ?? []), app]);
  return map;
}
function merchantParticipantRefs(economic: CanonicalEconomicsV2EconomicAnalysis): string[] {
  return economic.economicLayer.participants.filter((item) => item.roles.includes("merchant") && item.roleResolution === "proven").map((item) => item.id);
}
function leverType(code: ContractV1SafeActionCode): CanonicalMerchantLeverAdmission["leverType"] {
  if (code === "request_pricing_term_review") return "pricing_term_change";
  if (code === "review_supported_configuration_change" || code === "verify_account_capability_or_configuration") return "configuration_acceptance_method_change";
  if (code === "review_supported_operational_process_change") return "operational_process_change";
  if (code === "establish_monitoring_baseline") return "monitoring_baseline";
  return "documentation_verification";
}
function prohibitedClaims(code: ContractV1SafeActionCode): string[] {
  return unique(["guaranteed_outcome", "legal_advice", "unsupported_switch_cancel_or_renegotiate", "impact_without_counterfactual",
    ...(VERIFICATION_ACTIONS.has(code) ? ["affirmative_economic_change_conclusion"] : [])]);
}
function constraintById(values: CanonicalContractV1Constraint[], id: string) { return values.find((item) => item.constraintId === id); }
function periodCode(app: CanonicalSynthesisContractV1Application) { return `${app.statementPeriod.start}/${app.statementPeriod.end}`; }
function sameSet(a: string[], b: string[]) { return a.length === b.length && a.every((item) => b.includes(item)); }
function samePeriod(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start === b.start && a.end === b.end;
}
function sameApplicationScope(a: CanonicalSynthesisContractV1Application, b: CanonicalSynthesisContractV1Application) {
  return a.scopeFingerprint === b.scopeFingerprint && samePeriod(a.statementPeriod, b.statementPeriod)
    && sameSet(a.chargeRefs, b.chargeRefs);
}
function periodFromConstraint(value: CanonicalContractV1Constraint) { return value.statementPeriod; }
function periodFromEffect(value: CanonicalContractV1ConstraintActionEffect) { return value.statementPeriod; }
function actionScopeKey(chargeRefs: string[], scopeFingerprint: string, statementPeriod: { start: string; end: string },
  safeActionCode: ContractV1SafeActionCode) {
  return canonicalJson({ chargeRefs: unique(chargeRefs), scopeFingerprint, statementPeriod, safeActionCode });
}
function requiredInfluenceAllowed(code: ContractV1SafeActionCode,
  influence: CanonicalContractV1Action["requiredInfluence"]): boolean {
  if (["request_governing_documentation", "verify_account_capability_or_configuration", "establish_monitoring_baseline"].includes(code)) {
    return influence === "none";
  }
  if (code === "request_pricing_term_review") return influence === "merchant_change_right";
  if (code === "review_supported_operational_process_change") {
    return influence === "merchant_operational_controllability" || influence === "both";
  }
  return influence !== "none";
}
function unique<T>(values: T[]): T[] { return [...new Set(values)].sort() as T[]; }
function digest(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 24); }
function byId(a: { actionId: string }, b: { actionId: string }) { return a.actionId.localeCompare(b.actionId); }
function isString(value: string | undefined): value is string { return Boolean(value); }
function neverValue(): never { throw new Error("contract_v1_unreachable_value_kind"); }
