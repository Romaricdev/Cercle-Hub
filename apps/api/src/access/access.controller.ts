import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { apiError } from "@cercle/contracts";
import {
  acceptInvitation,
  assignManager,
  buildProfile,
  deactivateUser,
  inviteManager,
  listDevices,
  listUsers,
  normalizeInviteEmail,
  registerDevice,
  approveDevice,
  resendInvitation,
  revokeDevice,
} from "@cercle/domain";
import { PROTOCOL_VERSION } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import { hashPassword } from "better-auth/crypto";
import type { FastifyReply } from "fastify";
import { z } from "zod";

import { AuthenticatedGuard, FreshSessionGuard, OwnerGuard, OwnerMfaGuard, requireActor } from "../auth/guards.js";
import { createAuth } from "../auth/auth.js";
import type { ApiEnv } from "../env.js";
import { issueCsrf } from "../http/security.js";
import { API_ENV, PRISMA } from "../tokens.js";
import { DomainHttpError } from "../http/domain-http.js";

const inviteSchema = z.object({ email: z.email(), displayName: z.string().trim().min(2).max(120) }).strict();
const assignSchema = z.object({ userId: z.uuid(), reason: z.string().trim().min(3).max(240).optional() }).strict();
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(240) }).strict();
const acceptSchema = z.object({ token: z.string().min(16), password: z.string().min(15).max(128) }).strict();
const registerSchema = z.object({ publicKey: z.string().min(32).max(2048), name: z.string().trim().min(2).max(80) }).strict();

