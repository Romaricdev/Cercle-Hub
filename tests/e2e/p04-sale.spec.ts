import { expect, test } from "@playwright/test";

import { e2eManagerP04 } from "./global-setup";

test("P04 ouvre une session, vend, encaisse et affiche le reçu", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eManagerP04.email);
  await page.getByLabel("Mot de passe").fill(e2eManagerP04.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await page.getByRole("link", { name: /Nouvelle vente/ }).first().click();
  await expect(page.getByRole("heading", { name: "Nouvelle vente" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir ma session" }).click();
  await expect(page.getByText("Biscuit E2E")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.getByRole("button", { name: /Passer au paiement/ }).click();
  await expect(page.getByRole("heading", { name: "Encaisser la vente" })).toBeVisible();
  await expect(page.getByText("Montant du panier", { exact: true })).toBeVisible();
  await page.getByLabel("Montant remis par le client").fill("2000");
  await expect(page.getByText("Monnaie calculée").locator("..").getByText(/1.000 FCFA/)).toBeVisible();
  await page.getByRole("checkbox", { name: /Je confirme avoir rendu/ }).check();
  await page.getByRole("button", { name: /Encaisser 1.000 FCFA/ }).click();
  await expect(page.getByRole("heading", { name: "Vente confirmée" })).toBeVisible();
  await expect(page.getByText(/V-\d{8}-/)).toBeVisible();
  await expect(page.getByText("Montant remis par le client")).toBeVisible();
  await expect(page.getByText("Monnaie rendue au client")).toBeVisible();
  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
