import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { signIn, test } from "./local-accounts";

test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);

async function openDraftEditor(page: Page, origin: string) {
  const deckId = randomUUID();
  const response = await page.request.post("/api/v1/sync/push", {
    headers: { origin },
    data: {
      protocolVersion: 1,
      deviceId: randomUUID(),
      operations: [
        {
          id: randomUUID(),
          entityId: deckId,
          type: "deck.create",
          payload: { name: "Powtórka słówek", directionMode: "a-b" },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).results).toMatchObject([
    { status: "applied" },
  ]);
  const url = "/decks?deck=" + deckId + "&card=new";
  await page.goto(url);
  await expect(page.getByLabel("Strona A")).toBeEditable();
  return url;
}

test("szkic z przykładem wraca po odświeżeniu i znika po potwierdzeniu odrzucenia", async ({
  page,
  accounts,
  baseURL,
}) => {
  await signIn(page.request, baseURL!, await accounts.createAccount());
  const url = await openDraftEditor(page, baseURL!);
  const question = page.getByLabel("Strona A");
  const answer = page.getByLabel("Strona B");
  const example = page.getByLabel("Przykład B");
  await question.fill("a domani");
  await answer.fill("do jutra");
  await page.getByText("Przykłady (opcjonalne)").click();
  await example.fill("Do jutra, Aniu!");
  await page.reload();
  await expect(question).toHaveValue("a domani");
  await expect(answer).toHaveValue("do jutra");
  await expect(example).toBeVisible();
  await expect(example).toHaveValue("Do jutra, Aniu!");

  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page.getByRole("button", { name: "Odrzuć szkic" }).click();
  await expect(page.getByText("W zestawie nie ma fiszek.")).toBeVisible();
  await page.goto(url);
  await expect(question).toHaveValue("");
  await expect(answer).toHaveValue("");
  await page.getByText("Przykłady (opcjonalne)").click();
  await expect(example).toHaveValue("");
});

test("szkic jest przypisany do zestawu i zostaje usunięty przy wylogowaniu", async ({
  page,
  accounts,
  baseURL,
}) => {
  const account = await accounts.createAccount();
  await signIn(page.request, baseURL!, account);
  const firstDeck = await openDraftEditor(page, baseURL!);
  const question = page.getByLabel("Strona A");
  await question.fill("prywatna notatka");
  await openDraftEditor(page, baseURL!);
  await expect(question).toHaveValue("");
  await page.goto(firstDeck);
  await expect(question).toHaveValue("prywatna notatka");

  await page.goto("/account");
  await page.getByRole("button", { name: "Wyloguj się", exact: true }).click();
  await expect(page).toHaveURL("/auth/login");
  await signIn(page.request, baseURL!, account);
  await page.goto(firstDeck);
  await expect(question).toBeEditable();
  await expect(question).toHaveValue("");
});
