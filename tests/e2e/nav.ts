import { expect, type Page } from "@playwright/test";

/** Ouvre un groupe de navigation latérale puis clique un lien enfant. */
export async function clickNavLink(page: Page, groupLabel: string, linkName: string | RegExp) {
  const nav = page.getByRole("navigation", { name: /Navigation principale|Navigation compacte/ }).first();
  const group = nav.getByRole("button", { name: groupLabel });
  await expect(group).toBeVisible();
  if ((await group.getAttribute("aria-expanded")) !== "true") {
    await group.click();
  }
  await expect(group).toHaveAttribute("aria-expanded", "true");
  const link = typeof linkName === "string"
    ? nav.getByRole("link", { name: linkName, exact: true })
    : nav.getByRole("link", { name: linkName });
  await link.click();
}
