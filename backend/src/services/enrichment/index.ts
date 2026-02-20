import { config } from "../../config";
import { EnrichmentProvider, BatchEnrichmentProvider } from "./interface";
import { MockEnrichmentProvider } from "./mock-provider";
import { GenericEnrichmentProvider } from "./generic-provider";
import { TracerfyProvider } from "./tracerfy-provider";

export function getEnrichmentProvider(): EnrichmentProvider {
  if (config.ENRICHMENT_PROVIDER_NAME === "tracerfy" && config.ENRICHMENT_PROVIDER_API_KEY) {
    return new TracerfyProvider(
      config.ENRICHMENT_PROVIDER_API_KEY,
      config.ENRICHMENT_PROVIDER_BASE_URL || "https://api.tracerfy.com"
    );
  }

  if (
    config.ENRICHMENT_PROVIDER_NAME !== "mock" &&
    config.ENRICHMENT_PROVIDER_API_KEY &&
    config.ENRICHMENT_PROVIDER_BASE_URL
  ) {
    return new GenericEnrichmentProvider(
      config.ENRICHMENT_PROVIDER_NAME,
      config.ENRICHMENT_PROVIDER_API_KEY,
      config.ENRICHMENT_PROVIDER_BASE_URL
    );
  }

  return new MockEnrichmentProvider();
}

/**
 * Check if a provider supports batch enrichment (e.g., Tracerfy).
 * Use this in the skiptrace worker to process leads efficiently.
 */
export function isBatchProvider(
  provider: EnrichmentProvider
): provider is BatchEnrichmentProvider {
  return "supportsBatch" in provider && (provider as any).supportsBatch === true;
}

export { EnrichmentProvider, EnrichmentResult, BatchEnrichmentProvider } from "./interface";
