import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

const url = "http://127.0.0.1:54321";
const anonKey = process.env.RECALLIO_TEST_ANON_KEY;
const serviceKey = process.env.RECALLIO_TEST_SERVICE_ROLE_KEY;

function request(
  path,
  { key = anonKey, token, method = "GET", body, schema } = {},
) {
  return fetch(url + path, {
    method,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(schema ? { "Accept-Profile": schema } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function testAccount(accounts) {
  const email = `${randomUUID()}@example.test`;
  const password = randomUUID();
  const created = await request("/auth/v1/admin/users", {
    key: serviceKey,
    token: serviceKey,
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  assert.equal(created.status, 200, "create local fixture account");
  const { id } = await created.json();
  assert.match(id, /^[a-f0-9-]{36}$/);
  accounts.push(id);
  const signedIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(signedIn.status, 200, "obtain local fixture session");
  const { access_token: token } = await signedIn.json();
  assert.ok(token);
  return { id, token, deckId: randomUUID() };
}

test(
  "Supabase REST restricts accounts and direct writes",
  { timeout: 30_000 },
  async (context) => {
    assert.ok(
      anonKey && serviceKey,
      "Load test keys from local Supabase status",
    );
    const accounts = [];
    context.after(async () => {
      for (const id of accounts) {
        const response = await request(`/auth/v1/admin/users/${id}`, {
          key: serviceKey,
          token: serviceKey,
          method: "DELETE",
        });
        assert.equal(response.status, 200, "remove local fixture account");
      }
    });
    const first = await testAccount(accounts);
    const second = await testAccount(accounts);
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_Recallio",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `insert into public.decks (user_id, id, name, direction_mode, revision) values
        ('${first.id}', '${first.deckId}', 'First test deck', 'a-b', 0),
        ('${second.id}', '${second.deckId}', 'Second test deck', 'b-a', 0);`,
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    const decks = "/rest/v1/decks?select=id";
    for (const account of [first, second]) {
      const visible = await request(decks, account);
      assert.equal(visible.status, 200);
      assert.deepEqual(await visible.json(), [{ id: account.deckId }]);
    }
    const anonymous = await request(decks);
    assert.ok([401, 403].includes(anonymous.status));
    const update = await request(`/rest/v1/decks?id=eq.${second.deckId}`, {
      token: first.token,
      method: "PATCH",
      body: { name: "Forbidden test update" },
    });
    assert.equal(update.status, 403);
    const privateSchema = await request("/rest/v1/operation_receipts", {
      token: first.token,
      schema: "recallio_private",
    });
    assert.equal(privateSchema.status, 406);
  },
);
