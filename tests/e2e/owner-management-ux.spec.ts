import { expect, test } from "@playwright/test";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eOwner } from "./global-setup";

async function connectOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eOwner.email);
  await page.getByLabel("Mot de passe").fill(e2eOwner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/second facteur/i)).toBeVisible();
  await page.getByLabel("Confirmez le mot de passe").fill(e2eOwner.password);
  await page.getByRole("button", { name: "Afficher le secret" }).click();
  await page.getByText("Saisir la clé manuellement").click();
  const uri = await page.getByTestId("totp-uri").innerText();
  await page.getByLabel("Code TOTP").fill(currentTotp(uri));
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("heading", { name: /Vue générale/ })).toBeVisible();
}

test("le propriétaire identifie et filtre ses boutiques et appareils sur tous les formats", async ({ page }) => {
  test.setTimeout(120_000);
  await connectOwner(page);

  await page.goto("/owner/shops");
  await expect(page.getByRole("heading", { name: "Boutiques" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir la fiche" }).first()).toBeVisible();
  await page.getByLabel("Rechercher").fill("Boutique Vente E2E");
  await expect(page.getByText("Boutique Vente E2E", { exact: true })).toBeVisible();
  await page.getByLabel("État").selectOption("SETUP");
  await expect(page.getByRole("heading", { name: "Aucune boutique correspondante" })).toBeVisible();
  await page.getByLabel("État").selectOption("ALL");
  await page.getByLabel("Rechercher").fill("");

  await page.goto("/owner/devices");
  await expect(page.getByRole("heading", { name: "Appareils autorisés" })).toBeVisible();
  await expect(page.getByText("Tablette caisse E2E", { exact: true })).toBeVisible();
  await expect(page.getByText("Utilisation en ligne uniquement", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Rechercher").fill("Tablette caisse E2E");
  await expect(page.getByText("Tablette caisse E2E", { exact: true })).toBeVisible();

  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Appareils autorisés" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
