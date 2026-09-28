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
const ownerEmail = `owner.p04.http.${stamp}@example.test`;
const managerEmail = `manager.p04.http.${stamp}@example.test`;
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

describe("API consultation propriétaire P04", () => {
  let close: (() => Promise<void>) | undefined;
  let inject: (options: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }) => Promise<{
    statusCode: number;
    body: string;
    json: () => unknown;
    headers: Record<string, string | string[] | undefined>;
  }>;
  let ownerCookie = "";
  let managerCookie = "";
  let foreignShopId = "";
  let totpUri = "";

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
    const ownerSigned = await provision.api.signUpEmail({ body: { email: ownerEmail, password, name: "Owner HTTP" } });
    const managerSigned = await provision.api.signUpEmail({ body: { email: managerEmail, password, name: "Manager HTTP" } });
    const organization = await prisma.organization.create({ data: { name: "P04 HTTP" } });
    const foreign = await prisma.organization.create({ data: { name: "P04 HTTP étrangère" } });
    const foreignShop = await prisma.shop.create({ data: { organizationId: foreign.id, code: "FRN", name: "Étrangère" } });
    foreignShopId = foreignShop.id;
    await prisma.appUser.create({ data: { authUserId: ownerSigned.user.id, organizationId: organization.id, role: "OWNER", displayName: "Owner HTTP", mfaRequired: true } });
    await prisma.appUser.create({ data: { authUserId: managerSigned.user.id, organizationId: organization.id, role: "MANAGER", displayName: "Manager HTTP" } });
    await prisma.$disconnect();
    const started = await createApp();
    close = started.close;
    const fastify = started.app.getHttpAdapter().getInstance();
    inject = (options) => fastify.inject(options);
    ownerCookie = await signInOwner();
    managerCookie = await signInManager();
  });

  afterAll(async () => {
    await close?.();
  });

  async function signInOwner() {
    const signIn = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: ownerEmail, password },
    });
    if (signIn.statusCode !== 200) throw new Error(`Connexion owner: ${signIn.statusCode} ${signIn.body}`);
    const cookie = cookieJar(signIn.headers["set-cookie"]);
    const enrollment = await inject({
      method: "POST",
      url: "/api/auth/two-factor/enable",
      headers: { "content-type": "application/json", cookie, origin },
      payload: { password },
    });
    if (enrollment.statusCode !== 200) throw new Error(`TOTP: ${enrollment.statusCode} ${enrollment.body}`);
    const body = enrollment.json() as { totpURI?: string };
    if (!body.totpURI) throw new Error("URI TOTP absente.");
    totpUri = body.totpURI;
    const verified = await inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { "content-type": "application/json", cookie, origin },
      payload: { code: currentTotp(body.totpURI) },
    });
    if (verified.statusCode !== 200) throw new Error(`Confirm TOTP: ${verified.statusCode} ${verified.body}`);
    return cookieJar(cookie, verified.headers["set-cookie"]);
  }

  async function signInManager() {
    const signIn = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: managerEmail, password },
    });
    if (signIn.statusCode !== 200) throw new Error(`Connexion manager: ${signIn.statusCode} ${signIn.body}`);
    return cookieJar(signIn.headers["set-cookie"]);
  }

  it("refuse les lectures sans session et les routes propriétaire au gérant", async () => {
    const anonymous = await inject({ method: "GET", url: "/api/v1/owner/sales", headers: { origin } });
    expect(anonymous.statusCode).toBe(401);
    const anonymousDetail = await inject({ method: "GET", url: `/api/v1/owner/sales/${crypto.randomUUID()}`, headers: { origin } });
    expect(anonymousDetail.statusCode).toBe(401);
    const managerList = await inject({ method: "GET", url: "/api/v1/owner/sales", headers: { origin, cookie: managerCookie } });
    expect(managerList.statusCode).toBe(403);
    const managerDetail = await inject({ method: "GET", url: `/api/v1/owner/sales/${crypto.randomUUID()}`, headers: { origin, cookie: managerCookie } });
    expect(managerDetail.statusCode).toBe(403);
    const managerOverview = await inject({ method: "GET", url: "/api/v1/reports/overview", headers: { origin, cookie: managerCookie } });
    expect(managerOverview.statusCode).toBe(403);
  });

  it("rejette les paramètres invalides et une boutique étrangère", async () => {
    const invalidShop = await inject({ method: "GET", url: "/api/v1/owner/sales?shopId=not-a-uuid", headers: { origin, cookie: ownerCookie } });
    expect(invalidShop.statusCode).toBe(400);
    const invalidDate = await inject({ method: "GET", url: "/api/v1/owner/sales?from=26/09/2026", headers: { origin, cookie: ownerCookie } });
    expect(invalidDate.statusCode).toBe(400);
    const foreign = await inject({ method: "GET", url: `/api/v1/owner/sales?shopId=${foreignShopId}`, headers: { origin, cookie: ownerCookie } });
    expect(foreign.statusCode).toBe(404);
    const missingSale = await inject({ method: "GET", url: `/api/v1/owner/sales/${crypto.randomUUID()}`, headers: { origin, cookie: ownerCookie } });
    expect(missingSale.statusCode).toBe(404);
    const injected = await inject({ method: "GET", url: "/api/v1/owner/sales?query=%27%20OR%201%3D1%20--", headers: { origin, cookie: ownerCookie } });
    expect(injected.statusCode).toBe(200);
    const body = injected.json() as { sales: unknown[]; totals: { revenueMinor: string } };
    expect(Array.isArray(body.sales)).toBe(true);
    expect(body.totals.revenueMinor).toMatch(/^\d+$/);
  });

  it("sert une liste propriétaire vide avec des montants entiers", async () => {
    const listed = await inject({ method: "GET", url: "/api/v1/owner/sales", headers: { origin, cookie: ownerCookie } });
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as { totals: { revenueMinor: string; collectedMinor: string }; sales: unknown[] };
    expect(body.sales).toEqual([]);
    expect(body.totals.revenueMinor).toBe("0");
    expect(body.totals.collectedMinor).toBe("0");
    const overview = await inject({ method: "GET", url: "/api/v1/reports/overview", headers: { origin, cookie: ownerCookie } });
    expect(overview.statusCode).toBe(200);
    const report = overview.json() as { indicators: { sales: { available: boolean; revenueMinor: string } } };
    expect(report.indicators.sales.available).toBe(false);
    expect(report.indicators.sales.revenueMinor).toBe("0");
    void totpUri;
  });
});
