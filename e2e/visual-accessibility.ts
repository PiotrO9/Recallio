import { writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

export const textSpacing =
  "* { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important } p { margin-block-end:2em !important }";

export async function expectUsableFocus(control: Locator) {
  await expect(control).toBeFocused();
  await expect
    .poll(() =>
      control.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return el.contains(document.elementFromPoint(x, y));
      }),
    )
    .toBe(true);
}

export async function expectReflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

export async function measureControl(
  control: Locator,
  state: string,
  options: { target?: boolean; border?: boolean; focus?: boolean } = {},
) {
  const sample = await control.evaluate((el) => {
    function channels(css: string) {
      const parts = css.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3)
        throw new Error("Unsupported computed color: " + css);
      return parts;
    }
    function over(front: number[], back: number[]) {
      const alpha = front[3] ?? 1;
      return back.map((v, i) => v * (1 - alpha) + front[i] * alpha);
    }
    function surface(node: Element | null): number[] {
      if (!node) return [255, 255, 255];
      const value = channels(getComputedStyle(node).backgroundColor);
      return value[3] === undefined || value[3] === 1
        ? value.slice(0, 3)
        : over(value, surface(node.parentElement));
    }
    const css = getComputedStyle(el),
      bg = surface(el),
      outside = surface(el.parentElement);
    const rect = el.getBoundingClientRect();
    return {
      text: over(channels(css.color), bg),
      bg,
      outside,
      border: over(channels(css.borderTopColor), outside),
      focus: over(channels(css.outlineColor), outside),
      width: rect.width,
      height: rect.height,
    };
  });
  const luminance = (rgb: number[]) =>
    rgb
      .map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i],
        0,
      );
  const ratio = (a: number[], b: number[]) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const ratios = {
    text: ratio(sample.text, sample.bg),
    borderInside: ratio(sample.border, sample.bg),
    borderOutside: ratio(sample.border, sample.outside),
    focus: ratio(sample.focus, sample.outside),
  };
  const path = test.info().outputPath("contrast-" + state + ".json");
  await writeFile(path, JSON.stringify({ state, ...sample, ratios }));
  await test
    .info()
    .attach("contrast-" + state, { path, contentType: "application/json" });
  expect(ratios.text, state).toBeGreaterThanOrEqual(4.5);
  if (options.border) {
    expect(ratios.borderInside, state).toBeGreaterThanOrEqual(3);
    expect(ratios.borderOutside, state).toBeGreaterThanOrEqual(3);
  }
  if (options.focus) expect(ratios.focus, state).toBeGreaterThanOrEqual(3);
  if (options.target) {
    expect(sample.width, state).toBeGreaterThanOrEqual(44);
    expect(sample.height, state).toBeGreaterThanOrEqual(44);
  }
}
