import type { PrismaClient } from "@cercle/database";

import { writeAudit } from "./audit.js";
import { DomainError } from "./errors.js";
import { applyAvailable, decimal, effect, scaledQty, text, toScaled, type RoleContext } from "./p06-common.js";
import {
  isOwner,
  managerActingShop,
  money,
  moveFunds,
  postJournal,
  requireOwner,
  saleDue,
} from "./p07-common.js";

export async function requestCustomerReturn(prisma: PrismaClient, context: RoleContext, input: {
  saleId: string;
  reason: string;
  lines: Array<{ saleLineId: string; quantity: string; disposition?: "AVAILABLE" | "DAMAGED" | undefined }>;
}) {
  return effect(prisma, context, { action: "request-customer-return", ...input }, async (tx) => {
    const shop = await managerActingShop(tx, context.organizationId, context.actorId, { allowSettlement: true });
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, organizationId: context.organizationId, shopId: shop.id }, include: { lines: true } });
    if (!sale || sale.status !== "POSTED") throw new DomainError("SALE_NOT_FOUND", "Vente introuvable.", 404);
    if (input.lines.length < 1) throw new DomainError("INVALID_INPUT", "Indiquez au moins une ligne.", 422);
    const previous = await tx.customerReturnLine.findMany({ where: { parent: { saleId: sale.id, status: { not: "REJECTED" } } } });
    const already = new Map<string, bigint>();
    for (const line of previous) already.set(line.saleLineId, (already.get(line.saleLineId) ?? 0n) + toScaled(line.requestedQty.toString()));
    const createdLines = [];
    let requestedMinor = 0n;
    for (const line of input.lines) {
      const origin = sale.lines.find((item) => item.id === line.saleLineId);
      if (!origin) throw new DomainError("SALE_LINE_NOT_FOUND", "Une ligne de vente est inconnue.", 422);
      const qty = scaledQty(line.quantity, 6, "La quantité retournée");
      const sold = toScaled(origin.quantityBase.toString());
      const used = already.get(origin.id) ?? 0n;
      if (used + qty > sold) throw new DomainError("RETURN_EXCEEDS_SOLD", "Le retour cumulé dépasse la quantité vendue.", 422);
      const lineNet = (origin.netMinor * qty + sold / 2n) / sold;
      requestedMinor += lineNet;
      createdLines.push({ saleLineId: origin.id, variantId: origin.variantId, requestedQty: decimal(qty), netMinor: lineNet, disposition: line.disposition ?? "AVAILABLE" });
    }
    const created = await tx.customerReturn.create({
      data: {
        organizationId: context.organizationId,
        shopId: shop.id,
        saleId: sale.id,
        actorId: context.actorId,
        customerId: sale.customerId,
        status: "REQUESTED",
        reason: text(input.reason, "Le motif", 3, 500),
        requestedMinor,
        lines: { create: createdLines },
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_RETURN_REQUESTED", entityType: "customer_returns", entityId: created.id, requestId: context.requestId, afterJson: { saleId: sale.id, requestedMinor: requestedMinor.toString() } });
    return { id: created.id, status: "REQUESTED", requestedMinor: requestedMinor.toString() };
  });
}

