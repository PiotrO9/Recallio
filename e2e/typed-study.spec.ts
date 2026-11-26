import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test, signIn } from "./local-accounts";
import { operationSchema } from "../src/contracts";
test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);
for (const direction of ["a-b", "b-a"] as const) {
  test(
    "pisanie, błąd zapisu i samoocena " + direction,
    async ({ accounts, page, baseURL }) => {
      const owner = await accounts.createAccount();
      await signIn(page.request, baseURL!, owner);
      const deckId = randomUUID(),
        cardId = randomUUID();
      const created = await page.request.post("/api/v1/sync/push", {
        headers: { origin: baseURL! },
        data: {
          protocolVersion: 1,
          deviceId: randomUUID(),
          operations: [
            {
              type: "deck.create",
              entityId: deckId,
              id: randomUUID(),
              payload: { name: "Luźne tłumaczenie", directionMode: direction },
            },
            {
              type: "card.create",
              entityId: cardId,
              id: randomUUID(),
              payload: {
                deckId,
                sideA: "cześć",
                sideB: "hi",
                exampleA: null,
                exampleB: null,
              },
            },
          ],
        },
      });
      expect(
        (await created.json()).results.map((r: { status: string }) => r.status),
      ).toEqual(["applied", "applied"]);
      await page.goto("/study?deck=" + deckId);
      await expect(
        page.getByRole("heading", {
          name: direction === "a-b" ? "cześć" : "hi",
        }),
      ).toBeVisible();
      await page.getByRole("checkbox", { name: "Wpisuj odpowiedź" }).check();
      const input = page.getByRole("textbox", { name: "Twoja odpowiedź" });
      await expect(input).toBeFocused();
      const answer = "Hej, miło Cię widzieć!";
      await input.fill(answer);
      await input.press("3");
      await expect(input).toHaveValue(answer + "3");
      await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
      await expect(page.getByText(answer + "3", { exact: true })).toBeVisible();
      await expect(
        page.getByText(direction === "a-b" ? "hi" : "cześć", { exact: true }),
      ).toBeVisible();
      await page.evaluate(() => {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (value, key) {
          const request = add.call(this, value, key);
          if (this.name === "outbox") {
            IDBObjectStore.prototype.add = add;
            Reflect.set(window, "typedAttempt", value.operation.id);
            this.transaction.abort();
          }
          return request;
        };
      });
      await page.getByRole("button", { name: "Dobrze" }).click();
      await expect(
        page.getByText("Nie udało się zapisać oceny."),
      ).toBeVisible();
      await expect(page.getByText(answer + "3", { exact: true })).toBeVisible();
      const outgoing = page.waitForRequest(
        (req) =>
          req.method() === "POST" && req.url().endsWith("/api/v1/sync/push"),
      );
      await page.getByRole("button", { name: "Ponów zapis" }).click();
      const payload = (await outgoing).postDataJSON();
      expect(payload.operations).toHaveLength(1);
      const review = operationSchema.parse(payload.operations[0]);
      expect(review).toMatchObject({
        id: await page.evaluate(() => Reflect.get(window, "typedAttempt")),
        entityId: cardId,
        type: "review.record",
        payload: { direction, rating: 3 },
      });
      expect(JSON.stringify(payload)).not.toContain(answer);
      expect(Object.keys(review.payload).sort()).toEqual([
        "algorithmVersion",
        "clientSeq",
        "direction",
        "epoch",
        "observedContentRevision",
        "observedMode",
        "observedProgressRevision",
        "occurredAt",
        "rating",
      ]);
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
      await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
      await expect(page.getByText("Puste pole")).toBeVisible();
      await page.getByRole("button", { name: "Zakończ sesję" }).click();
      await page.getByRole("button", { name: "Rozpocznij nową sesję" }).click();
      await expect(
        page.getByRole("checkbox", { name: "Wpisuj odpowiedź" }),
      ).not.toBeChecked();
    },
  );
}
