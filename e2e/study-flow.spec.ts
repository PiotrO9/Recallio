import { failNextWorkspaceRead } from "./fail-workspace-read";
import { randomUUID } from "node:crypto";
import { holdStore } from "./hold-store";
import { readFile } from "node:fs/promises";
import { expect, type BrowserContext } from "@playwright/test";
import { test, signIn } from "./local-accounts";
import { measureControl } from "./visual-accessibility";
import { expectAccessible } from "./accessibility";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Requires a local database",
);

async function seedStudyDeck(primary: BrowserContext, baseURL: string) {
  const deckId = randomUUID();
  const cardId = randomUUID();
  const seed = await primary.request.post("/api/v1/sync/push", {
    headers: { origin: baseURL! },
    data: {
      protocolVersion: 1,
      deviceId: randomUUID(),
      operations: [
        {
          id: randomUUID(),
          entityId: deckId,
          type: "deck.create",
          payload: { name: "Nauka", directionMode: "a-b" },
        },
        {
          id: randomUUID(),
          entityId: cardId,
          type: "card.create",
          payload: {
            deckId,
            sideA: "pies",
            sideB: "dog",
            exampleA: null,
            exampleB: null,
          },
        },
      ],
    },
  });
  expect(
    (await seed.json()).results.map(({ status }: { status: string }) => status),
  ).toEqual(["applied", "applied"]);

  return { deckId, cardId };
}

