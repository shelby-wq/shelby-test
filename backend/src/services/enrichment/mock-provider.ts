import { EnrichmentProvider, EnrichmentResult } from "./interface";

/**
 * Mock enrichment provider for development and testing.
 * Returns fake data — never used in production.
 */
export class MockEnrichmentProvider implements EnrichmentProvider {
  name = "mock";

  async requestEnrichment(lead: {
    ownerName: string;
    propertyAddress: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<EnrichmentResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const hash = simpleHash(lead.ownerName + lead.propertyAddress);

    return {
      phones: [
        {
          value: `555-${String(hash % 10000).padStart(4, "0")}`,
          confidence: 0.85,
        },
      ],
      emails: [
        {
          value: `${lead.ownerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          confidence: 0.72,
        },
      ],
      cost: 25, // 25 cents
      rawResponse: {
        mock: true,
        generated_at: new Date().toISOString(),
        input: { name: lead.ownerName, address: lead.propertyAddress },
      },
    };
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
