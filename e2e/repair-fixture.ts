import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { FSRS_VERSION } from "../src/domain/learning/scheduler";
import type { Operation } from "../src/contracts";
export async function seedDifficultCard(
  api: APIRequestContext,
  origin: string,
) {
  const deckId = randomUUID(),
    cardId = randomUUID(),
    deviceId = randomUUID();
  let seq = 0;
  const instant = (days: number, minutes = 0) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    date.setUTCHours(12, minutes, 0, 0);
    return date.toISOString();
  };
  async function push(operations: Operation[], device = deviceId) {
    const result = await api.post("/api/v1/sync/push", {
      headers: { origin },
      data: { protocolVersion: 1, deviceId: device, operations },
    });
    expect(result.ok()).toBe(true);
    const { results } = await result.json();
    for (const receipt of results)
      expect(["applied", "duplicate"]).toContain(receipt.status);
    return results;
  }
  function review(days: number, minutes = 0): Operation {
    return {
      id: randomUUID(),
      entityId: cardId,
      type: "review.record",
      payload: {
        direction: "a-b",
        epoch: "0",
        rating: 1,
        observedMode: seq ? "due" : "introduction",
        occurredAt: instant(days, minutes),
        clientSeq: String(++seq),
        observedContentRevision: "0",
        observedProgressRevision: null,
        algorithmVersion: FSRS_VERSION,
      },
    };
  }
  await push([
    {
      id: randomUUID(),
      type: "deck.create",
      entityId: deckId,
      payload: { name: "Rozmówki", directionMode: "a-b" },
    },
    {
      id: randomUUID(),
      type: "card.create",
      entityId: cardId,
      payload: {
        deckId,
        sideA: "domani",
        sideB: "jutro",
        exampleA: null,
        exampleB: null,
      },
    },
    review(6),
    review(5),
    review(4),
  ]);
  const duplicate = review(4, 30);
  const otherDevice = randomUUID();
  await push([duplicate], otherDevice);
  await push([duplicate], otherDevice);
  return { cardId, deckId, push, third: () => push([review(1)]) };
}