@Controller("api/v1")
export class AccessController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Get("csrf")
  csrf(@Res({ passthrough: true }) reply: FastifyReply): { protocolVersion: number; csrfToken: string } {
    return { protocolVersion: PROTOCOL_VERSION, csrfToken: issueCsrf(reply, this.env) };
  }

  @Get("me")
  @UseGuards(AuthenticatedGuard)
  async me(@Req() request: { actor?: import("../auth/guards.js").Actor }, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = requireActor(request);
    const profile = await buildProfile(this.prisma, actor);
    return { protocolVersion: PROTOCOL_VERSION, csrfToken: issueCsrf(reply, this.env), ...profile };
  }

  @Get("users")
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard)
  async users(@Req() request: { actor?: import("../auth/guards.js").Actor }) {
    const actor = requireActor(request);
    return { protocolVersion: PROTOCOL_VERSION, users: await listUsers(this.prisma, actor.organizationId) };
  }

  @Post("users")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard, FreshSessionGuard)
  async invite(@Req() request: { actor?: import("../auth/guards.js").Actor; id?: string }, @Body() body: unknown) {
    const actor = requireActor(request);
    const input = inviteSchema.parse(body);
    const email = normalizeInviteEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(apiError("EMAIL_TAKEN", "Un compte utilise déjà cette adresse."));
    }
    const provision = createAuth(this.prisma, {
      allowSignUp: true,
      secret: this.env.authSecret,
      baseURL: this.env.publicOrigin,
      secureCookies: false,
    });
    const temporary = `${crypto.randomUUID()}-Invite15`;
    let signed: { user: { id: string } };
    try {
      signed = await provision.api.signUpEmail({
        body: { email, password: temporary, name: input.displayName },
      });
    } catch {
      throw new ConflictException(apiError("EMAIL_TAKEN", "Un compte utilise déjà cette adresse."));
    }
    try {
      const result = await inviteManager(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        email,
        displayName: input.displayName,
        role: "MANAGER",
        authUserId: signed.user.id,
        requestId: String(request.id ?? crypto.randomUUID()),
      });
      return { protocolVersion: PROTOCOL_VERSION, userId: result.userId, invitationToken: result.invitationToken };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Post("users/:id/resend-invitation")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard, FreshSessionGuard)
  async resend(@Param("id") id: string, @Req() request: { actor?: import("../auth/guards.js").Actor; id?: string }) {
    const actor = requireActor(request);
    try {
      const result = await resendInvitation(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        userId: id,
        requestId: String(request.id ?? crypto.randomUUID()),
      });
      return { protocolVersion: PROTOCOL_VERSION, invitationToken: result.invitationToken };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Post("users/:id/deactivate")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard, FreshSessionGuard)
  async deactivate(@Param("id") id: string, @Body() body: unknown, @Req() request: { actor?: import("../auth/guards.js").Actor; id?: string }) {
    const actor = requireActor(request);
    const input = reasonSchema.parse(body);
    try {
      await deactivateUser(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        userId: id,
        reason: input.reason,
        requestId: String(request.id ?? crypto.randomUUID()),
      });
      return { protocolVersion: PROTOCOL_VERSION, status: "DISABLED" };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Post("shops/:id/assign-manager")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard, FreshSessionGuard)
  async assign(@Param("id") id: string, @Body() body: unknown, @Req() request: { actor?: import("../auth/guards.js").Actor; id?: string }) {
    const actor = requireActor(request);
    const input = assignSchema.parse(body);
    try {
      await assignManager(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        shopId: id,
        userId: input.userId,
        requestId: String(request.id ?? crypto.randomUUID()),
        ...(input.reason ? { reason: input.reason } : {}),
      });
      return { protocolVersion: PROTOCOL_VERSION, status: "ASSIGNED" };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Get("devices")
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard)
  async devices(@Req() request: { actor?: import("../auth/guards.js").Actor }) {
    const actor = requireActor(request);
    return {
      protocolVersion: PROTOCOL_VERSION,
      devices: await listDevices(this.prisma, { organizationId: actor.organizationId, actorId: actor.id, role: actor.role }),
    };
  }

  @Post("devices/register")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard)
  async register(@Body() body: unknown, @Req() request: { actor?: import("../auth/guards.js").Actor; headers: Record<string, string | string[] | undefined>; id?: string }) {
    const actor = requireActor(request);
    if (actor.role !== "MANAGER") {
      throw new ForbiddenException(apiError("FORBIDDEN", "Seul le gérant enregistre un appareil."));
    }
    const input = registerSchema.parse(body);
    const rawAgent = request.headers["user-agent"];
    const userAgent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
    try {
      const device = await registerDevice(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        publicKey: input.publicKey,
        name: input.name,
        ...(userAgent ? { userAgent } : {}),
        requestId: String(request.id ?? crypto.randomUUID()),
      });
      return { protocolVersion: PROTOCOL_VERSION, device };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Post("devices/:id/approve")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard, FreshSessionGuard)
  async approve(@Param("id") id: string, @Req() request: { actor?: import("../auth/guards.js").Actor; id?: string }) {
    const actor = requireActor(request);
    try {
      await approveDevice(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        deviceId: id,
        requestId: String(request.id ?? crypto.randomUUID()),
      });
      return { protocolVersion: PROTOCOL_VERSION, status: "ACTIVE" };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Post("devices/:id/revoke")
  @HttpCode(200)
  @UseGuards(AuthenticatedGuard, OwnerMfaGuard, OwnerGuard, FreshSessionGuard)
  async revoke(@Param("id") id: string, @Body() body: unknown, @Req() request: { actor?: import("../auth/guards.js").Actor; id?: string }) {
    const actor = requireActor(request);
    const input = reasonSchema.parse(body);
    try {
      await revokeDevice(this.prisma, {
        organizationId: actor.organizationId,
        actorId: actor.id,
        deviceId: id,
        reason: input.reason,
        requestId: String(request.id ?? crypto.randomUUID()),
      });
      return { protocolVersion: PROTOCOL_VERSION, status: "REVOKED" };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }

  @Post("invitations/accept")
  @HttpCode(200)
  async accept(@Body() body: unknown) {
    const input = acceptSchema.parse(body);
    try {
      const accepted = await acceptInvitation(this.prisma, input.token);
      const passwordHash = await hashPassword(input.password);
      await this.prisma.account.updateMany({
        where: { userId: accepted.authUserId, providerId: "credential" },
        data: { password: passwordHash },
      });
      return { protocolVersion: PROTOCOL_VERSION, status: "ACTIVE" };
    } catch (error) {
      throw DomainHttpError.from(error);
    }
  }
}
