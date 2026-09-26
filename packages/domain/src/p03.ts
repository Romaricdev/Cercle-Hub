import { canonicalJson, formatQuantity, parseMinor, parseQuantity, sha256Hex } from "@cercle/contracts";
import type { Prisma, PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError, withDeadlockRetry } from "./errors.js";

type Tx = Prisma.TransactionClient;
type JsonResult = Prisma.InputJsonObject;

export interface CommandContext {
  organizationId: string;
  actorId: string;
  actorRole?: string;
  key: string;
  requestId: string;
}

function requiredText(value: string, label: string): string {
  const result = value.trim();
  if (result.length < 2 || result.length > 160) {
    throw new DomainError("INVALID_INPUT", `${label} est invalide.`, 422);
  }
  return result;
}

async function effect<T extends JsonResult>(
  prisma: PrismaClient,
  context: CommandContext,
  payload: unknown,
  work: (tx: Tx) => Promise<T>,
): Promise<T & { replayed: boolean }> {
  const requestHash = await sha256Hex(canonicalJson(payload));
  return withDeadlockRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO idempotency_keys (id, organization_id, actor_id, key, request_hash, state, created_at)
        VALUES (${crypto.randomUUID()}::uuid, ${context.organizationId}::uuid, ${context.actorId}::uuid,
          ${context.key}::uuid, ${requestHash}, 'PROCESSING', NOW())
        ON CONFLICT (organization_id, actor_id, key) DO NOTHING
      `;
      const rows = await tx.$queryRaw<Array<{ request_hash: string; state: string; response_json: T | null }>>`
        SELECT request_hash, state, response_json FROM idempotency_keys
        WHERE organization_id = ${context.organizationId}::uuid AND actor_id = ${context.actorId}::uuid
          AND key = ${context.key}::uuid FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.request_hash !== requestHash) {
        throw new DomainError("IDEMPOTENCY_CONFLICT", "Cette clé d’idempotence porte une autre commande.", 409);
      }
      if (row.state === "DONE" && row.response_json) {
        return { ...row.response_json, replayed: true };
      }
      const response = await work(tx);
      await tx.idempotencyKey.update({
        where: { organizationId_actorId_key: { organizationId: context.organizationId, actorId: context.actorId, key: context.key } },
        data: { state: "DONE", responseStatus: 200, responseJson: response },
      });
      return { ...response, replayed: false };
    }),
  );
}

async function auditAndOutbox(
  tx: Tx,
  context: CommandContext,
  action: string,
  entityType: string,
  entityId: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  await writeAudit(tx, { actorId: context.actorId, action, entityType, entityId, requestId: context.requestId, afterJson: payload });
  await tx.outboxEvent.create({
    data: { id: crypto.randomUUID(), topic: `business.${action.toLowerCase()}`, aggregateId: entityId, payload },
  });
}

export async function createShop(
  prisma: PrismaClient,
  context: CommandContext,
  input: { code: string; name: string; currency?: string | undefined; timezone?: string | undefined },
) {
  const code = input.code.trim().toUpperCase();
  const name = requiredText(input.name, "Le nom");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) {
    throw new DomainError("INVALID_SHOP_CODE", "Le code boutique est invalide.", 422);
  }
  return effect(prisma, context, input, async (tx) => {
    const shop = await tx.shop.create({
      data: {
        organizationId: context.organizationId,
        createdById: context.actorId,
        code,
        name,
        currency: input.currency ?? "XAF",
        timezone: input.timezone ?? "Africa/Douala",
      },
    });
    await tx.location.create({
      data: { organizationId: context.organizationId, shopId: shop.id, name: `Stock ${name}`, type: "SHOP" },
    });
    await auditAndOutbox(tx, context, "SHOP_CREATED", "shops", shop.id, { code, name });
    return { id: shop.id, status: shop.status };
  });
}