test("a review survives an offline reload and synchronizes once to a second device", async ({
  accounts,
  request,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const { createAccount, device } = accounts;
  const owner = await createAccount();
  const unrelated = await createAccount();
  const primary = await device(owner);
  const { deckId } = await seedStudyDeck(primary, baseURL!);
  const page = await primary.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(baseURL + "/");
  await expectAccessible(page, "panel");
  await page.getByRole("link", { name: "Poznaj nowe fiszki" }).click();
  await expect(page.getByRole("heading", { name: "pies" })).toBeVisible();
  await expectAccessible(page, "pytanie");
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/study");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).headers()["content-type"]).toBe(
      "image/png",
    );
  }
  const devtools = await primary.newCDPSession(page);
  await page.getByText("Ustawienia nauki", { exact: true }).click();
  const prepare = page.getByRole("button", {
    name: "Przygotuj zestaw offline",
  });
  const ready = page.getByText("Zestaw jest dostępny offline.");
  await devtools.send("Storage.overrideQuotaForOrigin", {
    origin: baseURL!,
    quotaSize: 1,
  });
  await prepare.click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Brakuje miejsca na urządzeniu.",
    }),
  ).toBeVisible();
  await expect(ready).toHaveCount(0);
  await devtools.send("Storage.overrideQuotaForOrigin", { origin: baseURL! });
  await devtools.detach();
  const libraryDevice = await device(owner);
  const libraryPage = await libraryDevice.newPage();
  await libraryPage.goto("/decks?deck=" + deckId);
  await libraryPage.getByText("Zarządzaj zestawem", { exact: true }).click();
  const libraryTools = await libraryDevice.newCDPSession(libraryPage);
  await libraryTools.send("Storage.overrideQuotaForOrigin", {
    origin: baseURL!,
    quotaSize: 1,
  });
  const libraryPrepare = libraryPage.getByRole("button", {
    name: "Przygotuj zestaw offline",
  });
  await libraryPrepare.click();
  await expect(
    libraryPage
      .getByRole("alert")
      .filter({ hasText: "Brakuje miejsca na urządzeniu." }),
  ).toBeVisible();
  await libraryTools.send("Storage.overrideQuotaForOrigin", {
    origin: baseURL!,
  });
  await libraryTools.detach();
  await libraryPrepare.click();
  await expect(
    libraryPage.getByText(
      "Zestaw jest gotowy do nauki offline na tym urządzeniu.",
    ),
  ).toBeVisible();
  await libraryPage.close();
  await prepare.click();
  await expect(ready).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cachedPaths = await page.evaluate(async () => {
    const cache = await caches.open("recallio-study-shell-v11");
    return (await cache.keys()).map((entry) => new URL(entry.url).pathname);
  });
  expect(cachedPaths).toContain("/study/offline");
  expect(
    cachedPaths.every(
      (path) => path === "/study/offline" || path.startsWith("/_next/static/"),
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/study-sw.js?test-update", {
      updateViaCache: "none",
    });
  });
  const update = page.getByRole("button", { name: "Zaktualizuj aplikację" });
  await expect(update).toBeVisible();
  await primary.setOffline(true);
  await page.getByRole("button", { name: "Pokaż odpowiedź" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("dog", { exact: true })).toBeVisible();
  const grades = page.getByRole("group", { name: "Ocena odpowiedzi" });
  await expect(grades).toBeFocused();
  for (const key of ["1", "2", "3", "4"]) {
    await measureControl(
      grades.locator(`button[aria-keyshortcuts="${key}"]`),
      "grade-" + key,
      { target: true, border: true },
    );
    const shortcut = grades.locator(`button[aria-keyshortcuts="${key}"] kbd`);
    await expect(shortcut).toHaveText(key);
    await expect(shortcut).toBeVisible();
  }
  const firstGrade = grades.getByRole("button", { name: "Nie pamiętam" });
  await firstGrade.hover();
  await measureControl(firstGrade, "grade-hover", {
    target: true,
    border: true,
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(grades).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    grades.getByRole("button", { name: "Nie pamiętam" }),
  ).toBeFocused();
  await expect(update).toHaveCount(0);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    const attempts: string[] = [];
    Reflect.set(window, "recallioTestAttempts", attempts);
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name !== "outbox") return add.call(this, value, key);
      attempts.push(value.operation.id);
      const request = add.call(this, value, key);
      if (attempts.length === 1) this.transaction.abort();
      else IDBObjectStore.prototype.add = add;
      return request;
    };
  });
  // Hold a competing write transaction until the pending grade is visible.
  const releaseProgress = await holdStore(page, owner.id, "progress");
  try {
    await page.keyboard.press("3");
    await expect(
      grades.getByRole("button", { name: "Dobrze" }),
    ).toHaveAttribute("aria-busy", "true");
    await expect(grades.locator('button[aria-busy="true"]')).toHaveCount(1);
    await expect(grades.locator("button:disabled")).toHaveCount(4);
  } finally {
    await releaseProgress();
  }
  await expect(
    page.getByText("Nie udało się zapisać oceny.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("dog", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ponów zapis" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Zapisany postęp: 1")).toBeAttached();
  const attempts = await page.evaluate(
    () => Reflect.get(window, "recallioTestAttempts") as string[],
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toBe(attempts[1]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Zapisany postęp: 1")).toBeAttached();
  await expect(page.getByRole("heading", { name: "pies" })).toBeVisible();

  const pushRoute = "**/api/v1/sync/push";
  await page.route(pushRoute, (route) => route.fulfill({ status: 503 }));
  await primary.setOffline(false);
  await expect(update).toBeVisible();
  await Promise.all([page.waitForEvent("load"), update.click()]);
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
    )
    .toContain("?test-update");
  await expect(
    page.getByText("Synchronizacja zaczeka na połączenie."),
  ).toBeVisible();
  await primary.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Zapisany postęp: 1")).toBeAttached();
  await page.goto(`/study?deck=${randomUUID()}`);
  await expect(
    page.getByText("Ten zestaw wymaga przygotowania z dostępem do internetu."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "pies" })).toHaveCount(0);
  await page.unroute(pushRoute);
  await primary.setOffline(false);
  await expect
    .poll(async () => {
      const response = await primary.request.get("/api/v1/sync/pull?cursor=0");
      if (!response.ok()) return -1;
      const result = await response.json();
      return result.changes.filter(
        ({ entity }: { entity: string }) => entity === "review",
      ).length;
    })
    .toBe(1);
  const secondary = await device(owner);
  const secondPage = await secondary.newPage();
  await secondPage.goto("/study");
  await expect(secondPage.getByText("Zapisany postęp: 1")).toBeAttached();
  await secondPage.getByRole("button", { name: "Zakończ sesję" }).click();
  await expect(secondPage.getByText("Sesja zakończona.")).toBeVisible();
  await expect(
    secondPage.getByRole("link", { name: "Wróć do zestawu" }),
  ).toBeFocused();
  await secondPage
    .getByRole("button", { name: "Rozpocznij nową sesję" })
    .click();
  await expect(
    secondPage.getByRole("button", { name: "Pokaż odpowiedź" }),
  ).toBeVisible();

  const otherDevice = await device(unrelated);
  const otherPage = await otherDevice.newPage();
  await otherPage.goto("/study");
  await expect(
    otherPage.getByText("Nie ma dostępnych fiszek do nauki."),
  ).toBeVisible();
  await expect(otherPage.getByRole("heading", { name: "pies" })).toHaveCount(0);
  await expect(otherPage.getByText("Zapisany postęp: 1")).toHaveCount(0);
  await primary.clearCookies();
  await primary.setOffline(true);
  await page.goto("/study");
  await expect(
    page.getByText(
      "Połącz się z internetem i zaloguj, aby przygotować naukę offline.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "pies" })).toHaveCount(0);
});

test("study preferences persist across reloads and govern new cards", async ({
  accounts,
}) => {
  const otherDevice = await accounts.device(await accounts.createAccount());
  const otherPage = await otherDevice.newPage();
  await otherPage.goto("/study");
  const defaultLimit = otherPage.getByRole("spinbutton", {
    name: "Dzienny limit nowych fiszek",
  });
  const saveSettings = otherPage.getByRole("button", {
    name: "Zapisz ustawienia",
  });
  const syncedLimit = async () => {
    const response = await otherDevice.request.get(
      "/api/v1/sync/pull?cursor=0",
    );
    if (!response.ok()) return undefined;
    const { changes } = await response.json();
    return changes
      .filter(({ entity }: { entity: string }) => entity === "settings")
      .at(-1)?.payload.newLimit;
  };
  const openSettings = otherPage.getByText("Ustawienia nauki", {
    exact: true,
  });
  await openSettings.click();
  await expect(defaultLimit).toHaveValue("20");
  const unsaved = otherPage.getByText("Niezapisane zmiany", { exact: true });
  await expect(unsaved).toHaveCount(0);
  await defaultLimit.fill("8");
  await expect(unsaved).toBeVisible();
  await defaultLimit.fill("20");
  await expect(unsaved).toHaveCount(0);
  for (const name of [
    "Pokaż powtórki na dziś",
    "Pokaż liczbę odpowiedzi w sesji",
  ]) {
    const toggle = otherPage.getByRole("checkbox", { name });
    await toggle.click();
    await expect(unsaved).toBeVisible();
    await toggle.click();
    await expect(unsaved).toHaveCount(0);
  }
  await expect(
    otherPage.getByText("Strefa nauki: Europe/Warsaw"),
  ).toBeVisible();
  await expect(otherPage.locator('[name="timezone"]')).toHaveCount(0);
  await saveSettings.click();
  await expect.poll(syncedLimit).toBe(20);
  await defaultLimit.fill("0");
  await otherPage.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "settings") {
        IDBObjectStore.prototype.put = put;
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  await saveSettings.click();
  await expect(
    otherPage
      .getByRole("alert")
      .filter({ hasText: "Nie udało się zapisać ustawień" }),
  ).toBeVisible();
  await expect(unsaved).toBeVisible();
  await expect(defaultLimit).toHaveValue("0");
  await failNextWorkspaceRead(otherPage);
  await saveSettings.click();
  await expect(
    otherPage.getByText(
      "Nie udało się odświeżyć treningu po zapisie ustawień.",
    ),
  ).toBeVisible();
  await expect(defaultLimit).toHaveValue("0");
  await otherPage.getByRole("button", { name: "Ponów odczyt" }).click();
  await expect(unsaved).toHaveCount(0);
  await expect(otherPage.getByText("Ustawienia zapisane.")).toBeVisible();
  await expect.poll(syncedLimit).toBe(0);
  await otherPage.reload();
  await expect(otherPage.locator('input[name="newLimit"]')).toHaveValue("0");
  await openSettings.click();
  await expect(
    otherPage.getByText("Strefa nauki: Europe/Warsaw"),
  ).toBeVisible();
  const snapshot = await otherDevice.request.get("/api/v1/sync/snapshot");
  expect(snapshot.ok()).toBe(true);
  expect((await snapshot.json()).settings).toMatchObject({
    timezone: "Europe/Warsaw",
    newLimit: 0,
  });
  await otherPage.goto("/");
  await otherPage
    .getByRole("link", { name: "Utwórz zestaw", exact: true })
    .click();
  await otherPage.getByLabel("Nazwa zestawu").fill("Włoski w kawiarni");
  await otherPage.getByRole("button", { name: "Zapisz zestaw" }).click();
  await otherPage.getByLabel("Strona A").fill("un conto");
  await otherPage.getByLabel("Strona B").fill("rachunek");
  await otherPage
    .getByRole("button", { name: "Zapisz i dodaj następną" })
    .click();
  await expect(
    otherPage.getByRole("link", { name: "Ucz się z tego zestawu" }),
  ).toBeVisible();
  await otherPage.goto("/");
  await expect(otherPage.getByText("Nowe fiszki są wyłączone.")).toBeVisible();
  await otherPage.getByRole("link", { name: "Otwórz zestaw" }).click();
  await expect(
    otherPage.getByRole("heading", { name: "Włoski w kawiarni" }),
  ).toBeVisible();
});

test("CSV import skips duplicates and exports the saved cards", async ({
  accounts,
}) => {
  const primary = await accounts.device(await accounts.createAccount());
  const page = await primary.newPage();
  const changes = async () =>
    (await (await primary.request.get("/api/v1/sync/pull?cursor=0")).json())
      .changes;
  await page.goto("/import");
  await page.getByLabel("Plik CSV").setInputFiles({
    name: "nieprawidlowy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("foo;bar\ncat;kot"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: /separatora lub nagłówków/i }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Nazwa zestawu" })
    .fill("Z pliku CSV");
  await page.getByLabel("Plik CSV").setInputFiles({
    name: "fiszki.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("side_a;side_b\nkot;cat\nkot;cat\ndom;house\n", "utf8"),
  });
  await page.getByRole("button", { name: "Pokaż podgląd" }).click();
  await expect(page.getByText("Wiersz 3 · Duplikat")).toBeVisible();
  await expectAccessible(page, "podglad-csv");
  await page.getByLabel("Pomiń duplikaty").check();
  await expect(
    page.getByText("Separator: średnik. Do zapisu: 2 z 3."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zatwierdź import" }).click();
  await expect(
    page.getByText("Import zapisany na tym urządzeniu."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Wróć do zestawów" }).click();
  await page
    .getByRole("link", { name: /^Z pliku CSV Fiszki: 2 Otwórz$/ })
    .click();
  await page.getByText("Zarządzaj zestawem", { exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj CSV" }).click();
  const output = await readFile(await (await downloaded).path(), "utf8");
  expect(output).toContain("side_a,side_b,example_a,example_b");
  expect(output.match(/kot,cat,,/g)).toHaveLength(1);
  expect(output).toContain("dom,house,,");
  await expect
    .poll(async () =>
      (await changes()).some(
        (change: { entity: string; payload?: { sideA?: string } }) =>
          change.entity === "card" && change.payload?.sideA === "dom",
      ),
    )
    .toBe(true);
});

test("deck edits preserve progress and deleted cards reject stale changes", async ({
  accounts,
  baseURL,
}) => {
  const primary = await accounts.device(await accounts.createAccount());
  const { cardId } = await seedStudyDeck(primary, baseURL!);
  const page = await primary.newPage();
  const prior = await primary.request.post("/api/v1/sync/push", {
    headers: { origin: baseURL! },
    data: {
      protocolVersion: 1,
      deviceId: randomUUID(),
      operations: [
        {
          id: randomUUID(),
          entityId: cardId,
          type: "review.record",
          payload: {
            direction: "a-b",
            rating: 3,
            observedMode: "introduction",
            epoch: "0",
            occurredAt: new Date().toISOString(),
            clientSeq: "1",
            observedContentRevision: "0",
            observedProgressRevision: null,
            algorithmVersion: "recallio-fsrs6-v1",
          },
        },
      ],
    },
  });
  expect((await prior.json()).results).toMatchObject([{ status: "applied" }]);
  await page.goto("/decks");
  await expect(
    page.getByRole("link", { name: /^Nauka Fiszki: 1 Otwórz$/ }),
  ).toBeVisible();
  await expectAccessible(page, "biblioteka");
  const search = page.getByRole("searchbox", { name: "Wyszukaj zestaw" });
  await search.fill("brak dopasowania");
  await expect(
    page.getByRole("link", { name: /^Nauka Fiszki: 1 Otwórz$/ }),
  ).toHaveCount(0);
  await search.clear();
  await page.getByRole("button", { name: "Dodaj zestaw" }).click();
  await page.getByLabel("Nazwa zestawu").fill("Niewysłany szkic");
  await page.getByRole("button", { name: "Anuluj" }).click();
  await expect(
    page.getByRole("link", { name: /Niewysłany szkic/ }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: /^Nauka Fiszki: 1 Otwórz$/ }).click();
  await page.getByText("Zarządzaj zestawem", { exact: true }).click();
  await page.getByRole("button", { name: "Edytuj zestaw" }).click();
  await page.getByLabel("Nazwa zestawu").fill("Zaktualizowany zestaw");
  await page.getByRole("radio", { name: "Mieszany" }).check();
  await page.getByRole("button", { name: "Zapisz zestaw" }).click();
  await expect(
    page.getByRole("heading", { name: "Zaktualizowany zestaw" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edytuj fiszkę" }).click();
  await page.getByLabel("Strona B").fill("dog (noun)");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByText("dog (noun)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edytuj fiszkę" }).click();
  await page.getByText("Postęp i usuwanie", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Zresetuj A → B" }),
  ).toBeVisible();
  const changes = async () =>
    (await (await primary.request.get("/api/v1/sync/pull?cursor=0")).json())
      .changes;
  await expect
    .poll(
      async () =>
        (await changes()).filter(
          ({ entity }: { entity: string }) => entity === "card",
        ).length,
    )
    .toBe(2);
  expect(
    (await changes()).filter(
      ({ entity }: { entity: string }) => entity === "progress",
    ),
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Zresetuj A → B" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Zresetuj A → B" })
    .click();
  await expect
    .poll(
      async () =>
        (await changes()).find(
          ({ entity }: { entity: string }) => entity === "reset",
        )?.payload.epoch,
    )
    .toBe("1");
  await expect(
    page.getByRole("button", { name: "Zresetuj A → B" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Usuń fiszkę" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Usuń fiszkę" })
    .click();
  await expect(page.getByText("W zestawie nie ma fiszek.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fiszki", exact: true }),
  ).toBeFocused();
  await expect
    .poll(async () =>
      (await changes()).some(
        (change: { entity: string; deleted: boolean }) =>
          change.entity === "card" && change.deleted,
      ),
    )
    .toBe(true);

  const stale = await primary.request.post("/api/v1/sync/push", {
    headers: { origin: baseURL! },
    data: {
      protocolVersion: 1,
      deviceId: randomUUID(),
      operations: [
        {
          id: randomUUID(),
          type: "card.update",
          entityId: cardId,
          baseRevision: "0",
          payload: {
            sideA: "stara treść",
            sideB: "old",
            exampleA: null,
            exampleB: null,
          },
        },
      ],
    },
  });
  expect((await stale.json()).results).toMatchObject([
    { status: "conflict", error: "entity_deleted" },
  ]);
});

test("anulowanie odrzucenia pozwala wysłać zachowaną zmianę", async ({
  page,
  accounts,
  baseURL,
}) => {
  const user = await accounts.createAccount();
  await signIn(page.request, baseURL!, user);
  await page.route("**/api/v1/sync/push", (r) => r.fulfill({ status: 503 }));
  await page.goto("/decks?new=1");
  await page.getByLabel("Nazwa zestawu").fill("Do synchronizacji");
  await page.getByRole("button", { name: "Zapisz zestaw" }).click();
  await expect(
    page.getByRole("heading", { name: "Pierwsza fiszka" }),
  ).toBeVisible();
  await page.goto("/account");
  const logout = page.getByRole("button", { name: "Wyloguj się", exact: true });
  await logout.click();
  const discard = page.getByRole("button", {
    name: "Odrzuć zmiany i wyloguj się",
  });
  await discard.click();
  const cancel = page.getByRole("button", { name: "Anuluj" });
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(discard).toBeFocused();
  await cancel.click();
  await expect(logout).toBeFocused();
  await expect(
    page.getByText(/Niewysłane zmiany na urządzeniu: 1/),
  ).toBeVisible();
  await logout.click();
  await page
    .getByRole("button", { name: "Synchronizuj i wyloguj się" })
    .click();
  await expect(
    page.getByRole("button", { name: "Ponów synchronizację i wyloguj się" }),
  ).toBeFocused();
  await page.unroute("**/api/v1/sync/push");
  await page
    .getByRole("button", { name: "Ponów synchronizację i wyloguj się" })
    .click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  const second = await accounts.device(user);
  const snapshot = await second.request.get("/api/v1/sync/pull?cursor=0");
  expect((await snapshot.json()).changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entity: "deck",
        payload: expect.objectContaining({ name: "Do synchronizacji" }),
      }),
    ]),
  );
});

test.describe("dashboard preview", () => {
  test.use({ serviceWorkers: "block" });

  test("the initial dashboard counts a library with more than a thousand cards before hydration", async ({
    page,
    accounts,
    baseURL,
  }) => {
    await signIn(page.request, baseURL!, await accounts.createAccount());
    const { deckId } = await seedStudyDeck(page.context(), baseURL!);
    const deviceId = randomUUID();
    for (let batch = 0; batch < 10; batch++) {
      const operations = Array.from({ length: 100 }, (_, index) => ({
        id: randomUUID(),
        entityId: randomUUID(),
        type: "card.create",
        payload: {
          deckId,
          sideA: String(batch * 100 + index),
          sideB: "B",
          exampleA: null,
          exampleB: null,
        },
      }));
      const response = await page.request.post("/api/v1/sync/push", {
        headers: { origin: baseURL! },
        data: { protocolVersion: 1, deviceId, operations },
      });
      expect((await response.json()).results).toEqual(
        operations.map(() => expect.objectContaining({ status: "applied" })),
      );
    }
    await page.route("**/_next/static/chunks/*.js", (route) => route.abort());
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Nauka Fiszki: 1001" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Poznaj nowe fiszki" }),
    ).toHaveAttribute("href", "/study?deck=" + deckId);
  });

  test("the dashboard recommendation works before hydration and respects a pending local deletion", async ({
    page,
    accounts,
    baseURL,
  }) => {
    const owner = await accounts.createAccount();
    const device = page.context();
    await signIn(page.request, baseURL!, owner);
    const { deckId } = await seedStudyDeck(device, baseURL!);

    // Exercise the first HTML response even when all framework scripts are delayed.
    const chunks = "**/_next/static/chunks/*.js";
    const waitingTab = await device.newPage();
    let releaseScripts!: () => void;
    const scriptsHeld = new Promise<void>((resolve) => {
      releaseScripts = resolve;
    });
    await waitingTab.route(chunks, async (route) => {
      await scriptsHeld;
      await route.continue();
    });
    await waitingTab.goto("/", { waitUntil: "commit" });
    const waitingDeck = waitingTab.getByRole("link", {
      name: "Nauka Fiszki: 1",
    });
    await expect(waitingDeck).toBeVisible();
    await page.route(chunks, (route) => route.abort());
    await page.goto("/");
    const study = page.getByRole("link", { name: "Poznaj nowe fiszki" });
    await expect(study).toBeVisible();
    await expect(study).toHaveAttribute("href", "/study?deck=" + deckId);
    const deckLink = page.getByRole("link", { name: "Nauka Fiszki: 1" });
    await expect(deckLink).toBeVisible();
    await page.unroute(chunks);
    await study.click();
    await expect(page.getByRole("heading", { name: "pies" })).toBeVisible();

    await page.goto("/decks?deck=" + deckId);
    await page.getByText("Zarządzaj zestawem", { exact: true }).click();
    await device.route("**/api/v1/sync/push", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.getByRole("button", { name: "Usuń zestaw" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Usuń zestaw" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Moje zestawy" }),
    ).toBeVisible();

    await page.route(chunks, (route) => route.abort());
    await page.goto("/");
    // The server still knows the deck. Its link must remain hidden on this device.
    // This tab's initial database check predates the deletion in the other tab.
    releaseScripts();
    await expect(waitingDeck).toHaveCount(0);
    await expect(waitingTab.locator("[data-preview-database]")).toHaveCount(0);
    await waitingTab.close();
    await expect(page.locator("[data-preview-database]")).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveText(
      "Wczytywanie biblioteki…",
    );
    await expect(study).toHaveCount(0);
    await expect(deckLink).toHaveCount(0);
    await page.unroute(chunks);
    await page.reload();
    await expect(
      page.getByRole("status").filter({ hasText: "Wczytywanie biblioteki" }),
    ).toHaveCount(0);
    await expect(study).toHaveCount(0);
    await expect(deckLink).toHaveCount(0);

    const outsider = await accounts.device(await accounts.createAccount());
    const otherHtml = await outsider.request.get("/");
    expect(await otherHtml.text()).not.toContain(deckId);
  });
});
