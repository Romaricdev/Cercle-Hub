import type { Prisma, PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError } from "./errors.js";
import type { CommandContext } from "./p03.js";
import {
  applyAvailable,
  bindAttachments,
  decimal,
  effect,
  lockSession,
  managerShop,
  money,
  multiplyPriceByQuantity,
  normalizeSupplierName,
  postJournal,
  reference,
  resolveUnit,
  scaledQty,
  takeRemainingValue,
  text,
  toScaled,
  unitCostOf,
  type RoleContext,
  type Tx,
} from "./p06-common.js";
import { allocateFees } from "./p06-common.js";

const REQUEST_INCLUDE = {
  shop: { select: { id: true, name: true } },
  actor: { select: { id: true, displayName: true } },
  suggestedSupplier: { select: { id: true, name: true, tradeName: true, phone: true, status: true } },
  lines: { include: { variant: { include: { product: true } }, unit: true }, orderBy: { sort: "asc" as const } },
  actions: { include: { actor: { select: { displayName: true, role: true } } }, orderBy: { createdAt: "asc" as const } },
  approvals: { include: { lines: true, actor: { select: { displayName: true } } }, orderBy: { createdAt: "desc" as const } },
} as const;

export type RequestLineInput = { variantId: string; unitId: string; quantity: string; estimatedUnitMinor?: string | undefined };
export type DecisionLineInput = { requestLineId: string; maxQtyBase: string; maxAmountMinor: string };
export type PurchaseLineInput = { variantId: string; unitId: string; quantity: string; unitPriceMinor: string };
export type DestinationInput = { purchaseLineIndex: number; locationId: string; quantity: string };
export type FeeInput = { kind: "SUPPLIER" | "EXTERNAL"; amountMinor: string; accountId?: string | undefined; description: string };
export type PaymentInput = { accountId: string; amountMinor: string };
export type ReceiptLineInput = {
  shipmentLineId: string;
  acceptedQty: string;
  damagedQty?: string | undefined;
  surplusQty?: string | undefined;
  lotCode?: string | undefined;
  expiresOn?: string | undefined;
  remarks?: string | undefined;
};

function isOwner(context: RoleContext) {
  return context.actorRole === "OWNER";
}

async function requireOwner(context: RoleContext) {
  if (!isOwner(context)) throw new DomainError("FORBIDDEN", "Réservé au propriétaire.", 403);
}

function supplierDto(row: {
  id: string;
  name: string;
  tradeName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  contactName: string | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}, role: string) {
  const base = {
    id: row.id,
    name: row.name,
    tradeName: row.tradeName,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (role !== "OWNER") return base;
  return {
    ...base,
    email: row.email,
    address: row.address,
    taxId: row.taxId,
    contactName: row.contactName,
    paymentTerms: row.paymentTerms,
    leadTimeDays: row.leadTimeDays,
    notes: row.notes,
  };
}

export async function listSuppliers(prisma: PrismaClient, organizationId: string, role: string, query?: string, status?: string) {
  const rows = await prisma.supplier.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { tradeName: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] } : {}),
    },
    orderBy: { name: "asc" },
    take: 100,
  });
  return rows.map((row) => supplierDto(row, role));
}

export async function getSupplier(prisma: PrismaClient, organizationId: string, role: string, id: string) {
  const row = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!row) throw new DomainError("SUPPLIER_NOT_FOUND", "Fournisseur introuvable.", 404);
  const purchases = await prisma.purchase.findMany({
    where: { supplierId: id, organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, reference: true, status: true, goodsMinor: true, paidMinor: true, createdAt: true, shop: { select: { name: true } } },
  });
  return {
    supplier: supplierDto(row, role),
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      reference: purchase.reference,
      status: purchase.status,
      shopName: purchase.shop?.name ?? null,
      goodsMinor: role === "OWNER" ? purchase.goodsMinor.toString() : undefined,
      paidMinor: role === "OWNER" ? purchase.paidMinor.toString() : undefined,
      createdAt: purchase.createdAt.toISOString(),
    })),
  };
}

