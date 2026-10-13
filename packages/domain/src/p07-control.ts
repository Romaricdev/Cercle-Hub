import type { PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError } from "./errors.js";
import { applyAvailable, bindAttachments, decimal, effect, scaledQty, text, toScaled, unitCostOf, type RoleContext, type Tx } from "./p06-common.js";
import {
  isOwner,
  managerActingShop,
  money,
  postJournal,
  requireOwner,
} from "./p07-common.js";

const COUNT_COMPARTMENTS = ["AVAILABLE", "DAMAGED", "QUARANTINE"] as const;
type CountCompartment = (typeof COUNT_COMPARTMENTS)[number];

async function consumeCompartment(tx: Tx, input: {
  variantId: string;
  locationId: string;
  compartment: string;
  qty: bigint;
  lotId?: string | null;
}): Promise<bigint> {
  const layers = input.lotId
    ? await tx.$queryRaw<Array<{ id: string; remaining_quantity: string; remaining_value_minor: bigint; unit_cost_minor: bigint }>>`
    SELECT id, remaining_quantity::text, remaining_value_minor, unit_cost_minor FROM cost_layers
    WHERE variant_id=${input.variantId}::uuid AND location_id=${input.locationId}::uuid AND compartment=${input.compartment}
      AND lot_id=${input.lotId}::uuid AND remaining_quantity>0 ORDER BY received_at ASC, id ASC FOR UPDATE`
    : await tx.$queryRaw<Array<{ id: string; remaining_quantity: string; remaining_value_minor: bigint; unit_cost_minor: bigint }>>`
    SELECT id, remaining_quantity::text, remaining_value_minor, unit_cost_minor FROM cost_layers
    WHERE variant_id=${input.variantId}::uuid AND location_id=${input.locationId}::uuid AND compartment=${input.compartment}
      AND remaining_quantity>0 ORDER BY received_at ASC, id ASC FOR UPDATE`;
  let remaining = input.qty;
  let cost = 0n;
  for (const layer of layers) {
    if (remaining <= 0n) break;
    const available = toScaled(layer.remaining_quantity);
    const taken = available < remaining ? available : remaining;
    const value = taken === available ? layer.remaining_value_minor : (layer.remaining_value_minor * taken + available / 2n) / available;
    await tx.costLayer.update({ where: { id: layer.id }, data: { remainingQuantity: { decrement: decimal(taken) }, remainingValueMinor: { decrement: value } } });
    cost += value;
    remaining -= taken;
  }
  if (remaining > 0n) throw new DomainError("INSUFFICIENT_STOCK", "Le stock du compartiment est insuffisant.", 409);
  return cost;
}

async function expectedByCompartment(tx: Tx, locationId: string) {
  const rows = await tx.$queryRaw<Array<{ variant_id: string; compartment: string; qty: string }>>`
    SELECT variant_id, compartment, SUM(remaining_quantity)::text AS qty
    FROM cost_layers WHERE location_id=${locationId}::uuid AND remaining_quantity>0 AND compartment <> 'TRANSIT'
    GROUP BY variant_id, compartment`;
  return rows.map((row) => ({ variantId: row.variant_id, compartment: row.compartment, qty: toScaled(row.qty) }));
}

