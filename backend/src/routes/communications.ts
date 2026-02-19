import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import { logAudit } from "../services/audit";
import { StubMessagingGateway } from "../services/messaging/stub-gateway";

const router = Router();
router.use(authMiddleware);

const gateway = new StubMessagingGateway();

const createCommSchema = z.object({
  leadId: z.string(),
  channel: z.enum(["CALL", "SMS", "EMAIL"]),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  body: z.string().optional(),
  summary: z.string().optional(),
  outcome: z.string().optional(),
});

// POST /api/communications — log a communication
router.post("/", async (req: Request, res: Response) => {
  const parsed = createCommSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { leadId, channel, direction, body, summary, outcome } = parsed.data;

  // Verify lead belongs to user's org
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: req.user!.organizationId },
    include: { contactPoints: true },
  });

  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  // Compliance checks for outbound SMS/calls
  if (direction === "OUTBOUND" && (channel === "SMS" || channel === "CALL")) {
    const relevantContacts = lead.contactPoints.filter(
      (cp) => cp.type === (channel === "SMS" ? "PHONE" : "PHONE")
    );

    // Check DNC flag
    const dncContact = relevantContacts.find((cp) => cp.dncFlag);
    if (dncContact) {
      return res.status(403).json({
        error: "Contact is on DNC list. Admin override required.",
        contactPointId: dncContact.id,
      });
    }

    // Check consent for SMS
    if (channel === "SMS") {
      const hasConsent = relevantContacts.some((cp) => cp.consentStatus === "GRANTED");
      if (!hasConsent) {
        // Allow but warn
        console.warn(`[Compliance] SMS sent to lead ${leadId} without explicit consent`);
      }
    }
  }

  const communication = await prisma.communication.create({
    data: {
      leadId,
      channel,
      direction,
      body,
      summary,
      outcome,
      userId: req.user!.userId,
    },
  });

  // Update lead's lastTouchedAt
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastTouchedAt: new Date() },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "communication.create",
    entity: "Communication",
    entityId: communication.id,
    after: { leadId, channel, direction },
  });

  res.status(201).json(communication);
});

// POST /api/communications/send-sms — send SMS via gateway stub
router.post("/send-sms", async (req: Request, res: Response) => {
  const { leadId, contactPointId, body: smsBody } = req.body;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: req.user!.organizationId },
  });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const contactPoint = await prisma.contactPoint.findFirst({
    where: { id: contactPointId, leadId, type: "PHONE" },
  });
  if (!contactPoint) return res.status(404).json({ error: "Contact point not found" });

  // DNC check
  if (contactPoint.dncFlag) {
    return res.status(403).json({ error: "Contact is on DNC list" });
  }

  // Consent check
  if (contactPoint.consentStatus !== "GRANTED") {
    return res.status(400).json({
      error: "SMS consent not granted for this contact",
      warning: true,
      consentStatus: contactPoint.consentStatus,
    });
  }

  // Get org A2P settings
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
  });

  const result = await gateway.sendSms({
    to: contactPoint.value,
    from: "configured-number", // TODO: configure per org
    body: smsBody,
    campaignId: org?.a2pCampaignId || undefined,
  });

  // Log as communication
  await prisma.communication.create({
    data: {
      leadId,
      channel: "SMS",
      direction: "OUTBOUND",
      body: smsBody,
      outcome: result.success ? "sent" : "failed",
      userId: req.user!.userId,
    },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "messaging.sms_attempt",
    entity: "Communication",
    metadata: {
      leadId,
      contactPointId,
      gateway: gateway.name,
      success: result.success,
      messageId: result.messageId,
    },
  });

  res.json(result);
});

// POST /api/communications/dnc-override — admin override of DNC
router.post("/dnc-override", requireAdmin, async (req: Request, res: Response) => {
  const { contactPointId, reason } = req.body;

  if (!contactPointId || !reason) {
    return res.status(400).json({ error: "contactPointId and reason are required" });
  }

  const contactPoint = await prisma.contactPoint.findUnique({
    where: { id: contactPointId },
    include: { lead: true },
  });

  if (!contactPoint || contactPoint.lead.organizationId !== req.user!.organizationId) {
    return res.status(404).json({ error: "Contact point not found" });
  }

  await prisma.contactPoint.update({
    where: { id: contactPointId },
    data: { dncFlag: false },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "compliance.dnc_override",
    entity: "ContactPoint",
    entityId: contactPointId,
    before: { dncFlag: true },
    after: { dncFlag: false },
    metadata: { reason, adminId: req.user!.userId },
  });

  res.json({ success: true, message: "DNC flag removed with admin override" });
});

export default router;