export async function decideCustomerReturn(prisma: PrismaClient, context: RoleContext, id: string, input: { outcome: "APPROVED" | "REJECTED"; reason?: string | undefined }) {
  requireOwner(context);
  return effect(prisma, context, { action: "decide-customer-return", id, ...input }, async (tx) => {
    const row = await tx.customerReturn.findFirst({ where: { id, organizationId: context.organizationId }, include: { lines: true } });
    if (!row || row.status !== "REQUESTED") throw new DomainError("INVALID_RETURN_TRANSITION", "Cette demande de retour n’est plus décidable.", 409);
    if (input.outcome === "REJECTED") {
      await tx.customerReturn.update({ where: { id }, data: { status: "REJECTED", decidedById: context.actorId, decidedAt: new Date() } });
      return { id, status: "REJECTED" };
    }
    for (const line of row.lines) {
      await tx.customerReturnLine.update({ where: { id: line.id }, data: { approvedQty: line.requestedQty } });
    }
    await tx.customerReturn.update({
      where: { id },
      data: { status: "APPROVED", approvedMinor: row.requestedMinor, decidedById: context.actorId, decidedAt: new Date() },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_RETURN_DECIDED", entityType: "customer_returns", entityId: id, requestId: context.requestId, afterJson: { outcome: input.outcome } });
    return { id, status: "APPROVED", approvedMinor: row.requestedMinor.toString() };
  });
}

export async function receiveCustomerReturn(prisma: PrismaClient, context: RoleContext, id: string, input: {
  lines: Array<{ returnLineId: string; quantity: string; disposition: "AVAILABLE" | "DAMAGED" }>;
}) {
  return effect(prisma, context, { action: "receive-customer-return", id, ...input }, async (tx) => {
    const shop = await managerActingShop(tx, context.organizationId, context.actorId, { allowSettlement: true });
    const row = await tx.customerReturn.findFirst({
      where: { id, organizationId: context.organizationId, shopId: shop.id },
      include: { lines: true, sale: { include: { lines: { include: { costAllocations: true } }, session: true, receivables: true } } },
    });
    if (!row || !["APPROVED", "PARTIALLY_RECEIVED"].includes(row.status)) throw new DomainError("INVALID_RETURN_TRANSITION", "Ce retour n’est pas à recevoir.", 409);
    const sale = row.sale;
    const locationId = sale.session.locationId;
    let receivedMinor = 0n;
    let costReturned = 0n;
    for (const line of input.lines) {
      const origin = row.lines.find((item) => item.id === line.returnLineId);
      if (!origin) throw new DomainError("RETURN_LINE_NOT_FOUND", "Une ligne de retour est inconnue.", 422);
      const qty = scaledQty(line.quantity, 6, "La quantité reçue");
      const approved = toScaled(origin.approvedQty.toString());
      const already = toScaled(origin.receivedQty.toString());
      if (already + qty > approved) throw new DomainError("RETURN_EXCEEDS_APPROVED", "La réception dépasse la quantité approuvée.", 409);
      const saleLine = sale.lines.find((item) => item.id === origin.saleLineId)!;
      const lineNet = (origin.netMinor * qty + toScaled(origin.requestedQty.toString()) / 2n) / toScaled(origin.requestedQty.toString());
      receivedMinor += lineNet;
      let remaining = qty;
      let lineCost = 0n;
      for (const allocation of saleLine.costAllocations) {
        if (remaining <= 0n) break;
        const allocQty = toScaled(allocation.quantity.toString());
        const portion = remaining < allocQty ? remaining : allocQty;
        const value = portion === allocQty ? allocation.valueMinor : (allocation.valueMinor * portion + allocQty / 2n) / allocQty;
        const layer = await tx.costLayer.findUniqueOrThrow({ where: { id: allocation.layerId } });
        await tx.costLayer.create({
          data: {
            variantId: saleLine.variantId,
            locationId,
            originType: "customer_returns",
            originId: row.id,
            originLayerId: layer.id,
            initialQuantity: decimal(portion),
            remainingQuantity: decimal(portion),
            unitCostMinor: layer.unitCostMinor,
            initialValueMinor: value,
            remainingValueMinor: value,
            compartment: line.disposition,
            valuationOrigin: "TRANSFER",
            receivedAt: new Date(),
          },
        });
        lineCost += value;
        remaining -= portion;
      }
      costReturned += lineCost;
      await applyAvailable(tx, { shopId: shop.id, variantId: origin.variantId, locationId, qty: line.disposition === "AVAILABLE" ? qty : 0n });
      if (line.disposition === "DAMAGED") {
        await tx.stockEvent.create({
          data: {
            organizationId: context.organizationId,
            shopId: shop.id,
            actorId: context.actorId,
            type: "RETURN",
            originType: "customer_returns",
            originId: row.id,
            entries: { create: { variantId: origin.variantId, locationId, quantity: decimal(qty) } },
          },
        });
      } else {
        await tx.stockEvent.create({
          data: {
            organizationId: context.organizationId,
            shopId: shop.id,
            actorId: context.actorId,
            type: "RETURN",
            originType: "customer_returns",
            originId: row.id,
            entries: { create: { variantId: origin.variantId, locationId, quantity: decimal(qty) } },
          },
        });
      }
      await tx.customerReturnLine.update({
        where: { id: origin.id },
        data: { receivedQty: decimal(already + qty), disposition: line.disposition, costMinor: origin.costMinor + lineCost },
      });
    }
    const living = saleDue(sale);
    let remainingAbsorb = receivedMinor;
    const debtCut = remainingAbsorb < living ? remainingAbsorb : living;
    remainingAbsorb -= debtCut;
    const writeOffCut = remainingAbsorb < sale.writeOffMinor ? remainingAbsorb : sale.writeOffMinor;
    remainingAbsorb -= writeOffCut;
    const paidLeft = sale.paidMinor - sale.refundedMinor;
    const refundDue = remainingAbsorb < paidLeft ? remainingAbsorb : paidLeft;
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        creditReductionMinor: { increment: debtCut },
        writeOffMinor: { decrement: writeOffCut },
      },
    });
    if (debtCut > 0n) {
      const receivable = sale.receivables[0];
      if (receivable) {
        await tx.receivable.update({ where: { id: receivable.id }, data: { remainingMinor: receivable.remainingMinor - debtCut, version: { increment: 1 } } });
      }
    }
    const stillPending = row.lines.some((line) => {
      const incoming = input.lines.find((item) => item.returnLineId === line.id);
      const extra = incoming ? scaledQty(incoming.quantity, 6, "La quantité reçue") : 0n;
      return toScaled(line.receivedQty.toString()) + extra < toScaled(line.approvedQty.toString());
    });
    await tx.customerReturn.update({
      where: { id },
      data: {
        status: stillPending ? "PARTIALLY_RECEIVED" : (refundDue + row.refundDueMinor - row.refundedMinor > 0n ? "RECEIVED" : "SETTLED"),
        receivedMinor: { increment: receivedMinor },
        creditReductionMinor: { increment: debtCut },
        writeOffReversalMinor: { increment: writeOffCut },
        refundDueMinor: { increment: refundDue },
      },
    });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "CUSTOMER_RETURN",
      referenceType: "customer_returns",
      referenceId: id,
      lines: [
        { accountCode: "INCOME:SALES", amountMinor: receivedMinor },
        ...(debtCut > 0n ? [{ accountCode: "ASSET:RECEIVABLE", amountMinor: -debtCut }] : []),
        ...(writeOffCut > 0n ? [{ accountCode: "EXPENSE:WRITE_OFF", amountMinor: -writeOffCut }] : []),
        ...(refundDue > 0n ? [{ accountCode: "LIABILITY:CUSTOMER", amountMinor: -refundDue }] : []),
        { accountCode: "ASSET:STOCK", amountMinor: costReturned },
        { accountCode: "EXPENSE:COGS", amountMinor: -costReturned },
      ],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_RETURN_RECEIVED", entityType: "customer_returns", entityId: id, requestId: context.requestId, afterJson: { receivedMinor: receivedMinor.toString(), refundDue: refundDue.toString() } });
    return { id, receivedMinor: receivedMinor.toString(), creditReductionMinor: debtCut.toString(), writeOffReversalMinor: writeOffCut.toString(), refundDueMinor: refundDue.toString() };
  });
}

