import "express-async-errors";
import { Worker } from "bullmq";
import { config } from "../config";
import { prisma } from "../db";
import { getEnrichmentProvider, isBatchProvider } from "../services/enrichment";
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

    // Use batch mode for providers like Tracerfy (one API call for all leads)
    if (isBatchProvider(provider)) {
      await processBatchSkiptrace(skiptraceJobId, leadIds, provider, skiptraceJob.permissiblePurpose, userId);
    } else {
      await processSequentialSkiptrace(skiptraceJobId, leadIds, provider, skiptraceJob.permissiblePurpose, userId);
    }
  },
  { connection, concurrency: 1 } // Process one batch at a time
);

/**
 * Batch mode: upload all leads to the provider at once (e.g., Tracerfy CSV upload).
 * Much more efficient — one API call instead of N.
 */
async function processBatchSkiptrace(
  skiptraceJobId: string,
  leadIds: string[],
  provider: ReturnType<typeof getEnrichmentProvider> & { supportsBatch: true; requestBatchEnrichment: any },
  permissiblePurpose: string,
  userId: string,
) {
  // Load all leads
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: {
      contactPoints: { where: { type: "PHONE" }, select: { id: true } },
    },
  });

  // Split into leads that need processing and those that already have phones
  const leadsToProcess = leads.filter((l) => l.contactPoints.length === 0);
  const alreadyHadCount = leads.length - leadsToProcess.length;
  const missingCount = leadIds.length - leads.length;

  await prisma.skiptraceJob.update({
    where: { id: skiptraceJobId },
    data: { alreadyHadCount },
  });

  if (leadsToProcess.length === 0) {
    await prisma.skiptraceJob.update({
      where: { id: skiptraceJobId },
      data: {
        status: "COMPLETED",
        processedCount: leadIds.length,
        alreadyHadCount,
        errorCount: missingCount,
        completedAt: new Date(),
      },
    });
    return;
  }

  // Call batch enrichment — one API call for all leads
  const batchInput = leadsToProcess.map((l) => ({
    id: l.id,
    ownerName: l.ownerName,
    propertyAddress: l.propertyAddress,
    city: l.city || undefined,
    state: l.state || undefined,
    zip: l.zip || undefined,
  }));

  let resultsMap: Map<string, any>;
  try {
    resultsMap = await provider.requestBatchEnrichment(batchInput);
  } catch (err: any) {
    await prisma.skiptraceJob.update({
      where: { id: skiptraceJobId },
      data: {
        status: "FAILED",
        errors: [{ leadId: "", ownerName: "", message: `Batch API error: ${err.message}` }],
      },
    });
    throw err;
  }

  // Process results and store in DB
  let foundCount = 0;
  let errorCount = missingCount;
  let totalCostCents = 0;
  const errors: Array<{ leadId: string; ownerName: string; message: string }> = [];

  for (const lead of leadsToProcess) {
    const result = resultsMap.get(lead.id);
    if (!result) {
      errorCount++;
      errors.push({ leadId: lead.id, ownerName: lead.ownerName, message: "No result from provider" });
      continue;
    }

    // Store ContactPoints
    const contactPointData = [
      ...result.phones.map((p: any) => ({
        leadId: lead.id,
        type: "PHONE" as const,
        value: p.value,
        source: provider.name,
        confidenceScore: p.confidence,
        consentStatus: "UNKNOWN" as const,
        dncFlag: false,
      })),
      ...result.emails.map((e: any) => ({
        leadId: lead.id,
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

    // Create EnrichmentRequest for audit trail
    await prisma.enrichmentRequest.create({
      data: {
        leadId: lead.id,
        provider: provider.name,
        permissiblePurpose,
        requestedById: userId,
        status: "COMPLETED",
        costCents: result.cost,
        rawResponseJson: result.rawResponse as any,
        completedAt: new Date(),
      },
    });

    if (result.phones.length > 0) foundCount++;
    totalCostCents += result.cost;
  }

  await prisma.skiptraceJob.update({
    where: { id: skiptraceJobId },
    data: {
      status: "COMPLETED",
      processedCount: leadIds.length,
      foundCount,
      alreadyHadCount,
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
      mode: "batch",
      provider: provider.name,
      totalLeads: leadIds.length,
      processedCount: leadsToProcess.length,
      foundCount,
      errorCount,
      costCents: totalCostCents,
    },
  });
}

/**
 * Sequential mode: call the provider once per lead (for mock/generic providers).
 * Shows live progress as each lead is processed.
 */
async function processSequentialSkiptrace(
  skiptraceJobId: string,
  leadIds: string[],
  provider: ReturnType<typeof getEnrichmentProvider>,
  permissiblePurpose: string,
  userId: string,
) {
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
        await prisma.skiptraceJob.update({
          where: { id: skiptraceJobId },
          data: { processedCount, alreadyHadCount: { increment: 1 } },
        });
        continue;
      }

      const result = await provider.requestEnrichment({
        ownerName: lead.ownerName,
        propertyAddress: lead.propertyAddress,
        city: lead.city || undefined,
        state: lead.state || undefined,
        zip: lead.zip || undefined,
      });

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

      await prisma.enrichmentRequest.create({
        data: {
          leadId,
          provider: provider.name,
          permissiblePurpose,
          requestedById: userId,
          status: "COMPLETED",
          costCents: result.cost,
          rawResponseJson: result.rawResponse as any,
          completedAt: new Date(),
        },
      });

      if (result.phones.length > 0) foundCount++;
      totalCostCents += result.cost;
      processedCount++;

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
      mode: "sequential",
      provider: provider.name,
      totalLeads: leadIds.length,
      processedCount,
      foundCount,
      errorCount,
      costCents: totalCostCents,
    },
  });
}

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