export async function openStockCount(prisma: PrismaClient, context: RoleContext, input: { shopId: string; locationId: string; reason?: string | undefined }) {
  requireOwner(context);
  return effect(prisma, context, { action: "open-stock-count", ...input }, async (tx) => {
    const shop = await tx.shop.findFirst({ where: { id: input.shopId, organizationId: context.organizationId } });
    if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    const location = await tx.location.findFirst({ where: { id: input.locationId, organizationId: context.organizationId, OR: [{ shopId: shop.id }, { shopId: null }] } });
    if (!location) throw new DomainError("LOCATION_NOT_FOUND", "Lieu introuvable.", 404);
    const open = await tx.stockCount.count({ where: { shopId: shop.id, status: { in: ["COUNTING", "SUBMITTED", "RECOUNT_REQUESTED"] } } });
    if (open > 0) throw new DomainError("INVENTORY_LOCK", "Un inventaire est déjà en cours pour cette boutique.", 409);
    const expected = await expectedByCompartment(tx, location.id);
    const created = await tx.stockCount.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop.id,
        locationId: location.id,
        actorId: context.actorId,
        status: "COUNTING",
        reason: input.reason?.trim() || null,
        lines: {
          create: expected
            .filter((row) => COUNT_COMPARTMENTS.includes(row.compartment as CountCompartment) || row.compartment === "MISSING_PENDING")
            .map((row) => ({ variantId: row.variantId, compartment: row.compartment, expectedQty: decimal(row.qty) })),
        },
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "STOCK_COUNT_OPENED", entityType: "stock_counts", entityId: created.id, requestId: context.requestId, afterJson: { shopId: shop.id, locationId: location.id } });
    return { id: created.id, status: "COUNTING" };
  });
}

export async function declareCountLines(prisma: PrismaClient, context: RoleContext, id: string, input: {
  lines: Array<{ variantId: string; compartment: string; quantity: string; explanation?: string | undefined }>;
}) {
  return effect(prisma, context, { action: "declare-count", id, ...input }, async (tx) => {
    const shop = isOwner(context) ? null : await managerActingShop(tx, context.organizationId, context.actorId);
    const row = await tx.stockCount.findFirst({
      where: { id, organizationId: context.organizationId, ...(shop ? { shopId: shop.id } : {}) },
      include: { lines: true },
    });
    if (!row || !["COUNTING", "RECOUNT_REQUESTED"].includes(row.status)) throw new DomainError("INVALID_COUNT_TRANSITION", "Cet inventaire n’accepte plus de saisie.", 409);
    for (const line of input.lines) {
      const existing = row.lines.find((item) => item.variantId === line.variantId && item.compartment === line.compartment);
      const qty = scaledQty(line.quantity, 6, "La quantité comptée");
      if (!existing) {
        await tx.stockCountLine.create({
          data: { countId: id, variantId: line.variantId, compartment: line.compartment, declaredQty: decimal(qty), expectedQty: decimal(0n), explanation: line.explanation?.trim() || null },
        });
        continue;
      }
      await tx.stockCountLine.update({
        where: { id: existing.id },
        data: { declaredQty: decimal(qty), explanation: line.explanation?.trim() || existing.explanation },
      });
    }
    return { id, saved: input.lines.length };
  });
}

export async function submitStockCount(prisma: PrismaClient, context: RoleContext, id: string) {
  return effect(prisma, context, { action: "submit-stock-count", id }, async (tx) => {
    const shop = isOwner(context) ? null : await managerActingShop(tx, context.organizationId, context.actorId);
    const row = await tx.stockCount.findFirst({
      where: { id, organizationId: context.organizationId, ...(shop ? { shopId: shop.id } : {}) },
      include: { lines: true },
    });
    if (!row || !["COUNTING", "RECOUNT_REQUESTED"].includes(row.status)) throw new DomainError("INVALID_COUNT_TRANSITION", "Cet inventaire n’est plus soumissible.", 409);
    const missing = row.lines.filter((line) => line.compartment !== "MISSING_PENDING" && line.declaredQty == null);
    if (missing.length > 0) throw new DomainError("COUNT_INCOMPLETE", "Toutes les lignes à compter doivent être saisies.", 422);
    await tx.stockCount.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await writeAudit(tx, { actorId: context.actorId, action: "STOCK_COUNT_SUBMITTED", entityType: "stock_counts", entityId: id, requestId: context.requestId, afterJson: { lines: row.lines.length } });
    return { id, status: "SUBMITTED" };
  });
}