export async function payCustomerRefund(prisma: PrismaClient, context: RoleContext, id: string, input: { accountId: string; amountMinor: string }) {
  return effect(prisma, context, { action: "pay-customer-refund", id, ...input }, async (tx) => {
    const shop = await managerActingShop(tx, context.organizationId, context.actorId, { allowSettlement: true });
    const row = await tx.customerReturn.findFirst({ where: { id, organizationId: context.organizationId, shopId: shop.id } });
    if (!row || !["RECEIVED", "PARTIALLY_RECEIVED"].includes(row.status)) throw new DomainError("INVALID_RETURN_TRANSITION", "Aucun remboursement n’est dû pour ce retour.", 409);
    const amount = money(input.amountMinor, "Le remboursement");
    const due = row.refundDueMinor - row.refundedMinor;
    if (amount <= 0n || amount > due) throw new DomainError("REFUND_EXCEEDS_DUE", "Le remboursement dépasse l’obligation restante.", 422);
    const moved = await moveFunds(tx, context, {
      accountId: input.accountId,
      amount,
      direction: "OUT",
      type: "CUSTOMER_REFUND",
      reason: "Remboursement client",
      shopId: shop.id,
      requireCashSession: true,
    });
    await tx.refundPayment.create({ data: { returnId: id, accountId: input.accountId, sessionId: moved.sessionId, actorId: context.actorId, amountMinor: amount } });
    const refunded = row.refundedMinor + amount;
    const fullyReceived = row.receivedMinor >= row.approvedMinor;
    const settled = fullyReceived && refunded === row.refundDueMinor;
    await tx.customerReturn.update({ where: { id }, data: { refundedMinor: refunded, status: settled ? "SETTLED" : row.status } });
    await tx.sale.update({ where: { id: row.saleId }, data: { refundedMinor: { increment: amount } } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "CUSTOMER_REFUND",
      referenceType: "customer_returns",
      referenceId: id,
      lines: [{ accountCode: "LIABILITY:CUSTOMER", amountMinor: amount }, { accountCode: "ASSET:FUNDS", amountMinor: -amount }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "CUSTOMER_REFUND_PAID", entityType: "customer_returns", entityId: id, requestId: context.requestId, afterJson: { amountMinor: amount.toString() } });
    return { id, refundedMinor: refunded.toString(), status: settled ? "SETTLED" : row.status };
  });
}

export async function requestSupplierReturn(prisma: PrismaClient, context: RoleContext, input: {
  purchaseId: string;
  reason: string;
  lines: Array<{ purchaseLineId: string; quantity: string }>;
}) {
  return effect(prisma, context, { action: "request-supplier-return", ...input }, async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: input.purchaseId, organizationId: context.organizationId },
      include: { lines: true, supplier: true },
    });
    if (!purchase || purchase.status !== "POSTED") throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
    if (!isOwner(context)) {
      const shop = await managerActingShop(tx, context.organizationId, context.actorId);
      if (purchase.shopId !== shop.id) throw new DomainError("PURCHASE_NOT_FOUND", "Achat introuvable.", 404);
    }
    const created = await tx.supplierReturn.create({
      data: {
        organizationId: context.organizationId,
        shopId: purchase.shopId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        actorId: context.actorId,
        status: isOwner(context) ? "APPROVED" : "REQUESTED",
        reason: text(input.reason, "Le motif", 3, 500),
        decidedById: isOwner(context) ? context.actorId : null,
        decidedAt: isOwner(context) ? new Date() : null,
        lines: {
          create: await Promise.all(input.lines.map(async (line) => {
            const origin = purchase.lines.find((item) => item.id === line.purchaseLineId);
            if (!origin) throw new DomainError("PURCHASE_LINE_NOT_FOUND", "Une ligne d’achat est inconnue.", 422);
            const qty = scaledQty(line.quantity, 6, "La quantité retournée");
            const received = toScaled(origin.receivedQtyBase.toString());
            if (qty > received) throw new DomainError("RETURN_EXCEEDS_RECEIVED", "Le retour dépasse la quantité reçue.", 422);
            const amount = (origin.goodsMinor * qty + toScaled(origin.quantityBase.toString()) / 2n) / toScaled(origin.quantityBase.toString());
            return { purchaseLineId: origin.id, variantId: origin.variantId, qtyBase: decimal(qty), amountMinor: amount, costMinor: 0n };
          })),
        },
      },
    });
    await writeAudit(tx, { actorId: context.actorId, action: "SUPPLIER_RETURN_REQUESTED", entityType: "supplier_returns", entityId: created.id, requestId: context.requestId, afterJson: { purchaseId: purchase.id } });
    return { id: created.id, status: created.status };
  });
}

