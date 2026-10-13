import { canonicalJson, sha256Hex } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";

import { DomainError } from "./errors.js";
import { lockSession, money, postJournal, text, type RoleContext, type Tx } from "./p06-common.js";

export function isOwner(context: RoleContext) {
  return context.actorRole === "OWNER";
}

export function requireOwner(context: RoleContext) {
  if (!isOwner(context)) throw new DomainError("FORBIDDEN", "Réservé au propriétaire.", 403);
}

export async function policyValues(tx: Tx, organizationId: string, shopId: string | null) {
  const policy = await tx.policy.findFirst({
    where: { organizationId, OR: shopId ? [{ shopId }, { shopId: null }] : [{ shopId: null }], effectiveAt: { lte: new Date() } },
    orderBy: [{ shopId: "desc" }, { effectiveAt: "desc" }],
  });
  const values = policy?.values && typeof policy.values === "object" && !Array.isArray(policy.values) ? policy.values as Record<string, unknown> : {};
  return {
    creditEnabled: values.creditEnabled === true,
    supplierCreditEnabled: values.supplierCreditEnabled === true,
    customerDueDays: typeof values.customerDueDays === "number" ? values.customerDueDays : 30,
    defaultCustomerLimitMinor: typeof values.defaultCustomerLimitMinor === "number" ? BigInt(values.defaultCustomerLimitMinor) : 0n,
  };
}

export async function managerActingShop(tx: Tx, organizationId: string, actorId: string, opts?: { allowSettlement?: boolean }) {
  const assignment = await tx.managerAssignment.findFirst({
    where: { userId: actorId, endedAt: null, user: { organizationId, status: "ACTIVE" } },
    include: { shop: true },
  });
  if (!assignment) throw new DomainError("SHOP_NOT_ACTIVE", "Votre boutique doit être active.", 409);
  const shop = assignment.shop;
  if (shop.status === "ACTIVE") return shop;
  if (opts?.allowSettlement && shop.status === "SUSPENDED" && shop.suspensionMode === "SETTLEMENT") return shop;
  throw new DomainError("SHOP_NOT_ACTIVE", "Votre boutique n’autorise pas cette opération.", 409);
}

export async function assertNoInventoryLock(tx: Tx, shopId: string) {
  const open = await tx.stockCount.count({ where: { shopId, status: { in: ["COUNTING", "SUBMITTED", "RECOUNT_REQUESTED"] } } });
  if (open > 0) throw new DomainError("INVENTORY_LOCK", "Un inventaire est en cours. Les ventes sont suspendues.", 409);
}

export async function assertTradingAllowed(tx: Tx, shopId: string) {
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId } });
  if (shop.status === "CLOSED") throw new DomainError("SHOP_CLOSED", "Cette boutique est fermée.", 409);
  if (shop.status === "SUSPENDED") {
    if (shop.suspensionMode === "SECURITY") throw new DomainError("SHOP_SECURITY_HOLD", "La boutique est bloquée pour reprise propriétaire.", 409);
    throw new DomainError("SHOP_SETTLEMENT_ONLY", "Seuls les règlements et corrections sont autorisés.", 409);
  }
  await assertNoInventoryLock(tx, shopId);
}

export async function moveFunds(tx: Tx, context: RoleContext, input: {
  accountId: string;
  amount: bigint;
  direction: "IN" | "OUT";
  type: string;
  reason: string;
  shopId: string | null;
  requireCashSession?: boolean;
}) {
  const accounts = await tx.$queryRaw<Array<{ id: string; balance_minor: bigint; shop_id: string | null; type: string }>>`
    SELECT ma.id, ma.balance_minor, ma.shop_id, ps.type FROM money_accounts ma JOIN payment_sources ps ON ps.id=ma.payment_source_id
    WHERE ma.id=${input.accountId}::uuid AND ma.organization_id=${context.organizationId}::uuid FOR UPDATE`;
  const account = accounts[0];
  if (!account) throw new DomainError("ACCOUNT_NOT_FOUND", "Source de fonds introuvable.", 404);
  if (!isOwner(context) && !account.shop_id) throw new DomainError("FORBIDDEN_FUND_SOURCE", "Cette source n’est pas autorisée pour la boutique.", 403);
  if (input.shopId && account.shop_id && account.shop_id !== input.shopId) throw new DomainError("FORBIDDEN_FUND_SOURCE", "Cette source n’appartient pas à la boutique concernée.", 403);
  let sessionId: string | null = null;
  if (account.shop_id) {
    const session = await lockSession(tx, account.shop_id);
    if (session?.status === "COUNTING") throw new DomainError("COUNT_IN_PROGRESS", "Terminez le comptage avant un mouvement de caisse.", 409);
    if ((account.type === "CASH" || input.requireCashSession) && (!session || session.status !== "OPEN")) {
      throw new DomainError("CASH_SESSION_REQUIRED", "Ouvrez la session de caisse pour ce mouvement en espèces.", 409);
    }
    sessionId = session?.id ?? null;
  }
  if (input.direction === "OUT" && account.balance_minor < input.amount) {
    throw new DomainError("INSUFFICIENT_FUNDS", "Le solde de la source est insuffisant.", 409);
  }
  const signed = input.direction === "IN" ? input.amount : -input.amount;
  await tx.moneyEvent.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: input.type,
      reason: input.reason,
      entries: { create: { accountId: input.accountId, amountMinor: signed } },
    },
  });
  await tx.moneyAccount.update({
    where: { id: input.accountId },
    data: { balanceMinor: { increment: signed }, version: { increment: 1 } },
  });
  return { sessionId, type: account.type, shopId: account.shop_id };
}

export function saleDue(sale: { netMinor: bigint; paidMinor: bigint; creditReductionMinor: bigint; writeOffMinor: bigint }) {
  const due = sale.netMinor - sale.paidMinor - sale.creditReductionMinor - sale.writeOffMinor;
  if (due < 0n) throw new DomainError("NEGATIVE_RECEIVABLE", "La créance ne peut pas devenir négative.", 500);
  return due;
}

export async function allocateCustomerPreview(tx: Tx, shopId: string, customerId: string, amount: bigint) {
  const rows = await tx.receivable.findMany({
    where: { shopId, customerId, remainingMinor: { gt: 0 }, partyType: "CUSTOMER" },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  let remaining = amount;
  const allocations: Array<{ receivableId: string; originType: string; originId: string; amountMinor: string; dueDate: string | null }> = [];
  for (const row of rows) {
    if (remaining <= 0n) break;
    const take = row.remainingMinor < remaining ? row.remainingMinor : remaining;
    allocations.push({
      receivableId: row.id,
      originType: row.originType,
      originId: row.originId,
      amountMinor: take.toString(),
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    });
    remaining -= take;
  }
  if (remaining > 0n) throw new DomainError("PAYMENT_EXCEEDS_DUE", "Le règlement dépasse les créances ouvertes.", 422);
  const previewHash = await sha256Hex(canonicalJson({
    customerId,
    amount: amount.toString(),
    balances: rows.map((row) => ({ id: row.id, remaining: row.remainingMinor.toString(), version: row.version })),
    allocations,
  }));
  return { allocations, previewHash, amountMinor: amount.toString() };
}

export { money, postJournal, text, sha256Hex, canonicalJson };
export type { PrismaClient };
