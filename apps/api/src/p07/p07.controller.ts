import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import {
  approveStockCount,
  authorizeCreditException,
  collectCustomerPayment,
  confirmHandover,
  confirmSupplierCredit,
  createCustomer,
  createOpeningReceivable,
  decideCustomerReturn,
  decideSupplierReturn,
  declareCountLines,
  declareStockLoss,
  dispatchSupplierReturn,
  DomainError,
  getCustomer,
  getCustomerPaymentContext,
  getCustomerReturn,
  getStockCount,
  listCustomerReturns,
  listCustomers,
  listHandovers,
  listReceivables,
  listStockCounts,
  listStockLossContext,
  listStockLosses,
  listSupplierReturns,
  openStockCount,
  payCustomerRefund,
  previewCustomerPayment,
  previewSupplierPayment,
  receiveCustomerReturn,
  requestCustomerReturn,
  requestRecount,
  requestSupplierReturn,
  receiveSupplierReimbursement,
  startHandover,
  submitStockCount,
  updateCustomer,
  writeOffReceivable,
  writeOffStockLoss,
} from "@cercle/domain";
import { z } from "zod";

import { AuthenticatedGuard, FreshSessionGuard, OwnerGuard, OwnerMfaGuard, requireActor, type Actor } from "../auth/guards.js";
import { DomainHttpError } from "../http/domain-http.js";
import { PRISMA } from "../tokens.js";

type RequestWithActor = { actor?: Actor; id?: string };
const money = z.string().regex(/^\d+$/);
const qty = z.string().regex(/^\d+(?:\.\d{1,6})?$/);

@Controller("api/v1")
@UseGuards(AuthenticatedGuard, OwnerMfaGuard)
export class P07Controller {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private context(request: RequestWithActor, key: string | undefined) {
    const actor = requireActor(request);
    const parsed = z.uuid().safeParse(key);
    if (!parsed.success) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Un en-tête Idempotency-Key UUID est requis.", 400);
    return { organizationId: actor.organizationId, actorId: actor.id, actorRole: actor.role, key: parsed.data, requestId: String(request.id ?? crypto.randomUUID()) };
  }