export async function decideSupplierReturn(prisma: PrismaClient, context: RoleContext, id: string, input: { outcome: "APPROVED" | "REJECTED" }) {
  requireOwner(context);
  return effect(prisma, context, { action: "decide-supplier-return", id, ...input }, async (tx) => {
    const row = await tx.supplierReturn.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row || row.status !== "REQUESTED") throw new DomainError("INVALID_RETURN_TRANSITION", "Cette demande n’est plus décidable.", 409);
    await tx.supplierReturn.update({ where: { id }, data: { status: input.outcome, decidedById: context.actorId, decidedAt: new Date() } });
    return { id, status: input.outcome };
  });
}

export async function dispatchSupplierReturn(prisma: PrismaClient, context: RoleContext, id: string, locationId: string) {
  return effect(prisma, context, { action: "dispatch-supplier-return", id, locationId }, async (tx) => {
    const row = await tx.supplierReturn.findFirst({ where: { id, organizationId: context.organizationId }, include: { lines: true, purchase: true } });
    if (!row || row.status !== "APPROVED") throw new DomainError("INVALID_RETURN_TRANSITION", "Le retour fournisseur n’est pas à expédier.", 409);
    if (!isOwner(context)) {
      const shop = await managerActingShop(tx, context.organizationId, context.actorId);
      if (row.shopId !== shop.id) throw new DomainError("FORBIDDEN", "Retour introuvable.", 404);
    }
    let dispatched = 0n;
    let cost = 0n;
    for (const line of row.lines) {
      const qty = toScaled(line.qtyBase.toString());
      const layers = await tx.$queryRaw<Array<{ id: string; remaining_quantity: string; remaining_value_minor: bigint }>>`
        SELECT id, remaining_quantity::text, remaining_value_minor FROM cost_layers
        WHERE variant_id=${line.variantId}::uuid AND location_id=${locationId}::uuid AND compartment='AVAILABLE' AND remaining_quantity>0
        ORDER BY received_at DESC, id DESC FOR UPDATE`;
      let remaining = qty;
      let lineCost = 0n;
      for (const layer of layers) {
        if (remaining <= 0n) break;
        const available = toScaled(layer.remaining_quantity);
        const taken = available < remaining ? available : remaining;
        const value = taken === available ? layer.remaining_value_minor : (layer.remaining_value_minor * taken + available / 2n) / available;
        await tx.costLayer.update({ where: { id: layer.id }, data: { remainingQuantity: { decrement: decimal(taken) }, remainingValueMinor: { decrement: value } } });
        lineCost += value;
        remaining -= taken;
      }
      if (remaining > 0n) throw new DomainError("INSUFFICIENT_STOCK", "Le stock physique est insuffisant pour ce retour.", 409);
      await applyAvailable(tx, { shopId: row.shopId, variantId: line.variantId, locationId, qty: -qty });
      await tx.supplierReturnLine.update({ where: { id: line.id }, data: { costMinor: lineCost } });
      dispatched += line.amountMinor;
      cost += lineCost;
      await tx.stockEvent.create({
        data: {
          organizationId: context.organizationId,
          shopId: row.shopId,
          actorId: context.actorId,
          type: "RETURN",
          originType: "supplier_returns",
          originId: row.id,
          entries: { create: { variantId: line.variantId, locationId, quantity: decimal(-qty) } },
        },
      });
    }
    await tx.supplierReturn.update({ where: { id }, data: { status: "DISPATCHED", dispatchedMinor: dispatched } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "SUPPLIER_RETURN_DISPATCH",
      referenceType: "supplier_returns",
      referenceId: id,
      lines: [{ accountCode: "ASSET:CLAIM", amountMinor: cost }, { accountCode: "ASSET:STOCK", amountMinor: -cost }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "SUPPLIER_RETURN_DISPATCHED", entityType: "supplier_returns", entityId: id, requestId: context.requestId, afterJson: { dispatchedMinor: dispatched.toString() } });
    return { id, status: "DISPATCHED", dispatchedMinor: dispatched.toString() };
  });
}

export async function confirmSupplierCredit(prisma: PrismaClient, context: RoleContext, id: string, input: { amountMinor: string; reason?: string | undefined }) {
  requireOwner(context);
  return effect(prisma, context, { action: "confirm-supplier-credit", id, ...input }, async (tx) => {
    const row = await tx.supplierReturn.findFirst({ where: { id, organizationId: context.organizationId }, include: { purchase: true } });
    if (!row || row.status !== "DISPATCHED") throw new DomainError("INVALID_RETURN_TRANSITION", "L’avoir ne peut être confirmé qu’après expédition.", 409);
    const credit = money(input.amountMinor, "L’avoir");
    const due = row.purchase.goodsMinor + row.purchase.supplierFeesMinor - row.purchase.paidMinor;
    const debtCut = credit < due ? credit : due;
    const claim = credit - debtCut;
    if (debtCut > 0n) {
      await tx.purchase.update({
        where: { id: row.purchaseId },
        data: {
          paidMinor: { increment: debtCut },
          paymentStatus: row.purchase.paidMinor + debtCut >= row.purchase.goodsMinor + row.purchase.supplierFeesMinor ? "PAID" : "PARTIAL",
        },
      });
    }
    await tx.supplierReturn.update({
      where: { id },
      data: {
        status: claim > 0n ? "CREDIT_CONFIRMED" : "SETTLED",
        debtReductionMinor: debtCut,
        reimbursementDueMinor: claim,
        creditConfirmedAt: new Date(),
      },
    });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "SUPPLIER_CREDIT",
      referenceType: "supplier_returns",
      referenceId: id,
      lines: [
        { accountCode: "LIABILITY:SUPPLIER", amountMinor: debtCut },
        ...(claim > 0n ? [{ accountCode: "ASSET:RECEIVABLE", amountMinor: claim }] : []),
        { accountCode: "ASSET:CLAIM", amountMinor: -(debtCut + claim) },
        ...(row.dispatchedMinor > credit ? [{ accountCode: "EXPENSE:WRITE_OFF", amountMinor: row.dispatchedMinor - credit }, { accountCode: "ASSET:CLAIM", amountMinor: -(row.dispatchedMinor - credit) }] : []),
      ],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "SUPPLIER_CREDIT_CONFIRMED", entityType: "supplier_returns", entityId: id, requestId: context.requestId, afterJson: { credit: credit.toString(), debtCut: debtCut.toString(), claim: claim.toString() } });
    return { id, debtReductionMinor: debtCut.toString(), reimbursementDueMinor: claim.toString(), status: claim > 0n ? "CREDIT_CONFIRMED" : "SETTLED" };
  });
}

