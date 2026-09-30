import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eManagerP06, e2eManagerP06B, e2eOwnerP06 } from "./global-setup";

const ownerTotpPath = join(tmpdir(), "cercle-p06-owner-totp.uri");

function ownerTotpUri() {
  return existsSync(ownerTotpPath) ? readFileSync(ownerTotpPath, "utf8").trim() : "";
}

async function loginManager(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(e2eManagerP06.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
}

async function loginOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eOwnerP06.email);
  await page.getByLabel("Mot de passe").fill(e2eOwnerP06.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  const enroll = page.getByText(/second facteur/i);
  const challenge = page.getByLabel("Code d’authentification ou de secours");
  const home = page.getByRole("heading", { name: /Vue générale/ });
  await expect(enroll.or(challenge).or(home)).toBeVisible();
  if (await enroll.isVisible()) {
    await page.getByLabel("Confirmez le mot de passe").fill(e2eOwnerP06.password);
    await page.getByRole("button", { name: "Afficher le secret" }).click();
    await page.getByText("Saisir la clé manuellement").click();
    const uri = await page.getByTestId("totp-uri").innerText();
    writeFileSync(ownerTotpPath, uri, "utf8");
    await page.getByLabel("Code TOTP").fill(currentTotp(uri));
    await page.getByRole("button", { name: "Confirmer" }).click();
  } else if (await challenge.isVisible()) {
    await challenge.fill(currentTotp(ownerTotpUri()));
    await page.getByRole("button", { name: "Valider le code" }).click();
  }
  await expect(home).toBeVisible();
}

async function logout(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Ouvrir le profil/ }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `largeur ${viewport.width}`).toBeLessThanOrEqual(1);
  }
}