export async function createSupplier(prisma: PrismaClient, context: RoleContext, input: {
  name: string;
  tradeName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  taxId?: string | undefined;
  contactName?: string | undefined;
  paymentTerms?: string | undefined;
  leadTimeDays?: number | undefined;
  notes?: string | undefined;
}) {
  if (!isOwner(context) && (input.taxId || input.notes || input.paymentTerms || input.email)) {
    throw new DomainError("FORBIDDEN", "Ces informations fournisseur sont réservées au propriétaire.", 403);
  }
  return effect(prisma, context, { action: "create-supplier", ...input }, async (tx) => {
    const name = text(input.name, "Le nom du fournisseur", 2, 160);
    const normalizedName = normalizeSupplierName(name);
    const phone = input.phone?.trim() || null;
    const duplicate = await tx.supplier.findFirst({
      where: { organizationId: context.organizationId, normalizedName, phone },
    });
    if (duplicate && (duplicate.phone ?? null) === phone) {
      throw new DomainError("SUPPLIER_DUPLICATE", "Un fournisseur identique existe déjà.", 409);
    }
    const created = await tx.supplier.create({
      data: {
        organizationId: context.organizationId,
        name,
        tradeName: input.tradeName?.trim() || null,
        phone,
        email: isOwner(context) ? input.email?.trim() || null : null,
        address: input.address?.trim() || null,
        taxId: isOwner(context) ? input.taxId?.trim() || null : null,
        contactName: input.contactName?.trim() || null,
        paymentTerms: isOwner(context) ? input.paymentTerms?.trim() || null : null,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: isOwner(context) ? input.notes?.trim() || null : null,
        normalizedName,
        createdById: context.actorId,
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "SUPPLIER_CREATED", entityType: "suppliers", entityId: created.id, requestId: context.requestId, afterJson: { name } });
    return { id: created.id, status: created.status };
  });
}

export async function updateSupplier(prisma: PrismaClient, context: RoleContext, id: string, input: Parameters<typeof createSupplier>[2] & { status?: "ACTIVE" | "INACTIVE" | undefined }) {
  await requireOwner(context);
  return effect(prisma, context, { action: "update-supplier", id, ...input }, async (tx) => {
    const current = await tx.supplier.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!current) throw new DomainError("SUPPLIER_NOT_FOUND", "Fournisseur introuvable.", 404);
    const name = input.name ? text(input.name, "Le nom du fournisseur", 2, 160) : current.name;
    const normalizedName = normalizeSupplierName(name);
    const phone = input.phone !== undefined ? (input.phone.trim() || null) : current.phone;
    if (input.status === "ACTIVE" || input.status === undefined) {
      const clash = await tx.supplier.findFirst({ where: { organizationId: context.organizationId, normalizedName, id: { not: id } } });
      if (clash && (clash.phone ?? null) === phone) throw new DomainError("SUPPLIER_DUPLICATE", "Un fournisseur identique existe déjà.", 409);
    }
    const updated = await tx.supplier.update({
      where: { id },
      data: {
        name,
        tradeName: input.tradeName !== undefined ? input.tradeName.trim() || null : current.tradeName,
        phone,
        email: input.email !== undefined ? input.email.trim() || null : current.email,
        address: input.address !== undefined ? input.address.trim() || null : current.address,
        taxId: input.taxId !== undefined ? input.taxId.trim() || null : current.taxId,
        contactName: input.contactName !== undefined ? input.contactName.trim() || null : current.contactName,
        paymentTerms: input.paymentTerms !== undefined ? input.paymentTerms.trim() || null : current.paymentTerms,
        leadTimeDays: input.leadTimeDays !== undefined ? input.leadTimeDays : current.leadTimeDays,
        notes: input.notes !== undefined ? input.notes.trim() || null : current.notes,
        status: input.status ?? current.status,
        normalizedName,
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "SUPPLIER_UPDATED", entityType: "suppliers", entityId: id, requestId: context.requestId, afterJson: { status: updated.status } });
    return { id, status: updated.status };
  });
}

async function writeRequestLines(tx: Tx, organizationId: string, requestId: string, lines: RequestLineInput[]) {
  if (lines.length < 1 || lines.length > 100) throw new DomainError("INVALID_INPUT", "La demande doit contenir entre 1 et 100 lignes.", 422);
  for (const [index, line] of lines.entries()) {
    const resolved = await resolveUnit(tx, organizationId, line.variantId, line.unitId, line.quantity);
    await tx.purchaseRequestLine.create({
      data: {
        requestId,
        variantId: resolved.variant.id,
        unitId: resolved.unit.id,
        quantityBase: decimal(resolved.base),
        estimatedUnitMinor: line.estimatedUnitMinor ? money(line.estimatedUnitMinor, "Le prix estimé") : null,
        sort: index,
      },
    });
  }
}

function requestDto(row: Awaited<ReturnType<Tx["purchaseRequest"]["findFirstOrThrow"]>> & {
  shop: { id: string; name: string };
  actor: { id: string; displayName: string };
  suggestedSupplier: { id: string; name: string; tradeName: string | null; phone: string | null; status: string } | null;
  lines: Array<{
    id: string;
    quantityBase: { toString(): string };
    estimatedUnitMinor: bigint | null;
    variant: { id: string; name: string; product: { name: string } };
    unit: { id: string; name: string; symbol: string };
  }>;
  actions: Array<{ id: string; actionType: string; text: string; createdAt: Date; actor: { displayName: string; role: string } }>;
  approvals: Array<{
    id: string;
    outcome: string;
    buyer: string | null;
    budgetMinor: bigint;
    validUntil: Date | null;
    reason: string | null;
    createdAt: Date;
    actor: { displayName: string };
    lines: Array<{ id: string; requestLineId: string; maxQtyBase: { toString(): string }; maxAmountMinor: bigint; consumedQtyBase: { toString(): string }; consumedAmountMinor: bigint }>;
  }>;
}, role: string) {
  const latest = row.approvals[0] ?? null;
  const remainingBudget = latest ? latest.budgetMinor - latest.lines.reduce((sum, line) => sum + line.consumedAmountMinor, 0n) : 0n;
  const canBuy = Boolean(latest && ["APPROVED", "PARTIAL"].includes(row.status) && latest.buyer === "MANAGER" && remainingBudget >= 0n && latest.lines.some((line) => toScaled(line.consumedQtyBase.toString()) < toScaled(line.maxQtyBase.toString())));
  return {
    id: row.id,
    familyId: row.familyId,
    version: row.version,
    status: row.status,
    urgency: row.urgency,
    comment: row.comment,
    shopId: row.shop.id,
    shopName: row.shop.name,
    actorName: row.actor.displayName,
    suggestedSupplier: row.suggestedSupplier,
    estimatedFeesMinor: row.estimatedFeesMinor.toString(),
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    lines: row.lines.map((line) => ({
      id: line.id,
      variantId: line.variant.id,
      productName: line.variant.product.name,
      variantName: line.variant.name,
      unitId: line.unit.id,
      unitName: line.unit.name,
      quantityBase: line.quantityBase.toString(),
      estimatedUnitMinor: line.estimatedUnitMinor?.toString() ?? null,
    })),
    actions: row.actions.map((action) => ({
      id: action.id,
      type: action.actionType,
      text: action.text,
      actorName: action.actor.displayName,
      createdAt: action.createdAt.toISOString(),
    })),
    approval: latest ? {
      id: latest.id,
      outcome: latest.outcome,
      buyer: latest.buyer,
      budgetMinor: latest.budgetMinor.toString(),
      remainingBudgetMinor: remainingBudget.toString(),
      validUntil: latest.validUntil?.toISOString() ?? null,
      reason: latest.reason,
      lines: latest.lines.map((line) => ({
        id: line.id,
        requestLineId: line.requestLineId,
        maxQtyBase: line.maxQtyBase.toString(),
        maxAmountMinor: line.maxAmountMinor.toString(),
        consumedQtyBase: line.consumedQtyBase.toString(),
        consumedAmountMinor: line.consumedAmountMinor.toString(),
        remainingQtyBase: decimal(toScaled(line.maxQtyBase.toString()) - toScaled(line.consumedQtyBase.toString())),
      })),
    } : null,
    capabilities: {
      canSubmit: row.status === "DRAFT" && (role === "MANAGER" || role === "OWNER"),
      canEdit: row.status === "DRAFT",
      canRespond: row.status === "NEEDS_INFO" && role === "MANAGER",
      canDecide: row.status === "SUBMITTED" && role === "OWNER",
      canBuy: canBuy && role === "MANAGER",
      canCancelRemainder: ["APPROVED", "PARTIAL"].includes(row.status) && role === "OWNER",
      canWithdraw: ["DRAFT", "SUBMITTED", "NEEDS_INFO"].includes(row.status) && role === "MANAGER",
    },
  };
}

async function loadRequest(tx: Tx, organizationId: string, id: string, shopId?: string) {
  const row = await tx.purchaseRequest.findFirst({
    where: { id, organizationId, ...(shopId ? { shopId } : {}) },
    include: REQUEST_INCLUDE,
  });
  if (!row) throw new DomainError("REQUEST_NOT_FOUND", "Demande introuvable.", 404);
  return row;
}

export async function listRequests(prisma: PrismaClient, organizationId: string, actorId: string, role: string, status?: string) {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  if (role === "MANAGER" && !shopId) return [];
  const rows = await prisma.purchaseRequest.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}), ...(status ? { status } : {}) },
    include: { shop: { select: { name: true } }, actor: { select: { displayName: true } } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    take: 200,
  });
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!latest.has(row.familyId)) latest.set(row.familyId, row);
  }
  return [...latest.values()].map((row) => ({
    id: row.id,
    familyId: row.familyId,
    version: row.version,
    status: row.status,
    urgency: row.urgency,
    comment: row.comment,
    shopName: row.shop.name,
    actorName: row.actor.displayName,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getRequest(prisma: PrismaClient, organizationId: string, actorId: string, role: string, id: string) {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  const row = await prisma.purchaseRequest.findFirst({
    where: { id, organizationId, ...(shopId ? { shopId } : {}) },
    include: REQUEST_INCLUDE,
  });
  if (!row) throw new DomainError("REQUEST_NOT_FOUND", "Demande introuvable.", 404);
  const versions = await prisma.purchaseRequest.findMany({
    where: { familyId: row.familyId, organizationId },
    select: { id: true, version: true, status: true, createdAt: true },
    orderBy: { version: "asc" },
  });
  return { ...requestDto(row, role), versions: versions.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
}

export async function createRequest(prisma: PrismaClient, context: RoleContext, input: {
  comment: string;
  urgency?: "LOW" | "NORMAL" | "HIGH" | undefined;
  suggestedSupplierId?: string | undefined;
  estimatedFeesMinor?: string | undefined;
  lines: RequestLineInput[];
  attachmentIds?: string[] | undefined;
}) {
  return effect(prisma, context, { action: "create-request", ...input }, async (tx) => {
    const shop = isOwner(context)
      ? null
      : await managerShop(tx, context.organizationId, context.actorId);
    if (!shop) throw new DomainError("FORBIDDEN", "Le propriétaire décide les achats sans demande gérant.", 403);
    const id = crypto.randomUUID();
    await tx.purchaseRequest.create({
      data: {
        id,
        familyId: id,
        organizationId: context.organizationId,
        shopId: shop.id,
        actorId: context.actorId,
        status: "DRAFT",
        urgency: input.urgency ?? "NORMAL",
        comment: text(input.comment, "Le motif", 5, 1000),
        suggestedSupplierId: input.suggestedSupplierId ?? null,
        estimatedFeesMinor: input.estimatedFeesMinor ? money(input.estimatedFeesMinor, "Les frais estimés") : 0n,
      },
    });
    await writeRequestLines(tx, context.organizationId, id, input.lines);
    await bindAttachments(tx, context.organizationId, context.actorId, input.attachmentIds, "purchase_requests", id);
    await tx.purchaseRequestAction.create({ data: { requestId: id, actorId: context.actorId, actionType: "COMMENT", text: "Brouillon créé." } });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_CREATED", entityType: "purchase_requests", entityId: id, requestId: context.requestId, afterJson: { shopId: shop.id } });
    return { id, status: "DRAFT" };
  });
}

export async function patchRequest(prisma: PrismaClient, context: RoleContext, id: string, input: {
  comment?: string | undefined;
  urgency?: "LOW" | "NORMAL" | "HIGH" | undefined;
  suggestedSupplierId?: string | null | undefined;
  estimatedFeesMinor?: string | undefined;
  lines?: RequestLineInput[] | undefined;
}) {
  return effect(prisma, context, { action: "patch-request", id, ...input }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const row = await loadRequest(tx, context.organizationId, id, shop.id);
    if (row.status !== "DRAFT") throw new DomainError("IMMUTABLE_DOCUMENT", "Seule une demande en brouillon peut être modifiée.", 409);
    if (input.lines) {
      await tx.purchaseRequestLine.deleteMany({ where: { requestId: id } });
      await writeRequestLines(tx, context.organizationId, id, input.lines);
    }
    await tx.purchaseRequest.update({
      where: { id },
      data: {
        comment: input.comment ? text(input.comment, "Le motif", 5, 1000) : row.comment,
        urgency: input.urgency ?? row.urgency,
        suggestedSupplierId: input.suggestedSupplierId === undefined ? row.suggestedSupplierId : input.suggestedSupplierId,
        estimatedFeesMinor: input.estimatedFeesMinor ? money(input.estimatedFeesMinor, "Les frais estimés") : row.estimatedFeesMinor,
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_UPDATED", entityType: "purchase_requests", entityId: id, requestId: context.requestId, afterJson: { status: "DRAFT" } });
    return { id, status: "DRAFT" };
  });
}

export async function submitRequest(prisma: PrismaClient, context: RoleContext, id: string) {
  return effect(prisma, context, { action: "submit-request", id }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const row = await loadRequest(tx, context.organizationId, id, shop.id);
    if (row.status !== "DRAFT") throw new DomainError("INVALID_REQUEST_TRANSITION", "Cette demande ne peut pas être soumise.", 409);
    if (row.lines.length === 0) throw new DomainError("INVALID_INPUT", "Ajoutez au moins une ligne avant de soumettre.", 422);
    await tx.purchaseRequest.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await tx.purchaseRequestAction.create({ data: { requestId: id, actorId: context.actorId, actionType: "SUBMIT", text: "Demande soumise." } });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_SUBMITTED", entityType: "purchase_requests", entityId: id, requestId: context.requestId, afterJson: { status: "SUBMITTED" } });
    return { id, status: "SUBMITTED" };
  });
}

export async function respondToRequest(prisma: PrismaClient, context: RoleContext, id: string, input: { text: string; lines?: RequestLineInput[] | undefined; attachmentIds?: string[] | undefined }) {
  return effect(prisma, context, { action: "respond-request", id, ...input }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const row = await loadRequest(tx, context.organizationId, id, shop.id);
    if (row.status !== "NEEDS_INFO") throw new DomainError("INVALID_REQUEST_TRANSITION", "Aucune précision n’est demandée sur ce dossier.", 409);
    const nextId = crypto.randomUUID();
    const nextVersion = row.version + 1;
    await tx.purchaseRequest.create({
      data: {
        id: nextId,
        familyId: row.familyId,
        organizationId: context.organizationId,
        shopId: shop.id,
        actorId: context.actorId,
        status: "SUBMITTED",
        version: nextVersion,
        urgency: row.urgency,
        comment: row.comment,
        suggestedSupplierId: row.suggestedSupplierId,
        estimatedFeesMinor: row.estimatedFeesMinor,
        submittedAt: new Date(),
      },
    });
    if (input.lines?.length) await writeRequestLines(tx, context.organizationId, nextId, input.lines);
    else {
      for (const line of row.lines) {
        await tx.purchaseRequestLine.create({
          data: { requestId: nextId, variantId: line.variantId, unitId: line.unitId, quantityBase: line.quantityBase, estimatedUnitMinor: line.estimatedUnitMinor, sort: line.sort },
        });
      }
    }
    await tx.purchaseRequestAction.create({ data: { requestId: id, actorId: context.actorId, actionType: "MANAGER_RESPONSE", text: text(input.text, "La réponse", 5, 1000) } });
    await tx.purchaseRequestAction.create({ data: { requestId: nextId, actorId: context.actorId, actionType: "SUBMIT", text: "Révision soumise après précisions." } });
    await bindAttachments(tx, context.organizationId, context.actorId, input.attachmentIds, "purchase_requests", nextId);
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_REVISED", entityType: "purchase_requests", entityId: nextId, requestId: context.requestId, afterJson: { previousId: id, version: nextVersion } });
    return { id: nextId, status: "SUBMITTED", version: nextVersion };
  });
}

export async function decideRequest(prisma: PrismaClient, context: RoleContext, id: string, input: {
  outcome: "APPROVED" | "PARTIAL" | "REJECTED" | "NEEDS_INFO";
  reason?: string | undefined;
  buyer?: "MANAGER" | "OWNER" | "EXISTING_STOCK" | undefined;
  budgetMinor?: string | undefined;
  sourceAccountId?: string | undefined;
  validUntil?: string | undefined;
  sourceLocationId?: string | undefined;
  lines?: DecisionLineInput[] | undefined;
}) {
  await requireOwner(context);
  return effect(prisma, context, { action: "decide-request", id, ...input }, async (tx) => {
    const row = await loadRequest(tx, context.organizationId, id);
    if (row.status !== "SUBMITTED") throw new DomainError("INVALID_REQUEST_TRANSITION", "Cette demande n’attend pas de décision.", 409);
    if (row.actorId === context.actorId) throw new DomainError("FORBIDDEN", "Un demandeur ne peut pas décider de sa propre demande.", 403);
    if ((input.outcome === "REJECTED" || input.outcome === "PARTIAL" || input.outcome === "NEEDS_INFO") && !input.reason) {
      throw new DomainError("INVALID_INPUT", "Un motif est obligatoire pour cette décision.", 422);
    }
    const approval = await tx.purchaseApproval.create({
      data: {
        requestId: id,
        actorId: context.actorId,
        outcome: input.outcome,
        buyer: input.outcome === "NEEDS_INFO" || input.outcome === "REJECTED" ? null : (input.buyer ?? "MANAGER"),
        budgetMinor: input.budgetMinor ? money(input.budgetMinor, "Le budget") : 0n,
        sourceAccountId: input.sourceAccountId ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : (input.outcome === "APPROVED" || input.outcome === "PARTIAL" ? new Date(Date.now() + 7 * 86_400_000) : null),
        reason: input.reason ? text(input.reason, "Le motif", 3, 1000) : null,
      },
    });
    if (input.outcome === "APPROVED" || input.outcome === "PARTIAL") {
      const lines = input.lines?.length
        ? input.lines
        : row.lines.map((line) => ({ requestLineId: line.id, maxQtyBase: line.quantityBase.toString(), maxAmountMinor: ((line.estimatedUnitMinor ?? 0n) * toScaled(line.quantityBase.toString()) / 1_000_000n).toString() }));
      for (const line of lines) {
        const origin = row.lines.find((item) => item.id === line.requestLineId);
        if (!origin) throw new DomainError("REQUEST_LINE_NOT_FOUND", "Une ligne d’approbation est inconnue.", 422);
        const maxQty = toScaled(line.maxQtyBase);
        if (maxQty > toScaled(origin.quantityBase.toString())) throw new DomainError("APPROVAL_QTY_EXCEEDED", "La quantité approuvée dépasse la demande.", 422);
        await tx.purchaseApprovalLine.create({
          data: { approvalId: approval.id, requestLineId: line.requestLineId, maxQtyBase: line.maxQtyBase, maxAmountMinor: money(line.maxAmountMinor, "Le plafond de ligne") },
        });
      }
    }
    await tx.purchaseRequest.update({ where: { id }, data: { status: input.outcome } });
    await tx.purchaseRequestAction.create({
      data: { requestId: id, actorId: context.actorId, actionType: input.outcome === "NEEDS_INFO" ? "REQUEST_INFO" : "DECIDE", text: input.reason ? text(input.reason, "Le motif", 3, 1000) : `Décision ${input.outcome}.` },
    });
    if (input.outcome !== "REJECTED" && input.outcome !== "NEEDS_INFO" && (input.buyer ?? "MANAGER") === "EXISTING_STOCK") {
      const sourceId = input.sourceLocationId;
      if (!sourceId) throw new DomainError("INVALID_INPUT", "Indiquez le lieu source pour servir le stock existant.", 422);
      const destination = await tx.location.findFirst({ where: { shopId: row.shopId, type: "SHOP", status: "ACTIVE" } });
      if (!destination) throw new DomainError("STOCK_LOCATION_REQUIRED", "La boutique destinataire n’a pas de lieu actif.", 409);
      const shipment = await tx.shipment.create({
        data: {
          organizationId: context.organizationId,
          sourceLocationId: sourceId,
          destinationLocationId: destination.id,
          requestId: id,
          actorId: context.actorId,
          status: "APPROVED",
          note: "Service depuis le stock existant.",
        },
      });
      const lines = await tx.purchaseApprovalLine.findMany({ where: { approvalId: approval.id }, include: { requestLine: true } });
      for (const line of lines) {
        if (toScaled(line.maxQtyBase.toString()) <= 0n) continue;
        await tx.shipmentLine.create({
          data: { shipmentId: shipment.id, variantId: line.requestLine.variantId, requestedQty: line.maxQtyBase },
        });
      }
    }
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_DECIDED", entityType: "purchase_requests", entityId: id, requestId: context.requestId, afterJson: { outcome: input.outcome } });
    return { id, status: input.outcome, approvalId: approval.id };
  });
}

export async function withdrawRequest(prisma: PrismaClient, context: RoleContext, id: string, reason: string) {
  return effect(prisma, context, { action: "withdraw-request", id, reason }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const row = await loadRequest(tx, context.organizationId, id, shop.id);
    if (!["DRAFT", "SUBMITTED", "NEEDS_INFO"].includes(row.status)) throw new DomainError("INVALID_REQUEST_TRANSITION", "Cette demande ne peut plus être retirée.", 409);
    await tx.purchaseRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.purchaseRequestAction.create({ data: { requestId: id, actorId: context.actorId, actionType: "WITHDRAW", text: text(reason, "Le motif", 3, 500) } });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_WITHDRAWN", entityType: "purchase_requests", entityId: id, requestId: context.requestId, afterJson: { status: "CANCELLED" } });
    return { id, status: "CANCELLED" };
  });
}

export async function cancelRequestRemainder(prisma: PrismaClient, context: RoleContext, id: string, reason: string) {
  await requireOwner(context);
  return effect(prisma, context, { action: "cancel-remainder", id, reason }, async (tx) => {
    const row = await loadRequest(tx, context.organizationId, id);
    if (!["APPROVED", "PARTIAL"].includes(row.status)) throw new DomainError("INVALID_REQUEST_TRANSITION", "Aucun reliquat à clôturer.", 409);
    await tx.purchaseRequest.update({ where: { id }, data: { status: "CLOSED" } });
    await tx.purchaseRequestAction.create({ data: { requestId: id, actorId: context.actorId, actionType: "CANCEL_REMAINDER", text: text(reason, "Le motif", 3, 500) } });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_REQUEST_REMAINDER_CANCELLED", entityType: "purchase_requests", entityId: id, requestId: context.requestId, afterJson: { status: "CLOSED" } });
    return { id, status: "CLOSED" };
  });
}

async function debitAccount(tx: Tx, context: RoleContext, accountId: string, amount: bigint, type: string, reason: string, shopId: string | null) {
  const accounts = await tx.$queryRaw<Array<{ id: string; balance_minor: bigint; shop_id: string | null; type: string }>>`
    SELECT ma.id, ma.balance_minor, ma.shop_id, ps.type FROM money_accounts ma JOIN payment_sources ps ON ps.id=ma.payment_source_id
    WHERE ma.id=${accountId}::uuid AND ma.organization_id=${context.organizationId}::uuid FOR UPDATE`;
  const account = accounts[0];
  if (!account) throw new DomainError("ACCOUNT_NOT_FOUND", "Source de fonds introuvable.", 404);
  if (!isOwner(context) && !account.shop_id) throw new DomainError("FORBIDDEN_FUND_SOURCE", "Cette source n’est pas autorisée pour la boutique.", 403);
  if (account.balance_minor < amount) throw new DomainError("INSUFFICIENT_FUNDS", "Le solde de la source est insuffisant.", 409);
  let sessionId: string | null = null;
  if (account.shop_id) {
    const session = await lockSession(tx, account.shop_id);
    if (session?.status === "COUNTING") throw new DomainError("COUNT_IN_PROGRESS", "Terminez le comptage avant un décaissement.", 409);
    if (account.type === "CASH" && (!session || session.status !== "OPEN")) throw new DomainError("CASH_SESSION_REQUIRED", "Ouvrez la session de caisse pour payer depuis cette source.", 409);
    sessionId = session?.id ?? null;
  }
  if (shopId && account.shop_id && account.shop_id !== shopId) throw new DomainError("FORBIDDEN_FUND_SOURCE", "Cette source n’appartient pas à la boutique concernée.", 403);
  await tx.moneyEvent.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type,
      reason,
      entries: { create: { accountId, amountMinor: -amount } },
    },
  });
  await tx.moneyAccount.update({ where: { id: accountId }, data: { balanceMinor: { decrement: amount }, version: { increment: 1 } } });
  return { sessionId, shopId: account.shop_id };
}

