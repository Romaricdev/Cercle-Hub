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
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();

  await page.goto("/owner/shops");
  await page.getByLabel("Code court").fill("E2E03");
  await page.getByLabel("Nom").fill("Boutique E2E P03");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText("Boutique créée.")).toBeVisible();

  await page.goto("/owner/users");
  await page.getByLabel("Gérant").selectOption({ label: "Gérant socle" });
  await page.getByLabel("Boutique").selectOption({ label: "Boutique E2E P03" });
  await page.getByLabel("Motif").first().fill("Responsable initial");
  await page.getByRole("button", { name: "Affecter" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Affectation enregistrée.")).toBeVisible();

  await page.goto("/owner/products");
  await page.getByLabel("Nom").first().fill("Riz local");
  await page.getByLabel("Référence").fill("RIZ-E2E");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText("Produit créé.")).toBeVisible();
  await page.getByLabel("Produit").selectOption({ label: "Riz local" });
  await page.getByLabel("Nom").nth(1).fill("Sac 25 kg");
  await page.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await expect(page.getByText("Variante créée.")).toBeVisible();
  await page.getByLabel("Variante").selectOption({ label: "Sac 25 kg" });
  await page.getByLabel("Nom").nth(2).fill("Sac");
  await page.getByLabel("Symbole").fill("sac");
  await page.getByRole("button", { name: "Ajouter", exact: true }).last().click();
  await expect(page.getByText("Unité créée.")).toBeVisible();
  await page.getByLabel("Unité", { exact: true }).selectOption({ label: "Sac (sac)" });
  await page.getByLabel("Montant en unité mineure").fill("15000");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Prix enregistré.")).toBeVisible();

  await page.goto("/owner/sources");
  await page.getByLabel("Libellé").fill("Caisse E2E");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByText("Source créée.")).toBeVisible();

  await page.goto("/owner/locations");
  await page.getByRole("button", { name: "Activer" }).click();
  await expect(page.getByText("Dépôt activé sans création de stock.")).toBeVisible();

  await page.goto("/setup");
  await page.getByLabel("Boutique").selectOption({ label: "Boutique E2E P03" });
  await page.getByLabel("Produit et variante").selectOption({ label: "Riz local · Sac 25 kg" });
  await page.getByLabel("Lieu").selectOption({ label: "Stock Boutique E2E P03" });
  await page.getByLabel("Quantité physique").fill("8");
  await page.getByLabel("Coût unitaire en unité mineure").fill("9000");
  await page.getByLabel("Source").selectOption({ label: "Caisse E2E" });
  await page.getByLabel("Montant en unité mineure").fill("50000");
  await page.getByRole("button", { name: /Enregistrer le brouillon/ }).click();
  await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();
  await page.getByRole("button", { name: /Valider définitivement/ }).click();
  await expect(page.getByText(/Initialisation validée/)).toBeVisible();

  await page.goto("/owner/shops");
  await page.getByRole("link", { name: "Boutique E2E P03" }).click();
  await page.getByRole("button", { name: "Activer", exact: true }).click();
  await expect(page.getByText("État mis à jour.")).toBeVisible();
  await page.goto("/owner");
  await expect(page.getByText("Initialisée")).toBeVisible();
  await expect(page.getByText(/chiffre d’affaires|ventes à zéro|marge commerciale/i)).toHaveCount(0);

  await page.goto("/owner/stock");
  await expect(page.getByText("Riz local")).toBeVisible();
  await expect(page.getByText("8", { exact: true })).toBeVisible();

  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Système" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