export async function listShops(prisma: PrismaClient, organizationId: string) {
  const shops = await prisma.shop.findMany({
    where: { organizationId },
    include: {
      assignments: { where: { endedAt: null }, include: { user: { select: { displayName: true } } } },
      openingDrafts: { orderBy: { version: "desc" }, take: 1, select: { status: true, step: true, version: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return shops.map((shop) => ({
    id: shop.id,
    code: shop.code,
    name: shop.name,
    status: shop.status,
    currency: shop.currency,
    timezone: shop.timezone,
    manager: shop.assignments[0]?.user.displayName ?? null,
    opening: shop.openingDrafts[0] ?? null,
    updatedAt: shop.updatedAt.toISOString(),
  }));
}

export async function getShop(prisma: PrismaClient, organizationId: string, id: string) {
  const shop = await prisma.shop.findFirst({
    where: { id, organizationId },
    include: {
      assignments: { include: { user: { select: { id: true, displayName: true, status: true } } }, orderBy: { startedAt: "desc" } },
      locations: true,
      openingDrafts: { orderBy: { version: "desc" }, take: 1, include: { stockLines: true } },
    },
  });
  if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  return {
    ...shop,
    openingDrafts: shop.openingDrafts.map((draft) => ({
      ...draft,
      stockLines: draft.stockLines.map((line) => ({ ...line, quantity: line.quantity.toString(), unitCostMinor: line.unitCostMinor.toString() })),
    })),
  };
}

export async function updateShop(
  prisma: PrismaClient,
  context: CommandContext,
  id: string,
  input: { name?: string | undefined; currency?: string | undefined; timezone?: string | undefined },
) {
  return effect(prisma, context, { id, ...input }, async (tx) => {
    const shop = await tx.shop.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    if (shop.status === "CLOSED") throw new DomainError("SHOP_CLOSED", "Une boutique fermée ne peut plus être modifiée.", 409);
    const updated = await tx.shop.update({
      where: { id },
      data: {
        ...(input.name ? { name: requiredText(input.name, "Le nom") } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    });
    await auditAndOutbox(tx, context, "SHOP_UPDATED", "shops", id, { status: updated.status });
    return { id, status: updated.status };
  });
}

export async function transitionShop(
  prisma: PrismaClient,
  context: CommandContext,
  id: string,
  target: "ACTIVE" | "SUSPENDED" | "CLOSED",
  reason: string,
) {
  return effect(prisma, context, { id, target, reason }, async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM shops WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE
    `;
    const shop = rows[0];
    if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    const allowed: Record<string, string[]> = {
      SETUP: ["ACTIVE", "CLOSED"],
      ACTIVE: ["SUSPENDED", "CLOSED"],
      SUSPENDED: ["ACTIVE", "CLOSED"],
      CLOSED: [],
    };
    if (!allowed[shop.status]?.includes(target)) throw new DomainError("INVALID_SHOP_TRANSITION", "Transition de boutique interdite.", 409);
    if (target === "ACTIVE") {
      const [manager, opening] = await Promise.all([
        tx.managerAssignment.count({ where: { shopId: id, endedAt: null } }),
        tx.openingDraft.count({ where: { shopId: id, status: "VALIDATED" } }),
      ]);
      if (manager !== 1 || opening < 1) {
        throw new DomainError("SHOP_NOT_READY", "Validez l’initialisation et affectez un gérant avant l’activation.", 409);
      }
    }
    await tx.shop.update({
      where: { id },
      data: {
        status: target,
        ...(target === "ACTIVE" ? { activatedAt: new Date(), suspendedAt: null } : {}),
        ...(target === "SUSPENDED" ? { suspendedAt: new Date() } : {}),
        ...(target === "CLOSED" ? { closedAt: new Date() } : {}),
      },
    });
    await auditAndOutbox(tx, context, `SHOP_${target}`, "shops", id, { reason: requiredText(reason, "Le motif"), status: target });
    return { id, status: target };
  });
}

export async function listProducts(prisma: PrismaClient, organizationId: string, shopId?: string) {
  const products = await prisma.product.findMany({
    where: { organizationId, ...(shopId ? { shops: { some: { shopId, active: true } } } : {}) },
    include: {
      variants: { include: { units: { include: { prices: { orderBy: { validFrom: "desc" } } } } } },
      shops: true,
    },
    orderBy: { name: "asc" },
  });
  return products.map(({ imageKey, ...product }) => ({
    ...product,
    hasImage: Boolean(imageKey),
    imageUrl: imageKey ? `/api/v1/products/${product.id}/image` : null,
    variants: product.variants.map((variant) => ({
      ...variant,
      units: variant.units.map((unit) => ({
        ...unit,
        factor: unit.factor.toString(),
        prices: unit.prices.map((price) => ({ ...price, amountMinor: price.amountMinor.toString() })),
      })),
    })),
  }));
}

export async function createProduct(
  prisma: PrismaClient,
  context: CommandContext,
  input: { name: string; sku?: string | undefined; family?: string | undefined; tracksLots?: boolean | undefined; tracksExpiry?: boolean | undefined; shopIds?: string[] | undefined },
) {
  return effect(prisma, context, input, async (tx) => {
    const shopIds = [...new Set(input.shopIds ?? [])];
    if (shopIds.length) {
      const count = await tx.shop.count({ where: { organizationId: context.organizationId, id: { in: shopIds } } });
      if (count !== shopIds.length) throw new DomainError("INVALID_SCOPE", "Une boutique est hors de votre périmètre.", 404);
    }
    const product = await tx.product.create({
      data: {
        organizationId: context.organizationId,
        name: requiredText(input.name, "Le produit"),
        sku: input.sku?.trim() || null,
        family: input.family?.trim() || null,
        tracksLots: input.tracksLots ?? false,
        tracksExpiry: input.tracksExpiry ?? false,
        shops: { create: shopIds.map((shopId) => ({ shopId })) },
      },
    });
    await auditAndOutbox(tx, context, "PRODUCT_CREATED", "products", product.id, { name: product.name });
    return { id: product.id, status: product.status };
  });
}

export async function updateProduct(
  prisma: PrismaClient,
  context: CommandContext,
  id: string,
  input: { name?: string | undefined; family?: string | undefined; status?: "ACTIVE" | "INACTIVE" | undefined; shopIds?: string[] | undefined },
) {
  return effect(prisma, context, { id, ...input }, async (tx) => {
    const product = await tx.product.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "Produit introuvable.", 404);
    if (input.shopIds) {
      const shopIds = [...new Set(input.shopIds)];
      const count = await tx.shop.count({ where: { organizationId: context.organizationId, id: { in: shopIds } } });
      if (count !== shopIds.length) throw new DomainError("INVALID_SCOPE", "Une boutique est hors de votre périmètre.", 404);
      await tx.shopProduct.updateMany({ where: { productId: id }, data: { active: false } });
      for (const shopId of shopIds) {
        await tx.shopProduct.upsert({ where: { shopId_productId: { shopId, productId: id } }, create: { shopId, productId: id }, update: { active: true } });
      }
    }
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...(input.name ? { name: requiredText(input.name, "Le produit") } : {}),
        ...(input.family !== undefined ? { family: input.family.trim() || null } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });
    await auditAndOutbox(tx, context, "PRODUCT_UPDATED", "products", id, { status: updated.status });
    return { id, status: updated.status };
  });
}

export async function createVariant(
  prisma: PrismaClient,
  context: CommandContext,
  productId: string,
  input: { name: string; sku?: string | undefined; barcode?: string | undefined },
) {
  return effect(prisma, context, { productId, ...input }, async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, organizationId: context.organizationId } });
    if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "Produit introuvable.", 404);
    const variant = await tx.productVariant.create({
      data: { productId, name: requiredText(input.name, "La variante"), sku: input.sku?.trim() || null, barcode: input.barcode?.trim() || null },
    });
    await auditAndOutbox(tx, context, "VARIANT_CREATED", "product_variants", variant.id, { productId });
    return { id: variant.id, status: variant.status };
  });
}

export async function createUnit(
  prisma: PrismaClient,
  context: CommandContext,
  variantId: string,
  input: { name: string; symbol: string; factor: string; precision: number; isReference?: boolean | undefined },
) {
  parseQuantity(input.factor, 6);
  if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) {
    throw new DomainError("INVALID_PRECISION", "La précision doit être comprise entre 0 et 6.", 422);
  }
  return effect(prisma, context, { variantId, ...input }, async (tx) => {
    const variant = await tx.productVariant.findFirst({ where: { id: variantId, product: { organizationId: context.organizationId } } });
    if (!variant) throw new DomainError("VARIANT_NOT_FOUND", "Variante introuvable.", 404);
    const unit = await tx.saleUnit.create({
      data: {
        variantId,
        name: requiredText(input.name, "L’unité"),
        symbol: input.symbol.trim(),
        factor: input.factor,
        precision: input.precision,
        isReference: input.isReference ?? false,
      },
    });
    await auditAndOutbox(tx, context, "UNIT_CREATED", "sale_units", unit.id, { variantId, factor: input.factor });
    return { id: unit.id, status: unit.status };
  });
}

export async function createPrice(
  prisma: PrismaClient,
  context: CommandContext,
  input: { saleUnitId: string; shopId?: string | undefined; amountMinor: string; validFrom?: string | undefined },
) {
  const amount = parseMinor(input.amountMinor);
  if (amount < 0n) throw new DomainError("INVALID_MONEY", "Le prix ne peut pas être négatif.", 422);
  const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
  if (Number.isNaN(validFrom.getTime())) throw new DomainError("INVALID_DATE", "La date d’effet est invalide.", 422);
  return effect(prisma, context, input, async (tx) => {
    const unit = await tx.saleUnit.findFirst({ where: { id: input.saleUnitId, variant: { product: { organizationId: context.organizationId } } } });
    if (!unit) throw new DomainError("UNIT_NOT_FOUND", "Unité introuvable.", 404);
    if (input.shopId && !(await tx.shop.count({ where: { id: input.shopId, organizationId: context.organizationId } }))) {
      throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    }
    await tx.price.updateMany({
      where: { saleUnitId: input.saleUnitId, shopId: input.shopId ?? null, validUntil: null },
      data: { validUntil: validFrom },
    });
    const price = await tx.price.create({
      data: { saleUnitId: input.saleUnitId, shopId: input.shopId ?? null, amountMinor: amount, validFrom },
    });
    await auditAndOutbox(tx, context, "PRICE_CREATED", "prices", price.id, { amountMinor: amount.toString() });
    return { id: price.id, amountMinor: amount.toString() };
  });
}

export async function createPaymentSource(
  prisma: PrismaClient,
  context: CommandContext,
  input: { name: string; type: "CASH" | "BANK" | "MOBILE_MONEY" | "OTHER"; shopId?: string | undefined; currency?: string | undefined },
) {
  return effect(prisma, context, input, async (tx) => {
    if (input.shopId && !(await tx.shop.count({ where: { id: input.shopId, organizationId: context.organizationId } }))) {
      throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    }
    const name = requiredText(input.name, "La source");
    const source = await tx.paymentSource.create({
      data: {
        organizationId: context.organizationId,
        shopId: input.shopId ?? null,
        name,
        type: input.type,
        accounts: {
          create: {
            organizationId: context.organizationId,
            shopId: input.shopId ?? null,
            name,
            currency: input.currency ?? "XAF",
          },
        },
      },
    });
    await auditAndOutbox(tx, context, "PAYMENT_SOURCE_CREATED", "payment_sources", source.id, { name, type: input.type });
    return { id: source.id, status: source.status };
  });
}

export async function listPaymentSources(prisma: PrismaClient, organizationId: string, shopId?: string) {
  const sources = await prisma.paymentSource.findMany({
    where: { organizationId, ...(shopId ? { OR: [{ shopId }, { shopId: null }] } : {}) },
    include: { accounts: { select: { id: true, name: true, currency: true, balanceMinor: true } } },
    orderBy: { name: "asc" },
  });
  return sources.map((source) => ({
    ...source,
    accounts: source.accounts.map((account) => ({ ...account, balanceMinor: account.balanceMinor.toString() })),
  }));
}

export async function postOwnerFund(
  prisma: PrismaClient,
  context: CommandContext,
  input: {
    accountId: string;
    amountMinor: string;
    reason: string;
    type?: "OWNER_CONTRIBUTION" | "CORRECTION" | undefined;
    direction?: "CREDIT" | "DEBIT" | undefined;
    correctionOfId?: string | undefined;
  },
) {
  const amount = parseMinor(input.amountMinor);
  if (amount <= 0n) throw new DomainError("INVALID_MONEY", "Le montant doit être positif.", 422);
  const signedAmount = input.direction === "DEBIT" ? -amount : amount;
  if ((input.type === "CORRECTION") !== Boolean(input.correctionOfId)) {
    throw new DomainError("INVALID_CORRECTION", "Une correction doit référencer l’événement corrigé.", 422);
  }
  return effect(prisma, context, input, async (tx) => {
    const accounts = await tx.$queryRaw<Array<{ id: string; balance_minor: bigint }>>`
      SELECT id, balance_minor FROM money_accounts
      WHERE id = ${input.accountId}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE
    `;
    const account = accounts[0];
    if (!account) throw new DomainError("ACCOUNT_NOT_FOUND", "Compte de fonds introuvable.", 404);
    if (signedAmount < 0n && account.balance_minor < amount) {
      throw new DomainError("INSUFFICIENT_FUNDS", "Le solde est insuffisant pour cette correction.", 409);
    }
    if (input.correctionOfId) {
      const corrected = await tx.moneyEvent.findFirst({ where: { id: input.correctionOfId, organizationId: context.organizationId } });
      if (!corrected) throw new DomainError("MONEY_EVENT_NOT_FOUND", "Événement corrigé introuvable.", 404);
    }
    const event = await tx.moneyEvent.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: input.type ?? "OWNER_CONTRIBUTION",
        reason: requiredText(input.reason, "Le motif"),
        correctionOfId: input.correctionOfId ?? null,
        entries: { create: { accountId: input.accountId, amountMinor: signedAmount } },
      },
    });
    const updated = await tx.moneyAccount.update({
      where: { id: input.accountId },
      data: { balanceMinor: { increment: signedAmount }, version: { increment: 1 } },
    });
    const journal = await tx.journalEntry.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: input.type ?? "OWNER_CONTRIBUTION",
        referenceType: "money_events",
        referenceId: event.id,
        lines: { create: [{ accountCode: `ASSET:${input.accountId}`, amountMinor: signedAmount }, { accountCode: "EQUITY:OWNER", amountMinor: -signedAmount }] },
      },
    });
    await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedAt: new Date() } });
    await auditAndOutbox(tx, context, input.type === "CORRECTION" ? "OWNER_FUND_CORRECTED" : "OWNER_FUND_POSTED", "money_events", event.id, {
      accountId: input.accountId,
      amountMinor: signedAmount.toString(),
      ...(input.correctionOfId ? { correctionOfId: input.correctionOfId } : {}),
    });
    return { id: event.id, balanceMinor: updated.balanceMinor.toString() };
  });
}

export async function createDepot(prisma: PrismaClient, context: CommandContext, input: { name: string }) {
  return effect(prisma, context, input, async (tx) => {
    const location = await tx.location.create({
      data: { organizationId: context.organizationId, name: requiredText(input.name, "Le dépôt"), type: "DEPOT" },
    });
    await auditAndOutbox(tx, context, "DEPOT_CREATED", "locations", location.id, { name: location.name });
    return { id: location.id, status: location.status };
  });
}

export async function updateLocation(
  prisma: PrismaClient,
  context: CommandContext,
  id: string,
  input: { name?: string | undefined; status?: "ACTIVE" | "INACTIVE" | undefined },
) {
  return effect(prisma, context, { id, ...input }, async (tx) => {
    const location = await tx.location.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!location) throw new DomainError("LOCATION_NOT_FOUND", "Lieu introuvable.", 404);
    if (input.status === "INACTIVE") {
      const nonZero = await tx.stockBalance.count({ where: { locationId: id, quantity: { gt: 0 } } });
      if (nonZero) throw new DomainError("LOCATION_HAS_STOCK", "Traitez le stock avant de désactiver ce lieu.", 409);
    }
    const updated = await tx.location.update({
      where: { id },
      data: { ...(input.name ? { name: requiredText(input.name, "Le lieu") } : {}), ...(input.status ? { status: input.status } : {}) },
    });
    await auditAndOutbox(tx, context, "LOCATION_UPDATED", "locations", id, { status: updated.status });
    return { id, status: updated.status };
  });
}

export async function createPolicy(
  prisma: PrismaClient,
  context: CommandContext,
  input: { shopId?: string | undefined; values: Prisma.InputJsonObject; reason: string; effectiveAt?: string | undefined },
) {
  return effect(prisma, context, input, async (tx) => {
    if (input.shopId && !(await tx.shop.count({ where: { id: input.shopId, organizationId: context.organizationId } }))) {
      throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    }
    const latest = await tx.policy.findFirst({
      where: { organizationId: context.organizationId, shopId: input.shopId ?? null },
      orderBy: { version: "desc" },
    });
    const policy = await tx.policy.create({
      data: {
        organizationId: context.organizationId,
        shopId: input.shopId ?? null,
        actorId: context.actorId,
        version: (latest?.version ?? 0) + 1,
        values: input.values,
        reason: requiredText(input.reason, "Le motif"),
        effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : new Date(),
      },
    });
    await auditAndOutbox(tx, context, "POLICY_CREATED", "policies", policy.id, { version: policy.version });
    return { id: policy.id, version: policy.version };
  });
}

export interface OpeningInput {
  step: number;
  stockLines: Array<{ variantId: string; locationId: string; quantity: string; unitCostMinor: string; lotCode?: string | undefined; expiresAt?: string | undefined }>;
  funds?: Array<{ accountId: string; amountMinor: string }> | undefined;
  obligations?: Array<{ label: string; amountMinor: string }> | undefined;
}

export async function saveOpeningDraft(prisma: PrismaClient, context: CommandContext, shopId: string, input: OpeningInput) {
  if (!Number.isInteger(input.step) || input.step < 1 || input.step > 13) throw new DomainError("INVALID_STEP", "Étape invalide.", 422);
  const lines = input.stockLines.map((line) => ({
    ...line,
    quantityScaled: parseQuantity(line.quantity, 6),
    unitCost: parseMinor(line.unitCostMinor),
  }));
  if (lines.some((line) => line.unitCost < 0n)) throw new DomainError("INVALID_MONEY", "Un coût ne peut pas être négatif.", 422);
  return effect(prisma, context, { shopId, ...input }, async (tx) => {
    const shop = await tx.shop.findFirst({ where: { id: shopId, organizationId: context.organizationId } });
    if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    if (shop.status !== "SETUP") throw new DomainError("SHOP_ALREADY_OPEN", "Cette boutique n’est plus en initialisation.", 409);
    const current = await tx.openingDraft.findFirst({ where: { shopId, status: "DRAFT" }, orderBy: { version: "desc" } });
    const latest = current ?? await tx.openingDraft.findFirst({ where: { shopId }, orderBy: { version: "desc" }, select: { version: true } });
    const variantIds = [...new Set(lines.map((line) => line.variantId))];
    const locationIds = [...new Set(lines.map((line) => line.locationId))];
    if (
      (await tx.productVariant.count({ where: { id: { in: variantIds }, product: { organizationId: context.organizationId } } })) !== variantIds.length ||
      (await tx.location.count({
        where: {
          id: { in: locationIds },
          organizationId: context.organizationId,
          shopId,
        },
      })) !== locationIds.length
    ) throw new DomainError("INVALID_SCOPE", "Une ligne d’ouverture est hors périmètre.", 404);
    const draft = current
      ? await tx.openingDraft.update({
          where: { id: current.id },
          data: {
            actorId: context.actorId,
            step: input.step,
            funds: input.funds ?? [],
            stockLines: { deleteMany: {}, create: lines.map(toOpeningLine) },
            obligations: { deleteMany: {}, create: (input.obligations ?? []).map(toOpeningObligation) },
          },
        })
      : await tx.openingDraft.create({
          data: {
            organizationId: context.organizationId,
            shopId,
            actorId: context.actorId,
            version: (latest?.version ?? 0) + 1,
            step: input.step,
            funds: input.funds ?? [],
            stockLines: { create: lines.map(toOpeningLine) },
            obligations: { create: (input.obligations ?? []).map(toOpeningObligation) },
          },
        });
    await writeAudit(tx, { actorId: context.actorId, action: "OPENING_DRAFT_SAVED", entityType: "opening_drafts", entityId: draft.id, requestId: context.requestId, afterJson: { step: input.step } });
    return { id: draft.id, status: draft.status, step: draft.step };
  });
}

function toOpeningObligation(obligation: { label: string; amountMinor: string }) {
  const amount = parseMinor(obligation.amountMinor);
  if (amount < 0n) throw new DomainError("INVALID_MONEY", "Une obligation initiale ne peut pas être négative.", 422);
  return { label: requiredText(obligation.label, "L’obligation"), amountMinor: amount };
}

function toOpeningLine(line: OpeningInput["stockLines"][number] & { quantityScaled: bigint; unitCost: bigint }) {
  return {
    variantId: line.variantId,
    locationId: line.locationId,
    quantity: formatQuantity(line.quantityScaled),
    unitCostMinor: line.unitCost,
    lotCode: line.lotCode?.trim() || null,
    expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
  };
}

export async function validateOpening(prisma: PrismaClient, context: CommandContext, shopId: string) {
  return effect(prisma, context, { shopId, action: "validate-opening" }, async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM shops WHERE id = ${shopId}::uuid AND organization_id = ${context.organizationId}::uuid AND status = 'SETUP' FOR UPDATE
    `;
    if (!locked[0]) throw new DomainError("SHOP_NOT_FOUND", "Boutique en initialisation introuvable.", 404);
    const draft = await tx.openingDraft.findFirst({
      where: { shopId, status: "DRAFT" },
      orderBy: { version: "desc" },
      include: { stockLines: { include: { variant: { include: { product: true } }, location: true } }, obligations: true },
    });
    if (!draft) throw new DomainError("OPENING_DRAFT_REQUIRED", "Aucun brouillon à valider.", 409);
    if (!(await tx.managerAssignment.count({ where: { shopId, endedAt: null } }))) {
      throw new DomainError("MANAGER_REQUIRED", "Affectez un gérant avant la validation.", 409);
    }
    let stockValue = 0n;
    for (const line of draft.stockLines) {
      if (line.variant.product.organizationId !== context.organizationId || line.location.organizationId !== context.organizationId) {
        throw new DomainError("INVALID_SCOPE", "Une ligne d’ouverture est hors périmètre.", 404);
      }
      const quantity = line.quantity.toString();
      const lot = line.lotCode
        ? await tx.lot.upsert({
            where: { variantId_locationId_code: { variantId: line.variantId, locationId: line.locationId, code: line.lotCode } },
            create: { variantId: line.variantId, locationId: line.locationId, code: line.lotCode, expiresAt: line.expiresAt },
            update: {},
          })
        : null;
      const event = await tx.stockEvent.create({
        data: {
          organizationId: context.organizationId,
          shopId,
          actorId: context.actorId,
          type: "OPENING",
          originType: "opening_drafts",
          originId: draft.id,
          entries: { create: { variantId: line.variantId, locationId: line.locationId, lotId: lot?.id ?? null, quantity } },
        },
      });
      await tx.stockBalance.upsert({
        where: { variantId_locationId: { variantId: line.variantId, locationId: line.locationId } },
        create: { shopId, variantId: line.variantId, locationId: line.locationId, quantity },
        update: { quantity: { increment: quantity }, version: { increment: 1 } },
      });
      await tx.costLayer.create({
        data: {
          variantId: line.variantId,
          locationId: line.locationId,
          lotId: lot?.id ?? null,
          originType: "opening_drafts",
          originId: draft.id,
          initialQuantity: quantity,
          remainingQuantity: quantity,
          unitCostMinor: line.unitCostMinor,
          receivedAt: new Date(),
        },
      });
      const scaled = BigInt(line.quantity.toFixed(6).replace(".", ""));
      stockValue += (line.unitCostMinor * scaled) / 1_000_000n;
      void event;
    }
    const funds = Array.isArray(draft.funds) ? draft.funds as Array<{ accountId?: unknown; amountMinor?: unknown }> : [];
    let fundTotal = 0n;
    const obligationTotal = draft.obligations.reduce((sum, obligation) => sum + obligation.amountMinor, 0n);
    for (const fund of funds) {
      if (typeof fund.accountId !== "string" || typeof fund.amountMinor !== "string") throw new DomainError("INVALID_FUNDS", "Fonds initiaux invalides.", 422);
      const amount = parseMinor(fund.amountMinor);
      if (amount < 0n) throw new DomainError("INVALID_MONEY", "Un fonds initial ne peut pas être négatif.", 422);
      const account = await tx.moneyAccount.findFirst({ where: { id: fund.accountId, organizationId: context.organizationId, shopId } });
      if (!account) throw new DomainError("INVALID_OPENING_ACCOUNT", "Choisissez une source de fonds rattachée à cette boutique.", 422);
      const moneyEvent = await tx.moneyEvent.create({
        data: { organizationId: context.organizationId, actorId: context.actorId, type: "OPENING_FUND", reason: "Fonds initial validé", entries: { create: { accountId: account.id, amountMinor: amount } } },
      });
      await tx.moneyAccount.update({ where: { id: account.id }, data: { balanceMinor: { increment: amount }, version: { increment: 1 } } });
      fundTotal += amount;
      void moneyEvent;
    }
    const journal = await tx.journalEntry.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.actorId,
        type: "OPENING",
        referenceType: "opening_drafts",
        referenceId: draft.id,
        lines: {
          create: [
            ...(stockValue ? [{ accountCode: "ASSET:STOCK", amountMinor: stockValue }, { accountCode: "EQUITY:OPENING_STOCK", amountMinor: -stockValue }] : []),
            ...(fundTotal ? [{ accountCode: "ASSET:FUNDS", amountMinor: fundTotal }, { accountCode: "EQUITY:OPENING_FUNDS", amountMinor: -fundTotal }] : []),
            ...(obligationTotal ? [{ accountCode: "EQUITY:OPENING_OBLIGATIONS", amountMinor: obligationTotal }, { accountCode: "LIABILITY:OPENING", amountMinor: -obligationTotal }] : []),
          ],
        },
      },
    });
    if (stockValue || fundTotal || obligationTotal) {
      await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedAt: new Date() } });
    } else {
      await tx.journalLine.createMany({ data: [{ id: crypto.randomUUID(), entryId: journal.id, accountCode: "OPENING:ZERO", amountMinor: 0n }] });
      await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedAt: new Date() } });
    }
    const summary = {
      stockLines: draft.stockLines.length,
      stockValueMinor: stockValue.toString(),
      fundTotalMinor: fundTotal.toString(),
      obligationTotalMinor: obligationTotal.toString(),
    };
    await tx.openingDraft.update({ where: { id: draft.id }, data: { status: "VALIDATED", validatedAt: new Date(), summary } });
    await tx.organization.updateMany({ where: { id: context.organizationId, initializedAt: null }, data: { initializedAt: new Date() } });
    await auditAndOutbox(tx, context, "OPENING_VALIDATED", "opening_drafts", draft.id, summary);
    return { id: draft.id, status: "VALIDATED", ...summary };
  });
}

