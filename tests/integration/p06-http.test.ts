import "reflect-metadata";

import { createPrismaClient, loadRootEnv } from "@cercle/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../apps/api/src/auth/auth.ts";
import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { createApp } from "../../apps/api/src/create-app.ts";

loadRootEnv();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:8080";
process.env.WEB_ORIGIN = "http://127.0.0.1:8080";
process.env.COOKIE_SECURE = "0";

const password = "local-test-password-15";
const stamp = Date.now();
const ownerEmail = `owner.p06.http.${stamp}@example.test`;
const managerEmail = `manager.p06.http.${stamp}@example.test`;
const origin = "http://127.0.0.1:8080";

function cookieJar(...values: Array<string | string[] | undefined>): string {
  const map = new Map<string, string>();
  for (const value of values) {
    const headers = Array.isArray(value) ? value : value ? [value] : [];
    for (const header of headers) {
      const pairs = header.includes("=") && !header.includes(";") && header.includes(", ")
        ? header.split(/,(?=[^ ;]+=)/)
        : [header];
      for (const raw of pairs) {
        for (const part of raw.split(";")) {
          const trimmed = part.trim();
          if (!trimmed || /^(Path|Domain|Max-Age|Expires|SameSite|HttpOnly|Secure|Priority)=?/i.test(trimmed)) continue;
          const eq = trimmed.indexOf("=");
          if (eq <= 0) continue;
          const name = trimmed.slice(0, eq);
          const cookieValue = trimmed.slice(eq + 1);
          if (cookieValue === "") map.delete(name);
          else map.set(name, cookieValue);
        }
      }
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

describe("API P06 permissions et validation", () => {
  let close: (() => Promise<void>) | undefined;
  let inject: (options: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }) => Promise<{
    statusCode: number;
    body: string;
    json: () => unknown;
    headers: Record<string, string | string[] | undefined>;
  }>;
  let ownerCookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL absente.");
    const prisma = createPrismaClient(databaseUrl);
    const provision = createAuth(prisma, {
      allowSignUp: true,
      secret: process.env.BETTER_AUTH_SECRET ?? "",
      baseURL: origin,
      secureCookies: false,
    });
    const ownerSigned = await provision.api.signUpEmail({ body: { email: ownerEmail, password, name: "Owner P06 HTTP" } });
    const managerSigned = await provision.api.signUpEmail({ body: { email: managerEmail, password, name: "Manager P06 HTTP" } });
    const organization = await prisma.organization.create({ data: { name: "P06 HTTP" } });
    await prisma.appUser.create({ data: { authUserId: ownerSigned.user.id, organizationId: organization.id, role: "OWNER", displayName: "Owner P06 HTTP", mfaRequired: true } });
    await prisma.appUser.create({ data: { authUserId: managerSigned.user.id, organizationId: organization.id, role: "MANAGER", displayName: "Manager P06 HTTP" } });
    await prisma.$disconnect();
    const started = await createApp();
    close = started.close;
    const fastify = started.app.getHttpAdapter().getInstance();
    inject = (options) => fastify.inject(options);
    ownerCookie = await signInOwner();
    managerCookie = await signInManager();
  });

  afterAll(async () => { await close?.(); });

  async function signInOwner() {
    const signIn = await inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { "content-type": "application/json", origin }, payload: { email: ownerEmail, password } });
    if (signIn.statusCode !== 200) throw new Error(`Connexion owner: ${signIn.statusCode} ${signIn.body}`);
    const cookie = cookieJar(signIn.headers["set-cookie"]);
    const enrollment = await inject({ method: "POST", url: "/api/auth/two-factor/enable", headers: { "content-type": "application/json", cookie, origin }, payload: { password } });
    if (enrollment.statusCode !== 200) throw new Error(`TOTP: ${enrollment.statusCode} ${enrollment.body}`);
    const body = enrollment.json() as { totpURI?: string };
    const verified = await inject({ method: "POST", url: "/api/auth/two-factor/verify-totp", headers: { "content-type": "application/json", cookie, origin }, payload: { code: currentTotp(body.totpURI ?? "") } });
    if (verified.statusCode !== 200) throw new Error(`Confirm TOTP: ${verified.statusCode} ${verified.body}`);
    return cookieJar(cookie, verified.headers["set-cookie"]);
  }

  async function signInManager() {
    const signIn = await inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { "content-type": "application/json", origin }, payload: { email: managerEmail, password } });
    if (signIn.statusCode !== 200) throw new Error(`Connexion manager: ${signIn.statusCode} ${signIn.body}`);
    return cookieJar(signIn.headers["set-cookie"]);
  }

  async function csrf(cookie: string) {
    const response = await inject({ method: "GET", url: "/api/v1/csrf", headers: { origin, cookie } });
    const token = (response.json() as { csrfToken: string }).csrfToken;
    return { origin, cookie: cookieJar(cookie, response.headers["set-cookie"]), "x-csrf-token": token, "idempotency-key": crypto.randomUUID(), "content-type": "application/json" };
  }

  it("répond 401 sans session, 403 au gérant sur les décisions et 422 sur un montant invalide", async () => {
    expect((await inject({ method: "GET", url: "/api/v1/requests", headers: { origin } })).statusCode).toBe(401);
    expect((await inject({ method: "POST", url: `/api/v1/requests/${crypto.randomUUID()}/decision`, headers: await csrf(managerCookie), payload: { outcome: "APPROVED" } })).statusCode).toBe(403);
    expect((await inject({ method: "PATCH", url: `/api/v1/suppliers/${crypto.randomUUID()}`, headers: await csrf(managerCookie), payload: { name: "Fournisseur interdit" } })).statusCode).toBe(403);
    expect((await inject({ method: "POST", url: `/api/v1/surplus/regularize`, headers: await csrf(managerCookie), payload: { receiptId: crypto.randomUUID(), variantId: crypto.randomUUID(), unitCostMinor: "100", quantity: "1" } })).statusCode).toBe(403);
    expect((await inject({ method: "GET", url: `/api/v1/purchases/${crypto.randomUUID()}`, headers: { origin, cookie: ownerCookie } })).statusCode).toBe(404);
    const invalid = await inject({ method: "POST", url: "/api/v1/purchases", headers: await csrf(ownerCookie), payload: { supplierId: crypto.randomUUID(), lines: [{ variantId: crypto.randomUUID(), unitId: crypto.randomUUID(), quantity: "1", unitPriceMinor: "-1" }] } });
    expect([400, 422]).toContain(invalid.statusCode);
  });
});
