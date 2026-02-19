import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard/kpis
router.get("/kpis", async (req: Request, res: Response) => {
  const orgId = req.user!.organizationId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    statusCounts,
    totalLeads,
    contactedToday,
    totalCommunications,
    recentEnrichments,
    leadsByMonth,
  ] = await Promise.all([
    // Leads by status
    prisma.lead.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: true,
    }),

    // Total leads
    prisma.lead.count({ where: { organizationId: orgId } }),

    // Contacted today
    prisma.communication.count({
      where: {
        user: { organizationId: orgId },
        timestamp: { gte: today },
      },
    }),

    // Total communications
    prisma.communication.count({
      where: { user: { organizationId: orgId } },
    }),

    // Recent enrichment requests
    prisma.enrichmentRequest.count({
      where: {
        lead: { organizationId: orgId },
        requestedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),

    // Leads created per month (last 6 months)
    prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as month,
        COUNT(*)::int as count
      FROM "Lead"
      WHERE "organizationId" = ${orgId}
        AND "createdAt" >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month DESC
    `,
  ]);

  // Calculate conversion rate
  const statusMap = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count])
  );
  const contracted = statusMap["UNDER_CONTRACT"] || 0;
  const conversionRate = totalLeads > 0 ? ((contracted / totalLeads) * 100).toFixed(1) : "0.0";

  // Response rate
  const contacted = (statusMap["CONTACTED"] || 0) + (statusMap["NEGOTIATING"] || 0) + contracted;
  const responseRate = totalLeads > 0 ? ((contacted / totalLeads) * 100).toFixed(1) : "0.0";

  res.json({
    totalLeads,
    leadsByStatus: statusMap,
    contactedToday,
    totalCommunications,
    conversionRate: parseFloat(conversionRate),
    responseRate: parseFloat(responseRate),
    recentEnrichments,
    leadsByMonth,
  });
});

export default router;
