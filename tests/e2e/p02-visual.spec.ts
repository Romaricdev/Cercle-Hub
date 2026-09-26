import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eManager, e2eOwner } from "./global-setup";

const out = resolve(process.cwd(), "test-results/p02-visual");
mkdirSync(out, { recursive: true });

test("captures visuelles P02 clair, sombre et formats", async ({ page }) => {
  await page.goto("/login");
  await page.screenshot({ path: resolve(out, "connexion-1440-clair.png"), fullPage: true });
  await page.getByRole("button", { name: "Sombre" }).click();
  await page.screenshot({ path: resolve(out, "connexion-1440-sombre.png"), fullPage: true });
  await page.getByRole("button", { name: "Clair" }).click();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.screenshot({ path: resolve(out, "connexion-320-clair.png"), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: resolve(out, "connexion-768-portrait.png"), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: resolve(out, "connexion-1024-paysage.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("E-mail").fill(e2eManager.email);
  await page.getByLabel("Mot de passe").fill(e2eManager.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await page.screenshot({ path: resolve(out, "gerant-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.screenshot({ path: resolve(out, "gerant-375.png"), fullPage: true });
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.screenshot({ path: resolve(out, "gerant-375-menu.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eOwner.email);
  await page.getByLabel("Mot de passe").fill(e2eOwner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/second facteur|Accueil/)).toBeVisible();
  if (await page.getByLabel("Confirmez le mot de passe").isVisible()) {
    await page.getByLabel("Confirmez le mot de passe").fill(e2eOwner.password);
    await page.getByRole("button", { name: "Afficher le secret" }).click();
    await page.getByText("Saisir la clé manuellement").click();
    const uri = await page.getByTestId("totp-uri").innerText();
    await page.getByLabel("Code TOTP").fill(currentTotp(uri));
    await page.getByRole("button", { name: "Confirmer" }).click();
  }
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await page.screenshot({ path: resolve(out, "proprietaire-1440.png"), fullPage: true });
  await page.getByRole("link", { name: "Utilisateurs" }).click();
  await expect(page.getByRole("heading", { name: "Utilisateurs" })).toBeVisible();
  await page.screenshot({ path: resolve(out, "utilisateurs-1440-vide.png"), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: resolve(out, "utilisateurs-1920.png"), fullPage: true });
});
