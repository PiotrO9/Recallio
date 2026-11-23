import { test, expect } from "@playwright/test";
import { expectAccessible } from "./accessibility";

test("visitors enter through accessible sign-in at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.locator('a[href="/"]')).toHaveCount(0);
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

test("account links and old bookmarks open the correct form", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await page.getByRole("link", { name: "Utwórz konto" }).click();
  await expect(page).toHaveURL(/\/auth\/signup$/);
  await page.getByRole("link", { name: "Nie pamiętam hasła" }).click();
  await expect(page).toHaveURL(/\/auth\/forgot-password$/);
  await expect(page.getByRole("button", { name: "Wyślij link" })).toBeVisible();
  await page.getByRole("link", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto("/auth?mode=reset&status=sent");
  await expect(page).toHaveURL(/\/auth\/forgot-password\?status=sent$/);
  await expect(page.getByRole("status")).toContainText("skrzynce");
  await page.goto("/auth?mode=signup");
  await expect(page).toHaveURL(/\/auth\/signup$/);
});