async function consumeApproval(tx: Tx, approvalId: string, lines: Array<{ variantId: string; quantityBase: bigint; goodsMinor: bigint }>, totalCharged: bigint) {
  const header = await tx.$queryRaw<Array<{ budget_minor: bigint }>>`SELECT budget_minor FROM purchase_approvals WHERE id=${approvalId}::uuid FOR UPDATE`;
  const budget = header[0]?.budget_minor;
  if (budget === undefined) throw new DomainError("APPROVAL_REQUIRED", "Aucun accord valable n’autorise cet achat.", 409);
  const locked = await tx.$queryRaw<Array<{ id: string; max_qty: string; max_amount: bigint; consumed_qty: string; consumed_amount: bigint; variant_id: string }>>`
    SELECT pal.id, pal.max_qty_base::text AS max_qty, pal.max_amount_minor AS max_amount,
           pal.consumed_qty_base::text AS consumed_qty, pal.consumed_amount_minor AS consumed_amount, prl.variant_id
    FROM purchase_approval_lines pal JOIN purchase_request_lines prl ON prl.id=pal.request_line_id
    WHERE pal.approval_id=${approvalId}::uuid FOR UPDATE OF pal`;
  const already = locked.reduce((sum, row) => sum + row.consumed_amount, 0n);
  if (already + totalCharged > budget) throw new DomainError("BUDGET_EXCEEDED", "Le montant dépasse le budget approuvé.", 409);
  for (const line of lines) {
    const approvalLine = locked.find((row) => row.variant_id === line.variantId);
    if (!approvalLine) throw new DomainError("APPROVAL_REQUIRED", "Cette ligne n’est pas couverte par l’accord.", 409);
    const remainingQty = toScaled(approvalLine.max_qty) - toScaled(approvalLine.consumed_qty);
    if (line.quantityBase > remainingQty) throw new DomainError("APPROVAL_QTY_EXCEEDED", "La quantité achetée dépasse l’accord.", 409);
    const remainingAmount = approvalLine.max_amount === 0n ? totalCharged : approvalLine.max_amount - approvalLine.consumed_amount;
    if (approvalLine.max_amount > 0n && line.goodsMinor > remainingAmount) throw new DomainError("BUDGET_EXCEEDED", "Le montant dépasse le budget approuvé.", 409);
    await tx.purchaseApprovalLine.update({
      where: { id: approvalLine.id },
      data: { consumedQtyBase: { increment: decimal(line.quantityBase) }, consumedAmountMinor: { increment: line.goodsMinor } },
    });
  }
}

