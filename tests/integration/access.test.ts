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
const ownerEmail = `owner.p02.${Date.now()}@example.test`;
const managerEmail = `manager.p02.${Date.now()}@example.test`;
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
          if (!trimmed || /^(Path|Domain|Max-Age|Expires|SameSite|HttpOnly|Secure|Priority)=?/i.test(trimmed)) {
            continue;
          }
          const eq = trimmed.indexOf("=");
          if (eq <= 0) {
            continue;
          }
          const name = trimmed.slice(0, eq);
          const cookieValue = trimmed.slice(eq + 1);
          if (cookieValue === "") {
            map.delete(name);
          } else {
            map.set(name, cookieValue);
          }
        }
      }
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

describe("accès P02", () => {
  let close: (() => Promise<void>) | undefined;
  let inject: (options: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }) => Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
    json: () => unknown;
  }>;
  let organizationId = "";
  let ownerCookie = "";
  let ownerTotpUri = "";
  let backupCodes: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL absente.");
    }
    const prisma = createPrismaClient(databaseUrl);
    const provision = createAuth(prisma, {
      allowSignUp: true,
      secret: process.env.BETTER_AUTH_SECRET ?? "",
      baseURL: origin,
      secureCookies: false,
    });
    const signedUp = await provision.api.signUpEmail({
      body: { email: ownerEmail, password, name: "Propriétaire P02" },
    });
    const organization = await prisma.organization.create({ data: { name: "Cercle Complet" } });
    organizationId = organization.id;
    await prisma.appUser.create({
      data: {
        authUserId: signedUp.user.id,
        organizationId: organization.id,
        role: "OWNER",
        displayName: "Propriétaire P02",
        mfaRequired: true,
      },
    });
    await prisma.$disconnect();
    const started = await createApp();
    close = started.close;
    const fastify = started.app.getHttpAdapter().getInstance();
    inject = (options) => fastify.inject(options);
    ownerCookie = await signInOwner();
    const me = await inject({ method: "GET", url: "/api/v1/me", headers: { origin, cookie: ownerCookie } });
    if (me.statusCode !== 200) {
      throw new Error(`Session propriétaire absente: ${me.statusCode} ${me.body}`);
    }
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
    if (signIn.statusCode !== 200) {
      throw new Error(`Connexion propriétaire: ${signIn.statusCode} ${signIn.body}`);
    }
    const cookie = cookieJar(signIn.headers["set-cookie"]);
    if (signIn.body.includes("twoFactorRedirect") && ownerTotpUri) {
      const verified = await inject({
        method: "POST",
        url: "/api/auth/two-factor/verify-totp",
        headers: { "content-type": "application/json", cookie, origin },
        payload: { code: currentTotp(ownerTotpUri) },
      });
      if (verified.statusCode !== 200) {
        throw new Error(`Challenge TOTP: ${verified.statusCode} ${verified.body}`);
      }
      return cookieJar(cookie, verified.headers["set-cookie"]);
    }
    const enrollment = await inject({
      method: "POST",
      url: "/api/auth/two-factor/enable",
      headers: { "content-type": "application/json", cookie, origin },
      payload: { password },
    });
    if (enrollment.statusCode !== 200) {
      throw new Error(`Activation TOTP: ${enrollment.statusCode} ${enrollment.body}`);
    }
    const body = enrollment.json() as { totpURI?: string; backupCodes?: string[] };
    if (!body.totpURI) {
      throw new Error("URI TOTP absente.");
    }
    ownerTotpUri = body.totpURI;
    backupCodes = body.backupCodes ?? [];
    const verified = await inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: { "content-type": "application/json", cookie, origin },
      payload: { code: currentTotp(body.totpURI) },
    });
    if (verified.statusCode !== 200) {
      throw new Error(`Confirmation TOTP: ${verified.statusCode} ${verified.body}`);
    }
    return cookieJar(cookie, verified.headers["set-cookie"]);
  }

  async function csrf(cookie: string) {
    const response = await inject({ method: "GET", url: "/api/v1/csrf", headers: { origin, cookie } });
    const token = (response.json() as { csrfToken: string }).csrfToken;
    return {
      cookie: cookieJar(cookie, response.headers["set-cookie"]),
      origin,
      "x-csrf-token": token,
      "content-type": "application/json",
    };
  }

  it("refuse une origine étrangère et un POST sans CSRF", async () => {
    const foreign = await inject({
      method: "GET",
      url: "/api/v1/health/live",
      headers: { origin: "http://evil.example" },
    });
    expect(foreign.statusCode).toBe(403);
    const naked = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { origin, cookie: ownerCookie, "content-type": "application/json" },
      payload: { email: "x@example.test", displayName: "X" },
    });
    expect(naked.statusCode).toBe(403);
    expect(naked.body).toContain("CSRF");
    expect(naked.body).not.toContain("at ");
  });

  it("invite, refuse le gérant sur les utilisateurs, affecte et empêche un second actif", async () => {
    const headers = await csrf(ownerCookie);
    const invited = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: managerEmail, displayName: "Gérant P02" },
    });
    expect(invited.statusCode).toBe(200);
    const invitedBody = invited.json() as { userId: string; invitationToken: string };
    expect(invited.body).not.toContain(password);
    const accepted = await inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers,
      payload: { token: invitedBody.invitationToken, password },
    });
    expect(accepted.statusCode).toBe(200);

    const prisma = createPrismaClient(process.env.TEST_DATABASE_URL ?? "");
    const shop = await prisma.shop.create({
      data: { organizationId, code: "B1", name: "Boutique test", status: "SETUP" },
    });

    const assigned = await inject({
      method: "POST",
      url: `/api/v1/shops/${shop.id}/assign-manager`,
      headers,
      payload: { userId: invitedBody.userId, reason: "Première affectation" },
    });
    expect(assigned.statusCode).toBe(200);

    const managerSignIn = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: managerEmail, password },
    });
    expect(managerSignIn.statusCode).toBe(200);
    const managerHeaders = await csrf(cookieJar(managerSignIn.headers["set-cookie"]));
    const forbidden = await inject({ method: "GET", url: "/api/v1/users", headers: managerHeaders });
    expect(forbidden.statusCode).toBe(403);

    const other = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: `other.p02.${Date.now()}@example.test`, displayName: "Autre" },
    });
    expect(other.statusCode).toBe(200);
    const otherId = (other.json() as { userId: string }).userId;
    const conflict = await Promise.all([
      inject({
        method: "POST",
        url: `/api/v1/shops/${shop.id}/assign-manager`,
        headers,
        payload: { userId: invitedBody.userId, reason: "Concurrent A" },
      }),
      inject({
        method: "POST",
        url: `/api/v1/shops/${shop.id}/assign-manager`,
        headers,
        payload: { userId: otherId, reason: "Concurrent B" },
      }),
    ]);
    expect(conflict.some((result) => result.statusCode === 200)).toBe(true);
    const actives = await prisma.managerAssignment.count({ where: { shopId: shop.id, endedAt: null } });
    expect(actives).toBe(1);
    await prisma.$disconnect();
  });

  it("enregistre, approuve et révoque un appareil sans capacité hors ligne", async () => {
    const ownerHeaders = await csrf(ownerCookie);
    const deviceManagerEmail = `device.p02.${Date.now()}@example.test`;
    const invited = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers: ownerHeaders,
      payload: { email: deviceManagerEmail, displayName: "Gérant appareil" },
    });
    expect(invited.statusCode).toBe(200);
    const invitedBody = invited.json() as { userId: string; invitationToken: string };
    await inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: ownerHeaders,
      payload: { token: invitedBody.invitationToken, password },
    });
    const prisma = createPrismaClient(process.env.TEST_DATABASE_URL ?? "");
    const shop = await prisma.shop.create({
      data: { organizationId, code: `D${Date.now()}`, name: "Boutique appareil", status: "SETUP" },
    });
    const assigned = await inject({
      method: "POST",
      url: `/api/v1/shops/${shop.id}/assign-manager`,
      headers: ownerHeaders,
      payload: { userId: invitedBody.userId, reason: "Appareil de test" },
    });
    expect(assigned.statusCode).toBe(200);
    await prisma.$disconnect();

    const managerSignIn = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: deviceManagerEmail, password },
    });
    expect(managerSignIn.statusCode).toBe(200);
    const managerHeaders = await csrf(cookieJar(managerSignIn.headers["set-cookie"]));
    const registered = await inject({
      method: "POST",
      url: "/api/v1/devices/register",
      headers: managerHeaders,
      payload: { publicKey: "a".repeat(64), name: "Tablette boutique" },
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.body).not.toContain("a".repeat(64));
    const deviceId = (registered.json() as { device: { id: string } }).device.id;
    const ownerCannotRegister = await inject({
      method: "POST",
      url: "/api/v1/devices/register",
      headers: ownerHeaders,
      payload: { publicKey: "b".repeat(64), name: "Appareil propriétaire" },
    });
    expect(ownerCannotRegister.statusCode).toBe(403);
    const approved = await inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/approve`,
      headers: ownerHeaders,
      payload: {},
    });
    expect(approved.statusCode).toBe(200);
    const db = createPrismaClient(process.env.TEST_DATABASE_URL ?? "");
    expect(await db.deviceCapability.count({ where: { deviceId } })).toBe(0);
    const managerApprove = await inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/approve`,
      headers: managerHeaders,
      payload: {},
    });
    expect(managerApprove.statusCode).toBe(403);
    const revoked = await inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/revoke`,
      headers: ownerHeaders,
      payload: { reason: "Perte de l’appareil" },
    });
    expect(revoked.statusCode).toBe(200);
    const device = await db.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.status).toBe("REVOKED");
    const audit = await db.auditEvent.count({ where: { entityType: "devices", entityId: deviceId } });
    expect(audit).toBeGreaterThanOrEqual(2);
    await db.$disconnect();
  });

  it("désactive un gérant, révoque ses sessions et refuse les champs inattendus", async () => {
    const headers = await csrf(ownerCookie);
    const extra = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: `extra.p02.${Date.now()}@example.test`, displayName: "Extra", role: "OWNER" },
    });
    expect(extra.statusCode).toBe(400);
    expect(extra.body).toContain("INVALID_INPUT");
    expect(extra.body).not.toContain("stack");

    const xss = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: `xss.p02.${Date.now()}@example.test`, displayName: "<script>alert(1)</script>" },
    });
    expect(xss.statusCode).toBe(200);
    const listed = await inject({ method: "GET", url: "/api/v1/users", headers });
    expect(listed.body).toContain("<script>alert(1)</script>");
    expect(listed.body).not.toContain("otpauth://");

    const target = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: `gone.p02.${Date.now()}@example.test`, displayName: "À désactiver" },
    });
    const targetId = (target.json() as { userId: string }).userId;
    const token = (target.json() as { invitationToken: string }).invitationToken;
    await inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers,
      payload: { token, password },
    });
    const targetEmail = ((await inject({ method: "GET", url: "/api/v1/users", headers })).json() as { users: Array<{ id: string; email: string }> }).users.find(
      (user) => user.id === targetId,
    )?.email;
    const signed = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: targetEmail, password },
    });
    const targetCookie = cookieJar(signed.headers["set-cookie"]);
    const deactivated = await inject({
      method: "POST",
      url: `/api/v1/users/${targetId}/deactivate`,
      headers,
      payload: { reason: "Fin de mission" },
    });
    expect(deactivated.statusCode).toBe(200);
    const after = await inject({ method: "GET", url: "/api/v1/me", headers: { origin, cookie: targetCookie } });
    expect(after.statusCode).toBe(401);
  });

  it("limite les connexions refusées par compte", async () => {
    const unknown = `brute.p02.${Date.now()}@example.test`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const failed = await inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        headers: { "content-type": "application/json", origin },
        payload: { email: unknown, password: "mot-de-passe-invalide-15" },
      });
      lastStatus = failed.statusCode;
    }
    expect(lastStatus).toBe(429);
    expect((await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: unknown, password: "mot-de-passe-invalide-15" },
    })).body).not.toContain("stack");
  });

  it("refuse un corps trop grand et un e-mail d’injection", async () => {
    const headers = await csrf(ownerCookie);
    const oversized = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: "big@example.test", displayName: "x".repeat(1_200_000) },
    });
    expect([400, 413]).toContain(oversized.statusCode);
    const injected = await inject({
      method: "POST",
      url: "/api/v1/users",
      headers,
      payload: { email: "owner' OR 1=1--@example.test", displayName: "Injection" },
    });
    expect(injected.statusCode).toBe(400);
  });

  it("utilise un code de secours une seule fois", async () => {
    expect(backupCodes.length).toBeGreaterThan(0);
    const signIn = await inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin, cookie: ownerCookie },
    });
    expect(signIn.statusCode).toBe(200);
    const challenge = await inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json", origin },
      payload: { email: ownerEmail, password },
    });
    expect(challenge.body).toContain("twoFactorRedirect");
    const cookie = cookieJar(challenge.headers["set-cookie"]);
    const first = await inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: { "content-type": "application/json", cookie, origin },
      payload: { code: backupCodes[0] },
    });
    expect(first.statusCode).toBe(200);
    ownerCookie = cookieJar(cookie, first.headers["set-cookie"]);
    const reused = await inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: { "content-type": "application/json", cookie, origin },
      payload: { code: backupCodes[0] },
    });
    expect(reused.statusCode).toBeGreaterThanOrEqual(400);
  });
});
