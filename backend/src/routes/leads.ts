import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logAudit } from "../services/audit";
import { stringify } from "csv-stringify/sync";

const router = Router();
router.use(authMiddleware);

// GET /api/leads — list with filters
router.get("/", async (req: Request, res: Response) => {
  const { status, tag, city, search, page = "1", limit = "50", sort = "createdAt", order = "desc" } = req.query;

  const where: any = {
    organizationId: req.user!.organizationId,
  };

  if (status) where.status = status;
  if (city) where.city = { contains: String(city), mode: "insensitive" };
  if (tag) {
    where.tags = { some: { tag: { name: String(tag) } } };
  }
  if (search) {
    where.OR = [
      { ownerName: { contains: String(search), mode: "insensitive" } },
      { propertyAddress: { contains: String(search), mode: "insensitive" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(String(page)));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(limit))));

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        contactPoints: true,
        _count: { select: { communications: true } },
      },
      orderBy: { [String(sort)]: String(order) },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  res.json({
    leads,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// GET /api/leads/export — CSV export
router.get("/export", async (req: Request, res: Response) => {
  const { status, tag, city } = req.query;

  const where: any = {
    organizationId: req.user!.organizationId,
  };
  if (status) where.status = status;
  if (city) where.city = { contains: String(city), mode: "insensitive" };
  if (tag) where.tags = { some: { tag: { name: String(tag) } } };

  const leads = await prisma.lead.findMany({
    where,
    include: { contactPoints: true, tags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = leads.map((l) => ({
    id: l.id,
    owner_name: l.ownerName,
    property_address: l.propertyAddress,
    mailing_address: l.mailingAddress || "",
    city: l.city || "",
    state: l.state || "",
    zip: l.zip || "",
    parcel_id: l.parcelId || "",
    status: l.status,
    tags: l.tags.map((t) => t.tag.name).join("; "),
    phones: l.contactPoints
      .filter((c) => c.type === "PHONE")
      .map((c) => c.value)
      .join("; "),
    emails: l.contactPoints
      .filter((c) => c.type === "EMAIL")
      .map((c) => c.value)
      .join("; "),
  }));

  const csv = stringify(rows, { header: true });

  await logAudit({
    actorId: req.user!.userId,
    action: "leads.export",
    entity: "Lead",
    metadata: { filters: { status, tag, city }, count: leads.length },
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=leads-export.csv");
  res.send(csv);
});

// GET /api/leads/:id — single lead detail
router.get("/:id", async (req: Request, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      tags: { include: { tag: true } },
      contactPoints: { orderBy: { createdAt: "desc" } },
      communications: {
        orderBy: { timestamp: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      enrichmentRequests: {
        orderBy: { requestedAt: "desc" },
        include: { requestedBy: { select: { id: true, name: true } } },
      },
    },
  });

  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  res.json(lead);
});

const createLeadSchema = z.object({
  ownerName: z.string().min(1),
  propertyAddress: z.string().min(1),
  mailingAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  parcelId: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/leads — create a lead
router.post("/", async (req: Request, res: Response) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      organizationId: req.user!.organizationId,
    },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "lead.create",
    entity: "Lead",
    entityId: lead.id,
    after: parsed.data,
  });

  res.status(201).json(lead);
});

const updateLeadSchema = z.object({
  ownerName: z.string().optional(),
  propertyAddress: z.string().optional(),
  mailingAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  parcelId: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["NEW", "CONTACTED", "NEGOTIATING", "UNDER_CONTRACT", "DEAD"]).optional(),
});

// PATCH /api/leads/:id — update lead
router.patch("/:id", async (req: Request, res: Response) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const existing = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });

  if (!existing) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.status || parsed.data.notes) {
    updateData.lastTouchedAt = new Date();
  }

  const updated = await prisma.lead.update({
    where: { id: req.params.id },
    data: updateData,
  });

  if (parsed.data.status && parsed.data.status !== existing.status) {
    await logAudit({
      actorId: req.user!.userId,
      action: "lead.status_change",
      entity: "Lead",
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: parsed.data.status },
    });
  }

  res.json(updated);
});

// POST /api/leads/:id/tags — add tag
router.post("/:id/tags", async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Tag name required" });
  }

  const lead = await prisma.lead.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const tag = await prisma.tag.upsert({
    where: { name },
    create: { name },
    update: {},
  });

  await prisma.leadTag.upsert({
    where: { leadId_tagId: { leadId: lead.id, tagId: tag.id } },
    create: { leadId: lead.id, tagId: tag.id },
    update: {},
  });

  res.status(201).json(tag);
});

// DELETE /api/leads/:id/tags/:tagId — remove tag
router.delete("/:id/tags/:tagId", async (req: Request, res: Response) => {
  await prisma.leadTag.deleteMany({
    where: { leadId: req.params.id, tagId: req.params.tagId },
  });
  res.status(204).send();
});

export default router;