export async function requestRecount(prisma: PrismaClient, context: RoleContext, id: string, reason: string) {
  requireOwner(context);
  return effect(prisma, context, { action: "request-recount", id, reason }, async (tx) => {
    const previous = await tx.stockCount.findFirst({ where: { id, organizationId: context.organizationId }, include: { lines: true } });
    if (!previous || previous.status !== "SUBMITTED") throw new DomainError("INVALID_COUNT_TRANSITION", "Seul un inventaire soumis peut être recompté.", 409);
    await tx.stockCount.update({ where: { id }, data: { status: "RECOUNT_REQUESTED" } });
    const created = await tx.stockCount.create({
      data: {
        organizationId: context.organizationId,
        shopId: previous.shopId,
        locationId: previous.locationId,
        actorId: context.actorId,
        status: "COUNTING",
        revision: previous.revision + 1,
        previousId: previous.id,
        reason: text(reason, "Le motif", 3, 500),
        lines: {
          create: previous.lines.map((line) => ({
            variantId: line.variantId,
            compartment: line.compartment,
            expectedQty: line.expectedQty,
          })),
        },
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "STOCK_COUNT_RECOUNT", entityType: "stock_counts", entityId: created.id, requestId: context.requestId, afterJson: { previousId: previous.id } });
    return { id: created.id, previousId: previous.id, status: "COUNTING", revision: created.revision };
  });
}

export async function approveStockCount(prisma: PrismaClient, context: RoleContext, id: string, input: {
  explanations?: Record<string, string> | undefined;
  surplusCosts?: Array<{ variantId: string; unitCostMinor: string }> | undefined;
}) {
  requireOwner(context);
  return effect(prisma, context, { action: "approve-stock-count", id, ...input }, async (tx) => {
    const row = await tx.stockCount.findFirst({
      where: { id, organizationId: context.organizationId },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
    if (!row || row.status !== "SUBMITTED") throw new DomainError("INVALID_COUNT_TRANSITION", "Cet inventaire n’est pas à valider.", 409);
    const costs = new Map((input.surplusCosts ?? []).map((item) => [item.variantId, money(item.unitCostMinor, "Le coût d’inventaire")]));
    for (const line of row.lines) {
      if (line.compartment === "MISSING_PENDING") continue;
      const declared = line.declaredQty ? toScaled(line.declaredQty.toString()) : 0n;
      const expected = toScaled(line.expectedQty.toString());
      const delta = declared - expected;
      if (delta === 0n) continue;
      const explanation = input.explanations?.[line.id] ?? line.explanation;
      if (!explanation || explanation.trim().length < 3) throw new DomainError("EXPLANATION_REQUIRED", `Une explication est requise pour ${line.variant.product.name}.`, 422);
      if (delta < 0n) {
        const qty = -delta;
        const cost = await consumeCompartment(tx, { variantId: line.variantId, locationId: row.locationId, compartment: line.compartment, qty });
        if (line.compartment === "AVAILABLE") await applyAvailable(tx, { shopId: row.shopId, variantId: line.variantId, locationId: row.locationId, qty: -qty });
        await tx.stockEvent.create({
          data: {
            organizationId: context.organizationId,
            shopId: row.shopId,
            actorId: context.actorId,
            type: "INVENTORY",
            originType: "stock_counts",
            originId: row.id,
            entries: { create: { variantId: line.variantId, locationId: row.locationId, quantity: decimal(-qty) } },
          },
        });
        await postJournal(tx, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          type: "INVENTORY_SHRINK",
          referenceType: "stock_counts",
          referenceId: row.id,
          lines: [{ accountCode: "EXPENSE:WRITE_OFF", amountMinor: cost }, { accountCode: "ASSET:STOCK", amountMinor: -cost }],
        });
      } else {
        let unitCost = costs.get(line.variantId) ?? null;
        if (unitCost == null) {
          const recent = await tx.costLayer.findFirst({
            where: { variantId: line.variantId, locationId: row.locationId, remainingQuantity: { gt: 0 }, compartment: "AVAILABLE" },
            orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          });
          unitCost = recent?.unitCostMinor ?? null;
        }
        if (unitCost == null) throw new DomainError("SURPLUS_COST_REQUIRED", "Un coût propriétaire est requis pour cet inventaire positif.", 422);
        const value = (unitCost * delta + 500_000n) / 1_000_000n;
        await tx.costLayer.create({
          data: {
            variantId: line.variantId,
            locationId: row.locationId,
            originType: "stock_counts",
            originId: row.id,
            initialQuantity: decimal(delta),
            remainingQuantity: decimal(delta),
            unitCostMinor: unitCost,
            initialValueMinor: value,
            remainingValueMinor: value,
            compartment: line.compartment,
            valuationOrigin: "INVENTORY",
            receivedAt: new Date(),
          },
        });
        if (line.compartment === "AVAILABLE") await applyAvailable(tx, { shopId: row.shopId, variantId: line.variantId, locationId: row.locationId, qty: delta });
        await tx.stockEvent.create({
          data: {
            organizationId: context.organizationId,
            shopId: row.shopId,
            actorId: context.actorId,
            type: "INVENTORY",
            originType: "stock_counts",
            originId: row.id,
            entries: { create: { variantId: line.variantId, locationId: row.locationId, quantity: decimal(delta) } },
          },
        });
        await postJournal(tx, {
          organizationId: context.organizationId,
          actorId: context.actorId,
          type: "INVENTORY_SURPLUS",
          referenceType: "stock_counts",
          referenceId: row.id,
          lines: [{ accountCode: "ASSET:STOCK", amountMinor: value }, { accountCode: "EQUITY:INVENTORY_SURPLUS", amountMinor: -value }],
        });
      }
      await tx.stockCountLine.update({ where: { id: line.id }, data: { explanation: explanation.trim() } });
    }
    await tx.stockCount.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
    if (row.previousId) await tx.stockCount.update({ where: { id: row.previousId }, data: { status: "SUPERSEDED" } });
    await writeAudit(tx, { actorId: context.actorId, action: "STOCK_COUNT_APPROVED", entityType: "stock_counts", entityId: id, requestId: context.requestId, afterJson: {} });
    return { id, status: "APPROVED" };
  });
}

export async function declareStockLoss(prisma: PrismaClient, context: RoleContext, input: {
  locationId: string;
  variantId: string;
  quantity: string;
  compartment: "AVAILABLE" | "DAMAGED" | "QUARANTINE";
  reason: string;
  physicalState?: "DAMAGED" | "MISSING" | undefined;
  lotId?: string | undefined;
  attachmentIds?: string[] | undefined;
}) {
  return effect(prisma, context, { action: "declare-stock-loss", ...input }, async (tx) => {
    const shop = isOwner(context)
      ? (await tx.location.findFirst({ where: { id: input.locationId, organizationId: context.organizationId } }))?.shopId
      : (await managerActingShop(tx, context.organizationId, context.actorId)).id;
    if (!shop) throw new DomainError("LOCATION_NOT_FOUND", "Lieu introuvable.", 404);
    if (input.lotId) {
      const lot = await tx.lot.findFirst({ where: { id: input.lotId, variantId: input.variantId, locationId: input.locationId } });
      if (!lot) throw new DomainError("LOT_NOT_FOUND", "Le lot sélectionné ne correspond pas à cette ligne de stock.", 404);
    }
    const qty = scaledQty(input.quantity, 6, "La quantité perdue");
    const target = input.physicalState === "MISSING" ? "MISSING_PENDING" : "DAMAGED";
    const created = await tx.stockLoss.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop,
        locationId: input.locationId,
        variantId: input.variantId,
        actorId: context.actorId,
        quantity: decimal(qty),
        sourceCompartment: input.compartment,
        compartment: target,
        lotId: input.lotId ?? null,
        status: isOwner(context) ? "DECLARED" : "REQUESTED",
        reason: text(input.reason, "Le motif", 3, 500),
      },
    });
    const cost = await consumeCompartment(tx, { variantId: input.variantId, locationId: input.locationId, compartment: input.compartment, qty, lotId: input.lotId ?? null });
    if (input.compartment === "AVAILABLE") await applyAvailable(tx, { shopId: shop, variantId: input.variantId, locationId: input.locationId, qty: -qty });
    await tx.costLayer.create({
      data: {
        variantId: input.variantId,
        locationId: input.locationId,
        lotId: input.lotId ?? null,
        originType: "stock_losses",
        originId: created.id,
        initialQuantity: decimal(qty),
        remainingQuantity: decimal(qty),
        unitCostMinor: unitCostOf(cost, qty),
        initialValueMinor: cost,
        remainingValueMinor: cost,
        compartment: target,
        valuationOrigin: "TRANSFER",
        receivedAt: new Date(),
      },
    });
    await tx.stockEvent.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop,
        actorId: context.actorId,
        type: target === "DAMAGED" ? "DAMAGE" : "LOSS",
        originType: "stock_losses",
        originId: created.id,
        entries: { create: { variantId: input.variantId, locationId: input.locationId, quantity: decimal(-qty) } },
      },
    });
    await bindAttachments(tx, context.organizationId, context.actorId, input.attachmentIds, "stock_losses", created.id);
    await writeAudit(tx, { actorId: context.actorId, action: "STOCK_LOSS_DECLARED", entityType: "stock_losses", entityId: created.id, requestId: context.requestId, afterJson: { qty: qty.toString(), sourceCompartment: input.compartment, target, lotId: input.lotId ?? null, attachmentCount: input.attachmentIds?.length ?? 0 } });
    return { id: created.id, status: created.status, costMinor: cost.toString() };
  });
}

