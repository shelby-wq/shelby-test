import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authMiddleware);

const createContactPointSchema = z.object({
  leadId: z.string(),
  type: z.enum(["PHONE", "EMAIL"]),
  value: z.string().min(1),
  source: z.string().default("manual"),
  consentStatus: z.enum(["GRANTED", "REVOKED", "UNKNOWN"]).default("UNKNOWN"),
  dncFlag: z.boolean().default(false),
});

// POST /api/contact-points — add a contact point to a lead
router.post("/", async (req: Request, res: Response) => {
  const parsed = createContactPointSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, organizationId: req.user!.organizationId },
  });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const cp = await prisma.contactPoint.create({
    data: parsed.data,
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "contact_point.create",
    entity: "ContactPoint",
    entityId: cp.id,
    after: { leadId: parsed.data.leadId, type: parsed.data.type, source: parsed.data.source },
  });

  res.status(201).json(cp);
});

// PATCH /api/contact-points/:id — update consent/DNC
router.patch("/:id", async (req: Request, res: Response) => {
  const cp = await prisma.contactPoint.findUnique({
    where: { id: req.params.id },
    include: { lead: true },
  });

  if (!cp || cp.lead.organizationId !== req.user!.organizationId) {
    return res.status(404).json({ error: "Contact point not found" });
  }

  const { consentStatus, dncFlag } = req.body;
  const updateData: any = {};
  if (consentStatus !== undefined) updateData.consentStatus = consentStatus;
  if (dncFlag !== undefined) updateData.dncFlag = dncFlag;

  const updated = await prisma.contactPoint.update({
    where: { id: req.params.id },
    data: updateData,
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "contact_point.update",
    entity: "ContactPoint",
    entityId: cp.id,
    before: { consentStatus: cp.consentStatus, dncFlag: cp.dncFlag },
    after: updateData,
  });

  res.json(updated);
});

// DELETE /api/contact-points/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const cp = await prisma.contactPoint.findUnique({
    where: { id: req.params.id },
    include: { lead: true },
  });

  if (!cp || cp.lead.organizationId !== req.user!.organizationId) {
    return res.status(404).json({ error: "Contact point not found" });
  }

  await prisma.contactPoint.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
