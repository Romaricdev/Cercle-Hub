import { createPrismaClient, loadRootEnv } from "@cercle/database";
import { createPaymentSource, createPrice, createProduct, createShop, createUnit, createVariant, openCashSession, postSale, quoteSale, saveOpeningDraft, transitionShop, validateOpening } from "@cercle/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) throw new Error("TEST_DATABASE_URL doit viser la base de test.");
const prisma = createPrismaClient(databaseUrl);

describe("P04 ventes en ligne", () => {
  const organizationId = crypto.randomUUID(); const ownerId = crypto.randomUUID(); const managerId = crypto.randomUUID();
  const owner = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, key, requestId: key });
  const manager = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerId, key, requestId: key });
  let shopId = ""; let variantId = ""; let unitId = ""; let weightedUnitId = ""; let accountId = ""; let mobileAccountId = "";
  let existingOutboxIds: string[] = [];

  beforeAll(async () => {
    existingOutboxIds = (await prisma.outboxEvent.findMany({ select: { id: true } })).map(({ id }) => id);
    await prisma.organization.create({ data: { id: organizationId, name: "P04 intégration" } });
    await prisma.user.createMany({ data: [{ id: `auth-${ownerId}`, name: "Owner", email: `${ownerId}@example.test`, updatedAt: new Date() }, { id: `auth-${managerId}`, name: "Manager", email: `${managerId}@example.test`, updatedAt: new Date() }] });
    await prisma.appUser.createMany({ data: [{ id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner", mfaRequired: true }, { id: managerId, authUserId: `auth-${managerId}`, organizationId, role: "MANAGER", displayName: "Manager" }] });
    const shop = await createShop(prisma, owner(), { code: "P04A", name: "Boutique P04" }); shopId = shop.id;
    await prisma.managerAssignment.create({ data: { shopId, userId: managerId } });
    await prisma.device.create({ data: { organizationId, shopId, userId: managerId, publicKey: `p04-${crypto.randomUUID()}-public-key-material`, name: "Caisse P04", status: "ACTIVE" } });
    const product = await createProduct(prisma, owner(), { name: "Biscuit", sku: "BIS-P04", shopIds: [shopId] });
    const variant = await createVariant(prisma, owner(), product.id, { name: "Standard" }); variantId = variant.id;
    const unit = await createUnit(prisma, owner(), variant.id, { name: "Pièce", symbol: "pc", factor: "1", precision: 0, isReference: true }); unitId = unit.id;
    await createPrice(prisma, owner(), { saleUnitId: unitId, shopId, amountMinor: "1000" });
    const weightedProduct = await createProduct(prisma, owner(), { name: "Riz en vrac", sku: "RIZ-P04", shopIds: [shopId] });
    const weightedVariant = await createVariant(prisma, owner(), weightedProduct.id, { name: "Vrac" });
    const weightedUnit = await createUnit(prisma, owner(), weightedVariant.id, { name: "Kilogramme", symbol: "kg", factor: "1", precision: 3, isReference: true }); weightedUnitId = weightedUnit.id;
    await createPrice(prisma, owner(), { saleUnitId: weightedUnitId, shopId, amountMinor: "2000" });
    const source = await createPaymentSource(prisma, owner(), { name: "Caisse P04", type: "CASH", shopId });
    accountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: source.id } })).id;
    const mobile = await createPaymentSource(prisma, owner(), { name: "Mobile Money P04", type: "MOBILE_MONEY", shopId });
    mobileAccountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: mobile.id } })).id;
    const locationId = (await prisma.location.findFirstOrThrow({ where: { shopId, type: "SHOP" } })).id;
    await saveOpeningDraft(prisma, owner(), shopId, { step: 11, stockLines: [{ variantId: variant.id, locationId, quantity: "7", unitCostMinor: "600" }, { variantId: weightedVariant.id, locationId, quantity: "10", unitCostMinor: "1200" }], funds: [{ accountId, amountMinor: "50000" }], obligations: [] });
    await validateOpening(prisma, owner(), shopId); await transitionShop(prisma, owner(), shopId, "ACTIVE", "Prête à vendre"); await openCashSession(prisma, manager());
  });
  afterAll(async () => { await prisma.outboxEvent.deleteMany({ where: existingOutboxIds.length ? { id: { notIn: existingOutboxIds } } : {} }); await prisma.$disconnect(); });

  it("T03 poste atomiquement une vente cash, le stock, le coût et les fonds", async () => {
    const lines = [{ saleUnitId: unitId, quantity: "2", discountMinor: "0" }]; const quote = await quoteSale(prisma, organizationId, managerId, lines);
    const key = crypto.randomUUID(); const sale = await postSale(prisma, manager(key), { authorizationId: quote.authorizationId, lines, payments: [{ accountId, amountMinor: "2000", cashReceivedMinor: "5000" }] });
    expect(sale.netMinor).toBe("2000"); expect(sale.costMinor).toBe("1200"); expect(sale.payments[0]?.changeMinor).toBe("3000");
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { shopId, variantId } })).quantity.toString()).toBe("5");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(52000n);
    expect((await prisma.journalEntry.findFirstOrThrow({ where: { referenceId: sale.id }, include: { lines: true } })).lines.reduce((sum, line) => sum + line.amountMinor, 0n)).toBe(0n);
    const replay = await postSale(prisma, manager(key), { authorizationId: quote.authorizationId, lines, payments: [{ accountId, amountMinor: "2000", cashReceivedMinor: "5000" }] }); expect(replay.replayed).toBe(true);
  });

  it("T04 crédite la source Mobile Money sans toucher la caisse espèces", async () => {
    const lines = [{ saleUnitId: unitId, quantity: "2" }]; const quote = await quoteSale(prisma, organizationId, managerId, lines);
    await postSale(prisma, manager(), { authorizationId: quote.authorizationId, lines, payments: [{ accountId: mobileAccountId, amountMinor: "2000", externalReference: "MM-001" }] });
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: mobileAccountId } })).balanceMinor).toBe(2000n);
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(52000n);
  });

  it("T05 enregistre deux paiements pour une seule vente", async () => {
    const lines = [{ saleUnitId: unitId, quantity: "1" }]; const quote = await quoteSale(prisma, organizationId, managerId, lines);
    const sale = await postSale(prisma, manager(), { authorizationId: quote.authorizationId, lines, payments: [{ accountId, amountMinor: "500", cashReceivedMinor: "500" }, { accountId: mobileAccountId, amountMinor: "500", externalReference: "MM-002" }] });
    expect(sale.payments).toHaveLength(2); expect((await prisma.salePayment.count({ where: { saleId: sale.id } }))).toBe(2);
  });

  it("T09 vend une quantité décimale avec arrondis monétaires exacts", async () => {
    const lines = [{ saleUnitId: weightedUnitId, quantity: "0.125" }]; const quote = await quoteSale(prisma, organizationId, managerId, lines);
    expect(quote.netMinor).toBe("250");
    const sale = await postSale(prisma, manager(), { authorizationId: quote.authorizationId, lines, payments: [{ accountId, amountMinor: "250", cashReceivedMinor: "250" }] });
    expect(sale.costMinor).toBe("150");
  });

  it("T07 refuse la réutilisation d’une clé avec un autre panier", async () => {
    const lines = [{ saleUnitId: unitId, quantity: "1" }]; const quote = await quoteSale(prisma, organizationId, managerId, lines); const key = crypto.randomUUID();
    await postSale(prisma, manager(key), { authorizationId: quote.authorizationId, lines, payments: [{ accountId, amountMinor: "1000" }] });
    await expect(postSale(prisma, manager(key), { authorizationId: quote.authorizationId, lines: [{ saleUnitId: unitId, quantity: "2" }], payments: [{ accountId, amountMinor: "2000" }] })).rejects.toThrow(/différentes|idempotence/i);
  });

  it("T08 ne laisse jamais deux ventes consommer la dernière unité", async () => {
    const lines = [{ saleUnitId: unitId, quantity: "1" }]; const [a,b] = await Promise.all([quoteSale(prisma, organizationId, managerId, lines), quoteSale(prisma, organizationId, managerId, lines)]);
    const results = await Promise.allSettled([postSale(prisma, manager(), { authorizationId: a.authorizationId, lines, payments: [{ accountId, amountMinor: "1000" }] }), postSale(prisma, manager(), { authorizationId: b.authorizationId, lines, payments: [{ accountId, amountMinor: "1000" }] })]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1); expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { shopId, variantId } })).quantity.toString()).toBe("0");
  });

  it("T14 refuse une remise hors politique et protège les documents postés", async () => {
    await expect(quoteSale(prisma, organizationId, managerId, [{ saleUnitId: unitId, quantity: "1", discountMinor: "1" }])).rejects.toThrow(/remise/i);
    const sale = await prisma.sale.findFirstOrThrow({ where: { organizationId } });
    await expect(prisma.$executeRaw`UPDATE sales SET reference='ALTERE' WHERE id=${sale.id}::uuid`).rejects.toThrow();
  });
});
