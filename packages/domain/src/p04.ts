import { canonicalJson, sha256Hex } from "@cercle/contracts";
import type { Prisma, PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError, withDeadlockRetry } from "./errors.js";

type Tx = Prisma.TransactionClient;
type JsonResult = Prisma.InputJsonObject;
export type SaleContext = { organizationId: string; actorId: string; key: string; requestId: string };
export type SaleLineInput = { saleUnitId: string; quantity: string; discountMinor?: string | undefined };
export type PaymentInput = { accountId: string; amountMinor: string; cashReceivedMinor?: string | undefined; changeGivenMinor?: string | undefined; externalReference?: string | undefined };

const SCALE = 1_000_000n;

function scaled(value: string, label = "La quantité"): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new DomainError("INVALID_QUANTITY", `${label} est invalide.`, 422);
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole!) * SCALE + BigInt((fraction + "000000").slice(0, 6));
  if (result <= 0n) throw new DomainError("INVALID_QUANTITY", `${label} doit être positive.`, 422);
  return result;
}

function decimal(value: bigint): string {
  const sign = value < 0n ? "-" : ""; const absolute = value < 0n ? -value : value;
  const whole = absolute / SCALE; const fraction = (absolute % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${fraction ? `${whole}.${fraction}` : whole.toString()}`;
}

function money(value: string, label = "Le montant"): bigint {
  if (!/^\d+$/.test(value)) throw new DomainError("INVALID_MONEY", `${label} est invalide.`, 422);
  return BigInt(value);
}

function roundHalfUp(numerator: bigint, denominator = SCALE): bigint {
  return (numerator + denominator / 2n) / denominator;
}

async function effect<T extends JsonResult>(prisma: PrismaClient, context: SaleContext, payload: unknown, work: (tx: Tx) => Promise<T>) {
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

async function managerScope(tx: Tx, organizationId: string, actorId: string) {
  const assignment = await tx.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null, user: { organizationId, status: "ACTIVE" } }, include: { shop: true } });
  if (!assignment || assignment.shop.status !== "ACTIVE") throw new DomainError("SHOP_NOT_ACTIVE", "Votre boutique doit être active pour vendre.", 409);
  const device = await tx.device.findFirst({ where: { userId: actorId, shopId: assignment.shopId, status: "ACTIVE" }, orderBy: { registeredAt: "desc" } });
  if (!device) throw new DomainError("PRIMARY_DEVICE_REQUIRED", "Cet appareil doit être approuvé avant toute vente.", 403);
  return { shop: assignment.shop, device };
}

function businessDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function openCashSession(prisma: PrismaClient, context: SaleContext) {
  return effect(prisma, context, { action: "open-cash-session" }, async (tx) => {
    const { shop, device } = await managerScope(tx, context.organizationId, context.actorId);
    const existing = await tx.cashSession.findFirst({ where: { shopId: shop.id, status: { in: ["OPEN", "COUNTING"] } } });
    if (existing) {
      if (existing.managerId !== context.actorId) throw new DomainError("CASH_SESSION_BUSY", "Une session est déjà ouverte pour cette boutique.", 409);
      return { id: existing.id, status: existing.status, businessDate: existing.businessDate.toISOString().slice(0, 10) };
    }
    const location = await tx.location.findFirst({ where: { shopId: shop.id, type: "SHOP", status: "ACTIVE" } });
    if (!location) throw new DomainError("STOCK_LOCATION_REQUIRED", "Aucun lieu de stock actif n’est configuré.", 409);
    const date = businessDate(new Date(), shop.timezone);
    const session = await tx.cashSession.create({ data: { organizationId: context.organizationId, shopId: shop.id, managerId: context.actorId, deviceId: device.id, locationId: location.id, businessDate: new Date(`${date}T00:00:00.000Z`) } });
    await writeAudit(tx, { actorId: context.actorId, action: "CASH_SESSION_OPENED", entityType: "cash_sessions", entityId: session.id, requestId: context.requestId, afterJson: { shopId: shop.id, businessDate: date } });
    await tx.outboxEvent.create({ data: { id: crypto.randomUUID(), topic: "business.cash_session_opened", aggregateId: session.id, payload: { shopId: shop.id, businessDate: date } } });
    return { id: session.id, status: session.status, businessDate: date };
  });
}

export async function managerSaleContext(prisma: PrismaClient, organizationId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const { shop, device } = await managerScope(tx, organizationId, actorId);
    const session = await tx.cashSession.findFirst({ where: { shopId: shop.id, managerId: actorId, status: { in: ["OPEN", "COUNTING"] } } });
    const products = await tx.shopProduct.findMany({
      where: { shopId: shop.id, active: true, product: { status: "ACTIVE" } },
      include: {
        product: {
          include: {
            variants: {
              where: { status: "ACTIVE" },
              include: {
                units: {
                  where: { status: "ACTIVE" },
                  include: { prices: { where: { OR: [{ shopId: shop.id }, { shopId: null }], validUntil: null }, orderBy: { shopId: "desc" } } },
                },
                stockBalances: { where: { location: { shopId: shop.id } } },
              },
            },
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });
    const accounts = await tx.moneyAccount.findMany({ where: { organizationId, shopId: shop.id, paymentSource: { status: "ACTIVE" } }, include: { paymentSource: true }, orderBy: { name: "asc" } });
    return {
      shop: { id: shop.id, name: shop.name, code: shop.code, currency: shop.currency }, device: { id: device.id, name: device.name },
      session: session ? { id: session.id, status: session.status, businessDate: session.businessDate.toISOString().slice(0, 10) } : null,
      products: products.map(({ product }) => ({ id: product.id, name: product.name, sku: product.sku, imageKey: product.imageKey, variants: product.variants.map((variant) => ({ id: variant.id, name: variant.name, barcode: variant.barcode, available: variant.stockBalances.reduce((sum, item) => sum + Number(item.quantity), 0).toString(), units: variant.units.flatMap((unit) => unit.prices[0] ? [{ id: unit.id, name: unit.name, symbol: unit.symbol, factor: unit.factor.toString(), precision: unit.precision, priceMinor: unit.prices[0].amountMinor.toString() }] : []) })) })),
      accounts: accounts.map((account) => ({ id: account.id, name: account.name, type: account.paymentSource.type })),
    };
  });
}

async function calculateQuote(tx: Tx, organizationId: string, shopId: string, lines: SaleLineInput[]) {
  if (!lines.length || lines.length > 100) throw new DomainError("EMPTY_CART", "Ajoutez au moins un produit.", 422);
  const policy = await tx.policy.findFirst({ where: { organizationId, OR: [{ shopId }, { shopId: null }], effectiveAt: { lte: new Date() } }, orderBy: [{ shopId: "desc" }, { effectiveAt: "desc" }] });
  const values = policy?.values && typeof policy.values === "object" && !Array.isArray(policy.values) ? policy.values as Record<string, unknown> : {};
  const maxDiscountPercent = typeof values.maxDiscountPercent === "number" ? values.maxDiscountPercent : 0;
  const result = [];
  let grossTotal = 0n; let discountTotal = 0n;
  for (const input of lines) {
    const unit = await tx.saleUnit.findFirst({ where: { id: input.saleUnitId, status: "ACTIVE", variant: { status: "ACTIVE", product: { organizationId, status: "ACTIVE", shops: { some: { shopId, active: true } } } } }, include: { variant: { include: { product: true } }, prices: { where: { OR: [{ shopId }, { shopId: null }], validFrom: { lte: new Date() }, validUntil: null }, orderBy: { shopId: "desc" } } } });
    const price = unit?.prices[0];
    if (!unit || !price) throw new DomainError("PRICE_NOT_FOUND", "Un produit du panier n’a pas de prix actif.", 409);
    const quantity = scaled(input.quantity); const factor = scaled(unit.factor.toString(), "Le format");
    if (unit.precision === 0 && quantity % SCALE !== 0n) throw new DomainError("INVALID_PRECISION", `${unit.name} se vend uniquement en quantité entière.`, 422);
    const quantityBase = roundHalfUp(quantity * factor);
    const gross = roundHalfUp(price.amountMinor * quantity); const discount = money(input.discountMinor ?? "0", "La remise");
    if (discount > gross || (gross > 0n && discount * 100n > gross * BigInt(maxDiscountPercent))) throw new DomainError("DISCOUNT_APPROVAL_REQUIRED", `La remise autorisée est limitée à ${maxDiscountPercent} %.`, 409);
    grossTotal += gross; discountTotal += discount;
    result.push({ saleUnitId: unit.id, variantId: unit.variantId, productName: unit.variant.product.name, variantName: unit.variant.name, unitName: unit.name, unitSymbol: unit.symbol, quantity: decimal(quantity), quantityBase: decimal(quantityBase), unitPriceMinor: price.amountMinor.toString(), grossMinor: gross.toString(), discountMinor: discount.toString(), netMinor: (gross - discount).toString() });
  }
  return { lines: result, grossMinor: grossTotal.toString(), discountMinor: discountTotal.toString(), netMinor: (grossTotal - discountTotal).toString() };
}

export async function quoteSale(prisma: PrismaClient, organizationId: string, actorId: string, lines: SaleLineInput[]) {
  return prisma.$transaction(async (tx) => {
    const { shop, device } = await managerScope(tx, organizationId, actorId);
    const session = await tx.cashSession.findFirst({ where: { shopId: shop.id, managerId: actorId, deviceId: device.id, status: { in: ["OPEN", "COUNTING"] } } });
    if (!session) throw new DomainError("CASH_SESSION_REQUIRED", "Ouvrez votre session de caisse avant de vendre.", 409);
    if (session.status === "COUNTING") throw new DomainError("COUNT_IN_PROGRESS", "Terminez ou annulez le comptage avant de vendre.", 409);
    const quote = await calculateQuote(tx, organizationId, shop.id, lines);
    const payloadHash = await sha256Hex(canonicalJson({ lines: quote.lines.map(({ saleUnitId, quantity, discountMinor }) => ({ saleUnitId, quantity, discountMinor })) }));
    const authorization = await tx.onlineAuthorization.create({ data: { deviceId: device.id, sessionId: session.id, payloadHash, expiresAt: new Date(Date.now() + 5 * 60_000) } });
    return { ...quote, authorizationId: authorization.id, expiresAt: authorization.expiresAt.toISOString() };
  });
}

export async function postSale(prisma: PrismaClient, context: SaleContext, input: { authorizationId: string; lines: SaleLineInput[]; payments: PaymentInput[] }) {
  return effect(prisma, context, input, async (tx) => {
    const { shop, device } = await managerScope(tx, context.organizationId, context.actorId);
    const sessionRows = await tx.$queryRaw<Array<{ id: string; location_id: string; business_date: Date; status: string }>>`SELECT id,location_id,business_date,status FROM cash_sessions WHERE shop_id=${shop.id}::uuid AND manager_id=${context.actorId}::uuid AND device_id=${device.id}::uuid AND status IN ('OPEN','COUNTING') FOR UPDATE`;
    const session = sessionRows[0]; if (!session) throw new DomainError("CASH_SESSION_REQUIRED", "La session de caisse n’est pas ouverte.", 409);
    if (session.status === "COUNTING") throw new DomainError("COUNT_IN_PROGRESS", "Terminez ou annulez le comptage avant de vendre.", 409);
    const quote = await calculateQuote(tx, context.organizationId, shop.id, input.lines);
    const payloadHash = await sha256Hex(canonicalJson({ lines: quote.lines.map(({ saleUnitId, quantity, discountMinor }) => ({ saleUnitId, quantity, discountMinor })) }));
    const authorization = await tx.onlineAuthorization.findFirst({ where: { id: input.authorizationId, deviceId: device.id, sessionId: session.id } });
    if (!authorization || authorization.expiresAt <= new Date() || authorization.payloadHash !== payloadHash || authorization.consumedOperationId) throw new DomainError("ONLINE_AUTHORIZATION_INVALID", "Le devis a expiré ou ne correspond plus au panier.", 409);
    const net = BigInt(quote.netMinor); const paymentTotal = input.payments.reduce((sum, item) => sum + money(item.amountMinor), 0n);
    if (input.payments.length < 1 || input.payments.length > 10 || paymentTotal !== net) throw new DomainError("PAYMENT_TOTAL_MISMATCH", "La somme des paiements doit être égale au total de la vente.", 422);
    const saleId = crypto.randomUUID(); const reference = `V-${session.business_date.toISOString().slice(0,10).replaceAll("-","")}-${saleId.slice(0,8).toUpperCase()}`;
    const sale = await tx.sale.create({ data: { id: saleId, organizationId: context.organizationId, shopId: shop.id, sessionId: session.id, actorId: context.actorId, deviceId: device.id, reference, status: "DRAFT", grossMinor: BigInt(quote.grossMinor), discountMinor: BigInt(quote.discountMinor), netMinor: net, costMinor: 0n, businessDate: session.business_date } });
    let totalCost = 0n;
    for (const quoted of quote.lines) {
      await tx.$queryRaw`SELECT id FROM stock_balances WHERE variant_id=${quoted.variantId}::uuid AND location_id=${session.location_id}::uuid FOR UPDATE`;
      const balance = await tx.stockBalance.findUnique({ where: { variantId_locationId: { variantId: quoted.variantId, locationId: session.location_id } } });
      let remaining = scaled(quoted.quantityBase);
      if (!balance || scaled(balance.quantity.toString()) < remaining) throw new DomainError("INSUFFICIENT_STOCK", `${quoted.productName} · ${quoted.variantName} : stock insuffisant.`, 409);
      const layerIds = await tx.$queryRaw<Array<{ id: string }>>`SELECT cl.id FROM cost_layers cl LEFT JOIN lots l ON l.id=cl.lot_id WHERE cl.variant_id=${quoted.variantId}::uuid AND cl.location_id=${session.location_id}::uuid AND cl.compartment='AVAILABLE' AND cl.remaining_quantity>0 AND (l.expires_at IS NULL OR l.expires_at>=CURRENT_DATE) ORDER BY l.expires_at ASC NULLS LAST,cl.received_at ASC,cl.id ASC FOR UPDATE OF cl`;
      const layers = await tx.costLayer.findMany({ where: { id: { in: layerIds.map(({ id }) => id) } }, include: { lot: true } });
      const ordered = layerIds.map(({ id }) => layers.find((layer) => layer.id === id)!).filter(Boolean);
      const lineId = crypto.randomUUID(); let lineCost = 0n; const allocations: Array<{ layerId: string; quantity: string; valueMinor: bigint }> = [];
      for (const layer of ordered) {
        if (remaining === 0n) break;
        const available = scaled(layer.remainingQuantity.toString()); const taken = available < remaining ? available : remaining;
        const remainingValue = layer.remainingValueMinor;
        const value = taken === available ? remainingValue : roundHalfUp(remainingValue * taken, available);
        lineCost += value; remaining -= taken;
        allocations.push({ layerId: layer.id, quantity: decimal(taken), valueMinor: value });
        await tx.costLayer.update({ where: { id: layer.id }, data: { remainingQuantity: { decrement: decimal(taken) }, remainingValueMinor: { decrement: value } } });
      }
      if (remaining > 0n) throw new DomainError("INSUFFICIENT_VALUED_STOCK", "Le stock valorisé disponible est insuffisant.", 409);
      await tx.saleLine.create({ data: { id: lineId, saleId, variantId: quoted.variantId, saleUnitId: quoted.saleUnitId, productName: quoted.productName, variantName: quoted.variantName, unitName: quoted.unitName, unitSymbol: quoted.unitSymbol, quantity: quoted.quantity, quantityBase: quoted.quantityBase, unitPriceMinor: BigInt(quoted.unitPriceMinor), grossMinor: BigInt(quoted.grossMinor), discountMinor: BigInt(quoted.discountMinor), netMinor: BigInt(quoted.netMinor), costMinor: lineCost } });
      await tx.stockCostAllocation.createMany({ data: allocations.map((item) => ({ id: crypto.randomUUID(), saleLineId: lineId, ...item })) });
      const stockEvent = await tx.stockEvent.create({ data: { organizationId: context.organizationId, shopId: shop.id, actorId: context.actorId, type: "SALE", originType: "sales", originId: saleId, entries: { create: { variantId: quoted.variantId, locationId: session.location_id, quantity: decimal(-scaled(quoted.quantityBase)) } } } });
      await tx.stockBalance.update({ where: { variantId_locationId: { variantId: quoted.variantId, locationId: session.location_id } }, data: { quantity: { decrement: quoted.quantityBase }, version: { increment: 1 } } });
      totalCost += lineCost; void stockEvent;
    }
    const paymentRows = [];
    for (const payment of input.payments) {
      const accountRows = await tx.$queryRaw<Array<{ id: string; type: string }>>`SELECT ma.id,ps.type FROM money_accounts ma JOIN payment_sources ps ON ps.id=ma.payment_source_id WHERE ma.id=${payment.accountId}::uuid AND ma.organization_id=${context.organizationId}::uuid AND ma.shop_id=${shop.id}::uuid AND ps.status='ACTIVE' FOR UPDATE OF ma`;
      const account = accountRows[0]; if (!account) throw new DomainError("PAYMENT_ACCOUNT_INVALID", "Une source de paiement est invalide.", 422);
      const amount = money(payment.amountMinor); const cashReceived = payment.cashReceivedMinor ? money(payment.cashReceivedMinor, "Le montant reçu") : null;
      const changeGiven = payment.changeGivenMinor ? money(payment.changeGivenMinor, "La monnaie rendue") : payment.changeGivenMinor === "0" ? 0n : null;
      if (account.type === "CASH" && cashReceived === null) throw new DomainError("CASH_RECEIVED_REQUIRED", "Indiquez la somme remise par le client.", 422);
      if (account.type === "CASH" && cashReceived! < amount) throw new DomainError("CASH_RECEIVED_TOO_LOW", "Le montant reçu est insuffisant.", 422);
      const changeDue = account.type === "CASH" ? cashReceived! - amount : null;
      if (account.type === "CASH" && changeGiven !== changeDue) throw new DomainError("CHANGE_MISMATCH", "La monnaie déclarée ne correspond pas au montant calculé.", 422);
      if (account.type !== "CASH" && (cashReceived !== null || changeGiven !== null)) throw new DomainError("INVALID_PAYMENT_DETAILS", "Les informations de monnaie sont réservées aux paiements en espèces.", 422);
      const paymentRow = await tx.salePayment.create({ data: { saleId, accountId: account.id, mode: account.type, amountMinor: amount, cashReceivedMinor: cashReceived, changeDueMinor: changeDue, changeGivenMinor: changeGiven, externalReference: payment.externalReference?.trim() || null } });
      const event = await tx.moneyEvent.create({ data: { organizationId: context.organizationId, actorId: context.actorId, type: "SALE_PAYMENT", reason: `Vente ${reference}`, entries: { create: { accountId: account.id, amountMinor: amount } } } });
      await tx.moneyAccount.update({ where: { id: account.id }, data: { balanceMinor: { increment: amount }, version: { increment: 1 } } });
      paymentRows.push({ id: paymentRow.id, mode: account.type, amountMinor: amount.toString(), cashReceivedMinor: cashReceived?.toString() ?? null, changeDueMinor: changeDue?.toString() ?? null, changeGivenMinor: changeGiven?.toString() ?? null }); void event;
    }
    await tx.sale.update({ where: { id: saleId }, data: { costMinor: totalCost, status: "POSTED" } });
    const journal = await tx.journalEntry.create({ data: { organizationId: context.organizationId, actorId: context.actorId, type: "SALE", status: "DRAFT", referenceType: "sales", referenceId: saleId, lines: { create: [{ accountCode: "ASSET:FUNDS", amountMinor: net }, { accountCode: "INCOME:SALES", amountMinor: -net }, { accountCode: "EXPENSE:COGS", amountMinor: totalCost }, { accountCode: "ASSET:STOCK", amountMinor: -totalCost }] } } });
    await tx.journalEntry.update({ where: { id: journal.id }, data: { status: "POSTED", postedAt: new Date() } });
    await tx.onlineAuthorization.update({ where: { id: authorization.id }, data: { consumedOperationId: saleId } });
    await writeAudit(tx, { actorId: context.actorId, action: "SALE_POSTED", entityType: "sales", entityId: saleId, requestId: context.requestId, afterJson: { reference, netMinor: net.toString(), costMinor: totalCost.toString() } });
    await tx.outboxEvent.create({ data: { id: crypto.randomUUID(), topic: "business.sale_posted", aggregateId: saleId, payload: { shopId: shop.id, reference, netMinor: net.toString() } } }); void journal;
    return { id: sale.id, reference, status: "POSTED", grossMinor: quote.grossMinor, discountMinor: quote.discountMinor, netMinor: quote.netMinor, costMinor: totalCost.toString(), businessDate: session.business_date.toISOString().slice(0,10), payments: paymentRows };
  });
}

export async function listSales(prisma: PrismaClient, organizationId: string, shopId: string) {
  return (await prisma.sale.findMany({ where: { organizationId, shopId }, orderBy: { postedAt: "desc" }, take: 100, include: { payments: true, lines: true } })).map((sale) => ({ id: sale.id, reference: sale.reference, status: sale.status, netMinor: sale.netMinor.toString(), itemCount: sale.lines.length, paymentModes: [...new Set(sale.payments.map((item) => item.mode))], postedAt: sale.postedAt.toISOString(), businessDate: sale.businessDate.toISOString().slice(0,10) }));
}

export async function getSale(prisma: PrismaClient, organizationId: string, shopId: string, id: string) {
  const sale = await prisma.sale.findFirst({ where: { id, organizationId, shopId }, include: { shop: true, actor: true, lines: true, payments: { include: { account: true } } } });
  if (!sale) throw new DomainError("SALE_NOT_FOUND", "Vente introuvable.", 404);
  return { id: sale.id, reference: sale.reference, status: sale.status, shop: sale.shop.name, manager: sale.actor.displayName, grossMinor: sale.grossMinor.toString(), discountMinor: sale.discountMinor.toString(), netMinor: sale.netMinor.toString(), businessDate: sale.businessDate.toISOString().slice(0,10), postedAt: sale.postedAt.toISOString(), lines: sale.lines.map((line) => ({ id: line.id, product: line.productName, variant: line.variantName, unit: line.unitName, symbol: line.unitSymbol, quantity: line.quantity.toString(), unitPriceMinor: line.unitPriceMinor.toString(), discountMinor: line.discountMinor.toString(), netMinor: line.netMinor.toString() })), payments: sale.payments.map((payment) => ({ id: payment.id, source: payment.account.name, mode: payment.mode, amountMinor: payment.amountMinor.toString(), cashReceivedMinor: payment.cashReceivedMinor?.toString() ?? null, changeDueMinor: payment.changeDueMinor?.toString() ?? null, changeGivenMinor: payment.changeGivenMinor?.toString() ?? null, externalReference: payment.externalReference })) };
}
