import { Body, Controller, HttpCode, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { apiError, PROTOCOL_VERSION } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import { verifyPassword } from "better-auth/crypto";
import { z } from "zod";

import { AuthenticatedGuard, OwnerMfaGuard, requireActor, type Actor } from "./guards.js";
import { PRISMA } from "../tokens.js";

type RequestWithActor = { actor?: Actor };

@Controller("api/v1/session")
@UseGuards(AuthenticatedGuard, OwnerMfaGuard)
export class ReauthenticationController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Post("reauthenticate")
  @HttpCode(200)
  async reauthenticate(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = requireActor(request);
    const input = z.object({ password: z.string().min(1).max(128) }).strict().parse(body);
    const credential = await this.prisma.account.findFirst({
      where: { userId: actor.authUserId, providerId: "credential", password: { not: null } },
      select: { password: true },
    });
    const valid = credential?.password ? await verifyPassword({ hash: credential.password, password: input.password }) : false;
    if (!valid) throw new UnauthorizedException(apiError("INVALID_PASSWORD", "Le mot de passe est incorrect."));
    await this.prisma.session.updateMany({ where: { id: actor.sessionId, userId: actor.authUserId }, data: { updatedAt: new Date() } });
    return { protocolVersion: PROTOCOL_VERSION, status: "FRESH" };
  }
}
