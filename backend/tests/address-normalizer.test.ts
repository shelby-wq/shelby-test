import { describe, it, expect } from "vitest";
import { normalizeAddress, normalizeZip, normalizeName } from "../src/utils/address-normalizer";

describe("normalizeAddress", () => {
  it("should lowercase and trim", () => {
    expect(normalizeAddress("  123 Main Street  ")).toBe("123 main st");
  });

  it("should replace street suffixes with abbreviations", () => {
    expect(normalizeAddress("456 Oak Avenue")).toBe("456 oak ave");
    expect(normalizeAddress("789 Pine Boulevard")).toBe("789 pine blvd");
    expect(normalizeAddress("101 Cedar Drive")).toBe("101 cedar dr");
    expect(normalizeAddress("202 Elm Lane")).toBe("202 elm ln");
    expect(normalizeAddress("303 Maple Court")).toBe("303 maple ct");
    expect(normalizeAddress("404 Birch Road")).toBe("404 birch rd");
  });

  it("should replace directional words", () => {
    expect(normalizeAddress("123 North Main Street")).toBe("123 n main st");
    expect(normalizeAddress("456 South East Avenue")).toBe("456 s e ave");
  });

  it("should remove periods", () => {
    expect(normalizeAddress("123 N. Main St.")).toBe("123 n main st");
  });

  it("should remove commas", () => {
    expect(normalizeAddress("123 Main St, Apt 4")).toBe("123 main st apt 4");
  });

  it("should normalize # to unit", () => {
    expect(normalizeAddress("123 Main St #4")).toBe("123 main st unit 4");
  });

  it("should collapse whitespace", () => {
    expect(normalizeAddress("123   Main   Street")).toBe("123 main st");
  });

  it("should handle empty/null input", () => {
    expect(normalizeAddress("")).toBe("");
  });

  it("should normalize apartment/suite", () => {
    expect(normalizeAddress("123 Main Street Apartment 4B")).toBe("123 main st apt 4b");
    expect(normalizeAddress("123 Main Street Suite 100")).toBe("123 main st ste 100");
  });
});

describe("normalizeZip", () => {
  it("should extract first 5 digits", () => {
    expect(normalizeZip("78701")).toBe("78701");
    expect(normalizeZip("78701-1234")).toBe("78701");
  });

  it("should strip non-numeric characters", () => {
    expect(normalizeZip("TX 78701")).toBe("78701");
  });

  it("should handle empty input", () => {
    expect(normalizeZip("")).toBe("");
  });
});

describe("normalizeName", () => {
  it("should lowercase and trim", () => {
    expect(normalizeName("  John Smith  ")).toBe("john smith");
  });

  it("should remove special characters", () => {
    expect(normalizeName("O'Brien-Smith")).toBe("obriensmith");
  });

  it("should collapse whitespace", () => {
    expect(normalizeName("John   Smith")).toBe("john smith");
  });

  it("should handle empty input", () => {
    expect(normalizeName("")).toBe("");
  });
});
