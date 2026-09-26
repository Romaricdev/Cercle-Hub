import "reflect-metadata";

import { createPrismaClient, loadRootEnv } from "@cercle/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../apps/api/src/auth/auth.ts";
import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { createApp } from "../../apps/api/src/create-app.ts";

loadRootEnv();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:3001";
process.env.COOKIE_SECURE = "0";

const password = "local-test-password-15";
const email = "owner.p01@example.test";

function cookieHeader(value: string | string[] | undefined): string {
  const cookies = Array.isArray(value) ? value : value ? [value] : [];
  return cookies.map((cookie) => cookie.split(";")[0] ?? "").filter(Boolean).join("; ");
}

describe("Better Auth, cookies et MFA", () => {
  let close: (() => Promise<void>) | undefined;
  let inject: (options: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }) => Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
    json: () => unknown;
  }>;

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL absente.");
    }
    const prisma = createPrismaClient(databaseUrl);
    const provision = createAuth(prisma, {
      allowSignUp: true,
      secret: process.env.BETTER_AUTH_SECRET ?? "",
      baseURL: "http://127.0.0.1:3001",
      secureCookies: false,
    });
    const signedUp = await provision.api.signUpEmail({
      body: { email, password, name: "Propriétaire socle" },
    });
    const organization = await prisma.organization.create({ data: {} });
    await prisma.appUser.create({
      data: {
        authUserId: signedUp.user.id,
        organizationId: organization.id,
        role: "OWNER",
        mfaRequired: true,
      },
    });
    await prisma.$disconnect();
    const started = await createApp();
    close = started.close;
    const fastify = started.app.getHttpAdapter().getInstance();
    inject = (options) => fastify.inject(options);
  });

  afterAll(async () => {
    await close?.();
  });

  it("refuse l’inscription publique et un mot de passe trop court", async () => {
    const signup = await inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3001" },
      payload: { email: "autre@example.test", password, name: "Autre" },
    });
    expect(signup.statusCode).toBeGreaterThanOrEqual(400);
    const shortPassword = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      payload: { email, password: "court" },
    });
    expect(shortPassword.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("SEC06 et SEC07 connecte, active le TOTP et révoque la session", async () => {
    const signIn = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3001" },
      payload: { email, password },
    });
    expect(signIn.statusCode).toBe(200);
    const cookies = signIn.headers["set-cookie"];
    const cookieList = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    expect(cookieList.length).toBeGreaterThan(0);
    expect(cookieList.every((cookie) => /httponly/i.test(cookie) && /samesite=lax/i.test(cookie))).toBe(true);
    let cookie = cookieHeader(cookies);

    const blocked = await inject({
      method: "GET",
      url: "/api/v1/session",
      headers: { cookie, origin: "http://127.0.0.1:3001" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.body).toContain("MFA_ENROLLMENT_REQUIRED");

    const enrollment = await inject({
      method: "GET",
      url: "/api/v1/session/enrollment",
      headers: { cookie, origin: "http://127.0.0.1:3001" },
    });
    expect(enrollment.statusCode).toBe(200);

    const enabled = await inject({
      method: "POST",
      url: "/api/auth/two-factor/enable",
      headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:3001" },
      payload: { password },
    });
    expect(enabled.statusCode).toBe(200);
    const enabledBody = enabled.json() as { totpURI: string; backupCodes: string[] };
    expect(enabledBody.backupCodes.length).toBeGreaterThan(0);
    const verified = await inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:3001" },
      payload: { code: currentTotp(enabledBody.totpURI) },
    });
    expect(verified.statusCode).toBe(200);
    cookie = cookieHeader(verified.headers["set-cookie"]) || cookie;

    const session = await inject({
      method: "GET",
      url: "/api/v1/session",
      headers: { cookie, origin: "http://127.0.0.1:3001" },
    });
    expect(session.statusCode).toBe(200);
    expect(session.body).toContain("OWNER");
    expect(session.body).not.toContain(password);

    const signOut = await inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie, origin: "http://127.0.0.1:3001" },
    });
    expect(signOut.statusCode).toBe(200);
    const afterLogout = await inject({
      method: "GET",
      url: "/api/v1/session",
      headers: { cookie, origin: "http://127.0.0.1:3001" },
    });
    expect(afterLogout.statusCode).toBe(401);

    const challenge = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3001" },
      payload: { email, password },
    });
    expect(challenge.body).toContain("twoFactorRedirect");
    const challengeCookie = cookieHeader(challenge.headers["set-cookie"]);
    const completed = await inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { "content-type": "application/json", cookie: challengeCookie, origin: "http://127.0.0.1:3001" },
      payload: { code: currentTotp(enabledBody.totpURI) },
    });
    expect(completed.statusCode).toBe(200);
    const finalCookie = cookieHeader(completed.headers["set-cookie"]);
    const restored = await inject({
      method: "GET",
      url: "/api/v1/session",
      headers: { cookie: finalCookie, origin: "http://127.0.0.1:3001" },
    });
    expect(restored.statusCode).toBe(200);
  });
});