export async function writeOffStockLoss(prisma: PrismaClient, context: RoleContext, id: string) {
  requireOwner(context);
  return effect(prisma, context, { action: "write-off-stock-loss", id }, async (tx) => {
    const row = await tx.stockLoss.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row || !["REQUESTED", "DECLARED"].includes(row.status)) throw new DomainError("INVALID_LOSS_TRANSITION", "Cette perte n’est plus à solder.", 409);
    const qty = toScaled(row.quantity.toString());
    const cost = await consumeCompartment(tx, { variantId: row.variantId, locationId: row.locationId, compartment: row.compartment, qty, lotId: row.lotId });
    await tx.stockLoss.update({ where: { id }, data: { status: "WRITTEN_OFF", writtenOffAt: new Date() } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "STOCK_WRITE_OFF",
      referenceType: "stock_losses",
      referenceId: id,
      lines: [{ accountCode: "EXPENSE:WRITE_OFF", amountMinor: cost }, { accountCode: "ASSET:STOCK", amountMinor: -cost }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "STOCK_LOSS_WRITTEN_OFF", entityType: "stock_losses", entityId: id, requestId: context.requestId, afterJson: { costMinor: cost.toString() } });
    return { id, status: "WRITTEN_OFF", costMinor: cost.toString() };
  });
}

