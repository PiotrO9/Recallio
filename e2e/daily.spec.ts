import { randomUUID } from "node:crypto";
import { FSRS_VERSION } from "../src/domain/learning/scheduler";
import { expect } from "@playwright/test";
import { test, signIn } from "./local-accounts";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);

test("dzienne powtórki kończą się na czystym koncie", async ({
  accounts,
  page,
  baseURL,
}) => {
  await signIn(page.request, baseURL!, await accounts.createAccount());
  await page.goto("/study?scope=today");
  await expect(
    page.getByRole("heading", {
      name: "Wszystkie dostępne powtórki zrobione.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dodaj jeszcze jedną nową fiszkę" }),
  ).toHaveCount(0);
});

test("dwa zestawy przechodzą przez jedną sesję offline i zapisują po jednej ocenie na drugim urządzeniu", async ({
  accounts,
  baseURL,
}) => {
  const owner = await accounts.createAccount();
  const first = await accounts.device(owner);
  const second = await accounts.device(owner);
  const outsider = await accounts.device(await accounts.createAccount());
  const deviceId = randomUUID();
  const seeds = ["A", "B"].map((name, i) => ({
    name,
    deckId: randomUUID(),
    cardId: randomUUID(),
    day: "2024-01-0" + (1 + i) + "T12:00:00.000Z",
  }));
  const operations = seeds.flatMap(({ name, deckId, cardId, day }, i) => [
    {
      type: "deck.create",
      id: randomUUID(),
      entityId: deckId,
      payload: { name, directionMode: "a-b" },
    },
    {
      type: "card.create",
      id: randomUUID(),
      entityId: cardId,
      payload: {
        deckId,
        sideA: "pytanie " + name,
        sideB: "odpowiedź " + name,
        exampleA: null,
        exampleB: null,
      },
    },
    {
      type: "review.record",
      id: randomUUID(),
      entityId: cardId,
      payload: {
        direction: "a-b",
        rating: 1,
        observedMode: "introduction",
        occurredAt: day,
        clientSeq: String(i + 1),
        observedContentRevision: "1",
        observedProgressRevision: null,
        epoch: "0",
        algorithmVersion: FSRS_VERSION,
      },
    },
  ]);
  const response = await first.request.post("/api/v1/sync/push", {
    headers: { origin: baseURL! },
    data: { protocolVersion: 1, deviceId, operations },
  });
  expect(
    (await response.json()).results.map((r: { status: string }) => r.status),
  ).toEqual(Array(6).fill("applied"));
  const page = await first.newPage();
  for (const { deckId } of seeds) {
    await page.goto("/decks?deck=" + deckId);
    await page.getByText("Zarządzaj zestawem", { exact: true }).click();
    await page
      .getByRole("button", { name: "Przygotuj zestaw offline" })
      .click();
    await expect(
      page.getByText(/Zestaw jest gotowy do nauki offline/),
    ).toBeVisible();
  }
  await page.goto("/");
  await page.getByRole("link", { name: "Powtórz na dziś" }).click();
  await expect(page.getByRole("heading", { name: "pytanie A" })).toBeVisible();
  await first.setOffline(true);
  try {
    await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
    await page.getByRole("button", { name: "Dobrze" }).click();
    await expect(
      page.getByRole("heading", { name: "pytanie B" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "pytanie B" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
    await page.getByRole("button", { name: "Dobrze" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Wszystkie dostępne powtórki zrobione.",
      }),
    ).toBeVisible();
  } finally {
    await first.setOffline(false);
  }
  async function reviews(context: typeof second) {
    const pull = await context.request.get("/api/v1/sync/pull?cursor=0");
    expect(pull.ok()).toBe(true);
    return (await pull.json()).changes
      .filter(
        (c: { entity: string; payload: { canonicalMode: string } }) =>
          c.entity === "review" && c.payload.canonicalMode === "due",
      )
      .map(
        (c: { payload: { event: { id: string; cardId: string } } }) =>
          c.payload.event,
      );
  }
  await expect
    .poll(async () =>
      (await reviews(second)).map((e: { cardId: string }) => e.cardId),
    )
    .toEqual(seeds.map((s) => s.cardId));
  expect(
    new Set((await reviews(second)).map((e: { id: string }) => e.id)).size,
  ).toBe(2);
  expect(await reviews(outsider)).toEqual([]);
  const otherPage = await second.newPage();
  await otherPage.goto("/study?scope=today");
  await expect(
    otherPage.getByRole("heading", {
      name: "Wszystkie dostępne powtórki zrobione.",
    }),
  ).toBeVisible();
});
