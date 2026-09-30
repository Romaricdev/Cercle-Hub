import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  createPaymentSource,
  createPrice,
  createProduct,
  createRequest,
  createShop,
  createShipment,
  createSupplier,
  createUnit,
  createVariant,
  decideRequest,
  dispatchShipment,
  DomainError,
  getAttachmentForDownload,
  getPurchase,
  getRequest,
  openCashSession,
  postPurchase,
  postReceipt,
  regularizeSurplus,
  respondToRequest,
  saveOpeningDraft,
  submitRequest,
  transitionShop,
  validateOpening,
} from "@cercle/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) throw new Error("TEST_DATABASE_URL doit viser la base de test.");
const prisma = createPrismaClient(databaseUrl);
const prismaB = createPrismaClient(databaseUrl);

describe("P06 réapprovisionnement, achats et transferts", () => {
  const organizationId = crypto.randomUUID();
  const otherOrg = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const managerAId = crypto.randomUUID();
  const managerBId = crypto.randomUUID();
  const otherOwnerId = crypto.randomUUID();
  const owner = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, actorRole: "OWNER" as const, key, requestId: key });
  const managerA = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerAId, actorRole: "MANAGER" as const, key, requestId: key });
  const managerB = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerBId, actorRole: "MANAGER" as const, key, requestId: key });
  let shopA = "";
  let shopB = "";
  let locA = "";
  let locB = "";
  let variantId = "";
  let unitId = "";
  let cashA = "";
  let cashB = "";
  let ownerBank = "";
  let supplierId = "";

  beforeAll(async () => {
    await prisma.organization.createMany({ data: [{ id: organizationId, name: "P06 intégration" }, { id: otherOrg, name: "Autre org" }] });
    await prisma.user.createMany({ data: [
      { id: `auth-${ownerId}`, name: "Owner", email: `${ownerId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerAId}`, name: "ManagerA", email: `${managerAId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerBId}`, name: "ManagerB", email: `${managerBId}@example.test`, updatedAt: new Date() },
      { id: `auth-${otherOwnerId}`, name: "Other", email: `${otherOwnerId}@example.test`, updatedAt: new Date() },
    ] });
    await prisma.appUser.createMany({ data: [
      { id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner", mfaRequired: true },
      { id: managerAId, authUserId: `auth-${managerAId}`, organizationId, role: "MANAGER", displayName: "Gérant A" },
      { id: managerBId, authUserId: `auth-${managerBId}`, organizationId, role: "MANAGER", displayName: "Gérant B" },
      { id: otherOwnerId, authUserId: `auth-${otherOwnerId}`, organizationId: otherOrg, role: "OWNER", displayName: "Autre", mfaRequired: true },
    ] });
    shopA = (await createShop(prisma, owner(), { code: "P06A", name: "Boutique A" })).id;
    shopB = (await createShop(prisma, owner(), { code: "P06B", name: "Boutique B" })).id;
    locA = (await prisma.location.findFirstOrThrow({ where: { shopId: shopA } })).id;
    locB = (await prisma.location.findFirstOrThrow({ where: { shopId: shopB } })).id;
    await prisma.managerAssignment.createMany({ data: [{ shopId: shopA, userId: managerAId }, { shopId: shopB, userId: managerBId }] });
    await prisma.device.createMany({ data: [
      { organizationId, shopId: shopA, userId: managerAId, publicKey: `p06a-${crypto.randomUUID()}-public-key-material`, name: "Caisse A", status: "ACTIVE" },
      { organizationId, shopId: shopB, userId: managerBId, publicKey: `p06b-${crypto.randomUUID()}-public-key-material`, name: "Caisse B", status: "ACTIVE" },
    ] });
    const product = await createProduct(prisma, owner(), { name: "Riz P06", sku: "RIZ-P06", shopIds: [shopA, shopB] });
    variantId = (await createVariant(prisma, owner(), product.id, { name: "Sac" })).id;
    unitId = (await createUnit(prisma, owner(), variantId, { name: "Sac", symbol: "sac", factor: "1", precision: 0, isReference: true })).id;
    await createPrice(prisma, owner(), { saleUnitId: unitId, amountMinor: "15000" });
    cashA = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: (await createPaymentSource(prisma, owner(), { name: "Caisse A", type: "CASH", shopId: shopA })).id } })).id;
    cashB = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: (await createPaymentSource(prisma, owner(), { name: "Caisse B", type: "CASH", shopId: shopB })).id } })).id;
    ownerBank = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: (await createPaymentSource(prisma, owner(), { name: "Banque owner", type: "BANK" })).id } })).id;
    await prisma.moneyAccount.update({ where: { id: ownerBank }, data: { balanceMinor: 1_000_000n } });
    await saveOpeningDraft(prisma, owner(), shopA, { step: 11, stockLines: [], funds: [{ accountId: cashA, amountMinor: "80000" }], obligations: [] });
    await validateOpening(prisma, owner(), shopA);
    await transitionShop(prisma, owner(), shopA, "ACTIVE", "Prête");
    await saveOpeningDraft(prisma, owner(), shopB, { step: 11, stockLines: [], funds: [{ accountId: cashB, amountMinor: "80000" }], obligations: [] });
    await validateOpening(prisma, owner(), shopB);
    await transitionShop(prisma, owner(), shopB, "ACTIVE", "Prête");
    supplierId = (await createSupplier(prisma, owner(), { name: "Grains du Centre", phone: "690000001" })).id;
    await openCashSession(prisma, managerA());
    await openCashSession(prisma, managerB());
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await prismaB.$disconnect();
  });

  it("T28 refuse une demande sans toucher stock ni fonds", async () => {
    const created = await createRequest(prisma, managerA(), { comment: "Besoin de sacs pour le week-end", lines: [{ variantId, unitId, quantity: "10" }] });
    await submitRequest(prisma, managerA(), created.id);
    const cashBefore = (await prisma.moneyAccount.findFirstOrThrow({ where: { id: cashA } })).balanceMinor;
    const stockBefore = await prisma.stockBalance.count({ where: { variantId } });
    await decideRequest(prisma, owner(), created.id, { outcome: "REJECTED", reason: "Pas prioritaire cette semaine" });
    const detail = await getRequest(prisma, organizationId, managerAId, "MANAGER", created.id);
    expect(detail.status).toBe("REJECTED");
    expect((await prisma.moneyAccount.findFirstOrThrow({ where: { id: cashA } })).balanceMinor).toBe(cashBefore);
    expect(await prisma.stockBalance.count({ where: { variantId } })).toBe(stockBefore);
  });

  it("T72 conserve les versions après NEEDS_INFO puis approbation partielle", async () => {
    const created = await createRequest(prisma, managerA(), { comment: "Réassort farine et riz pour la boutique", lines: [{ variantId, unitId, quantity: "20", estimatedUnitMinor: "10000" }] });
    await submitRequest(prisma, managerA(), created.id);
    await decideRequest(prisma, owner(), created.id, { outcome: "NEEDS_INFO", reason: "Précisez le fournisseur pressenti et le délai" });
    const revised = await respondToRequest(prisma, managerA(), created.id, { text: "Fournisseur Grains du Centre, besoin sous 48 heures." });
    expect(revised.version).toBe(2);
    await decideRequest(prisma, owner(), revised.id, {
      outcome: "PARTIAL",
      reason: "Quantité réduite pour cette semaine",
      buyer: "MANAGER",
      budgetMinor: "100000",
      lines: [{ requestLineId: (await prisma.purchaseRequestLine.findFirstOrThrow({ where: { requestId: revised.id } })).id, maxQtyBase: "12", maxAmountMinor: "100000" }],
    });
    const versions = await prisma.purchaseRequest.findMany({ where: { familyId: created.id }, orderBy: { version: "asc" } });
    expect(versions.map((row) => row.status)).toEqual(["NEEDS_INFO", "PARTIAL"]);
    expect(versions[0]?.version).toBe(1);
  });

  it("T27 refuse un achat au-delà du budget avant posting", async () => {
    const created = await createRequest(prisma, managerA(), { comment: "Achat riz budget serré pour contrôle T27", lines: [{ variantId, unitId, quantity: "1", estimatedUnitMinor: "10000" }] });
    await submitRequest(prisma, managerA(), created.id);
    const submitted = await prisma.purchaseRequest.findFirstOrThrow({ where: { id: created.id }, include: { lines: true } });
    await decideRequest(prisma, owner(), created.id, {
      outcome: "APPROVED",
      buyer: "MANAGER",
      budgetMinor: "10000",
      lines: [{ requestLineId: submitted.lines[0]!.id, maxQtyBase: "1", maxAmountMinor: "10000" }],
    });
    const approval = await prisma.purchaseApproval.findFirstOrThrow({ where: { requestId: created.id } });
    await expect(postPurchase(prisma, managerA(), {
      supplierId,
      approvalId: approval.id,
      lines: [{ variantId, unitId, quantity: "1", unitPriceMinor: "11000" }],
    })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(await prisma.purchase.count({ where: { approvalId: approval.id } })).toBe(0);
  });

  it("circuit A : achat gérant, paiement partiel, réception et couches de coût", async () => {
    const created = await createRequest(prisma, managerA(), { comment: "Réassort autorisé pour la boutique A", lines: [{ variantId, unitId, quantity: "5", estimatedUnitMinor: "8000" }] });
    await submitRequest(prisma, managerA(), created.id);
    const line = await prisma.purchaseRequestLine.findFirstOrThrow({ where: { requestId: created.id } });
    await decideRequest(prisma, owner(), created.id, {
      outcome: "APPROVED",
      buyer: "MANAGER",
      budgetMinor: "50000",
      sourceAccountId: cashA,
      lines: [{ requestLineId: line.id, maxQtyBase: "5", maxAmountMinor: "50000" }],
    });
    const approval = await prisma.purchaseApproval.findFirstOrThrow({ where: { requestId: created.id } });
    const key = crypto.randomUUID();
    const first = await postPurchase(prisma, managerA(key), {
      supplierId,
      approvalId: approval.id,
      lines: [{ variantId, unitId, quantity: "5", unitPriceMinor: "8000" }],
      payments: [{ accountId: cashA, amountMinor: "20000" }],
    });
    const replay = await postPurchase(prisma, managerA(key), {
      supplierId,
      approvalId: approval.id,
      lines: [{ variantId, unitId, quantity: "5", unitPriceMinor: "8000" }],
      payments: [{ accountId: cashA, amountMinor: "20000" }],
    });
    expect(replay.replayed).toBe(true);
    expect(await prisma.purchase.count({ where: { approvalId: approval.id } })).toBe(1);
    const purchase = await prisma.purchase.findFirstOrThrow({ where: { id: first.id } });
    expect(purchase.paidMinor).toBe(20000n);
    expect(purchase.paymentStatus).toBe("PARTIAL");
    expect(await prisma.stockBalance.findFirst({ where: { variantId, locationId: locA } })).toBeNull();
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { purchaseId: first.id } });
    expect(shipment.status).toBe("DISPATCHED");
    const transit = await prisma.costLayer.aggregate({ where: { variantId, compartment: "TRANSIT" }, _sum: { remainingQuantity: true } });
    expect(Number(transit._sum.remainingQuantity)).toBe(5);
    const shipmentLine = await prisma.shipmentLine.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    await postReceipt(prisma, managerA(), {
      shipmentId: shipment.id,
      deliveryComplete: true,
      lines: [{ shipmentLineId: shipmentLine.id, acceptedQty: "5" }],
    });
    const available = await prisma.stockBalance.findFirstOrThrow({ where: { variantId, locationId: locA } });
    expect(Number(available.quantity)).toBe(5);
    const layers = await prisma.costLayer.findMany({ where: { variantId, locationId: locA, compartment: "AVAILABLE", remainingQuantity: { gt: 0 } } });
    expect(layers.reduce((sum, layer) => sum + layer.remainingValueMinor, 0n)).toBe(40000n);
    const managerView = await getPurchase(prisma, organizationId, managerAId, "MANAGER", first.id);
    expect(managerView.stockValueMinor).toBeUndefined();
    const ownerView = await getPurchase(prisma, organizationId, ownerId, "OWNER", first.id);
    expect(ownerView.stockValueMinor).toBe("40000");
  });

  it("T31/T68 achat propriétaire réparti, dette et valorisation sans double charge", async () => {
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "50", unitPriceMinor: "200" }],
      destinations: [
        { purchaseLineIndex: 0, locationId: locA, quantity: "30" },
        { purchaseLineIndex: 0, locationId: locB, quantity: "20" },
      ],
      fees: [
        { kind: "SUPPLIER", amountMinor: "500", description: "Manutention fournisseur" },
        { kind: "EXTERNAL", amountMinor: "300", accountId: ownerBank, description: "Transport" },
      ],
    });
    const purchase = await prisma.purchase.findFirstOrThrow({ where: { id: posted.id } });
    expect(purchase.goodsMinor).toBe(10000n);
    expect(purchase.supplierFeesMinor).toBe(500n);
    expect(purchase.stockValueMinor).toBe(10800n);
    expect(purchase.paidMinor).toBe(0n);
    const shipments = await prisma.shipment.findMany({ where: { purchaseId: purchase.id }, include: { lines: true } });
    expect(shipments).toHaveLength(2);
    expect(shipments.reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + Number(line.dispatchedQty), 0), 0)).toBe(50);
    const journal = await prisma.journalLine.findMany({ where: { entry: { referenceId: purchase.id, type: "PURCHASE_POST" } } });
    const transit = journal.find((line) => line.accountCode === "ASSET:TRANSIT")?.amountMinor;
    const liability = journal.find((line) => line.accountCode === "LIABILITY:SUPPLIER")?.amountMinor;
    expect(transit).toBe(10800n);
    expect(liability).toBe(-10500n);
    await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "1", unitPriceMinor: "1000" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locA, quantity: "1" }],
      payments: [{ accountId: ownerBank, amountMinor: "1000" }],
    });
  });

  it("T32/T33/T69 réception partielle, surplus isolé et justificatif non divulgué", async () => {
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "50", unitPriceMinor: "100" }],
      destinations: [
        { purchaseLineIndex: 0, locationId: locA, quantity: "50" },
      ],
    });
    const intent = await prisma.attachment.create({
      data: {
        organizationId,
        ownerDocumentType: "purchases",
        ownerDocumentId: posted.id,
        storageKey: `attachments/${organizationId}/${crypto.randomUUID()}`,
        originalName: "facture.pdf",
        mime: "application/pdf",
        size: 32,
        sha256: "a".repeat(64),
        uploadedById: ownerId,
        scanStatus: "CLEAN",
      },
    });
    await expect(getAttachmentForDownload(prisma, organizationId, managerBId, "MANAGER", intent.id)).rejects.toMatchObject({ code: "ATTACHMENT_NOT_FOUND" });
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { purchaseId: posted.id }, include: { lines: true } });
    await postReceipt(prisma, managerA(), {
      shipmentId: shipment.id,
      deliveryComplete: false,
      lines: [{ shipmentLineId: shipment.lines[0]!.id, acceptedQty: "45" }],
    });
    const remaining = await prisma.shipmentLine.findFirstOrThrow({ where: { id: shipment.lines[0]!.id } });
    expect(Number(remaining.receivedQty)).toBe(45);
    expect(Number(remaining.dispatchedQty) - Number(remaining.receivedQty)).toBe(5);
    await postReceipt(prisma, managerA(), {
      shipmentId: shipment.id,
      deliveryComplete: true,
      lines: [{ shipmentLineId: shipment.lines[0]!.id, acceptedQty: "7" }],
    });
    const after = await prisma.shipmentLine.findFirstOrThrow({ where: { id: shipment.lines[0]!.id } });
    expect(Number(after.receivedQty)).toBe(50);
    const surplus = await prisma.costLayer.findFirst({ where: { originId: (await prisma.goodsReceipt.findFirstOrThrow({ where: { shipmentId: shipment.id }, orderBy: { createdAt: "desc" } })).id, compartment: "QUARANTINE" } });
    expect(Number(surplus?.remainingQuantity ?? 0)).toBe(2);
    const cases = await prisma.discrepancyCase.findMany({ where: { sourceId: (await prisma.goodsReceipt.findFirstOrThrow({ where: { shipmentId: shipment.id }, orderBy: { createdAt: "desc" } })).id } });
    expect(cases.length).toBeGreaterThan(0);
  });

  it("T71 empêche deux réceptions concurrentes de dépasser l’expédié", async () => {
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "10", unitPriceMinor: "100" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locA, quantity: "10" }],
    });
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { purchaseId: posted.id }, include: { lines: true } });
    const results = await Promise.allSettled([
      postReceipt(prisma, managerA(), { shipmentId: shipment.id, lines: [{ shipmentLineId: shipment.lines[0]!.id, acceptedQty: "10" }] }),
      postReceipt(prismaB, managerA(), { shipmentId: shipment.id, lines: [{ shipmentLineId: shipment.lines[0]!.id, acceptedQty: "10" }] }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const line = await prisma.shipmentLine.findFirstOrThrow({ where: { id: shipment.lines[0]!.id } });
    expect(Number(line.receivedQty)).toBeLessThanOrEqual(10);
  });

  it("T73 régularise un surplus UNVALUED sans doubler la quantité", async () => {
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "3", unitPriceMinor: "100" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locB, quantity: "3" }],
    });
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { purchaseId: posted.id }, include: { lines: true } });
    const receipt = await postReceipt(prisma, managerB(), {
      shipmentId: shipment.id,
      deliveryComplete: true,
      lines: [{ shipmentLineId: shipment.lines[0]!.id, acceptedQty: "3", surplusQty: "2" }],
    });
    const before = await prisma.costLayer.aggregate({ where: { originId: receipt.id, compartment: "QUARANTINE" }, _sum: { remainingQuantity: true } });
    expect(Number(before._sum.remainingQuantity)).toBe(2);
    const sellableBefore = Number((await prisma.stockBalance.findFirst({ where: { variantId, locationId: locB } }))?.quantity ?? 0);
    await regularizeSurplus(prisma, owner(), { receiptId: receipt.id, variantId, unitCostMinor: "100", quantity: "2" });
    const sellableAfter = Number((await prisma.stockBalance.findFirstOrThrow({ where: { variantId, locationId: locB } })).quantity);
    expect(sellableAfter - sellableBefore).toBe(2);
    expect(await prisma.costLayer.count({ where: { originId: receipt.id, compartment: "QUARANTINE", remainingQuantity: { gt: 0 } } })).toBe(0);
  });

  it("isole les quantités endommagées et ouvre un manquant sans stock vendable duplicatif", async () => {
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "8", unitPriceMinor: "100" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locB, quantity: "8" }],
    });
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { purchaseId: posted.id }, include: { lines: true } });
    const sellableBefore = Number((await prisma.stockBalance.findFirst({ where: { variantId, locationId: locB } }))?.quantity ?? 0);
    const receipt = await postReceipt(prisma, managerB(), {
      shipmentId: shipment.id,
      deliveryComplete: true,
      lines: [{ shipmentLineId: shipment.lines[0]!.id, acceptedQty: "5", damagedQty: "2" }],
    });
    expect(receipt.missingCaseId).toBeTruthy();
    const sellableAfter = Number((await prisma.stockBalance.findFirstOrThrow({ where: { variantId, locationId: locB } })).quantity);
    expect(sellableAfter - sellableBefore).toBe(5);
    expect(Number((await prisma.costLayer.aggregate({ where: { originId: receipt.id, compartment: "DAMAGED" }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(2);
    const refreshed = await prisma.shipment.findFirstOrThrow({ where: { id: shipment.id } });
    expect(refreshed.status).toBe("DISPUTED");
  });

  it("refuse au gérant d’approuver sa demande et d’accéder à l’achat d’une autre boutique", async () => {
    const created = await createRequest(prisma, managerA(), { comment: "Demande que le gérant ne peut pas décider lui-même", lines: [{ variantId, unitId, quantity: "1" }] });
    await submitRequest(prisma, managerA(), created.id);
    await expect(decideRequest(prisma, managerA(), created.id, { outcome: "APPROVED", buyer: "MANAGER", budgetMinor: "1000", lines: [{ requestLineId: (await prisma.purchaseRequestLine.findFirstOrThrow({ where: { requestId: created.id } })).id, maxQtyBase: "1", maxAmountMinor: "1000" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "1", unitPriceMinor: "100" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locA, quantity: "1" }],
    });
    await expect(getPurchase(prisma, organizationId, managerBId, "MANAGER", posted.id)).rejects.toMatchObject({ code: "PURCHASE_NOT_FOUND" });
  });

  it("isole les organisations et refuse une source interdite au gérant", async () => {
    await expect(getRequest(prisma, otherOrg, otherOwnerId, "OWNER", crypto.randomUUID())).rejects.toBeInstanceOf(DomainError);
    const created = await createRequest(prisma, managerA(), { comment: "Tentative de paiement sur source organisation", lines: [{ variantId, unitId, quantity: "1", estimatedUnitMinor: "1000" }] });
    await submitRequest(prisma, managerA(), created.id);
    const line = await prisma.purchaseRequestLine.findFirstOrThrow({ where: { requestId: created.id } });
    await decideRequest(prisma, owner(), created.id, { outcome: "APPROVED", buyer: "MANAGER", budgetMinor: "5000", lines: [{ requestLineId: line.id, maxQtyBase: "1", maxAmountMinor: "5000" }] });
    const approval = await prisma.purchaseApproval.findFirstOrThrow({ where: { requestId: created.id } });
    await expect(postPurchase(prisma, managerA(), {
      supplierId,
      approvalId: approval.id,
      lines: [{ variantId, unitId, quantity: "1", unitPriceMinor: "1000" }],
      payments: [{ accountId: ownerBank, amountMinor: "1000" }],
    })).rejects.toMatchObject({ code: "FORBIDDEN_FUND_SOURCE" });
  });

  it("T60 un transfert interne ne crée ni CA ni charge supplémentaire", async () => {
    const posted = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "4", unitPriceMinor: "250" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locA, quantity: "4" }],
    });
    const inbound = await prisma.shipment.findFirstOrThrow({ where: { purchaseId: posted.id }, include: { lines: true } });
    await postReceipt(prisma, managerA(), {
      shipmentId: inbound.id,
      deliveryComplete: true,
      lines: [{ shipmentLineId: inbound.lines[0]!.id, acceptedQty: "4" }],
    });
    const valueBefore = await prisma.costLayer.aggregate({
      where: { variantId, remainingQuantity: { gt: 0 } },
      _sum: { remainingValueMinor: true },
    });
    const transfer = await createShipment(prisma, owner(), {
      sourceLocationId: locA,
      destinationLocationId: locB,
      lines: [{ variantId, quantity: "2" }],
    });
    await dispatchShipment(prisma, owner(), transfer.id);
    const journal = await prisma.journalLine.findMany({ where: { entry: { referenceId: transfer.id, type: "STOCK_TRANSFER" } } });
    const transit = journal.find((line) => line.accountCode === "ASSET:TRANSIT")?.amountMinor ?? 0n;
    const stock = journal.find((line) => line.accountCode === "ASSET:STOCK")?.amountMinor ?? 0n;
    expect(transit).toBe(-stock);
    expect(journal.some((line) => line.accountCode.includes("SALE") || line.accountCode.includes("INCOME"))).toBe(false);
    expect(journal.some((line) => line.accountCode === "LIABILITY:SUPPLIER")).toBe(false);
    const valueAfter = await prisma.costLayer.aggregate({
      where: { variantId, remainingQuantity: { gt: 0 } },
      _sum: { remainingValueMinor: true },
    });
    expect(valueAfter._sum.remainingValueMinor).toBe(valueBefore._sum.remainingValueMinor);
  });
});