export async function startHandover(prisma: PrismaClient, context: RoleContext, input: {
  shopId: string;
  toUserId: string;
  reason: string;
  recovery?: boolean | undefined;
}) {
  requireOwner(context);
  return effect(prisma, context, { action: "start-handover", ...input }, async (tx) => {
    const shop = await tx.shop.findFirst({ where: { id: input.shopId, organizationId: context.organizationId } });
    if (!shop) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    const current = await tx.managerAssignment.findFirst({ where: { shopId: shop.id, endedAt: null } });
    if (!current) throw new DomainError("MANAGER_REQUIRED", "Aucun gérant actuel à remplacer.", 409);
    if (current.userId === input.toUserId) throw new DomainError("MANAGER_UNCHANGED", "Choisissez un autre gérant pour effectuer la passation.", 409);
    const successor = await tx.appUser.findFirst({ where: { id: input.toUserId, organizationId: context.organizationId, role: "MANAGER", status: { in: ["ACTIVE", "INVITED"] } } });
    if (!successor) throw new DomainError("MANAGER_INVALID", "Le successeur n’est pas disponible.", 409);
    const counting = await tx.stockCount.count({ where: { shopId: shop.id, status: { in: ["COUNTING", "RECOUNT_REQUESTED"] } } });
    if (counting > 0) throw new DomainError("INVENTORY_LOCK", "Terminez l’inventaire avant la passation.", 409);
    const session = await tx.cashSession.findFirst({ where: { shopId: shop.id, status: { in: ["OPEN", "COUNTING"] } } });
    if (session && !input.recovery) throw new DomainError("CASH_SESSION_OPEN", "Clôturez la session de caisse avant la passation.", 409);
    if (!input.recovery) {
      const device = await tx.device.findFirst({ where: { userId: current.userId, shopId: shop.id, status: "ACTIVE" } });
      if (!device) throw new DomainError("PRIMARY_DEVICE_REQUIRED", "L’appareil principal du gérant actuel doit être connecté, sauf procédure de secours.", 409);
    }
    if (input.recovery) {
      await tx.shop.update({ where: { id: shop.id }, data: { status: "SUSPENDED", suspensionMode: "SECURITY", suspendedAt: new Date() } });
    }
    await tx.managerAssignment.update({ where: { id: current.id }, data: { endedAt: new Date(), reason: text(input.reason, "Le motif", 3, 500) } });
    await tx.device.updateMany({ where: { userId: current.userId, shopId: shop.id, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "REVOKED" } });
    if (session) await tx.cashSession.update({ where: { id: session.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await tx.managerAssignment.updateMany({ where: { userId: successor.id, endedAt: null }, data: { endedAt: new Date(), reason: "Passation" } });
    await tx.managerAssignment.create({ data: { shopId: shop.id, userId: successor.id, reason: input.reason } });
    const handover = await tx.shopHandover.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop.id,
        fromUserId: current.userId,
        toUserId: successor.id,
        actorId: context.actorId,
        status: input.recovery ? "RECOVERY" : "PENDING",
        reason: text(input.reason, "Le motif", 3, 500),
        recovery: Boolean(input.recovery),
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: input.recovery ? "SHOP_HANDOVER_RECOVERY" : "SHOP_HANDOVER_STARTED", entityType: "shop_handovers", entityId: handover.id, requestId: context.requestId, afterJson: { fromUserId: current.userId, toUserId: successor.id, recovery: Boolean(input.recovery) } });
    return { id: handover.id, status: handover.status };
  });
}

export async function confirmHandover(prisma: PrismaClient, context: RoleContext, id: string) {
  return effect(prisma, context, { action: "confirm-handover", id }, async (tx) => {
    const row = await tx.shopHandover.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row || !["PENDING", "RECOVERY"].includes(row.status)) throw new DomainError("INVALID_HANDOVER_TRANSITION", "Cette passation n’est plus à confirmer.", 409);
    if (context.actorId !== row.toUserId && !isOwner(context)) throw new DomainError("FORBIDDEN", "Seul le nouveau gérant confirme la prise de responsabilité.", 403);
    const device = await tx.device.findFirst({ where: { userId: row.toUserId, shopId: row.shopId, status: "ACTIVE" } });
    if (!device) throw new DomainError("PRIMARY_DEVICE_REQUIRED", "Enregistrez et faites approuver l’appareil du nouveau gérant.", 409);
    await tx.shopHandover.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await writeAudit(tx, { actorId: context.actorId, action: "SHOP_HANDOVER_CONFIRMED", entityType: "shop_handovers", entityId: id, requestId: context.requestId, afterJson: {} });
    return { id, status: "COMPLETED" };
  });
}

