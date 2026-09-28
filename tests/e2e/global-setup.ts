import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createPrismaClient, loadRootEnv } from "@cercle/database";

import { createAuth } from "../../apps/api/dist/auth/auth.js";

const execFileAsync = promisify(execFile);

const password = "local-test-password-15";
const managerEmail = "manager.p01@example.test";
const ownerEmail = "owner.p02.e2e@example.test";
const ownerVisualEmail = "owner.p02.visual@example.test";
const ownerTotpEmail = "owner.p02.totp@example.test";
const ownerP03Email = "owner.p03.e2e@example.test";
const managerP04Email = "manager.p04.e2e@example.test";
const ownerP04Email = "owner.p04.e2e@example.test";
const managerP04OwnerEmail = "manager.p04.owner.e2e@example.test";
const managerP05Email = "manager.p05.e2e@example.test";
const ownerP05Email = "owner.p05.e2e@example.test";

export default async function globalSetup(): Promise<void> {
  loadRootEnv();
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
  if (!databaseUrl || !migrationUrl || !secret) {
    throw new Error("La base de test et le secret local sont requis pour l’E2E.");
  }
  await execFileAsync("corepack", ["pnpm", "--filter", "@cercle/database", "exec", "prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_MIGRATION_URL: migrationUrl, PNPM_IGNORE_ENGINE: "1" },
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
    email: ownerVisualEmail,
    name: "Propriétaire visuel P02",
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
    await prisma.managerAssignment.updateMany({
      where: { userId: managerProfile.id, endedAt: null },
      data: { endedAt: new Date() },
    });
  }
  const p04Auth = await prisma.user.findUnique({ where: { email: managerP04Email } }) ?? (await auth.api.signUpEmail({ body: { email: managerP04Email, password, name: "Gérant P04" } })).user;
  const p04Manager = await prisma.appUser.upsert({
    where: { authUserId: p04Auth.id },
    create: { authUserId: p04Auth.id, organizationId: organization.id, role: "MANAGER", displayName: "Gérant P04" },
    update: { organizationId: organization.id, status: "ACTIVE" },
  });
  await prisma.managerAssignment.updateMany({
    where: { userId: p04Manager.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  const shop = await prisma.shop.create({ data: { organizationId: organization.id, code: `P04${Date.now().toString().slice(-6)}`, name: "Boutique Vente E2E", status: "ACTIVE", activatedAt: new Date() } });
  await prisma.managerAssignment.create({ data: { shopId: shop.id, userId: p04Manager.id, reason: "Recette P04" } });
  await prisma.device.create({ data: { organizationId: organization.id, shopId: shop.id, userId: p04Manager.id, publicKey: `e2e-p04-${crypto.randomUUID()}-public-key-material`, name: "Tablette caisse E2E", status: "ACTIVE" } });
  const location = await prisma.location.create({ data: { organizationId: organization.id, shopId: shop.id, name: "Stock Boutique Vente E2E", type: "SHOP" } });
  const product = await prisma.product.create({ data: { organizationId: organization.id, name: "Biscuit E2E", sku: `BIS-${Date.now()}`, shops: { create: { shopId: shop.id } } } });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, name: "Paquet" } });
  const unit = await prisma.saleUnit.create({ data: { variantId: variant.id, name: "Paquet", symbol: "paq", factor: "1", precision: 0, isReference: true } });
  await prisma.price.create({ data: { saleUnitId: unit.id, shopId: shop.id, amountMinor: 1000n, validFrom: new Date() } });
  const source = await prisma.paymentSource.create({ data: { organizationId: organization.id, shopId: shop.id, name: "Caisse Vente E2E", type: "CASH" } });
  await prisma.moneyAccount.create({ data: { organizationId: organization.id, shopId: shop.id, paymentSourceId: source.id, name: source.name, currency: "XAF", balanceMinor: 50000n } });
  await prisma.stockBalance.create({ data: { shopId: shop.id, variantId: variant.id, locationId: location.id, quantity: "10" } });
  await prisma.costLayer.create({ data: { variantId: variant.id, locationId: location.id, originType: "e2e_fixture", originId: shop.id, initialQuantity: "10", remainingQuantity: "10", unitCostMinor: 600n, receivedAt: new Date() } });
  await ensureOwner(prisma, auth, {
    email: ownerTotpEmail,
    name: "Propriétaire TOTP",
    organizationId: organization.id,
  });
  await ensureOwner(prisma, auth, {
    email: ownerP04Email,
    name: "Propriétaire P04 ventes",
    organizationId: organization.id,
  });
  const ownerSalesAuth = await prisma.user.findUnique({ where: { email: managerP04OwnerEmail } }) ?? (await auth.api.signUpEmail({ body: { email: managerP04OwnerEmail, password, name: "Gérant Pilotage P04" } })).user;
  const ownerSalesManager = await prisma.appUser.upsert({
    where: { authUserId: ownerSalesAuth.id },
    create: { authUserId: ownerSalesAuth.id, organizationId: organization.id, role: "MANAGER", displayName: "Gérant Pilotage P04" },
    update: { organizationId: organization.id, status: "ACTIVE" },
  });
  await prisma.managerAssignment.updateMany({
    where: { userId: ownerSalesManager.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  const ownerShop = await prisma.shop.create({ data: { organizationId: organization.id, code: `P04O${Date.now().toString().slice(-5)}`, name: "Boutique Pilotage E2E", status: "ACTIVE", activatedAt: new Date() } });
  await prisma.shop.create({ data: { organizationId: organization.id, code: `P04X${Date.now().toString().slice(-5)}`, name: "Autre Boutique E2E", status: "ACTIVE", activatedAt: new Date() } });
  await prisma.managerAssignment.create({ data: { shopId: ownerShop.id, userId: ownerSalesManager.id, reason: "Recette propriétaire P04" } });
  await prisma.device.create({ data: { organizationId: organization.id, shopId: ownerShop.id, userId: ownerSalesManager.id, publicKey: `e2e-p04-owner-${crypto.randomUUID()}-public-key-material`, name: "Tablette pilotage E2E", status: "ACTIVE" } });
  const ownerLocation = await prisma.location.create({ data: { organizationId: organization.id, shopId: ownerShop.id, name: "Stock Pilotage E2E", type: "SHOP" } });
  const ownerProduct = await prisma.product.create({ data: { organizationId: organization.id, name: "Galette E2E", sku: `GAL-${Date.now()}`, shops: { create: { shopId: ownerShop.id } } } });
  const ownerVariant = await prisma.productVariant.create({ data: { productId: ownerProduct.id, name: "Pièce" } });
  const ownerUnit = await prisma.saleUnit.create({ data: { variantId: ownerVariant.id, name: "Pièce", symbol: "pc", factor: "1", precision: 0, isReference: true } });
  await prisma.price.create({ data: { saleUnitId: ownerUnit.id, shopId: ownerShop.id, amountMinor: 1500n, validFrom: new Date() } });
  const ownerSource = await prisma.paymentSource.create({ data: { organizationId: organization.id, shopId: ownerShop.id, name: "Caisse Pilotage E2E", type: "CASH" } });
  await prisma.moneyAccount.create({ data: { organizationId: organization.id, shopId: ownerShop.id, paymentSourceId: ownerSource.id, name: ownerSource.name, currency: "XAF", balanceMinor: 80000n } });
  await prisma.stockBalance.create({ data: { shopId: ownerShop.id, variantId: ownerVariant.id, locationId: ownerLocation.id, quantity: "10" } });
  await prisma.costLayer.create({ data: { variantId: ownerVariant.id, locationId: ownerLocation.id, originType: "e2e_fixture", originId: ownerShop.id, initialQuantity: "10", remainingQuantity: "10", unitCostMinor: 700n, receivedAt: new Date() } });
  const p05Auth = await prisma.user.findUnique({ where: { email: managerP05Email } }) ?? (await auth.api.signUpEmail({ body: { email: managerP05Email, password, name: "Gérant P05" } })).user;
  const p05Manager = await prisma.appUser.upsert({
    where: { authUserId: p05Auth.id },
    create: { authUserId: p05Auth.id, organizationId: organization.id, role: "MANAGER", displayName: "Gérant P05" },
    update: { organizationId: organization.id, status: "ACTIVE" },
  });
  await prisma.managerAssignment.updateMany({ where: { userId: p05Manager.id, endedAt: null }, data: { endedAt: new Date() } });
  const p05Shop = await prisma.shop.create({ data: { organizationId: organization.id, code: `P05${Date.now().toString().slice(-6)}`, name: "Boutique Caisse E2E", status: "ACTIVE", activatedAt: new Date() } });
  await prisma.managerAssignment.create({ data: { shopId: p05Shop.id, userId: p05Manager.id, reason: "Recette P05" } });
  await prisma.device.create({ data: { organizationId: organization.id, shopId: p05Shop.id, userId: p05Manager.id, publicKey: `e2e-p05-${crypto.randomUUID()}-public-key-material`, name: "Tablette caisse P05", status: "ACTIVE" } });
  await prisma.location.create({ data: { organizationId: organization.id, shopId: p05Shop.id, name: "Stock Caisse E2E", type: "SHOP" } });
  const p05Source = await prisma.paymentSource.create({ data: { organizationId: organization.id, shopId: p05Shop.id, name: "Caisse Espèces E2E", type: "CASH" } });
  await prisma.moneyAccount.create({ data: { organizationId: organization.id, shopId: p05Shop.id, paymentSourceId: p05Source.id, name: p05Source.name, currency: "XAF", balanceMinor: 50000n } });
  await ensureOwner(prisma, auth, { email: ownerP05Email, name: "Propriétaire P05 caisse", organizationId: organization.id });
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
export const e2eOwnerVisual = { email: ownerVisualEmail, password };
export const e2eOwnerTotp = { email: ownerTotpEmail, password };
export const e2eOwnerP03 = { email: ownerP03Email, password };
export const e2eManagerP04 = { email: managerP04Email, password };
export const e2eOwnerP04 = { email: ownerP04Email, password };
export const e2eManagerP04Owner = { email: managerP04OwnerEmail, password };
export const e2eManagerP05 = { email: managerP05Email, password };
export const e2eOwnerP05 = { email: ownerP05Email, password };
