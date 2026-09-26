import { Module, type DynamicModule } from "@nestjs/common";
import type { PrismaClient } from "@cercle/database";

import { AccessController } from "./access/access.controller.js";
import type { Auth } from "./auth/auth.js";
import { AuthenticatedGuard, FreshSessionGuard, OwnerGuard, OwnerMfaGuard } from "./auth/guards.js";
import type { ApiEnv } from "./env.js";
import { HealthController } from "./health/health.controller.js";
import { HealthService } from "./health/health.service.js";
import { SessionController } from "./session/session.controller.js";
import { P03Controller } from "./p03/p03.controller.js";
import { API_ENV, AUTH, PRISMA } from "./tokens.js";

@Module({})
export class AppModule {
  static register(prisma: PrismaClient, auth: Auth, env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, SessionController, AccessController, P03Controller],
      providers: [
        { provide: PRISMA, useValue: prisma },
        { provide: AUTH, useValue: auth },
        { provide: API_ENV, useValue: env },
        HealthService,
        AuthenticatedGuard,
        OwnerMfaGuard,
        OwnerGuard,
        FreshSessionGuard,
      ],
    };
  }
}