export async function assertShopCloseable(tx: Tx, shopId: string) {
  const reasons: string[] = [];
  if (await tx.cashSession.count({ where: { shopId, status: { in: ["OPEN", "COUNTING"] } } })) reasons.push("Une session de caisse est encore ouverte.");
  const cash = await tx.moneyAccount.aggregate({ where: { shopId, paymentSource: { type: "CASH" } }, _sum: { balanceMinor: true } });
  if ((cash._sum.balanceMinor ?? 0n) !== 0n) reasons.push("Le solde espèces n’est pas remis.");
  const stock = await tx.stockBalance.findMany({ where: { shopId } });
  if (stock.some((row) => toScaled(row.quantity.toString()) > 0n)) reasons.push("Du stock local reste à solder.");
  if (await tx.costLayer.count({ where: { location: { shopId }, compartment: "TRANSIT", remainingQuantity: { gt: 0 } } })) reasons.push("Des transits sont encore ouverts.");
  if (await tx.receivable.count({ where: { shopId, remainingMinor: { gt: 0 } } })) reasons.push("Des créances restent ouvertes.");
  const purchases = await tx.purchase.findMany({ where: { shopId, status: "POSTED" } });
  if (purchases.some((row) => row.goodsMinor + row.supplierFeesMinor - row.paidMinor > 0n)) reasons.push("Des dettes fournisseur restent ouvertes.");
  if (await tx.purchaseRequest.count({ where: { shopId, status: { in: ["SUBMITTED", "NEEDS_INFO"] } } })) reasons.push("Une demande d’achat est encore ouverte.");
  if (await tx.customerReturn.count({ where: { shopId, status: { notIn: ["SETTLED", "REJECTED"] } } })) reasons.push("Un retour client est encore ouvert.");
  if (await tx.stockCount.count({ where: { shopId, status: { in: ["COUNTING", "SUBMITTED", "RECOUNT_REQUESTED"] } } })) reasons.push("Un inventaire est encore ouvert.");
    if (await tx.discrepancyCase.count({ where: { shopId, state: { not: "CLOSED" } } })) reasons.push("Un dossier d’écart de caisse est encore ouvert.");
  if (reasons.length) throw new DomainError("SHOP_HAS_OPEN_OBLIGATIONS", reasons.join(" "), 409);
}

