import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  assignManager,
  createPaymentSource,
  createPrice,
  createProduct,
  createShop,
  createUnit,
  createVariant,
  ownerOverview,
  postOwnerFund,
  saveOpeningDraft,
  transitionShop,
  validateOpening,
} from "@cercle/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) throw new Error("TEST_DATABASE_URL doit viser la base de test.");
const prisma = createPrismaClient(databaseUrl);

describe("P03 boutiques, catalogue et initialisation", () => {
  const organizationId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const context = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, key, requestId: key });
  let shopId = "";
  let variantId = "";
  let unitId = "";
  let locationId = "";
  let accountId = "";

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: organizationId, name: "P03 intégration" } });
    await prisma.user.createMany({
      data: [
        { id: `auth-${ownerId}`, name: "Owner", email: `${ownerId}@example.test`, updatedAt: new Date() },
        { id: `auth-${managerId}`, name: "Manager", email: `${managerId}@example.test`, updatedAt: new Date() },
      ],
    });
    await prisma.appUser.createMany({
      data: [
        { id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner", mfaRequired: true },
        { id: managerId, authUserId: `auth-${managerId}`, organizationId, role: "MANAGER", displayName: "Manager" },
      ],
    });
  });

  afterAll(async () => prisma.$disconnect());

  it("crée une boutique sans stock et protège l’idempotence", async () => {
    const key = crypto.randomUUID();
    const first = await createShop(prisma, context(key), { code: "P03A", name: "Boutique P03" });
    const replay = await createShop(prisma, context(key), { code: "P03A", name: "Boutique P03" });
    shopId = first.id;
    expect(replay.replayed).toBe(true);
    expect(await prisma.shop.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.stockEntry.count({ where: { event: { organizationId } } })).toBe(0);
    locationId = (await prisma.location.findFirstOrThrow({ where: { shopId } })).id;
    await prisma.managerAssignment.create({ data: { shopId, userId: managerId, reason: "Initialisation" } });
  });

  it("historise les variantes, unités et prix sans créer de stock", async () => {
    const product = await createProduct(prisma, context(), { name: "Farine", sku: "FAR-1", shopIds: [shopId] });
    const variant = await createVariant(prisma, context(), product.id, { name: "Sac 25 kg" });
    variantId = variant.id;
    const unit = await createUnit(prisma, context(), variant.id, { name: "Sac", symbol: "sac", factor: "1", precision: 0, isReference: true });
    unitId = unit.id;
    await createPrice(prisma, context(), { saleUnitId: unit.id, shopId, amountMinor: "12500" });
    await createPrice(prisma, context(), { saleUnitId: unit.id, shopId, amountMinor: "13000" });
    const prices = await prisma.price.findMany({ where: { saleUnitId: unitId }, orderBy: { validFrom: "asc" } });
    expect(prices).toHaveLength(2);
    expect(prices.filter((price) => price.validUntil === null)).toHaveLength(1);
    expect(await prisma.stockBalance.count({ where: { variantId } })).toBe(0);
  });

  it("valide atomiquement stock et fonds initiaux sans vente ni chiffre d’affaires", async () => {
    const source = await createPaymentSource(prisma, context(), { name: "Caisse initiale", type: "CASH", shopId });
    accountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: source.id } })).id;
    await saveOpeningDraft(prisma, context(), shopId, {
      step: 11,
      stockLines: [{ variantId, locationId, quantity: "3.500000", unitCostMinor: "1000" }],
      funds: [{ accountId, amountMinor: "25000" }],
      obligations: [{ label: "Dette fournisseur antérieure", amountMinor: "4000" }],
    });
    const result = await validateOpening(prisma, context(), shopId);
    expect(result.stockValueMinor).toBe("3500");
    expect(result.obligationTotalMinor).toBe("4000");
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { variantId, locationId } })).quantity.toString()).toBe("3.5");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(25000n);
    const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "opening_drafts" }, include: { lines: true } });
    expect(journal.lines.reduce((sum, line) => sum + line.amountMinor, 0n)).toBe(0n);
    expect(await prisma.outboxEvent.count({ where: { topic: "business.opening_validated" } })).toBe(1);
  });

  it("corrige les fonds par un événement compensateur lié", async () => {
    const original = await prisma.moneyEvent.findFirstOrThrow({ where: { organizationId, type: "OPENING_FUND" } });
    const correction = await postOwnerFund(prisma, context(), {
      accountId,
      amountMinor: "1000",
      reason: "Correction du comptage initial",
      type: "CORRECTION",
      direction: "DEBIT",
      correctionOfId: original.id,
    });
    expect(correction.balanceMinor).toBe("24000");
    const stored = await prisma.moneyEvent.findUniqueOrThrow({ where: { id: correction.id } });
    expect(stored.correctionOfId).toBe(original.id);
  });

  it("accepte un lot complémentaire avant activation et garde les écritures immuables", async () => {
    await expect(validateOpening(prisma, context(), shopId)).rejects.toThrow(/brouillon|initialisation/i);
    await saveOpeningDraft(prisma, context(), shopId, {
      step: 11,
      stockLines: [{ variantId, locationId, quantity: "1", unitCostMinor: "1000" }],
      funds: [],
    });
    await validateOpening(prisma, context(), shopId);
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { variantId, locationId } })).quantity.toString()).toBe("4.5");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(25000n);
    const event = await prisma.stockEvent.findFirstOrThrow({ where: { organizationId } });
    await expect(prisma.$executeRaw`UPDATE stock_events SET reason = 'altéré' WHERE id = ${event.id}::uuid`).rejects.toThrow();
  });

  it("active seulement après initialisation et produit le dashboard EMPTY réel", async () => {
    await transitionShop(prisma, context(), shopId, "ACTIVE", "Ouverture validée");
    const overview = await ownerOverview(prisma, organizationId);
    expect(overview.state).toBe("EMPTY");
    expect(overview.indicators.shops.byStatus.ACTIVE).toBe(1);
    expect(overview.indicators.stock.valueMinor).toBe("4500");
    expect(overview.indicators.funds.balanceMinor).toBe("24000");
    expect(JSON.stringify(overview)).not.toMatch(/revenue|chiffreAffaires|sales/i);
  });

  it("la base empêche deux gérants actifs sur la même boutique", async () => {
    const otherId = crypto.randomUUID();
    await prisma.user.create({ data: { id: `auth-${otherId}`, name: "Other", email: `${otherId}@example.test`, updatedAt: new Date() } });
    await prisma.appUser.create({ data: { id: otherId, authUserId: `auth-${otherId}`, organizationId, role: "MANAGER", displayName: "Other" } });
    await expect(prisma.managerAssignment.create({ data: { shopId, userId: otherId } })).rejects.toThrow();
  });

  it("refuse l’affectation horizontale d’un gérant d’une autre organisation", async () => {
    const foreignOrganizationId = crypto.randomUUID();
    const foreignId = crypto.randomUUID();
    await prisma.organization.create({ data: { id: foreignOrganizationId } });
    await prisma.user.create({ data: { id: `auth-${foreignId}`, name: "Foreign", email: `${foreignId}@example.test`, updatedAt: new Date() } });
    await prisma.appUser.create({ data: { id: foreignId, authUserId: `auth-${foreignId}`, organizationId: foreignOrganizationId, role: "MANAGER", displayName: "Foreign" } });
    await expect(assignManager(prisma, { organizationId, actorId: ownerId, shopId, userId: foreignId, requestId: crypto.randomUUID() })).rejects.toThrow(/disponible/);
  });
});
