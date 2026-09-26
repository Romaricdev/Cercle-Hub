import type { PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError, withDeadlockRetry } from "./errors.js";
import { hashSecret, randomSecret } from "./tokens.js";

export function normalizeInviteEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new DomainError("INVALID_EMAIL", "L’adresse e-mail n’est pas valide.", 400);
  }
  return normalized;
}

export interface InviteUserInput {
  organizationId: string;
  actorId: string;
  email: string;
  displayName: string;
  role: "MANAGER";
  authUserId: string;
  requestId: string;
}

export interface AssignManagerInput {
  organizationId: string;
  actorId: string;
  shopId: string;
  userId: string;
  reason?: string;
  requestId: string;
}

export async function inviteManager(prisma: PrismaClient, input: InviteUserInput): Promise<{ userId: string; invitationToken: string }> {
  const email = normalizeInviteEmail(input.email);
  const existingApp = await prisma.appUser.findUnique({ where: { authUserId: input.authUserId } });
  if (existingApp) {
    throw new DomainError("EMAIL_TAKEN", "Un compte utilise déjà cette adresse.", 409);
  }
  const token = randomSecret();
  const userId = crypto.randomUUID();
  await withDeadlockRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.appUser.create({
        data: {
          id: userId,
          authUserId: input.authUserId,
          organizationId: input.organizationId,
          role: input.role,
          displayName: input.displayName.trim(),
          status: "INVITED",
          mfaRequired: false,
        },
      });
      await tx.invitation.create({
        data: {
          organizationId: input.organizationId,
          userId,
          tokenHash: hashSecret(token),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
      });
      await writeAudit(tx, {
        actorId: input.actorId,
        action: "USER_INVITED",
        entityType: "app_users",
        entityId: userId,
        requestId: input.requestId,
        afterJson: { email, role: input.role, status: "INVITED" },
      });
    }),
  );
  return { userId, invitationToken: token };
}

export async function resendInvitation(prisma: PrismaClient, input: { organizationId: string; actorId: string; userId: string; requestId: string }) {
  const user = await prisma.appUser.findFirst({ where: { id: input.userId, organizationId: input.organizationId } });
  if (!user || user.status !== "INVITED") {
    throw new DomainError("INVITATION_NOT_PENDING", "Aucune invitation en attente pour ce compte.", 409);
  }
  const token = randomSecret();
  await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.invitation.create({
      data: {
        organizationId: input.organizationId,
        userId: user.id,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    await writeAudit(tx, {
      actorId: input.actorId,
      action: "INVITATION_RESENT",
      entityType: "app_users",
      entityId: user.id,
      requestId: input.requestId,
    });
  });
  return { invitationToken: token };
}

export async function acceptInvitation(prisma: PrismaClient, token: string): Promise<{ userId: string; authUserId: string }> {
  const tokenHash = hashSecret(token);
  const invitation = await prisma.invitation.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!invitation) {
    throw new DomainError("INVITATION_INVALID", "Cette invitation n’est plus valable.", 400);
  }
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.invitation.updateMany({
      where: { id: invitation.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new DomainError("INVITATION_INVALID", "Cette invitation n’est plus valable.", 400);
    }
    await tx.appUser.update({
      where: { id: invitation.userId },
      data: { status: "ACTIVE" },
    });
    await writeAudit(tx, {
      actorId: invitation.userId,
      action: "INVITATION_ACCEPTED",
      entityType: "app_users",
      entityId: invitation.userId,
      requestId: invitation.id,
    });
  });
  return { userId: invitation.userId, authUserId: invitation.user.authUserId };
}

