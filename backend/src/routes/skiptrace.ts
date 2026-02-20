import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../middleware/auth";
import { skiptraceQueue } from "../jobs/queue";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authMiddleware);

// ─── POST /api/skiptrace/estimate ─────────────────────────
// Returns how many leads need skiptracing and estimated cost.

const estimateSchema = z.object({
  leadIds: z.array(z.string()).optional(),
  filters: z
    .object({
      status: z.string().optional(),
      city: z.string().optional(),
      tag: z.string().optional(),
    })
    .optional(),
});

router.post("/estimate", async (req: Request, res: Response) => {
  const parsed = estimateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const orgId = req.user!.organizationId;
  const { leadIds, filters } = parsed.data;

  // Build where clause
  const where: any = { organizationId: orgId };

  if (leadIds && leadIds.length > 0) {
    where.id = { in: leadIds };
  }

  if (filters?.status) where.status = filters.status;
  if (filters?.city) where.city = { contains: filters.city, mode: "insensitive" };
  if (filters?.tag) {
    where.tags = { some: { tag: { name: { equals: filters.tag, mode: "insensitive" } } } };
  }

  // Get all matching leads
  const allLeads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      contactPoints: {
        where: { type: "PHONE" },
        select: { id: true },
      },
    },
  });

  const totalLeads = allLeads.length;
  const leadsWithPhones = allLeads.filter((l) => l.contactPoints.length > 0).length;
  const leadsToSkiptrace = totalLeads - leadsWithPhones;

  // Cost per lookup (configurable — default ~5 cents for mock, real providers vary)
  const costPerLookupCents = 5;
  const estimatedCostCents = leadsToSkiptrace * costPerLookupCents;

  res.json({
    totalLeads,
    leadsWithPhones,
    leadsToSkiptrace,
    costPerLookupCents,
    estimatedCostCents,
  });
});

// ─── POST /api/skiptrace/start ────────────────────────────
// Kicks off a batch skiptrace job.

const startSchema = z.object({
  leadIds: z.array(z.string()).optional(),
  filters: z
    .object({
      status: z.string().optional(),
      city: z.string().optional(),
      tag: z.string().optional(),
    })
    .optional(),
  permissiblePurpose: z.string().min(1),
  confirmLawfulBasis: z.literal(true, {
    errorMap: () => ({ message: "You must confirm lawful basis for this skiptrace request" }),
  }),
});

router.post("/start", async (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const orgId = req.user!.organizationId;
  const { leadIds, filters, permissiblePurpose } = parsed.data;

  // Build where clause (same as estimate)
  const where: any = { organizationId: orgId };

  if (leadIds && leadIds.length > 0) {
    where.id = { in: leadIds };
  }

  if (filters?.status) where.status = filters.status;
  if (filters?.city) where.city = { contains: filters.city, mode: "insensitive" };
  if (filters?.tag) {
    where.tags = { some: { tag: { name: { equals: filters.tag, mode: "insensitive" } } } };
  }

  // Get leads that DON'T already have phone numbers
  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      contactPoints: {
        where: { type: "PHONE" },
        select: { id: true },
      },
    },
  });

  const leadsToProcess = leads.filter((l) => l.contactPoints.length === 0);
  const leadsAlreadyHavePhones = leads.length - leadsToProcess.length;

  if (leadsToProcess.length === 0) {
    return res.status(400).json({ error: "All selected leads already have phone numbers." });
  }

  const leadIdsToProcess = leadsToProcess.map((l) => l.id);

  // Create SkiptraceJob record
  const skiptraceJob = await prisma.skiptraceJob.create({
    data: {
      organizationId: orgId,
      userId: req.user!.userId,
      permissiblePurpose,
      leadIds: leadIdsToProcess,
      totalLeads: leadIdsToProcess.length,
      alreadyHadCount: leadsAlreadyHavePhones,
    },
  });

  // Queue the job
  await skiptraceQueue.add("process-skiptrace", {
    skiptraceJobId: skiptraceJob.id,
    organizationId: orgId,
    userId: req.user!.userId,
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "skiptrace.start",
    entity: "SkiptraceJob",
    entityId: skiptraceJob.id,
    after: {
      totalLeads: leadIdsToProcess.length,
      alreadyHadPhones: leadsAlreadyHavePhones,
      permissiblePurpose,
    },
  });

  res.status(201).json(skiptraceJob);
});

// ─── GET /api/skiptrace/:id ───────────────────────────────
// Check status of a skiptrace job.

router.get("/:id", async (req: Request, res: Response) => {
  const job = await prisma.skiptraceJob.findUnique({
    where: { id: req.params.id },
  });

  if (!job || job.organizationId !== req.user!.organizationId) {
    return res.status(404).json({ error: "Skiptrace job not found" });
  }

  res.json(job);
});

// ─── GET /api/skiptrace ──────────────────────────────────
// List recent skiptrace jobs.

router.get("/", async (req: Request, res: Response) => {
  const jobs = await prisma.skiptraceJob.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: { select: { name: true } },
    },
  });

  res.json(jobs);
});

export default router;
