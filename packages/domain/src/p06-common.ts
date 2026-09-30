import {
  allocateByLargestRemainder,
  canonicalJson,
  convertQuantity,
  formatQuantity,
  multiplyPriceByQuantity,
  parseConversionFactor,
  parseQuantity,
  sha256Hex,
  takeRemainingValue,
} from "@cercle/contracts";
import type { Prisma, PrismaClient } from "@cercle/database";

import { DomainError, withDeadlockRetry } from "./errors.js";
import type { CommandContext } from "./p03.js";

export type Tx = Prisma.TransactionClient;
export type JsonResult = Prisma.InputJsonObject;
export type RoleContext = CommandContext & { actorRole?: string };

export const SCALE = 1_000_000n;
export const ATTACHMENT_TYPES = [
  "purchase_requests",
  "purchases",
  "purchase_payments",
  "shipments",
  "goods_receipts",
  "discrepancy_cases",
] as const;

export async function effect<T extends JsonResult>(prisma: PrismaClient, context: CommandContext, payload: unknown, work: (tx: Tx) => Promise<T>) {
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
    await tx.idempotencyKey.update({
      where: { organizationId_actorId_key: { organizationId: context.organizationId, actorId: context.actorId, key: context.key } },
      data: { state: "DONE", responseStatus: 200, responseJson: response },
    });
    return { ...response, replayed: false };
  }));
}

export function wrap(error: unknown): never {
  if (error instanceof DomainError) throw error;
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const code = String((error as { code: unknown }).code);
    const message = String((error as { message: unknown }).message);
    if (code && message) throw new DomainError(code, message, 422);
  }
  throw error;
}

export function money(value: string, label = "Le montant"): bigint {
  if (!/^\d+$/.test(value)) throw new DomainError("INVALID_MONEY", `${label} est invalide.`, 422);
  return BigInt(value);
}

export function text(value: string, label: string, min = 2, max = 500): string {
  const result = value.trim();
  if (result.length < min || result.length > max) throw new DomainError("INVALID_INPUT", `${label} est invalide.`, 422);
  return result;
}

export function scaledQty(value: string, precision: number, _label = "La quantité"): bigint {
  try {
    return parseQuantity(value, precision);
  } catch (error) {
    wrap(error);
  }
}

export function decimal(value: bigint): string {
  return formatQuantity(value);
}

export function toScaled(value: { toFixed: (digits: number) => string } | string): bigint {
  const textValue = typeof value === "string" ? value : value.toFixed(6);
  const [whole, fraction = ""] = textValue.split(".");
  return BigInt(whole ?? "0") * SCALE + BigInt((fraction + "000000").slice(0, 6));
}

export function unitCostOf(valueMinor: bigint, qty: bigint): bigint {
  if (qty <= 0n) return 0n;
  return (valueMinor * SCALE + qty / 2n) / qty;
}

export function normalizeSupplierName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function managerShop(tx: Tx, organizationId: string, actorId: string) {
  const assignment = await tx.managerAssignment.findFirst({
    where: { userId: actorId, endedAt: null, user: { organizationId, status: "ACTIVE" } },
    include: { shop: true },
  });
  if (!assignment || assignment.shop.status !== "ACTIVE") throw new DomainError("SHOP_NOT_ACTIVE", "Votre boutique doit être active.", 409);
  return assignment.shop;
}

export async function lockSession(tx: Tx, shopId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string; manager_id: string }>>`
    SELECT id, status, manager_id FROM cash_sessions WHERE shop_id=${shopId}::uuid AND status IN ('OPEN','COUNTING') FOR UPDATE`;
  return rows[0] ?? null;
}

export async function postJournal(tx: Tx, input: {
  organizationId: string;
  actorId: string;
  type: string;
  referenceType: string;
  referenceId: string;
  lines: Array<{ accountCode: string; amountMinor: bigint }>;
}) {
  const filtered = input.lines.filter((line) => line.amountMinor !== 0n);
  if (filtered.length === 0) return;
  const sum = filtered.reduce((total, line) => total + line.amountMinor, 0n);
  if (sum !== 0n) throw new DomainError("UNBALANCED_JOURNAL", "Le journal opérationnel n’est pas équilibré.", 500);
  const journal = await tx.journalEntry.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      type: input.type,
      status: "DRAFT",
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      lines: { create: filtered },
    },
  });
  await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedAt: new Date() } });
}

export async function applyAvailable(tx: Tx, input: { shopId: string | null; variantId: string; locationId: string; qty: bigint }) {
  await tx.$queryRaw`SELECT id FROM stock_balances WHERE variant_id=${input.variantId}::uuid AND location_id=${input.locationId}::uuid FOR UPDATE`;
  const current = await tx.stockBalance.findFirst({ where: { variantId: input.variantId, locationId: input.locationId } });
  const next = (current ? toScaled(current.quantity.toString()) : 0n) + input.qty;
  if (next < 0n) throw new DomainError("INSUFFICIENT_STOCK", "Le stock disponible est insuffisant.", 409);
  if (!current) {
    await tx.stockBalance.create({ data: { shopId: input.shopId, variantId: input.variantId, locationId: input.locationId, quantity: decimal(next) } });
    return;
  }
  await tx.stockBalance.update({ where: { id: current.id }, data: { quantity: decimal(next), version: { increment: 1 } } });
}

export async function bindAttachments(tx: Tx, organizationId: string, actorId: string, ids: string[] | undefined, documentType: string, documentId: string) {
  if (!ids?.length) return;
  const unique = [...new Set(ids)];
  const rows = await tx.attachment.findMany({ where: { id: { in: unique }, organizationId, uploadedById: actorId } });
  if (rows.length !== unique.length) throw new DomainError("ATTACHMENT_NOT_FOUND", "Un justificatif est introuvable ou déjà rattaché.", 404);
  await tx.attachment.updateMany({ where: { id: { in: unique } }, data: { ownerDocumentType: documentType, ownerDocumentId: documentId } });
}

export async function reference(tx: Tx, prefix: string) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = `${prefix}-${day}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const exists = await tx.purchase.count({ where: { reference: value } });
    if (!exists) return value;
  }
  return `${prefix}-${day}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export async function resolveUnit(tx: Tx, organizationId: string, variantId: string, unitId: string, quantity: string) {
  const unit = await tx.saleUnit.findFirst({
    where: { id: unitId, variantId, status: "ACTIVE", variant: { product: { organizationId, status: "ACTIVE" } } },
    include: { variant: { include: { product: true } } },
  });
  if (!unit) throw new DomainError("UNIT_NOT_FOUND", "L’unité de cet article est introuvable.", 404);
  const qty = scaledQty(quantity, unit.precision, `${unit.variant.product.name} · ${unit.variant.name}`);
  const factor = parseConversionFactor(unit.factor.toString());
  const base = convertQuantity(qty, factor);
  return { unit, variant: unit.variant, product: unit.variant.product, qty, base };
}

export function allocateFees(lines: Array<{ id: string; goodsMinor: bigint; quantityBase: bigint }>, total: bigint, by: "VALUE" | "QUANTITY") {
  return allocateByLargestRemainder(
    lines.map((line) => ({ id: line.id, base: by === "QUANTITY" ? line.quantityBase : line.goodsMinor })),
    total,
  );
}

export { takeRemainingValue, multiplyPriceByQuantity, allocateByLargestRemainder };
