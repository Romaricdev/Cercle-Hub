import { expect, test } from "@playwright/test";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eManager, e2eOwnerTotp } from "./global-setup";

test("le gérant se connecte et atteint son accueil", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bon retour parmi nous" })).toBeVisible();
  await page.getByLabel("E-mail").fill(e2eManager.email);
  await page.getByLabel("Mot de passe").fill(e2eManager.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await expect(page.getByText("Gérant", { exact: true })).toBeVisible();
  await expect(page.getByText(/chiffre d’affaires|FCFA/)).toHaveCount(0);
});

test("le gérant ne peut pas ouvrir les utilisateurs propriétaire", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eManager.email);
  await page.getByLabel("Mot de passe").fill(e2eManager.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  await page.goto("/owner/users");
  await expect(page.getByRole("heading", { name: "Utilisateurs" })).toHaveCount(0);
});

test("le thème persiste après rechargement", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("le propriétaire active le TOTP puis ouvre son espace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eOwnerTotp.email);
  await page.getByLabel("Mot de passe").fill(e2eOwnerTotp.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/second facteur/i)).toBeVisible();
  await page.getByLabel("Confirmez le mot de passe").fill(e2eOwnerTotp.password);
  await page.getByRole("button", { name: "Afficher le secret" }).click();
  await page.getByText("Saisir la clé manuellement").click();
  const uri = await page.getByTestId("totp-uri").innerText();
  await page.getByLabel("Code TOTP").fill(currentTotp(uri));
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await expect(page.getByText("Propriétaire", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Utilisateurs" }).click();
  await expect(page.getByRole("heading", { name: "Équipe et accès" })).toBeVisible();
  await page.getByRole("button", { name: "Inviter un gérant" }).click();
  await expect(page.getByRole("heading", { name: "Inviter un gérant" })).toBeVisible();
});

test("la connexion reste utilisable au clavier et sans débordement", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByLabel("E-mail").focus();
  await page.keyboard.type(e2eManager.email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(e2eManager.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("une session absente renvoie à la connexion", async ({ page }) => {
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: "Bon retour parmi nous" })).toBeVisible();
  await expect(page.getByText("La session a expiré.")).toBeVisible();
});

test("une erreur réseau est affichée sans fausse réussite", async ({ page }) => {
  await page.route("**/api/v1/me", (route) => route.abort());
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eManager.email);
  await page.getByLabel("Mot de passe").fill(e2eManager.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/échoué|Impossible|incorrects/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accueil" })).toHaveCount(0);
});
