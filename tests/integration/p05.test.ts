import { createHash } from "node:crypto";

import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  cancelCount,
  completeAttachment,
  createAttachmentIntent,
  createExpense,
  createFundTransfer,
  createPaymentSource,
  createPolicy,
  createShop,
  currentCashSession,
  decideExpense,
  getAttachmentForDownload,
  getCashSession,
  getDiscrepancy,
  listExpenses,
  listManagerDiscrepancies,
  getManagerDiscrepancy,
  openCashSession,
  payExpense,
  quoteSale,
  receiveFundTransfer,
  resolveDiscrepancy,
  respondToDiscrepancy,
  saveOpeningDraft,
  sendFundTransfer,
  startCount,
  submitCount,
  submitExpense,
  transitionShop,
  validateOpening,
} from "@cercle/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) throw new Error("TEST_DATABASE_URL doit viser la base de test.");
const prisma = createPrismaClient(databaseUrl);
const prismaB = createPrismaClient(databaseUrl);

describe("P05 caisse, dépenses et clôture aveugle", () => {
  const organizationId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const owner = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, actorRole: "OWNER", key, requestId: key });
  const manager = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerId, actorRole: "MANAGER", key, requestId: key });
  let shopId = "";
  let accountId = "";
  let ownerAccountId = "";
  let firstSessionId = "";
  let existingOutboxIds: string[] = [];

  beforeAll(async () => {
    existingOutboxIds = (await prisma.outboxEvent.findMany({ select: { id: true } })).map(({ id }) => id);
    await prisma.organization.create({ data: { id: organizationId, name: "P05 intégration" } });
    await prisma.user.createMany({ data: [
      { id: `auth-${ownerId}`, name: "Owner", email: `${ownerId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerId}`, name: "Manager", email: `${managerId}@example.test`, updatedAt: new Date() },
    ] });
    await prisma.appUser.createMany({ data: [
      { id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner", mfaRequired: true },
      { id: managerId, authUserId: `auth-${managerId}`, organizationId, role: "MANAGER", displayName: "Manager" },
    ] });
    const shop = await createShop(prisma, owner(), { code: "P05A", name: "Boutique P05" });
    shopId = shop.id;
    await prisma.managerAssignment.create({ data: { shopId, userId: managerId } });
    await prisma.device.create({ data: { organizationId, shopId, userId: managerId, publicKey: `p05-${crypto.randomUUID()}-public-key-material`, name: "Caisse P05", status: "ACTIVE" } });
    const cash = await createPaymentSource(prisma, owner(), { name: "Caisse P05", type: "CASH", shopId });
    accountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: cash.id } })).id;
    const ownerSource = await createPaymentSource(prisma, owner(), { name: "Compte organisation P05", type: "BANK" });
    ownerAccountId = (await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: ownerSource.id } })).id;
    await prisma.moneyAccount.update({ where: { id: ownerAccountId }, data: { balanceMinor: 200000n } });
    await saveOpeningDraft(prisma, owner(), shopId, { step: 11, stockLines: [], funds: [{ accountId, amountMinor: "50000" }], obligations: [] });
    await validateOpening(prisma, owner(), shopId);
    await transitionShop(prisma, owner(), shopId, "ACTIVE", "Prête");
    firstSessionId = (await openCashSession(prisma, manager())).id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: existingOutboxIds.length ? { id: { notIn: existingOutboxIds } } : {} });
    await prisma.$disconnect();
    await prismaB.$disconnect();
  });

  it("T38 masque l’attendu dans le DTO gérant avant la première déclaration", async () => {
    const current = await currentCashSession(prisma, organizationId, managerId, "MANAGER");
    const serialized = JSON.stringify(current);
    expect(serialized).not.toMatch(/expectedMinor|balanceMinor|attendu/i);
    expect(current.sources.every((source) => !("balanceMinor" in source))).toBe(true);
    expect(current.closures).toEqual([]);
    const ownerView = await currentCashSession(prisma, organizationId, ownerId, "OWNER");
    expect(ownerView.sources.some((source) => "balanceMinor" in source)).toBe(true);
  });

  it("refuse de transformer une source non comptée en déclaration à zéro", async () => {
    await startCount(prisma, manager());
    await expect(submitCount(prisma, manager(), firstSessionId, [{ accountId, denominations: [{ valueMinor: "10000", quantity: 0 }] }]))
      .rejects.toMatchObject({ code: "COUNT_SOURCE_UNCONFIRMED", status: 422 });
    expect(await prisma.cashClosure.count({ where: { sessionId: firstSessionId } })).toBe(0);
  });

  it("T37 et T39 conservent la première déclaration 48 000 contre 50 000", async () => {
    await startCount(prisma, manager());
    expect(JSON.stringify(await currentCashSession(prisma, organizationId, managerId, "MANAGER"))).not.toMatch(/expectedMinor|balanceMinor/);
    const lines = [{ accountId, denominations: [{ valueMinor: "10000", quantity: 4 }, { valueMinor: "1000", quantity: 8 }] }];
    const results = await Promise.allSettled([
      submitCount(prisma, manager(), firstSessionId, lines),
      submitCount(prismaB, manager(), firstSessionId, lines),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.cashClosure.count({ where: { sessionId: firstSessionId } })).toBe(1);
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(48000n);
    const closed = await getCashSession(prisma, organizationId, ownerId, "OWNER", firstSessionId);
    expect(closed.closures[0]?.declaredMinor).toBe("48000");
    expect(closed.closures[0]?.expectedMinor).toBe("50000");
    expect(closed.closures[0]?.varianceMinor).toBe("-2000");
    await expect(prisma.$executeRaw`UPDATE cash_closures SET declared_minor=1 WHERE session_id=${firstSessionId}::uuid`).rejects.toThrow();
  });

  it("T40 reclassifie l’écart sans nouvelle sortie de caisse", async () => {
    const cash = (await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor;
    const discrepancy = await prisma.discrepancyCase.findFirstOrThrow({ where: { sessionId: firstSessionId } });
    expect((await getDiscrepancy(prisma, organizationId, discrepancy.id)).physicalAdjustment).toMatchObject({ available: false, sessionId: null, sessionStatus: null });
    await resolveDiscrepancy(prisma, owner(), discrepancy.id, { decision: "RECLASSIFY", reason: "Dépense oubliée identifiée après clôture.", amountMinor: "2000" });
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(cash);
    expect((await getDiscrepancy(prisma, organizationId, discrepancy.id)).residualAmountMinor).toBe("0");
  });

  it("T41 ouvre la session suivante sur le déclaré et ajuste par écriture liée", async () => {
    const next = await openCashSession(prisma, manager());
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(48000n);
    const original = await prisma.cashClosure.findFirstOrThrow({ where: { sessionId: firstSessionId } });
    const caseId = (await prisma.discrepancyCase.create({
      data: {
        organizationId, shopId, sessionId: next.id, type: "CASH", sourceType: "cash_closures", sourceId: original.id,
        expectedMinor: 50000n, declaredMinor: 48000n, originalAmountMinor: -2000n, residualAmountMinor: -2000n, state: "OPEN",
      },
    })).id;
    expect((await getDiscrepancy(prisma, organizationId, caseId)).physicalAdjustment).toMatchObject({ available: true, sessionId: next.id, sessionStatus: "OPEN" });
    await resolveDiscrepancy(prisma, owner(), caseId, { decision: "ADJUST", reason: "Billets retrouvés au coffre après ouverture.", amountMinor: "2000" });
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(50000n);
    expect(original.declaredMinor).toBe(48000n);
    expect((await prisma.cashClosure.findFirstOrThrow({ where: { id: original.id } })).declaredMinor).toBe(48000n);
  });

  it("T23 refuse l’autonomie à plafond 0 sans mouvement de caisse", async () => {
    const before = (await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor;
    const created = await createExpense(prisma, manager(), {
      category: "SUPPLIES", description: "Sacs de caisse", amountMinor: "1000", accountId,
      receiptExceptionReason: "Justificatif à numériser après l’opération quotidienne.",
    });
    const submitted = await submitExpense(prisma, manager(), created.id);
    expect(submitted.status).toBe("REQUESTED");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(before);
  });

  it("T24 décaissit réellement après autorisation", async () => {
    const requested = (await listExpenses(prisma, organizationId, ownerId, "OWNER")).find((row) => row.description === "Sacs de caisse")!;
    await decideExpense(prisma, owner(), requested.id, "APPROVE", "Autorisation de test");
    const paid = await payExpense(prisma, manager(), requested.id);
    expect(paid.status).toBe("POSTED");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(49000n);
    const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "expenses", referenceId: paid.id }, include: { lines: true } });
    expect(journal.lines.reduce((sum, line) => sum + line.amountMinor, 0n)).toBe(0n);
  });

  it("T25 débite une source d’organisation sans toucher la caisse boutique", async () => {
    const shopCash = (await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor;
    const created = await createExpense(prisma, owner(), {
      shopId, category: "RENT", description: "Loyer organisation", amountMinor: "5000", accountId: ownerAccountId,
      receiptExceptionReason: "Facture propriétaire conservée au siège.",
    });
    await payExpense(prisma, owner(), created.id);
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: ownerAccountId } })).balanceMinor).toBe(195000n);
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(shopCash);
  });

  it("T26 sérialise deux demandes concurrentes sous plafond de session", async () => {
    await createPolicy(prisma, owner(), { shopId, values: { autonomousExpenseMinor: "1000", sessionAutonomousExpenseMinor: "1700" }, reason: "Plafond de session P05" });
    const first = await createExpense(prisma, manager(), { category: "TRANSPORT", description: "Course A", amountMinor: "700", accountId, receiptExceptionReason: "Ticket à joindre plus tard." });
    const second = await createExpense(prisma, manager(), { category: "TRANSPORT", description: "Course B", amountMinor: "700", accountId, receiptExceptionReason: "Ticket à joindre plus tard." });
    const results = await Promise.allSettled([submitExpense(prisma, manager(), first.id), submitExpense(prismaB, manager(), second.id)]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    const statuses = (await listExpenses(prisma, organizationId, managerId, "MANAGER")).filter((row) => ["Course A", "Course B"].includes(row.description)).map((row) => row.status).sort();
    expect(statuses).toEqual(["AUTHORIZED", "REQUESTED"]);
  });

  it("T29 et T30 transfèrent via transit sans double crédit", async () => {
    const transfer = await createFundTransfer(prisma, owner(), {
      sourceAccountId: ownerAccountId, destinationAccountId: accountId, amountMinor: "100000", purpose: "OWNER_CONTRIBUTION", reason: "Avance de fonds", shopId,
    });
    await sendFundTransfer(prisma, owner(), transfer.id);
    const key = crypto.randomUUID();
    const received = await receiveFundTransfer(prisma, manager(key), transfer.id, "40000");
    expect(received.state).toBe("PARTIAL");
    expect(received.remainingMinor).toBe("60000");
    const replay = await receiveFundTransfer(prisma, manager(key), transfer.id, "40000");
    expect(replay.replayed).toBe(true);
    const rest = await receiveFundTransfer(prisma, manager(), transfer.id, "60000");
    expect(rest.state).toBe("RECEIVED");
    expect((await prisma.moneyAccount.findUniqueOrThrow({ where: { id: accountId } })).balanceMinor).toBe(149000n);
  });

  it("bloque une dépense pendant le comptage puis autorise l’annulation", async () => {
    const session = await prisma.cashSession.findFirstOrThrow({ where: { shopId, status: "OPEN" } });
    await startCount(prisma, manager());
    await expect(createExpense(prisma, manager(), { category: "OTHER", description: "Pendant comptage", amountMinor: "100", accountId, receiptExceptionReason: "Test concurrence clôture." })).rejects.toThrow(/comptage/i);
    await expect(quoteSale(prisma, organizationId, managerId, [{ saleUnitId: crypto.randomUUID(), quantity: "1" }])).rejects.toThrow(/comptage/i);
    await cancelCount(prisma, manager(), session.id, "Reprise des opérations");
  });

  it("refuse un justificatif non scanné et un type falsifié", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF extra padding for size");
    const sha = createHash("sha256").update(pdf).digest("hex");
    const intent = await createAttachmentIntent(prisma, manager(), { documentType: "expenses", mime: "application/pdf", size: pdf.length, name: "ticket.pdf", sha256: sha });
    const scanned = await completeAttachment(prisma, manager(), intent.id, pdf);
    expect(scanned.scanStatus).toBe("UNAVAILABLE");
    await expect(getAttachmentForDownload(prisma, organizationId, managerId, "MANAGER", intent.id)).rejects.toThrow(/disponible/i);
    const fake = Buffer.from("<html>not an image</html> padding-padding-padding");
    const fakeSha = createHash("sha256").update(fake).digest("hex");
    const jpeg = await createAttachmentIntent(prisma, manager(), { documentType: "expenses", mime: "image/jpeg", size: fake.length, name: "photo.jpg", sha256: fakeSha });
    await expect(completeAttachment(prisma, manager(), jpeg.id, fake)).rejects.toThrow(/type/i);
  });
});

