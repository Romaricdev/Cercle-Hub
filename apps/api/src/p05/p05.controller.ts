import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import {
  cancelCount,
  commentDiscrepancy,
  completeAttachment,
  createAttachmentIntent,
  createExpense,
  createFundTransfer,
  currentCashSession,
  decideExpense,
  declareIrregularExpense,
  DomainError,
  getAttachmentForDownload,
  getCashSession,
  getDiscrepancy,
  getExpense,
  getManagerDiscrepancy,
  listCashSessions,
  listDiscrepancies,
  listExpenses,
  listFundAccounts,
  listFundTransfers,
  listManagerDiscrepancies,
  payExpense,
  receiveFundTransfer,
  resolveDiscrepancy,
  respondToDiscrepancy,
  sendFundTransfer,
  startCount,
  submitCount,
  submitExpense,
} from "@cercle/domain";
import { createStorageClient, putPrivateObject, readPrivateObject } from "@cercle/storage";
import type { FastifyReply } from "fastify";
import { z } from "zod";

import { AuthenticatedGuard, FreshSessionGuard, ManagerGuard, OwnerGuard, OwnerMfaGuard, requireActor, type Actor } from "../auth/guards.js";
import type { ApiEnv } from "../env.js";
import { DomainHttpError } from "../http/domain-http.js";
import { API_ENV, PRISMA } from "../tokens.js";

type RequestWithActor = { actor?: Actor; id?: string };

