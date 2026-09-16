import { registryRuleForSubject } from "./observationSubjectRegistry.js";
import type { CandidateClaimSupport, RuntimeResearchQuestion } from "./intelligenceTypes.js";

export type ProcessorPresentationCoverageBinding = {
  itemId: string;
  questionId: string;
  coverageCode: string | null;
};

export function enforceProcessorPresentationSemanticCoverage(input: {
  questions: readonly RuntimeResearchQuestion[];
  supports: readonly CandidateClaimSupport[];
  bindings: readonly ProcessorPresentationCoverageBinding[];
}): { supports: CandidateClaimSupport[]; incompleteQuestionIds: string[] } {
  const bindings = new Map(input.bindings.map((binding) => [binding.itemId, binding]));
  const output = input.supports.map((support) => ({ ...support, limitationCodes: [...support.limitationCodes] }));
  const incompleteQuestionIds: string[] = [];
  for (const question of input.questions) {
    const requiredCoverageCodes = registryRuleForSubject(question.subjectCode)?.processorPresentationLocatorCoverage
      .map((item) => item.coverageCode) ?? [];
    if (requiredCoverageCodes.length === 0) continue;
    const questionSupports = output.filter((support) => support.questionId === question.questionId);
    const supportedCoverageCodes = new Set(questionSupports.filter((support) => support.verificationStatus === "supported_candidate")
      .map((support) => bindings.get(support.itemId)?.coverageCode)
      .filter((code): code is string => code !== null && code !== undefined));
    const coverageComplete = requiredCoverageCodes.every((code) => supportedCoverageCodes.has(code));
    if (!coverageComplete) incompleteQuestionIds.push(question.questionId);
    for (let index = 0; index < output.length; index += 1) {
      const support = output[index]!;
      if (support.questionId !== question.questionId) continue;
      const coverageCode = bindings.get(support.itemId)?.coverageCode;
      output[index] = {
        ...support,
        verificationStatus: !coverageComplete && support.verificationStatus === "supported_candidate"
          ? "partially_supported"
          : support.verificationStatus,
        limitationCodes: [...new Set([
          ...support.limitationCodes,
          ...(coverageCode ? [`locator_coverage_${coverageCode}`] : []),
          coverageComplete
            ? "processor_presentation_locator_coverage_complete"
            : "processor_presentation_locator_coverage_incomplete",
        ])],
      };
    }
  }
  return { supports: output, incompleteQuestionIds: [...new Set(incompleteQuestionIds)].sort() };
}
