import type { PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError } from "./errors.js";
import type { CommandContext } from "./p03.js";
import { effect, type RoleContext, type Tx } from "./p06-common.js";
import {
  allocateCustomerPreview,
  assertTradingAllowed,
  canonicalJson,
  isOwner,
  managerActingShop,
  money,
  moveFunds,
  policyValues,
  postJournal,
  requireOwner,
  saleDue,
  sha256Hex,
  text,
} from "./p07-common.js";

function normalizePhone(phone: string) {
  return phone.replace(/\D+/g, "");
}

async function shopOf(tx: Tx, context: RoleContext, shopId?: string) {
  if (isOwner(context)) {
    if (!shopId) throw new DomainError("SHOP_REQUIRED", "Indiquez la boutique.", 422);
    const shop = await tx.shop.findFirst({ where: { id: shopId, organizationId: context.organizationId } });
    if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    return shop;
  }
  return managerActingShop(tx, context.organizationId, context.actorId, { allowSettlement: true });
}

export async function createCustomer(prisma: PrismaClient, context: RoleContext, input: {
  shopId?: string | undefined;
  name: string;
  phone: string;
  creditLimitMinor?: string | undefined;
  notes?: string | undefined;
}) {
  return effect(prisma, context, { action: "create-customer", ...input }, async (tx) => {
    const shop = await shopOf(tx, context, input.shopId);
    const name = text(input.name, "Le nom", 2, 160);
    const phone = text(input.phone, "Le téléphone", 6, 32);
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 6) throw new DomainError("INVALID_PHONE", "Le téléphone est invalide.", 422);
    const limit = input.creditLimitMinor ? money(input.creditLimitMinor, "Le plafond") : 0n;
    if (!isOwner(context) && limit > 0n) throw new DomainError("FORBIDDEN", "Seul le propriétaire fixe un plafond.", 403);
    const duplicate = await tx.customer.findFirst({ where: { shopId: shop.id, normalizedPhone, status: "ACTIVE" } });
    const created = await tx.customer.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop.id,
        name,
        phone,
        normalizedPhone,
        creditLimitMinor: limit,
        notes: input.notes?.trim() || null,
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_CREATED", entityType: "customers", entityId: created.id, requestId: context.requestId, afterJson: { name, shopId: shop.id } });
    return { id: created.id, name, phone, duplicateWarning: duplicate ? "Un client de cette boutique a déjà ce téléphone." : null };
  });
}

