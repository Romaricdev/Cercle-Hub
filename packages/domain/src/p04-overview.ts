import {
  aggregatePaymentsByType,
  averageBasketMinor,
  civilToUtcDate,
  ContractError,
  parseCivilDate,
  periodVariation,
  previousCivilPeriod,
} from "@cercle/contracts";
import type { Prisma, PrismaClient } from "@cercle/database";

import { DomainError } from "./errors.js";

const DEFAULT_TIMEZONE = "Africa/Douala";
const DEFAULT_LIMIT = 25;

export interface OwnerSalesQuery {
  shopId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  managerId?: string | undefined;
  status?: string | undefined;
  paymentSourceId?: string | undefined;
  query?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface OverviewPeriodQuery {
  shopId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

function civilToday(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function decodeCursor(value: string): { postedAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { postedAt?: string; id?: string };
    if (!parsed.postedAt || !parsed.id) throw new Error("cursor");
    const postedAt = new Date(parsed.postedAt);
    if (Number.isNaN(postedAt.getTime())) throw new Error("cursor");
    return { postedAt, id: parsed.id };
  } catch {
    throw new DomainError("INVALID_CURSOR", "Le curseur de pagination est invalide.", 400);
  }
}

function encodeCursor(postedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ postedAt: postedAt.toISOString(), id }), "utf8").toString("base64url");
}

async function resolveTimezone(prisma: PrismaClient, organizationId: string, shopId?: string): Promise<string> {
  if (!shopId) return DEFAULT_TIMEZONE;
  const shop = await prisma.shop.findFirst({ where: { id: shopId, organizationId }, select: { timezone: true } });
  if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  return shop.timezone || DEFAULT_TIMEZONE;
}

async function assertShop(prisma: PrismaClient, organizationId: string, shopId: string) {
  if (!(await prisma.shop.count({ where: { id: shopId, organizationId } }))) {
    throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
  }
}

export async function resolveOwnerPeriod(
  prisma: PrismaClient,
  organizationId: string,
  input: OverviewPeriodQuery,
): Promise<{ from: string; to: string; timezone: string; shopId?: string }> {
  if (input.shopId) await assertShop(prisma, organizationId, input.shopId);
  const timezone = await resolveTimezone(prisma, organizationId, input.shopId);
  const today = civilToday(timezone);
  try {
    const from = parseCivilDate(input.from ?? today, "La date de début");
    const to = parseCivilDate(input.to ?? input.from ?? today, "La date de fin");
    if (to < from) throw new DomainError("INVALID_PERIOD", "La date de fin précède la date de début.", 400);
    return { from, to, timezone, ...(input.shopId ? { shopId: input.shopId } : {}) };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error instanceof ContractError) throw new DomainError(error.code, error.message, 400);
    throw error;
  }
}

function saleWhere(
  organizationId: string,
  period: { from: string; to: string; shopId?: string },
  filters: OwnerSalesQuery = {},
): Prisma.SaleWhereInput {
  const query = filters.query?.trim();
  return {
    organizationId,
    ...(period.shopId ? { shopId: period.shopId } : {}),
    ...(filters.managerId ? { actorId: filters.managerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    businessDate: { gte: civilToUtcDate(period.from), lte: civilToUtcDate(period.to) },
    ...(filters.paymentSourceId ? { payments: { some: { account: { paymentSourceId: filters.paymentSourceId } } } } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            { lines: { some: { OR: [{ productName: { contains: query, mode: "insensitive" } }, { variantName: { contains: query, mode: "insensitive" } }] } } },
          ],
        }
      : {}),
  };
}

