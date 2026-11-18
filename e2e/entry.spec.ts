import { test, expect } from "@playwright/test";
import { expectAccessible } from "./accessibility";

test("visitors enter through accessible sign-in at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(
    page.getByRole("heading", { name: "Zaloguj się" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Adres e-mail" }),
  ).toBeFocused();
  await expectAccessible(page);
});
