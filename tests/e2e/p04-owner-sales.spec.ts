import { expect, test } from "@playwright/test";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eManagerP04Owner, e2eOwnerP04 } from "./global-setup";

test("P04 propriétaire consulte les ventes réelles et conserve les filtres", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eManagerP04Owner.email);
  await page.getByLabel("Mot de passe").fill(e2eManagerP04Owner.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await page.getByRole("link", { name: /Nouvelle vente/ }).first().click();
  await expect(page.getByRole("heading", { name: "Nouvelle vente" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir ma session" }).click();
  await expect(page.getByText("Galette E2E")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.getByRole("button", { name: /Passer au paiement/ }).click();
  await expect(page.getByRole("heading", { name: "Encaisser la vente" })).toBeVisible();
  await page.getByLabel("Montant remis par le client").fill("2000");
  await expect(page.getByText("Monnaie calculée").locator("..").getByText(/500 FCFA/)).toBeVisible();
  await page.getByRole("checkbox", { name: /Je confirme avoir rendu/ }).check();
  await page.getByRole("button", { name: /Encaisser 1.500 FCFA/ }).click();
  await expect(page.getByRole("heading", { name: "Vente confirmée" })).toBeVisible();
  await expect(page.getByText(/V-\d{8}-/)).toBeVisible();

  await page.getByRole("button", { name: /Ouvrir le profil/ }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eOwnerP04.email);
  await page.getByLabel("Mot de passe").fill(e2eOwnerP04.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/second facteur/i)).toBeVisible();
  await page.getByLabel("Confirmez le mot de passe").fill(e2eOwnerP04.password);
  await page.getByRole("button", { name: "Afficher le secret" }).click();
  await page.getByText("Saisir la clé manuellement").click();
  const uri = await page.getByTestId("totp-uri").innerText();
  await page.getByLabel("Code TOTP").fill(currentTotp(uri));
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("heading", { name: /Vue générale/ })).toBeVisible();
  await page.getByLabel("Boutique").selectOption({ label: "Boutique Pilotage E2E" });
  await expect(page.getByRole("paragraph").filter({ hasText: /^Chiffre d’affaires$/ })).toBeVisible();
  await expect(page.getByText("1 500 FCFA").first()).toBeVisible();
  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Vue générale" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("link", { name: "Voir les ventes" }).click();
  await expect(page.getByRole("heading", { name: "Ventes" })).toBeVisible();
  await page.getByLabel("Boutique").selectOption({ label: "Boutique Pilotage E2E" });
  await expect(page.getByText(/V-\d{8}-/).first()).toBeVisible();
  await page.getByRole("link", { name: "Voir la vente" }).first().click();
  await expect(page.getByRole("heading", { name: "Détail de la vente" })).toBeVisible();
  await expect(page.getByText("Galette E2E")).toBeVisible();
  await expect(page.getByText("Total net de la vente")).toBeVisible();
  await expect(page.getByText("Espèces · Caisse Pilotage E2E")).toBeVisible();
  await expect(page.getByText("Somme remise par le client")).toBeVisible();
  await expect(page.getByText("Monnaie rendue", { exact: true })).toBeVisible();
  await expect(page.getByText("2 000 FCFA").first()).toBeVisible();
  await expect(page.getByText("500 FCFA").first()).toBeVisible();
  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Détail de la vente" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("link", { name: "Retour" }).click();
  await expect(page).toHaveURL(/shopId=/);
  await expect(page.getByLabel("Boutique")).toHaveValue(/.+/);
  await expect(page.getByText(/V-\d{8}-/).first()).toBeVisible();

  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Ventes" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.goto("/owner/sales?from=2099-01-01&to=2099-01-01");
  await expect(page.getByRole("heading", { name: "Aucun résultat pour ces filtres" })).toBeVisible();
  await expect(page.getByText("Chiffre d’affaires", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filtres avancés" })).toBeVisible();
});
