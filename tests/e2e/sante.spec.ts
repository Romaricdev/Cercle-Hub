import { expect, test } from "@playwright/test";

test("la page de santé nomme l’entreprise sans chiffre commercial", async ({ page }) => {
  await page.goto("/health");
  await expect(page.getByRole("heading", { name: "Socle technique" })).toBeVisible();
  await expect(page.getByText("Cercle Complet Sarl")).toBeVisible();
  await expect(page.getByText(/chiffre d’affaires|FCFA/)).toHaveCount(0);
});
