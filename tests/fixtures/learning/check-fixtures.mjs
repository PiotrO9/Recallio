// Run with the absolute path to an independently installed ts-fsrs@5.4.2 package.
// This checks library reference values, not the unimplemented Recallio adapter.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const packageDir = process.argv[2];
assert.ok(packageDir, "Pass the absolute path to ts-fsrs@5.4.2");
const require = createRequire(import.meta.url);
const { version } = JSON.parse(
  await readFile(resolve(packageDir, "package.json"), "utf8"),
);
assert.equal(version, "5.4.2");
const fsrs = require(resolve(packageDir, "dist/index.cjs"));
const fixtures = JSON.parse(
  await readFile(new URL("./fsrs6-v1.json", import.meta.url), "utf8"),
);
assert.equal(fixtures.formatVersion, 2);
assert.equal(
  new Set(fixtures.cases.map((c) => c.id)).size,
  fixtures.cases.length,
);
for (const c of fixtures.cases) {
  assert.ok(c.initial && c.expected && c.events.length, c.id);
  for (const event of c.events) {
    assert.ok(Number.isFinite(Date.parse(event.occurredAt)), c.id);
    assert.ok(Number.isFinite(Date.parse(event.receivedAt)), c.id);
    assert.ok([1, 2, 3, 4].includes(event.rating), c.id);
  }
}
const find = (id) => fixtures.cases.find((c) => c.id === id);
const scheduler = fsrs.fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: false,
});
const introduction = find("introduction-good");
const firstEvent = introduction.events[0];
const start = new Date(firstEvent.occurredAt);
const base = scheduler.next(
  fsrs.createEmptyCard(start),
  start,
  firstEvent.rating,
).card;
function compare(card, expected) {
  assert.equal(card.due.toISOString(), expected.dueAt);
  if (expected.stability !== undefined)
    assert.equal(card.stability, expected.stability);
  if (expected.difficulty !== undefined)
    assert.equal(card.difficulty, expected.difficulty);
  if (expected.lapses !== undefined) assert.equal(card.lapses, expected.lapses);
}
compare(base, introduction.expected.progress[0]);
for (const id of ["on-time-review", "after-ten-days", "practice-forgotten"]) {
  const c = find(id);
  compare(
    scheduler.next(base, new Date(c.events[0].occurredAt), c.events[0].rating)
      .card,
    c.expected.progress[0],
  );
}
const again = find("introduction-forgotten-and-return");
compare(
  scheduler.next(fsrs.createEmptyCard(start), start, 1).card,
  again.expected.afterFirst,
);
assert.equal(find("twenty-fast-successes").events.length, 20);
console.log(
  "Fixture structure and five FSRS reference outcomes verified; adapter behavior remains untested.",
);