export async function listStock(prisma: PrismaClient, organizationId: string, shopId?: string) {
  const balances = await prisma.stockBalance.findMany({
    where: { location: { organizationId }, ...(shopId ? { shopId } : {}) },
    include: { variant: { include: { product: true } }, location: true },
    orderBy: [{ variant: { product: { name: "asc" } } }, { location: { name: "asc" } }],
  });
  return balances.map((balance) => ({
    id: balance.id,
    productId: balance.variant.product.id,
    variantId: balance.variant.id,
    locationId: balance.location.id,
    product: balance.variant.product.name,
    variant: balance.variant.name,
    quantity: balance.quantity.toString(),
    location: balance.location.name,
    shopId: balance.shopId,
    updatedAt: balance.updatedAt.toISOString(),
  }));
}

export async function listStockMovements(prisma: PrismaClient, organizationId: string, shopId?: string) {
  const events = await prisma.stockEvent.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    include: { entries: { include: { variant: { include: { product: true } }, location: true, lot: true } } },
    orderBy: { postedAt: "desc" },
  });
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    originType: event.originType,
    originId: event.originId,
    postedAt: event.postedAt.toISOString(),
    entries: event.entries.map((entry) => ({
      product: entry.variant.product.name,
      variant: entry.variant.name,
      location: entry.location.name,
      quantity: entry.quantity.toString(),
      lot: entry.lot?.code ?? null,
      expiresAt: entry.lot?.expiresAt?.toISOString().slice(0, 10) ?? null,
    })),
  }));
}

