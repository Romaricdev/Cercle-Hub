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
  openCashSession,
  payExpense,
  quoteSale,
  receiveFundTransfer,
  resolveDiscrepancy,
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
