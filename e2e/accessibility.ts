import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

export async function expectAccessible(page: Page, state: string) {
  await page.evaluate(() => document.fonts.ready);
  const { violations, incomplete } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const info = test.info();
  function findings(results: typeof violations) {
    return results.map(({ id, help, nodes, tags }) => ({
      id,
      help,
      tags,
      nodes: nodes.map(({ target, failureSummary }) => ({
        target,
        reason: failureSummary ?? help,
      })),
    }));
  }
  const report = {
    scenario: info.title,
    profile: info.project.name,
    state,
    violations: findings(violations),
    incomplete: findings(incomplete),
  };
  const path = info.outputPath("axe-" + state + ".json");
  await writeFile(path, JSON.stringify(report, null, 2));
  await info.attach("axe-" + state, { path, contentType: "application/json" });
  expect(report.violations, state).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
