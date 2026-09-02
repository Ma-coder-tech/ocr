import path from "node:path";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
} from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { detectLegacyForbiddenClaims, type GoldObservation } from "./gold-contract-lib.js";

type FixtureCase = {
  caseId: "G1" | "G2" | "G3" | "G4" | "G5" | "G7" | "G8";
  fixtureName: string;
  parser: "processor" | "full" | "summary";
};

const fixtureCases: FixtureCase[] = [
  { caseId: "G1", fixtureName: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf", parser: "processor" },
  { caseId: "G2", fixtureName: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", parser: "processor" },
  { caseId: "G3", fixtureName: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", parser: "processor" },
  { caseId: "G4", fixtureName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", parser: "full" },
  { caseId: "G5", fixtureName: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", parser: "summary" },
  { caseId: "G7", fixtureName: "fiserv_ABDUL_BASHER_Aug_2025.pdf", parser: "processor" },
  { caseId: "G8", fixtureName: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", parser: "processor" },
];

export async function loadCurrentGoldObservations(): Promise<Map<string, GoldObservation>> {
  const observations = new Map<string, GoldObservation>();
  for (const fixtureCase of fixtureCases) observations.set(fixtureCase.caseId, await observationFromFixture(fixtureCase));

  observations.set("G6", unavailable("G6", "requires_human_review"));
  observations.set("G9", unavailable("G9", "source_unavailable"));
  for (let index = 1; index <= 10; index += 1) {
    observations.set(`S${index}`, { caseId: `S${index}`, sourceStatus: "available", values: {}, states: {}, claims: [] });
  }

  const claims = [...new Set([...observations.values()].flatMap((item) => item.claims))].sort();
  observations.set("GLOBAL", { caseId: "GLOBAL", sourceStatus: "available", values: {}, states: {}, claims });
  return observations;
}

async function observationFromFixture(fixtureCase: FixtureCase): Promise<GoldObservation> {
  const fixturePath = path.resolve(process.cwd(), "test/fixtures/pdfs", fixtureCase.fixtureName);
  const document = await parsePdf(fixturePath);
  if (fixtureCase.parser === "summary") {
    const summary = analyzeStatementDocument(document, "restaurant_food_beverage", { sourceFileName: fixtureCase.fixtureName });
    return {
      caseId: fixtureCase.caseId,
      sourceStatus: "available",
      values: {
        "financial.net_submitted": summary.totalVolume,
        "financial.total_fees": summary.totalFees,
        "financial.effective_rate_decimal": summary.effectiveRate / 100,
      },
      states: {},
      claims: detectLegacyForbiddenClaims({ fiservFeeAnalysisV2: summary.fiservFeeAnalysisV2 }),
      valueContexts: {
        "financial.effective_rate_decimal": { denominator: "canonical_net_submitted_card_volume" },
      },
    };
  }

  const driver = fixtureCase.parser === "full" ? fiservFirstDataFullStatementDriver : fiservFirstDataProcessorStatementDriver;
  if (!driver.supports(document)) throw new Error(`Current parser no longer supports opaque Gold observation ${fixtureCase.caseId}.`);
  const output = driver.parse(document, { sourceFileName: fixtureCase.fixtureName }) as any;
  const selected = output.selectedFinancials;
  const pricing = output.pricingModel;
  return {
    caseId: fixtureCase.caseId,
    sourceStatus: "available",
    values: {
      "financial.net_submitted": selected.totalVolume,
      "financial.total_fees": selected.totalFees,
      "financial.net_funded": selected.amountFunded,
      "financial.effective_rate_decimal": selected.effectiveRate,
      "financial.transaction_count": selected.transactionCount?.primaryTransactionCount ?? undefined,
      "pricing.legacy_model": pricing?.pricingModel,
    },
    states: {
      "financial.effective_rate_state": selected.totalVolume === 0 && selected.effectiveRate === 0 ? "numeric_zero" : "defined",
    },
    claims: detectLegacyForbiddenClaims(output),
    valueContexts: {
      "financial.effective_rate_decimal": { denominator: "canonical_net_submitted_card_volume" },
    },
  };
}

function unavailable(caseId: string, sourceStatus: GoldObservation["sourceStatus"]): GoldObservation {
  return { caseId, sourceStatus, values: {}, states: {}, claims: [] };
}
