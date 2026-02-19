import { describe, it, expect } from "vitest";
import { MockEnrichmentProvider } from "../src/services/enrichment/mock-provider";

describe("MockEnrichmentProvider", () => {
  const provider = new MockEnrichmentProvider();

  it("should have name 'mock'", () => {
    expect(provider.name).toBe("mock");
  });

  it("should return phone and email results", async () => {
    const result = await provider.requestEnrichment({
      ownerName: "John Smith",
      propertyAddress: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });

    expect(result.phones).toHaveLength(1);
    expect(result.phones[0].value).toMatch(/^555-\d{4}$/);
    expect(result.phones[0].confidence).toBeGreaterThan(0);

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].value).toContain("@example.com");
    expect(result.emails[0].confidence).toBeGreaterThan(0);

    expect(result.cost).toBe(25);
    expect(result.rawResponse).toBeDefined();
    expect((result.rawResponse as any).mock).toBe(true);
  });

  it("should return deterministic results for same input", async () => {
    const input = {
      ownerName: "Jane Doe",
      propertyAddress: "456 Oak Ave",
    };

    const result1 = await provider.requestEnrichment(input);
    const result2 = await provider.requestEnrichment(input);

    expect(result1.phones[0].value).toBe(result2.phones[0].value);
    expect(result1.emails[0].value).toBe(result2.emails[0].value);
  });
});
