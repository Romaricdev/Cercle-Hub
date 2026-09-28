import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import { createPrismaClient, loadRootEnv } from "@cercle/database";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";

import { createAuth } from "./auth/auth.js";
import { buildAuthRequest, forwardAuthResponse } from "./auth/http.js";
import { AppModule } from "./app.module.js";
import { readApiEnv } from "./env.js";
import { ApiExceptionFilter } from "./http/api-exception.filter.js";
import { registerSecurityHooks } from "./http/security.js";

export async function createApp(): Promise<{ app: NestFastifyApplication; close: () => Promise<void> }> {
  loadRootEnv();
  const env = readApiEnv();
  const prisma = createPrismaClient(env.databaseUrl);
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  await redis.connect();
  const auth = createAuth(prisma, {
    allowSignUp: false,
    secret: env.authSecret,
    baseURL: env.publicOrigin,
    secureCookies: env.secureCookies,
    trustedOrigins: env.trustedOrigins,
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(prisma, auth, env),
    new FastifyAdapter({ trustProxy: env.trustProxy, logger: false, bodyLimit: 8_000_000 }),
    { logger: false },
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
  });
  fastify.addHook("onRequest", async (request, reply) => {
    const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
    if (origin && env.trustedOrigins.includes(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("access-control-allow-headers", "content-type, x-csrf-token, idempotency-key");
      reply.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE");
      reply.header("vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      reply.status(204);
      return reply.send();
    }
    return undefined;
  });
  registerSecurityHooks(fastify, env, redis);
  registerAuthBridge(fastify, auth, env.publicOrigin);
  await app.init();
  await fastify.ready();
  return {
    app,
    close: async () => {
      await app.close();
      redis.disconnect();
      await prisma.$disconnect();
    },
  };
}

export function registerAuthBridge(
  fastify: FastifyInstance,
  auth: { handler: (request: Request) => Promise<Response> },
  publicOrigin: string,
): void {
  fastify.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      const webRequest = buildAuthRequest({
        publicOrigin,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      });
      const response = await auth.handler(webRequest);
      await forwardAuthResponse(response, reply);
    },
  });
}
