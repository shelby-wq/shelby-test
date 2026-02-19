import { config } from "../../config";
import { EnrichmentProvider } from "./interface";
import { MockEnrichmentProvider } from "./mock-provider";
import { GenericEnrichmentProvider } from "./generic-provider";

export function getEnrichmentProvider(): EnrichmentProvider {
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

export { EnrichmentProvider, EnrichmentResult } from "./interface";
