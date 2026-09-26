import type { PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError, withDeadlockRetry } from "./errors.js";

export async function registerDevice(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    actorId: string;
    publicKey: string;
    name: string;
    userAgent?: string;
    requestId: string;
  },
) {
  const publicKey = input.publicKey.trim();
  const name = input.name.trim();
  if (publicKey.length < 32 || publicKey.length > 2048) {
    throw new DomainError("DEVICE_KEY_INVALID", "La clé publique d’appareil est invalide.", 400);
  }
  if (name.length < 2) {
    throw new DomainError("DEVICE_NAME_REQUIRED", "Le nom de l’appareil est obligatoire.", 400);
  }
  const assignment = await prisma.managerAssignment.findFirst({
    where: { userId: input.actorId, endedAt: null },
  });
  if (!assignment) {
    throw new DomainError("NO_SHOP_ASSIGNED", "Aucune boutique n’est affectée à ce compte.", 409);
  }
  const existing = await prisma.device.findUnique({ where: { publicKey } });
  if (existing) {
    throw new DomainError("DEVICE_EXISTS", "Cet appareil est déjà enregistré.", 409);
  }
  const device = await prisma.device.create({
    data: {
      organizationId: input.organizationId,
      shopId: assignment.shopId,
      userId: input.actorId,
      publicKey,
      name,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      status: "PENDING",
    },
  });
  await writeAudit(prisma, {
    actorId: input.actorId,
    action: "DEVICE_REGISTERED",
    entityType: "devices",
    entityId: device.id,
    requestId: input.requestId,
    afterJson: { status: "PENDING", shopId: assignment.shopId },
  });
  return toDeviceDto(device);
}

export async function approveDevice(prisma: PrismaClient, input: { organizationId: string; actorId: string; deviceId: string; requestId: string }) {
  await withDeadlockRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; organization_id: string; shop_id: string | null; status: string }>>`
        SELECT id, organization_id, shop_id, status FROM devices WHERE id = ${input.deviceId}::uuid FOR UPDATE
      `;
      const device = rows[0];
      if (!device || device.organization_id !== input.organizationId) {
        throw new DomainError("DEVICE_NOT_FOUND", "Appareil introuvable.", 404);
      }
      if (device.status !== "PENDING") {
        throw new DomainError("DEVICE_NOT_PENDING", "L’appareil n’attend pas d’approbation.", 409);
      }
      if (device.shop_id) {
        await tx.device.updateMany({
          where: { shopId: device.shop_id, status: "ACTIVE", id: { not: device.id } },
          data: { status: "REPLACED" },
        });
      }
      await tx.device.update({ where: { id: device.id }, data: { status: "ACTIVE", lastSeenAt: new Date() } });
      await writeAudit(tx, {
        actorId: input.actorId,
        action: "DEVICE_APPROVED",
        entityType: "devices",
        entityId: device.id,
        requestId: input.requestId,
        afterJson: { status: "ACTIVE" },
      });
    }),
  );
}

export async function revokeDevice(prisma: PrismaClient, input: { organizationId: string; actorId: string; deviceId: string; reason: string; requestId: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new DomainError("REASON_REQUIRED", "Le motif est obligatoire.", 400);
  }
  await prisma.$transaction(async (tx) => {
    const device = await tx.device.findFirst({ where: { id: input.deviceId, organizationId: input.organizationId } });
    if (!device) {
      throw new DomainError("DEVICE_NOT_FOUND", "Appareil introuvable.", 404);
    }
    await tx.device.update({ where: { id: device.id }, data: { status: "REVOKED" } });
    await tx.deviceCapability.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(tx, {
      actorId: input.actorId,
      action: "DEVICE_REVOKED",
      entityType: "devices",
      entityId: device.id,
      requestId: input.requestId,
      afterJson: { reason, status: "REVOKED" },
    });
  });
}

export async function listDevices(prisma: PrismaClient, input: { organizationId: string; actorId: string; role: string }) {
  const devices = await prisma.device.findMany({
    where: input.role === "OWNER" ? { organizationId: input.organizationId } : { organizationId: input.organizationId, userId: input.actorId },
    include: { shop: { select: { id: true, name: true } }, capabilities: { where: { revokedAt: null }, take: 1 } },
    orderBy: { registeredAt: "desc" },
  });
  return devices.map((device) => ({
    ...toDeviceDto(device),
    shopName: device.shop?.name ?? null,
    capabilityStatus: device.capabilities[0] ? "NONE_OFFLINE" : "NONE",
  }));
}

function toDeviceDto(device: { id: string; name: string; status: string; shopId: string | null; lastSeenAt: Date | null; registeredAt: Date; publicKey?: string }) {
  return {
    id: device.id,
    name: device.name,
    status: device.status,
    shopId: device.shopId,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    registeredAt: device.registeredAt.toISOString(),
  };
}
