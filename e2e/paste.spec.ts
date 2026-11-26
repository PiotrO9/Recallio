import { expect } from "@playwright/test";
import { test, signIn } from "./local-accounts";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);

test("wklejenie dwudziestu par otwiera trening zapisanego zestawu", async ({
  page,
  accounts,
  baseURL,
}) => {
  await signIn(page.request, baseURL!, await accounts.createAccount());
  await page.goto("/decks");
  await page
    .getByRole("link", { name: "Wklej fiszki", exact: true })
    .first()
    .click();
  await page.getByLabel("Nazwa zestawu").fill("Z arkusza");
  const rows = Array.from(
    { length: 20 },
    (_, i) => "pytanie " + i + "\todpowiedź " + i,
  ).join("\n");
  await page.getByLabel("Kolumny z arkusza").fill("A\tB\n" + rows);
  await page.getByLabel("Pierwszy wiersz to nagłówki").check();
  await page.getByRole("button", { name: "Pokaż podgląd" }).click();
  await expect(page.getByText(/Do zapisu: 20 z 20/)).toBeVisible();
  await page.getByRole("button", { name: "Dodaj i zacznij naukę" }).click();
  await expect(page).toHaveURL(/\/study\?deck=/);
  await expect(
    page.getByRole("heading", { name: /^pytanie \d+$/ }),
  ).toBeVisible();
});
