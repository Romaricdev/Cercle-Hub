import { expect, test } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`la page de santé ne déborde pas à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/health");
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflows).toBe(false);
  });
}
