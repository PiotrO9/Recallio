import { createHmac, randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

test.skip(
  process.env.RECALLIO_RUN_AUTH_TESTS !== "1",
  "Requires the local Supabase stack",
);

async function emailLink(
  request: APIRequestContext,
  email: string,
  kind: "email" | "recovery",
) {
  let result: string | undefined;
  await expect
    .poll(async () => {
      const list = await request.get("http://127.0.0.1:54324/api/v1/messages");
      const { messages } = (await list.json()) as {
        messages: { ID: string; To: { Address: string }[]; Subject: string }[];
      };
      const message = messages.find(
        ({ To, Subject }) =>
          To.some((recipient) => recipient.Address === email) &&
          Subject ===
            (kind === "email"
              ? "Potwierdź konto Recallio"
              : "Odzyskaj hasło do Recallio"),
      );
      if (!message) return false;
      const response = await request.get(
        `http://127.0.0.1:54324/api/v1/message/${message.ID}`,
      );
      const { HTML } = (await response.json()) as { HTML: string };
      result = HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
      return Boolean(result);
    })
    .toBe(true);
  return result!;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(
    page.getByRole("heading", { name: "Twoje konto" }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}

async function expireSession(page: Page, baseURL: string) {
  const secret = process.env.RECALLIO_TEST_JWT_SECRET;
  expect(
    secret,
    "Read the signing secret from local Supabase status",
  ).toBeTruthy();
  const tokenCookies = (await page.context().cookies(baseURL)).filter(
    ({ name }) => /-auth-token(?:\.\d+)?$/.test(name),
  );
  expect(tokenCookies.length).toBeGreaterThan(0);
  const encoded = tokenCookies.map(({ value }) => value).join("");
  const session = JSON.parse(
    Buffer.from(encoded.replace(/^base64-/, ""), "base64url").toString(),
  );
  const claims = JSON.parse(
    Buffer.from(session.access_token.split(".")[1], "base64url").toString(),
  );
  const now = Math.floor(Date.now() / 1000);
  claims.iat = now - 3600;
  claims.exp = now - 1800;
  const segment = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${segment({ alg: "HS256", typ: "JWT" })}.${segment(claims)}`;
  const signature = createHmac("sha256", secret!)
    .update(unsigned)
    .digest("base64url");
  const expiredSession = {
    ...session,
    access_token: `${unsigned}.${signature}`,
    expires_at: claims.exp,
    refresh_token: randomUUID(),
  };
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      url: baseURL,
      name: tokenCookies[0].name.replace(/\.0$/, ""),
      value: `base64-${segment(expiredSession)}`,
      httpOnly: true,
    },
  ]);
}

test("account requires a verified session, sign-up and reset links stay on the local origin", async ({
  page,
  request,
  baseURL,
}) => {
  const email = `${randomUUID()}@example.test`;
  const password = randomUUID();
  const replacement = randomUUID();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\?status=session$/);
  const invalid = await request.get(
    "/auth/confirm?type=email&token_hash=invalid&next=https://example.com",
    { maxRedirects: 0 },
  );
  expect(invalid.status()).toBe(303);
  expect(new URL(invalid.headers().location, baseURL).origin).toBe(baseURL);
  const otherOrigin = await request.post("/auth/actions", {
    headers: { origin: "https://example.com" },
    form: { intent: "logout" },
  });
  expect(otherOrigin.status()).toBe(403);

  await page.goto("/auth?mode=signup");
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Utwórz konto" }).click();
  await expect(page.getByRole("status")).toContainText("skrzynce");
  const confirmation = await emailLink(request, email, "email");
  expect(new URL(confirmation).origin).toBe(baseURL);
  await page.goto(confirmation);
  await expect(
    page.getByRole("heading", { name: "Twoje konto" }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const account = await page.request.get("/account");
  expect(account.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("button", { name: "Wyloguj się" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await login(page, email, password);

  await page.getByRole("button", { name: "Wyloguj się" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.getByRole("link", { name: "Nie pamiętam hasła" }).click();
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByRole("button", { name: "Wyślij link" }).click();
  await expect(page.getByRole("status")).toContainText("skrzynce");
  const recovery = await emailLink(request, email, "recovery");
  expect(new URL(recovery).origin).toBe(baseURL);
  await page.goto(recovery);
  await page.getByLabel("Nowe hasło").fill(replacement);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(
    page.getByRole("heading", { name: "Twoje konto" }),
  ).toBeVisible();
  await expireSession(page, baseURL!);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\?status=session$/);
  await login(page, email, replacement);
});