describe("P05 réponse gérant à une demande d’explication", () => {
  const prismaR = createPrismaClient(databaseUrl);
  const organizationId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const otherManagerId = crypto.randomUUID();
  const owner = (key = crypto.randomUUID()) => ({ organizationId, actorId: ownerId, actorRole: "OWNER" as const, key, requestId: key });
  const manager = (key = crypto.randomUUID()) => ({ organizationId, actorId: managerId, actorRole: "MANAGER" as const, key, requestId: key });
  let shopId = "";
  let otherShopId = "";
  let accountId = "";
  let caseId = "";
  let requestText = "";

  beforeAll(async () => {
    await prismaR.organization.create({ data: { id: organizationId, name: "P05 réponse gérant" } });
    await prismaR.user.createMany({ data: [
      { id: `auth-${ownerId}`, name: "Owner R", email: `${ownerId}@example.test`, updatedAt: new Date() },
      { id: `auth-${managerId}`, name: "Manager R", email: `${managerId}@example.test`, updatedAt: new Date() },
      { id: `auth-${otherManagerId}`, name: "Manager B", email: `${otherManagerId}@example.test`, updatedAt: new Date() },
    ] });
    await prismaR.appUser.createMany({ data: [
      { id: ownerId, authUserId: `auth-${ownerId}`, organizationId, role: "OWNER", displayName: "Owner R", mfaRequired: true },
      { id: managerId, authUserId: `auth-${managerId}`, organizationId, role: "MANAGER", displayName: "Manager R" },
      { id: otherManagerId, authUserId: `auth-${otherManagerId}`, organizationId, role: "MANAGER", displayName: "Manager B" },
    ] });
    const shop = await createShop(prismaR, owner(), { code: "P05R", name: "Boutique réponse" });
    shopId = shop.id;
    const other = await createShop(prismaR, owner(), { code: "P05S", name: "Boutique voisine" });
    otherShopId = other.id;
    await prismaR.managerAssignment.create({ data: { shopId, userId: managerId } });
    await prismaR.managerAssignment.create({ data: { shopId: otherShopId, userId: otherManagerId } });
    await prismaR.device.create({ data: { organizationId, shopId, userId: managerId, publicKey: `p05r-${crypto.randomUUID()}-public-key-material`, name: "Caisse R", status: "ACTIVE" } });
    const cash = await createPaymentSource(prismaR, owner(), { name: "Caisse R", type: "CASH", shopId });
    accountId = (await prismaR.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: cash.id } })).id;
    await saveOpeningDraft(prismaR, owner(), shopId, { step: 11, stockLines: [], funds: [{ accountId, amountMinor: "50000" }], obligations: [] });
    await validateOpening(prismaR, owner(), shopId);
    const otherCash = await createPaymentSource(prismaR, owner(), { name: "Caisse voisine", type: "CASH", shopId: otherShopId });
    const otherAccountId = (await prismaR.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: otherCash.id } })).id;
    await saveOpeningDraft(prismaR, owner(), otherShopId, { step: 11, stockLines: [], funds: [{ accountId: otherAccountId, amountMinor: "10000" }], obligations: [] });
    await validateOpening(prismaR, owner(), otherShopId);
    await transitionShop(prismaR, owner(), shopId, "ACTIVE", "Prête");
    await transitionShop(prismaR, owner(), otherShopId, "ACTIVE", "Prête");
    const sessionId = (await openCashSession(prismaR, manager())).id;
    await startCount(prismaR, manager());
    await submitCount(prismaR, manager(), sessionId, [{ accountId, denominations: [{ valueMinor: "10000", quantity: 4 }, { valueMinor: "1000", quantity: 8 }] }]);
    const created = await prismaR.discrepancyCase.findFirstOrThrow({ where: { sessionId } });
    caseId = created.id;
    requestText = "Merci d’expliquer l’origine de cet écart de caisse.";
    await resolveDiscrepancy(prismaR, owner(), caseId, { decision: "REQUEST_INFO", reason: requestText });
  });

  afterAll(async () => {
    await prismaR.$disconnect();
  });

  it("n’expose pas l’attendu au gérant avant ni après le comptage", async () => {
    const listed = await listManagerDiscrepancies(prismaR, organizationId, managerId);
    expect(JSON.stringify(listed)).not.toMatch(/expectedMinor|balanceMinor|residualAmountMinor|ownerDecision/);
    expect(listed.some((row) => row.id === caseId)).toBe(true);
    const detail = await getManagerDiscrepancy(prismaR, organizationId, managerId, caseId);
    expect(detail.declaredMinor).toBe("48000");
    expect(detail.varianceMinor).toBe("-2000");
    expect(detail.ownerRequest).toBe(requestText);
    expect(detail).not.toHaveProperty("expectedMinor");
  });

  it("refuse la consultation à un gérant d’une autre boutique", async () => {
    await expect(getManagerDiscrepancy(prismaR, organizationId, otherManagerId, caseId)).rejects.toMatchObject({ status: 404 });
    const listed = await listManagerDiscrepancies(prismaR, organizationId, otherManagerId);
    expect(listed.some((row) => row.id === caseId)).toBe(false);
  });

  it("enregistre une réponse immuable, repasse le dossier à OPEN et refuse la répétition", async () => {
    const key = crypto.randomUUID();
    const reply = "Le fonds de caisse du week-end n’avait pas été séparé du tiroir du jour.";
    const first = await respondToDiscrepancy(prismaR, manager(key), caseId, { text: reply });
    expect(first.state).toBe("OPEN");
    const replay = await respondToDiscrepancy(prismaR, manager(key), caseId, { text: reply });
    expect(replay.replayed).toBe(true);
    const actions = await prismaR.discrepancyAction.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
    expect(actions.filter((action) => action.actionType === "MANAGER_RESPONSE")).toHaveLength(1);
    expect(actions.some((action) => action.actionType === "REQUEST_INFO" && action.text === requestText)).toBe(true);
    expect(actions.find((action) => action.actionType === "MANAGER_RESPONSE")?.text).toBe(reply);
    await expect(prismaR.$executeRaw`UPDATE discrepancy_actions SET text='x' WHERE case_id=${caseId}::uuid`).rejects.toThrow();
    const ownerView = await getDiscrepancy(prismaR, organizationId, caseId);
    expect(ownerView.state).toBe("OPEN");
    expect(ownerView.actions.some((action) => action.type === "MANAGER_RESPONSE" && action.actorRole === "MANAGER")).toBe(true);
    expect((await listManagerDiscrepancies(prismaR, organizationId, managerId)).some((row) => row.id === caseId)).toBe(false);
  });

  it("autorise une nouvelle demande puis refuse au gérant de résoudre ou d’ajuster", async () => {
    await resolveDiscrepancy(prismaR, owner(), caseId, { decision: "REQUEST_INFO", reason: "La réponse reste insuffisante, précisez les coupures." });
    expect((await getDiscrepancy(prismaR, organizationId, caseId)).state).toBe("NEEDS_INFO");
    const requests = await prismaR.discrepancyAction.count({ where: { caseId, actionType: "REQUEST_INFO" } });
    expect(requests).toBe(2);
    await expect(resolveDiscrepancy(prismaR, manager(), caseId, { decision: "ACCEPT", reason: "Je clôture moi-même l’écart." })).rejects.toMatchObject({ status: 403 });
    await expect(resolveDiscrepancy(prismaR, manager(), caseId, { decision: "ADJUST", reason: "Ajustement gérant", amountMinor: "2000" })).rejects.toMatchObject({ status: 403 });
    await expect(getManagerDiscrepancy(prismaR, organizationId, managerId, caseId)).resolves.toMatchObject({ state: "NEEDS_INFO" });
  });
});
