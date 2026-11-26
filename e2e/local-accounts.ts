import {
  test as base,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
type Account = { email: string; password: string; id: string };
export async function signIn(
  api: APIRequestContext,
  origin: string,
  credentials: Account,
) {
  const response = await api.post("/auth/actions", {
    headers: { origin },
    form: {
      intent: "login",
      email: credentials.email,
      password: credentials.password,
    },
    maxRedirects: 0,
  });
  expect(response.headers().location).toBe("/");
}
export const test = base.extend<{
  accounts: {
    createAccount(): Promise<Account>;
    device(account: Account): Promise<BrowserContext>;
  };
}>({
  accounts: async (
    { request, browser, baseURL, viewport, isMobile, hasTouch },
    use,
  ) => {
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
      const context = await browser.newContext({
        baseURL,
        viewport: isMobile ? { width: 320, height: 720 } : viewport,
        isMobile,
        hasTouch,
      });
      devices.push(context);
      await signIn(context.request, baseURL!, account);
      return context;
    }

    try {
      await use({ createAccount, device });
    } finally {
      await Promise.all(devices.map((context) => context.close()));
      await Promise.all(
        created.map((id) => request.delete(`${adminUrl}/${id}`, { headers })),
      );
    }
  },
});
