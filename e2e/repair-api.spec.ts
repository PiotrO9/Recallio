import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./local-accounts";
import { seedDifficultCard } from "./repair-fixture";
import { repairResponseSchema } from "../src/contracts";
test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);
test("raport z trzech dni uwzględnia epokę, właściciela i ponowienie", async ({
  accounts,
  baseURL,
  request,
}) => {
  const url = "/api/v1/study/repair-candidates";
  expect((await request.get(url)).status()).toBe(401);
  const owner = await accounts.createAccount();
  const first = await accounts.device(owner),
    second = await accounts.device(owner),
    outside = await accounts.device(await accounts.createAccount());
  const fixture = await seedDifficultCard(first.request, baseURL!);
  async function report(device: typeof first) {
    const res = await device.request.get(url);
    expect(res.ok()).toBe(true);
    expect(res.headers()["cache-control"]).toContain("no-store");
    return repairResponseSchema.parse(await res.json()).items;
  }
  expect(await report(first)).toEqual([]);
  await fixture.third();
  const items = await report(first);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    cardId: fixture.cardId,
    deckId: fixture.deckId,
    directions: [{ direction: "a-b", epoch: "0", failedDays: 3 }],
  });
  expect(await report(second)).toEqual(items);
  expect(await report(outside)).toEqual([]);
  expect(
    (
      await outside.request.get(url, {
        headers: { "X-Recallio-Account": owner.id },
      })
    ).status(),
  ).toBe(401);
  const page = await first.request.get("/api/v1/sync/pull?cursor=0");
  const progress = (await page.json()).changes
    .filter((c: { entity: string }) => c.entity === "progress")
    .at(-1).payload;
  await fixture.push([
    {
      id: randomUUID(),
      entityId: fixture.cardId,
      type: "progress.reset",
      baseRevision: progress.revision,
      payload: { direction: "a-b", epoch: "1" },
    },
  ]);
  expect(await report(second)).toEqual([]);
  const another = await seedDifficultCard(first.request, baseURL!);
  await another.third();
  await another.push([
    {
      id: randomUUID(),
      entityId: another.cardId,
      type: "card.delete",
      baseRevision: "0",
      payload: {},
    },
  ]);
  expect(await report(second)).toEqual([]);
});