async function createTransitFromPurchase(tx: Tx, context: CommandContext, purchaseId: string, stockValue: bigint) {
  const purchase = await tx.purchase.findFirstOrThrow({
    where: { id: purchaseId },
    include: { lines: { include: { destinations: { include: { location: true } } } } },
  });
  const byLocation = new Map<string, Array<{ line: typeof purchase.lines[number]; destination: typeof purchase.lines[number]["destinations"][number]; value: bigint }>>();
  for (const line of purchase.lines) {
    const lineValue = line.goodsMinor + line.allocatedFeesMinor + line.allocatedExternalMinor;
    let remainingQty = toScaled(line.quantityBase.toString());
    let remainingValue = lineValue;
    const dests = [...line.destinations];
    for (const [index, destination] of dests.entries()) {
      const qty = toScaled(destination.qtyBase.toString());
      const value = index === dests.length - 1 ? remainingValue : takeRemainingValue(remainingValue, remainingQty, qty);
      remainingQty -= qty;
      remainingValue -= value;
      const bucket = byLocation.get(destination.locationId) ?? [];
      bucket.push({ line, destination, value });
      byLocation.set(destination.locationId, bucket);
    }
  }
  const shipmentIds: string[] = [];
  for (const [locationId, items] of byLocation) {
    const shipment = await tx.shipment.create({
      data: {
        organizationId: context.organizationId,
        sourceLocationId: null,
        destinationLocationId: locationId,
        purchaseId,
        actorId: context.actorId,
        status: "DISPATCHED",
        dispatchedById: context.actorId,
        dispatchedAt: new Date(),
        note: "Livraison directe fournisseur.",
      },
    });
    shipmentIds.push(shipment.id);
    for (const item of items) {
      const qty = toScaled(item.destination.qtyBase.toString());
      const shipmentLine = await tx.shipmentLine.create({
        data: {
          shipmentId: shipment.id,
          variantId: item.line.variantId,
          purchaseLineId: item.line.id,
          requestedQty: item.destination.qtyBase,
          dispatchedQty: item.destination.qtyBase,
        },
      });
      const layer = await tx.costLayer.create({
        data: {
          variantId: item.line.variantId,
          locationId,
          originType: "purchases",
          originId: purchaseId,
          initialQuantity: decimal(qty),
          remainingQuantity: decimal(qty),
          unitCostMinor: unitCostOf(item.value, qty),
          initialValueMinor: item.value,
          remainingValueMinor: item.value,
          compartment: "TRANSIT",
          valuationOrigin: "PURCHASE",
          shipmentLineId: shipmentLine.id,
          receivedAt: new Date(),
        },
      });
      await tx.shipmentCostAllocation.create({
        data: { shipmentLineId: shipmentLine.id, transitCostLayerId: layer.id, qty: decimal(qty), valueMinor: item.value },
      });
    }
  }
  await postJournal(tx, {
    organizationId: context.organizationId,
    actorId: context.actorId,
    type: "PURCHASE_POST",
    referenceType: "purchases",
    referenceId: purchaseId,
    lines: [
      { accountCode: "ASSET:TRANSIT", amountMinor: stockValue },
      { accountCode: "LIABILITY:SUPPLIER", amountMinor: -(purchase.goodsMinor + purchase.supplierFeesMinor) },
      { accountCode: "ASSET:FUNDS", amountMinor: -purchase.externalFeesMinor },
    ],
  });
  return shipmentIds;
}

export async function postPurchase(prisma: PrismaClient, context: RoleContext, input: {
  supplierId: string;
  requestId?: string | undefined;
  approvalId?: string | undefined;
  dueDate?: string | undefined;
  lines: PurchaseLineInput[];
  destinations?: DestinationInput[] | undefined;
  fees?: FeeInput[] | undefined;
  payments?: PaymentInput[] | undefined;
  attachmentIds?: string[] | undefined;
  receiveNow?: boolean | undefined;
  receiptLines?: ReceiptLineInput[] | undefined;
  deliveryComplete?: boolean | undefined;
}) {
  return effect(prisma, context, { action: "post-purchase", ...input }, async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, organizationId: context.organizationId, status: "ACTIVE" } });
    if (!supplier) throw new DomainError("SUPPLIER_NOT_FOUND", "Fournisseur introuvable ou inactif.", 404);
    if (input.lines.length < 1 || input.lines.length > 100) throw new DomainError("INVALID_INPUT", "L’achat doit contenir entre 1 et 100 lignes.", 422);
    let shopId: string | null = null;
    let approval: { id: string; requestId: string; buyer: string | null; validUntil: Date | null; sourceAccountId: string | null; request: { status: string; shopId: string } } | null = null;
    if (!isOwner(context)) {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      shopId = shop.id;
      if (!input.approvalId) throw new DomainError("APPROVAL_REQUIRED", "Un accord propriétaire est requis pour cet achat.", 409);
      approval = await tx.purchaseApproval.findFirst({
        where: { id: input.approvalId, request: { organizationId: context.organizationId, shopId: shop.id } },
        include: { request: true, lines: true },
      });
      if (!approval || !["APPROVED", "PARTIAL"].includes(approval.request.status) || approval.buyer !== "MANAGER") {
        throw new DomainError("APPROVAL_REQUIRED", "Aucun accord valable n’autorise cet achat.", 409);
      }
      if (approval.validUntil && approval.validUntil < new Date()) throw new DomainError("APPROVAL_EXPIRED", "L’accord a expiré.", 409);
    } else if (input.approvalId) {
      approval = await tx.purchaseApproval.findFirst({ where: { id: input.approvalId }, include: { request: true, lines: true } });
      shopId = approval?.request.shopId ?? null;
    }
    const prepared: Array<{ variantId: string; unitId: string; quantityBase: bigint; unitPriceMinor: bigint; goodsMinor: bigint; tempId: string }> = [];
    for (const line of input.lines) {
      const resolved = await resolveUnit(tx, context.organizationId, line.variantId, line.unitId, line.quantity);
      const unitPrice = money(line.unitPriceMinor, "Le prix d’achat");
      const goodsMinor = multiplyPriceByQuantity(unitPrice, resolved.base);
      prepared.push({ variantId: resolved.variant.id, unitId: resolved.unit.id, quantityBase: resolved.base, unitPriceMinor: unitPrice, goodsMinor, tempId: crypto.randomUUID() });
    }
    const goodsMinor = prepared.reduce((sum, line) => sum + line.goodsMinor, 0n);
    const supplierFees = (input.fees ?? []).filter((fee) => fee.kind === "SUPPLIER").reduce((sum, fee) => sum + money(fee.amountMinor, "Les frais fournisseur"), 0n);
    const externalFees = (input.fees ?? []).filter((fee) => fee.kind === "EXTERNAL").reduce((sum, fee) => sum + money(fee.amountMinor, "Les frais externes"), 0n);
    const supplierAlloc = allocateFees(prepared.map((line) => ({ id: line.tempId, goodsMinor: line.goodsMinor, quantityBase: line.quantityBase })), supplierFees, "VALUE");
    const externalAlloc = allocateFees(prepared.map((line) => ({ id: line.tempId, goodsMinor: line.goodsMinor, quantityBase: line.quantityBase })), externalFees, "QUANTITY");
    const supplierMap = new Map(supplierAlloc.map((row) => [row.id, row.amount]));
    const externalMap = new Map(externalAlloc.map((row) => [row.id, row.amount]));
    const stockValue = goodsMinor + supplierFees + externalFees;
    const charged = goodsMinor + supplierFees;
    if (approval) await consumeApproval(tx, approval.id, prepared, charged);
    const paid = (input.payments ?? []).reduce((sum, payment) => sum + money(payment.amountMinor, "Le paiement"), 0n);
    if (paid > charged) throw new DomainError("PAYMENT_EXCEEDS_DUE", "Le paiement dépasse le montant dû au fournisseur.", 422);
    const destinations = input.destinations?.length
      ? input.destinations
      : prepared.map((_, index) => {
          if (!shopId) throw new DomainError("INVALID_INPUT", "Indiquez la destination de chaque ligne.", 422);
          return { purchaseLineIndex: index, locationId: "", quantity: decimal(prepared[index]!.quantityBase) };
        });
    let defaultLocationId: string | null = null;
    if (shopId) {
      const location = await tx.location.findFirst({ where: { shopId, type: "SHOP", status: "ACTIVE" } });
      if (!location) throw new DomainError("STOCK_LOCATION_REQUIRED", "Aucun lieu de stock actif n’est configuré.", 409);
      defaultLocationId = location.id;
    }
    const resolvedDestinations = destinations.map((destination) => ({
      ...destination,
      locationId: destination.locationId || defaultLocationId || "",
    }));
    if (resolvedDestinations.some((destination) => !destination.locationId)) throw new DomainError("INVALID_INPUT", "Chaque quantité achetée doit avoir une destination.", 422);
    for (const [index, line] of prepared.entries()) {
      const assigned = resolvedDestinations.filter((destination) => destination.purchaseLineIndex === index).reduce((sum, destination) => sum + toScaled(destination.quantity), 0n);
      if (assigned !== line.quantityBase) throw new DomainError("DESTINATION_QTY_MISMATCH", "La répartition ne correspond pas à la quantité achetée.", 422);
    }
    const purchaseId = crypto.randomUUID();
    const ref = await reference(tx, "ACH");
    await tx.purchase.create({
      data: {
        id: purchaseId,
        organizationId: context.organizationId,
        shopId,
        actorId: context.actorId,
        supplierId: supplier.id,
        requestId: approval?.requestId ?? input.requestId ?? null,
        approvalId: approval?.id ?? null,
        reference: ref,
        status: "POSTED",
        goodsMinor,
        supplierFeesMinor: supplierFees,
        externalFeesMinor: externalFees,
        stockValueMinor: stockValue,
        paidMinor: 0n,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
        postedAt: new Date(),
      },
    });
    const createdLines = [];
    for (const line of prepared) {
      const created = await tx.purchaseLine.create({
        data: {
          purchaseId,
          variantId: line.variantId,
          unitId: line.unitId,
          quantityBase: decimal(line.quantityBase),
          unitPriceMinor: line.unitPriceMinor,
          goodsMinor: line.goodsMinor,
          allocatedFeesMinor: supplierMap.get(line.tempId) ?? 0n,
          allocatedExternalMinor: externalMap.get(line.tempId) ?? 0n,
        },
      });
      createdLines.push(created);
    }
    for (const destination of resolvedDestinations) {
      const line = createdLines[destination.purchaseLineIndex];
      if (!line) throw new DomainError("INVALID_INPUT", "Une destination référence une ligne inconnue.", 422);
      const location = await tx.location.findFirst({ where: { id: destination.locationId, organizationId: context.organizationId, status: "ACTIVE" } });
      if (!location) throw new DomainError("LOCATION_NOT_FOUND", "Lieu de destination introuvable.", 404);
      if (!isOwner(context) && location.shopId !== shopId) throw new DomainError("FORBIDDEN", "Vous ne pouvez recevoir que dans votre boutique.", 403);
      await tx.purchaseDestination.create({
        data: { purchaseId, purchaseLineId: line.id, locationId: location.id, qtyBase: destination.quantity },
      });
    }
    for (const fee of input.fees ?? []) {
      const amount = money(fee.amountMinor, "Le frais");
      if (fee.kind === "EXTERNAL") {
        const accountId = fee.accountId ?? approval?.sourceAccountId;
        if (!accountId) throw new DomainError("INVALID_INPUT", "Indiquez la source qui paie les frais externes.", 422);
        await debitAccount(tx, context, accountId, amount, "PURCHASE_EXTERNAL_FEE", text(fee.description, "La description du frais", 2, 240), shopId);
      }
      await tx.purchaseFee.create({
        data: { purchaseId, kind: fee.kind, amountMinor: amount, accountId: fee.accountId ?? null, description: text(fee.description, "La description du frais", 2, 240) },
      });
    }
    const shipmentIds = await createTransitFromPurchase(tx, context, purchaseId, stockValue);
    let paidMinor = 0n;
    for (const payment of input.payments ?? []) {
      const amount = money(payment.amountMinor, "Le paiement");
      const accountId = payment.accountId ?? approval?.sourceAccountId;
      if (!accountId) throw new DomainError("INVALID_INPUT", "Indiquez la source du paiement.", 422);
      if (approval?.sourceAccountId && accountId !== approval.sourceAccountId && !isOwner(context)) {
        throw new DomainError("FORBIDDEN_FUND_SOURCE", "La source de paiement n’est pas celle autorisée.", 403);
      }
      const debited = await debitAccount(tx, context, accountId, amount, "PURCHASE_PAYMENT", `Paiement ${ref}`, shopId);
      await tx.purchasePayment.create({ data: { purchaseId, accountId, actorId: context.actorId, sessionId: debited.sessionId, amountMinor: amount } });
      paidMinor += amount;
      await postJournal(tx, {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "PURCHASE_PAYMENT",
        referenceType: "purchases",
        referenceId: purchaseId,
        lines: [{ accountCode: "ASSET:FUNDS", amountMinor: -amount }, { accountCode: "LIABILITY:SUPPLIER", amountMinor: amount }],
      });
    }
    const paymentStatus = paidMinor === 0n ? "DUE" : paidMinor === charged ? "PAID" : "PARTIAL";
    await tx.purchase.update({ where: { id: purchaseId }, data: { paidMinor, paymentStatus } });
    await bindAttachments(tx, context.organizationId, context.actorId, input.attachmentIds, "purchases", purchaseId);
    if (approval) {
      const remaining = await tx.purchaseApprovalLine.findMany({ where: { approvalId: approval.id } });
      const leftover = remaining.some((line) => toScaled(line.consumedQtyBase.toString()) < toScaled(line.maxQtyBase.toString()));
      if (!leftover) await tx.purchaseRequest.update({ where: { id: approval.requestId }, data: { status: "CLOSED" } });
    }
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_POSTED", entityType: "purchases", entityId: purchaseId, requestId: context.requestId, afterJson: { reference: ref, stockValueMinor: stockValue.toString(), paidMinor: paidMinor.toString() } });
    if (input.receiveNow) {
      for (const shipmentId of shipmentIds) {
        const shipment = await tx.shipment.findFirstOrThrow({ where: { id: shipmentId }, include: { lines: true } });
        const receiptLines = input.receiptLines?.length
          ? input.receiptLines.filter((line) => shipment.lines.some((item) => item.id === line.shipmentLineId))
          : shipment.lines.map((line) => ({ shipmentLineId: line.id, acceptedQty: line.dispatchedQty.toString() }));
        await postReceiptInTx(tx, context, {
          shipmentId,
          lines: receiptLines,
          deliveryComplete: input.deliveryComplete ?? true,
        });
      }
    }
    return { id: purchaseId, reference: ref, status: "POSTED", shipmentIds, paidMinor: paidMinor.toString(), stockValueMinor: stockValue.toString() };
  });
}