export async function listOwnerSales(prisma: PrismaClient, organizationId: string, input: OwnerSalesQuery) {
  if (input.shopId) await assertShop(prisma, organizationId, input.shopId);
  if (input.managerId && !(await prisma.appUser.count({ where: { id: input.managerId, organizationId } }))) {
    throw new DomainError("MANAGER_NOT_FOUND", "Gérant introuvable.", 404);
  }
  if (input.paymentSourceId && !(await prisma.paymentSource.count({ where: { id: input.paymentSourceId, organizationId } }))) {
    throw new DomainError("PAYMENT_SOURCE_NOT_FOUND", "Source de paiement introuvable.", 404);
  }
  if (input.status && !["POSTED", "REVERSED", "DRAFT"].includes(input.status)) {
    throw new DomainError("INVALID_STATUS", "Le statut de vente est invalide.", 400);
  }
  if (input.query && input.query.length > 80) throw new DomainError("INVALID_QUERY", "La recherche est trop longue.", 400);
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("INVALID_LIMIT", "La limite doit être un entier entre 1 et 100.", 400);
  const period = await resolveOwnerPeriod(prisma, organizationId, input);
  const where = saleWhere(organizationId, period, input);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const rows = await prisma.sale.findMany({
    where: cursor
      ? {
          AND: [
            where,
            {
              OR: [
                { postedAt: { lt: cursor.postedAt } },
                { postedAt: cursor.postedAt, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : where,
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      shop: { select: { id: true, name: true } },
      actor: { select: { id: true, displayName: true } },
      payments: { include: { account: { include: { paymentSource: { select: { name: true, type: true } } } } } },
      lines: { select: { id: true } },
    },
  });
  const page = rows.slice(0, limit);
  const [posted, reversed, collected] = await Promise.all([
    prisma.sale.aggregate({ where: { ...where, status: "POSTED" }, _count: true, _sum: { netMinor: true } }),
    prisma.sale.count({ where: { ...where, status: "REVERSED" } }),
    prisma.salePayment.aggregate({ where: { sale: { ...where, status: "POSTED" } }, _sum: { amountMinor: true } }),
  ]);
  const revenue = posted._sum.netMinor ?? 0n;
  const collectedMinor = collected._sum.amountMinor ?? 0n;
  const basket = averageBasketMinor(revenue, BigInt(posted._count));
  return {
    period: { from: period.from, to: period.to, timezone: period.timezone },
    scope: period.shopId ? { type: "SHOP" as const, shopId: period.shopId } : { type: "GLOBAL" as const },
    freshness: "LIVE",
    calculatedAt: new Date().toISOString(),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!.postedAt, page[page.length - 1]!.id) : null,
    totals: {
      count: posted._count,
      revenueMinor: revenue.toString(),
      collectedMinor: collectedMinor.toString(),
      averageBasketMinor: basket.amountMinor,
      reversedCount: reversed,
    },
    sales: page.map((sale) => ({
      id: sale.id,
      reference: sale.reference,
      status: sale.status,
      postedAt: sale.postedAt.toISOString(),
      businessDate: sale.businessDate.toISOString().slice(0, 10),
      shopId: sale.shop.id,
      shopName: sale.shop.name,
      managerId: sale.actor.id,
      managerName: sale.actor.displayName,
      lineCount: sale.lines.length,
      netMinor: sale.netMinor.toString(),
      collectedMinor: sale.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n).toString(),
      paymentModes: [...new Set(sale.payments.map((payment) => payment.account.paymentSource.type))],
      paymentLabels: [...new Set(sale.payments.map((payment) => payment.account.paymentSource.name))],
    })),
  };
}

export async function getOwnerSale(prisma: PrismaClient, organizationId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, organizationId },
    include: {
      shop: { select: { id: true, name: true, timezone: true } },
      actor: { select: { id: true, displayName: true } },
      device: { select: { id: true, name: true } },
      session: { select: { id: true, businessDate: true } },
      lines: {
        include: {
          variant: { include: { product: { select: { id: true, imageKey: true } } } },
          costAllocations: { select: { valueMinor: true, quantity: true } },
        },
      },
      payments: { include: { account: { include: { paymentSource: { select: { id: true, name: true, type: true } } } } } },
    },
  });
  if (!sale) throw new DomainError("SALE_NOT_FOUND", "Vente introuvable.", 404);
  const stockEvents = await prisma.stockEvent.findMany({
    where: { organizationId, originType: "sales", originId: sale.id },
    orderBy: { postedAt: "asc" },
    include: { entries: { include: { variant: { include: { product: { select: { name: true } } } }, location: { select: { name: true } } } } },
  });
  const collected = sale.payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
  const due = sale.netMinor - collected;
  const timeline = [
    { type: "SALE_POSTED", at: sale.postedAt.toISOString(), label: "Vente enregistrée" },
    ...sale.payments.map((payment) => ({
      type: "PAYMENT_RECORDED",
      at: sale.postedAt.toISOString(),
      label: `Paiement ${payment.account.paymentSource.name}`,
    })),
    ...stockEvents.map((event) => ({
      type: "STOCK_MOVED",
      at: event.postedAt.toISOString(),
      label: "Stock retiré",
    })),
    ...(sale.status === "REVERSED" ? [{ type: "SALE_REVERSED", at: sale.postedAt.toISOString(), label: "Vente renversée" }] : []),
  ];
  return {
    id: sale.id,
    reference: sale.reference,
    status: sale.status,
    postedAt: sale.postedAt.toISOString(),
    businessDate: sale.businessDate.toISOString().slice(0, 10),
    shop: { id: sale.shop.id, name: sale.shop.name },
    manager: { id: sale.actor.id, name: sale.actor.displayName },
    device: { id: sale.device.id, name: sale.device.name },
    sessionId: sale.session.id,
    grossMinor: sale.grossMinor.toString(),
    discountMinor: sale.discountMinor.toString(),
    netMinor: sale.netMinor.toString(),
    collectedMinor: collected.toString(),
    dueMinor: due > 0n ? due.toString() : null,
    costMinor: sale.costMinor.toString(),
    estimatedGrossMarginMinor: (sale.netMinor - sale.costMinor).toString(),
    estimatedGrossMargin: true,
    lines: sale.lines.map((line) => ({
      id: line.id,
      product: line.productName,
      variant: line.variantName,
      unit: line.unitName,
      symbol: line.unitSymbol,
      quantity: line.quantity.toString(),
      unitPriceMinor: line.unitPriceMinor.toString(),
      discountMinor: line.discountMinor.toString(),
      netMinor: line.netMinor.toString(),
      costMinor: line.costMinor.toString(),
      imageUrl: line.variant.product.imageKey ? `/api/v1/products/${line.variant.product.id}/image` : null,
    })),
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      sourceId: payment.account.paymentSource.id,
      source: payment.account.paymentSource.name,
      mode: payment.account.paymentSource.type,
      amountMinor: payment.amountMinor.toString(),
      cashReceivedMinor: payment.cashReceivedMinor?.toString() ?? null,
      changeDueMinor: payment.changeDueMinor?.toString() ?? null,
      changeGivenMinor: payment.changeGivenMinor?.toString() ?? null,
      externalReference: payment.externalReference,
    })),
    timeline,
  };
}

