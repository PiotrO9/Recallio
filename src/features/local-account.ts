import { getStudyDay } from "@/domain/learning/study-time";
import { createLocalRepository } from "@/storage/local-repository";
import { createSyncController } from "@/sync/controller";
export function openLocalAccount(userId: string) {
  const repository = createLocalRepository({
    userId,
    now: () => new Date(),
    introduction: (event) => ({
      cardId: event.cardId,
      firstEffectiveAt: event.occurredAt,
      studyDay: getStudyDay(event.occurredAt),
    }),
  });
  const sync = createSyncController({
    userId,
    repository,
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
    random: Math.random,
    id: () => crypto.randomUUID(),
    online: () => navigator.onLine,
  });
  return { repository, sync };
}
