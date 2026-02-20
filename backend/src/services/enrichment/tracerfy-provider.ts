import {
  EnrichmentResult,
  LeadInput,
  BatchEnrichmentProvider,
} from "./interface";

/**
 * Tracerfy Skip Tracing Provider.
 *
 * Uses Tracerfy's CSV-based batch API:
 *   1. POST /trace/  — Upload CSV of leads, returns a queue ID
 *   2. GET /queue/:id — Poll until status is complete, then download results
 *
 * For single-lead enrichment, creates a 1-row CSV.
 * For batch (skiptrace jobs), uploads all leads at once for maximum efficiency.
 *
 * Sign up at https://www.tracerfy.com and generate an API key from the dashboard.
 *
 * Environment variables:
 *   ENRICHMENT_PROVIDER_NAME="tracerfy"
 *   ENRICHMENT_PROVIDER_API_KEY="your-tracerfy-api-key"
 *   ENRICHMENT_PROVIDER_BASE_URL="https://api.tracerfy.com"
 */
export class TracerfyProvider implements BatchEnrichmentProvider {
  name = "tracerfy";
  supportsBatch = true as const;

  private apiKey: string;
  private baseUrl: string;
  private costPerLookupCents: number;
  private pollIntervalMs: number;
  private maxPollAttempts: number;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.costPerLookupCents = 2; // $0.02 per record
    this.pollIntervalMs = 3000;
    this.maxPollAttempts = 200; // ~10 minutes max wait
  }

  // ─── Single lead enrichment ─────────────────────────────

  async requestEnrichment(lead: LeadInput): Promise<EnrichmentResult> {
    const results = await this.requestBatchEnrichment([
      { id: "single", ...lead },
    ]);
    return results.get("single") || {
      phones: [],
      emails: [],
      cost: this.costPerLookupCents,
      rawResponse: { noResults: true },
    };
  }

  // ─── Batch enrichment ──────────────────────────────────

  async requestBatchEnrichment(
    leads: Array<{ id: string } & LeadInput>
  ): Promise<Map<string, EnrichmentResult>> {
    // 1. Build CSV from leads
    const csv = this.buildCsv(leads);

    // 2. Upload CSV to start trace job
    const queueId = await this.uploadTrace(csv);

    // 3. Poll until complete
    const resultsCsv = await this.pollForResults(queueId);

    // 4. Parse results back into EnrichmentResult map
    return this.parseResults(leads, resultsCsv);
  }

  // ─── CSV Building ──────────────────────────────────────

  private buildCsv(leads: Array<{ id: string } & LeadInput>): string {
    const header = "id,first_name,last_name,address,city,state,zip";
    const rows = leads.map((lead) => {
      const { firstName, lastName } = this.splitName(lead.ownerName);
      return [
        this.csvEscape(lead.id),
        this.csvEscape(firstName),
        this.csvEscape(lastName),
        this.csvEscape(lead.propertyAddress),
        this.csvEscape(lead.city || ""),
        this.csvEscape(lead.state || ""),
        this.csvEscape(lead.zip || ""),
      ].join(",");
    });
    return [header, ...rows].join("\n");
  }

  private splitName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    const lastName = parts.pop()!;
    return { firstName: parts.join(" "), lastName };
  }

  private csvEscape(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // ─── API Calls ─────────────────────────────────────────

  private async uploadTrace(csvContent: string): Promise<string> {
    // Build multipart form with CSV file
    const boundary = "----TracerfyBoundary" + Date.now();
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="skiptrace.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n` +
      csvContent +
      `\r\n--${boundary}--\r\n`;

    const response = await fetch(`${this.baseUrl}/trace/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Tracerfy upload failed (${response.status}): ${text || response.statusText}`
      );
    }

    const data: any = await response.json();
    const queueId = data.queue_id || data.id || data.queueId;

    if (!queueId) {
      throw new Error(
        `Tracerfy upload did not return a queue ID. Response: ${JSON.stringify(data)}`
      );
    }

    return queueId;
  }

  private async pollForResults(queueId: string): Promise<string> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));

      const response = await fetch(`${this.baseUrl}/queue/${queueId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 425) {
          // Job not ready yet
          continue;
        }
        throw new Error(`Tracerfy poll failed (${response.status}): ${response.statusText}`);
      }

      const data: any = await response.json();

      // Check if job is complete — adapt field names to Tracerfy's actual response
      const status = data.status || data.state;
      if (status === "completed" || status === "complete" || status === "done") {
        // Results may be inline CSV or a download URL
        if (data.results_csv || data.csv) {
          return data.results_csv || data.csv;
        }
        if (data.download_url || data.results_url) {
          const csvResponse = await fetch(data.download_url || data.results_url, {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          });
          if (!csvResponse.ok) {
            throw new Error(`Failed to download Tracerfy results: ${csvResponse.status}`);
          }
          return await csvResponse.text();
        }
        // If the data itself contains the records array
        if (data.results || data.records || data.data) {
          return JSON.stringify(data.results || data.records || data.data);
        }
        throw new Error(
          `Tracerfy job complete but no results found. Response: ${JSON.stringify(data).slice(0, 500)}`
        );
      }

      if (status === "failed" || status === "error") {
        throw new Error(`Tracerfy job failed: ${data.error || data.message || "Unknown error"}`);
      }

      // Still processing — continue polling
    }

    throw new Error(`Tracerfy job ${queueId} did not complete within the timeout period`);
  }

  // ─── Result Parsing ─────────────────────────────────────

  private parseResults(
    leads: Array<{ id: string } & LeadInput>,
    resultsCsv: string
  ): Map<string, EnrichmentResult> {
    const results = new Map<string, EnrichmentResult>();

    // Try parsing as JSON first (some API responses return JSON array)
    try {
      const jsonData = JSON.parse(resultsCsv);
      if (Array.isArray(jsonData)) {
        return this.parseJsonResults(leads, jsonData);
      }
    } catch {
      // Not JSON — parse as CSV
    }

    // Parse CSV results
    const lines = resultsCsv.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      // No results
      for (const lead of leads) {
        results.set(lead.id, {
          phones: [],
          emails: [],
          cost: this.costPerLookupCents,
          rawResponse: { noResults: true },
        });
      }
      return results;
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

    // Find column indexes for our ID and phone/email columns
    const idCol = this.findColumn(headers, ["id", "record_id", "reference"]);
    const phoneColumns = this.findPhoneColumns(headers);
    const emailColumns = this.findEmailColumns(headers);

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const recordId = idCol >= 0 ? values[idCol]?.trim() : null;

      // Match result to lead by ID or by row order
      const leadId = recordId || leads[i - 1]?.id;
      if (!leadId) continue;

      const phones: Array<{ value: string; confidence: number }> = [];
      for (const col of phoneColumns) {
        const val = values[col]?.trim();
        if (val && val.length >= 7) {
          phones.push({ value: this.normalizePhone(val), confidence: 0.75 });
        }
      }

      const emails: Array<{ value: string; confidence: number }> = [];
      for (const col of emailColumns) {
        const val = values[col]?.trim();
        if (val && val.includes("@")) {
          emails.push({ value: val.toLowerCase(), confidence: 0.7 });
        }
      }

      results.set(leadId, {
        phones,
        emails,
        cost: this.costPerLookupCents,
        rawResponse: Object.fromEntries(headers.map((h, idx) => [h, values[idx] || ""])),
      });
    }

    // Fill in any leads that weren't in the results
    for (const lead of leads) {
      if (!results.has(lead.id)) {
        results.set(lead.id, {
          phones: [],
          emails: [],
          cost: this.costPerLookupCents,
          rawResponse: { noResults: true },
        });
      }
    }

    return results;
  }

  private parseJsonResults(
    leads: Array<{ id: string } & LeadInput>,
    records: any[]
  ): Map<string, EnrichmentResult> {
    const results = new Map<string, EnrichmentResult>();

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const leadId = record.id || record.record_id || leads[i]?.id;
      if (!leadId) continue;

      const phones: Array<{ value: string; confidence: number }> = [];
      const emails: Array<{ value: string; confidence: number }> = [];

      // Extract phones from various possible field formats
      for (const key of Object.keys(record)) {
        const lk = key.toLowerCase();
        if (lk.includes("phone") || lk.includes("mobile") || lk.includes("cell")) {
          const val = String(record[key] || "").trim();
          if (val && val.length >= 7) {
            phones.push({ value: this.normalizePhone(val), confidence: 0.75 });
          }
        }
        if (lk.includes("email")) {
          const val = String(record[key] || "").trim();
          if (val && val.includes("@")) {
            emails.push({ value: val.toLowerCase(), confidence: 0.7 });
          }
        }
      }

      results.set(leadId, {
        phones,
        emails,
        cost: this.costPerLookupCents,
        rawResponse: record,
      });
    }

    for (const lead of leads) {
      if (!results.has(lead.id)) {
        results.set(lead.id, {
          phones: [],
          emails: [],
          cost: this.costPerLookupCents,
          rawResponse: { noResults: true },
        });
      }
    }

    return results;
  }

  // ─── Helpers ──────────────────────────────────────────

  private findColumn(headers: string[], candidates: string[]): number {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  private findPhoneColumns(headers: string[]): number[] {
    const cols: number[] = [];
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (
        h.includes("phone") ||
        h.includes("mobile") ||
        h.includes("cell") ||
        h.includes("landline") ||
        h.includes("wireless")
      ) {
        cols.push(i);
      }
    }
    return cols;
  }

  private findEmailColumns(headers: string[]): number[] {
    const cols: number[] = [];
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].includes("email")) {
        cols.push(i);
      }
    }
    return cols;
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === "1") {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone; // Return as-is if format is unexpected
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
    }
    values.push(current);
    return values;
  }
}
