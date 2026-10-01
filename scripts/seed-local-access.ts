import { createPrismaClient, loadRootEnv } from "@cercle/database";

import { createAuth } from "../apps/api/src/auth/auth.ts";

const password = "local-dev-password-15";
const accounts = [
  { email: "owner.local@example.test", name: "Propriétaire local", role: "OWNER" as const, mfaRequired: true },
  { email: "manager.local@example.test", name: "Gérant local", role: "MANAGER" as const, mfaRequired: false },
  { email: "manager.akwa.local@example.test", name: "Gérante Akwa", role: "MANAGER" as const, mfaRequired: false },
];

function assertLocalDevelopmentDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Le seed local refuse un hôte qui n’est pas 127.0.0.1 ou localhost.");
  }
  if (name.endsWith("_test")) {
    throw new Error("Le seed local refuse la base de test. Utiliser DATABASE_URL (cercle_complet).");
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!databaseUrl || !secret) {
    throw new Error("DATABASE_URL et BETTER_AUTH_SECRET sont requis.");
  }
  assertLocalDevelopmentDatabase(databaseUrl);
  const prisma = createPrismaClient(databaseUrl);
  const auth = createAuth(prisma, {
    allowSignUp: true,
    secret,
    baseURL: process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:8080",
    secureCookies: false,
  });
  const organization =
    (await prisma.organization.findFirst()) ?? (await prisma.organization.create({ data: { name: "Cercle Complet" } }));
  for (const account of accounts) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) {
      console.log(`Déjà présent : ${account.email}`);
      continue;
    }
    const signedUp = await auth.api.signUpEmail({
      body: { email: account.email, password, name: account.name },
    });
    await prisma.appUser.create({
      data: {
        authUserId: signedUp.user.id,
        organizationId: organization.id,
        role: account.role,
        displayName: account.name,
        mfaRequired: account.mfaRequired,
      },
    });
    console.log(`Créé : ${account.email}`);
  }
  await prisma.$disconnect();
  console.log("");
  console.log("http://127.0.0.1:8080/login");
  console.log(`Propriétaire  ${accounts[0]?.email}  ${password}`);
  console.log(`Gérant        ${accounts[1]?.email}  ${password}`);
  console.log(`Gérante Akwa  ${accounts[2]?.email}  ${password}`);
  console.log("Le propriétaire doit activer le TOTP à la première connexion.");
}

await main();