test("P06 circuit A : demande, précisions, achat, réception et stock", async ({ page }) => {
  test.setTimeout(180_000);
  await loginManager(page, e2eManagerP06.email);
  await page.getByRole("link", { name: "Demandes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demandes d’achat" })).toBeVisible();
  await page.getByRole("link", { name: "Nouvelle demande" }).click();
  await page.getByLabel("Motif").fill("Réassort de riz pour la boutique A cette semaine");
  await page.getByLabel("Produit").selectOption({ label: "Riz E2E P06" });
  await page.getByLabel("Variante").selectOption({ label: "Sac 25 kg" });
  await page.getByLabel("Unité").selectOption({ label: "Sac" });
  await page.getByLabel("Quantité").fill("5");
  await page.getByRole("button", { name: "Ajouter la ligne" }).click();
  await page.getByRole("button", { name: "Soumettre au propriétaire" }).click();
  await expect(page.getByText("Soumise", { exact: true })).toBeVisible();
  await logout(page);

  await loginOwner(page);
  await page.getByRole("link", { name: "Demandes", exact: true }).click();
  await page.getByRole("link", { name: /Réassort de riz/ }).click();
  await page.getByRole("button", { name: "Décider" }).click();
  const decision = page.getByRole("dialog", { name: "Décision sur la demande" });
  await expect(decision).toBeVisible();
  await decision.getByLabel("Décision", { exact: true }).selectOption("REJECTED");
  await page.getByRole("button", { name: "Enregistrer la décision" }).click();
  await expect(decision.getByRole("alert")).toContainText(/motif/i);
  await decision.getByLabel("Décision", { exact: true }).selectOption("NEEDS_INFO");
  await decision.getByLabel("Motif").fill("Précisez si le riz doit arriver avant vendredi");
  await page.getByRole("button", { name: "Enregistrer la décision" }).click();
  await expect(page.getByText("Précisions demandées")).toBeVisible();
  await logout(page);

  await loginManager(page, e2eManagerP06.email);
  await page.getByRole("link", { name: "Demandes", exact: true }).click();
  await page.getByRole("link", { name: /Réassort de riz/ }).click();
  await page.getByLabel("Votre réponse").fill("Oui, livraison souhaitée avant vendredi matin.");
  await page.getByRole("button", { name: "Envoyer la réponse" }).click();
  await expect(page.getByText("Soumise", { exact: true })).toBeVisible();
  await logout(page);

  await loginOwner(page);
  await page.getByRole("link", { name: "Demandes", exact: true }).click();
  await page.getByRole("link", { name: /Réassort de riz/ }).first().click();
  await page.getByRole("button", { name: "Décider" }).click();
  const approve = page.getByRole("dialog", { name: "Décision sur la demande" });
  await expect(approve).toBeVisible();
  await approve.getByLabel("Décision", { exact: true }).selectOption("APPROVED");
  await approve.getByLabel("Budget autorisé (FCFA)").fill("80000");
  await page.getByRole("button", { name: "Enregistrer la décision" }).click();
  await expect(page.getByText("Approuvée")).toBeVisible();
  await logout(page);

  await loginManager(page, e2eManagerP06.email);
  await page.getByRole("link", { name: "Demandes", exact: true }).click();
  await page.getByRole("link", { name: /Réassort de riz/ }).first().click();
  await page.getByRole("button", { name: "Acheter selon l’accord" }).click();
  await page.getByLabel("Nom du fournisseur").fill("Grains E2E");
  await page.getByLabel("Prix unitaire").fill("8000");
  await page.getByRole("button", { name: "Acheter et recevoir" }).click();
  await expect(page.getByRole("heading", { name: /Achat ACH-/ })).toBeVisible();
  await page.getByRole("link", { name: "Stock" }).first().click();
  await expect(page.getByText("Riz E2E P06", { exact: true })).toBeVisible();
  await expect(page.locator("li, tr").filter({ hasText: "Riz E2E P06" }).getByText(/^5(\.0+)?$/).first()).toBeVisible();
  await page.getByRole("link", { name: "Réceptions" }).first().click();
  await expect(page.getByRole("heading", { name: "Réceptions attendues" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.getByRole("heading", { name: "Réceptions attendues" })).toBeVisible();
  await page.goto("/owner/purchases");
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await logout(page);

  await loginOwner(page);
  await page.getByRole("link", { name: "Catalogue" }).first().click();
  await page.getByLabel("Rechercher dans le catalogue").fill("Riz E2E P06");
  await page.getByRole("button", { name: "Voir la fiche" }).click();
  await expect(page.getByText("Dernier coût d’achat")).toBeVisible();
  await expect(page.getByText(/8[\s\u00a0\u202f.]*000\s*FCFA/).first()).toBeVisible();
});

test("P06 circuit B : achat propriétaire réparti et réception partielle", async ({ page }) => {
  test.setTimeout(180_000);
  await loginOwner(page);
  await page.getByRole("link", { name: "Fournisseurs" }).first().click();
  await page.getByRole("button", { name: "Nouveau fournisseur" }).click();
  await expect(page.getByRole("dialog", { name: "Nouveau fournisseur" })).toBeVisible();
  await page.getByLabel("Raison sociale").fill("Céréales Nord");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByRole("heading", { name: "Céréales Nord" })).toBeVisible();
  await page.getByRole("link", { name: "Achats" }).first().click();
  await page.getByRole("link", { name: "Nouvel achat" }).click();
  await page.getByLabel("Fournisseur", { exact: true }).selectOption({ label: "Céréales Nord" });
  await page.getByLabel("Produit").selectOption({ label: "Riz E2E P06" });
  await page.getByLabel("Variante").selectOption({ label: "Sac 25 kg" });
  await page.getByLabel("Unité").selectOption({ label: "Sac" });
  await page.getByLabel("Quantité").fill("5");
  await page.getByLabel("Prix d’achat unitaire").fill("2000");
  await page.getByRole("button", { name: "Ajouter" }).click();
  const destA = page.getByLabel("Destination").first();
  await destA.selectOption({ label: (await destA.locator("option").filter({ hasText: "Réappro A" }).first().textContent())!.trim() });
  await page.getByRole("button", { name: "Ajouter une destination" }).click();
  const destB = page.getByLabel("Destination").nth(1);
  await destB.selectOption({ label: (await destB.locator("option").filter({ hasText: "Réappro B" }).first().textContent())!.trim() });
  await page.getByLabel("Quantité destinée").nth(0).fill("3");
  await page.getByLabel("Quantité destinée").nth(1).fill("2");
  await page.getByRole("button", { name: "Enregistrer l’achat" }).click();
  await expect(page.getByRole("heading", { name: /ACH-/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stock Réappro A" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stock Réappro B" })).toBeVisible();
  await logout(page);

  await loginManager(page, e2eManagerP06.email);
  await page.getByRole("link", { name: "Réceptions" }).first().click();
  await page.getByRole("link").filter({ hasText: "Fournisseur" }).first().click();
  await page.getByLabel("Accepté vendable").fill("2");
  await page.getByRole("button", { name: "Vérifier cette réception" }).click();
  await expect(page.getByRole("dialog", { name: "Confirmer les quantités reçues" })).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.getByRole("heading", { name: "Réceptions attendues" })).toBeVisible();
  await expect(page.getByText("Réception partielle")).toBeVisible();
  await page.getByRole("link").filter({ hasText: "Fournisseur" }).first().click();
  await expect(page.getByText(/Attendu restant 1(\.0+)?/)).toBeVisible();
  await page.getByLabel("Accepté vendable").fill("1");
  await page.getByRole("button", { name: "Vérifier cette réception" }).click();
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.getByRole("heading", { name: "Réceptions attendues" })).toBeVisible();
  await page.getByRole("link", { name: "Stock" }).first().click();
  await expect(page.locator("li, tr").filter({ hasText: "Riz E2E P06" }).getByText(/^8(\.0+)?$|^3(\.0+)?$/).first()).toBeVisible();
  await logout(page);

  await loginManager(page, e2eManagerP06B.email);
  await page.getByRole("link", { name: "Réceptions" }).first().click();
  await page.getByRole("link").filter({ hasText: "Fournisseur" }).first().click();
  await page.getByLabel("Accepté vendable").fill("2");
  await page.getByRole("button", { name: "Vérifier cette réception" }).click();
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await page.getByRole("link", { name: "Stock" }).first().click();
  await expect(page.getByText("Riz E2E P06", { exact: true })).toBeVisible();
  await logout(page);

  await loginOwner(page);
  await page.getByRole("link", { name: "Achats" }).first().click();
  await page.getByRole("link", { name: /ACH-/ }).first().click();
  await expect(page.getByText("Réception complète").or(page.getByText("Réception partielle"))).toBeVisible();
  await expect(page.getByRole("link", { name: "Stock Réappro A" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stock Réappro B" })).toBeVisible();
});
