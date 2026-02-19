import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../middleware/auth";
import { enrichmentQueue } from "../jobs/queue";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authMiddleware);

const PERMISSIBLE_PURPOSES = [
  "Written consent from the consumer",
  "Legitimate business transaction initiated by the consumer",
  "Court order or subpoena",
  "Insurance underwriting",
  "Account review or collections on existing account",
  "Other lawful purpose (specify in notes)",
];

// GET /api/enrichment/purposes — list valid permissible purposes
router.get("/purposes", (_req: Request, res: Response) => {
  res.json({ purposes: PERMISSIBLE_PURPOSES });
});

const enrichSchema = z.object({
  leadId: z.string(),
  permissiblePurpose: z.string().min(1),
  confirmLawfulBasis: z.literal(true, {
    errorMap: () => ({ message: "You must confirm lawful basis for this enrichment request" }),
  }),
});

// POST /api/enrichment/request — enqueue enrichment for a single lead
router.post("/request", async (req: Request, res: Response) => {
  const parsed = enrichSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { leadId, permissiblePurpose } = parsed.data;

  // Verify lead belongs to user's org
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: req.user!.organizationId },
  });

  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  // Check for pending/processing enrichment request
  const pendingRequest = await prisma.enrichmentRequest.findFirst({
    where: { leadId, status: { in: ["PENDING", "PROCESSING"] } },
  });

  if (pendingRequest) {
    return res.status(409).json({ error: "An enrichment request is already in progress for this lead" });
  }

  // Create enrichment request with permissible purpose attestation
  const enrichmentRequest = await prisma.enrichmentRequest.create({
    data: {
      leadId,
      provider: process.env.ENRICHMENT_PROVIDER_NAME || "mock",
      permissiblePurpose,
      requestedById: req.user!.userId,
    },
  });

  // Enqueue the job
  await enrichmentQueue.add("enrich-lead", {
    enrichmentRequestId: enrichmentRequest.id,
    leadId,
    userId: req.user!.userId,
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "enrichment.request",
    entity: "EnrichmentRequest",
    entityId: enrichmentRequest.id,
    after: {
      leadId,
      permissiblePurpose,
      provider: enrichmentRequest.provider,
    },
  });

  res.status(201).json(enrichmentRequest);
});

// GET /api/enrichment/:id — check enrichment status
router.get("/:id", async (req: Request, res: Response) => {
  const enrichmentRequest = await prisma.enrichmentRequest.findUnique({
    where: { id: req.params.id },
    include: { lead: { select: { organizationId: true } } },
  });

  if (!enrichmentRequest || enrichmentRequest.lead.organizationId !== req.user!.organizationId) {
    return res.status(404).json({ error: "Enrichment request not found" });
  }

  res.json(enrichmentRequest);
});

export default router;
