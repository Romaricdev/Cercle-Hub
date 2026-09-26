import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@cercle/contracts";
import type { Prisma, PrismaClient } from "@cercle/database";
import { createStorageClient, putPrivateObject, readPrivateObject } from "@cercle/storage";
import type { FastifyReply } from "fastify";
import {
  createDepot,
  createPaymentSource,
  createPolicy,
  createPrice,
  createProduct,
  createShop,
  createUnit,
  createVariant,
  DomainError,
  getShop,
  listPaymentSources,
  listProducts,
  listShops,
  listStock,
  listStockMovements,
  ownerOverview,
  postOwnerFund,
  saveOpeningDraft,
  transitionShop,
  updateLocation,
  updateProduct,
  updateShop,
  validateOpening,
} from "@cercle/domain";
import { z } from "zod";

import { AuthenticatedGuard, FreshSessionGuard, OwnerGuard, OwnerMfaGuard, requireActor, type Actor } from "../auth/guards.js";
import { DomainHttpError } from "../http/domain-http.js";
import type { ApiEnv } from "../env.js";
import { API_ENV, PRISMA } from "../tokens.js";

type RequestWithActor = { actor?: Actor; id?: string };

const shopSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(160),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  timezone: z.string().min(3).max(80).optional(),
}).strict();
const shopPatchSchema = shopSchema.omit({ code: true }).partial().strict();
const reasonSchema = z.object({ reason: z.string().trim().min(2).max(240) }).strict();
const productSchema = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().max(80).optional(),
  family: z.string().max(120).optional(),
  tracksLots: z.boolean().optional(),
  tracksExpiry: z.boolean().optional(),
  shopIds: z.array(z.uuid()).max(100).optional(),
}).strict();
const productPatchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  family: z.string().max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  shopIds: z.array(z.uuid()).max(100).optional(),
}).strict();
const productImageSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(4).max(1_000_000),
}).strict();
const variantSchema = z.object({ name: z.string().min(2).max(160), sku: z.string().max(80).optional(), barcode: z.string().max(80).optional() }).strict();
const unitSchema = z.object({
  name: z.string().min(2).max(80),
  symbol: z.string().min(1).max(20),
  factor: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  precision: z.number().int().min(0).max(6),
  isReference: z.boolean().optional(),
}).strict();
const priceSchema = z.object({
  saleUnitId: z.uuid(),
  shopId: z.uuid().optional(),
  amountMinor: z.string().regex(/^\d+$/),
  validFrom: z.iso.datetime().optional(),
}).strict();
const sourceSchema = z.object({
  name: z.string().min(2).max(160),
  type: z.enum(["CASH", "BANK", "MOBILE_MONEY", "OTHER"]),
  shopId: z.uuid().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict();
const fundSchema = z.object({
  accountId: z.uuid(),
  amountMinor: z.string().regex(/^\d+$/),
  reason: z.string().min(2).max(240),
  type: z.enum(["OWNER_CONTRIBUTION", "CORRECTION"]).optional(),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
  correctionOfId: z.uuid().optional(),
}).strict();
const depotSchema = z.object({ name: z.string().min(2).max(160) }).strict();
const locationSchema = z.object({ name: z.string().min(2).max(160).optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).strict();
const policySchema = z.object({
  shopId: z.uuid().optional(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  reason: z.string().min(2).max(240),
  effectiveAt: z.iso.datetime().optional(),
}).strict();
const openingSchema = z.object({
  step: z.number().int().min(1).max(13),
  stockLines: z.array(z.object({
    variantId: z.uuid(),
    locationId: z.uuid(),
    quantity: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
    unitCostMinor: z.string().regex(/^\d+$/),
    lotCode: z.string().max(80).optional(),
    expiresAt: z.iso.date().optional(),
  }).strict()).max(5_000),
  funds: z.array(z.object({ accountId: z.uuid(), amountMinor: z.string().regex(/^\d+$/) }).strict()).max(100).optional(),
  obligations: z.array(z.object({ label: z.string().min(2).max(160), amountMinor: z.string().regex(/^\d+$/) }).strict()).max(100).optional(),
}).strict();

@Controller("api/v1")
@UseGuards(AuthenticatedGuard, OwnerMfaGuard)
export class P03Controller {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, @Inject(API_ENV) private readonly env: ApiEnv) {}

  private context(request: RequestWithActor, key: string | undefined) {
    const actor = requireActor(request);
    const parsed = z.uuid().safeParse(key);
    if (!parsed.success) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Un en-tête Idempotency-Key UUID est requis.", 400);
    return { organizationId: actor.organizationId, actorId: actor.id, actorRole: actor.role, key: parsed.data, requestId: String(request.id ?? crypto.randomUUID()) };
  }

  private async scope(actor: Actor, requestedShopId?: string): Promise<string | undefined> {
    if (actor.role === "OWNER") return requestedShopId;
    const assignment = await this.prisma.managerAssignment.findFirst({ where: { userId: actor.id, endedAt: null }, select: { shopId: true } });
    if (!assignment || (requestedShopId && requestedShopId !== assignment.shopId)) {
      throw new DomainError("SHOP_NOT_FOUND", "Boutique introuvable.", 404);
    }
    return assignment.shopId;
  }

  @Get("shops")
  @UseGuards(OwnerGuard)
  async shops(@Req() request: RequestWithActor) {
    const actor = requireActor(request);
    return { protocolVersion: PROTOCOL_VERSION, shops: await listShops(this.prisma, actor.organizationId) };
  }

  @Post("shops")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async createShop(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createShop(this.prisma, this.context(request, key), shopSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("shops/:id")
  @UseGuards(OwnerGuard)
  async shop(@Req() request: RequestWithActor, @Param("id") id: string) {
    try { return { protocolVersion: PROTOCOL_VERSION, shop: await getShop(this.prisma, requireActor(request).organizationId, z.uuid().parse(id)) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Patch("shops/:id")
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async patchShop(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await updateShop(this.prisma, this.context(request, key), z.uuid().parse(id), shopPatchSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shops/:id/activate")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  activate(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.transition(request, key, id, "ACTIVE", body);
  }

  @Post("shops/:id/suspend")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  suspend(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.transition(request, key, id, "SUSPENDED", body);
  }

  @Post("shops/:id/close")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  close(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.transition(request, key, id, "CLOSED", body);
  }

  private async transition(request: RequestWithActor, key: string | undefined, id: string, target: "ACTIVE" | "SUSPENDED" | "CLOSED", body: unknown) {
    try {
      const input = reasonSchema.parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await transitionShop(this.prisma, this.context(request, key), z.uuid().parse(id), target, input.reason)) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("products")
  async products(@Req() request: RequestWithActor, @Query("shopId") requested?: string) {
    const actor = requireActor(request);
    const shopId = await this.scope(actor, requested ? z.uuid().parse(requested) : undefined);
    return { protocolVersion: PROTOCOL_VERSION, products: await listProducts(this.prisma, actor.organizationId, shopId) };
  }

  @Post("products")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async createProduct(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createProduct(this.prisma, this.context(request, key), productSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("products/:id")
  async product(@Req() request: RequestWithActor, @Param("id") id: string) {
    const actor = requireActor(request);
    const shopId = await this.scope(actor);
    const product = (await listProducts(this.prisma, actor.organizationId, shopId)).find((row) => row.id === z.uuid().parse(id));
    if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "Produit introuvable.", 404);
    return { protocolVersion: PROTOCOL_VERSION, product };
  }

  @Patch("products/:id")
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async patchProduct(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await updateProduct(this.prisma, this.context(request, key), z.uuid().parse(id), productPatchSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("products/:id/image")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async productImage(@Req() request: RequestWithActor, @Param("id") id: string, @Body() body: unknown) {
    try {
      const actor = requireActor(request);
      const productId = z.uuid().parse(id);
      const input = productImageSchema.parse(body);
      const product = await this.prisma.product.findFirst({ where: { id: productId, organizationId: actor.organizationId } });
      if (!product) throw new DomainError("PRODUCT_NOT_FOUND", "Produit introuvable.", 404);
      const bytes = Buffer.from(input.base64, "base64");
      if (bytes.length === 0 || bytes.length > 750_000) throw new DomainError("IMAGE_TOO_LARGE", "L’image doit peser au maximum 750 Ko.", 422);
      const signatures: Record<string, boolean> = {
        "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
        "image/png": bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        "image/webp": bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP",
      };
      if (!signatures[input.mime]) throw new DomainError("INVALID_IMAGE", "Le contenu du fichier ne correspond pas au format annoncé.", 422);
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[input.mime];
      const key = `products/${actor.organizationId}/${productId}/${crypto.randomUUID()}.${extension}`;
      const storage = createStorageClient(this.env.s3);
      await putPrivateObject(storage, this.env.s3.bucket, key, bytes);
      await this.prisma.product.update({ where: { id: productId }, data: { imageKey: key, imageMime: input.mime, imageSize: bytes.length } });
      return { protocolVersion: PROTOCOL_VERSION, imageUrl: `/api/v1/products/${productId}/image` };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("products/:id/image")
  async productImageContent(@Req() request: RequestWithActor, @Param("id") id: string, @Res() reply: FastifyReply) {
    try {
      const actor = requireActor(request);
      const product = await this.prisma.product.findFirst({ where: { id: z.uuid().parse(id), organizationId: actor.organizationId }, select: { imageKey: true, imageMime: true } });
      if (!product?.imageKey || !product.imageMime) throw new DomainError("IMAGE_NOT_FOUND", "Image introuvable.", 404);
      const bytes = await readPrivateObject(createStorageClient(this.env.s3), this.env.s3.bucket, product.imageKey);
      reply.header("content-type", product.imageMime).header("cache-control", "private, max-age=300").header("x-content-type-options", "nosniff");
      return reply.send(Buffer.from(bytes));
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("products/:id/variants")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async variant(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createVariant(this.prisma, this.context(request, key), z.uuid().parse(id), variantSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("variants/:id/units")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async unit(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createUnit(this.prisma, this.context(request, key), z.uuid().parse(id), unitSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("prices")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async price(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createPrice(this.prisma, this.context(request, key), priceSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("payment-sources")
  async sources(@Req() request: RequestWithActor, @Query("shopId") requested?: string) {
    const actor = requireActor(request);
    const sources = await listPaymentSources(this.prisma, actor.organizationId, await this.scope(actor, requested));
    return {
      protocolVersion: PROTOCOL_VERSION,
      sources: actor.role === "OWNER" ? sources : sources.map(({ accounts: _accounts, ...source }) => source),
    };
  }

  @Post("payment-sources")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async source(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createPaymentSource(this.prisma, this.context(request, key), sourceSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("money-accounts")
  @UseGuards(OwnerGuard)
  async accounts(@Req() request: RequestWithActor, @Query("shopId") requested?: string) {
    const actor = requireActor(request);
    const shopId = await this.scope(actor, requested);
    const accounts = await this.prisma.moneyAccount.findMany({ where: { organizationId: actor.organizationId, ...(shopId ? { shopId } : {}) }, orderBy: { name: "asc" } });
    return { protocolVersion: PROTOCOL_VERSION, accounts: accounts.map((row) => ({ ...row, balanceMinor: row.balanceMinor.toString() })) };
  }

  @Post("owner-fund-events")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async fund(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await postOwnerFund(this.prisma, this.context(request, key), fundSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("locations")
  async locations(@Req() request: RequestWithActor, @Query("shopId") requested?: string) {
    const actor = requireActor(request);
    const shopId = await this.scope(actor, requested);
    const locations = await this.prisma.location.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(shopId ? (actor.role === "MANAGER" ? { shopId } : { OR: [{ shopId }, { type: "DEPOT", status: "ACTIVE" }] }) : {}),
      },
      include: {
        shop: { select: { id: true, code: true, name: true, status: true, assignments: { where: { endedAt: null }, take: 1, select: { user: { select: { displayName: true } } } } } },
        stockBalances: { select: { quantity: true, updatedAt: true, variant: { select: { id: true, productId: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      locations: locations.map((location) => ({
        id: location.id,
        shopId: location.shopId,
        name: location.name,
        type: location.type,
        status: location.status,
        createdAt: location.createdAt,
        shop: location.shop ? { id: location.shop.id, code: location.shop.code, name: location.shop.name, status: location.shop.status, manager: location.shop.assignments[0]?.user.displayName ?? null } : null,
        productCount: new Set(location.stockBalances.filter((balance) => balance.quantity.gt(0)).map((balance) => balance.variant.productId)).size,
        variantCount: new Set(location.stockBalances.filter((balance) => balance.quantity.gt(0)).map((balance) => balance.variant.id)).size,
        stockLineCount: location.stockBalances.filter((balance) => balance.quantity.gt(0)).length,
        lastUpdatedAt: location.stockBalances.reduce<Date | null>((latest, balance) => !latest || balance.updatedAt > latest ? balance.updatedAt : latest, null)?.toISOString() ?? null,
      })),
    };
  }

  @Post("locations/depot")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async depot(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await createDepot(this.prisma, this.context(request, key), depotSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Patch("locations/:id")
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async patchLocation(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await updateLocation(this.prisma, this.context(request, key), z.uuid().parse(id), locationSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("policies")
  @UseGuards(OwnerGuard)
  async policies(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    const actor = requireActor(request);
    return { protocolVersion: PROTOCOL_VERSION, policies: await this.prisma.policy.findMany({ where: { organizationId: actor.organizationId, ...(shopId ? { shopId: z.uuid().parse(shopId) } : {}) }, orderBy: [{ shopId: "asc" }, { version: "desc" }] }) };
  }

  @Post("policies")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async policy(@Req() request: RequestWithActor, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    try {
      const input = policySchema.parse(body);
      return { protocolVersion: PROTOCOL_VERSION, ...(await createPolicy(this.prisma, this.context(request, key), { ...input, values: input.values as Prisma.InputJsonObject })) };
    } catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("shops/:id/opening-draft")
  async opening(@Req() request: RequestWithActor, @Param("id") id: string) {
    const actor = requireActor(request);
    const shopId = z.uuid().parse(id);
    await this.scope(actor, shopId);
    const draft = await this.prisma.openingDraft.findFirst({ where: { organizationId: actor.organizationId, shopId }, include: { stockLines: true, obligations: true }, orderBy: { version: "desc" } });
    return {
      protocolVersion: PROTOCOL_VERSION,
      draft: draft ? {
        ...draft,
        stockLines: draft.stockLines.map((line) => ({ ...line, quantity: line.quantity.toString(), unitCostMinor: line.unitCostMinor.toString() })),
        obligations: draft.obligations.map((line) => ({ ...line, amountMinor: line.amountMinor.toString() })),
      } : null,
    };
  }

  @Post("shops/:id/opening-draft")
  @HttpCode(200)
  @UseGuards(FreshSessionGuard)
  async saveOpening(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    const actor = requireActor(request);
    await this.scope(actor, z.uuid().parse(id));
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await saveOpeningDraft(this.prisma, this.context(request, key), id, openingSchema.parse(body))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Post("shops/:id/opening-balances")
  @HttpCode(200)
  @UseGuards(OwnerGuard, FreshSessionGuard)
  async validateOpening(@Req() request: RequestWithActor, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined) {
    try { return { protocolVersion: PROTOCOL_VERSION, ...(await validateOpening(this.prisma, this.context(request, key), z.uuid().parse(id))) }; }
    catch (error) { throw DomainHttpError.from(error); }
  }

  @Get("stock")
  async stock(@Req() request: RequestWithActor, @Query("shopId") requested?: string) {
    const actor = requireActor(request);
    return { protocolVersion: PROTOCOL_VERSION, stock: await listStock(this.prisma, actor.organizationId, await this.scope(actor, requested)) };
  }

  @Get("stock/movements")
  async movements(@Req() request: RequestWithActor, @Query("shopId") requested?: string) {
    const actor = requireActor(request);
    return { protocolVersion: PROTOCOL_VERSION, movements: await listStockMovements(this.prisma, actor.organizationId, await this.scope(actor, requested)) };
  }

  @Get("reports/overview")
  @UseGuards(OwnerGuard)
  async overview(@Req() request: RequestWithActor, @Query("shopId") shopId?: string) {
    const actor = requireActor(request);
    return { protocolVersion: PROTOCOL_VERSION, ...(await ownerOverview(this.prisma, actor.organizationId, shopId ? z.uuid().parse(shopId) : undefined)) };
  }
}
