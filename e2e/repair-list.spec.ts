import { expectAccessible } from "./accessibility";
import { expect } from "@playwright/test";
import { test } from "./local-accounts";
import { seedDifficultCard } from "./repair-fixture";
test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);
test("sugestia prowadzi do edytora, wraca po zapisie i działa z pamięci offline", async ({
  accounts,
  baseURL,
}) => {
  const owner = await accounts.createAccount();
  const device = await accounts.device(owner);
  const fixture = await seedDifficultCard(device.request, baseURL!);
  await fixture.third();
  const second = await seedDifficultCard(device.request, baseURL!, "ieri");
  await second.third();
  const page = await device.newPage();
  await page.goto("/decks?deck=" + second.deckId);
  await page.getByText("Zarządzaj zestawem", { exact: true }).click();
  await page.getByRole("button", { name: "Przygotuj zestaw offline" }).click();
  await expect(
    page.getByText(/Zestaw jest gotowy do nauki offline/),
  ).toBeVisible();
  await page.goto("/decks?deck=" + fixture.deckId);
  await page.getByText("Zarządzaj zestawem", { exact: true }).click();
  await page.getByRole("button", { name: "Przygotuj zestaw offline" }).click();
  await expect(
    page.getByText(/Zestaw jest gotowy do nauki offline/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ucz się z tego zestawu" }).click();
  await page.getByRole("button", { name: "Zakończ sesję" }).click();
  await page.getByRole("button", { name: "Do poprawy (2)" }).click();
  await expect(
    page.getByText("A → B · Trudność w 3 różnych dniach").first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Do poprawy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Do poprawy" })).toBeFocused();
  await expectAccessible(page, "do-poprawy");
  const links = page.getByRole("link", { name: /Edytuj fiszkę:/ });
  await expect(links).toHaveCount(2);
  const label = await links.nth(1).getAttribute("aria-label");
  const chosen = page.getByRole("link", { name: label!, exact: true });
  await chosen.click();
  await expect(page.getByLabel("Przykład B")).toBeVisible();
  await page.goBack();
  await expect(chosen).toBeFocused();
  await expect(page.getByRole("heading", { name: "Do poprawy" })).toBeVisible();
  await chosen.click();
  await page.getByLabel("Przykład B").fill("Do jutra!");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("heading", { name: "Do poprawy" })).toBeVisible();
  await expect(
    page.getByText("A → B · Trudność w 3 różnych dniach").first(),
  ).toBeVisible();
  await expect(chosen).toBeFocused();
  await device.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByText("A → B · Trudność w 3 różnych dniach").first(),
    ).toBeVisible();
    await expect(page.getByText(/Ostatnia aktualizacja listy/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edytuj fiszkę" })).toHaveCount(
      0,
    );
  } finally {
    await device.setOffline(false);
  }
  await expect(chosen).toBeVisible();
  const legacy = await accounts.device(owner);
  const older = await legacy.newPage();
  await older.route("**/study/repair-candidates", (route) =>
    route.fulfill({ status: 404 }),
  );
  const response = older.waitForResponse(
    (r) => r.url().endsWith("/study/repair-candidates") && r.status() === 404,
  );
  await older.goto("/study?deck=" + fixture.deckId + "&repair=1");
  await response;
  await expect(older.getByRole("heading", { name: "Do poprawy" })).toHaveCount(
    0,
  );
  await older.getByRole("button", { name: "Rozpocznij nową sesję" }).click();
  await expect(older.getByRole("heading", { name: "domani" })).toBeVisible();
});
