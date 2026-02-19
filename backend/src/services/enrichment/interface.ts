/**
 * Enrichment Provider Adapter Interface.
 *
 * All enrichment providers must implement this interface.
 * Results are stored with full audit trail including permissible purpose.
 */

export interface EnrichmentResult {
  phones: Array<{ value: string; confidence: number }>;
  emails: Array<{ value: string; confidence: number }>;
  cost: number; // in cents
  rawResponse: unknown;
}

export interface EnrichmentProvider {
  name: string;
  requestEnrichment(lead: {
    ownerName: string;
    propertyAddress: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<EnrichmentResult>;
}