export async function payPurchase(prisma: PrismaClient, context: RoleContext, id: string, input: { accountId: string; amountMinor: string }) {
  return effect(prisma, context, { action: "pay-purchase", id, ...input }, async (tx) => {
    const purchase = await tx.purchase.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!purchase || purchase.status !== "POSTED") throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
    if (!isOwner(context)) {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      if (purchase.shopId !== shop.id) throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
    }
    const amount = money(input.amountMinor, "Le paiement");
    const due = purchase.goodsMinor + purchase.supplierFeesMinor - purchase.paidMinor;
    if (amount > due) throw new DomainError("PAYMENT_EXCEEDS_DUE", "Le paiement dépasse le montant encore dû.", 422);
    const debited = await debitAccount(tx, context, input.accountId, amount, "PURCHASE_PAYMENT", `Paiement ${purchase.reference}`, purchase.shopId);
    await tx.purchasePayment.create({ data: { purchaseId: id, accountId: input.accountId, actorId: context.actorId, sessionId: debited.sessionId, amountMinor: amount } });
    const paidMinor = purchase.paidMinor + amount;
    const charged = purchase.goodsMinor + purchase.supplierFeesMinor;
    await tx.purchase.update({ where: { id }, data: { paidMinor, paymentStatus: paidMinor === charged ? "PAID" : "PARTIAL" } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "PURCHASE_PAYMENT",
      referenceType: "purchases",
      referenceId: id,
      lines: [{ accountCode: "ASSET:FUNDS", amountMinor: -amount }, { accountCode: "LIABILITY:SUPPLIER", amountMinor: amount }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_PAID", entityType: "purchases", entityId: id, requestId: context.requestId, afterJson: { amountMinor: amount.toString() } });
    return { id, paidMinor: paidMinor.toString(), paymentStatus: paidMinor === charged ? "PAID" : "PARTIAL" };
  });
}

async function consumeTransitLayers(tx: Tx, shipmentLineId: string, variantId: string, qty: bigint, destLocationId: string, compartment: "AVAILABLE" | "DAMAGED", shopId: string | null, organizationId: string, actorId: string, originId: string) {
  const layers = await tx.$queryRaw<Array<{ id: string; remaining_quantity: string; remaining_value_minor: bigint; variant_id: string; unit_cost_minor: bigint }>>`
    SELECT id, remaining_quantity::text, remaining_value_minor, variant_id, unit_cost_minor FROM cost_layers
    WHERE shipment_line_id=${shipmentLineId}::uuid AND compartment='TRANSIT' AND remaining_quantity>0 ORDER BY received_at ASC, id ASC FOR UPDATE`;
  let remaining = qty;
  let valueMoved = 0n;
  for (const layer of layers) {
    if (remaining <= 0n) break;
    const available = toScaled(layer.remaining_quantity);
    const taken = available < remaining ? available : remaining;
    const value = takeRemainingValue(layer.remaining_value_minor, available, taken);
    remaining -= taken;
    valueMoved += value;
    await tx.costLayer.update({ where: { id: layer.id }, data: { remainingQuantity: { decrement: decimal(taken) }, remainingValueMinor: { decrement: value } } });
    const created = await tx.costLayer.create({
      data: {
        variantId: layer.variant_id,
        locationId: destLocationId,
        originType: "goods_receipts",
        originId,
        originLayerId: layer.id,
        initialQuantity: decimal(taken),
        remainingQuantity: decimal(taken),
        unitCostMinor: unitCostOf(value, taken),
        initialValueMinor: value,
        remainingValueMinor: value,
        compartment,
        valuationOrigin: "PURCHASE",
        receivedAt: new Date(),
      },
    });
    if (compartment === "AVAILABLE") {
      await applyAvailable(tx, { shopId, variantId: layer.variant_id, locationId: destLocationId, qty: taken });
    }
    void created;
  }
  if (remaining > 0n) throw new DomainError("INSUFFICIENT_TRANSIT", "Le transit restant est insuffisant pour cette réception.", 409);
  await tx.stockEvent.create({
    data: {
      organizationId,
      shopId,
      actorId,
      type: compartment === "AVAILABLE" ? "RECEIPT" : "DAMAGE",
      originType: "goods_receipts",
      originId,
      entries: { create: { variantId, locationId: destLocationId, quantity: decimal(qty) } },
    },
  });
  return valueMoved;
}

async function postReceiptInTx(tx: Tx, context: RoleContext, input: { shipmentId: string; lines: ReceiptLineInput[]; deliveryComplete?: boolean | undefined; comment?: string | undefined; attachmentIds?: string[] | undefined }) {
  const shipment = await tx.shipment.findFirst({
    where: { id: input.shipmentId, organizationId: context.organizationId },
    include: { lines: true, destinationLocation: true, purchase: true },
  });
  if (!shipment || !["DISPATCHED", "PARTIAL", "DISPUTED"].includes(shipment.status)) {
    throw new DomainError("SHIPMENT_NOT_RECEIVABLE", "Cette expédition n’est pas en attente de réception.", 409);
  }
  if (!isOwner(context)) {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    if (shipment.destinationLocation.shopId !== shop.id) throw new DomainError("SHIPMENT_NOT_FOUND", "Expédition introuvable.", 404);
  }
  await tx.$queryRaw`SELECT id FROM shipment_lines WHERE shipment_id=${shipment.id}::uuid FOR UPDATE`;
  const receiptId = crypto.randomUUID();
  let surplusCaseId: string | null = null;
  const createdLines: Array<{
    origin: (typeof shipment.lines)[number];
    accepted: bigint;
    damaged: bigint;
    surplus: bigint;
    remarks: string | undefined;
    lotCode: string | undefined;
    expiresOn: string | undefined;
  }> = [];
  for (const line of input.lines) {
    const origin = shipment.lines.find((item) => item.id === line.shipmentLineId);
    if (!origin) throw new DomainError("SHIPMENT_LINE_NOT_FOUND", "Une ligne de réception est inconnue.", 422);
    const accepted = line.acceptedQty && line.acceptedQty !== "0" ? scaledQty(line.acceptedQty, 6, "La quantité acceptée") : 0n;
    const damaged = line.damagedQty && line.damagedQty !== "0" ? scaledQty(line.damagedQty, 6, "La quantité endommagée") : 0n;
    const surplus = line.surplusQty && line.surplusQty !== "0" ? scaledQty(line.surplusQty, 6, "Le surplus") : 0n;
    const remaining = toScaled(origin.dispatchedQty.toString()) - toScaled(origin.receivedQty.toString());
    if (accepted + damaged > remaining) {
      if (remaining <= 0n) throw new DomainError("RECEIPT_EXCEEDS_SENT", "La réception dépasse la quantité encore en transit.", 409);
      const extra = accepted + damaged - remaining;
      const acceptedCapped = accepted > remaining ? remaining : accepted;
      const damagedCapped = acceptedCapped + damaged > remaining ? remaining - acceptedCapped : damaged;
      createdLines.push({ origin, accepted: acceptedCapped, damaged: damagedCapped, surplus: surplus + extra, remarks: line.remarks, lotCode: line.lotCode, expiresOn: line.expiresOn });
      continue;
    }
    if (accepted + damaged + surplus <= 0n) throw new DomainError("INVALID_QUANTITY", "Déclarez au moins une quantité reçue.", 422);
    createdLines.push({ origin, accepted, damaged, surplus, remarks: line.remarks, lotCode: line.lotCode, expiresOn: line.expiresOn });
  }
  const remainingAfter = shipment.lines.some((line) => {
    const applied = createdLines.filter((item) => item.origin.id === line.id).reduce((sum, item) => sum + item.accepted + item.damaged, 0n);
    return toScaled(line.dispatchedQty.toString()) - toScaled(line.receivedQty.toString()) - applied > 0n;
  });
  if (createdLines.some((line) => line.surplus > 0n)) {
    const opened = await tx.discrepancyCase.create({
      data: {
        organizationId: context.organizationId,
        shopId: shipment.destinationLocation.shopId,
        type: "RECEIPT",
        sourceType: "goods_receipts",
        sourceId: receiptId,
        originalAmountMinor: 0n,
        residualAmountMinor: 0n,
        state: "OPEN",
      },
    });
    surplusCaseId = opened.id;
    await tx.discrepancyAction.create({ data: { caseId: opened.id, actorId: context.actorId, actionType: "COMMENT", text: "Surplus constaté à la réception, isolé en quarantaine métier." } });
  }
  let missingCaseId: string | null = null;
  if (input.deliveryComplete && remainingAfter) {
    const opened = await tx.discrepancyCase.create({
      data: {
        organizationId: context.organizationId,
        shopId: shipment.destinationLocation.shopId,
        type: "RECEIPT",
        sourceType: "shipments",
        sourceId: shipment.id,
        originalAmountMinor: 0n,
        residualAmountMinor: 0n,
        state: "OPEN",
      },
    });
    missingCaseId = opened.id;
    await tx.discrepancyAction.create({ data: { caseId: opened.id, actorId: context.actorId, actionType: "COMMENT", text: "Livraison déclarée terminée avec manquant. Le reliquat reste en transit." } });
  }
  await tx.goodsReceipt.create({
    data: {
      id: receiptId,
      organizationId: context.organizationId,
      shipmentId: shipment.id,
      destinationLocationId: shipment.destinationLocationId,
      receivedById: context.actorId,
      deliveryComplete: Boolean(input.deliveryComplete),
      surplusCaseId,
      missingCaseId,
    },
  });
  let acceptedValue = 0n;
  let damagedValue = 0n;
  for (const line of createdLines) {
    let lotId: string | null = null;
    if (line.lotCode) {
      const lot = await tx.lot.upsert({
        where: { variantId_locationId_code: { variantId: line.origin.variantId, locationId: shipment.destinationLocationId, code: line.lotCode } },
        create: { variantId: line.origin.variantId, locationId: shipment.destinationLocationId, code: line.lotCode, expiresAt: line.expiresOn ? new Date(line.expiresOn) : null },
        update: line.expiresOn ? { expiresAt: new Date(line.expiresOn) } : {},
      });
      lotId = lot.id;
    }
    await tx.goodsReceiptLine.create({
      data: {
        receiptId,
        shipmentLineId: line.origin.id,
        variantId: line.origin.variantId,
        lotId,
        acceptedQty: decimal(line.accepted),
        damagedQty: decimal(line.damaged),
        surplusQty: decimal(line.surplus),
        remarks: line.remarks ?? null,
      },
    });
    const counted = line.accepted + line.damaged;
    if (counted > 0n) {
      await tx.shipmentLine.update({ where: { id: line.origin.id }, data: { receivedQty: { increment: decimal(counted) } } });
    }
    if (line.accepted > 0n) {
      acceptedValue += await consumeTransitLayers(tx, line.origin.id, line.origin.variantId, line.accepted, shipment.destinationLocationId, "AVAILABLE", shipment.destinationLocation.shopId, context.organizationId, context.actorId, receiptId);
    }
    if (line.damaged > 0n) {
      damagedValue += await consumeTransitLayers(tx, line.origin.id, line.origin.variantId, line.damaged, shipment.destinationLocationId, "DAMAGED", shipment.destinationLocation.shopId, context.organizationId, context.actorId, receiptId);
    }
    if (line.surplus > 0n) {
      await tx.costLayer.create({
        data: {
          variantId: line.origin.variantId,
          locationId: shipment.destinationLocationId,
          originType: "goods_receipts",
          originId: receiptId,
          initialQuantity: decimal(line.surplus),
          remainingQuantity: decimal(line.surplus),
          unitCostMinor: 0n,
          initialValueMinor: 0n,
          remainingValueMinor: 0n,
          compartment: "QUARANTINE",
          valuationOrigin: "UNVALUED",
          receivedAt: new Date(),
        },
      });
    }
    if (line.origin.purchaseLineId && counted > 0n) {
      await tx.purchaseLine.update({ where: { id: line.origin.purchaseLineId }, data: { receivedQtyBase: { increment: decimal(counted) } } });
    }
  }
  if (acceptedValue) {
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "GOODS_RECEIPT",
      referenceType: "goods_receipts",
      referenceId: receiptId,
      lines: [{ accountCode: "ASSET:STOCK", amountMinor: acceptedValue }, { accountCode: "ASSET:TRANSIT", amountMinor: -acceptedValue }],
    });
  }
  if (damagedValue) {
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "GOODS_DAMAGE",
      referenceType: "goods_receipts",
      referenceId: receiptId,
      lines: [{ accountCode: "ASSET:DAMAGED", amountMinor: damagedValue }, { accountCode: "ASSET:TRANSIT", amountMinor: -damagedValue }],
    });
  }
  const refreshed = await tx.shipmentLine.findMany({ where: { shipmentId: shipment.id } });
  const remaining = refreshed.some((line) => toScaled(line.receivedQty.toString()) < toScaled(line.dispatchedQty.toString()));
  const nextStatus = remaining ? (input.deliveryComplete ? "DISPUTED" : "PARTIAL") : "RECEIVED";
  await tx.shipment.update({ where: { id: shipment.id }, data: { status: nextStatus } });
  if (shipment.purchaseId) {
    const siblings = await tx.shipment.findMany({ where: { purchaseId: shipment.purchaseId }, include: { lines: true } });
    const complete = siblings.every((item) => item.lines.every((line) => toScaled(line.receivedQty.toString()) >= toScaled(line.dispatchedQty.toString())));
    const any = siblings.some((item) => item.lines.some((line) => toScaled(line.receivedQty.toString()) > 0n));
    await tx.purchase.update({ where: { id: shipment.purchaseId }, data: { receivedStatus: complete ? "COMPLETE" : any ? "PARTIAL" : "NONE" } });
  }
  await bindAttachments(tx, context.organizationId, context.actorId, input.attachmentIds, "goods_receipts", receiptId);
  await writeAudit(tx, { actorId: context.actorId, action: "GOODS_RECEIVED", entityType: "goods_receipts", entityId: receiptId, requestId: context.requestId, afterJson: { shipmentId: shipment.id, status: nextStatus } });
  return { id: receiptId, status: "POSTED", shipmentStatus: nextStatus, surplusCaseId, missingCaseId };
}