export async function receiveSupplierReimbursement(prisma: PrismaClient, context: RoleContext, id: string, input: { accountId: string; amountMinor: string; reference?: string | undefined }) {
  requireOwner(context);
  return effect(prisma, context, { action: "receive-supplier-reimbursement", id, ...input }, async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; status: string; shop_id: string | null; reimbursement_due_minor: bigint; reimbursement_received_minor: bigint }>>`
      SELECT id, status, shop_id, reimbursement_due_minor, reimbursement_received_minor
      FROM supplier_returns
      WHERE id=${id}::uuid AND organization_id=${context.organizationId}::uuid
      FOR UPDATE`;
    const row = locked[0];
    if (!row || row.status !== "CREDIT_CONFIRMED") throw new DomainError("INVALID_RETURN_TRANSITION", "Aucun remboursement fournisseur n’est à encaisser.", 409);
    const amount = money(input.amountMinor, "Le remboursement");
    if (amount <= 0n) throw new DomainError("INVALID_MONEY", "Le remboursement doit être strictement positif.", 422);
    const remaining = row.reimbursement_due_minor - row.reimbursement_received_minor;
    if (amount > remaining) throw new DomainError("REIMBURSEMENT_EXCEEDS_DUE", "Le remboursement dépasse le montant encore attendu.", 422);
    const reference = input.reference?.trim();
    if (reference && reference.length > 120) throw new DomainError("INVALID_INPUT", "La référence du remboursement est trop longue.", 422);
    const destination = await tx.moneyAccount.findFirst({
      where: { id: input.accountId, organizationId: context.organizationId, paymentSource: { status: "ACTIVE", type: { not: "TRANSIT" } } },
      select: { id: true },
    });
    if (!destination) throw new DomainError("ACCOUNT_NOT_FOUND", "Le compte destinataire est introuvable ou inactif.", 404);

    await moveFunds(tx, context, {
      accountId: input.accountId,
      amount,
      direction: "IN",
      type: "SUPPLIER_REIMBURSEMENT",
      reason: reference ? `Remboursement fournisseur · ${reference}` : "Remboursement fournisseur",
      shopId: row.shop_id,
    });
    const received = row.reimbursement_received_minor + amount;
    const status = received === row.reimbursement_due_minor ? "SETTLED" : "CREDIT_CONFIRMED";
    await tx.supplierReturn.update({ where: { id }, data: { reimbursementReceivedMinor: received, status } });
    await postJournal(tx, {
      organizationId: context.organizationId,
      actorId: context.actorId,
      type: "SUPPLIER_REIMBURSEMENT",
      referenceType: "supplier_returns",
      referenceId: id,
      lines: [{ accountCode: "ASSET:FUNDS", amountMinor: amount }, { accountCode: "ASSET:RECEIVABLE", amountMinor: -amount }],
    });
    await writeAudit(tx, { actorId: context.actorId, action: "SUPPLIER_REIMBURSEMENT_RECEIVED", entityType: "supplier_returns", entityId: id, requestId: context.requestId, afterJson: { amountMinor: amount.toString(), accountId: input.accountId, reference: reference ?? null, status } });
    return { id, amountMinor: amount.toString(), reimbursementReceivedMinor: received.toString(), remainingMinor: (row.reimbursement_due_minor - received).toString(), status };
  });
}

