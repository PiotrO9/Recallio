import { chromium } from "@playwright/test";
import { build } from "esbuild";
async function measureQueue(size) {
  const userId = crypto.randomUUID(),
    repo = BenchStorage.createLocalRepository({
      userId,
      now: () => new Date(),
      introduction() {
        throw new Error("Unexpected review during an outbox benchmark");
      },
    });
  await repo.readWorkspace();
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("recallio-user-" + userId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction("outbox", "readwrite");
  const entities = Array.from({ length: 20 }, () => crypto.randomUUID());
  for (let i = 0; i < size; i++)
    tx.objectStore("outbox").add({
      operation: {
        id: crypto.randomUUID(),
        type: "deck.update",
        baseRevision: "0",
        entityId: entities[i % entities.length],
        payload: { name: "Zestaw", directionMode: "a-b" },
      },
      sequence: i + 1,
      deliveryUnknown: false,
      state: "pending",
    });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  const start = performance.now();
  for (let i = 0; i < size; i++) {
    const [op] = await repo.lease("benchmark", Date.now(), 30000, 1, true);
    if (op?.sequence !== i + 1) throw new Error("Out of order");
    await repo.acknowledge({
      operationId: op.operation.id,
      status: "applied",
      commitCursor: String(i + 1),
      revision: "1",
    });
  }
  const elapsed = Math.round(performance.now() - start);
  repo.close();
  db.close();
  return elapsed;
}

const bundle = await build({
  entryPoints: ["src/storage/local-repository.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "BenchStorage",
  write: false,
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("http://127.0.0.1:3999/**", (r) =>
    r.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("http://127.0.0.1:3999");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  // Measure IndexedDB leasing and acknowledgement, independent of network latency.
  for (const size of [100, 1000]) {
    const times = [];
    for (let trial = 0; trial < 3; trial++) {
      times.push(await page.evaluate(measureQueue, size));
    }
    console.log(
      `${size} operations, median ${[...times].sort((a, b) => a - b)[1]} ms (${times.join(", ")} ms)`,
    );
  }
} finally {
  await browser.close();
}