export async function ownerOverview(prisma: PrismaClient, organizationId: string, shopId?: string) {
  const scope = shopId ? { organizationId, id: shopId } : { organizationId };
  if (shopId && !(await prisma.shop.count({ where: scope }))) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  const [shops, products, variants, stock, funds, sources, productsWithoutPrice, sales] = await Promise.all([
    prisma.shop.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.product.count({ where: { organizationId, ...(shopId ? { shops: { some: { shopId, active: true } } } : {}) } }),
    prisma.productVariant.count({ where: { product: { organizationId, ...(shopId ? { shops: { some: { shopId, active: true } } } : {}) } } }),
    prisma.stockBalance.findMany({ where: { location: { organizationId }, ...(shopId ? { shopId } : {}) } }),
    prisma.moneyAccount.aggregate({ where: { organizationId, ...(shopId ? { shopId } : {}) }, _sum: { balanceMinor: true } }),
    prisma.paymentSource.count({ where: { organizationId, status: "ACTIVE", ...(shopId ? { OR: [{ shopId }, { shopId: null }] } : {}) } }),
    prisma.product.count({ where: { organizationId, variants: { some: { units: { none: { prices: { some: { validUntil: null, ...(shopId ? { OR: [{ shopId }, { shopId: null }] } : {}) } } } } } } } }),
    prisma.sale.aggregate({ where: { organizationId, status: "POSTED", ...(shopId ? { shopId } : {}) }, _count: true, _sum: { netMinor: true } }),
  ]);
  const active = shops.find((row) => row.status === "ACTIVE")?._count ?? 0;
  const totalShops = shops.reduce((sum, row) => sum + row._count, 0);
  const stockValueRows = await prisma.costLayer.findMany({ where: { location: { organizationId }, ...(shopId ? { location: { organizationId, shopId } } : {}) } });
  const stockValue = stockValueRows.reduce((sum, layer) => {
    const scaled = BigInt(layer.remainingQuantity.toFixed(6).replace(".", ""));
    return sum + (scaled * layer.unitCostMinor) / 1_000_000n;
  }, 0n);
  return {
    state: active > 0 ? (sales._count > 0 ? "ACTIVE" : "EMPTY") : "SETUP",
    scope: shopId ? { type: "SHOP", shopId } : { type: "GLOBAL" },
    currency: "XAF",
    timezone: "Africa/Douala",
    calculatedAt: new Date().toISOString(),
    freshness: "LIVE",
    coverage: "P04",
    indicators: {
      shops: { total: totalShops, byStatus: Object.fromEntries(shops.map((row) => [row.status, row._count])) },
      catalog: { products, variants, productsWithoutPrice },
      stock: {
        quantity: formatQuantity(stock.reduce((sum, row) => sum + BigInt(row.quantity.toFixed(6).replace(".", "")), 0n)),
        valueMinor: stockValue.toString(),
      },
      funds: { balanceMinor: (funds._sum.balanceMinor ?? 0n).toString(), activeSources: sources },
      sales: { count: sales._count, revenueMinor: (sales._sum.netMinor ?? 0n).toString() },
    },
    alerts: [
      ...(productsWithoutPrice ? [{ code: "PRODUCTS_WITHOUT_PRICE", count: productsWithoutPrice }] : []),
      ...(!active ? [{ code: "NO_ACTIVE_SHOP", count: totalShops }] : []),
    ],
  };
}
