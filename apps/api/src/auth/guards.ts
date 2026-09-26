import { ForbiddenException, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { apiError } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";
import { fromNodeHeaders } from "better-auth/node";

import type { Auth } from "./auth.js";
import { AUTH, PRISMA } from "../tokens.js";

export interface Actor {
  id: string;
  role: string;
  organizationId: string;
  authUserId: string;
  twoFactorEnabled: boolean;
  displayName: string;
  status: string;
  sessionFresh: boolean;
}

interface RequestWithActor {
  headers: Record<string, string | string[] | undefined>;
  actor?: Actor;
}

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw new UnauthorizedException(apiError("UNAUTHENTICATED", "Session absente."));
    }
    const appUser = await this.prisma.appUser.findUnique({ where: { authUserId: session.user.id } });
    if (!appUser) {
      throw new ForbiddenException(apiError("FORBIDDEN", "Aucun profil applicatif."));
    }
    if (appUser.status === "DISABLED") {
      throw new ForbiddenException(apiError("ACCOUNT_DISABLED", "Ce compte est désactivé."));
    }
    const updatedAt = new Date(session.session.updatedAt).getTime();
    request.actor = {
      id: appUser.id,
      role: appUser.role,
      organizationId: appUser.organizationId,
      authUserId: appUser.authUserId,
      twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
      displayName: appUser.displayName,
      status: appUser.status,
      sessionFresh: Date.now() - updatedAt < 30 * 60_000,
    };
    return true;
  }
}

@Injectable()
export class OwnerMfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = request.actor;
    if (!actor) {
      throw new UnauthorizedException(apiError("UNAUTHENTICATED", "Session absente."));
    }
    if (actor.role === "OWNER" && !actor.twoFactorEnabled) {
      throw new ForbiddenException(apiError("MFA_ENROLLMENT_REQUIRED", "Le propriétaire doit activer le second facteur."));
    }
    return true;
  }
}

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (request.actor?.role !== "OWNER") {
      throw new ForbiddenException(apiError("FORBIDDEN", "Réservé au propriétaire."));
    }
    return true;
  }
}

@Injectable()
export class FreshSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (!request.actor?.sessionFresh) {
      throw new ForbiddenException(apiError("REAUTH_REQUIRED", "Une authentification récente est requise."));
    }
    return true;
  }
}

export function requireActor(request: { actor?: Actor }): Actor {
  if (!request.actor) {
    throw new UnauthorizedException(apiError("UNAUTHENTICATED", "Session absente."));
  }
  return request.actor;
}
