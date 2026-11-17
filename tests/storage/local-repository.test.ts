import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalRepository } from "../../src/storage/local-repository";
import type { PreparedReview } from "../../src/contracts";
const card = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const device = "00000000-0000-4000-8000-000000000003";
const at = "2026-11-17T12:00:00.000Z";
const payload = {
  direction: "a-b",
  rating: 3,
  observedMode: "introduction",
  occurredAt: at,
  clientSeq: "1",
  observedContentRevision: "1",
  observedProgressRevision: null,
  epoch: "0",
  algorithmVersion: "test",
} as const;
const command: PreparedReview = {
  event: { id, cardId: card, deviceId: device, ...payload },
  operation: { id, type: "review.record", entityId: card, payload },
  progress: {
    cardId: card,
    direction: "a-b",
    epoch: "0",
    dueAt: at,
    lastEffectiveAt: at,
    revision: "1",
    algorithmVersion: "test",
    schedulerState: { version: "test", data: {} },
  },
};
function repo(userId: string, fail = false) {
  return createLocalRepository({
    userId,
    now: () => new Date(at),
    introduction: () => {
      if (fail) throw Error("injected");
      return { cardId: card, firstEffectiveAt: at, studyDay: "2026-11-17" };
    },
  });
}
test("failure rolls back and retry preserves ID; leases expire; account databases are separate", async () => {
  const a = "00000000-0000-4000-8000-000000000011",
    b = "00000000-0000-4000-8000-000000000012";
  const failing = repo(a, true);
  await assert.rejects(failing.commitReview(command));
  failing.close();
  const first = repo(a),
    second = repo(a),
    other = repo(b);
  const [one, two] = await Promise.all([
    first.commitReview(command),
    second.commitReview(command),
  ]);
  assert.deepEqual(one, two);
  assert.equal((await other.lease("other", 0, 100, 10)).length, 0);
  const leases = await Promise.all([
    first.lease("a", 0, 100, 10),
    second.lease("b", 0, 100, 10),
  ]);
  assert.equal(leases[0].length + leases[1].length, 1);
  assert.equal((await second.lease("b", 100, 100, 10)).length, 1);
  await assert.rejects(
    first.commitReview({ ...command, event: { ...command.event, rating: 4 } }),
  );
  first.close();
  second.close();
  other.close();
});
