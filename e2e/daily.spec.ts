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
