import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  createPaymentSource,
  createPrice,
  createProduct,
  createShop,
  createUnit,
  createVariant,
  getOwnerSale,
  getSale,
  listOwnerSales,
  openCashSession,
  ownerOverview,
  postSale,
  quoteSale,
  saveOpeningDraft,
  transitionShop,
  validateOpening,
} from "@cercle/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) throw new Error("TEST_DATABASE_URL doit viser la base de test.");
const prisma = createPrismaClient(databaseUrl);

describe("P04 consultation propriétaire", () => {
  const organizationId = crypto.randomUUID();
  const otherOrganizationId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const owner = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, key, requestId: key });
  const manager = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerId, key, requestId: key });
  let shopId = "";
  let otherShopId = "";
  let unitId = "";
  let cashSourceId = "";
  let accountId = "";
  let mobileAccountId = "";
  let cashSaleId = "";
  let existingOutboxIds: string[] = [];

  beforeAll(async () => {
    existingOutboxIds = (await prisma.outboxEvent.findMany({ select: { id: true } })).map(({ id }) => id);
    await prisma.organization.createMany({ data: [{ id: organizationId, name: "P04 owner" }, { id: otherOrganizationId, name: "Autre org" }] });
    await prisma.user.createMany({ data: [
      { id: `auth-${ownerId}`, name: "Owner", email: `${ownerId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerId}`, name: "Manager", email: `${managerId}@example.test`, updatedAt: new Date() },
    ] });
    await prisma.appUser.createMany({ data: [
      { id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner", mfaRequired: true },
      { id: managerId, authUserId: `auth-${managerId}`, organizationId, role: "MANAGER", displayName: "Manager" },
    ] });
    const shop = await createShop(prisma, owner(), { code: "OWN1", name: "Boutique owner A" });
    shopId = shop.id;
    const otherShop = await createShop(prisma, owner(), { code: "OWN2", name: "Boutique owner B" });
    otherShopId = otherShop.id;
    await prisma.managerAssignment.create({ data: { shopId, userId: managerId } });
    await prisma.device.create({ data: { organizationId, shopId, userId: managerId, publicKey: `own-${crypto.randomUUID()}-public-key-material`, name: "Caisse owner", status: "ACTIVE" } });
    const product = await createProduct(prisma, owner(), { name: "Pain", sku: "PAIN-OWN", shopIds: [shopId] });
    const variant = await createVariant(prisma, owner(), product.id, { name: "Pièce" });
    const unit = await createUnit(prisma, owner(), variant.id, { name: "Pièce", symbol: "pc", factor: "1", precision: 0, isReference: true });
    unitId = unit.id;
    await createPrice(prisma, owner(), { saleUnitId: unitId, shopId, amountMinor: "1000" });
    const cash = await createPaymentSource(prisma, owner(), { name: "Caisse owner", type: "CASH", shopId });
    cashSourceId = cash.id;
    accountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: cash.id } })).id;
    const mobile = await createPaymentSource(prisma, owner(), { name: "Mobile owner", type: "MOBILE_MONEY", shopId });
    mobileAccountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: mobile.id } })).id;
    const locationId = (await prisma.location.findFirstOrThrow({ where: { shopId, type: "SHOP" } })).id;
    await saveOpeningDraft(prisma, owner(), shopId, { step: 11, stockLines: [{ variantId: variant.id, locationId, quantity: "20", unitCostMinor: "400" }], funds: [{ accountId, amountMinor: "20000" }], obligations: [] });
    await validateOpening(prisma, owner(), shopId);
    await transitionShop(prisma, owner(), shopId, "ACTIVE", "Ouverte");
    await openCashSession(prisma, manager());
    const cashLines = [{ saleUnitId: unitId, quantity: "2" }];
    const cashQuote = await quoteSale(prisma, organizationId, managerId, cashLines);
    const cashSale = await postSale(prisma, manager(), { authorizationId: cashQuote.authorizationId, lines: cashLines, payments: [{ accountId, amountMinor: "2000", cashReceivedMinor: "5000", changeGivenMinor: "3000" }] });
    cashSaleId = cashSale.id;
    const mobileLines = [{ saleUnitId: unitId, quantity: "1" }];
    const mobileQuote = await quoteSale(prisma, organizationId, managerId, mobileLines);
    await postSale(prisma, manager(), { authorizationId: mobileQuote.authorizationId, lines: mobileLines, payments: [{ accountId: mobileAccountId, amountMinor: "1000" }] });
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: existingOutboxIds.length ? { id: { notIn: existingOutboxIds } } : {} });
    await prisma.$disconnect();
  });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  it("liste les ventes multi-boutiques et filtre par boutique, période et source", async () => {
    const all = await listOwnerSales(prisma, organizationId, { from: today, to: today });
    expect(all.sales).toHaveLength(2);
    expect(all.totals.count).toBe(2);
    expect(all.totals.revenueMinor).toBe("3000");
    expect(all.totals.collectedMinor).toBe("3000");
    const shopA = await listOwnerSales(prisma, organizationId, { shopId, from: today, to: today });
    expect(shopA.sales).toHaveLength(2);
    const shopB = await listOwnerSales(prisma, organizationId, { shopId: otherShopId, from: today, to: today });
    expect(shopB.sales).toHaveLength(0);
    expect(shopB.totals.revenueMinor).toBe("0");
    const yesterday = await listOwnerSales(prisma, organizationId, { from: "2020-01-01", to: "2020-01-01" });
    expect(yesterday.sales).toHaveLength(0);
    const cashOnly = await listOwnerSales(prisma, organizationId, { paymentSourceId: cashSourceId, from: today, to: today });
    expect(cashOnly.sales).toHaveLength(1);
    expect(cashOnly.sales[0]?.id).toBe(cashSaleId);
  });

  it("pagine de façon stable et refuse une boutique étrangère", async () => {
    const first = await listOwnerSales(prisma, organizationId, { from: today, to: today, limit: 1 });
    expect(first.sales).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await listOwnerSales(prisma, organizationId, { from: today, to: today, limit: 1, cursor: first.nextCursor ?? undefined });
    expect(second.sales).toHaveLength(1);
    expect(second.sales[0]?.id).not.toBe(first.sales[0]?.id);
    await expect(listOwnerSales(prisma, organizationId, { shopId: crypto.randomUUID() })).rejects.toThrow(/introuvable/i);
    await expect(getOwnerSale(prisma, otherOrganizationId, cashSaleId)).rejects.toThrow(/introuvable/i);
  });

  it("détaille une vente propriétaire avec coût, marge et monnaie rendue", async () => {
    const sale = await getOwnerSale(prisma, organizationId, cashSaleId);
    expect(sale.collectedMinor).toBe("2000");
    expect(sale.costMinor).toBe("800");
    expect(sale.estimatedGrossMarginMinor).toBe("1200");
    expect(sale.payments[0]?.cashReceivedMinor).toBe("5000");
    expect(sale.payments[0]?.changeGivenMinor).toBe("3000");
    expect(sale.timeline.some((event) => event.type === "SALE_POSTED")).toBe(true);
    const managerDto = await getSale(prisma, organizationId, shopId, cashSaleId);
    expect(JSON.stringify(managerDto)).not.toMatch(/costMinor|estimatedGrossMargin/);
  });

  it("refuse une recherche trop longue sans interpréter le texte comme du SQL", async () => {
    const harmless = await listOwnerSales(prisma, organizationId, { from: today, to: today, query: "' OR 1=1 --" });
    expect(harmless.sales).toHaveLength(0);
    expect(harmless.totals.revenueMinor).toBe("0");
    await expect(listOwnerSales(prisma, organizationId, { from: today, to: today, query: "x".repeat(81) })).rejects.toThrow(/trop longue/i);
    await expect(listOwnerSales(prisma, organizationId, { from: "26-09-2026" })).rejects.toThrow(/date/i);
  });

  it("alimente le dashboard ACTIVE avec des agrégats réconciliés", async () => {
    const overview = await ownerOverview(prisma, organizationId, shopId, { from: today, to: today });
    expect(overview.state).toBe("ACTIVE");
    expect(overview.indicators.sales.available).toBe(true);
    expect(overview.indicators.sales.count).toBe(2);
    expect(overview.indicators.sales.revenueMinor).toBe("3000");
    expect(overview.indicators.sales.collectedMinor).toBe("3000");
    expect(overview.collections.CASH).toBe("2000");
    expect(overview.collections.MOBILE_MONEY).toBe("1000");
    expect(overview.recentSales[0]?.id).toBeTruthy();
  });
});