export async function deactivateUser(prisma: PrismaClient, input: { organizationId: string; actorId: string; userId: string; reason: string; requestId: string }) {
  if (input.userId === input.actorId) {
    throw new DomainError("SELF_DEACTIVATE", "Le compte connecté ne peut pas se désactiver.", 400);
  }
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new DomainError("REASON_REQUIRED", "Le motif est obligatoire.", 400);
  }
  await withDeadlockRetry(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.appUser.findFirst({ where: { id: input.userId, organizationId: input.organizationId } });
      if (!user) {
        throw new DomainError("USER_NOT_FOUND", "Utilisateur introuvable.", 404);
      }
      if (user.role === "OWNER") {
        throw new DomainError("OWNER_PROTECTED", "Le propriétaire ne peut pas être désactivé ici.", 403);
      }
      await tx.appUser.update({
        where: { id: user.id },
        data: { status: "DISABLED", deactivatedAt: new Date() },
      });
      await tx.managerAssignment.updateMany({
        where: { userId: user.id, endedAt: null },
        data: { endedAt: new Date(), reason },
      });
      await tx.device.updateMany({
        where: { userId: user.id, status: { in: ["PENDING", "ACTIVE"] } },
        data: { status: "REVOKED" },
      });
      await tx.deviceCapability.updateMany({
        where: { device: { userId: user.id }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.authUserId } });
      await writeAudit(tx, {
        actorId: input.actorId,
        action: "USER_DEACTIVATED",
        entityType: "app_users",
        entityId: user.id,
        requestId: input.requestId,
        afterJson: { reason, status: "DISABLED" },
      });
    }),
  );
}

export async function assignManager(prisma: PrismaClient, input: AssignManagerInput) {
  const reason = input.reason?.trim();
  await withDeadlockRetry(() =>
    prisma.$transaction(async (tx) => {
      const shops = await tx.$queryRaw<Array<{ id: string; organization_id: string }>>`
        SELECT id, organization_id FROM shops WHERE id = ${input.shopId}::uuid FOR UPDATE
      `;
      const shop = shops[0];
      if (!shop || shop.organization_id !== input.organizationId) {
        throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
      }
      const users = await tx.$queryRaw<Array<{ id: string; status: string; role: string; organization_id: string }>>`
        SELECT id, status, role, organization_id FROM app_users WHERE id = ${input.userId}::uuid FOR UPDATE
      `;
      const user = users[0];
      if (!user || user.organization_id !== input.organizationId || user.role !== "MANAGER" || user.status === "DISABLED") {
        throw new DomainError("MANAGER_INVALID", "Le gérant n’est pas disponible.", 409);
      }
      await tx.managerAssignment.updateMany({
        where: { OR: [{ shopId: input.shopId }, { userId: input.userId }], endedAt: null },
        data: { endedAt: new Date(), reason: reason || "Remplacement" },
      });
      await tx.managerAssignment.create({
        data: {
          shopId: input.shopId,
          userId: input.userId,
          reason: reason ?? null,
        },
      });
      await writeAudit(tx, {
        actorId: input.actorId,
        action: "MANAGER_ASSIGNED",
        entityType: "manager_assignments",
        entityId: input.shopId,
        requestId: input.requestId,
        afterJson: { userId: input.userId, shopId: input.shopId, reason },
      });
    }),
  );
}

export async function listUsers(prisma: PrismaClient, organizationId: string) {
  const users = await prisma.appUser.findMany({
    where: { organizationId },
    include: {
      authUser: { select: { email: true } },
      assignments: { orderBy: { startedAt: "desc" }, include: { shop: { select: { id: true, name: true, code: true } } } },
      invitations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  return users.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.authUser.email,
    role: user.role,
    status: user.status,
    invitation: user.status === "INVITED" ? { pending: true, expiresAt: user.invitations[0]?.expiresAt.toISOString() ?? null } : { pending: false },
    assignments: user.assignments.map((assignment) => ({
      shopId: assignment.shopId,
      shopName: assignment.shop.name,
      startedAt: assignment.startedAt.toISOString(),
      endedAt: assignment.endedAt?.toISOString() ?? null,
      reason: assignment.reason,
    })),
  }));
}