export async function updateCustomer(prisma: PrismaClient, context: RoleContext, id: string, input: {
  name?: string | undefined;
  phone?: string | undefined;
  creditLimitMinor?: string | undefined;
  status?: "ACTIVE" | "INACTIVE" | undefined;
  notes?: string | undefined;
}) {
  return effect(prisma, context, { action: "update-customer", id, ...input }, async (tx) => {
    const shop = await shopOf(tx, context);
    const customer = await tx.customer.findFirst({ where: { id, organizationId: context.organizationId, ...(isOwner(context) ? {} : { shopId: shop.id }) } });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    if (input.creditLimitMinor !== undefined && !isOwner(context)) throw new DomainError("FORBIDDEN", "Seul le propriétaire fixe un plafond.", 403);
    const data = {
      ...(input.name ? { name: text(input.name, "Le nom", 2, 160) } : {}),
      ...(input.phone ? { phone: text(input.phone, "Le téléphone", 6, 32), normalizedPhone: normalizePhone(input.phone) } : {}),
      ...(input.creditLimitMinor !== undefined ? { creditLimitMinor: money(input.creditLimitMinor, "Le plafond") } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
    };
    await tx.customer.update({ where: { id }, data });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_UPDATED", entityType: "customers", entityId: id, requestId: context.requestId, afterJson: { id, status: input.status ?? customer.status } });
    return { id, status: input.status ?? customer.status };
  });
}

export async function listCustomers(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, query?: { shopId?: string; search?: string }) {
  const shopId = actorRole === "OWNER" ? query?.shopId : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  if (actorRole !== "OWNER" && !shopId) throw new DomainError("SHOP_NOT_ACTIVE", "Aucune boutique d’affectation.", 409);
  const search = query?.search?.trim();
  const rows = await prisma.customer.findMany({
    where: {
      organizationId,
      ...(shopId ? { shopId } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] } : {}),
    },
    orderBy: { name: "asc" },
    take: 100,
    include: { receivables: { where: { remainingMinor: { gt: 0 } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    shopId: row.shopId,
    name: row.name,
    phone: row.phone,
    status: row.status,
    creditLimitMinor: row.creditLimitMinor.toString(),
    openMinor: row.receivables.reduce((sum, item) => sum + item.remainingMinor, 0n).toString(),
    overdue: row.receivables.some((item) => item.dueDate && item.dueDate < new Date() && item.remainingMinor > 0n),
  }));
}

export async function getCustomer(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, id: string) {
  const shopId = actorRole === "OWNER" ? undefined : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId, ...(shopId ? { shopId } : {}) },
    include: {
      sales: { orderBy: { postedAt: "desc" }, take: 50, select: { id: true, reference: true, netMinor: true, paidMinor: true, dueDate: true, postedAt: true } },
      receivables: { where: { remainingMinor: { gt: 0 } }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { postedAt: "desc" }, take: 50 },
    },
  });
  if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
  return {
    id: customer.id,
    shopId: customer.shopId,
    name: customer.name,
    phone: customer.phone,
    status: customer.status,
    creditLimitMinor: customer.creditLimitMinor.toString(),
    notes: customer.notes,
    openMinor: customer.receivables.reduce((sum, item) => sum + item.remainingMinor, 0n).toString(),
    receivables: customer.receivables.map((item) => ({
      id: item.id,
      originType: item.originType,
      originId: item.originId,
      originalMinor: item.originalMinor.toString(),
      remainingMinor: item.remainingMinor.toString(),
      dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
      overdue: Boolean(item.dueDate && item.dueDate < new Date() && item.remainingMinor > 0n),
    })),
    sales: customer.sales.map((sale) => ({
      id: sale.id,
      reference: sale.reference,
      netMinor: sale.netMinor.toString(),
      paidMinor: sale.paidMinor.toString(),
      dueDate: sale.dueDate?.toISOString().slice(0, 10) ?? null,
      postedAt: sale.postedAt.toISOString(),
    })),
    payments: customer.payments.map((payment) => ({ id: payment.id, amountMinor: payment.amountMinor.toString(), postedAt: payment.postedAt.toISOString() })),
  };
}

export async function getCustomerPaymentContext(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, customerId: string) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId } });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    if (actorRole !== "OWNER") {
      const shop = await managerActingShop(tx, organizationId, actorId, { allowSettlement: true });
      if (shop.id !== customer.shopId) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    }
    const accounts = await tx.moneyAccount.findMany({
      where: {
        organizationId,
        paymentSource: { status: "ACTIVE" },
        ...(actorRole === "OWNER" ? { OR: [{ shopId: customer.shopId }, { shopId: null }] } : { shopId: customer.shopId }),
      },
      include: { paymentSource: true },
      orderBy: [{ shopId: "desc" }, { name: "asc" }],
    });
    return {
      shopId: customer.shopId,
      accounts: accounts.map((account) => ({ id: account.id, name: account.name, type: account.paymentSource.type, shopId: account.shopId })),
    };
  });
}

export async function authorizeCreditException(prisma: PrismaClient, context: RoleContext, input: {
  shopId: string;
  customerId: string;
  payloadHash: string;
  maxDueMinor: string;
  reason: string;
  expiresInSeconds?: number | undefined;
}) {
  requireOwner(context);
  return effect(prisma, context, { action: "authorize-credit", ...input }, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, shopId: input.shopId, organizationId: context.organizationId } });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    const created = await tx.creditAuthorization.create({
      data: {
        organizationId: context.organizationId,
        shopId: input.shopId,
        customerId: input.customerId,
        actorId: context.actorId,
        payloadHash: text(input.payloadHash, "Le devis", 16, 128),
        maxDueMinor: money(input.maxDueMinor, "Le plafond autorisé"),
        reason: text(input.reason, "Le motif", 3, 500),
        expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 120) * 1000),
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CREDIT_AUTHORIZED", entityType: "credit_authorizations", entityId: created.id, requestId: context.requestId, afterJson: { customerId: input.customerId, maxDueMinor: input.maxDueMinor } });
    return { id: created.id, expiresAt: created.expiresAt.toISOString() };
  });
}

