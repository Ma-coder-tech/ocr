import type { IntelligencePorts } from "./intelligenceTypes.js";
import { createLiveOpenRouterSearchAdapter, createLiveOpenAiInvestigativeAdapter, createLiveOpenAiSemanticAdapter, ProviderOperationAuditLog } from "./providerAdapters.js";
import { bindLivePorts, type InternalLiveExecutionCapabilityV1, requireLiveCapabilityBinding } from "./providerPreflight.js";
import { createNodeDestinationResolutionPort, createNodeHttpsRetrievalPort } from "./publicRetrievalAdapters.js";
import { createPublicDocumentExtractionPort } from "./publicDocumentExtraction.js";

export function createInternalLiveIntelligencePorts(capability: InternalLiveExecutionCapabilityV1, audit: ProviderOperationAuditLog): IntelligencePorts {
  const binding = requireLiveCapabilityBinding(capability);
  const ports: IntelligencePorts = Object.freeze({
    clock: binding.clock,
    search: createLiveOpenRouterSearchAdapter(capability, audit), destination: createNodeDestinationResolutionPort(capability),
    retrieval: createNodeHttpsRetrievalPort(capability, { audit }), extraction: createPublicDocumentExtractionPort(),
    investigative: createLiveOpenAiInvestigativeAdapter(capability, audit), semantic: createLiveOpenAiSemanticAdapter(capability, audit),
  });
  bindLivePorts(capability, ports);
  return ports;
}
