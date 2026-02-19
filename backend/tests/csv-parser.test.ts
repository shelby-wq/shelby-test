import { describe, it, expect } from "vitest";
import { parseCsvHeaders, createCsvStream } from "../src/utils/csv-parser";

describe("parseCsvHeaders", () => {
  it("should extract headers from CSV buffer", async () => {
    const csv = "name,address,city,state,zip\nJohn,123 Main,Austin,TX,78701\n";
    const headers = await parseCsvHeaders(Buffer.from(csv));
    expect(headers).toEqual(["name", "address", "city", "state", "zip"]);
  });

  it("should handle CSV with quotes", async () => {
    const csv = '"owner name","property address"\n"John Smith","123 Main St"\n';
    const headers = await parseCsvHeaders(Buffer.from(csv));
    expect(headers).toEqual(["owner name", "property address"]);
  });
});

describe("createCsvStream", () => {
  it("should parse CSV rows as objects", async () => {
    const csv = "name,address,zip\nJohn,123 Main St,78701\nJane,456 Oak Ave,77001\n";
    const rows = [];

    for await (const row of createCsvStream(Buffer.from(csv))) {
      rows.push(row);
    }

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "John", address: "123 Main St", zip: "78701" });
    expect(rows[1]).toEqual({ name: "Jane", address: "456 Oak Ave", zip: "77001" });
  });

  it("should handle empty lines", async () => {
    const csv = "name,address\nJohn,123 Main\n\nJane,456 Oak\n";
    const rows = [];

    for await (const row of createCsvStream(Buffer.from(csv))) {
      rows.push(row);
    }

    expect(rows).toHaveLength(2);
  });

  it("should trim values", async () => {
    const csv = "name,address\n  John  ,  123 Main St  \n";
    const rows = [];

    for await (const row of createCsvStream(Buffer.from(csv))) {
      rows.push(row);
    }

    expect(rows[0].name).toBe("John");
    expect(rows[0].address).toBe("123 Main St");
  });
});