export async function previewCustomerPayment(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, input: { customerId: string; amountMinor: string }) {
  const amount = money(input.amountMinor, "Le règlement");
  if (amount <= 0n) throw new DomainError("INVALID_MONEY", "Le règlement doit être strictement positif.", 422);
  return prisma.$transaction(async (tx) => {
    const shop = actorRole === "OWNER"
      ? (await tx.customer.findFirst({ where: { id: input.customerId, organizationId } }))?.shopId
      : (await managerActingShop(tx, organizationId, actorId, { allowSettlement: true })).id;
    if (!shop) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId, shopId: shop } });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    return allocateCustomerPreview(tx, shop, customer.id, amount);
  });
}

export async function collectCustomerPayment(prisma: PrismaClient, context: RoleContext, input: {
  customerId: string;
  accountId: string;
  amountMinor: string;
  previewHash: string;
}) {
  return effect(prisma, context, { action: "collect-customer", ...input }, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId: context.organizationId } });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    const shop = isOwner(context)
      ? await tx.shop.findFirstOrThrow({ where: { id: customer.shopId, organizationId: context.organizationId } })
      : await managerActingShop(tx, context.organizationId, context.actorId, { allowSettlement: true });
    if (!isOwner(context) && shop.id !== customer.shopId) throw new DomainError("FORBIDDEN", "Ce client n’appartient pas à votre boutique.", 403);
    if (shop.status === "SUSPENDED" && shop.suspensionMode === "SECURITY") throw new DomainError("SHOP_SECURITY_HOLD", "La boutique est bloquée pour reprise propriétaire.", 409);
    const amount = money(input.amountMinor, "Le règlement");
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM receivables WHERE shop_id=${shop.id}::uuid AND customer_id=${input.customerId}::uuid AND remaining_minor>0 ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC FOR UPDATE`;
    const preview = await allocateCustomerPreview(tx, shop.id, input.customerId, amount);
    if (preview.previewHash !== input.previewHash) throw new DomainError("ALLOCATION_CHANGED", "Les soldes ont changé. Demandez un nouvel aperçu.", 409);
    void locked;
    const moved = await moveFunds(tx, context, {
      accountId: input.accountId,
      amount,
      direction: "IN",
      type: "CUSTOMER_COLLECTION",
      reason: "Encaissement de créance",
      shopId: shop.id,
    });
    const payment = await tx.customerPayment.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop.id,
        customerId: input.customerId,
        accountId: input.accountId,
        sessionId: moved.sessionId,
        actorId: context.actorId,
        amountMinor: amount,
        previewHash: input.previewHash,
      },
    });
    for (const line of preview.allocations) {
      const take = money(line.amountMinor);
      await tx.customerPaymentAllocation.create({ data: { paymentId: payment.id, receivableId: line.receivableId, amountMinor: take } });
      const receivable = await tx.receivable.findUniqueOrThrow({ where: { id: line.receivableId } });
      await tx.receivable.update({ where: { id: line.receivableId }, data: { remainingMinor: receivable.remainingMinor - take, version: { increment: 1 } } });
      if (receivable.saleId) {
        const sale = await tx.sale.findUniqueOrThrow({ where: { id: receivable.saleId } });
        await tx.sale.update({ where: { id: sale.id }, data: { paidMinor: sale.paidMinor + take } });
      }
    }
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "CUSTOMER_COLLECTION",
      referenceType: "customer_payments",
      referenceId: payment.id,
      lines: [{ accountCode: "ASSET:FUNDS", amountMinor: amount }, { accountCode: "ASSET:RECEIVABLE", amountMinor: -amount }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_PAYMENT_POSTED", entityType: "customer_payments", entityId: payment.id, requestId: context.requestId, afterJson: { amountMinor: amount.toString(), customerId: input.customerId } });
    return { id: payment.id, amountMinor: amount.toString(), allocations: preview.allocations };
  });
}

export async function writeOffReceivable(prisma: PrismaClient, context: RoleContext, input: { receivableId: string; amountMinor: string; reason: string }) {
  requireOwner(context);
  return effect(prisma, context, { action: "write-off", ...input }, async (tx) => {
    const amount = money(input.amountMinor, "L’abandon");
    if (amount <= 0n) throw new DomainError("INVALID_MONEY", "L’abandon doit être strictement positif.", 422);
    const rows = await tx.$queryRaw<Array<{ id: string; remaining_minor: bigint; sale_id: string | null }>>`
      SELECT id, remaining_minor, sale_id FROM receivables WHERE id=${input.receivableId}::uuid AND organization_id=${context.organizationId}::uuid FOR UPDATE`;
    const receivable = rows[0];
    if (!receivable) throw new DomainError("RECEIVABLE_NOT_FOUND", "Créance introuvable.", 404);
    if (amount > receivable.remaining_minor) throw new DomainError("WRITE_OFF_EXCEEDS_DUE", "L’abandon dépasse le solde restant.", 422);
    await tx.receivable.update({ where: { id: receivable.id }, data: { remainingMinor: receivable.remaining_minor - amount, version: { increment: 1 } } });
    if (receivable.sale_id) {
      await tx.sale.update({ where: { id: receivable.sale_id }, data: { writeOffMinor: { increment: amount } } });
    }
    const adjustment = await tx.debtAdjustment.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        receivableId: receivable.id,
        type: "WRITE_OFF",
        amountMinor: amount,
        reason: text(input.reason, "Le motif", 3, 500),
      },
    });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "WRITE_OFF",
      referenceType: "debt_adjustments",
      referenceId: adjustment.id,
      lines: [{ accountCode: "EXPENSE:WRITE_OFF", amountMinor: amount }, { accountCode: "ASSET:RECEIVABLE", amountMinor: -amount }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "RECEIVABLE_WRITTEN_OFF", entityType: "debt_adjustments", entityId: adjustment.id, requestId: context.requestId, afterJson: { amountMinor: amount.toString() } });
    return { id: adjustment.id, remainingMinor: (receivable.remaining_minor - amount).toString() };
  });
}

export async function createOpeningReceivable(prisma: PrismaClient, context: RoleContext, input: {
  shopId: string;
  customerId: string;
  amountMinor: string;
  dueDate?: string | undefined;
  reason: string;
}) {
  requireOwner(context);
  return effect(prisma, context, { action: "opening-receivable", ...input }, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, shopId: input.shopId, organizationId: context.organizationId } });
    if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable.", 404);
    const amount = money(input.amountMinor, "La créance d’ouverture");
    if (amount <= 0n) throw new DomainError("INVALID_MONEY", "Le montant doit être strictement positif.", 422);
    const id = crypto.randomUUID();
    await tx.receivable.create({
      data: {
        id,
        organizationId: context.organizationId,
        shopId: input.shopId,
        partyType: "CUSTOMER",
        customerId: customer.id,
        originType: "OPENING",
        originId: id,
        originalMinor: amount,
        remainingMinor: amount,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
      },
    });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "OPENING_RECEIVABLE",
      referenceType: "receivables",
      referenceId: id,
      lines: [{ accountCode: "ASSET:RECEIVABLE", amountMinor: amount }, { accountCode: "EQUITY:OPENING_OBLIGATIONS", amountMinor: -amount }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "OPENING_RECEIVABLE_CREATED", entityType: "receivables", entityId: id, requestId: context.requestId, afterJson: { amountMinor: amount.toString(), reason: text(input.reason, "Le motif", 3, 500) } });
    return { id, remainingMinor: amount.toString() };
  });
}

export async function listReceivables(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, query?: { shopId?: string; overdue?: boolean }) {
  const shopId = actorRole === "OWNER" ? query?.shopId : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const rows = await prisma.receivable.findMany({
    where: {
      organizationId,
      partyType: "CUSTOMER",
      remainingMinor: { gt: 0 },
      ...(shopId ? { shopId } : {}),
      ...(query?.overdue ? { dueDate: { lt: new Date() } } : {}),
    },
    include: { customer: { select: { id: true, name: true, phone: true } }, shop: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    shop: row.shop.name,
    customer: row.customer ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone } : null,
    originType: row.originType,
    originalMinor: row.originalMinor.toString(),
    remainingMinor: row.remainingMinor.toString(),
    dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
    overdue: Boolean(row.dueDate && row.dueDate < new Date()),
  }));
}

export async function previewSupplierPayment(prisma: PrismaClient, organizationId: string, id: string, amountMinor: string) {
  const purchase = await prisma.purchase.findFirst({ where: { id, organizationId } });
  if (!purchase) throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
  const due = purchase.goodsMinor + purchase.supplierFeesMinor - purchase.paidMinor;
  const amount = money(amountMinor, "Le règlement");
  if (amount <= 0n || amount > due) throw new DomainError("PAYMENT_EXCEEDS_DUE", "Le paiement dépasse le montant encore dû.", 422);
  return {
    purchaseId: id,
    dueMinor: due.toString(),
    amountMinor: amount.toString(),
    remainingAfterMinor: (due - amount).toString(),
    previewHash: await sha256Hex(canonicalJson({ purchaseId: id, due: due.toString(), amount: amount.toString() })),
  };
}

export async function enforceCreditOnSale(tx: Tx, context: CommandContext, input: {
  shopId: string;
  net: bigint;
  paid: bigint;
  customerId?: string | undefined;
  dueDate?: string | undefined;
  creditAuthorizationId?: string | undefined;
  quoteHash: string;
}) {
  const due = input.net - input.paid;
  if (due < 0n) throw new DomainError("PAYMENT_TOTAL_MISMATCH", "La somme des paiements dépasse le total de la vente.", 422);
  if (due === 0n) {
    return { customerId: input.customerId ?? null, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null, authorizationId: null as string | null };
  }
  await assertTradingAllowed(tx, input.shopId);
  const policy = await policyValues(tx, context.organizationId, input.shopId);
  if (!policy.creditEnabled) throw new DomainError("CREDIT_DISABLED", "Le crédit client est désactivé. Les créances existantes restent réglables.", 409);
  if (!input.customerId) throw new DomainError("CUSTOMER_REQUIRED", "Un client est obligatoire pour une vente à crédit.", 422);
  if (!input.dueDate) throw new DomainError("DUE_DATE_REQUIRED", "Une échéance est obligatoire pour le crédit.", 422);
  const customer = await tx.customer.findFirst({ where: { id: input.customerId, shopId: input.shopId, organizationId: context.organizationId, status: "ACTIVE" } });
  if (!customer) throw new DomainError("CUSTOMER_NOT_FOUND", "Client introuvable dans cette boutique.", 404);
  const overdue = await tx.receivable.count({ where: { customerId: customer.id, remainingMinor: { gt: 0 }, dueDate: { lt: new Date() } } });
  let authorizationId: string | null = null;
  if (overdue > 0) {
    if (!input.creditAuthorizationId) throw new DomainError("CUSTOMER_OVERDUE", "Ce client a une créance en retard. Une autorisation propriétaire est requise.", 409);
  }
  const open = await tx.receivable.aggregate({ where: { customerId: customer.id, remainingMinor: { gt: 0 } }, _sum: { remainingMinor: true } });
  const projected = (open._sum.remainingMinor ?? 0n) + due;
  if (customer.creditLimitMinor > 0n && projected > customer.creditLimitMinor) {
    if (!input.creditAuthorizationId) throw new DomainError("CREDIT_LIMIT_EXCEEDED", "Le plafond de crédit de ce client est dépassé.", 409);
  }
  if (input.creditAuthorizationId) {
    const auth = await tx.creditAuthorization.findFirst({ where: { id: input.creditAuthorizationId, shopId: input.shopId, customerId: customer.id } });
    if (!auth || auth.expiresAt <= new Date() || auth.consumedSaleId || auth.payloadHash !== input.quoteHash) {
      throw new DomainError("CREDIT_AUTHORIZATION_INVALID", "L’autorisation ne correspond plus à ce devis.", 409);
    }
    if (due > auth.maxDueMinor) throw new DomainError("CREDIT_AUTHORIZATION_INVALID", "L’autorisation ne couvre pas ce montant dû.", 409);
    authorizationId = auth.id;
  }
  return { customerId: customer.id, dueDate: new Date(`${input.dueDate}T00:00:00.000Z`), authorizationId };
}

export async function postSaleReceivable(tx: Tx, input: {
  organizationId: string;
  shopId: string;
  saleId: string;
  customerId: string;
  due: bigint;
  dueDate: Date;
}) {
  await tx.receivable.create({
    data: {
      organizationId: input.organizationId,
      shopId: input.shopId,
      partyType: "CUSTOMER",
      customerId: input.customerId,
      originType: "SALE",
      originId: input.saleId,
      saleId: input.saleId,
      originalMinor: input.due,
      remainingMinor: input.due,
      dueDate: input.dueDate,
    },
  });
}

export { saleDue };
export type { CommandContext };
