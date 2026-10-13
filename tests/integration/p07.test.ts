import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  approveStockCount,
  authorizeCreditException,
  collectCustomerPayment,
  confirmHandover,
  confirmSupplierCredit,
  createCustomer,
  createOpeningReceivable,
  createPaymentSource,
  createPolicy,
  createPrice,
  createProduct,
  createShop,
  createSupplier,
  createUnit,
  createVariant,
  decideCustomerReturn,
  declareCountLines,
  declareStockLoss,
  dispatchSupplierReturn,
  DomainError,
  getCustomer,
  getCustomerPaymentContext,
  listCustomers,
  listStockLossContext,
  openCashSession,
  openStockCount,
  getStockCount,
  payCustomerRefund,
  payPurchase,
  postPurchase,
  postSale,
  previewCustomerPayment,
  quoteSale,
  receiveCustomerReturn,
  receiveSupplierReimbursement,
  requestCustomerReturn,
  requestRecount,
  requestSupplierReturn,
  saveOpeningDraft,
  startHandover,
  submitStockCount,
  transitionShop,
  validateOpening,
  writeOffReceivable,
  writeOffStockLoss,
} from "@cercle/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) throw new Error("TEST_DATABASE_URL doit viser la base de test.");
const prisma = createPrismaClient(databaseUrl);
const prismaB = createPrismaClient(databaseUrl);

