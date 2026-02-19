import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().default("change-me-in-production"),
  BACKEND_PORT: z.coerce.number().default(4000),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_CSV_ROWS: z.coerce.number().default(200000),
  ENRICHMENT_PROVIDER_NAME: z.string().default("mock"),
  ENRICHMENT_PROVIDER_API_KEY: z.string().default(""),
  ENRICHMENT_PROVIDER_BASE_URL: z.string().default(""),
  MESSAGING_PROVIDER_NAME: z.string().default("stub"),
  MESSAGING_PROVIDER_API_KEY: z.string().default(""),
  MESSAGING_PROVIDER_BASE_URL: z.string().default(""),
});

export const config = envSchema.parse(process.env);
