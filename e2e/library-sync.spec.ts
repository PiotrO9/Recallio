import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test, signIn } from "./local-accounts";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Requires a local database",
);

test("thirty decks at large type on a narrow or wide viewport", async ({
  page,
  accounts,
  baseURL,
}, info) => {
  const width = info.project.name === "mobile" ? 320 : 1440;
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const credentials = await accounts.createAccount();
  await signIn(page.request, baseURL!, credentials);
  const longName =
    "Słownictwo potrzebne podczas rozmowy kwalifikacyjnej po niemiecku";
  const operations = Array.from({ length: 30 }, (_, i) => ({
    id: randomUUID(),
    entityId: randomUUID(),
    type: "deck.create",
    payload: {
      name: i === 29 ? longName : "Włoski · Lekcja " + (i + 1),
      directionMode: "a-b",
    },
  }));
  const seed = await page.request.post("/api/v1/sync/push", {
    headers: { origin: baseURL! },
    data: { protocolVersion: 1, deviceId: randomUUID(), operations },
  });
  expect(seed.ok()).toBe(true);
  expect(
    (await seed.json()).results.map((op: { status: string }) => op.status),
  ).toEqual(Array(30).fill("applied"));
  for (const cursor of [0, 9]) {
    const result = await page.request.get(
      "/api/v1/sync/pull?cursor=" + cursor + "&limit=9",
    );
    expect(result.ok()).toBe(true);
    const { changes, nextCursor, hasMore } = await result.json();
    expect(
      changes.map((change: { sequence: string }) => change.sequence),
    ).toEqual(
      Array.from({ length: 9 }, (_, index) => String(cursor + index + 1)),
    );
    expect(nextCursor).toBe(String(cursor + 9));
    expect(hasMore).toBe(true);
  }
  await page.goto("/decks");
  const index = page.getByRole("list", { name: "Zestawy", exact: true });
  await expect(index.getByRole("link")).toHaveCount(30);
  await page.addStyleTag({ content: ":root {font-size:200% !important;}" });
  const search = page.getByRole("searchbox");
  await search.fill("meteorologia");
  await expect(
    page.getByText("Brak wyników dla „meteorologia”."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).click();
  await expect(index.getByRole("link")).toHaveCount(30);
  await search.fill("kwalifikacyjnej");
  const row = index.getByRole("link", { name: new RegExp(longName) });
  await row.click();
  await expect(
    page.getByRole("heading", { name: longName, exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
  await page.getByRole("button", { name: "Wróć do zestawów" }).click();
  await expect(row).toBeFocused();
  await expect(search).toHaveValue("kwalifikacyjnej");
  await search.fill("Włoski");
  const lesson = index.getByRole("link").nth(22);
  const href = await lesson.getAttribute("href");
  expect(href).toMatch(/^\/decks\?deck=/);
  await lesson.scrollIntoViewIfNeeded();
  const offset = await page.evaluate(() => window.scrollY);
  expect(offset).toBeGreaterThan(0);
  await lesson.click();
  await expect(page).toHaveURL(href!);
  await page.goBack();
  await expect(search).toHaveValue("Włoski");
  await expect(lesson).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(offset, 0);
  await page.goForward();
  await expect(page).toHaveURL(href!);
  await page.reload();
  const detail = page.getByRole("region", { name: /^Włoski · Lekcja/ });
  await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Wróć do zestawów" }).click();
  await expect(search).toHaveValue("Włoski");
  await expect(lesson).toBeFocused();
  await page.goto(href!);
  await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Wróć do zestawów" }).click();
  await expect(page).toHaveURL("/decks");
  await expect(index.locator(`a[href="${href}"]`)).toBeFocused();
});
