/**
 * Enrichment Provider Adapter Interface.
 *
 * All enrichment providers must implement this interface.
 * Results are stored with full audit trail including permissible purpose.
 */

export interface LeadInput {
  ownerName: string;
  propertyAddress: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface EnrichmentResult {
  phones: Array<{ value: string; confidence: number }>;
  emails: Array<{ value: string; confidence: number }>;
  cost: number; // in cents
  rawResponse: unknown;
}

export interface EnrichmentProvider {
  name: string;
  requestEnrichment(lead: LeadInput): Promise<EnrichmentResult>;
}

/**
 * Batch enrichment provider for services that process multiple leads at once.
 * Providers like Tracerfy accept a CSV upload and return all results in one batch.
 */
export interface BatchEnrichmentProvider extends EnrichmentProvider {
  supportsBatch: true;
  requestBatchEnrichment(
    leads: Array<{ id: string } & LeadInput>
  ): Promise<Map<string, EnrichmentResult>>;
}
