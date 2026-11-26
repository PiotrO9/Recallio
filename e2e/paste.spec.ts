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
  const deck = new URL(page.url()).searchParams.get("deck");
  await page.goto("/import?source=paste&deck=" + deck);
  const nextRows = Array.from(
    { length: 20 },
    (_, i) => "nowe " + i + "\twartość " + i,
  );
  await page
    .getByLabel("Kolumny z arkusza")
    .fill(["A\tB", ...nextRows, "pytanie 0\tinna odpowiedź"].join("\n"));
  await page.getByLabel("Pierwszy wiersz to nagłówki").check();
  await page.getByRole("button", { name: "Pokaż podgląd" }).click();
  const jump = page.getByRole("button", { name: "Przejdź do wiersza 22" });
  await jump.click();
  const action = page.getByLabel("Akcja wiersza 22", { exact: true });
  await expect(action).toBeFocused();
  await expect(action).toHaveAccessibleDescription(/Wybierz działanie/);
  await expect(page.getByText("Strona 2 z 2")).toBeVisible();
  await expect(page.getByText("Wklejone dane", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Strona B · Zmieniona wartość/).first(),
  ).toBeVisible();
  await action.selectOption("replace_content");
  await jump.click();
  const target = page.getByLabel("Fiszka do aktualizacji · wiersz 22");
  await expect(target).toBeFocused();
  await expect(target).toHaveAccessibleDescription(/Wybierz fiszkę/);
  await target.selectOption({ index: 1 });
  await expect(
    page.getByRole("button", { name: "Zatwierdź import" }),
  ).toBeEnabled();
});
