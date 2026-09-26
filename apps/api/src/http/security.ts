import { apiError } from "@cercle/contracts";
import { randomSecret } from "@cercle/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Redis } from "ioredis";

import type { ApiEnv } from "../env.js";

import { readCookie, serializeCookie } from "./cookies.js";

const CSRF_COOKIE = "cc.csrf";

export function clientIp(request: FastifyRequest, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    if (first?.trim()) {
      return first.trim();
    }
  }
  return request.ip;
}

export function registerSecurityHooks(fastify: FastifyInstance, env: ApiEnv, redis: Redis): void {
  fastify.addHook("onRequest", async (request, reply) => {
    const origin = headerString(request.headers.origin);
    if (origin && !env.trustedOrigins.includes(origin) && request.url.startsWith("/api/")) {
      reply.status(403);
      return reply.send(apiError("ORIGIN_FORBIDDEN", "Origine refusée."));
    }
    if (isMutation(request.method) && request.url.startsWith("/api/v1/") && !request.url.startsWith("/api/v1/health")) {
      if (!origin) {
        reply.status(403);
        return reply.send(apiError("CSRF_REJECTED", "Origine absente."));
      }
      const token = headerString(request.headers["x-csrf-token"]);
      const cookie = readCookie(headerString(request.headers.cookie), CSRF_COOKIE);
      if (!token || !cookie || token !== cookie) {
        reply.status(403);
        return reply.send(apiError("CSRF_REJECTED", "Jeton de sécurité manquant."));
      }
    }
    return undefined;
  });

  fastify.addHook("preHandler", async (request, reply) => {
    try {
      if (request.url.startsWith("/api/auth/sign-in") && request.method === "POST") {
        const email = bodyEmail(request.body);
        const ip = clientIp(request, env.trustProxy);
        const accountCount = Number((await redis.get(`rl:login:acct:${email}`)) ?? 0);
        const ipCount = Number((await redis.get(`rl:login:ip:${ip}`)) ?? 0);
        if (accountCount >= 5 || ipCount >= 50) {
          reply.header("retry-after", "60");
          reply.status(429);
          return reply.send(apiError("RATE_LIMITED", "Trop de tentatives. Réessayez plus tard."));
        }
      }
      if (request.url.startsWith("/api/auth/forget-password") && request.method === "POST") {
        const email = bodyEmail(request.body);
        const ip = clientIp(request, env.trustProxy);
        const ok =
          (await consume(redis, `rl:reset:acct:${email}`, 3, 60 * 60_000)) &&
          (await consume(redis, `rl:reset:ip:${ip}`, 20, 60 * 60_000));
        if (!ok) {
          reply.header("retry-after", "60");
          reply.status(429);
          return reply.send(apiError("RATE_LIMITED", "Trop de tentatives. Réessayez plus tard."));
        }
      }
    } catch {
      reply.status(503);
      return reply.send(apiError("RATE_LIMIT_UNAVAILABLE", "Le limiteur est indisponible."));
    }
    return undefined;
  });

  fastify.addHook("onResponse", (request, reply, done) => {
    if (request.url.startsWith("/api/auth/sign-in") && request.method === "POST" && reply.statusCode === 401) {
      const email = bodyEmail(request.body);
      const ip = clientIp(request, env.trustProxy);
      void Promise.all([
        consume(redis, `rl:login:acct:${email}`, 5, 15 * 60_000),
        consume(redis, `rl:login:ip:${ip}`, 50, 15 * 60_000),
      ]).catch(() => undefined);
    }
    done();
  });
}

export function issueCsrf(reply: FastifyReply, env: ApiEnv): string {
  const token = randomSecret();
  reply.header(
    "set-cookie",
    serializeCookie(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: env.secureCookies,
      path: "/",
      maxAge: 12 * 60 * 60,
    }),
  );
  return token;
}

async function consume(redis: Redis, key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }
  return count <= limit;
}

function isMutation(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function bodyEmail(body: unknown): string {
  if (typeof body === "object" && body && "email" in body) {
    return String((body as { email: unknown }).email).trim().toLowerCase() || "unknown";
  }
  return "unknown";
}
