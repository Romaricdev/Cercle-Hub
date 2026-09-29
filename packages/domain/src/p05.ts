import { createHash } from "node:crypto";

import {
  assertDenominationCounts,
  canonicalJson,
  ContractError,
  declaredFromMinor,
  reclassifyWithinResidual,
  sha256Hex,
  varianceMinor,
  type DenominationCount,
} from "@cercle/contracts";
import type { Prisma, PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError, withDeadlockRetry } from "./errors.js";
import type { CommandContext } from "./p03.js";

type Tx = Prisma.TransactionClient;
type JsonResult = Prisma.InputJsonObject;

const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "TRANSPORT", "SUPPLIES", "OTHER"] as const;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

async function effect<T extends JsonResult>(prisma: PrismaClient, context: CommandContext, payload: unknown, work: (tx: Tx) => Promise<T>) {
  const requestHash = await sha256Hex(canonicalJson(payload));
  return withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO idempotency_keys (id,organization_id,actor_id,key,request_hash,state,created_at)
      VALUES (${crypto.randomUUID()}::uuid,${context.organizationId}::uuid,${context.actorId}::uuid,${context.key}::uuid,${requestHash},'PROCESSING',NOW())
      ON CONFLICT (organization_id,actor_id,key) DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ request_hash: string; state: string; response_json: T | null }>>`
      SELECT request_hash,state,response_json FROM idempotency_keys WHERE organization_id=${context.organizationId}::uuid
      AND actor_id=${context.actorId}::uuid AND key=${context.key}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row || row.request_hash !== requestHash) throw new DomainError("IDEMPOTENCY_PAYLOAD_MISMATCH", "Cette tentative contient des données différentes.", 409);
    if (row.state === "DONE" && row.response_json) return { ...row.response_json, replayed: true };
    const response = await work(tx);
    await tx.idempotencyKey.update({ where: { organizationId_actorId_key: { organizationId: context.organizationId, actorId: context.actorId, key: context.key } }, data: { state: "DONE", responseStatus: 200, responseJson: response } });
    return { ...response, replayed: false };
  }));
}

function wrap(error: unknown): never {
  if (error instanceof DomainError) throw error;
  if (error instanceof ContractError) throw new DomainError(error.code, error.message, 422);
  throw error;
}

function moneyAmount(value: string): bigint {
  try {
    return declaredFromMinor(value);
  } catch (error) {
    wrap(error);
  }
}

function text(value: string, label: string, min = 5, max = 500): string {
  const result = value.trim();
  if (result.length < min || result.length > max) throw new DomainError("INVALID_INPUT", `${label} est invalide.`, 422);
  return result;
}

async function managerShop(tx: Tx, organizationId: string, actorId: string) {
  const assignment = await tx.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null, user: { organizationId, status: "ACTIVE" } }, include: { shop: true } });
  if (!assignment || assignment.shop.status !== "ACTIVE") throw new DomainError("SHOP_NOT_ACTIVE", "Votre boutique doit être active.", 409);
  return assignment.shop;
}

async function lockSession(tx: Tx, shopId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string; manager_id: string; business_date: Date; version: number }>>`
    SELECT id, status, manager_id, business_date, version FROM cash_sessions WHERE shop_id=${shopId}::uuid AND status IN ('OPEN','COUNTING') FOR UPDATE`;
  return rows[0] ?? null;
}

function policyCap(values: unknown): { autonomous: bigint; sessionAutonomous: bigint } {
  const record = values && typeof values === "object" && !Array.isArray(values) ? values as Record<string, unknown> : {};
  const parse = (key: string) => typeof record[key] === "string" && /^\d+$/.test(record[key] as string) ? BigInt(record[key] as string) : 0n;
  return { autonomous: parse("autonomousExpenseMinor"), sessionAutonomous: parse("sessionAutonomousExpenseMinor") };
}

async function postJournal(tx: Tx, input: { organizationId: string; actorId: string; type: string; referenceType: string; referenceId: string; lines: Array<{ accountCode: string; amountMinor: bigint }> }) {
  const sum = input.lines.reduce((total, line) => total + line.amountMinor, 0n);
  if (sum !== 0n) throw new DomainError("UNBALANCED_JOURNAL", "Le journal opérationnel n’est pas équilibré.", 500);
  const journal = await tx.journalEntry.create({ data: { organizationId: input.organizationId, actorId: input.actorId, type: input.type, status: "DRAFT", referenceType: input.referenceType, referenceId: input.referenceId, lines: { create: input.lines } } });
  await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedAt: new Date() } });
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

export async function scanAttachmentBytes(bytes: Uint8Array): Promise<{ status: "CLEAN" | "REJECTED" | "UNAVAILABLE"; engine: string | null }> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return { status: "UNAVAILABLE", engine: null };
  try {
    const net = await import("node:net");
    const port = Number(process.env.CLAMAV_PORT ?? "3310");
    const result = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      socket.setTimeout(4_000);
      socket.on("connect", () => {
        socket.write("nINSTREAM\n");
        const size = Buffer.alloc(4);
        size.writeUInt32BE(bytes.length);
        socket.write(size);
        socket.write(Buffer.from(bytes));
        const end = Buffer.alloc(4);
        socket.write(end);
      });
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      socket.on("error", reject);
      socket.on("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
    });
    if (/FOUND/i.test(result)) return { status: "REJECTED", engine: "clamav" };
    if (/OK/i.test(result)) return { status: "CLEAN", engine: "clamav" };
    return { status: "UNAVAILABLE", engine: "clamav" };
  } catch {
    return { status: "UNAVAILABLE", engine: "clamav" };
  }
}

export async function currentCashSession(prisma: PrismaClient, organizationId: string, actorId: string, role: string) {
  const assignment = role === "MANAGER" ? await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }) : null;
  const shopId = assignment?.shopId;
  const session = await prisma.cashSession.findFirst({
    where: { organizationId, status: { in: ["OPEN", "COUNTING"] }, ...(shopId ? { shopId } : {}) },
    include: { shop: true, manager: { select: { displayName: true } }, closures: true },
    orderBy: { openedAt: "desc" },
  });
  if (!session) return { session: null };
  const [sales, expenses, sources] = await Promise.all([
    prisma.sale.findMany({ where: { sessionId: session.id, status: "POSTED" }, orderBy: { postedAt: "desc" }, take: 50, select: { id: true, reference: true, netMinor: true, postedAt: true } }),
    prisma.expense.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, description: true, amountMinor: true, status: true, category: true } }),
    prisma.moneyAccount.findMany({ where: { organizationId, shopId: session.shopId, paymentSource: { status: "ACTIVE" } }, include: { paymentSource: true }, orderBy: { name: "asc" } }),
  ]);
  const closed = session.closures.length > 0;
  return {
    session: {
      id: session.id,
      status: session.status,
      businessDate: session.businessDate.toISOString().slice(0, 10),
      shopId: session.shopId,
      shopName: session.shop.name,
      managerName: session.manager.displayName,
      openedAt: session.openedAt.toISOString(),
    },
    operations: {
      sales: sales.map((sale) => ({ id: sale.id, reference: sale.reference, netMinor: sale.netMinor.toString(), postedAt: sale.postedAt.toISOString() })),
      expenses: expenses.map((item) => ({ id: item.id, description: item.description, amountMinor: item.amountMinor.toString(), status: item.status, category: item.category })),
    },
    sources: sources.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.paymentSource.type,
      ...(role === "OWNER" || closed ? { balanceMinor: account.balanceMinor.toString() } : {}),
    })),
    closures: role === "OWNER" || closed
      ? session.closures.map((row) => ({
          accountId: row.accountId,
          declaredMinor: row.declaredMinor.toString(),
          expectedMinor: row.expectedMinor.toString(),
          varianceMinor: row.varianceMinor.toString(),
          submittedAt: row.submittedAt.toISOString(),
        }))
      : [],
  };
}

export async function startCount(prisma: PrismaClient, context: CommandContext) {
  return effect(prisma, context, { action: "start-count" }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const session = await lockSession(tx, shop.id);
    if (!session) throw new DomainError("CASH_SESSION_REQUIRED", "Aucune session ouverte n’est à clôturer.", 409);
    if (session.manager_id !== context.actorId) throw new DomainError("CASH_SESSION_BUSY", "Cette session appartient à un autre gérant.", 403);
    if (session.status === "COUNTING") return { id: session.id, status: "COUNTING" as const, businessDate: session.business_date.toISOString().slice(0, 10) };
    await tx.cashSession.update({ where: { id: session.id }, data: { status: "COUNTING", countedAt: new Date(), version: { increment: 1 } } });
    await writeAudit(tx, { actorId: context.actorId, action: "CASH_COUNT_STARTED", entityType: "cash_sessions", entityId: session.id, requestId: context.requestId, afterJson: { shopId: shop.id } });
    return { id: session.id, status: "COUNTING" as const, businessDate: session.business_date.toISOString().slice(0, 10) };
  });
}

export async function cancelCount(prisma: PrismaClient, context: CommandContext, sessionId: string, reason?: string | undefined) {
  return effect(prisma, context, { action: "cancel-count", sessionId, reason: reason ?? null }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const session = await lockSession(tx, shop.id);
    if (!session || session.id !== sessionId) throw new DomainError("CASH_SESSION_REQUIRED", "La session de comptage est introuvable.", 409);
    if (session.status !== "COUNTING") throw new DomainError("COUNT_NOT_STARTED", "Aucun comptage n’est en cours.", 409);
    if (await tx.cashClosure.count({ where: { sessionId } })) throw new DomainError("COUNT_ALREADY_SUBMITTED", "Le premier comptage est déjà enregistré.", 409);
    await tx.cashSession.update({ where: { id: sessionId }, data: { status: "OPEN", countedAt: null, version: { increment: 1 } } });
    await writeAudit(tx, { actorId: context.actorId, action: "CASH_COUNT_CANCELLED", entityType: "cash_sessions", entityId: sessionId, requestId: context.requestId, afterJson: { reason: reason?.trim() ?? null } });
    return { id: sessionId, status: "OPEN" as const };
  });
}

export interface CountLineInput {
  accountId: string;
  denominations?: DenominationCount[] | undefined;
  declaredMinor?: string | undefined;
  confirmedEmpty?: boolean | undefined;
  explanation?: string | undefined;
}

export async function submitCount(prisma: PrismaClient, context: CommandContext, sessionId: string, lines: CountLineInput[]) {
  try {
    return await effect(prisma, context, { action: "submit-count", sessionId, lines }, async (tx) => {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      const session = await lockSession(tx, shop.id);
      if (!session || session.id !== sessionId) {
        const closed = await tx.cashSession.findFirst({ where: { id: sessionId, organizationId: context.organizationId } });
        if (closed?.status === "CLOSED") throw new DomainError("ALREADY_CLOSED", "Cette session est déjà clôturée.", 409);
        throw new DomainError("CASH_SESSION_REQUIRED", "La session n’est pas en cours de comptage.", 409);
      }
      if (session.status !== "COUNTING") throw new DomainError("COUNT_NOT_STARTED", "Démarrez le comptage avant de l’enregistrer.", 409);
      if (await tx.cashClosure.count({ where: { sessionId } })) throw new DomainError("ALREADY_CLOSED", "Cette session est déjà clôturée.", 409);
      const accounts = await tx.moneyAccount.findMany({ where: { organizationId: context.organizationId, shopId: shop.id, paymentSource: { status: "ACTIVE" } }, include: { paymentSource: true } });
      if (lines.length !== accounts.length) throw new DomainError("COUNT_INCOMPLETE", "Comptez chaque source de fonds de la boutique.", 422);
      const used = new Set<string>();
      const closures = [];
      for (const line of lines) {
        if (used.has(line.accountId)) throw new DomainError("DUPLICATE_ACCOUNT", "Chaque source ne peut être comptée qu’une fois.", 422);
        used.add(line.accountId);
        const account = accounts.find((item) => item.id === line.accountId);
        if (!account) throw new DomainError("PAYMENT_ACCOUNT_INVALID", "Une source de fonds est invalide.", 422);
        await tx.$queryRaw`SELECT id FROM money_accounts WHERE id=${account.id}::uuid FOR UPDATE`;
        let declared: bigint;
        let denominations: unknown;
        if (account.paymentSource.type === "CASH") {
          const parsed = assertDenominationCounts(line.denominations ?? []);
          declared = parsed.declaredMinor;
          denominations = parsed.normalized;
        } else {
          declared = declaredFromMinor(line.declaredMinor ?? "");
          denominations = [];
        }
        if (declared === 0n && line.confirmedEmpty !== true) {
          throw new DomainError("COUNT_SOURCE_UNCONFIRMED", `Confirmez explicitement que la source « ${account.name} » est physiquement vide.`, 422);
        }
        const expected = account.balanceMinor;
        const variance = varianceMinor(declared, expected);
        if (variance !== 0n && line.explanation && line.explanation.trim().length < 10) {
          throw new DomainError("EXPLANATION_REQUIRED", "Expliquez l’écart en au moins 10 caractères, ou laissez vide pour le compléter ensuite.", 422);
        }
        const closure = await tx.cashClosure.create({
          data: {
            organizationId: context.organizationId,
            sessionId,
            accountId: account.id,
            declaredMinor: declared,
            expectedMinor: expected,
            varianceMinor: variance,
            denominationCounts: denominations as Prisma.InputJsonValue,
            explanation: line.explanation?.trim() || null,
            submittedById: context.actorId,
          },
        });
        if (variance !== 0n) {
          const event = await tx.moneyEvent.create({
            data: {
              organizationId: context.organizationId,
              actorId: context.actorId,
              type: "COUNT_VARIANCE",
              reason: `Écart de clôture ${account.name}`,
              entries: { create: { accountId: account.id, amountMinor: variance } },
            },
          });
          await tx.moneyAccount.update({ where: { id: account.id }, data: { balanceMinor: { increment: variance }, version: { increment: 1 } } });
          await postJournal(tx, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            type: "COUNT_VARIANCE",
            referenceType: "cash_closures",
            referenceId: closure.id,
            lines: [{ accountCode: "ASSET:FUNDS", amountMinor: variance }, { accountCode: "COUNT_VARIANCE", amountMinor: -variance }],
          });
          await tx.discrepancyCase.create({
            data: {
              organizationId: context.organizationId,
              shopId: shop.id,
              sessionId,
              type: "CASH",
              sourceType: "cash_closures",
              sourceId: closure.id,
              expectedMinor: expected,
              declaredMinor: declared,
              originalAmountMinor: variance,
              residualAmountMinor: variance,
              state: line.explanation?.trim() ? "OPEN" : "NEEDS_INFO",
            },
          });
          void event;
        }
        closures.push({
          accountId: account.id,
          source: account.name,
          declaredMinor: declared.toString(),
          expectedMinor: expected.toString(),
          varianceMinor: variance.toString(),
        });
      }
      await tx.cashSession.update({ where: { id: sessionId }, data: { status: "CLOSED", closedAt: new Date(), version: { increment: 1 } } });
      await writeAudit(tx, { actorId: context.actorId, action: "CASH_SESSION_CLOSED", entityType: "cash_sessions", entityId: sessionId, requestId: context.requestId, afterJson: { closures } });
      await tx.outboxEvent.create({ data: { id: crypto.randomUUID(), topic: "business.cash_session_closed", aggregateId: sessionId, payload: { shopId: shop.id } } });
      return { id: sessionId, status: "CLOSED" as const, closures };
    });
  } catch (error) {
    wrap(error);
  }
}

export async function listOwnerSessions(prisma: PrismaClient, organizationId: string, shopId?: string) {
  if (shopId && !(await prisma.shop.count({ where: { id: shopId, organizationId } }))) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  const sessions = await prisma.cashSession.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    orderBy: [{ openedAt: "desc" }],
    take: 80,
    include: { shop: { select: { name: true } }, manager: { select: { displayName: true } }, closures: true },
  });
  return sessions.map((session) => ({
    id: session.id,
    status: session.status,
    shopName: session.shop.name,
    managerName: session.manager.displayName,
    businessDate: session.businessDate.toISOString().slice(0, 10),
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    varianceMinor: session.closures.reduce((sum, row) => sum + row.varianceMinor, 0n).toString(),
    declaredMinor: session.closures.reduce((sum, row) => sum + row.declaredMinor, 0n).toString(),
    expectedMinor: session.closures.reduce((sum, row) => sum + row.expectedMinor, 0n).toString(),
  }));
}

export async function getOwnerSession(prisma: PrismaClient, organizationId: string, id: string) {
  const session = await prisma.cashSession.findFirst({
    where: { id, organizationId },
    include: {
      shop: true,
      manager: { select: { displayName: true } },
      closures: { include: { account: true } },
      sales: { where: { status: "POSTED" }, orderBy: { postedAt: "asc" }, select: { id: true, reference: true, netMinor: true, postedAt: true } },
      expenses: { orderBy: { createdAt: "asc" } },
      discrepancies: true,
    },
  });
  if (!session) throw new DomainError("CASH_SESSION_NOT_FOUND", "Session introuvable.", 404);
  return {
    id: session.id,
    status: session.status,
    shop: { id: session.shop.id, name: session.shop.name },
    managerName: session.manager.displayName,
    businessDate: session.businessDate.toISOString().slice(0, 10),
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    closures: session.closures.map((row) => ({
      id: row.id,
      source: row.account.name,
      declaredMinor: row.declaredMinor.toString(),
      expectedMinor: row.expectedMinor.toString(),
      varianceMinor: row.varianceMinor.toString(),
      explanation: row.explanation,
      denominations: row.denominationCounts,
    })),
    sales: session.sales.map((sale) => ({ id: sale.id, reference: sale.reference, netMinor: sale.netMinor.toString(), postedAt: sale.postedAt.toISOString() })),
    expenses: session.expenses.map((item) => ({ id: item.id, description: item.description, amountMinor: item.amountMinor.toString(), status: item.status })),
    discrepancies: session.discrepancies.map((item) => ({ id: item.id, state: item.state, residualAmountMinor: item.residualAmountMinor.toString() })),
  };
}

function assertCategory(value: string) {
  if (!EXPENSE_CATEGORIES.includes(value as (typeof EXPENSE_CATEGORIES)[number])) throw new DomainError("INVALID_CATEGORY", "La catégorie de dépense est invalide.", 422);
}

export async function createExpense(prisma: PrismaClient, context: CommandContext, input: {
  category: string; description: string; amountMinor: string; accountId: string; beneficiary?: string | undefined; receiptExceptionReason?: string | undefined; attachmentIds?: string[] | undefined; alreadyPaid?: boolean | undefined; shopId?: string | undefined;
}) {
  return effect(prisma, context, input, async (tx) => {
    const isOwner = context.actorRole === "OWNER";
    let shopId: string;
    let sessionId: string | null = null;
    if (isOwner) {
      if (!input.shopId) throw new DomainError("SHOP_REQUIRED", "Indiquez la boutique concernée.", 422);
      const shop = await tx.shop.findFirst({ where: { id: input.shopId, organizationId: context.organizationId } });
      if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
      shopId = shop.id;
    } else {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      const session = await lockSession(tx, shop.id);
      if (!session || session.status !== "OPEN") throw new DomainError(session?.status === "COUNTING" ? "COUNT_IN_PROGRESS" : "CASH_SESSION_REQUIRED", session?.status === "COUNTING" ? "Terminez ou annulez le comptage avant une dépense." : "Ouvrez la session de caisse.", 409);
      shopId = shop.id;
      sessionId = session.id;
    }
    assertCategory(input.category);
    const amount = moneyAmount(input.amountMinor);
    if (amount <= 0n) throw new DomainError("INVALID_MONEY", "Le montant doit être positif.", 422);
    const account = await tx.moneyAccount.findFirst({
      where: { id: input.accountId, organizationId: context.organizationId, ...(isOwner ? {} : { shopId }) },
    });
    if (!account) throw new DomainError("PAYMENT_ACCOUNT_INVALID", "La source de fonds est invalide.", 422);
    if (!input.attachmentIds?.length && !input.receiptExceptionReason?.trim()) {
      throw new DomainError("RECEIPT_REQUIRED", "Ajoutez un justificatif ou motivez son absence.", 422);
    }
    const expense = await tx.expense.create({
      data: {
        organizationId: context.organizationId,
        shopId,
        actorId: context.actorId,
        sessionId,
        accountId: account.id,
        category: input.category,
        description: text(input.description, "La description"),
        amountMinor: amount,
        beneficiary: input.beneficiary?.trim() || null,
        receiptExceptionReason: input.receiptExceptionReason?.trim() || null,
        status: input.alreadyPaid ? "IRREGULAR" : isOwner ? "AUTHORIZED" : "DRAFT",
      },
    });
    if (input.attachmentIds?.length) {
      await tx.attachment.updateMany({ where: { id: { in: input.attachmentIds }, organizationId: context.organizationId, uploadedById: context.actorId }, data: { ownerDocumentType: "expenses", ownerDocumentId: expense.id } });
    }
    await writeAudit(tx, { actorId: context.actorId, action: "EXPENSE_CREATED", entityType: "expenses", entityId: expense.id, requestId: context.requestId, afterJson: { amountMinor: amount.toString(), alreadyPaid: Boolean(input.alreadyPaid) } });
    return { id: expense.id, status: expense.status, amountMinor: amount.toString() };
  });
}

export async function submitExpense(prisma: PrismaClient, context: CommandContext, id: string) {
  return effect(prisma, context, { action: "submit-expense", id }, async (tx) => {
    const expense = await tx.expense.findFirst({ where: { id, organizationId: context.organizationId, actorId: context.actorId } });
    if (!expense || expense.status !== "DRAFT") throw new DomainError("EXPENSE_NOT_FOUND", "La demande de dépense n’est pas soumissible.", 404);
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const session = await lockSession(tx, shop.id);
    if (!session || session.status !== "OPEN" || session.id !== expense.sessionId) {
      throw new DomainError(session?.status === "COUNTING" ? "COUNT_IN_PROGRESS" : "CASH_SESSION_REQUIRED", session?.status === "COUNTING" ? "Terminez le comptage avant une demande de dépense." : "La session de caisse n’est plus ouverte.", 409);
    }
    const policy = await tx.policy.findFirst({ where: { organizationId: context.organizationId, OR: [{ shopId: expense.shopId }, { shopId: null }] }, orderBy: [{ shopId: "desc" }, { version: "desc" }] });
    const caps = policyCap(policy?.values);
    const posted = await tx.expense.aggregate({ where: { sessionId: expense.sessionId, status: { in: ["POSTED", "AUTHORIZED"] } }, _sum: { amountMinor: true } });
    const sessionUsed = posted._sum.amountMinor ?? 0n;
    const autonomous = expense.amountMinor <= caps.autonomous && (caps.sessionAutonomous === 0n || sessionUsed + expense.amountMinor <= caps.sessionAutonomous);
    const status = autonomous ? "AUTHORIZED" : "REQUESTED";
    await tx.expense.update({ where: { id }, data: { status, policyVersion: policy?.version ?? null, ...(autonomous ? { approvedAt: new Date() } : {}) } });
    await writeAudit(tx, { actorId: context.actorId, action: autonomous ? "EXPENSE_AUTO_AUTHORIZED" : "EXPENSE_REQUESTED", entityType: "expenses", entityId: id, requestId: context.requestId, afterJson: { status } });
    return { id, status };
  });
}

export async function decideExpense(prisma: PrismaClient, context: CommandContext, id: string, decision: "APPROVE" | "REJECT", reason: string) {
  if (context.actorRole !== "OWNER") throw new DomainError("FORBIDDEN", "Seule la propriétaire peut décider.", 403);
  return effect(prisma, context, { action: "decide-expense", id, decision, reason }, async (tx) => {
    const expense = await tx.expense.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!expense || expense.status !== "REQUESTED") throw new DomainError("EXPENSE_NOT_FOUND", "Cette dépense n’attend pas de décision.", 404);
    const status = decision === "APPROVE" ? "AUTHORIZED" : "REJECTED";
    await tx.expense.update({ where: { id }, data: { status, approvedById: context.actorId, approvedAt: new Date(), rejectedReason: decision === "REJECT" ? text(reason, "Le motif", 3, 240) : null } });
    await writeAudit(tx, { actorId: context.actorId, action: `EXPENSE_${decision}D`, entityType: "expenses", entityId: id, requestId: context.requestId, afterJson: { status } });
    return { id, status };
  });
}

export async function payExpense(prisma: PrismaClient, context: CommandContext, id: string) {
  return effect(prisma, context, { action: "pay-expense", id }, async (tx) => {
    const isOwner = context.actorRole === "OWNER";
    let sessionId: string | null = null;
    const expense = await tx.expense.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!expense) throw new DomainError("EXPENSE_NOT_PAYABLE", "Cette dépense n’est pas prête à être décaissée.", 409);
    if (!isOwner) {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      const session = await lockSession(tx, shop.id);
      if (!session || session.status !== "OPEN") throw new DomainError(session?.status === "COUNTING" ? "COUNT_IN_PROGRESS" : "CASH_SESSION_REQUIRED", session?.status === "COUNTING" ? "Terminez le comptage avant un décaissement." : "Ouvrez la session de caisse.", 409);
      if (expense.shopId !== shop.id) throw new DomainError("EXPENSE_NOT_PAYABLE", "Cette dépense n’est pas prête à être décaissée.", 409);
      sessionId = session.id;
    } else if (expense.accountId) {
      const account = await tx.moneyAccount.findFirst({ where: { id: expense.accountId, organizationId: context.organizationId } });
      if (account?.shopId) {
        const session = await lockSession(tx, account.shopId);
        if (session?.status === "COUNTING") throw new DomainError("COUNT_IN_PROGRESS", "Terminez le comptage avant un décaissement.", 409);
        sessionId = session?.id ?? expense.sessionId;
      }
    }
    if (!["AUTHORIZED", "IRREGULAR"].includes(expense.status)) throw new DomainError("EXPENSE_NOT_PAYABLE", "Cette dépense n’est pas prête à être décaissée.", 409);
    const accounts = await tx.$queryRaw<Array<{ id: string; balance_minor: bigint }>>`SELECT id, balance_minor FROM money_accounts WHERE id=${expense.accountId}::uuid FOR UPDATE`;
    const account = accounts[0];
    if (!account || account.balance_minor < expense.amountMinor) throw new DomainError("INSUFFICIENT_FUNDS", "Le solde de la source est insuffisant.", 409);
    const event = await tx.moneyEvent.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "EXPENSE_PAYMENT",
        reason: expense.description,
        entries: { create: { accountId: expense.accountId, amountMinor: -expense.amountMinor } },
      },
    });
    await tx.moneyAccount.update({ where: { id: expense.accountId }, data: { balanceMinor: { decrement: expense.amountMinor }, version: { increment: 1 } } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "EXPENSE_PAYMENT",
      referenceType: "expenses",
      referenceId: expense.id,
      lines: [{ accountCode: "ASSET:FUNDS", amountMinor: -expense.amountMinor }, { accountCode: "EXPENSE_CLEARING", amountMinor: expense.amountMinor }],
    });
    await tx.expense.update({ where: { id }, data: { status: expense.status === "IRREGULAR" ? "IRREGULAR" : "POSTED", paidEventId: event.id, sessionId: sessionId ?? expense.sessionId } });
    if (expense.status === "IRREGULAR") {
      await tx.discrepancyCase.create({
        data: {
          organizationId: context.organizationId,
          shopId: expense.shopId,
          sessionId: sessionId ?? expense.sessionId,
          type: "CASH",
          sourceType: "expenses",
          sourceId: expense.id,
          originalAmountMinor: expense.amountMinor,
          residualAmountMinor: expense.amountMinor,
          state: "OPEN",
        },
      });
    }
    await writeAudit(tx, { actorId: context.actorId, action: "EXPENSE_PAID", entityType: "expenses", entityId: id, requestId: context.requestId, afterJson: { amountMinor: expense.amountMinor.toString() } });
    return { id, status: expense.status === "IRREGULAR" ? "IRREGULAR" : "POSTED", amountMinor: expense.amountMinor.toString() };
  });
}

export async function declareIrregularExpense(prisma: PrismaClient, context: CommandContext, input: Parameters<typeof createExpense>[2]) {
  const created = await createExpense(prisma, { ...context, key: crypto.randomUUID() }, { ...input, alreadyPaid: true });
  return payExpense(prisma, context, created.id);
}

export async function listExpenses(prisma: PrismaClient, organizationId: string, actorId: string, role: string, shopId?: string) {
  if (role === "MANAGER") {
    const assignment = await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } });
    if (!assignment) return [];
    shopId = assignment.shopId;
  } else if (shopId && !(await prisma.shop.count({ where: { id: shopId, organizationId } }))) {
    throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  }
  const rows = await prisma.expense.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { shop: { select: { name: true } }, account: { select: { name: true } }, actor: { select: { displayName: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    shopName: row.shop.name,
    managerName: row.actor.displayName,
    category: row.category,
    description: row.description,
    amountMinor: row.amountMinor.toString(),
    status: row.status,
    source: row.account.name,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getExpense(prisma: PrismaClient, organizationId: string, actorId: string, role: string, id: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, organizationId },
    include: { shop: true, account: true, actor: { select: { displayName: true } } },
  });
  if (!expense) throw new DomainError("EXPENSE_NOT_FOUND", "Dépense introuvable.", 404);
  if (role === "MANAGER") {
    const assignment = await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } });
    if (!assignment || assignment.shopId !== expense.shopId) throw new DomainError("EXPENSE_NOT_FOUND", "Dépense introuvable.", 404);
  }
  const attachments = await prisma.attachment.findMany({ where: { organizationId, ownerDocumentType: "expenses", ownerDocumentId: id } });
  return {
    id: expense.id,
    shopName: expense.shop.name,
    managerName: expense.actor.displayName,
    category: expense.category,
    description: expense.description,
    beneficiary: expense.beneficiary,
    amountMinor: expense.amountMinor.toString(),
    status: expense.status,
    source: expense.account.name,
    accountId: expense.accountId,
    receiptExceptionReason: expense.receiptExceptionReason,
    rejectedReason: expense.rejectedReason,
    createdAt: expense.createdAt.toISOString(),
    attachments: attachments.map((item) => ({ id: item.id, name: item.originalName, scanStatus: item.scanStatus, mime: item.mime })),
  };
}

export async function listFundAccounts(prisma: PrismaClient, organizationId: string, actorId: string, role: string) {
  const assignment = role === "MANAGER" ? await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }) : null;
  if (role === "MANAGER" && !assignment) return [];
  const rows = await prisma.moneyAccount.findMany({
    where: {
      organizationId,
      paymentSource: { status: "ACTIVE", type: { not: "TRANSIT" } },
      ...(assignment ? { shopId: assignment.shopId } : {}),
    },
    include: { paymentSource: true, shop: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.paymentSource.type,
    shopId: row.shopId,
    shopName: row.shop?.name ?? "Organisation",
    ...(role === "OWNER" ? { balanceMinor: row.balanceMinor.toString() } : {}),
  }));
}

export async function listCashSessions(prisma: PrismaClient, organizationId: string, actorId: string, role: string, shopId?: string) {
  if (role === "MANAGER") {
    const assignment = await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } });
    if (!assignment) return [];
    shopId = assignment.shopId;
  }
  const rows = await listOwnerSessions(prisma, organizationId, shopId);
  if (role === "OWNER") return rows;
  return rows.map((row) => row.status === "CLOSED" ? row : { ...row, varianceMinor: undefined, declaredMinor: undefined, expectedMinor: undefined });
}

export async function getCashSession(prisma: PrismaClient, organizationId: string, actorId: string, role: string, id: string) {
  const session = await getOwnerSession(prisma, organizationId, id);
  if (role === "OWNER") return session;
  const assignment = await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } });
  if (!assignment || assignment.shopId !== session.shop.id) throw new DomainError("CASH_SESSION_NOT_FOUND", "Session introuvable.", 404);
  if (session.status !== "CLOSED") {
    return { ...session, closures: [], discrepancies: [] };
  }
  return session;
}

export async function createFundTransfer(prisma: PrismaClient, context: CommandContext, input: {
  sourceAccountId: string; destinationAccountId: string; amountMinor: string; purpose: string; reason: string; shopId?: string | undefined;
}) {
  return effect(prisma, context, input, async (tx) => {
    if (context.actorRole === "MANAGER" && input.purpose !== "REMITTANCE") {
      throw new DomainError("FORBIDDEN", "Le gérant ne peut enregistrer qu’une remise de fonds.", 403);
    }
    if (!["REMITTANCE", "FLOAT", "OWNER_CONTRIBUTION", "WITHDRAWAL"].includes(input.purpose)) throw new DomainError("INVALID_PURPOSE", "Le motif du mouvement est invalide.", 422);
    const amount = moneyAmount(input.amountMinor);
    if (input.sourceAccountId === input.destinationAccountId) throw new DomainError("INVALID_TRANSFER", "La source et la destination doivent être distinctes.", 422);
    const source = await tx.moneyAccount.findFirst({ where: { id: input.sourceAccountId, organizationId: context.organizationId } });
    const destination = await tx.moneyAccount.findFirst({ where: { id: input.destinationAccountId, organizationId: context.organizationId } });
    if (!source || !destination) throw new DomainError("ACCOUNT_NOT_FOUND", "Un compte de fonds est introuvable.", 404);
    const transitSource = await tx.paymentSource.create({ data: { organizationId: context.organizationId, name: `Transit ${crypto.randomUUID().slice(0, 8)}`, type: "TRANSIT", status: "ACTIVE" } });
    const transit = await tx.moneyAccount.create({ data: { organizationId: context.organizationId, paymentSourceId: transitSource.id, name: transitSource.name, currency: source.currency, balanceMinor: 0n } });
    const transfer = await tx.fundTransfer.create({
      data: {
        organizationId: context.organizationId,
        shopId: input.shopId ?? destination.shopId ?? source.shopId,
        actorId: context.actorId,
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        transitAccountId: transit.id,
        amountSentMinor: amount,
        purpose: input.purpose,
        reason: text(input.reason, "Le motif", 3, 240),
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "FUND_TRANSFER_CREATED", entityType: "fund_transfers", entityId: transfer.id, requestId: context.requestId, afterJson: { amountMinor: amount.toString(), purpose: input.purpose } });
    return { id: transfer.id, state: transfer.state, amountSentMinor: amount.toString() };
  });
}

export async function sendFundTransfer(prisma: PrismaClient, context: CommandContext, id: string) {
  return effect(prisma, context, { action: "send-fund", id }, async (tx) => {
    const transfer = await tx.fundTransfer.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!transfer || transfer.state !== "DRAFT") throw new DomainError("TRANSFER_NOT_FOUND", "Ce mouvement ne peut pas être envoyé.", 409);
    if (context.actorRole === "MANAGER") {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      const session = await lockSession(tx, shop.id);
      if (!session || session.status !== "OPEN") throw new DomainError(session?.status === "COUNTING" ? "COUNT_IN_PROGRESS" : "CASH_SESSION_REQUIRED", "Une session ouverte est requise pour remettre des fonds.", 409);
    }
    const sources = [
      ...(await tx.$queryRaw<Array<{ id: string; balance_minor: bigint }>>`SELECT id, balance_minor FROM money_accounts WHERE id=${transfer.sourceAccountId}::uuid FOR UPDATE`),
      ...(await tx.$queryRaw<Array<{ id: string; balance_minor: bigint }>>`SELECT id, balance_minor FROM money_accounts WHERE id=${transfer.transitAccountId}::uuid FOR UPDATE`),
    ];
    const source = sources.find((row) => row.id === transfer.sourceAccountId);
    if (!source || source.balance_minor < transfer.amountSentMinor) throw new DomainError("INSUFFICIENT_FUNDS", "Le solde est insuffisant pour cette remise.", 409);
    await tx.moneyEvent.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "FUND_SEND",
        reason: transfer.reason,
        entries: { create: [{ accountId: transfer.sourceAccountId, amountMinor: -transfer.amountSentMinor }, { accountId: transfer.transitAccountId, amountMinor: transfer.amountSentMinor }] },
      },
    });
    await tx.moneyAccount.update({ where: { id: transfer.sourceAccountId }, data: { balanceMinor: { decrement: transfer.amountSentMinor }, version: { increment: 1 } } });
    await tx.moneyAccount.update({ where: { id: transfer.transitAccountId }, data: { balanceMinor: { increment: transfer.amountSentMinor }, version: { increment: 1 } } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "FUND_SEND",
      referenceType: "fund_transfers",
      referenceId: transfer.id,
      lines: [{ accountCode: "ASSET:FUNDS", amountMinor: -transfer.amountSentMinor }, { accountCode: "ASSET:TRANSIT", amountMinor: transfer.amountSentMinor }],
    });
    await tx.fundTransfer.update({ where: { id }, data: { state: "SENT", sentAt: new Date() } });
    await writeAudit(tx, { actorId: context.actorId, action: "FUND_TRANSFER_SENT", entityType: "fund_transfers", entityId: id, requestId: context.requestId, afterJson: { amountMinor: transfer.amountSentMinor.toString() } });
    return { id, state: "SENT", remainingMinor: transfer.amountSentMinor.toString() };
  });
}

export async function receiveFundTransfer(prisma: PrismaClient, context: CommandContext, id: string, amountMinor: string, comment?: string | undefined) {
  return effect(prisma, context, { action: "receive-fund", id, amountMinor, comment: comment ?? null }, async (tx) => {
    const transfer = await tx.fundTransfer.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!transfer || !["SENT", "PARTIAL"].includes(transfer.state)) throw new DomainError("TRANSFER_NOT_FOUND", "Aucun fonds en transit n’est à recevoir.", 409);
    const amount = moneyAmount(amountMinor);
    const remaining = transfer.amountSentMinor - transfer.amountReceivedMinor;
    if (amount > remaining) throw new DomainError("RECEIPT_EXCEEDS_SENT", "La réception dépasse le montant encore en transit.", 422);
    if (context.actorRole === "MANAGER") {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      const session = await lockSession(tx, shop.id);
      if (!session || session.status !== "OPEN") throw new DomainError(session?.status === "COUNTING" ? "COUNT_IN_PROGRESS" : "CASH_SESSION_REQUIRED", "Une session ouverte est requise pour confirmer une réception.", 409);
    }
    await tx.$queryRaw`SELECT id FROM money_accounts WHERE id=${transfer.transitAccountId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM money_accounts WHERE id=${transfer.destinationAccountId}::uuid FOR UPDATE`;
    await tx.moneyEvent.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "FUND_RECEIVE",
        reason: transfer.reason,
        entries: { create: [{ accountId: transfer.transitAccountId, amountMinor: -amount }, { accountId: transfer.destinationAccountId, amountMinor: amount }] },
      },
    });
    await tx.moneyAccount.update({ where: { id: transfer.transitAccountId }, data: { balanceMinor: { decrement: amount }, version: { increment: 1 } } });
    await tx.moneyAccount.update({ where: { id: transfer.destinationAccountId }, data: { balanceMinor: { increment: amount }, version: { increment: 1 } } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "FUND_RECEIVE",
      referenceType: "fund_transfers",
      referenceId: transfer.id,
      lines: [{ accountCode: "ASSET:TRANSIT", amountMinor: -amount }, { accountCode: "ASSET:FUNDS", amountMinor: amount }],
    });
    const received = transfer.amountReceivedMinor + amount;
    const state = received === transfer.amountSentMinor ? "RECEIVED" : "PARTIAL";
    await tx.fundReceipt.create({ data: { transferId: id, actorId: context.actorId, amountMinor: amount, comment: comment?.trim() || null } });
    await tx.fundTransfer.update({ where: { id }, data: { amountReceivedMinor: received, state, receivedAt: state === "RECEIVED" ? new Date() : transfer.receivedAt } });
    await writeAudit(tx, { actorId: context.actorId, action: "FUND_TRANSFER_RECEIVED", entityType: "fund_transfers", entityId: id, requestId: context.requestId, afterJson: { amountMinor: amount.toString(), state } });
    return { id, state, remainingMinor: (transfer.amountSentMinor - received).toString(), receivedMinor: received.toString() };
  });
}

export async function listFundTransfers(prisma: PrismaClient, organizationId: string, actorId: string, role: string) {
  const assignment = role === "MANAGER" ? await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }) : null;
  const rows = await prisma.fundTransfer.findMany({
    where: { organizationId, ...(assignment ? { shopId: assignment.shopId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { source: { select: { name: true } }, destination: { select: { name: true } }, shop: { select: { name: true } }, receipts: true },
  });
  return rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    state: row.state,
    reason: row.reason,
    shopName: row.shop?.name ?? null,
    source: row.source.name,
    destination: row.destination.name,
    amountSentMinor: row.amountSentMinor.toString(),
    amountReceivedMinor: row.amountReceivedMinor.toString(),
    remainingMinor: (row.amountSentMinor - row.amountReceivedMinor).toString(),
    createdAt: row.createdAt.toISOString(),
    receipts: row.receipts.map((item) => ({ id: item.id, amountMinor: item.amountMinor.toString(), receivedAt: item.receivedAt.toISOString() })),
  }));
}

export async function listDiscrepancies(prisma: PrismaClient, organizationId: string, shopId?: string) {
  if (shopId && !(await prisma.shop.count({ where: { id: shopId, organizationId } }))) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  const rows = await prisma.discrepancyCase.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { shop: { select: { name: true } } },
  });
  const closureIds = rows.filter((row) => row.sourceType === "cash_closures").map((row) => row.sourceId);
  const closures = closureIds.length ? await prisma.cashClosure.findMany({ where: { id: { in: closureIds } }, include: { account: { select: { name: true } } } }) : [];
  const sources = new Map(closures.map((closure) => [closure.id, closure.account.name]));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    state: row.state,
    shopName: row.shop?.name ?? null,
    source: sources.get(row.sourceId) ?? null,
    originalAmountMinor: row.originalAmountMinor.toString(),
    residualAmountMinor: row.residualAmountMinor.toString(),
    expectedMinor: row.expectedMinor?.toString() ?? null,
    declaredMinor: row.declaredMinor?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getDiscrepancy(prisma: PrismaClient, organizationId: string, id: string) {
  const row = await prisma.discrepancyCase.findFirst({
    where: { id, organizationId },
    include: { shop: { select: { name: true } }, actions: { include: { actor: { select: { displayName: true, role: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new DomainError("DISCREPANCY_NOT_FOUND", "Dossier introuvable.", 404);
  const closure = row.sourceType === "cash_closures" ? await prisma.cashClosure.findUnique({ where: { id: row.sourceId }, include: { account: { select: { name: true } } } }) : null;
  return {
    id: row.id,
    type: row.type,
    state: row.state,
    shopName: row.shop?.name ?? null,
    source: closure?.account.name ?? null,
    sessionId: row.sessionId,
    expectedMinor: row.expectedMinor?.toString() ?? null,
    declaredMinor: row.declaredMinor?.toString() ?? null,
    originalAmountMinor: row.originalAmountMinor.toString(),
    residualAmountMinor: row.residualAmountMinor.toString(),
    ownerDecision: row.ownerDecision,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    actions: row.actions.map((action) => ({
      id: action.id,
      type: action.actionType,
      text: action.text,
      actor: action.actor.displayName,
      actorRole: action.actor.role,
      at: action.createdAt.toISOString(),
    })),
  };
}

const MANAGER_VISIBLE_ACTIONS = new Set(["COMMENT", "REQUEST_INFO", "MANAGER_RESPONSE"]);

async function assignedShop(prisma: PrismaClient | Tx, organizationId: string, actorId: string) {
  const assignment = await prisma.managerAssignment.findFirst({
    where: { userId: actorId, endedAt: null, user: { organizationId, status: "ACTIVE" } },
    include: { shop: true },
  });
  if (!assignment || assignment.shop.status !== "ACTIVE") throw new DomainError("SHOP_NOT_ACTIVE", "Votre boutique doit être active.", 409);
  return assignment.shop;
}

function managerDiscrepancyDto(row: {
  id: string;
  state: string;
  shopName: string | null;
  source: string | null;
  declaredMinor: bigint | null;
  originalAmountMinor: bigint;
  businessDate: string | null;
  countedAt: string | null;
  initialObservation: string | null;
  ownerRequest: string | null;
  requestedAt: string | null;
  createdAt: Date;
  actions: Array<{ id: string; type: string; text: string; actor: string; actorRole: string; at: string }>;
  attachments: Array<{ id: string; name: string; scanStatus: string }>;
}) {
  return {
    id: row.id,
    state: row.state,
    shopName: row.shopName,
    source: row.source,
    businessDate: row.businessDate,
    countedAt: row.countedAt,
    declaredMinor: row.declaredMinor?.toString() ?? null,
    varianceMinor: row.originalAmountMinor.toString(),
    initialObservation: row.initialObservation,
    ownerRequest: row.ownerRequest,
    requestedAt: row.requestedAt,
    createdAt: row.createdAt.toISOString(),
    actions: row.actions,
    attachments: row.attachments,
  };
}

export async function listManagerDiscrepancies(prisma: PrismaClient, organizationId: string, actorId: string) {
  const shop = await assignedShop(prisma, organizationId, actorId);
  const rows = await prisma.discrepancyCase.findMany({
    where: { organizationId, shopId: shop.id, state: "NEEDS_INFO" },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      shop: { select: { name: true } },
      session: { select: { businessDate: true } },
      actions: { include: { actor: { select: { displayName: true, role: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const closureIds = rows.filter((row) => row.sourceType === "cash_closures").map((row) => row.sourceId);
  const closures = closureIds.length
    ? await prisma.cashClosure.findMany({ where: { id: { in: closureIds } }, include: { account: { select: { name: true } } } })
    : [];
  const sources = new Map(closures.map((closure) => [closure.id, { name: closure.account.name, countedAt: closure.submittedAt, explanation: closure.explanation }]));
  return rows.map((row) => {
    const closure = sources.get(row.sourceId);
    const request = [...row.actions].reverse().find((action) => action.actionType === "REQUEST_INFO");
    return managerDiscrepancyDto({
      id: row.id,
      state: row.state,
      shopName: row.shop?.name ?? shop.name,
      source: closure?.name ?? null,
      declaredMinor: row.declaredMinor,
      originalAmountMinor: row.originalAmountMinor,
      businessDate: row.session?.businessDate.toISOString().slice(0, 10) ?? null,
      countedAt: closure?.countedAt.toISOString() ?? null,
      initialObservation: closure?.explanation ?? null,
      ownerRequest: request?.text ?? null,
      requestedAt: request?.createdAt.toISOString() ?? row.createdAt.toISOString(),
      createdAt: row.createdAt,
      actions: row.actions
        .filter((action) => MANAGER_VISIBLE_ACTIONS.has(action.actionType))
        .map((action) => ({ id: action.id, type: action.actionType, text: action.text, actor: action.actor.displayName, actorRole: action.actor.role, at: action.createdAt.toISOString() })),
      attachments: [],
    });
  });
}

export async function getManagerDiscrepancy(prisma: PrismaClient, organizationId: string, actorId: string, id: string) {
  const shop = await assignedShop(prisma, organizationId, actorId);
  const row = await prisma.discrepancyCase.findFirst({
    where: { id, organizationId, shopId: shop.id, state: "NEEDS_INFO" },
    include: {
      shop: { select: { name: true } },
      session: { select: { businessDate: true } },
      actions: { include: { actor: { select: { displayName: true, role: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) throw new DomainError("DISCREPANCY_NOT_FOUND", "Dossier introuvable.", 404);
  const closure = row.sourceType === "cash_closures"
    ? await prisma.cashClosure.findUnique({ where: { id: row.sourceId }, include: { account: { select: { name: true } } } })
    : null;
  const attachments = await prisma.attachment.findMany({
    where: { organizationId, ownerDocumentType: "discrepancy_cases", ownerDocumentId: row.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, originalName: true, scanStatus: true },
  });
  const request = [...row.actions].reverse().find((action) => action.actionType === "REQUEST_INFO");
  return managerDiscrepancyDto({
    id: row.id,
    state: row.state,
    shopName: row.shop?.name ?? shop.name,
    source: closure?.account.name ?? null,
    declaredMinor: row.declaredMinor,
    originalAmountMinor: row.originalAmountMinor,
    businessDate: row.session?.businessDate.toISOString().slice(0, 10) ?? null,
    countedAt: closure?.submittedAt.toISOString() ?? null,
    initialObservation: closure?.explanation ?? null,
    ownerRequest: request?.text ?? null,
    requestedAt: request?.createdAt.toISOString() ?? row.createdAt.toISOString(),
    createdAt: row.createdAt,
    actions: row.actions
      .filter((action) => MANAGER_VISIBLE_ACTIONS.has(action.actionType))
      .map((action) => ({ id: action.id, type: action.actionType, text: action.text, actor: action.actor.displayName, actorRole: action.actor.role, at: action.createdAt.toISOString() })),
    attachments: attachments.map((item) => ({ id: item.id, name: item.originalName, scanStatus: item.scanStatus })),
  });
}

export async function respondToDiscrepancy(prisma: PrismaClient, context: CommandContext, id: string, input: { text: string; attachmentIds?: string[] | undefined }) {
  if (context.actorRole !== "MANAGER") throw new DomainError("FORBIDDEN", "Seul le gérant concerné peut répondre.", 403);
  return effect(prisma, context, { action: "respond-discrepancy", id, text: input.text, attachmentIds: input.attachmentIds ?? [] }, async (tx) => {
    const shop = await assignedShop(tx, context.organizationId, context.actorId);
    const locked = await tx.$queryRaw<Array<{ id: string; state: string; shop_id: string | null }>>`
      SELECT id, state, shop_id FROM discrepancy_cases WHERE id=${id}::uuid AND organization_id=${context.organizationId}::uuid FOR UPDATE`;
    const row = locked[0];
    if (!row || row.shop_id !== shop.id || row.state !== "NEEDS_INFO") throw new DomainError("DISCREPANCY_NOT_FOUND", "Ce dossier n’attend plus de réponse.", 404);
    const message = text(input.text, "La réponse", 10, 1000);
    const action = await tx.discrepancyAction.create({ data: { caseId: id, actorId: context.actorId, actionType: "MANAGER_RESPONSE", text: message } });
    if (input.attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: { id: { in: input.attachmentIds }, organizationId: context.organizationId, uploadedById: context.actorId },
        data: { ownerDocumentType: "discrepancy_cases", ownerDocumentId: id },
      });
    }
    await tx.discrepancyCase.update({ where: { id }, data: { state: "OPEN" } });
    await writeAudit(tx, { actorId: context.actorId, action: "DISCREPANCY_MANAGER_RESPONSE", entityType: "discrepancy_cases", entityId: id, requestId: context.requestId, afterJson: { actionId: action.id } });
    return { id, state: "OPEN" as const, actionId: action.id };
  });
}

export async function commentDiscrepancy(prisma: PrismaClient, context: CommandContext, id: string, textValue: string) {
  if (context.actorRole !== "OWNER") throw new DomainError("FORBIDDEN", "Seule la propriétaire peut annoter ce dossier.", 403);
  return effect(prisma, context, { action: "comment-discrepancy", id, text: textValue }, async (tx) => {
    const row = await tx.discrepancyCase.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row) throw new DomainError("DISCREPANCY_NOT_FOUND", "Dossier introuvable.", 404);
    await tx.discrepancyAction.create({ data: { caseId: id, actorId: context.actorId, actionType: "COMMENT", text: text(textValue, "Le commentaire", 3, 1000) } });
    return { id, state: row.state };
  });
}

export async function resolveDiscrepancy(prisma: PrismaClient, context: CommandContext, id: string, input: { decision: "ACCEPT" | "RECLASSIFY" | "ADJUST" | "REQUEST_INFO"; reason: string; amountMinor?: string | undefined }) {
  if (context.actorRole !== "OWNER") throw new DomainError("FORBIDDEN", "Seule la propriétaire peut décider.", 403);
  return effect(prisma, context, { action: "resolve-discrepancy", id, ...input }, async (tx) => {
    const row = await tx.discrepancyCase.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row || row.state === "RESOLVED") throw new DomainError("DISCREPANCY_NOT_FOUND", "Ce dossier n’est pas ouvert.", 409);
    const reason = text(input.reason, "Le motif", 5, 500);
    if (input.decision === "REQUEST_INFO") {
      await tx.discrepancyCase.update({ where: { id }, data: { state: "NEEDS_INFO" } });
      await tx.discrepancyAction.create({ data: { caseId: id, actorId: context.actorId, actionType: "REQUEST_INFO", text: reason } });
      return { id, state: "NEEDS_INFO" };
    }
    if (input.decision === "ACCEPT") {
      await tx.discrepancyCase.update({ where: { id }, data: { state: "RESOLVED", residualAmountMinor: 0n, ownerDecision: "ACCEPT", resolvedAt: new Date(), resolvedById: context.actorId } });
      await tx.discrepancyAction.create({ data: { caseId: id, actorId: context.actorId, actionType: "RESOLVE", text: reason } });
      return { id, state: "RESOLVED", residualAmountMinor: "0" };
    }
    if (input.decision === "RECLASSIFY") {
      const amount = moneyAmount(input.amountMinor ?? "");
      let nextResidual: bigint;
      try {
        nextResidual = reclassifyWithinResidual(row.residualAmountMinor, amount);
      } catch (error) {
        wrap(error);
      }
      await postJournal(tx, {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "COUNT_VARIANCE",
        referenceType: "discrepancy_cases",
        referenceId: id,
        lines: [{ accountCode: "EXPENSE_CLEARING", amountMinor: amount }, { accountCode: "COUNT_VARIANCE", amountMinor: -amount }],
      });
      const state = nextResidual === 0n ? "RESOLVED" : "OPEN";
      await tx.discrepancyCase.update({ where: { id }, data: { residualAmountMinor: nextResidual, state, ownerDecision: "RECLASSIFY", ...(state === "RESOLVED" ? { resolvedAt: new Date(), resolvedById: context.actorId } : {}) } });
      await tx.discrepancyAction.create({ data: { caseId: id, actorId: context.actorId, actionType: "RECLASSIFY", text: reason } });
      return { id, state, residualAmountMinor: nextResidual.toString() };
    }
    const amount = moneyAmount(input.amountMinor ?? "");
    if (!row.shopId) throw new DomainError("SHOP_NOT_FOUND", "Aucune boutique n’est liée à ce dossier.", 409);
    const session = await lockSession(tx, row.shopId);
    if (!session || session.status !== "OPEN") throw new DomainError("CASH_SESSION_REQUIRED", "Ouvrez la session suivante pour enregistrer un ajustement physique.", 409);
    const closure = await tx.cashClosure.findFirst({ where: { id: row.sourceId } });
    if (!closure) throw new DomainError("DISCREPANCY_NOT_FOUND", "La clôture d’origine est introuvable.", 404);
    const signed = row.residualAmountMinor < 0n ? amount : -amount;
    await tx.moneyEvent.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "CORRECTION",
        reason,
        correctionOfId: null,
        entries: { create: { accountId: closure.accountId, amountMinor: signed } },
      },
    });
    await tx.moneyAccount.update({ where: { id: closure.accountId }, data: { balanceMinor: { increment: signed }, version: { increment: 1 } } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "CORRECTION",
      referenceType: "discrepancy_cases",
      referenceId: id,
      lines: [{ accountCode: "ASSET:FUNDS", amountMinor: signed }, { accountCode: "COUNT_VARIANCE", amountMinor: -signed }],
    });
    const nextResidual = row.residualAmountMinor + signed;
    const state = nextResidual === 0n ? "RESOLVED" : "OPEN";
    await tx.discrepancyCase.update({ where: { id }, data: { residualAmountMinor: nextResidual, state, ownerDecision: "ADJUST", ...(state === "RESOLVED" ? { resolvedAt: new Date(), resolvedById: context.actorId } : {}) } });
    await tx.discrepancyAction.create({ data: { caseId: id, actorId: context.actorId, actionType: "ADJUST", text: reason } });
    return { id, state, residualAmountMinor: nextResidual.toString() };
  });
}

export async function createAttachmentIntent(prisma: PrismaClient, context: CommandContext, input: { documentType: string; mime: string; size: number; name: string; sha256: string }) {
  if (!ALLOWED_MIME.has(input.mime)) throw new DomainError("INVALID_FILE_TYPE", "Ce type de fichier n’est pas accepté.", 422);
  if (!Number.isInteger(input.size) || input.size < 32 || input.size > 5_000_000) throw new DomainError("INVALID_FILE_SIZE", "Le fichier dépasse 5 Mo ou est vide.", 422);
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new DomainError("INVALID_FILE_HASH", "L’empreinte du fichier est invalide.", 422);
  const id = crypto.randomUUID();
  const key = `attachments/${context.organizationId}/${id}`;
  await prisma.attachment.create({
    data: {
      id,
      organizationId: context.organizationId,
      ownerDocumentType: input.documentType,
      storageKey: key,
      originalName: text(input.name, "Le nom du fichier", 2, 180),
      mime: input.mime,
      size: input.size,
      sha256: input.sha256.toLowerCase(),
      uploadedById: context.actorId,
      scanStatus: "PENDING",
    },
  });
  return { id, storageKey: key };
}

export async function completeAttachment(prisma: PrismaClient, context: CommandContext, id: string, bytes: Uint8Array) {
  const attachment = await prisma.attachment.findFirst({ where: { id, organizationId: context.organizationId, uploadedById: context.actorId } });
  if (!attachment) throw new DomainError("ATTACHMENT_NOT_FOUND", "Justificatif introuvable.", 404);
  if (bytes.length !== attachment.size) throw new DomainError("FILE_SIZE_MISMATCH", "La taille du fichier ne correspond pas à l’intention.", 422);
  const mime = sniffMime(bytes);
  if (mime !== attachment.mime) throw new DomainError("FILE_TYPE_MISMATCH", "Le contenu réel du fichier ne correspond pas au type déclaré.", 422);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== attachment.sha256) throw new DomainError("FILE_HASH_MISMATCH", "L’empreinte du fichier ne correspond pas.", 422);
  const scan = await scanAttachmentBytes(bytes);
  await prisma.attachment.update({ where: { id }, data: { scanStatus: scan.status, scanEngine: scan.engine, scannedAt: new Date() } });
  await writeAudit(prisma, { actorId: context.actorId, action: "ATTACHMENT_SCANNED", entityType: "attachments", entityId: id, requestId: context.requestId, afterJson: { scanStatus: scan.status, engine: scan.engine } });
  return { id, scanStatus: scan.status, engine: scan.engine };
}

export async function getAttachmentForDownload(prisma: PrismaClient, organizationId: string, actorId: string, role: string, id: string) {
  const attachment = await prisma.attachment.findFirst({ where: { id, organizationId } });
  if (!attachment) throw new DomainError("ATTACHMENT_NOT_FOUND", "Justificatif introuvable.", 404);
  if (attachment.scanStatus !== "CLEAN") throw new DomainError("ATTACHMENT_QUARANTINED", "Ce fichier n’est pas encore disponible.", 403);
  if (role === "MANAGER") {
    const assignment = await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } });
    if (!assignment) throw new DomainError("ATTACHMENT_NOT_FOUND", "Justificatif introuvable.", 404);
    if (attachment.ownerDocumentType === "expenses" && attachment.ownerDocumentId) {
      const expense = await prisma.expense.findFirst({ where: { id: attachment.ownerDocumentId, shopId: assignment.shopId } });
      if (!expense) throw new DomainError("ATTACHMENT_NOT_FOUND", "Justificatif introuvable.", 404);
    }
  }
  await writeAudit(prisma, { actorId, action: "ATTACHMENT_DOWNLOADED", entityType: "attachments", entityId: id, requestId: crypto.randomUUID(), afterJson: { scanStatus: attachment.scanStatus } });
  return attachment;
}
