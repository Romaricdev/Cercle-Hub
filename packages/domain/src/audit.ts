import type { Prisma, PrismaClient } from "@cercle/database";

export async function writeAudit(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId: string;
    afterJson?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      id: crypto.randomUUID(),
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId,
      ...(input.afterJson === undefined ? {} : { afterJson: input.afterJson }),
    },
  });
}
