import type { PrismaClient } from "@cercle/database";

export async function buildProfile(prisma: PrismaClient, actor: { id: string; role: string; organizationId: string; authUserId: string; twoFactorEnabled: boolean; displayName: string; status: string }) {
  const [authUser, organization, assignment, device] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: actor.authUserId }, select: { email: true, name: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    prisma.managerAssignment.findFirst({
      where: { userId: actor.id, endedAt: null },
      include: { shop: true },
    }),
    prisma.device.findFirst({
      where: { userId: actor.id, status: { in: ["PENDING", "ACTIVE"] } },
      orderBy: { registeredAt: "desc" },
    }),
  ]);
  const initialized = Boolean(organization.initializedAt);
  let next = "HOME_OWNER";
  if (actor.role === "OWNER" && !actor.twoFactorEnabled) {
    next = "ENROLL_MFA";
  } else if (actor.role === "MANAGER") {
    next = device?.status === "ACTIVE" ? "HOME_MANAGER" : "REGISTER_DEVICE";
  }
  return {
    actor: {
      id: actor.id,
      displayName: actor.displayName || authUser.name,
      email: authUser.email,
      role: actor.role,
      status: actor.status,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      initialized,
    },
    shop: assignment
      ? { id: assignment.shop.id, name: assignment.shop.name, status: assignment.shop.status }
      : null,
    device: device ? { id: device.id, name: device.name, status: device.status } : null,
    mfa: { required: actor.role === "OWNER", enabled: actor.twoFactorEnabled },
    next,
  };
}
