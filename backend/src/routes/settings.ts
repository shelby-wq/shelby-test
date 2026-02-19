import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import { logAudit } from "../services/audit";

const router = Router();
router.use(authMiddleware);

// GET /api/settings — get org settings
router.get("/", async (req: Request, res: Response) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    include: { settings: true },
  });

  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const settingsMap = Object.fromEntries(org.settings.map((s) => [s.key, s.value]));

  res.json({
    organization: {
      id: org.id,
      name: org.name,
      a2pBrand: org.a2pBrand,
      a2pCampaignId: org.a2pCampaignId,
    },
    settings: settingsMap,
  });
});

// PATCH /api/settings/organization — update org details
router.patch("/organization", requireAdmin, async (req: Request, res: Response) => {
  const { name, a2pBrand, a2pCampaignId } = req.body;

  const before = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
  });

  const updated = await prisma.organization.update({
    where: { id: req.user!.organizationId },
    data: {
      ...(name !== undefined && { name }),
      ...(a2pBrand !== undefined && { a2pBrand }),
      ...(a2pCampaignId !== undefined && { a2pCampaignId }),
    },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "settings.org_update",
    entity: "Organization",
    entityId: updated.id,
    before: { name: before?.name, a2pBrand: before?.a2pBrand, a2pCampaignId: before?.a2pCampaignId },
    after: { name: updated.name, a2pBrand: updated.a2pBrand, a2pCampaignId: updated.a2pCampaignId },
  });

  res.json(updated);
});

// PUT /api/settings/:key — upsert a setting
router.put("/:key", requireAdmin, async (req: Request, res: Response) => {
  const { value } = req.body;
  const { key } = req.params;

  if (typeof value !== "string") {
    return res.status(400).json({ error: "Value must be a string" });
  }

  const setting = await prisma.organizationSetting.upsert({
    where: {
      organizationId_key: {
        organizationId: req.user!.organizationId,
        key,
      },
    },
    create: {
      organizationId: req.user!.organizationId,
      key,
      value,
    },
    update: { value },
  });

  await logAudit({
    actorId: req.user!.userId,
    action: "settings.update",
    entity: "OrganizationSetting",
    entityId: setting.id,
    after: { key, value },
  });

  res.json(setting);
});

// GET /api/settings/audit-log — view audit log
router.get("/audit-log", requireAdmin, async (req: Request, res: Response) => {
  const { page = "1", limit = "50", action, entity } = req.query;

  const pageNum = Math.max(1, parseInt(String(page)));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(limit))));

  const where: any = {};
  if (action) where.action = { contains: String(action) };
  if (entity) where.entity = String(entity);

  // Filter to this org's users
  where.actor = { organizationId: req.user!.organizationId };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: "desc" },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    logs,
    pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

export default router;
