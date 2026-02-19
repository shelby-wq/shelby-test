import { Queue } from "bullmq";
import { config } from "../config";
import IORedis from "ioredis";

// Lazy connection — only created when needed
let connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export const enrichmentQueue = new Queue("enrichment", {
  connection: { url: config.REDIS_URL },
});

export const importQueue = new Queue("import", {
  connection: { url: config.REDIS_URL },
});

export interface EnrichmentJobData {
  enrichmentRequestId: string;
  leadId: string;
  userId: string;
}

export interface ImportJobData {
  importJobId: string;
  filePath: string;
  mapping: Record<string, string>;
  organizationId: string;
  userId: string;
}