export async function ownerSalesCommerce(prisma: PrismaClient, organizationId: string, input: OverviewPeriodQuery = {}) {
  const period = await resolveOwnerPeriod(prisma, organizationId, input);
  const previous = previousCivilPeriod(period.from, period.to);
  const currentWhere: Prisma.SaleWhereInput = {
    organizationId,
    status: "POSTED",
    ...(period.shopId ? { shopId: period.shopId } : {}),
    businessDate: { gte: civilToUtcDate(period.from), lte: civilToUtcDate(period.to) },
  };
  const previousWhere: Prisma.SaleWhereInput = {
    ...currentWhere,
    businessDate: { gte: civilToUtcDate(previous.from), lte: civilToUtcDate(previous.to) },
  };
  const [current, previousAgg, payments, shops, recent, topLines, allTimeCount] = await Promise.all([
    prisma.sale.aggregate({ where: currentWhere, _count: true, _sum: { netMinor: true } }),
    prisma.sale.aggregate({ where: previousWhere, _count: true, _sum: { netMinor: true } }),
    prisma.salePayment.findMany({ where: { sale: currentWhere }, select: { mode: true, amountMinor: true, account: { select: { paymentSource: { select: { type: true } } } } } }),
    prisma.sale.groupBy({ by: ["shopId"], where: currentWhere, _count: true, _sum: { netMinor: true }, _max: { postedAt: true } }),
    prisma.sale.findMany({
      where: currentWhere,
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      take: 8,
      include: { shop: { select: { name: true } }, actor: { select: { displayName: true } } },
    }),
    prisma.saleLine.groupBy({
      by: ["variantId", "productName", "variantName"],
      where: { sale: currentWhere },
      _sum: { netMinor: true, quantity: true },
      orderBy: { _sum: { netMinor: "desc" } },
      take: 5,
    }),
    prisma.sale.count({ where: { organizationId, status: "POSTED", ...(period.shopId ? { shopId: period.shopId } : {}) } }),
  ]);
  const revenue = current._sum.netMinor ?? 0n;
  const previousRevenue = previousAgg._sum.netMinor ?? 0n;
  const collectedRows = payments.map((payment) => ({
    mode: payment.account.paymentSource.type || payment.mode,
    amountMinor: payment.amountMinor,
  }));
  const collections = aggregatePaymentsByType(collectedRows);
  const basket = averageBasketMinor(revenue, BigInt(current._count));
  const variation = periodVariation(revenue, previousRevenue);
  const shopNames = shops.length
    ? Object.fromEntries((await prisma.shop.findMany({ where: { id: { in: shops.map((row) => row.shopId) } }, select: { id: true, name: true } })).map((shop) => [shop.id, shop.name]))
    : {};
  return {
    period: { from: period.from, to: period.to, timezone: period.timezone, previous },
    available: allTimeCount > 0,
    allTimeCount,
    count: current._count,
    revenueMinor: revenue.toString(),
    collectedMinor: collections.total,
    averageBasketMinor: basket.amountMinor,
    variation: variation.available
      ? { available: true as const, bps: variation.bps, direction: variation.direction, previousRevenueMinor: previousRevenue.toString() }
      : { available: false as const, bps: null, direction: null, previousRevenueMinor: previousRevenue > 0n ? previousRevenue.toString() : null },
    shopsWithSales: shops.length,
    collections,
    recentSales: recent.map((sale) => ({
      id: sale.id,
      reference: sale.reference,
      shopName: sale.shop.name,
      managerName: sale.actor.displayName,
      netMinor: sale.netMinor.toString(),
      status: sale.status,
      postedAt: sale.postedAt.toISOString(),
    })),
    shops: shops.map((row) => {
      const shopRevenue = row._sum.netMinor ?? 0n;
      const shopBasket = averageBasketMinor(shopRevenue, BigInt(row._count));
      return {
        shopId: row.shopId,
        name: shopNames[row.shopId] ?? "Boutique",
        revenueMinor: shopRevenue.toString(),
        count: row._count,
        averageBasketMinor: shopBasket.amountMinor,
        lastSaleAt: row._max.postedAt?.toISOString() ?? null,
        freshness: "LIVE",
      };
    }),
    topProducts: topLines.map((row) => ({
      variantId: row.variantId,
      product: row.productName,
      variant: row.variantName,
      quantity: row._sum.quantity?.toString() ?? "0",
      revenueMinor: (row._sum.netMinor ?? 0n).toString(),
    })),
  };
}
