import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoRepository } from "../src/storage/demo-repository";
import { presentCard, nextIndex, type Review } from "../src/domain/cards";
test("reverse direction shows the answer-side example", () => {
  assert.deepEqual(
    presentCard(
      { id: "1", sideA: "apple", sideB: "jabłko", exampleA: "An apple." },
      "b-a",
    ),
    { question: "jabłko", answer: "apple", example: "An apple." },
  );
});
test("continuous demo queue wraps and rejects an empty set", () => {
  assert.equal(nextIndex(5, 6), 0);
  assert.throws(() => nextIndex(0, 0));
});
test("concurrent retries persist one review, reopening preserves it", async () => {
  const name = `test-${crypto.randomUUID()}`;
  const repository = createDemoRepository(name);
  const review: Review = {
    id: "operation-1",
    cardId: "card-1",
    direction: "a-b",
    rating: 3,
    answeredAt: "2026-11-17T12:00:00Z",
  };
  await Promise.all([repository.save(review), repository.save(review)]);
  assert.equal(await createDemoRepository(name).count(), 1);
  await repository.save({ ...review, id: "operation-2", direction: "b-a" });
  assert.equal(await repository.count(), 2);
});