export async function listCustomerReturns(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string) {
  const shopId = actorRole === "OWNER" ? undefined : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const rows = await prisma.customerReturn.findMany({
    where: { organizationId, ...(shopId ? { shopId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sale: { select: { reference: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    saleReference: row.sale.reference,
    status: row.status,
    requestedMinor: row.requestedMinor.toString(),
    refundDueMinor: row.refundDueMinor.toString(),
    refundedMinor: row.refundedMinor.toString(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getCustomerReturn(prisma: PrismaClient, organizationId: string, actorId: string, actorRole: string, id: string) {
  const shopId = actorRole === "OWNER" ? undefined : (await prisma.managerAssignment.findFirst({ where: { userId: actorId, endedAt: null } }))?.shopId;
  const row = await prisma.customerReturn.findFirst({
    where: { id, organizationId, ...(shopId ? { shopId } : {}) },
    include: { lines: { include: { variant: { include: { product: true } } } }, sale: true },
  });
  if (!row) throw new DomainError("RETURN_NOT_FOUND", "Retour introuvable.", 404);
  return {
    id: row.id,
    saleId: row.saleId,
    saleReference: row.sale.reference,
    status: row.status,
    reason: row.reason,
    requestedMinor: row.requestedMinor.toString(),
    approvedMinor: row.approvedMinor.toString(),
    receivedMinor: row.receivedMinor.toString(),
    refundDueMinor: row.refundDueMinor.toString(),
    refundedMinor: row.refundedMinor.toString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      product: line.variant.product.name,
      variant: line.variant.name,
      requestedQty: line.requestedQty.toString(),
      approvedQty: line.approvedQty.toString(),
      receivedQty: line.receivedQty.toString(),
      disposition: line.disposition,
    })),
  };
}
