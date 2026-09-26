import { expect, test } from "@playwright/test";

import { e2eManager } from "./global-setup";

const widths = [320, 375, 768, 1024, 1440, 1920, 1100];

async function connectManager(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eManager.email);
  await page.getByLabel("Mot de passe").fill(e2eManager.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
}

test("les largeurs P02 n’introduisent pas de débordement", async ({ page }) => {
  await connectManager(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 700 : 900 });
    await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `largeur ${width}`).toBeLessThanOrEqual(1);
  }
});

test("le téléphone ouvre le menu puis le referme après navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await connectManager(page);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Appareil" }).click();
  await expect(page.getByRole("heading", { name: "Appareil", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});
