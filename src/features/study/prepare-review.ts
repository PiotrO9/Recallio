import type { Candidate, PreparedReview, Progress, Rating } from "@/contracts";
import {
  FSRS_VERSION,
  fsrsScheduler,
  getEffectiveReviewTime,
} from "@/domain/learning/scheduler";
import type { createLocalRepository } from "@/storage/local-repository";

type ReviewSource = Pick<
  ReturnType<typeof createLocalRepository>,
  "readProgressVersion" | "getDeviceId" | "reserveReviewSequence"
>;
function reviewContext(previous: Progress | null, occurredAt: string) {
  const effectiveAt = getEffectiveReviewTime(occurredAt, occurredAt, previous);
  return {
    previous,
    effectiveAt,
    mode: fsrsScheduler.classify(previous, effectiveAt),
  };
}
export async function prepareReview(
  repository: ReviewSource,
  { card, direction, epoch }: Candidate,
  rating: Rating,
  now: () => string,
  id: () => string,
): Promise<PreparedReview> {
  const { progress, localVersion } = await repository.readProgressVersion(
    card.id,
    direction,
  );
  const occurredAt = now();
  const context = reviewContext(progress, occurredAt);
  const payload = {
    direction,
    rating,
    observedMode: context.mode,
    occurredAt,
    clientSeq: await repository.reserveReviewSequence(),
    observedContentRevision: card.contentRevision,
    observedProgressRevision: progress?.revision ?? null,
    epoch,
    algorithmVersion: FSRS_VERSION,
  };
  const event = {
    ...payload,
    id: id(),
    cardId: card.id,
    deviceId: await repository.getDeviceId(id),
  };
  return {
    event,
    localVersion,
    operation: {
      id: event.id,
      entityId: card.id,
      type: "review.record",
      payload,
    },
    progress: fsrsScheduler.review({ ...context, event }),
  };
}
export async function reprojectReview(
  repository: ReviewSource,
  command: PreparedReview,
): Promise<PreparedReview> {
  const { event } = command;
  const { progress, localVersion } = await repository.readProgressVersion(
    event.cardId,
    event.direction,
  );
  return {
    ...command,
    localVersion,
    progress: fsrsScheduler.review({
      ...reviewContext(progress, event.occurredAt),
      event,
    }),
  };
}
