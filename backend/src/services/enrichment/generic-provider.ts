import { EnrichmentProvider, EnrichmentResult } from "./interface";

/**
 * Generic enrichment provider that calls an authorized third-party API.
 * Configure via environment variables:
 *   ENRICHMENT_PROVIDER_API_KEY
 *   ENRICHMENT_PROVIDER_BASE_URL
 *
 * The API contract expected:
 *   POST {baseUrl}/lookup
 *   Body: { name, address, city, state, zip }
 *   Response: { phones: [{ number, confidence }], emails: [{ address, confidence }], cost_cents }
 *
 * Adjust the request/response mapping to match your specific authorized provider.
 */
export class GenericEnrichmentProvider implements EnrichmentProvider {
  name: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(name: string, apiKey: string, baseUrl: string) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async requestEnrichment(lead: {
    ownerName: string;
    propertyAddress: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<EnrichmentResult> {
    const response = await fetch(`${this.baseUrl}/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name: lead.ownerName,
        address: lead.propertyAddress,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
      }),
    });

    if (!response.ok) {
      throw new Error(`Enrichment provider returned ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();

    // Map provider response to our standard format
    // Adjust this mapping based on the actual provider's response schema
    return {
      phones: (data.phones || []).map((p: any) => ({
        value: p.number || p.value || p.phone,
        confidence: p.confidence || 0.5,
      })),
      emails: (data.emails || []).map((e: any) => ({
        value: e.address || e.value || e.email,
        confidence: e.confidence || 0.5,
      })),
      cost: data.cost_cents || data.cost || 0,
      rawResponse: data,
    };
  }
}