export async function postReceipt(prisma: PrismaClient, context: RoleContext, input: Parameters<typeof postReceiptInTx>[2]) {
  return effect(prisma, context, { action: "post-receipt", ...input }, (tx) => postReceiptInTx(tx, context, input));
}

export async function regularizeSurplus(prisma: PrismaClient, context: RoleContext, input: { receiptId: string; variantId: string; unitCostMinor: string; quantity: string; accountId?: string | undefined }) {
  await requireOwner(context);
  return effect(prisma, context, { action: "regularize-surplus", ...input }, async (tx) => {
    const receipt = await tx.goodsReceipt.findFirst({ where: { id: input.receiptId, organizationId: context.organizationId }, include: { destinationLocation: true } });
    if (!receipt) throw new DomainError("RECEIPT_NOT_FOUND", "Réception introuvable.", 404);
    const qty = scaledQty(input.quantity, 6, "La quantité à régulariser");
    const layers = await tx.$queryRaw<Array<{ id: string; remaining_quantity: string }>>`
      SELECT id, remaining_quantity::text FROM cost_layers
      WHERE origin_type='goods_receipts' AND origin_id=${receipt.id} AND variant_id=${input.variantId}::uuid
        AND compartment='QUARANTINE' AND valuation_origin='UNVALUED' AND remaining_quantity>0 FOR UPDATE`;
    const available = layers.reduce((sum, layer) => sum + toScaled(layer.remaining_quantity), 0n);
    if (qty !== available) throw new DomainError("SURPLUS_QTY_MISMATCH", "La régularisation doit porter sur la quantité quarantaine existante, sans la dupliquer.", 409);
    const unitCost = money(input.unitCostMinor, "Le coût unitaire");
    const value = multiplyPriceByQuantity(unitCost, qty);
    let remainingValue = value;
    let remainingQty = qty;
    for (const [index, layer] of layers.entries()) {
      const layerQty = toScaled(layer.remaining_quantity);
      const layerValue = index === layers.length - 1 ? remainingValue : takeRemainingValue(remainingValue, remainingQty, layerQty);
      remainingValue -= layerValue;
      remainingQty -= layerQty;
      await tx.costLayer.update({
        where: { id: layer.id },
        data: {
          compartment: "AVAILABLE",
          valuationOrigin: "PURCHASE",
          unitCostMinor: unitCost,
          initialValueMinor: layerValue,
          remainingValueMinor: layerValue,
        },
      });
    }
    await applyAvailable(tx, { shopId: receipt.destinationLocation.shopId, variantId: input.variantId, locationId: receipt.destinationLocationId, qty });
    if (input.accountId) {
      await debitAccount(tx, context, input.accountId, value, "PURCHASE_PAYMENT", "Régularisation de surplus", receipt.destinationLocation.shopId);
      await postJournal(tx, {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "SURPLUS_REGULARIZE",
        referenceType: "goods_receipts",
        referenceId: receipt.id,
        lines: [{ accountCode: "ASSET:STOCK", amountMinor: value }, { accountCode: "ASSET:FUNDS", amountMinor: -value }],
      });
    } else {
      await postJournal(tx, {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "SURPLUS_REGULARIZE",
        referenceType: "goods_receipts",
        referenceId: receipt.id,
        lines: [{ accountCode: "ASSET:STOCK", amountMinor: value }, { accountCode: "LIABILITY:SUPPLIER", amountMinor: -value }],
      });
    }
    if (receipt.surplusCaseId) {
      await tx.discrepancyCase.update({ where: { id: receipt.surplusCaseId }, data: { state: "RESOLVED", ownerDecision: "ACCEPT", resolvedAt: new Date(), resolvedById: context.actorId } });
    }
    await writeAudit(tx, { actorId: context.actorId, action: "SURPLUS_REGULARIZED", entityType: "goods_receipts", entityId: receipt.id, requestId: context.requestId, afterJson: { variantId: input.variantId, valueMinor: value.toString() } });
    return { id: receipt.id, quantity: decimal(qty), valueMinor: value.toString() };
  });
}

