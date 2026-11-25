import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw Error("Podaj katalog docelowy jako argument.");
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const read = (name) => readFile(resolve(here, name), "utf8");
const embed = async (path, type) =>
  "data:" +
  type +
  ";base64," +
  (await readFile(resolve(here, path))).toString("base64");
let html = await read("index.html");
for (const [tag, name] of html.matchAll(
  /<link rel="stylesheet" href="([^"]+)"\s*\/?\s*>/g,
)) {
  let css = await read(name);
  for (const [url, path] of css.matchAll(/url\("([^"]+\.woff2)"\)/g)) {
    css = css.replace(url, 'url("' + (await embed(path, "font/woff2")) + '")');
  }
  html = html.replace(tag, () => "<style>\n" + css + "\n</style>");
}
for (const [tag, name] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  let js = await read(name);
  if (js.includes("../../public/ejiri.webp"))
    js = js.replace(
      "../../public/ejiri.webp",
      await embed("../../public/ejiri.webp", "image/webp"),
    );
  html = html.replace(tag, () => "<script>\n" + js + "\n</script>");
}
const license = await Promise.all(
  ["@fontsource/instrument-serif", "@fontsource-variable/manrope"].map((pkg) =>
    read("../../node_modules/" + pkg + "/LICENSE"),
  ),
);
html = html.replace(
  "</head>",
  () =>
    "<!-- Bundled typeface licenses\n" +
    license.join("\n").replaceAll("--", "—") +
    "\n-->\n</head>",
);
const file = join(output, "Recallio.html");
await writeFile(file, html);
const url = pathToFileURL(file).href;
const browser = await chromium.launch({ headless: true });
try {
  const index = await browser.newPage();
  const errors = new Set();
  const listen = (page) =>
    page.on("pageerror", (error) => errors.add(error.message));
  listen(index);
  await index.goto(url + "#frame/W01/due");
  await index.waitForSelector('[data-view="W01"]');
  const catalog = await index.evaluate(() =>
    [...views.values()].map(({ id, title, states }) => ({ id, title, states })),
  );
  const jobs = catalog.flatMap((v) =>
    Object.entries(v.states).map(([key, title]) => ({
      id: v.id,
      view: v.title,
      key,
      title,
    })),
  );
  const lines = ["Widok,Stan,Wariant,Plik"];
  const sizes = [
    [390, 844, "mobile"],
    [1440, 900, "desktop"],
    [320, 844, "compact"],
    [768, 900, "tablet"],
  ];
  const overflow = [];
  async function inspect(size) {
    const [width, height, device] = size;
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    listen(page);
    for (const { id, key, title } of jobs) {
      const path = device + "/" + id + "/" + key + ".png";
      await page.goto(url + "#frame/" + id + "/" + key);
      await page.waitForFunction(
        ([id, key]) => {
          const root = document.querySelector("#root");
          return root?.dataset.view === id && root.dataset.state === key;
        },
        [id, key],
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((i) => i.decode()));
        if (
          !document.fonts.check("16px Manrope") ||
          !document.fonts.check('24px "Instrument Serif"')
        )
          throw Error("Brak fontu");
      });
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      if (scroll > width + 1)
        overflow.push(id + "/" + key + " @" + width + " → " + scroll);
      if (device === "desktop" || device === "mobile") {
        await mkdir(join(output, device, id), { recursive: true });
        await page.screenshot({
          path: join(output, path),
          fullPage: true,
          animations: "disabled",
          timeout: 15000,
        });
        lines.push([id, title, device, path].join(","));
      }
    }
    await page.close();
  }
  await Promise.all(sizes.map(inspect));
  if (errors.size || overflow.length)
    throw Error(JSON.stringify({ errors: [...errors], overflow }));
  await writeFile(
    join(output, "indeks.csv"),
    "\uFEFF" + [lines.shift(), ...lines.sort()].join("\r\n"),
  );
  console.log(
    catalog.length +
      " widoków, " +
      jobs.length +
      " stanów, " +
      2 * jobs.length +
      " PNG. Szerokości 320/390/768/1440 bez przepełnienia.",
  );
} finally {
  await browser.close();
}
