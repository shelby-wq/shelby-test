import "express-async-errors";
import { Worker } from "bullmq";
import { config } from "../config";
import { prisma } from "../db";
import { getEnrichmentProvider } from "../services/enrichment";
import { processImport } from "../services/importer";
import { logAudit } from "../services/audit";
import type { EnrichmentJobData, ImportJobData } from "./queue";

const connection = { url: config.REDIS_URL };

// ─── Enrichment Worker ──────────────────────────────────────

const enrichmentWorker = new Worker<EnrichmentJobData>(
  "enrichment",
  async (job) => {
    const { enrichmentRequestId, leadId, userId } = job.data;

    const enrichmentRequest = await prisma.enrichmentRequest.findUnique({
      where: { id: enrichmentRequestId },
      include: { lead: true },
    });

    if (!enrichmentRequest) {
      throw new Error(`EnrichmentRequest ${enrichmentRequestId} not found`);
    }

    await prisma.enrichmentRequest.update({
      where: { id: enrichmentRequestId },
      data: { status: "PROCESSING" },
    });

    const provider = getEnrichmentProvider();

    try {
      const result = await provider.requestEnrichment({
        ownerName: enrichmentRequest.lead.ownerName,
        propertyAddress: enrichmentRequest.lead.propertyAddress,
        city: enrichmentRequest.lead.city || undefined,
        state: enrichmentRequest.lead.state || undefined,
        zip: enrichmentRequest.lead.zip || undefined,
      });

      // Store enrichment results as ContactPoints
      const contactPointData = [
        ...result.phones.map((p) => ({
          leadId,
          type: "PHONE" as const,
          value: p.value,
          source: provider.name,
          confidenceScore: p.confidence,
          consentStatus: "UNKNOWN" as const,
          dncFlag: false,
        })),
        ...result.emails.map((e) => ({
          leadId,
          type: "EMAIL" as const,
          value: e.value,
          source: provider.name,
          confidenceScore: e.confidence,
          consentStatus: "UNKNOWN" as const,
          dncFlag: false,
        })),
      ];

      if (contactPointData.length > 0) {
        await prisma.contactPoint.createMany({ data: contactPointData });
      }

      await prisma.enrichmentRequest.update({
        where: { id: enrichmentRequestId },
        data: {
          status: "COMPLETED",
          costCents: result.cost,
          rawResponseJson: result.rawResponse as any,
          completedAt: new Date(),
        },
      });

      await logAudit({
        actorId: userId,
        action: "enrichment.complete",
        entity: "EnrichmentRequest",
        entityId: enrichmentRequestId,
        after: {
          provider: provider.name,
          phonesFound: result.phones.length,
          emailsFound: result.emails.length,
          cost: result.cost,
        },
      });
    } catch (err: any) {
      await prisma.enrichmentRequest.update({
        where: { id: enrichmentRequestId },
        data: { status: "FAILED" },
      });

      await logAudit({
        actorId: userId,
        action: "enrichment.failed",
        entity: "EnrichmentRequest",
        entityId: enrichmentRequestId,
        metadata: { error: err.message },
      });

      throw err;
    }
  },
  { connection, concurrency: 5 }
);

// ─── Import Worker ──────────────────────────────────────────

const importWorker = new Worker<ImportJobData>(
  "import",
  async (job) => {
    const { importJobId, filePath, mapping, organizationId, userId } = job.data;
    await processImport(importJobId, filePath, mapping as any, organizationId, userId);
  },
  { connection, concurrency: 2 }
);

// ─── Error handlers ─────────────────────────────────────────

enrichmentWorker.on("failed", (job, err) => {
  console.error(`Enrichment job ${job?.id} failed:`, err.message);
});

importWorker.on("failed", (job, err) => {
  console.error(`Import job ${job?.id} failed:`, err.message);
});

console.log("Workers started: enrichment, import");
