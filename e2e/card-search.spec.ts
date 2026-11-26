import { measureControl } from "./visual-accessibility";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test, signIn } from "./local-accounts";
test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);
test("wyszukuje tłumaczenie w 10 tys. fiszek i wraca z edytora do wyniku", async ({
  page,
  accounts,
  baseURL,
}, info) => {
  const user = await accounts.createAccount();
  await signIn(page.request, baseURL!, user);
  const deckId = randomUUID(),
    cardId = randomUUID();
  const seed = await page.request.post("/api/v1/sync/push", {
    headers: { origin: baseURL! },
    data: {
      protocolVersion: 1,
      deviceId: randomUUID(),
      operations: [
        {
          type: "deck.create",
          id: randomUUID(),
          entityId: deckId,
          payload: { name: "Rozmówki", directionMode: "a-b" },
        },
        {
          type: "card.create",
          id: randomUUID(),
          entityId: cardId,
          payload: {
            deckId,
            sideA: "ciao",
            sideB: "cześć",
            exampleA: null,
            exampleB: null,
          },
        },
      ],
    },
  });
  expect(
    (await seed.json()).results.map((r: { status: string }) => r.status),
  ).toEqual(["applied", "applied"]);
  await page.goto("/decks");
  await expect(
    page.getByRole("list", { name: "Zestawy", exact: true }).getByRole("link"),
  ).toHaveCount(1);
  await page.evaluate(
    async ({ deckId, user }) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const req = indexedDB.open("recallio-user-" + user);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const tx = db.transaction("cards", "readwrite");
      for (let i = 1; i < 10000; i++)
        tx.objectStore("cards").put({
          id: crypto.randomUUID(),
          deckId,
          sideA: "Lekcja " + i,
          sideB: "Przykład " + i,
          exampleA: null,
          exampleB: null,
          contentRevision: "1",
          deletedAt: null,
        });
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { deckId, user: user.id },
  );
  await page.reload();
  await page
    .getByRole("combobox", { name: "Szukaj w", exact: true })
    .selectOption("cards");
  const input = page.getByRole("searchbox");
  const rows = page
    .getByRole("list", { name: "Wyniki wyszukiwania fiszek" })
    .getByRole("link");
  await input.fill("Lekcja");
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: "Pokaż więcej" }).click();
  await expect(rows).toHaveCount(100);
  await expect(rows.nth(50)).toBeFocused();
  await measureControl(rows.nth(50), "result-51", { target: true });
  const header = page.getByRole("banner");
  await measureControl(header.locator(".brand"), "header-name", {
    target: true,
  });
  await measureControl(header.locator(".brand-mark"), "header-mark");
  await measureControl(
    header.getByRole("link", { name: "Moje zestawy" }),
    "header-current",
    { target: true },
  );
  await measureControl(
    header.getByRole("link", { name: "Moje konto" }),
    "header-link",
    { target: true },
  );
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Znalezione fiszki: 9999. Wyświetlono: 100." }),
  ).toHaveCount(1);
  const times: number[] = [];
  for (let i = 0; i < 14; i++) {
    await input.evaluate((el) => {
      el.addEventListener(
        "input",
        () => {
          performance.mark("search-start");
        },
        { once: true },
      );
    });
    const q = "Przykład " + ((i % 7) + 1);
    await input.fill(q);
    await expect(rows.first()).toContainText(q);
    const elapsed = await page.evaluate(
      () =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() =>
            resolve(
              performance.now() -
                performance.getEntriesByName("search-start").at(-1)!.startTime,
            ),
          ),
        ),
    );
    if (i >= 2) times.push(elapsed);
  }
  times.sort((a, b) => a - b);
  console.log(
    info.project.name +
      " search 10k median=" +
      times[6].toFixed(1) +
      "ms p95=" +
      times[11].toFixed(1) +
      "ms",
  );
  await input.fill("nieistniejące słowo");
  await input.fill("cześć");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Znalezione fiszki: 1. Wyświetlono: 1." }),
  ).toHaveCount(1);
  await rows.first().click();
  await expect(page).toHaveURL(new RegExp("card=" + cardId));
  await expect(page).toHaveTitle("Edytuj fiszkę · Rozmówki · Recallio");
  await page.goBack();
  await expect(page).toHaveTitle("Moje zestawy · Recallio");
  await page.goForward();
  await expect(page).toHaveTitle("Edytuj fiszkę · Rozmówki · Recallio");
  await page.reload();
  await expect(page.getByLabel("Strona A")).toHaveValue("ciao");
  await page.getByLabel("Strona A").fill("salve");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(input).toHaveValue("cześć");
  await expect(rows.first()).toContainText("salve");
  await expect(rows.first()).toBeFocused();
  await rows.first().click();
  await page.getByLabel("Strona B").fill("dzień dobry");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(rows).toHaveCount(0);
  await expect(input).toBeFocused();
  const outsider = await accounts.device(await accounts.createAccount());
  const other = await outsider.newPage();
  await other.goto("/decks?deck=" + deckId + "&card=" + cardId);
  await expect(
    other.getByText("Ta fiszka nie jest już dostępna."),
  ).toBeVisible();
  await expect(other.getByLabel("Strona B")).toHaveCount(0);
});