export async function createShipment(prisma: PrismaClient, context: RoleContext, input: {
  sourceLocationId: string;
  destinationLocationId: string;
  requestId?: string | undefined;
  note?: string | undefined;
  lines: Array<{ variantId: string; quantity: string }>;
}) {
  return effect(prisma, context, { action: "create-shipment", ...input }, async (tx) => {
    if (input.sourceLocationId === input.destinationLocationId) throw new DomainError("INVALID_INPUT", "L’origine et la destination doivent différer.", 422);
    const source = await tx.location.findFirst({ where: { id: input.sourceLocationId, organizationId: context.organizationId, status: "ACTIVE" } });
    const destination = await tx.location.findFirst({ where: { id: input.destinationLocationId, organizationId: context.organizationId, status: "ACTIVE" } });
    if (!source || !destination) throw new DomainError("LOCATION_NOT_FOUND", "Lieu introuvable.", 404);
    if (!isOwner(context)) {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      if (source.shopId !== shop.id) throw new DomainError("FORBIDDEN", "Vous ne pouvez expédier que depuis votre boutique.", 403);
    }
    const shipment = await tx.shipment.create({
      data: {
        organizationId: context.organizationId,
        sourceLocationId: source.id,
        destinationLocationId: destination.id,
        requestId: input.requestId ?? null,
        actorId: context.actorId,
        status: isOwner(context) ? "APPROVED" : "DRAFT",
        note: input.note ? text(input.note, "La note", 2, 500) : null,
      },
    });
    for (const line of input.lines) {
      const qty = scaledQty(line.quantity, 6);
      await tx.shipmentLine.create({ data: { shipmentId: shipment.id, variantId: line.variantId, requestedQty: decimal(qty) } });
    }
    await writeAudit(tx, { actorId: context.actorId, action: "SHIPMENT_CREATED", entityType: "shipments", entityId: shipment.id, requestId: context.requestId, afterJson: { status: shipment.status } });
    return { id: shipment.id, status: shipment.status };
  });
}

export async function submitShipment(prisma: PrismaClient, context: RoleContext, id: string) {
  return effect(prisma, context, { action: "submit-shipment", id }, async (tx) => {
    const shop = await managerShop(tx, context.organizationId, context.actorId);
    const shipment = await tx.shipment.findFirst({ where: { id, organizationId: context.organizationId, sourceLocation: { shopId: shop.id } } });
    if (!shipment || shipment.status !== "DRAFT") throw new DomainError("INVALID_SHIPMENT_TRANSITION", "Cette expédition ne peut pas être soumise.", 409);
    await tx.shipment.update({ where: { id }, data: { status: "SUBMITTED" } });
    await writeAudit(tx, { actorId: context.actorId, action: "SHIPMENT_SUBMITTED", entityType: "shipments", entityId: id, requestId: context.requestId, afterJson: { status: "SUBMITTED" } });
    return { id, status: "SUBMITTED" };
  });
}

export async function decideShipment(prisma: PrismaClient, context: RoleContext, id: string, outcome: "APPROVED" | "REJECTED", reason?: string) {
  await requireOwner(context);
  return effect(prisma, context, { action: "decide-shipment", id, outcome, reason }, async (tx) => {
    const shipment = await tx.shipment.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!shipment || !["DRAFT", "SUBMITTED"].includes(shipment.status)) throw new DomainError("INVALID_SHIPMENT_TRANSITION", "Cette expédition n’attend pas de décision.", 409);
    await tx.shipment.update({ where: { id }, data: { status: outcome } });
    await writeAudit(tx, { actorId: context.actorId, action: `SHIPMENT_${outcome}`, entityType: "shipments", entityId: id, requestId: context.requestId, afterJson: { reason: reason ?? null } });
    return { id, status: outcome };
  });
}

