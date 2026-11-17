import { test, expect } from "@playwright/test";
test("reveal, rate, persist and reverse direction", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "Zapisane odpowiedzi: 0",
  );
  await page.getByRole("button", { name: "Rozpocznij naukę" }).click();
  await expect(
    page.getByRole("heading", { name: "a little every day", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "odrobinę każdego dnia", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Odsłoń odpowiedź" }).click();
  await expect(
    page.getByRole("heading", { name: "odrobinę każdego dnia", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dobrze", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "to remember", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Zapisane odpowiedzi: 1",
  );
  await page.getByLabel("Kierunek nauki").selectOption("b-a");
  await page.getByRole("button", { name: "Rozpocznij naukę" }).click();
  await expect(
    page.getByRole("heading", { name: "odrobinę każdego dnia", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/demo-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("failed local write keeps the card and retries once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "Zapisane odpowiedzi: 0",
  );
  await page.getByRole("button", { name: "Rozpocznij naukę" }).click();
  await page.getByRole("button", { name: "Odsłoń odpowiedź" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      IDBObjectStore.prototype.add = original;
      throw new DOMException("Simulated storage failure", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Dobrze", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Nie udało się zapisać odpowiedzi" }),
  ).toContainText("Nie udało się zapisać odpowiedzi");
  await expect(
    page.getByRole("heading", { name: "a little every day", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ponów zapis" }).click();
  await expect(
    page.getByRole("heading", { name: "to remember", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Zapisane odpowiedzi: 1",
  );
});