  @Get("customers")
  async customers(@Req() request: RequestWithActor, @Query("shopId") shopId?: string, @Query("q") search?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, customers: await listCustomers(this.prisma, actor.organizationId, actor.id, actor.role, { ...(shopId ? { shopId: z.uuid().parse(shopId) } : {}), ...(search ? { search } : {}) }) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customers") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async create(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ shopId: z.uuid().optional(), name: z.string().trim().min(2).max(160), phone: z.string().trim().min(6).max(32), creditLimitMinor: money.optional(), notes: z.string().trim().max(500).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await createCustomer(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("customers/:id")
  async customer(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, customer: await getCustomer(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("customers/:id/payment-context")
  async customerPaymentContext(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, ...(await getCustomerPaymentContext(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id))) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Patch("customers/:id") @UseGuards(FreshSessionGuard)
  async update(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ name: z.string().trim().min(2).max(160).optional(), phone: z.string().trim().min(6).max(32).optional(), creditLimitMinor: money.optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional(), notes: z.string().trim().max(500).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await updateCustomer(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("receivables")
  async receivables(@Req() request: RequestWithActor, @Query("shopId") shopId?: string, @Query("overdue") overdue?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, receivables: await listReceivables(this.prisma, actor.organizationId, actor.id, actor.role, { ...(shopId ? { shopId: z.uuid().parse(shopId) } : {}), overdue: overdue === "true" }) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("credit-authorizations") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async authorize(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ shopId: z.uuid(), customerId: z.uuid(), payloadHash: z.string().min(16).max(128), maxDueMinor: money, reason: z.string().trim().min(3).max(500), expiresInSeconds: z.number().int().min(30).max(600).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await authorizeCreditException(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customer-payments/preview") @HttpCode(200)
  async previewCollect(@Req() request: RequestWithActor, @Body() body: unknown) {
    try {
      const actor = requireActor(request);
      const input = z.object({ customerId: z.uuid(), amountMinor: money }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await previewCustomerPayment(this.prisma, actor.organizationId, actor.id, actor.role, input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customer-payments") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async collect(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ customerId: z.uuid(), accountId: z.uuid(), amountMinor: money, previewHash: z.string().min(16).max(128) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await collectCustomerPayment(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("receivables/:id/write-off") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async writeOff(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ amountMinor: money, reason: z.string().trim().min(3).max(500) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await writeOffReceivable(this.prisma, this.context(request, key), { receivableId: z.uuid().parse(id), ...input })) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("opening-receivables") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async opening(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ shopId: z.uuid(), customerId: z.uuid(), amountMinor: money, dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reason: z.string().trim().min(3).max(500) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await createOpeningReceivable(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("purchases/:id/payment-preview") @HttpCode(200) @UseGuards(OwnerGuard)
  async supplierPreview(@Req() request: RequestWithActor, @Param("id") id: string, @Body() body: unknown) {
    try {
      const actor = requireActor(request);
      const input = z.object({ amountMinor: money }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await previewSupplierPayment(this.prisma, actor.organizationId, z.uuid().parse(id), input.amountMinor)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("customer-returns")
  async returns(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, returns: await listCustomerReturns(this.prisma, actor.organizationId, actor.id, actor.role) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customer-returns") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async requestReturn(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({
        saleId: z.uuid(),
        reason: z.string().trim().min(3).max(500),
        lines: z.array(z.object({ saleLineId: z.uuid(), quantity: qty, disposition: z.enum(["AVAILABLE", "DAMAGED"]).optional() }).strict()).min(1).max(100),
      }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await requestCustomerReturn(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("customer-returns/:id")
  async returnDetail(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, return: await getCustomerReturn(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customer-returns/:id/decide") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async decideReturn(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ outcome: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(3).max(500).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await decideCustomerReturn(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customer-returns/:id/receive") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async receiveReturn(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ lines: z.array(z.object({ returnLineId: z.uuid(), quantity: qty, disposition: z.enum(["AVAILABLE", "DAMAGED"]) }).strict()).min(1).max(100) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await receiveCustomerReturn(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("customer-returns/:id/refund") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async refund(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ accountId: z.uuid(), amountMinor: money }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await payCustomerRefund(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("supplier-returns")
  @UseGuards(OwnerGuard)
  async supplierReturns(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, returns: await listSupplierReturns(this.prisma, actor.organizationId) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("supplier-returns") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async requestSupplier(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ purchaseId: z.uuid(), reason: z.string().trim().min(3).max(500), lines: z.array(z.object({ purchaseLineId: z.uuid(), quantity: qty }).strict()).min(1).max(100) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await requestSupplierReturn(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("supplier-returns/:id/decide") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async decideSupplier(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ outcome: z.enum(["APPROVED", "REJECTED"]) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await decideSupplierReturn(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("supplier-returns/:id/dispatch") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async dispatchSupplier(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ locationId: z.uuid() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await dispatchSupplierReturn(this.prisma, this.context(request, key), z.uuid().parse(id), input.locationId)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("supplier-returns/:id/confirm-credit") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async confirmCredit(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ amountMinor: money, reason: z.string().trim().max(500).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await confirmSupplierCredit(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("supplier-returns/:id/receive-reimbursement") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async receiveSupplierRefund(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ accountId: z.uuid(), amountMinor: money, reference: z.string().trim().max(120).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await receiveSupplierReimbursement(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("stock-counts")
  async counts(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, counts: await listStockCounts(this.prisma, actor.organizationId, actor.id, actor.role, shopId ? z.uuid().parse(shopId) : undefined) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-counts") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async openCount(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ shopId: z.uuid(), locationId: z.uuid(), reason: z.string().trim().max(500).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await openStockCount(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("stock-counts/:id")
  async countDetail(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, count: await getStockCount(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-counts/:id/lines") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async declare(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ lines: z.array(z.object({ variantId: z.uuid(), compartment: z.enum(["AVAILABLE", "DAMAGED", "QUARANTINE"]), quantity: qty, explanation: z.string().trim().max(500).optional() }).strict()).min(1).max(500) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await declareCountLines(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-counts/:id/submit") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async submitCount(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await submitStockCount(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-counts/:id/recount") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async recount(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ reason: z.string().trim().min(3).max(500) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await requestRecount(this.prisma, this.context(request, key), z.uuid().parse(id), input.reason)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-counts/:id/approve") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async approveCount(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({
        explanations: z.record(z.string(), z.string().trim().min(3).max(500)).optional(),
        surplusCosts: z.array(z.object({ variantId: z.uuid(), unitCostMinor: money }).strict()).max(200).optional(),
      }).strict().parse(body ?? {});
      return { protocolVersion: PROTOCOL_VERSION, ...(await approveStockCount(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("stock-losses/context")
  async lossContext(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, options: await listStockLossContext(this.prisma, actor.organizationId, actor.id, actor.role) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("stock-losses")
  async losses(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, losses: await listStockLosses(this.prisma, actor.organizationId, actor.id, actor.role) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-losses") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async declareLoss(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ locationId: z.uuid(), variantId: z.uuid(), lotId: z.uuid().optional(), quantity: qty, compartment: z.enum(["AVAILABLE", "DAMAGED", "QUARANTINE"]), reason: z.string().trim().min(3).max(500), physicalState: z.enum(["DAMAGED", "MISSING"]).optional(), attachmentIds: z.array(z.uuid()).max(10).optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await declareStockLoss(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("stock-losses/:id/write-off") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async writeOffLoss(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await writeOffStockLoss(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("shop-handovers")
  @UseGuards(OwnerGuard)
  async handovers(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, handovers: await listHandovers(this.prisma, actor.organizationId, shopId ? z.uuid().parse(shopId) : undefined) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shop-handovers") @HttpCode(200) @UseGuards(OwnerGuard, FreshSessionGuard)
  async start(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ shopId: z.uuid(), toUserId: z.uuid(), reason: z.string().trim().min(3).max(500), recovery: z.boolean().optional() }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await startHandover(this.prisma, this.context(request, key), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shop-handovers/:id/confirm") @HttpCode(200) @UseGuards(FreshSessionGuard)
  async confirm(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await confirmHandover(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }
}
