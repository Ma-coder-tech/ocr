import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse as parseEnvironment } from "dotenv";
import { buildProofFixtures } from "./constrained-contextual-ai-fixtures.js";
import { deterministicTemplateCopy, validateGovernedAiPacket } from "../src/constrainedContextualAiProof/packet.js";
import { PROOF_MODEL, PROOF_PROVIDER, callProofModel } from "../src/constrainedContextualAiProof/provider.js";
import { validateGovernedAiOutput } from "../src/constrainedContextualAiProof/validate.js";

const envIndex = process.argv.indexOf("--env-file");
if (envIndex < 0 || !process.argv[envIndex + 1]) throw new Error("provide_--env-file_for_offline_evaluation");
const key = parseEnvironment(await readFile(process.argv[envIndex + 1]!)).OPENAI_API_KEY;
if (!key || key === "your_openai_api_key") throw new Error("openai_api_key_unavailable");

const fixtures = await buildProofFixtures();
const cases = [];
for (const fixture of fixtures) {
  if (!validateGovernedAiPacket(fixture.packet)) throw new Error(`packet_invalid:${fixture.id}`);
  const baseline = deterministicTemplateCopy(fixture.packet);
  const baselineValidation = validateGovernedAiOutput(fixture.packet, baseline);
  if (baselineValidation.status !== "accepted") throw new Error(`baseline_invalid:${fixture.id}:${baselineValidation.reasonCodes.join(",")}`);
  const model = await callProofModel(fixture.packet, key, fixture.adversarialText);
  const validation = validateGovernedAiOutput(fixture.packet, model.candidate);
  cases.push({
    id: fixture.id,
    packet: fixture.packet,
    baseline,
    modelCandidate: model.candidate,
    validation: { status: validation.status, reasonCodes: validation.reasonCodes },
    responseStatus: model.responseStatus,
    actualModel: model.actualModel,
    inputTokens: model.inputTokens,
    outputTokens: model.outputTokens,
    sameExplanationAsBaseline: validation.status === "accepted" && validation.output?.merchantExplanation === baseline.merchantExplanation,
    sameDocumentAsBaseline: validation.status === "accepted" && validation.output?.nextDocumentCode === baseline.nextDocumentCode,
  });
  console.log(`${fixture.id}: ${validation.status}${validation.reasonCodes.length ? ` (${validation.reasonCodes.join(",")})` : ""}`);
}

// A malicious candidate deliberately tests the post-validator even if the provider obeys its instructions.
const adversarialPacket = fixtures.find((item) => item.id === "adversarial")!.packet;
const baseline = deterministicTemplateCopy(adversarialPacket);
const malicious = {
  ...baseline,
  merchantExplanation: `${baseline.merchantExplanation} This is processor markup, is negotiable and removable, means you are overpaying, and will save $99.99. You should be paying 1.00%.`,
};
const maliciousValidation = validateGovernedAiOutput(adversarialPacket, malicious);
if (maliciousValidation.status !== "rejected") throw new Error("adversarial_validator_control_not_rejected");

const summary = {
  modelCalls: cases.length,
  modelAccepted: cases.filter((item) => item.validation.status === "accepted").length,
  modelRejected: cases.filter((item) => item.validation.status === "rejected").length,
  modelRejectionReasons: Object.fromEntries([...new Set(cases.flatMap((item) => item.validation.reasonCodes))].sort().map((reason) =>
    [reason, cases.filter((item) => item.validation.reasonCodes.includes(reason)).length])),
  baselineAccepted: cases.length,
  acceptedExplanationsDifferentFromBaseline: cases.filter((item) => item.validation.status === "accepted" && !item.sameExplanationAsBaseline).length,
  acceptedDocumentChoicesDifferentFromBaseline: cases.filter((item) => item.validation.status === "accepted" && !item.sameDocumentAsBaseline).length,
  validatorAdversarialControlRejected: maliciousValidation.status === "rejected",
  validatorAdversarialControlReasons: maliciousValidation.reasonCodes,
  totalInputTokens: cases.reduce((sum, item) => sum + item.inputTokens, 0),
  totalOutputTokens: cases.reduce((sum, item) => sum + item.outputTokens, 0),
};
const artifact = {
  schemaVersion: "constrained_contextual_ai_offline_evaluation_v1",
  createdAt: new Date().toISOString(),
  provider: PROOF_PROVIDER, requestedModel: PROOF_MODEL,
  apiConfiguration: { endpoint: "https://api.openai.com/v1/responses", store: false, tools: [], background: false,
    reasoningEffort: "low", maxOutputTokens: 2500, structuredOutput: "strict_json_schema", retries: 0 },
  fixtureProvenance: "repository_public_fiserv_fixtures_and_one_synthetic_signed_credit_mutation",
  cases, maliciousValidatorControl: { candidate: malicious, validation: maliciousValidation }, summary,
};
const directory = "evaluations/constrained-contextual-ai-proof";
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/evaluation-2026-09-24.json`, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
