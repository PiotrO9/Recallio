import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

test("real Chromium IndexedDB serializes competing tabs and preserves retries", async () => {
  const bundle = await build({
    entryPoints: ["src/storage/local-repository.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "LocalStorageTest",
    write: false,
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route("http://recallio.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>storage test</title>",
      }),
    );
    const pages = await Promise.all([context.newPage(), context.newPage()]);
    for (const page of pages) {
      await page.goto("http://recallio.test/");
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(() => {
        const userId = "00000000-0000-4000-8000-000000000081";
        const cardId = "00000000-0000-4000-8000-000000000082";
        globalThis.repo = globalThis.LocalStorageTest.createLocalRepository({
          userId,
          now: () => new Date("2026-11-17T12:00:00.000Z"),
          introduction: () => ({
            cardId,
            firstEffectiveAt: "2026-11-17T12:00:00.000Z",
            studyDay: "2026-11-17",
          }),
        });
      });
    }
    const make = (n) => {
      const id = `00000000-0000-4000-8000-${String(90 + n).padStart(12, "0")}`;
      const cardId = "00000000-0000-4000-8000-000000000082";
      const payload = {
        direction: "a-b",
        rating: 3,
        observedMode: n === 1 ? "introduction" : "due",
        occurredAt: "2026-11-17T12:00:00.000Z",
        clientSeq: String(n),
        observedContentRevision: "1",
        observedProgressRevision: n === 1 ? null : "1",
        epoch: "0",
        algorithmVersion: "test",
      };
      return {
        localVersion: n === 1 ? "0" : "1",
        event: {
          id,
          cardId,
          deviceId: "00000000-0000-4000-8000-000000000083",
          ...payload,
        },
        operation: { id, entityId: cardId, type: "review.record", payload },
        progress: {
          cardId,
          direction: "a-b",
          epoch: "0",
          dueAt: `2026-11-${17 + n}T12:00:00.000Z`,
          lastEffectiveAt: "2026-11-17T12:00:00.000Z",
          revision: "1",
          algorithmVersion: "test",
          schedulerState: { version: "test", data: {} },
        },
      };
    };
    await pages[0].evaluate((c) => globalThis.repo.commitReview(c), make(1));
    const base = await pages[0].evaluate(() =>
      globalThis.repo.readProgressVersion(
        "00000000-0000-4000-8000-000000000082",
        "a-b",
      ),
    );
    const outcomes = await Promise.all(
      pages.map((page, i) =>
        page.evaluate(
          async ({ command, base }) => {
            try {
              await globalThis.repo.commitReviewFrom(
                command,
                base.progress,
                base.localVersion,
              );
              return "committed";
            } catch {
              return "rejected";
            }
          },
          { command: make(i + 2), base },
        ),
      ),
    );
    const winner = outcomes.indexOf("committed");
    assert.deepEqual([...outcomes].sort(), ["committed", "rejected"]);
    await pages[winner].evaluate(
      ({ command, base }) =>
        globalThis.repo.commitReviewFrom(
          command,
          base.progress,
          base.localVersion,
        ),
      { command: make(winner + 2), base },
    );
    const leases = await Promise.all(
      pages.map((page, i) =>
        page.evaluate(
          async (owner) =>
            (await globalThis.repo.lease(owner, 0, 100, 10)).length,
          `tab${i}`,
        ),
      ),
    );
    assert.equal(leases[0] + leases[1], 2);
    await Promise.all(
      pages.map((page) => page.evaluate(() => globalThis.repo.close())),
    );
    await context.close();
  } finally {
    await browser.close();
  }
});
