import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import { DomainError, getSale, listSales, managerSaleContext, openCashSession, postSale, quoteSale } from "@cercle/domain";
import { z } from "zod";

import { AuthenticatedGuard, OwnerMfaGuard, requireActor, type Actor } from "../auth/guards.js";
import { DomainHttpError } from "../http/domain-http.js";
import { PRISMA } from "../tokens.js";

type RequestWithActor = { actor?: Actor; id?: string };
const lineSchema = z.object({ saleUnitId: z.uuid(), quantity: z.string().regex(/^\d+(?:\.\d{1,6})?$/), discountMinor: z.string().regex(/^\d+$/).optional() }).strict();
const quoteSchema = z.object({ lines: z.array(lineSchema).min(1).max(100) }).strict();
const saleSchema = z.object({
  authorizationId: z.uuid(), lines: z.array(lineSchema).min(1).max(100),
  payments: z.array(z.object({ accountId: z.uuid(), amountMinor: z.string().regex(/^\d+$/), cashReceivedMinor: z.string().regex(/^\d+$/).optional(), changeGivenMinor: z.string().regex(/^\d+$/).optional(), externalReference: z.string().trim().max(120).optional() }).strict()).min(1).max(10),
}).strict();

@Controller("api/v1")
@UseGuards(AuthenticatedGuard, OwnerMfaGuard)
export class P04Controller {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private manager(request: RequestWithActor) {
    const actor = requireActor(request);
    if (actor.role !== "MANAGER") throw new DomainError("FORBIDDEN", "Cette opération est réservée au gérant.", 403);
    return actor;
  }

  private context(request: RequestWithActor, key: string | undefined) {
    const actor = this.manager(request); const parsed = z.uuid().safeParse(key);
    if (!parsed.success) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Un en-tête Idempotency-Key UUID est requis.", 400);
    return { organizationId: actor.organizationId, actorId: actor.id, key: parsed.data, requestId: String(request.id ?? crypto.randomUUID()) };
  }

  @Get("manager/sales/context")
  async contextData(@Req() request: RequestWithActor) {
    try { const actor = this.manager(request); return { protocolVersion: PROTOCOL_VERSION, ...(await managerSaleContext(this.prisma, actor.organizationId, actor.id)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("cash-sessions/open") @HttpCode(200)
  async open(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await openCashSession(this.prisma, this.context(request, key))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("sales/quote") @HttpCode(200)
  async quote(@Req() request: RequestWithActor, @Body() body: unknown) {
    try { const actor = this.manager(request); const input = quoteSchema.parse(body); return { protocolVersion: PROTOCOL_VERSION, ...(await quoteSale(this.prisma, actor.organizationId, actor.id, input.lines)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("sales") @HttpCode(200)
  async create(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await postSale(this.prisma, this.context(request, key), saleSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("sales")
  async list(@Req() request: RequestWithActor) {
    try { const actor = this.manager(request); const assignment = await this.prisma.managerAssignment.findFirst({ where: { userId: actor.id, endedAt: null } }); if (!assignment) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404); return { protocolVersion: PROTOCOL_VERSION, sales: await listSales(this.prisma, actor.organizationId, assignment.shopId) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("sales/:id")
  async detail(@Req() request: RequestWithActor, @Param("id") id: string) {
    try { const actor = this.manager(request); const assignment = await this.prisma.managerAssignment.findFirst({ where: { userId: actor.id, endedAt: null } }); if (!assignment) throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404); return { protocolVersion: PROTOCOL_VERSION, sale: await getSale(this.prisma, actor.organizationId, assignment.shopId, z.uuid().parse(id)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }
}
