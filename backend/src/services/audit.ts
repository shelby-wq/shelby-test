import { prisma } from "../db";

export interface AuditEntry {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before as any,
      after: entry.after as any,
      metadata: entry.metadata as any,
    },
  });
}
