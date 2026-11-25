import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
test.skip(
  process.env.RECALLIO_RUN_SYNC_TESTS !== "1",
  "Wymaga lokalnego Supabase",
);
test("wszystkie widoki makiet są dostępne w prawdziwym przebiegu nauki", async ({
  page,
  request,
  baseURL,
}, info) => {
  const mobile = info.project.name === "mobile";
  const width = mobile ? 390 : 1440;
  await page.setViewportSize({ width, height: mobile ? 844 : 900 });
  const frames = new Set<string>();
  async function frame(id: string) {
    const title: Record<string, string> = {
      W01: "Panel nauki",
      W02: "Moje zestawy",
      W03: "Nowy zestaw",
      W04: "Włoski w kawiarni",
      W05: "Pierwsza fiszka",
      W06: "un conto",
      W07: "un conto",
      W08: "Sesja zakończona.",
      W09: "un conto",
      W10: "Importuj CSV",
      W11: "Podgląd importu",
      W12: "Import zakończony",
      W13: "Moje konto",
      W14: "Zaloguj się",
      W15: "Utwórz konto",
      W16: "Odzyskaj hasło",
      W17: "Ustaw nowe hasło",
      W18: "Nie znaleziono strony",
    };
    await expect(
      page.getByRole("heading", { name: title[id], exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("main")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(id + ".png"),
      fullPage: true,
      scale: "css",
    });
    frames.add(id);
  }
  const admin = "http://127.0.0.1:54321/auth/v1/admin/users",
    key = process.env.RECALLIO_TEST_SERVICE_ROLE_KEY!;
  const credentials = {
      email: randomUUID() + "@example.test",
      password: randomUUID(),
    },
    headers = { apikey: key, authorization: "Bearer " + key };
  const response = await request.post(admin, {
    headers,
    data: { ...credentials, email_confirm: true },
  });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  try {
    for (const [view, url] of [
      ["W14", "/auth/login"],
      ["W15", "/auth/signup"],
      ["W16", "/auth/forgot-password"],
      ["W18", "/strona-ktorej-nie-ma"],
    ]) {
      await page.goto(url);
      await frame(view);
    }
    await page.request.post("/auth/actions", {
      headers: { origin: baseURL! },
      form: { intent: "login", ...credentials },
      maxRedirects: 0,
    });
    await page.goto("/auth/new-password");
    await expect(page.getByLabel("Nowe hasło")).toBeVisible();
    await frame("W17");
    await page.goto("/account");
    await expect(
      page.getByText(credentials.email, { exact: true }),
    ).toBeVisible();
    await frame("W13");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Twój pierwszy zestaw" }),
    ).toBeVisible();
    await frame("W01");
    await page.getByRole("link", { name: "Utwórz pierwszy zestaw" }).click();
    await frame("W03");
    await page.getByLabel("Nazwa zestawu").fill("Włoski w kawiarni");
    await page.getByRole("button", { name: "Zapisz zestaw" }).click();
    await page.getByLabel("Strona A").fill("un conto");
    await page.getByLabel("Strona B").fill("rachunek");
    await frame("W05");
    await page.getByRole("button", { name: "Zapisz fiszkę" }).click();
    await expect(
      page.getByRole("link", { name: "Ucz się z tego zestawu" }),
    ).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Włoski w kawiarni" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("W01-active.png"),
      fullPage: true,
      scale: "css",
    });
    await page.getByRole("link", { name: "Poznaj nowe fiszki" }).click();
    await expect(page.getByRole("heading", { name: "un conto" })).toBeVisible();
    await frame("W06");
    const prompt = page.getByRole("heading", { name: "un conto" });
    const promptTop = () =>
      prompt.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const beforeReveal = await promptTop();
    await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();
    await expect(page.getByText("rachunek", { exact: true })).toBeVisible();
    await frame("W07");
    expect(Math.abs((await promptTop()) - beforeReveal)).toBeLessThan(2);
    await page.getByRole("button", { name: "Dobrze", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pokaż odpowiedź" }),
    ).toBeVisible();
    await page.getByText("Ustawienia nauki", { exact: true }).click();
    await frame("W09");
    await page.getByText("Ustawienia nauki", { exact: true }).click();
    await page.getByRole("button", { name: "Zakończ sesję" }).click();
    await expect(
      page.getByRole("heading", { name: "Sesja zakończona." }),
    ).toBeVisible();
    await frame("W08");
    await page.getByRole("link", { name: "Wróć do zestawu" }).click();
    await expect(
      page.getByRole("button", { name: "Edytuj fiszkę" }),
    ).toBeVisible();
    await frame("W04");
    const index = page.getByRole("region", { name: "Biblioteka" });
    if (mobile) await expect(index).toBeHidden();
    else
      await expect(index.locator('button[aria-current="true"]')).toContainText(
        "Włoski w kawiarni",
      );
    await page.getByRole("button", { name: "Wróć do zestawów" }).click();
    await expect(
      page.getByRole("button", { name: /Włoski w kawiarni/ }),
    ).toBeVisible();
    await frame("W02");
    await page.getByRole("link", { name: "Importuj CSV" }).click();
    await frame("W10");
    await page.getByLabel("Nazwa zestawu").fill("Z pliku");
    await page.getByLabel("Plik CSV").setInputFiles({
      name: "kawiarnia.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("side_a,side_b\nil tavolo,stolik"),
    });
    await page.getByRole("button", { name: "Pokaż podgląd" }).click();
    await expect(page.getByText("Wiersz 2 · Gotowy do importu")).toBeVisible();
    await frame("W11");
    await page.getByRole("button", { name: "Zatwierdź import" }).click();
    await expect(
      page.getByRole("heading", { name: "Import zakończony", exact: true }),
    ).toBeVisible();
    await frame("W12");
    expect(frames.size).toBe(18);
    await page.getByRole("button", { name: "Importuj kolejny plik" }).click();
    await page.getByRole("radio", { name: "Istniejący zestaw" }).check();
    await page
      .getByLabel("Zestaw docelowy")
      .selectOption({ label: "Włoski w kawiarni" });
    await page.getByLabel("Plik CSV").setInputFiles({
      name: "decyzje.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "side_a,side_b,example_a\nun conto,konto,\nun conto,rachunek,Il conto per favore\n" +
          Array.from({ length: 22 }, (_, i) => `słowo ${i},opis ${i},`).join(
            "\n",
          ),
      ),
    });
    await page.getByRole("button", { name: "Pokaż podgląd" }).click();
    for (const [row, kind] of [
      [2, "Inna odpowiedź"],
      [3, "Inny przykład"],
    ] as const) {
      await page
        .getByText("Wiersz " + row + " · " + kind, { exact: true })
        .click();
      if (row === 2) {
        const comparison = page
          .locator("details[open]")
          .filter({ has: page.getByLabel("Akcja wiersza 2", { exact: true }) });
        await expect(
          comparison.getByText("W zestawie", { exact: true }),
        ).toBeVisible();
        await expect(
          comparison.getByText("rachunek", { exact: true }),
        ).toBeVisible();
        await comparison.screenshot({
          path: info.outputPath("W11-conflict.png"),
          scale: "css",
        });
      }
      await page
        .getByLabel("Akcja wiersza " + row, { exact: true })
        .selectOption("skip");
    }
    await page.getByRole("button", { name: "Następna" }).click();
    await expect(page.getByText("Strona 2 z 2")).toBeVisible();
    await page.getByRole("button", { name: "Poprzednia" }).click();
    await expect(
      page.getByLabel("Akcja wiersza 2", { exact: true }),
    ).toHaveValue("skip");
    // Interrupt only this browser's import after its first committed card.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      let writes = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "cards" && ++writes === 2) {
          IDBObjectStore.prototype.put = put;
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return put.apply(this, args);
      };
    });
    await page.getByRole("button", { name: "Zatwierdź import" }).click();
    await expect(
      page.getByRole("heading", { name: "Import wstrzymany" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Zakończ import" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (mobile) {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Zakończ import" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Import zakończony częściowo" }),
      ).toBeVisible();
    } else {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Anuluj" })
        .click();
      await page.getByRole("button", { name: "Wznów import" }).click();
      await expect(
        page.getByRole("heading", { name: "Import zakończony", exact: true }),
      ).toBeVisible();
    }
  } finally {
    await request.delete(admin + "/" + id, { headers });
  }
});
