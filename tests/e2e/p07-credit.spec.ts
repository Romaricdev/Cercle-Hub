import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { currentTotp } from "../../apps/api/src/auth/totp.ts";
import { e2eManagerP06, e2eOwnerP06 } from "./global-setup";

const ownerTotpPath = join(tmpdir(), "cercle-e2e-owner-p06-totp.uri");

function ownerTotpUri() {
  return existsSync(ownerTotpPath) ? readFileSync(ownerTotpPath, "utf8").trim() : "";
}

async function loginManager(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eManagerP06.email);
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
  await expect(enroll.or(challenge).or(home)).toBeVisible({ timeout: 15_000 });
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
  await expect(home).toBeVisible({ timeout: 15_000 });
}

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `largeur ${viewport.width}`).toBeLessThanOrEqual(1);
  }
}

test("P07 gérant consulte clients, retours, inventaire et pertes", async ({ page }) => {
  await loginManager(page);
  await page.goto("/manager/customers");
  await expect(page.getByRole("heading", { name: "Clients et créances" })).toBeVisible();
  await page.goto("/manager/returns");
  await expect(page.getByRole("heading", { name: "Retours clients" })).toBeVisible();
  await page.goto("/manager/inventory");
  await expect(page.getByRole("heading", { name: "Inventaires" })).toBeVisible();
  await page.goto("/manager/losses");
  await expect(page.getByRole("heading", { name: "Pertes et casse" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("P07 propriétaire consulte créances, inventaires, passations et crédit", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/owner/customers");
  await expect(page.getByRole("heading", { name: "Clients et créances" })).toBeVisible();
  await page.goto("/owner/receivables");
  await expect(page.getByRole("heading", { name: "Créances" })).toBeVisible();
  await page.goto("/owner/supplier-returns");
  await expect(page.getByRole("heading", { name: "Retours fournisseurs" })).toBeVisible();
  await expect(page.getByText("CREDIT_CONFIRMED")).toHaveCount(0);
  const supplierRefundButton = page.getByRole("button", { name: "Enregistrer le remboursement" });
  if (await supplierRefundButton.count()) {
    await supplierRefundButton.first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Enregistrer le remboursement fournisseur" })).toBeVisible();
    await expect(page.getByLabel("Montant reçu (FCFA)")).not.toHaveValue("0");
    await page.getByRole("button", { name: "Annuler" }).click();
  }
  await page.goto("/owner/inventory");
  await expect(page.getByRole("heading", { name: "Inventaires" })).toBeVisible();
  await page.goto("/owner/handovers");
  await expect(page.getByRole("heading", { name: "Passations de gérant" })).toBeVisible();
  await page.getByRole("button", { name: "Nouvelle passation" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Nouvelle passation" })).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.goto("/owner/settings");
  await expect(page.getByText("Crédit client")).toBeVisible();
  const creditToggle = page.getByRole("checkbox", { name: /Crédit client/ });
  const creditControl = page.locator("label").filter({ hasText: "Crédit client" });
  const initiallyEnabled = await creditToggle.isChecked();
  await creditControl.click();
  await page.getByLabel("Motif de cette modification").fill("Vérification de persistance E2E");
  await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();
  await expect(page.getByText("Nouvelle version enregistrée et appliquée.")).toBeVisible();
  await page.reload();
  expect(await page.getByRole("checkbox", { name: /Crédit client/ }).isChecked()).toBe(!initiallyEnabled);
  await page.locator("label").filter({ hasText: "Crédit client" }).click();
  await page.getByLabel("Motif de cette modification").fill("Restauration après vérification E2E");
  await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();
  await expect(page.getByText("Nouvelle version enregistrée et appliquée.")).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.getByText("Crédit client")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
