import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PUSH_BYTES,
  parsePushBody,
  pushSchema,
  revisionSchema,
} from "../src/contracts";
const id = "4bf3cb96-c339-4991-83ba-38d8c7279100";
const sample = {
  protocolVersion: 1,
  deviceId: id,
  operations: [
    {
      id,
      entityId: id,
      type: "review.record",
      payload: {
        direction: "a-b",
        rating: 3,
        observedMode: "introduction",
        occurredAt: "2026-11-17T12:00:00Z",
        clientSeq: "9007199254740993",
        observedContentRevision: "1",
        observedProgressRevision: null,
        epoch: "0",
        algorithmVersion: "example-v1",
      },
    },
  ],
};
test("review envelope preserves bigint and accepts first review", () => {
  assert.deepEqual(parsePushBody(JSON.stringify(sample)), sample);
});
test("rejects identity spoofing, invalid identifiers, rating, time and protocol", () => {
  for (const value of [
    { ...sample, userId: id },
    { ...sample, deviceId: "bad" },
    { ...sample, protocolVersion: 2 },
    {
      ...sample,
      operations: [
        {
          ...sample.operations[0],
          payload: { ...sample.operations[0].payload, rating: 5 },
        },
      ],
    },
    {
      ...sample,
      operations: [
        {
          ...sample.operations[0],
          payload: {
            ...sample.operations[0].payload,
            occurredAt: "not-a-date",
          },
        },
      ],
    },
  ])
    assert.equal(pushSchema.safeParse(value).success, false);
});
test("rejects oversized requests, operations and bigint overflows", () => {
  assert.throws(
    () => parsePushBody("x".repeat(MAX_PUSH_BYTES + 1)),
    /payload_too_large/,
  );
  assert.equal(
    pushSchema.safeParse({
      ...sample,
      operations: Array(101).fill(sample.operations[0]),
    }).success,
    false,
  );
  assert.equal(revisionSchema.safeParse("9223372036854775808").success, false);
});
