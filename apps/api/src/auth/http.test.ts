import { describe, expect, it } from "vitest";

import { buildAuthRequest, buildAuthUrl, forwardAuthResponse } from "./http.js";

describe("pont Better Auth", () => {
  it("construit l’URL depuis l’origine configurée", () => {
    const url = buildAuthUrl("http://127.0.0.1:3001", "/api/auth/sign-in/email?foo=1");
    expect(url.toString()).toBe("http://127.0.0.1:3001/api/auth/sign-in/email?foo=1");
  });

  it("ignore l’en-tête Host fourni par le client", () => {
    const request = buildAuthRequest({
      publicOrigin: "http://127.0.0.1:3001",
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { host: "evil.example", origin: "http://127.0.0.1:3001" },
      body: { email: "a@example.com" },
    });
    expect(request.url).toBe("http://127.0.0.1:3001/api/auth/sign-in/email");
    expect(request.headers.get("host")).toBe("127.0.0.1:3001");
  });

  it("conserve chaque Set-Cookie", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "session=1; HttpOnly; Path=/; SameSite=Lax");
    headers.append("set-cookie", "csrf=2; HttpOnly; Path=/; SameSite=Lax");
    const captured: Record<string, string | string[] | undefined> = {};
    await forwardAuthResponse(new Response("{}", { status: 200, headers }), {
      status: () => undefined,
      header: (key, value) => {
        captured[key] = value;
      },
      send: () => undefined,
    });
    expect(captured["set-cookie"]).toEqual([
      "session=1; HttpOnly; Path=/; SameSite=Lax",
      "csrf=2; HttpOnly; Path=/; SameSite=Lax",
    ]);
  });
});
