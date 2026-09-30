import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import {
  cancelRequestRemainder,
  closePurchaseControl,
  createRequest,
  createShipment,
  createSupplier,
  decideRequest,
  decideShipment,
  dispatchShipment,
  DomainError,
  getPurchase,
  getReplenishmentContext,
  getRequest,
  getShipment,
  getSupplier,
  listPurchases,
  listRequests,
  listShipments,
  listShipmentPage,
  listSuppliers,
  patchRequest,
  payPurchase,
  postPurchase,
  postReceipt,
  regularizeSurplus,
  respondToRequest,
  submitRequest,
  submitShipment,
  updateSupplier,
  withdrawRequest,
} from "@cercle/domain";
import { z } from "zod";

import { AuthenticatedGuard, FreshSessionGuard, ManagerGuard, OwnerGuard, OwnerMfaGuard, requireActor, type Actor } from "../auth/guards.js";
import { DomainHttpError } from "../http/domain-http.js";
import { PRISMA } from "../tokens.js";

type RequestWithActor = { actor?: Actor; id?: string };

const money = z.string().regex(/^\d+$/);
const qty = z.string().regex(/^\d+(?:\.\d{1,6})?$/);
const requestLine = z.object({
  variantId: z.uuid(),
  unitId: z.uuid(),
  quantity: qty,
  estimatedUnitMinor: money.optional(),
}).strict();
const requestSchema = z.object({
  comment: z.string().trim().min(5).max(1000),
  urgency: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  suggestedSupplierId: z.uuid().optional(),
  estimatedFeesMinor: money.optional(),
  lines: z.array(requestLine).min(1).max(100),
  attachmentIds: z.array(z.uuid()).max(8).optional(),
}).strict();
const requestPatchSchema = z.object({
  comment: z.string().trim().min(5).max(1000).optional(),
  urgency: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  suggestedSupplierId: z.uuid().nullable().optional(),
  estimatedFeesMinor: money.optional(),
  lines: z.array(requestLine).min(1).max(100).optional(),
}).strict();
const decisionSchema = z.object({
  outcome: z.enum(["APPROVED", "PARTIAL", "REJECTED", "NEEDS_INFO"]),
  reason: z.string().trim().min(3).max(1000).optional(),
  buyer: z.enum(["MANAGER", "OWNER", "EXISTING_STOCK"]).optional(),
  budgetMinor: money.optional(),
  sourceAccountId: z.uuid().optional(),
  validUntil: z.string().optional(),
  sourceLocationId: z.uuid().optional(),
  lines: z.array(z.object({
    requestLineId: z.uuid(),
    maxQtyBase: qty,
    maxAmountMinor: money,
  }).strict()).max(100).optional(),
}).strict();
const respondSchema = z.object({
  text: z.string().trim().min(5).max(1000),
  lines: z.array(requestLine).min(1).max(100).optional(),
  attachmentIds: z.array(z.uuid()).max(8).optional(),
}).strict();
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  tradeName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(180).optional(),
  address: z.string().trim().max(500).optional(),
  taxId: z.string().trim().max(80).optional(),
  contactName: z.string().trim().max(160).optional(),
  paymentTerms: z.string().trim().max(240).optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
}).strict();
const purchaseSchema = z.object({
  supplierId: z.uuid(),
  requestId: z.uuid().optional(),
  approvalId: z.uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z.array(z.object({
    variantId: z.uuid(),
    unitId: z.uuid(),
    quantity: qty,
    unitPriceMinor: money,
  }).strict()).min(1).max(100),
  destinations: z.array(z.object({
    purchaseLineIndex: z.number().int().min(0).max(99),
    locationId: z.uuid(),
    quantity: qty,
  }).strict()).max(400).optional(),
  fees: z.array(z.object({
    kind: z.enum(["SUPPLIER", "EXTERNAL"]),
    amountMinor: money,
    accountId: z.uuid().optional(),
    description: z.string().trim().min(2).max(240),
  }).strict()).max(20).optional(),
  payments: z.array(z.object({
    accountId: z.uuid(),
    amountMinor: money,
  }).strict()).max(10).optional(),
  attachmentIds: z.array(z.uuid()).max(8).optional(),
  receiveNow: z.boolean().optional(),
  deliveryComplete: z.boolean().optional(),
  receiptLines: z.array(z.object({
    shipmentLineId: z.uuid(),
    acceptedQty: qty,
    damagedQty: qty.optional(),
    surplusQty: qty.optional(),
    lotCode: z.string().trim().max(80).optional(),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    remarks: z.string().trim().max(500).optional(),
  }).strict()).max(100).optional(),
}).strict();
const paySchema = z.object({ accountId: z.uuid(), amountMinor: money }).strict();
const receiptSchema = z.object({
  shipmentId: z.uuid(),
  deliveryComplete: z.boolean().optional(),
  comment: z.string().trim().max(500).optional(),
  attachmentIds: z.array(z.uuid()).max(8).optional(),
  lines: z.array(z.object({
    shipmentLineId: z.uuid(),
    acceptedQty: qty,
    damagedQty: qty.optional(),
    surplusQty: qty.optional(),
    lotCode: z.string().trim().max(80).optional(),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    remarks: z.string().trim().max(500).optional(),
  }).strict()).min(1).max(100),
}).strict();
const shipmentSchema = z.object({
  sourceLocationId: z.uuid(),
  destinationLocationId: z.uuid(),
  requestId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
  lines: z.array(z.object({ variantId: z.uuid(), quantity: qty }).strict()).min(1).max(100),
}).strict();
const shipmentDecisionSchema = z.object({
  outcome: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();
const regularizeSchema = z.object({
  receiptId: z.uuid(),
  variantId: z.uuid(),
  unitCostMinor: money,
  quantity: qty,
  accountId: z.uuid().optional(),
}).strict();

@Controller("api/v1")
@UseGuards(AuthenticatedGuard, OwnerMfaGuard)
export class P06Controller {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private context(request: RequestWithActor, key: string | undefined) {
    const actor = requireActor(request);
    const parsed = z.uuid().safeParse(key);
    if (!parsed.success) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Un en-tête Idempotency-Key UUID est requis.", 400);
    return { organizationId: actor.organizationId, actorId: actor.id, actorRole: actor.role, key: parsed.data, requestId: String(request.id ?? crypto.randomUUID()) };
  }

  @Get("replenishment/context")
  async contextPayload(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, ...(await getReplenishmentContext(this.prisma, actor.organizationId, actor.id, actor.role)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("suppliers")
  async suppliers(@Req() request: RequestWithActor, @Query("q") query?: string, @Query("status") status?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, suppliers: await listSuppliers(this.prisma, actor.organizationId, actor.role, query, status) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("suppliers/:id")
  async supplier(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, ...(await getSupplier(this.prisma, actor.organizationId, actor.role, z.uuid().parse(id))) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("suppliers") @HttpCode(200)
  async createSup(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createSupplier(this.prisma, this.context(request, key), supplierSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Patch("suppliers/:id") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async updateSup(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await updateSupplier(this.prisma, this.context(request, key), z.uuid().parse(id), supplierSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("requests")
  async requests(@Req() request: RequestWithActor, @Query("status") status?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, requests: await listRequests(this.prisma, actor.organizationId, actor.id, actor.role, status) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("requests/:id")
  async request(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, request: await getRequest(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("requests") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async createReq(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createRequest(this.prisma, this.context(request, key), requestSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Patch("requests/:id") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async patchReq(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await patchRequest(this.prisma, this.context(request, key), z.uuid().parse(id), requestPatchSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("requests/:id/submit") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async submitReq(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await submitRequest(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("requests/:id/respond") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async respondReq(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await respondToRequest(this.prisma, this.context(request, key), z.uuid().parse(id), respondSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("requests/:id/withdraw") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async withdrawReq(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await withdrawRequest(this.prisma, this.context(request, key), z.uuid().parse(id), reasonSchema.parse(body).reason)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("requests/:id/decision") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async decideReq(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await decideRequest(this.prisma, this.context(request, key), z.uuid().parse(id), decisionSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("requests/:id/cancel-remainder") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async cancelRemainder(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await cancelRequestRemainder(this.prisma, this.context(request, key), z.uuid().parse(id), reasonSchema.parse(body).reason)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("purchases")
  async purchases(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, purchases: await listPurchases(this.prisma, actor.organizationId, actor.id, actor.role) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("purchases/:id")
  async purchase(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, purchase: await getPurchase(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("purchases") @HttpCode(200)
  @UseGuards(FreshSessionGuard)
  async createPurchase(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await postPurchase(this.prisma, this.context(request, key), purchaseSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("purchases/with-receipt") @HttpCode(200)
  @UseGuards(FreshSessionGuard)
  async purchaseWithReceipt(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await postPurchase(this.prisma, this.context(request, key), { ...purchaseSchema.parse(body), receiveNow: true })) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("purchases/:id/pay") @HttpCode(200)
  @UseGuards(FreshSessionGuard)
  async pay(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await payPurchase(this.prisma, this.context(request, key), z.uuid().parse(id), paySchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("purchases/:id/control-close") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async closeControl(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await closePurchaseControl(this.prisma, this.context(request, key), z.uuid().parse(id), reasonSchema.parse(body).reason)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("receipts") @HttpCode(200)
  async receive(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await postReceipt(this.prisma, this.context(request, key), receiptSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("surplus/regularize") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async regularize(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await regularizeSurplus(this.prisma, this.context(request, key), regularizeSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("shipments")
  async shipments(@Req() request: RequestWithActor, @Query("kind") kind?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("status") status?: string, @Query("movementType") movementType?: string, @Query("query") query?: string) {
    try {
      const actor = requireActor(request);
      if (page || pageSize || status || movementType || query) {
        const parsedPage = z.coerce.number().int().min(1).default(1).parse(page);
        const parsedPageSize = z.coerce.number().int().min(5).max(100).default(20).parse(pageSize);
        const parsedStatus = status ? z.enum(["DRAFT", "SUBMITTED", "APPROVED", "DISPATCHED", "PARTIAL", "RECEIVED", "DISPUTED", "REJECTED", "CLOSED"]).parse(status) : undefined;
        const parsedMovementType = movementType ? z.enum(["PURCHASE", "TRANSFER"]).parse(movementType) : undefined;
        return { protocolVersion: PROTOCOL_VERSION, ...(await listShipmentPage(this.prisma, actor.organizationId, actor.id, actor.role, { page: parsedPage, pageSize: parsedPageSize, ...(parsedStatus ? { status: parsedStatus } : {}), ...(parsedMovementType ? { movementType: parsedMovementType } : {}), ...(query ? { query } : {}) })) };
      }
      const parsed = kind === "in" || kind === "out" || kind === "all" ? kind : "all";
      return { protocolVersion: PROTOCOL_VERSION, shipments: await listShipments(this.prisma, actor.organizationId, actor.id, actor.role, parsed) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("shipments/:id")
  async shipment(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, shipment: await getShipment(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shipments") @HttpCode(200)
  async createShip(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createShipment(this.prisma, this.context(request, key), shipmentSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shipments/:id/submit") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async submitShip(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await submitShipment(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shipments/:id/decision") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async decideShip(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = shipmentDecisionSchema.parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await decideShipment(this.prisma, this.context(request, key), z.uuid().parse(id), input.outcome, input.reason)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shipments/:id/approve") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async approveShip(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ reason: z.string().trim().min(3).max(500).optional() }).strict().parse(body ?? {});
      return { protocolVersion: PROTOCOL_VERSION, ...(await decideShipment(this.prisma, this.context(request, key), z.uuid().parse(id), "APPROVED", input.reason)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shipments/:id/dispatch") @HttpCode(200)
  async dispatch(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await dispatchShipment(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }
}
