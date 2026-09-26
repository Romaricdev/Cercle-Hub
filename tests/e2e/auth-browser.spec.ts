import { expect, test } from "@playwright/test";

import { e2eManager } from "./global-setup";

test("le navigateur conserve un cookie de session httpOnly", async ({ page }) => {
  await page.goto("http://127.0.0.1:8080/api/v1/health/live");
  const signIn = await page.request.post("http://127.0.0.1:8080/api/auth/sign-in/email", {
    data: e2eManager,
    headers: { origin: "http://127.0.0.1:8080" },
  });
  expect(signIn.ok()).toBeTruthy();
  const cookies = await page.context().cookies("http://127.0.0.1:8080");
  expect(cookies.some((cookie) => cookie.httpOnly)).toBeTruthy();
  await page.goto("http://127.0.0.1:8080/api/v1/session");
  await expect(page.locator("body")).toContainText("MANAGER");
  const signOut = await page.request.post("http://127.0.0.1:8080/api/auth/sign-out", {
    headers: { origin: "http://127.0.0.1:8080" },
  });
  expect(signOut.ok()).toBeTruthy();
  const after = await page.request.get("http://127.0.0.1:8080/api/v1/session");
  expect(after.status()).toBe(401);
});