export async function dispatchShipment(prisma: PrismaClient, context: RoleContext, id: string) {
  return effect(prisma, context, { action: "dispatch-shipment", id }, async (tx) => {
    const shipment = await tx.shipment.findFirst({
      where: { id, organizationId: context.organizationId },
      include: { lines: true, sourceLocation: true, destinationLocation: true },
    });
    if (!shipment || shipment.status !== "APPROVED" || !shipment.sourceLocationId || !shipment.sourceLocation) {
      throw new DomainError("INVALID_SHIPMENT_TRANSITION", "Cette expédition n’est pas prête à partir.", 409);
    }
    if (!isOwner(context)) {
      const shop = await managerShop(tx, context.organizationId, context.actorId);
      if (shipment.sourceLocation.shopId !== shop.id) throw new DomainError("FORBIDDEN", "Seul le détenteur du stock peut expédier.", 403);
    }
    await tx.$queryRaw`SELECT id FROM shipment_lines WHERE shipment_id=${id}::uuid FOR UPDATE`;
    let moved = 0n;
    for (const line of shipment.lines) {
      const qty = toScaled(line.requestedQty.toString());
      await tx.$queryRaw`SELECT id FROM stock_balances WHERE variant_id=${line.variantId}::uuid AND location_id=${shipment.sourceLocationId}::uuid FOR UPDATE`;
      const balance = await tx.stockBalance.findFirst({ where: { variantId: line.variantId, locationId: shipment.sourceLocationId } });
      if (!balance || toScaled(balance.quantity.toString()) < qty) throw new DomainError("INSUFFICIENT_STOCK", "Le stock d’origine est insuffisant.", 409);
      const layerIds = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT cl.id FROM cost_layers cl LEFT JOIN lots l ON l.id=cl.lot_id
        WHERE cl.variant_id=${line.variantId}::uuid AND cl.location_id=${shipment.sourceLocationId}::uuid
          AND cl.compartment='AVAILABLE' AND cl.remaining_quantity>0
        ORDER BY l.expires_at ASC NULLS LAST, cl.received_at ASC, cl.id ASC FOR UPDATE OF cl`;
      let remaining = qty;
      let lineValue = 0n;
      for (const { id: layerId } of layerIds) {
        if (remaining <= 0n) break;
        const layer = await tx.costLayer.findFirstOrThrow({ where: { id: layerId } });
        const available = toScaled(layer.remainingQuantity.toString());
        const taken = available < remaining ? available : remaining;
        const value = takeRemainingValue(layer.remainingValueMinor, available, taken);
        remaining -= taken;
        lineValue += value;
        await tx.costLayer.update({ where: { id: layer.id }, data: { remainingQuantity: { decrement: decimal(taken) }, remainingValueMinor: { decrement: value } } });
        const transit = await tx.costLayer.create({
          data: {
            variantId: line.variantId,
            locationId: shipment.destinationLocationId,
            originType: "shipments",
            originId: shipment.id,
            originLayerId: layer.id,
            initialQuantity: decimal(taken),
            remainingQuantity: decimal(taken),
            unitCostMinor: unitCostOf(value, taken),
            initialValueMinor: value,
            remainingValueMinor: value,
            compartment: "TRANSIT",
            valuationOrigin: "TRANSFER",
            shipmentLineId: line.id,
            receivedAt: new Date(),
          },
        });
        await tx.shipmentCostAllocation.create({
          data: { shipmentLineId: line.id, originCostLayerId: layer.id, transitCostLayerId: transit.id, qty: decimal(taken), valueMinor: value },
        });
      }
      if (remaining > 0n) throw new DomainError("INSUFFICIENT_VALUED_STOCK", "Le stock valorisé d’origine est insuffisant.", 409);
      await applyAvailable(tx, { shopId: shipment.sourceLocation.shopId, variantId: line.variantId, locationId: shipment.sourceLocationId, qty: -qty });
      await tx.shipmentLine.update({ where: { id: line.id }, data: { dispatchedQty: decimal(qty) } });
      moved += lineValue;
    }
    await tx.stockEvent.create({
      data: {
        organizationId: context.organizationId,
        shopId: shipment.sourceLocation.shopId,
        actorId: context.actorId,
        type: "DISPATCH",
        originType: "shipments",
        originId: shipment.id,
        entries: { create: shipment.lines.map((line) => ({ variantId: line.variantId, locationId: shipment.sourceLocationId!, quantity: decimal(-toScaled(line.requestedQty.toString())) })) },
      },
    });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "STOCK_TRANSFER",
      referenceType: "shipments",
      referenceId: shipment.id,
      lines: [{ accountCode: "ASSET:TRANSIT", amountMinor: moved }, { accountCode: "ASSET:STOCK", amountMinor: -moved }],
    });
    await tx.shipment.update({ where: { id }, data: { status: "DISPATCHED", dispatchedById: context.actorId, dispatchedAt: new Date() } });
    await writeAudit(tx, { actorId: context.actorId, action: "SHIPMENT_DISPATCHED", entityType: "shipments", entityId: id, requestId: context.requestId, afterJson: { valueMinor: moved.toString() } });
    return { id, status: "DISPATCHED" };
  });
}

function purchaseVisibleToManager(shopId: string, purchaseShopId: string | null, destinationShopIds: string[]) {
  return purchaseShopId === shopId || destinationShopIds.includes(shopId);
}

export async function listPurchases(prisma: PrismaClient, organizationId: string, actorId: string, role: string) {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  if (role === "MANAGER" && !shopId) return [];
  const rows = await prisma.purchase.findMany({
    where: { organizationId, ...(shopId ? { OR: [{ shopId }, { destinations: { some: { location: { shopId } } } }] } : {}) },
    include: { supplier: true, shop: { select: { name: true } }, destinations: { include: { location: { select: { shopId: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.filter((row) => role === "OWNER" || purchaseVisibleToManager(shopId!, row.shopId, row.destinations.map((destination) => destination.location.shopId).filter((value): value is string => Boolean(value)))).map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    supplierName: row.supplier.name,
    shopName: row.shop?.name ?? null,
    receivedStatus: row.receivedStatus,
    paymentStatus: row.paymentStatus,
    goodsMinor: role === "OWNER" ? row.goodsMinor.toString() : undefined,
    paidMinor: role === "OWNER" || row.shopId === shopId ? row.paidMinor.toString() : undefined,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getPurchase(prisma: PrismaClient, organizationId: string, actorId: string, role: string, id: string) {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  const row = await prisma.purchase.findFirst({
    where: { id, organizationId },
    include: {
      supplier: true,
      shop: { select: { id: true, name: true } },
      lines: { include: { variant: { include: { product: true } }, unit: true, destinations: { include: { location: true } } } },
      fees: true,
      payments: { include: { account: { select: { name: true } } } },
      shipments: { include: { lines: true, destinationLocation: true, receipts: { include: { lines: true } } } },
    },
  });
  if (!row) throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
  const destShops = row.lines.flatMap((line) => line.destinations.map((destination) => destination.location.shopId));
  if (role === "MANAGER" && !purchaseVisibleToManager(shopId!, row.shopId, destShops.filter((value): value is string => Boolean(value)))) {
    throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
  }
  const owner = role === "OWNER";
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    supplier: { id: row.supplier.id, name: row.supplier.name, phone: row.supplier.phone },
    shopName: row.shop?.name ?? null,
    receivedStatus: row.receivedStatus,
    paymentStatus: row.paymentStatus,
    controlStatus: row.controlStatus,
    goodsMinor: owner ? row.goodsMinor.toString() : undefined,
    supplierFeesMinor: owner ? row.supplierFeesMinor.toString() : undefined,
    externalFeesMinor: owner ? row.externalFeesMinor.toString() : undefined,
    stockValueMinor: owner ? row.stockValueMinor.toString() : undefined,
    paidMinor: owner || row.shopId === shopId ? row.paidMinor.toString() : undefined,
    dueMinor: owner || row.shopId === shopId ? (row.goodsMinor + row.supplierFeesMinor - row.paidMinor).toString() : undefined,
    dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      productName: line.variant.product.name,
      variantName: line.variant.name,
      unitName: line.unit.name,
      quantityBase: line.quantityBase.toString(),
      receivedQtyBase: line.receivedQtyBase.toString(),
      unitPriceMinor: owner ? line.unitPriceMinor.toString() : undefined,
      goodsMinor: owner ? line.goodsMinor.toString() : undefined,
      destinations: line.destinations.map((destination) => ({
        id: destination.id,
        locationName: destination.location.name,
        qtyBase: destination.qtyBase.toString(),
        receivedQtyBase: destination.receivedQtyBase.toString(),
      })),
    })),
    fees: owner ? row.fees.map((fee) => ({ id: fee.id, kind: fee.kind, amountMinor: fee.amountMinor.toString(), description: fee.description })) : [],
    payments: (owner || row.shopId === shopId) ? row.payments.map((payment) => ({ id: payment.id, amountMinor: payment.amountMinor.toString(), accountName: payment.account.name, createdAt: payment.createdAt.toISOString() })) : [],
    shipments: row.shipments.filter((shipment) => owner || shipment.destinationLocation.shopId === shopId).map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      destinationName: shipment.destinationLocation.name,
      lines: shipment.lines.map((line) => ({
        id: line.id,
        dispatchedQty: line.dispatchedQty.toString(),
        receivedQty: line.receivedQty.toString(),
        remainingQty: decimal(toScaled(line.dispatchedQty.toString()) - toScaled(line.receivedQty.toString())),
      })),
    })),
    capabilities: {
      canPay: (owner || row.shopId === shopId) && row.paymentStatus !== "PAID",
      canReceive: row.shipments.some((shipment) => ["DISPATCHED", "PARTIAL"].includes(shipment.status) && (owner || shipment.destinationLocation.shopId === shopId)),
    },
  };
}

export async function listShipments(prisma: PrismaClient, organizationId: string, actorId: string, role: string, kind: "in" | "out" | "all" = "all") {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  if (role === "MANAGER" && !shopId) return [];
  const rows = await prisma.shipment.findMany({
    where: {
      organizationId,
      ...(shopId ? {
        OR: [
          ...(kind !== "out" ? [{ destinationLocation: { shopId } }] : []),
          ...(kind !== "in" ? [{ sourceLocation: { shopId } }] : []),
        ],
      } : {}),
    },
    include: { sourceLocation: true, destinationLocation: true, lines: { include: { variant: { include: { product: true } } } }, purchase: { select: { reference: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    sourceName: row.sourceLocation?.name ?? "Fournisseur",
    destinationName: row.destinationLocation.name,
    purchaseReference: row.purchase?.reference ?? null,
    createdAt: row.createdAt.toISOString(),
    remaining: row.lines.some((line) => toScaled(line.dispatchedQty.toString()) > toScaled(line.receivedQty.toString())),
    lines: row.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      productName: line.variant.product.name,
      variantName: line.variant.name,
      requestedQty: line.requestedQty.toString(),
      dispatchedQty: line.dispatchedQty.toString(),
      receivedQty: line.receivedQty.toString(),
      remainingQty: decimal(toScaled(line.dispatchedQty.toString()) - toScaled(line.receivedQty.toString())),
    })),
    capabilities: {
      canSubmit: role === "MANAGER" && row.status === "DRAFT" && row.sourceLocation?.shopId === shopId,
      canApprove: role === "OWNER" && ["DRAFT", "SUBMITTED"].includes(row.status),
      canDispatch: row.status === "APPROVED" && (role === "OWNER" || row.sourceLocation?.shopId === shopId),
      canReceive: ["DISPATCHED", "PARTIAL", "DISPUTED"].includes(row.status) && (role === "OWNER" || row.destinationLocation.shopId === shopId),
    },
  }));
}

export async function listShipmentPage(
  prisma: PrismaClient,
  organizationId: string,
  actorId: string,
  role: string,
  input: { page: number; pageSize: number; status?: string; movementType?: "PURCHASE" | "TRANSFER"; query?: string },
) {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  if (role === "MANAGER" && !shopId) return { items: [], total: 0, page: input.page, pageSize: input.pageSize, totalPages: 0 };
  const query = input.query?.trim();
  const baseWhere: Prisma.ShipmentWhereInput = {
    organizationId,
    ...(shopId ? { OR: [{ destinationLocation: { shopId } }, { sourceLocation: { shopId } }] } : {}),
    ...(input.movementType === "PURCHASE" ? { purchaseId: { not: null } } : input.movementType === "TRANSFER" ? { purchaseId: null } : {}),
    ...(query ? {
      AND: [{ OR: [
        { sourceLocation: { name: { contains: query, mode: "insensitive" } } },
        { destinationLocation: { name: { contains: query, mode: "insensitive" } } },
        { purchase: { reference: { contains: query, mode: "insensitive" } } },
        { lines: { some: { variant: { product: { name: { contains: query, mode: "insensitive" } } } } } },
      ] }],
    } : {}),
  };
  const where: Prisma.ShipmentWhereInput = { ...baseWhere, ...(input.status ? { status: input.status as never } : {}) };
  const [rows, total, grouped] = await prisma.$transaction([
    prisma.shipment.findMany({
      where,
      include: { sourceLocation: true, destinationLocation: true, lines: { include: { variant: { include: { product: true } } } }, purchase: { select: { reference: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.shipment.count({ where }),
    prisma.shipment.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      sourceName: row.sourceLocation?.name ?? "Fournisseur",
      destinationName: row.destinationLocation.name,
      purchaseReference: row.purchase?.reference ?? null,
      movementType: row.purchaseId ? "PURCHASE" as const : "TRANSFER" as const,
      createdAt: row.createdAt.toISOString(),
      remaining: row.lines.some((line) => toScaled(line.dispatchedQty.toString()) > toScaled(line.receivedQty.toString())),
      lines: row.lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        productName: line.variant.product.name,
        variantName: line.variant.name,
        requestedQty: line.requestedQty.toString(),
        dispatchedQty: line.dispatchedQty.toString(),
        receivedQty: line.receivedQty.toString(),
        remainingQty: decimal(toScaled(line.dispatchedQty.toString()) - toScaled(line.receivedQty.toString())),
      })),
      capabilities: {
        canSubmit: role === "MANAGER" && row.status === "DRAFT" && row.sourceLocation?.shopId === shopId,
        canApprove: role === "OWNER" && ["DRAFT", "SUBMITTED"].includes(row.status),
        canDispatch: row.status === "APPROVED" && (role === "OWNER" || row.sourceLocation?.shopId === shopId),
        canReceive: ["DISPATCHED", "PARTIAL", "DISPUTED"].includes(row.status) && (role === "OWNER" || row.destinationLocation.shopId === shopId),
      },
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    statusCounts: Object.fromEntries(grouped.map((item) => [item.status, item._count._all])),
  };
}

export async function getShipment(prisma: PrismaClient, organizationId: string, actorId: string, role: string, id: string) {
  const listed = await listShipments(prisma, organizationId, actorId, role);
  const row = listed.find((item) => item.id === id);
  if (!row) throw new DomainError("SHIPMENT_NOT_FOUND", "Expédition introuvable.", 404);
  const receipts = await prisma.goodsReceipt.findMany({
    where: { shipmentId: id },
    include: { lines: true, receivedBy: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    ...row,
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      deliveryComplete: receipt.deliveryComplete,
      actorName: receipt.receivedBy.displayName,
      createdAt: receipt.createdAt.toISOString(),
      surplusCaseId: receipt.surplusCaseId,
      missingCaseId: receipt.missingCaseId,
      lines: receipt.lines.map((line) => ({
        acceptedQty: line.acceptedQty.toString(),
        damagedQty: line.damagedQty.toString(),
        surplusQty: line.surplusQty.toString(),
        remarks: line.remarks,
      })),
    })),
  };
}

export async function getReplenishmentContext(prisma: PrismaClient, organizationId: string, actorId: string, role: string) {
  const shopId = role === "MANAGER" ? (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId : undefined;
  const [suppliers, locations, accounts, products] = await Promise.all([
    listSuppliers(prisma, organizationId, role, undefined, "ACTIVE"),
    prisma.location.findMany({
      where: { organizationId, status: "ACTIVE", ...(shopId ? { OR: [{ shopId }, { shopId: null }] } : {}) },
      include: { shop: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.moneyAccount.findMany({
      where: { organizationId, paymentSource: { status: "ACTIVE" }, ...(shopId ? { shopId } : {}) },
      include: { paymentSource: true, shop: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { organizationId, status: "ACTIVE", ...(shopId ? { shops: { some: { shopId, active: true } } } : {}) },
      include: { variants: { where: { status: "ACTIVE" }, include: { units: { where: { status: "ACTIVE" } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    suppliers,
    locations: locations.map((location) => ({ id: location.id, name: location.name, type: location.type, shopId: location.shopId, shopName: location.shop?.name ?? "Organisation" })),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.paymentSource.type,
      shopName: account.shop?.name ?? "Organisation",
      ...(role === "OWNER" ? { balanceMinor: account.balanceMinor.toString() } : {}),
    })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        units: variant.units.map((unit) => ({ id: unit.id, name: unit.name, symbol: unit.symbol, factor: unit.factor.toString(), precision: unit.precision })),
      })),
    })),
  };
}

export async function closePurchaseControl(prisma: PrismaClient, context: RoleContext, id: string, reason: string) {
  await requireOwner(context);
  return effect(prisma, context, { action: "close-purchase-control", id, reason }, async (tx) => {
    const purchase = await tx.purchase.findFirst({ where: { id, organizationId: context.organizationId }, include: { shipments: { include: { lines: true } } } });
    if (!purchase) throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
    await tx.purchase.update({ where: { id }, data: { controlStatus: "CLOSED" } });
    await writeAudit(tx, { actorId: context.actorId, action: "PURCHASE_CONTROL_CLOSED", entityType: "purchases", entityId: id, requestId: context.requestId, afterJson: { reason: text(reason, "Le motif", 3, 500) } });
    return { id, controlStatus: "CLOSED" };
  });
}
