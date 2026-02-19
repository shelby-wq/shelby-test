import { parse } from "csv-parse";
import { Readable } from "stream";

export interface CsvRow {
  [key: string]: string;
}

/**
 * Streaming CSV parser. Returns headers and an async iterator of rows.
 */
export async function parseCsvHeaders(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const parser = parse({ to: 1 });
    const rows: string[][] = [];

    parser.on("readable", () => {
      let record;
      while ((record = parser.read()) !== null) {
        rows.push(record);
      }
    });

    parser.on("error", reject);
    parser.on("end", () => {
      resolve(rows[0] || []);
    });

    Readable.from(buffer).pipe(parser);
  });
}

export function createCsvStream(buffer: Buffer): AsyncIterable<CsvRow> {
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  Readable.from(buffer).pipe(parser);

  return parser;
}
