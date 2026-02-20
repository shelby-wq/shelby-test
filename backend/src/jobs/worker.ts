import "express-async-errors";
import { Worker } from "bullmq";
import { config } from "../config";
import { prisma } from "../db";
import { getEnrichmentProvider } from "../services/enrichment";
import { processImport } from "../services/importer";
import { logAudit } from "../services/audit";
import type { EnrichmentJobData, ImportJobData, SkiptraceJobData } from "./queue";

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

// ─── Skiptrace Worker ────────────────────────────────────────

const skiptraceWorker = new Worker<SkiptraceJobData>(
  "skiptrace",
  async (job) => {
    const { skiptraceJobId, userId } = job.data;

    const skiptraceJob = await prisma.skiptraceJob.findUnique({
      where: { id: skiptraceJobId },
    });

    if (!skiptraceJob) {
      throw new Error(`SkiptraceJob ${skiptraceJobId} not found`);
    }

    await prisma.skiptraceJob.update({
      where: { id: skiptraceJobId },
      data: { status: "PROCESSING" },
    });

    const provider = getEnrichmentProvider();
    const leadIds = skiptraceJob.leadIds as string[];
    const errors: Array<{ leadId: string; ownerName: string; message: string }> = [];
    let processedCount = 0;
    let foundCount = 0;
    let errorCount = 0;
    let totalCostCents = 0;

    for (const leadId of leadIds) {
      try {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: {
            contactPoints: { where: { type: "PHONE" }, select: { id: true } },
          },
        });

        if (!lead) {
          errorCount++;
          errors.push({ leadId, ownerName: "Unknown", message: "Lead not found" });
          processedCount++;
          continue;
        }

        // Double-check: skip if phone was added since job was queued
        if (lead.contactPoints.length > 0) {
          processedCount++;
          // Update progress
          await prisma.skiptraceJob.update({
            where: { id: skiptraceJobId },
            data: { processedCount, alreadyHadCount: { increment: 1 } },
          });
          continue;
        }

        // Call the enrichment provider
        const result = await provider.requestEnrichment({
          ownerName: lead.ownerName,
          propertyAddress: lead.propertyAddress,
          city: lead.city || undefined,
          state: lead.state || undefined,
          zip: lead.zip || undefined,
        });

        // Store phone results as ContactPoints
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

        // Also create an EnrichmentRequest record for audit trail
        await prisma.enrichmentRequest.create({
          data: {
            leadId,
            provider: provider.name,
            permissiblePurpose: skiptraceJob.permissiblePurpose,
            requestedById: userId,
            status: "COMPLETED",
            costCents: result.cost,
            rawResponseJson: result.rawResponse as any,
            completedAt: new Date(),
          },
        });

        if (result.phones.length > 0) {
          foundCount++;
        }
        totalCostCents += result.cost;
        processedCount++;

        // Update progress after each lead
        await prisma.skiptraceJob.update({
          where: { id: skiptraceJobId },
          data: { processedCount, foundCount, costCents: totalCostCents, errorCount },
        });
      } catch (err: any) {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { ownerName: true },
        });
        errorCount++;
        errors.push({
          leadId,
          ownerName: lead?.ownerName || "Unknown",
          message: err.message || "Unknown error",
        });
        processedCount++;

        await prisma.skiptraceJob.update({
          where: { id: skiptraceJobId },
          data: { processedCount, errorCount },
        });
      }
    }

    // Mark job as complete
    await prisma.skiptraceJob.update({
      where: { id: skiptraceJobId },
      data: {
        status: "COMPLETED",
        processedCount,
        foundCount,
        errorCount,
        costCents: totalCostCents,
        errors: errors.length > 0 ? errors : undefined,
        completedAt: new Date(),
      },
    });

    await logAudit({
      actorId: userId,
      action: "skiptrace.complete",
      entity: "SkiptraceJob",
      entityId: skiptraceJobId,
      after: {
        totalLeads: leadIds.length,
        processedCount,
        foundCount,
        errorCount,
        costCents: totalCostCents,
      },
    });
  },
  { connection, concurrency: 1 } // Process one batch at a time
);

// ─── Error handlers ─────────────────────────────────────────

enrichmentWorker.on("failed", (job, err) => {
  console.error(`Enrichment job ${job?.id} failed:`, err.message);
});

importWorker.on("failed", (job, err) => {
  console.error(`Import job ${job?.id} failed:`, err.message);
});

skiptraceWorker.on("failed", async (job, err) => {
  console.error(`Skiptrace job ${job?.id} failed:`, err.message);
  if (job?.data.skiptraceJobId) {
    await prisma.skiptraceJob.update({
      where: { id: job.data.skiptraceJobId },
      data: { status: "FAILED" },
    }).catch(() => {});
  }
});

console.log("Workers started: enrichment, import, skiptrace");
