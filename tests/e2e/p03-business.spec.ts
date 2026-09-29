import { expect, test } from "@playwright/test";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eOwnerP03 } from "./global-setup";

test("P03 configure puis active une boutique sans donnée commerciale fictive", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eOwnerP03.email);
  await page.getByLabel("Mot de passe").fill(e2eOwnerP03.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/second facteur/i)).toBeVisible();
  await page.getByLabel("Confirmez le mot de passe").fill(e2eOwnerP03.password);
  await page.getByRole("button", { name: "Afficher le secret" }).click();
  await page.getByText("Saisir la clé manuellement").click();
  const uri = await page.getByTestId("totp-uri").innerText();
  await page.getByLabel("Code TOTP").fill(currentTotp(uri));
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("heading", { name: /Vue générale/ })).toBeVisible();

  await page.goto("/owner/shops");
  await page.getByRole("button", { name: "Nouvelle boutique" }).click();
  await page.getByLabel("Code interne").fill("E2E03");
  await page.getByLabel("Nom de la boutique").fill("Boutique E2E P03");
  await page.getByRole("button", { name: "Créer la boutique", exact: true }).click();
  await expect(page.getByText("Boutique créée.")).toBeVisible();

  await page.goto("/owner/users");
  await page.getByRole("button", { name: "Affecter", exact: true }).first().click();
  await page.getByLabel("Gérant", { exact: true }).selectOption({ label: "Gérant socle" });
  await page.getByLabel("Boutique", { exact: true }).selectOption({ label: "Boutique E2E P03" });
  await page.getByLabel("Motif de l’affectation").fill("Responsable initial");
  await page.getByRole("button", { name: "Vérifier" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Affectation enregistrée.")).toBeVisible();

  await page.goto("/owner/products");
  await page.getByRole("button", { name: "Ajouter un produit" }).click();
  await page.getByLabel("Nom du produit").fill("Riz local");
  await page.getByLabel("Référence interne").fill("RIZ-E2E");
  await page.getByRole("button", { name: /Créer et continuer/ }).click();
  await expect(page.getByText("Produit créé.")).toBeVisible();
  await page.getByLabel("Nom de la nouvelle variante").fill("Sac 25 kg");
  await page.getByRole("button", { name: /Ajouter la variante/ }).click();
  await expect(page.getByText("Variante créée.")).toBeVisible();
  await page.getByLabel("Variante concernée").selectOption({ label: "Sac 25 kg" });
  await page.getByLabel("Format de vente").selectOption({ label: "Autre format" });
  await page.getByLabel("Nom du format personnalisé").fill("Sac");
  await page.getByLabel("Nom court affiché en caisse").fill("sac");
  await page.getByRole("button", { name: /Enregistrer ce format/ }).click();
  await expect(page.getByText("Format de vente créé.")).toBeVisible();
  await page.getByLabel("Format concerné").selectOption({ label: "Sac (sac)" });
  await page.getByLabel("Prix de vente (FCFA)").fill("15000");
  await page.getByRole("button", { name: /Enregistrer le prix/ }).click();
  await expect(page.getByText("Produit configuré.")).toBeVisible();

  await page.goto("/owner/sources");
  await page.getByRole("button", { name: "Nouvelle source" }).click();
  await page.getByLabel("Nom de la source").fill("Caisse E2E");
  await page.getByLabel("Rattachement").selectOption({ label: "Boutique E2E P03" });
  await page.getByRole("button", { name: "Créer la source" }).click();
  await expect(page.getByText("Source créée.")).toBeVisible();

  await page.goto("/owner/locations");
  await page.getByRole("button", { name: "Ajouter un dépôt central" }).click();
  await page.getByRole("button", { name: "Activer le dépôt" }).click();
  await expect(page.getByText("Dépôt activé sans création de stock.")).toBeVisible();

  await page.goto("/setup");
  await page.getByRole("link", { name: /Boutique E2E P03/ }).click();
  await expect(page.getByRole("heading", { name: "Initialisation · Boutique E2E P03" })).toBeVisible();
  await page.getByLabel("Produit et variante").selectOption({ label: "Riz local · Sac 25 kg" });
  await page.getByLabel("Quantité comptée").fill("8");
  await page.getByLabel("Coût d’achat unitaire (FCFA)").fill("9000");
  await page.getByRole("button", { name: /Ajouter cette variante au stock/ }).click();
  await page.getByLabel("Source des fonds").selectOption({ label: "Caisse E2E" });
  await page.getByLabel("Montant disponible (FCFA)").fill("50000");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByRole("button", { name: /Enregistrer le brouillon/ }).click();
  await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();
  await page.getByRole("button", { name: /Comptabiliser ce lot/ }).click();
  await expect(page.getByText(/Lot d.initialisation comptabilisé/)).toBeVisible();

  await page.goto("/owner/shops");
  await page.getByRole("link", { name: "Boutique E2E P03" }).click();
  await page.getByText("Actions sur l’état de la boutique").click();
  await page.getByRole("button", { name: "Activer", exact: true }).click();
  await expect(page.getByText("État mis à jour.")).toBeVisible();
  await page.goto("/owner");
  await expect(page.getByText("Initialisée")).toBeVisible();
  await expect(page.getByText(/chiffre d’affaires|ventes à zéro|marge commerciale/i)).toHaveCount(0);

  await page.goto("/setup");
  await page.getByRole("link", { name: /Boutique E2E P03/ }).click();
  await expect(page.getByRole("heading", { name: "Fonds initiaux enregistrés" })).toBeVisible();
  await expect(page.getByText("Caisse E2E", { exact: true })).toBeVisible();
  await expect(page.getByText("50 000 FCFA", { exact: true }).first()).toBeVisible();

  await page.goto("/owner/stock");
  await expect(page.getByText("Riz local", { exact: true })).toBeVisible();
  await expect(page.getByText("8", { exact: true })).toBeVisible();

  await page.goto("/owner/products");
  await page.locator("li").filter({ hasText: "Riz local" }).getByRole("button", { name: "Voir la fiche" }).click();
  await expect(page.getByRole("heading", { name: "Coûts d’achat et prix de vente" })).toBeVisible();
  await expect(page.getByText("9 000 FCFA", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("15 000 FCFA", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Marge unitaire estimée : 6 000 FCFA", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();

  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Catalogue", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Système" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
