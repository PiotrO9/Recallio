import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Requires a local database",
);

test("a review survives an offline reload and synchronizes once to a second device", async ({
  browser,
  request,
  baseURL,
}) => {
  const secret = process.env.RECALLIO_TEST_SERVICE_ROLE_KEY;
  expect(secret).toBeTruthy();
  const headers = { apikey: secret!, authorization: `Bearer ${secret}` };
  const adminUrl = "http://127.0.0.1:54321/auth/v1/admin/users";
  const created: string[] = [];
  const devices: BrowserContext[] = [];
  async function createAccount() {
    const account = {
      email: `${randomUUID()}@example.test`,
      password: randomUUID(),
    };
    const response = await request.post(adminUrl, {
      headers,
      data: { ...account, email_confirm: true },
    });
    expect(response.status()).toBe(200);
    const { id } = await response.json();
    created.push(id);
    return { ...account, id: id as string };
  }
  async function device(account: Awaited<ReturnType<typeof createAccount>>) {
    const context = await browser.newContext({ baseURL });
    devices.push(context);
    const response = await context.request.post("/auth/actions", {
      headers: { origin: baseURL! },
      form: {
        intent: "login",
        email: account.email,
        password: account.password,
      },
      maxRedirects: 0,
    });
    expect(response.headers().location).toBe("/account");
    return context;
  }

  try {
    const owner = await createAccount();
    const unrelated = await createAccount();
    const primary = await device(owner);
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
            entityId: owner.id,
            type: "settings.update",
            baseRevision: "0",
            payload: {
              timezone: "Europe/Warsaw",
              newLimit: 2,
              showDue: true,
              showSession: false,
            },
          },
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
      (await seed.json()).results.map(
        ({ status }: { status: string }) => status,
      ),
    ).toEqual(["applied", "applied", "applied"]);

    const page = await primary.newPage();
    await page.goto("/study");
    await expect(page.getByRole("heading", { name: "pies" })).toBeVisible();
    await expect(
      page.getByText("Możesz odświeżyć stronę bez internetu."),
    ).toBeVisible();
    await primary.setOffline(true);
    await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
    await expect(page.getByText("dog", { exact: true })).toBeVisible();
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
    await page.getByRole("button", { name: "Dobrze" }).click();
    await expect(
      page.getByText("Nie udało się zapisać oceny.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("dog", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ponów zapis" }).click();
    await expect(page.getByText("Zapisany postęp: 1")).toBeVisible();
    const attempts = await page.evaluate(
      () => Reflect.get(window, "recallioTestAttempts") as string[],
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe(attempts[1]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Zapisany postęp: 1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "pies" })).toBeVisible();

    await primary.setOffline(false);
    await expect
      .poll(async () => {
        const response = await primary.request.get(
          "/api/v1/sync/pull?cursor=0",
        );
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
    await expect(secondPage.getByText("Zapisany postęp: 1")).toBeVisible();
    await secondPage.getByRole("button", { name: "Zakończ sesję" }).click();
    await expect(secondPage.getByText("Sesja zakończona.")).toBeVisible();
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
    await expect(otherPage.getByRole("heading", { name: "pies" })).toHaveCount(
      0,
    );
    await expect(otherPage.getByText("Zapisany postęp: 1")).toHaveCount(0);
    await page.goto("/decks");
    await expect(page.getByRole("heading", { name: "Nauka" })).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Wyszukaj zestaw" });
    await search.fill("brak dopasowania");
    await expect(
      page.getByRole("button", { name: "Nauka", exact: true }),
    ).toHaveCount(0);
    await search.clear();
    await page.getByRole("button", { name: "Dodaj zestaw" }).click();
    await page.getByLabel("Nazwa zestawu").fill("Niewysłany szkic");
    await page.getByRole("button", { name: "Anuluj" }).click();
    await expect(
      page.getByRole("button", { name: "Niewysłany szkic" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Edytuj zestaw" }).click();
    await page.getByLabel("Nazwa zestawu").fill("Zaktualizowany zestaw");
    await page.getByLabel("Kierunek zestawu").selectOption("mixed");
    await page.getByRole("button", { name: "Zapisz zestaw" }).click();
    await expect(
      page.getByRole("heading", { name: "Zaktualizowany zestaw" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edytuj fiszkę" }).click();
    await page.getByLabel("Strona B").fill("dog (noun)");
    await page.getByRole("button", { name: "Zapisz fiszkę" }).click();
    await expect(page.getByText("dog (noun)", { exact: true })).toBeVisible();
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

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Zresetuj A → B" }).click();
    await expect
      .poll(
        async () =>
          (await changes()).find(
            ({ entity }: { entity: string }) => entity === "reset",
          )?.payload.epoch,
      )
      .toBe("1");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Usuń fiszkę" }).click();
    await expect(page.getByText("W zestawie nie ma fiszek.")).toBeVisible();
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
  } finally {
    await Promise.all(devices.map((context) => context.close()));
    await Promise.all(
      created.map((id) => request.delete(`${adminUrl}/${id}`, { headers })),
    );
  }
});
