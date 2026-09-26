import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createPrismaClient, loadRootEnv } from "@cercle/database";

import { createAuth } from "../../apps/api/dist/auth/auth.js";

const execFileAsync = promisify(execFile);

const password = "local-test-password-15";
const managerEmail = "manager.p01@example.test";
const ownerEmail = "owner.p02.e2e@example.test";
const ownerTotpEmail = "owner.p02.totp@example.test";
const ownerP03Email = "owner.p03.e2e@example.test";

export default async function globalSetup(): Promise<void> {
  loadRootEnv();
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
  if (!databaseUrl || !migrationUrl || !secret) {
    throw new Error("La base de test et le secret local sont requis pour l’E2E.");
  }
  await execFileAsync("pnpm", ["--filter", "@cercle/database", "exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_MIGRATION_URL: migrationUrl },
    shell: true,
  });
  const prisma = createPrismaClient(databaseUrl);
  const auth = createAuth(prisma, {
    allowSignUp: true,
    secret,
    baseURL: "http://127.0.0.1:8080",
    secureCookies: false,
  });
  const manager = await prisma.user.findUnique({ where: { email: managerEmail } });
  if (!manager) {
    const signedUp = await auth.api.signUpEmail({
      body: { email: managerEmail, password, name: "Gérant socle" },
    });
    const organization = await prisma.organization.create({ data: { name: "Cercle Complet" } });
    await prisma.appUser.create({
      data: {
        authUserId: signedUp.user.id,
        organizationId: organization.id,
        role: "MANAGER",
        displayName: "Gérant socle",
        mfaRequired: false,
      },
    });
  }
  const organization = await prisma.organization.create({ data: { name: `Cercle Complet E2E ${Date.now()}` } });
  await ensureOwner(prisma, auth, {
    email: ownerEmail,
    name: "Propriétaire P02",
    organizationId: organization.id,
  });
  await ensureOwner(prisma, auth, {
    email: ownerP03Email,
    name: "Propriétaire P03",
    organizationId: organization.id,
  });
  const managerAccount = await prisma.user.findUnique({ where: { email: managerEmail } });
  const managerProfile = managerAccount ? await prisma.appUser.findFirst({ where: { authUserId: managerAccount.id } }) : null;
  if (managerProfile) {
    await prisma.appUser.update({ where: { id: managerProfile.id }, data: { organizationId: organization.id } });
  }
  await ensureOwner(prisma, auth, {
    email: ownerTotpEmail,
    name: "Propriétaire TOTP",
    organizationId: organization.id,
  });
  await prisma.$disconnect();
}

async function ensureOwner(
  prisma: ReturnType<typeof createPrismaClient>,
  auth: ReturnType<typeof createAuth>,
  input: { email: string; name: string; organizationId: string },
): Promise<void> {
  const owner = await prisma.user.findUnique({ where: { email: input.email } });
  if (!owner) {
    const signedUp = await auth.api.signUpEmail({
      body: { email: input.email, password, name: input.name },
    });
    await prisma.appUser.create({
      data: {
        authUserId: signedUp.user.id,
        organizationId: input.organizationId,
        role: "OWNER",
        displayName: input.name,
        mfaRequired: true,
      },
    });
    return;
  }
  await prisma.appUser.updateMany({ where: { authUserId: owner.id }, data: { organizationId: input.organizationId } });
  await prisma.twoFactor.deleteMany({ where: { userId: owner.id } });
  await prisma.user.update({ where: { id: owner.id }, data: { twoFactorEnabled: false } });
  await prisma.session.deleteMany({ where: { userId: owner.id } });
}

export const e2eManager = { email: managerEmail, password };
export const e2eOwner = { email: ownerEmail, password };
export const e2eOwnerTotp = { email: ownerTotpEmail, password };
export const e2eOwnerP03 = { email: ownerP03Email, password };