export async function listStockCounts(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, shopId?: string) {
  const scoped = actorRole === "OWNER" ? shopId : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const rows = await prisma.stockCount.findMany({
    where: { organizationId, ...(scoped ? { shopId: scoped } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { shop: true, location: true },
  });
  return rows.map((row) => ({
    id: row.id,
    shop: row.shop.name,
    location: row.location.name,
    status: row.status,
    revision: row.revision,
    previousId: row.previousId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getStockCount(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, id: string) {
  const shopId = actorRole === "OWNER" ? undefined : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const row = await prisma.stockCount.findFirst({
    where: { id, organizationId, ...(shopId ? { shopId } : {}) },
    include: { lines: { include: { variant: { include: { product: true } } } }, shop: true, location: true, previous: { include: { lines: true } } },
  });
  if (!row) throw new DomainError("COUNT_NOT_FOUND", "Inventaire introuvable.", 404);
  const blind = actorRole !== "OWNER";
  return {
    id: row.id,
    shop: row.shop.name,
    location: row.location.name,
    locationId: row.locationId,
    status: row.status,
    revision: row.revision,
    previousId: row.previousId,
    reason: row.reason,
    lines: row.lines.filter((line) => !(blind && line.compartment === "MISSING_PENDING")).map((line) => ({
      id: line.id,
      variantId: line.variantId,
      product: line.variant.product.name,
      variant: line.variant.name,
      compartment: line.compartment,
      declaredQty: line.declaredQty?.toString() ?? null,
      ...(blind ? {} : { expectedQty: line.expectedQty.toString() }),
      explanation: line.explanation,
    })),
    previous: row.previous && !blind ? {
      id: row.previous.id,
      revision: row.previous.revision,
      lines: row.previous.lines.map((line) => ({ variantId: line.variantId, compartment: line.compartment, declaredQty: line.declaredQty?.toString() ?? null })),
    } : null,
  };
}

export async function listStockLossContext(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string) {
  const shopId = actorRole === "OWNER" ? undefined : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  if (actorRole !== "OWNER" && !shopId) throw new DomainError("SHOP_NOT_ACTIVE", "Aucune boutique d’affectation.", 409);
  const layers = await prisma.costLayer.findMany({
    where: { remainingQuantity: { gt: 0 }, compartment: { in: [...COUNT_COMPARTMENTS] }, location: { organizationId, ...(shopId ? { shopId } : {}) } },
    include: { variant: { include: { product: true } }, location: true, lot: true },
    orderBy: [{ variant: { product: { name: "asc" } } }, { location: { name: "asc" } }, { receivedAt: "asc" }],
  });
  const grouped = new Map<string, { variantId: string; locationId: string; product: string; variant: string; location: string; compartment: CountCompartment; lotId: string | null; lotCode: string | null; quantityScaled: bigint }>();
  for (const layer of layers) {
    const key = `${layer.variantId}:${layer.locationId}:${layer.compartment}:${layer.lotId ?? "none"}`;
    const current = grouped.get(key);
    const quantityScaled = toScaled(layer.remainingQuantity.toString());
    if (current) current.quantityScaled += quantityScaled;
    else grouped.set(key, { variantId: layer.variantId, locationId: layer.locationId, product: layer.variant.product.name, variant: layer.variant.name, location: layer.location.name, compartment: layer.compartment as CountCompartment, lotId: layer.lotId, lotCode: layer.lot?.code ?? null, quantityScaled });
  }
  return [...grouped.values()].map(({ quantityScaled, ...row }) => ({ ...row, quantity: decimal(quantityScaled).toString() }));
}

export async function listStockLosses(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string) {
  const shopId = actorRole === "OWNER" ? undefined : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const rows = await prisma.stockLoss.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { variant: { include: { product: true } }, shop: true, lot: true },
  });
  return rows.map((row) => ({
    id: row.id,
    shop: row.shop.name,
    product: row.variant.product.name,
    variant: row.variant.name,
    quantity: row.quantity.toString(),
    sourceCompartment: row.sourceCompartment,
    compartment: row.compartment,
    lot: row.lot?.code ?? null,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listHandovers(prisma: PrismaClient, organizationId: string, shopId?: string) {
  const rows = await prisma.shopHandover.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { fromUser: true, toUser: true, shop: true },
  });
  return rows.map((row) => ({
    id: row.id,
    shop: row.shop.name,
    from: row.fromUser.displayName,
    to: row.toUser.displayName,
    status: row.status,
    recovery: row.recovery,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listSupplierReturns(prisma: PrismaClient, organizationId: string) {
  const rows = await prisma.supplierReturn.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { purchase: { select: { reference: true } }, supplier: { select: { name: true } }, shop: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    purchaseId: row.purchaseId,
    purchaseReference: row.purchase.reference,
    supplier: row.supplier.name,
    shop: row.shop?.name ?? "Organisation",
    reason: row.reason,
    status: row.status,
    dispatchedMinor: row.dispatchedMinor.toString(),
    debtReductionMinor: row.debtReductionMinor.toString(),
    reimbursementDueMinor: row.reimbursementDueMinor.toString(),
    reimbursementReceivedMinor: row.reimbursementReceivedMinor.toString(),
    createdAt: row.createdAt.toISOString(),
  }));
}