const money = z.string().regex(/^\d+$/);
const expenseSchema = z.object({
  category: z.enum(["RENT", "UTILITIES", "TRANSPORT", "SUPPLIES", "OTHER"]),
  description: z.string().trim().min(5).max(500),
  amountMinor: money,
  accountId: z.uuid(),
  beneficiary: z.string().trim().max(160).optional(),
  receiptExceptionReason: z.string().trim().max(240).optional(),
  attachmentIds: z.array(z.uuid()).max(8).optional(),
  alreadyPaid: z.boolean().optional(),
  shopId: z.uuid().optional(),
}).strict();
const countSchema = z.object({
  lines: z.array(z.object({
    accountId: z.uuid(),
    denominations: z.array(z.object({ valueMinor: money, quantity: z.number().int().min(0).max(100_000) }).strict()).max(20).optional(),
    declaredMinor: money.optional(),
    confirmedEmpty: z.boolean().optional(),
    explanation: z.string().trim().max(500).optional(),
  }).strict()).min(1).max(20),
}).strict();
const transferSchema = z.object({
  sourceAccountId: z.uuid(),
  destinationAccountId: z.uuid(),
  amountMinor: money,
  purpose: z.enum(["REMITTANCE", "FLOAT", "OWNER_CONTRIBUTION", "WITHDRAWAL"]),
  reason: z.string().trim().min(3).max(240),
  shopId: z.uuid().optional(),
}).strict();
const receiveSchema = z.object({ amountMinor: money, comment: z.string().trim().max(240).optional() }).strict();
const decideSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().min(3).max(240) }).strict();
const resolveSchema = z.object({
  decision: z.enum(["ACCEPT", "RECLASSIFY", "ADJUST", "REQUEST_INFO"]),
  reason: z.string().trim().min(5).max(500),
  amountMinor: money.optional(),
}).strict();
const respondSchema = z.object({
  text: z.string().trim().min(10).max(1000),
  attachmentIds: z.array(z.uuid()).max(8).optional(),
}).strict();
const attachmentIntentSchema = z.object({
  documentType: z.enum(["expenses", "fund_transfers", "discrepancy_cases", "purchase_requests", "purchases", "purchase_payments", "shipments", "goods_receipts"]),
  mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().min(32).max(5_000_000),
  name: z.string().trim().min(2).max(180),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
const attachmentContentSchema = z.object({ base64: z.string().min(32).max(7_000_000) }).strict();

@Controller("api/v1")
@UseGuards(AuthenticatedGuard, OwnerMfaGuard)
export class P05Controller {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private context(request: RequestWithActor, key: string | undefined) {
    const actor = requireActor(request);
    const parsed = z.uuid().safeParse(key);
    if (!parsed.success) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Un en-tête Idempotency-Key UUID est requis.", 400);
    return { organizationId: actor.organizationId, actorId: actor.id, actorRole: actor.role, key: parsed.data, requestId: String(request.id ?? crypto.randomUUID()) };
  }

  @Get("cash-sessions/current")
  async current(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, ...(await currentCashSession(this.prisma, actor.organizationId, actor.id, actor.role)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("cash-sessions")
  async listSessions(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, sessions: await listCashSessions(this.prisma, actor.organizationId, actor.id, actor.role, shopId ? z.uuid().parse(shopId) : undefined) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("cash-sessions/:id")
  async sessionDetail(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, session: await getCashSession(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("cash-sessions/:id/start-count") @HttpCode(200)
  async start(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await startCount(this.prisma, this.context(request, key))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("cash-sessions/:id/cancel-count") @HttpCode(200)
  async cancel(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ reason: z.string().trim().max(240).optional() }).strict().parse(body ?? {});
      return { protocolVersion: PROTOCOL_VERSION, ...(await cancelCount(this.prisma, this.context(request, key), z.uuid().parse(id), input.reason)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("cash-sessions/:id/submit-count") @HttpCode(200)
  async submit(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await submitCount(this.prisma, this.context(request, key), z.uuid().parse(id), countSchema.parse(body).lines)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("owner/cash-sessions")
  @UseGuards(OwnerGuard)
  async ownerSessions(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    return this.listSessions(request, shopId);
  }

  @Get("owner/cash-sessions/:id")
  @UseGuards(OwnerGuard)
  async ownerSession(@Req() request: RequestWithActor, @Param("id") id: string) {
    return this.sessionDetail(request, id);
  }

  @Get("expenses")
  async expenses(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, expenses: await listExpenses(this.prisma, actor.organizationId, actor.id, actor.role, shopId ? z.uuid().parse(shopId) : undefined) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("expenses") @HttpCode(200)
  async createExp(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createExpense(this.prisma, this.context(request, key), expenseSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("expenses/:id")
  async expenseDetail(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, expense: await getExpense(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("expenses/:id/submit") @HttpCode(200)
  async submitExp(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await submitExpense(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("expenses/:id/pay") @HttpCode(200)
  async payExp(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await payExpense(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("expenses/:id/decide") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async decideExp(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = decideSchema.parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await decideExpense(this.prisma, this.context(request, key), z.uuid().parse(id), input.decision, input.reason)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("expenses/declare-irregular") @HttpCode(200)
  async irregular(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await declareIrregularExpense(this.prisma, this.context(request, key), expenseSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("fund-accounts")
  async accounts(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, accounts: await listFundAccounts(this.prisma, actor.organizationId, actor.id, actor.role) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("fund-transfers")
  async transfers(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, transfers: await listFundTransfers(this.prisma, actor.organizationId, actor.id, actor.role) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("fund-transfers") @HttpCode(200)
  async createTransfer(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createFundTransfer(this.prisma, this.context(request, key), transferSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("fund-transfers/:id/send") @HttpCode(200)
  async sendTransfer(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await sendFundTransfer(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("fund-transfers/:id/receive") @HttpCode(200)
  async receiveTransfer(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = receiveSchema.parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await receiveFundTransfer(this.prisma, this.context(request, key), z.uuid().parse(id), input.amountMinor, input.comment)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("owner/discrepancies")
  @UseGuards(OwnerGuard)
  async discrepancies(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, cases: await listDiscrepancies(this.prisma, actor.organizationId, shopId ? z.uuid().parse(shopId) : undefined) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("owner/discrepancies/:id")
  @UseGuards(OwnerGuard)
  async discrepancy(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, discrepancy: await getDiscrepancy(this.prisma, actor.organizationId, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("manager/discrepancies")
  @UseGuards(ManagerGuard)
  async managerDiscrepancies(@Req() request: RequestWithActor) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, cases: await listManagerDiscrepancies(this.prisma, actor.organizationId, actor.id) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("manager/discrepancies/:id")
  @UseGuards(ManagerGuard)
  async managerDiscrepancy(@Req() request: RequestWithActor, @Param("id") id: string) {
    try {
      const actor = requireActor(request);
      return { protocolVersion: PROTOCOL_VERSION, discrepancy: await getManagerDiscrepancy(this.prisma, actor.organizationId, actor.id, z.uuid().parse(id)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("manager/discrepancies/:id/respond") @HttpCode(200)
  @UseGuards(ManagerGuard)
  async managerRespond(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = respondSchema.parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await respondToDiscrepancy(this.prisma, this.context(request, key), z.uuid().parse(id), input)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("owner/discrepancies/:id/comment") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async comment(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = z.object({ text: z.string().trim().min(3).max(1000) }).strict().parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await commentDiscrepancy(this.prisma, this.context(request, key), z.uuid().parse(id), input.text)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("owner/discrepancies/:id/resolve") @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async resolve(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await resolveDiscrepancy(this.prisma, this.context(request, key), z.uuid().parse(id), resolveSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("attachments") @HttpCode(200)
  async intent(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const created = await createAttachmentIntent(this.prisma, this.context(request, key), attachmentIntentSchema.parse(body));
      return { protocolVersion: PROTOCOL_VERSION, id: created.id };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("attachments/:id/content") @HttpCode(200)
  async upload(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const bytes = Buffer.from(attachmentContentSchema.parse(body).base64, "base64");
      const actor = requireActor(request);
      const attachment = await this.prisma.attachment.findFirst({ where: { id: z.uuid().parse(id), organizationId: actor.organizationId, uploadedById: actor.id } });
      if (!attachment) throw new DomainError("ATTACHMENT_NOT_FOUND", "Justificatif introuvable.", 404);
      await putPrivateObject(createStorageClient(this.env.s3), this.env.s3.bucket, attachment.storageKey, bytes);
      return { protocolVersion: PROTOCOL_VERSION, ...(await completeAttachment(this.prisma, this.context(request, key), attachment.id, bytes)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("attachments/:id/content")
  async download(@Req() request: RequestWithActor, @Param("id") id: string, @Res() reply: FastifyReply) {
    try {
      const actor = requireActor(request);
      const attachment = await getAttachmentForDownload(this.prisma, actor.organizationId, actor.id, actor.role, z.uuid().parse(id));
      const bytes = await readPrivateObject(createStorageClient(this.env.s3), this.env.s3.bucket, attachment.storageKey);
      reply
        .header("content-type", attachment.mime)
        .header("content-disposition", `attachment; filename="${attachment.originalName.replaceAll('"', "")}"`)
        .header("cache-control", "private, no-store")
        .header("x-content-type-options", "nosniff")
        .send(Buffer.from(bytes));
    } catch (error) { throw DomainHttpError.from(error); }
  }
}
