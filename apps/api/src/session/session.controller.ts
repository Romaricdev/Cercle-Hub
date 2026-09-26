import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { PROTOCOL_VERSION } from "@cercle/contracts";

import { AuthenticatedGuard, OwnerMfaGuard, requireActor, type Actor } from "../auth/guards.js";

@Controller("api/v1/session")
@UseGuards(AuthenticatedGuard)
export class SessionController {
  @Get("enrollment")
  enrollment(@Req() request: { actor?: Actor }): { protocolVersion: number; mfaEnrollmentRequired: boolean; role: string } {
    const actor = requireActor(request);
    return {
      protocolVersion: PROTOCOL_VERSION,
      role: actor.role,
      mfaEnrollmentRequired: actor.role === "OWNER" && !actor.twoFactorEnabled,
    };
  }

  @Get()
  @UseGuards(OwnerMfaGuard)
  current(@Req() request: { actor?: Actor }): { protocolVersion: number; user: { id: string; role: string; twoFactorEnabled: boolean } } {
    const actor = requireActor(request);
    return {
      protocolVersion: PROTOCOL_VERSION,
      user: { id: actor.id, role: actor.role, twoFactorEnabled: actor.twoFactorEnabled },
    };
  }
}