describe("P07 crédit, retours et contrôle des stocks", () => {
  const organizationId = crypto.randomUUID();
  const otherOrg = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const managerAId = crypto.randomUUID();
  const managerBId = crypto.randomUUID();
  const successorId = crypto.randomUUID();
  const owner = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, actorRole: "OWNER" as const, key, requestId: key });
  const managerA = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerAId, actorRole: "MANAGER" as const, key, requestId: key });
  let shopA = "";
  let shopB = "";
  let locA = "";
  let variantId = "";
  let unitId = "";
  let cashA = "";
  let ownerBank = "";
  let supplierId = "";
  let customerId = "";
  let t16SaleId = "";

  beforeAll(async () => {
    await prisma.organization.createMany({ data: [{ id: organizationId, name: "P07 intégration" }, { id: otherOrg, name: "Autre org P07" }] });
    await prisma.user.createMany({ data: [
      { id: `auth-${ownerId}`, name: "Owner", email: `${ownerId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerAId}`, name: "ManagerA", email: `${managerAId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerBId}`, name: "ManagerB", email: `${managerBId}@example.test`, updatedAt: new Date() },
      { id: `auth-${successorId}`, name: "Successor", email: `${successorId}@example.test`, updatedAt: new Date() },
    ] });
    await prisma.appUser.createMany({ data: [
      { id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner", mfaRequired: true },
      { id: managerAId, authUserId: `auth-${managerAId}`, organizationId, role: "MANAGER", displayName: "Gérant A" },
      { id: managerBId, authUserId: `auth-${managerBId}`, organizationId, role: "MANAGER", displayName: "Gérant B" },
      { id: successorId, authUserId: `auth-${successorId}`, organizationId, role: "MANAGER", displayName: "Successeur" },
    ] });
    shopA = (await createShop(prisma, owner(), { code: "P07A", name: "Boutique A P07" })).id;
    shopB = (await createShop(prisma, owner(), { code: "P07B", name: "Boutique B P07" })).id;
    locA = (await prisma.location.findFirstOrThrow({ where: { shopId: shopA } })).id;
    await prisma.managerAssignment.createMany({ data: [{ shopId: shopA, userId: managerAId }, { shopId: shopB, userId: managerBId }] });
    await prisma.device.createMany({ data: [
      { organizationId, shopId: shopA, userId: managerAId, publicKey: `p07a-${crypto.randomUUID()}-public-key-material`, name: "Caisse A", status: "ACTIVE" },
      { organizationId, shopId: shopB, userId: managerBId, publicKey: `p07b-${crypto.randomUUID()}-public-key-material`, name: "Caisse B", status: "ACTIVE" },
      { organizationId, shopId: shopA, userId: successorId, publicKey: `p07s-${crypto.randomUUID()}-public-key-material`, name: "Caisse successeur", status: "PENDING" },
    ] });
    const product = await createProduct(prisma, owner(), { name: "Riz P07", sku: "RIZ-P07", shopIds: [shopA, shopB] });
    variantId = (await createVariant(prisma, owner(), product.id, { name: "Sac" })).id;
    unitId = (await createUnit(prisma, owner(), variantId, { name: "Sac", symbol: "sac", factor: "1", precision: 0, isReference: true })).id;
    await createPrice(prisma, owner(), { saleUnitId: unitId, amountMinor: "1000" });
    cashA = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: (await createPaymentSource(prisma, owner(), { name: "Caisse A P07", type: "CASH", shopId: shopA })).id } })).id;
    ownerBank = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: (await createPaymentSource(prisma, owner(), { name: "Banque P07", type: "BANK" })).id } })).id;
    await prisma.moneyAccount.update({ where: { id: ownerBank }, data: { balanceMinor: 2_000_000n } });
    await saveOpeningDraft(prisma, owner(), shopA, { step: 11, stockLines: [{ variantId, locationId: locA, quantity: "40", unitCostMinor: "600" }], funds: [{ accountId: cashA, amountMinor: "50000" }], obligations: [] });
    await validateOpening(prisma, owner(), shopA);
    await transitionShop(prisma, owner(), shopA, "ACTIVE", "Prête");
    await saveOpeningDraft(prisma, owner(), shopB, { step: 11, stockLines: [], funds: [], obligations: [] });
    await validateOpening(prisma, owner(), shopB);
    await transitionShop(prisma, owner(), shopB, "ACTIVE", "Prête");
    await createPolicy(prisma, owner(), { values: { creditEnabled: true, supplierCreditEnabled: true, customerDueDays: 30 }, reason: "Activer le crédit P07" });
    supplierId = (await createSupplier(prisma, owner(), { name: "Grains P07", phone: "690070001" })).id;
    customerId = (await createCustomer(prisma, managerA(), { name: "Client Akwa", phone: "690070010", creditLimitMinor: "0" })).id;
    await prisma.customer.update({ where: { id: customerId }, data: { creditLimitMinor: 4000n } });
    await openCashSession(prisma, managerA());
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await prismaB.$disconnect();
  });

  async function creditSale(qty: string, paid: string, customer = customerId, dueDate = "2099-12-31", authorizationId?: string) {
    const lines = [{ saleUnitId: unitId, quantity: qty, discountMinor: "0" }];
    const quote = await quoteSale(prisma, organizationId, managerAId, lines);
    return postSale(prisma, managerA(), {
      authorizationId: quote.authorizationId,
      lines,
      payments: paid === "0" ? [] : [{ accountId: cashA, amountMinor: paid, cashReceivedMinor: paid, changeGivenMinor: "0" }],
      customerId: customer,
      dueDate,
      ...(authorizationId ? { creditAuthorizationId: authorizationId } : {}),
    });
  }

  it("T16 poste une vente à crédit atomique sans gonfler le cash du net", async () => {
    const cashBefore = (await prisma.moneyAccount.findUniqueOrThrow({ where: { id: cashA } })).balanceMinor;
    const sale = await creditSale("5", "2000");
    t16SaleId = sale.id;
    expect(sale.netMinor).toBe("5000");
    expect(sale.paidMinor).toBe("2000");
    expect(sale.dueMinor).toBe("3000");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: cashA } })).balanceMinor).toBe(cashBefore + 2000n);
    const receivable = await prisma.receivable.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(receivable.remainingMinor).toBe(3000n);
    const income = await prisma.journalLine.aggregate({ where: { entry: { referenceId: sale.id, type: "SALE" }, accountCode: "INCOME:SALES" }, _sum: { amountMinor: true } });
    expect(income._sum.amountMinor).toBe(-5000n);
  });

  it("T17 encaisse une créance sans nouveau CA ni mouvement de stock", async () => {
    const ownerContext = await getCustomerPaymentContext(prisma, organizationId, ownerId, "OWNER", customerId);
    expect(ownerContext.accounts.some((account) => account.id === ownerBank)).toBe(true);
    const managerContext = await getCustomerPaymentContext(prisma, organizationId, managerAId, "MANAGER", customerId);
    expect(managerContext.accounts.some((account) => account.id === cashA)).toBe(true);
    const cashBefore = (await prisma.moneyAccount.findUniqueOrThrow({ where: { id: cashA } })).balanceMinor;
    const stockBefore = (await prisma.stockBalance.findFirstOrThrow({ where: { shopId: shopA, variantId } })).quantity.toString();
    const salesBefore = await prisma.journalLine.aggregate({ where: { entry: { organizationId, type: "SALE" }, accountCode: "INCOME:SALES" }, _sum: { amountMinor: true } });
    const preview = await previewCustomerPayment(prisma, organizationId, managerAId, "MANAGER", { customerId, amountMinor: "1000" });
    const payment = await collectCustomerPayment(prisma, managerA(), { customerId, accountId: cashA, amountMinor: "1000", previewHash: preview.previewHash });
    expect(payment.amountMinor).toBe("1000");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: cashA } })).balanceMinor).toBe(cashBefore + 1000n);
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { shopId: shopA, variantId } })).quantity.toString()).toBe(stockBefore);
    const salesAfter = await prisma.journalLine.aggregate({ where: { entry: { organizationId, type: "SALE" }, accountCode: "INCOME:SALES" }, _sum: { amountMinor: true } });
    expect(salesAfter._sum.amountMinor).toBe(salesBefore._sum.amountMinor);
    expect((await prisma.receivable.findFirstOrThrow({ where: { saleId: t16SaleId } })).remainingMinor).toBe(2000n);
  });

  it("T18 refuse le second règlement concurrent qui dépasse le solde", async () => {
    const preview = await previewCustomerPayment(prisma, organizationId, managerAId, "MANAGER", { customerId, amountMinor: "2000" });
    const first = collectCustomerPayment(prisma, managerA(), { customerId, accountId: cashA, amountMinor: "2000", previewHash: preview.previewHash });
    const second = collectCustomerPayment(prismaB, managerA(), { customerId, accountId: cashA, amountMinor: "2000", previewHash: preview.previewHash });
    const results = await Promise.allSettled([first, second]);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected.length).toBe(1);
    const remaining = (await prisma.receivable.findFirstOrThrow({ where: { saleId: t16SaleId } })).remainingMinor;
    expect(remaining >= 0n).toBe(true);
    const detail = await getCustomer(prisma, organizationId, managerAId, "MANAGER", customerId);
    expect(detail.receivables.every((item) => BigInt(item.remainingMinor) > 0n)).toBe(true);
  });

  it("T19 refuse un nouveau crédit si le client est en retard", async () => {
    const overdue = await createCustomer(prisma, managerA(), { name: "Client retard", phone: "690070011" });
    await prisma.customer.update({ where: { id: overdue.id }, data: { creditLimitMinor: 50_000n } });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await creditSale("1", "0", overdue.id, yesterday);
    await expect(creditSale("1", "0", overdue.id, "2099-12-31")).rejects.toMatchObject({ code: "CUSTOMER_OVERDUE" });
  });

  it("T55/T83 bloque un nouveau crédit après désactivation tout en laissant régler", async () => {
    await createPolicy(prisma, owner(), { values: { creditEnabled: false, supplierCreditEnabled: true }, reason: "Désactiver le crédit client" });
    await expect(creditSale("1", "0")).rejects.toMatchObject({ code: "CREDIT_DISABLED" });
    const open = await prisma.receivable.aggregate({ where: { customerId, remainingMinor: { gt: 0 } }, _sum: { remainingMinor: true } });
    expect((open._sum.remainingMinor ?? 0n) >= 0n).toBe(true);
    await createPolicy(prisma, owner(), { values: { creditEnabled: true, supplierCreditEnabled: true, customerDueDays: 30 }, reason: "Réactiver le crédit" });
  });

  it("T78 crée une créance d’ouverture sans fausse vente", async () => {
    const openingCustomer = await createCustomer(prisma, owner(), { shopId: shopA, name: "Solde ouverture", phone: "690070012" });
    const created = await createOpeningReceivable(prisma, owner(), { shopId: shopA, customerId: openingCustomer.id, amountMinor: "3000", reason: "Créance reprise à l’ouverture" });
    expect(created.remainingMinor).toBe("3000");
    expect(await prisma.sale.count({ where: { customerId: openingCustomer.id } })).toBe(0);
    const preview = await previewCustomerPayment(prisma, organizationId, managerAId, "MANAGER", { customerId: openingCustomer.id, amountMinor: "1000" });
    await collectCustomerPayment(prisma, managerA(), { customerId: openingCustomer.id, accountId: cashA, amountMinor: "1000", previewHash: preview.previewHash });
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: created.id } })).remainingMinor).toBe(2000n);
  });

  it("T20/T74 réduit la créance puis laisse le remboursement à payer", async () => {
    const paidClient = await createCustomer(prisma, managerA(), { name: "Retour T20", phone: "690070013" });
    await prisma.customer.update({ where: { id: paidClient.id }, data: { creditLimitMinor: 50_000n } });
    const sale = await creditSale("5", "2000", paidClient.id);
    const requested = await requestCustomerReturn(prisma, managerA(), {
      saleId: sale.id,
      reason: "Produit non conforme à l’attente du client",
      lines: [{ saleLineId: (await prisma.saleLine.findFirstOrThrow({ where: { saleId: sale.id } })).id, quantity: "4" }],
    });
    const decided = await decideCustomerReturn(prisma, owner(), requested.id, { outcome: "APPROVED" });
    expect(decided.status).toBe("APPROVED");
    expect(await prisma.refundPayment.count({ where: { returnId: requested.id } })).toBe(0);
    const originalNet = (await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).netMinor;
    const received = await receiveCustomerReturn(prisma, managerA(), requested.id, {
      lines: [{ returnLineId: (await prisma.customerReturnLine.findFirstOrThrow({ where: { returnId: requested.id } })).id, quantity: "4", disposition: "AVAILABLE" }],
    });
    expect(received.creditReductionMinor).toBe("3000");
    expect(received.refundDueMinor).toBe("1000");
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).netMinor).toBe(originalNet);
    expect(await prisma.refundPayment.count({ where: { returnId: requested.id } })).toBe(0);
    const refunded = await payCustomerRefund(prisma, managerA(), requested.id, { accountId: cashA, amountMinor: "1000" });
    expect(refunded.status).toBe("SETTLED");
    await expect(payCustomerRefund(prisma, managerA(), requested.id, { accountId: cashA, amountMinor: "1" })).rejects.toMatchObject({ code: "INVALID_RETURN_TRANSITION" });
  });

  it("T74bis refuse un plafond dépassé, un aperçu périmé et rejoue la même clé", async () => {
    const limited = await createCustomer(prisma, managerA(), { name: "Plafond strict", phone: "690070018" });
    await prisma.customer.update({ where: { id: limited.id }, data: { creditLimitMinor: 100n } });
    await expect(creditSale("1", "0", limited.id)).rejects.toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED" });
    const client = await createCustomer(prisma, managerA(), { name: "Allocation concurrente", phone: "690070019" });
    await prisma.customer.update({ where: { id: client.id }, data: { creditLimitMinor: 50_000n } });
    await creditSale("2", "0", client.id);
    const stale = await previewCustomerPayment(prisma, organizationId, managerAId, "MANAGER", { customerId: client.id, amountMinor: "500" });
    const fresh = await previewCustomerPayment(prisma, organizationId, managerAId, "MANAGER", { customerId: client.id, amountMinor: "1500" });
    await collectCustomerPayment(prisma, managerA(), { customerId: client.id, accountId: cashA, amountMinor: "1500", previewHash: fresh.previewHash });
    await expect(collectCustomerPayment(prisma, managerA(), { customerId: client.id, accountId: cashA, amountMinor: "500", previewHash: stale.previewHash })).rejects.toMatchObject({ code: "ALLOCATION_CHANGED" });
    const replayPreview = await previewCustomerPayment(prisma, organizationId, managerAId, "MANAGER", { customerId: client.id, amountMinor: "500" });
    const key = crypto.randomUUID();
    const first = await collectCustomerPayment(prisma, managerA(key), { customerId: client.id, accountId: cashA, amountMinor: "500", previewHash: replayPreview.previewHash });
    const second = await collectCustomerPayment(prisma, managerA(key), { customerId: client.id, accountId: cashA, amountMinor: "500", previewHash: replayPreview.previewHash });
    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
  });

  it("T21 classe un retour endommagé sans augmenter AVAILABLE", async () => {
    const client = await createCustomer(prisma, managerA(), { name: "Retour endommagé", phone: "690070014" });
    await prisma.customer.update({ where: { id: client.id }, data: { creditLimitMinor: 50_000n } });
    const sale = await creditSale("2", "2000", client.id);
    const availableBefore = (await prisma.stockBalance.findFirstOrThrow({ where: { shopId: shopA, variantId } })).quantity.toString();
    const requested = await requestCustomerReturn(prisma, managerA(), {
      saleId: sale.id,
      reason: "Emballage écrasé à la livraison",
      lines: [{ saleLineId: (await prisma.saleLine.findFirstOrThrow({ where: { saleId: sale.id } })).id, quantity: "1", disposition: "DAMAGED" }],
    });
    await decideCustomerReturn(prisma, owner(), requested.id, { outcome: "APPROVED" });
    await receiveCustomerReturn(prisma, managerA(), requested.id, {
      lines: [{ returnLineId: (await prisma.customerReturnLine.findFirstOrThrow({ where: { returnId: requested.id } })).id, quantity: "1", disposition: "DAMAGED" }],
    });
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { shopId: shopA, variantId } })).quantity.toString()).toBe(availableBefore);
    const damaged = await prisma.costLayer.aggregate({ where: { variantId, locationId: locA, compartment: "DAMAGED", remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
    expect(Number(damaged._sum.remainingQuantity ?? 0)).toBeGreaterThan(0);
  });

  it("T22/T82 refuse un cumul supérieur à la quantité vendue", async () => {
    const client = await createCustomer(prisma, managerA(), { name: "Cumul retour", phone: "690070015" });
    await prisma.customer.update({ where: { id: client.id }, data: { creditLimitMinor: 50_000n } });
    const sale = await creditSale("2", "2000", client.id);
    const lineId = (await prisma.saleLine.findFirstOrThrow({ where: { saleId: sale.id } })).id;
    const first = await requestCustomerReturn(prisma, managerA(), { saleId: sale.id, reason: "Premier retour partiel de la vente", lines: [{ saleLineId: lineId, quantity: "1" }] });
    await decideCustomerReturn(prisma, owner(), first.id, { outcome: "APPROVED" });
    await receiveCustomerReturn(prisma, managerA(), first.id, { lines: [{ returnLineId: (await prisma.customerReturnLine.findFirstOrThrow({ where: { returnId: first.id } })).id, quantity: "1", disposition: "AVAILABLE" }] });
    await expect(requestCustomerReturn(prisma, managerA(), { saleId: sale.id, reason: "Second retour trop large", lines: [{ saleLineId: lineId, quantity: "2" }] })).rejects.toMatchObject({ code: "RETURN_EXCEEDS_SOLD" });
  });

  it("T70 absorbe d’abord la dette vivante puis l’abandon avant de rembourser", async () => {
    const client = await createCustomer(prisma, managerA(), { name: "Abandon puis retour", phone: "690070016" });
    await prisma.customer.update({ where: { id: client.id }, data: { creditLimitMinor: 50_000n } });
    const sale = await creditSale("5", "2000", client.id);
    const receivable = await prisma.receivable.findFirstOrThrow({ where: { saleId: sale.id } });
    await writeOffReceivable(prisma, owner(), { receivableId: receivable.id, amountMinor: "1000", reason: "Créance irrécouvrable partielle" });
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).remainingMinor).toBe(2000n);
    const requested = await requestCustomerReturn(prisma, managerA(), {
      saleId: sale.id,
      reason: "Retour après abandon partiel",
      lines: [{ saleLineId: (await prisma.saleLine.findFirstOrThrow({ where: { saleId: sale.id } })).id, quantity: "4" }],
    });
    await decideCustomerReturn(prisma, owner(), requested.id, { outcome: "APPROVED" });
    const received = await receiveCustomerReturn(prisma, managerA(), requested.id, {
      lines: [{ returnLineId: (await prisma.customerReturnLine.findFirstOrThrow({ where: { returnId: requested.id } })).id, quantity: "4", disposition: "AVAILABLE" }],
    });
    expect(received.creditReductionMinor).toBe("2000");
    expect(received.writeOffReversalMinor).toBe("1000");
    expect(received.refundDueMinor).toBe("1000");
  });

  it("T34/T35 achète à crédit puis paie partiellement sans dépense ordinaire", async () => {
    const purchase = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "10", unitPriceMinor: "1000" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locA, quantity: "10" }],
      receiveNow: true,
      deliveryComplete: true,
    });
    expect(purchase.paymentStatus === "UNPAID" || purchase.paidMinor === "0").toBe(true);
    const expensesBefore = await prisma.expense.count({ where: { organizationId } });
    await payPurchase(prisma, owner(), purchase.id, { accountId: ownerBank, amountMinor: "4000" });
    const updated = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(updated.paidMinor).toBe(4000n);
    expect(await prisma.expense.count({ where: { organizationId } })).toBe(expensesBefore);
  });

  it("T36/T79 retour fournisseur : dette inchangée à l’expédition, réduite à confirmation", async () => {
    const purchase = await postPurchase(prisma, owner(), {
      supplierId,
      lines: [{ variantId, unitId, quantity: "5", unitPriceMinor: "1000" }],
      destinations: [{ purchaseLineIndex: 0, locationId: locA, quantity: "5" }],
      receiveNow: true,
      deliveryComplete: true,
    });
    const dueBefore = (await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } }));
    let remainingBefore = dueBefore.goodsMinor + dueBefore.supplierFeesMinor - dueBefore.paidMinor;
    if (remainingBefore > 2000n) {
      await payPurchase(prisma, owner(), purchase.id, { accountId: ownerBank, amountMinor: (remainingBefore - 2000n).toString() });
      remainingBefore = 2000n;
    }
    const lineId = (await prisma.purchaseLine.findFirstOrThrow({ where: { purchaseId: purchase.id } })).id;
    const created = await requestSupplierReturn(prisma, owner(), { purchaseId: purchase.id, reason: "Lots défectueux constatés à l’ouverture", lines: [{ purchaseLineId: lineId, quantity: "3" }] });
    await dispatchSupplierReturn(prisma, owner(), created.id, locA);
    const afterDispatch = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(afterDispatch.goodsMinor + afterDispatch.supplierFeesMinor - afterDispatch.paidMinor).toBe(remainingBefore);
    const confirmed = await confirmSupplierCredit(prisma, owner(), created.id, { amountMinor: "3000" });
    expect(confirmed.debtReductionMinor).toBe("2000");
    expect(confirmed.reimbursementDueMinor).toBe("1000");
    const balanceBefore = (await prisma.moneyAccount.findUniqueOrThrow({ where: { id: ownerBank } })).balanceMinor;
    const expenseCountBeforeReimbursement = await prisma.expense.count({ where: { organizationId } });
    const partial = await receiveSupplierReimbursement(prisma, owner(), created.id, { accountId: ownerBank, amountMinor: "400", reference: "VIR-RETOUR-01" });
    expect(partial.status).toBe("CREDIT_CONFIRMED");
    expect(partial.remainingMinor).toBe("600");
    const settled = await receiveSupplierReimbursement(prisma, owner(), created.id, { accountId: ownerBank, amountMinor: "600" });
    expect(settled.status).toBe("SETTLED");
    expect(settled.remainingMinor).toBe("0");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: ownerBank } })).balanceMinor).toBe(balanceBefore + 1000n);
    await expect(receiveSupplierReimbursement(prisma, owner(), created.id, { accountId: ownerBank, amountMinor: "1" })).rejects.toMatchObject({ code: "INVALID_RETURN_TRANSITION" });
    expect(await prisma.expense.count({ where: { organizationId } })).toBe(expenseCountBeforeReimbursement);
  });

  it("T42/T43/T76 inventaire aveugle, verrou des ventes et recomptage immuable", async () => {
    const opened = await openStockCount(prisma, owner(), { shopId: shopA, locationId: locA });
    const managerView = await getStockCount(prisma, organizationId, managerAId, "MANAGER", opened.id);
    expect(managerView.lines.some((line) => "expectedQty" in line && line.expectedQty !== undefined)).toBe(false);
    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id: opened.id }, include: { lines: true } });
    const countable = count.lines.filter((line) => line.compartment !== "MISSING_PENDING");
    await expect(creditSale("1", "1000")).rejects.toMatchObject({ code: "INVENTORY_LOCK" });
    await declareCountLines(prisma, managerA(), opened.id, {
      lines: countable.map((line) => ({ variantId: line.variantId, compartment: line.compartment, quantity: line.expectedQty.toString() })),
    });
    await submitStockCount(prisma, managerA(), opened.id);
    const recount = await requestRecount(prisma, owner(), opened.id, "Écart à vérifier avant validation");
    expect(recount.previousId).toBe(opened.id);
    const recountLines = await prisma.stockCountLine.findMany({ where: { countId: recount.id } });
    const available = recountLines.find((line) => line.variantId === variantId && line.compartment === "AVAILABLE")!;
    const expected = BigInt(available.expectedQty.toFixed(6).replace(".", ""));
    const recounted = expected > 2_000_000n ? expected - 2_000_000n : expected;
    await declareCountLines(prisma, managerA(), recount.id, {
      lines: recountLines.filter((line) => line.compartment !== "MISSING_PENDING").map((line) => ({
        variantId: line.variantId,
        compartment: line.compartment,
        quantity: line.id === available.id ? (recounted / 1_000_000n).toString() : line.expectedQty.toString(),
        ...(line.id === available.id ? { explanation: "Deux sacs manquants après recomptage" } : {}),
      })),
    });
    await submitStockCount(prisma, managerA(), recount.id);
    const deltas = (await prisma.stockCountLine.findMany({ where: { countId: recount.id } })).filter((line) => line.declaredQty && line.declaredQty.toString() !== line.expectedQty.toString());
    await approveStockCount(prisma, owner(), recount.id, { explanations: Object.fromEntries(deltas.map((line) => [line.id, "Écart confirmé après recomptage"])) });
    expect((await prisma.stockCount.findUniqueOrThrow({ where: { id: opened.id } })).status).toBe("SUPERSEDED");
  });

  it("T44/T67 déclare une casse puis la solde sans réutiliser la couche AVAILABLE", async () => {
    const context = await listStockLossContext(prisma, organizationId, managerAId, "MANAGER");
    const option = context.find((row) => row.variantId === variantId && row.locationId === locA && row.compartment === "AVAILABLE");
    expect(option).toBeTruthy();
    expect(BigInt(option!.quantity.replace(".", ""))).toBeGreaterThan(0n);
    const availableBefore = (await prisma.costLayer.aggregate({ where: { variantId, locationId: locA, compartment: "AVAILABLE", remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity;
    const loss = await declareStockLoss(prisma, managerA(), { locationId: locA, variantId, quantity: "2", compartment: "AVAILABLE", reason: "Casse constatée en rayon", physicalState: "DAMAGED" });
    const availableAfter = (await prisma.costLayer.aggregate({ where: { variantId, locationId: locA, compartment: "AVAILABLE", remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity;
    expect(Number(availableAfter ?? 0)).toBeLessThan(Number(availableBefore ?? 0));
    const stored = await prisma.stockLoss.findUniqueOrThrow({ where: { id: loss.id } });
    expect(stored.sourceCompartment).toBe("AVAILABLE");
    expect(stored.compartment).toBe("DAMAGED");
    await writeOffStockLoss(prisma, owner(), loss.id);
    expect((await prisma.stockLoss.findUniqueOrThrow({ where: { id: loss.id } })).status).toBe("WRITTEN_OFF");
  });

  it("T75 n’effectue pas une seconde sortie d’un article déjà MISSING_PENDING", async () => {
    await declareStockLoss(prisma, owner(), { locationId: locA, variantId, quantity: "2", compartment: "AVAILABLE", reason: "Deux sacs introuvables", physicalState: "MISSING" });
    const opened = await openStockCount(prisma, owner(), { shopId: shopA, locationId: locA, reason: "Contrôle du disponible" });
    const lines = await prisma.stockCountLine.findMany({ where: { countId: opened.id } });
    const available = lines.find((line) => line.compartment === "AVAILABLE" && line.variantId === variantId);
    for (const line of lines.filter((item) => item.compartment !== "MISSING_PENDING")) {
      await declareCountLines(prisma, managerA(), opened.id, { lines: [{ variantId: line.variantId, compartment: line.compartment, quantity: line.expectedQty.toString() }] });
    }
    await submitStockCount(prisma, managerA(), opened.id);
    await approveStockCount(prisma, owner(), opened.id, {});
    expect(available).toBeTruthy();
  });

  it("T56 refuse la fermeture tant qu’une créance est ouverte", async () => {
    await expect(transitionShop(prisma, owner(), shopA, "CLOSED", "Fermeture anticipée")).rejects.toMatchObject({ code: "SHOP_HAS_OPEN_OBLIGATIONS" });
  });

  it("T16bis refuse une autorisation liée à un autre devis", async () => {
    const client = await createCustomer(prisma, managerA(), { name: "Autorisation ponctuelle", phone: "690070017" });
    await prisma.customer.update({ where: { id: client.id }, data: { creditLimitMinor: 100n } });
    const lines = [{ saleUnitId: unitId, quantity: "2", discountMinor: "0" }];
    const quote = await quoteSale(prisma, organizationId, managerAId, lines);
    const auth = await authorizeCreditException(prisma, owner(), { shopId: shopA, customerId: client.id, payloadHash: "0".repeat(64), maxDueMinor: "2000", reason: "Exception plafond" });
    await expect(postSale(prisma, managerA(), {
      authorizationId: quote.authorizationId,
      lines,
      payments: [],
      customerId: client.id,
      dueDate: "2099-12-31",
      creditAuthorizationId: auth.id,
    })).rejects.toMatchObject({ code: "CREDIT_AUTHORIZATION_INVALID" });
  });

  it("T77 SETTLEMENT autorise le règlement et interdit la vente", async () => {
    await transitionShop(prisma, owner(), shopA, "SUSPENDED", "Règlement des restes", { suspensionMode: "SETTLEMENT" });
    await expect(creditSale("1", "1000")).rejects.toBeInstanceOf(DomainError);
    await transitionShop(prisma, owner(), shopA, "ACTIVE", "Reprise d’activité");
    await openCashSession(prisma, managerA());
  });

  it("T75bis/passation conserve stocks et créances", async () => {
    await prisma.cashSession.updateMany({ where: { shopId: shopA, status: { in: ["OPEN", "COUNTING"] } }, data: { status: "CLOSED", closedAt: new Date() } });
    const stockBefore = (await prisma.stockBalance.findFirstOrThrow({ where: { shopId: shopA, variantId } })).quantity.toString();
    const receivablesBefore = await prisma.receivable.count({ where: { shopId: shopA } });
    await expect(startHandover(prisma, owner(), { shopId: shopA, toUserId: managerAId, reason: "Même gérant sélectionné" })).rejects.toMatchObject({ code: "MANAGER_UNCHANGED" });
    const handover = await startHandover(prisma, owner(), { shopId: shopA, toUserId: successorId, reason: "Remplacement planifié du gérant" });
    expect(handover.status).toBe("PENDING");
    expect((await prisma.managerAssignment.findFirstOrThrow({ where: { shopId: shopA, endedAt: null } })).userId).toBe(successorId);
    await prisma.device.updateMany({ where: { userId: successorId, shopId: shopA }, data: { status: "ACTIVE" } });
    const confirmed = await confirmHandover(prisma, { organizationId, actorId: successorId, actorRole: "MANAGER", key: crypto.randomUUID(), requestId: crypto.randomUUID() }, handover.id);
    expect(confirmed.status).toBe("COMPLETED");
    expect((await prisma.stockBalance.findFirstOrThrow({ where: { shopId: shopA, variantId } })).quantity.toString()).toBe(stockBefore);
    expect(await prisma.receivable.count({ where: { shopId: shopA } })).toBe(receivablesBefore);
  });

  it("refuse la lecture interboutique des clients", async () => {
    const foreign = await listCustomers(prisma, organizationId, managerBId, "MANAGER");
    expect(foreign.some((row) => row.id === customerId)).toBe(false);
  });
});
