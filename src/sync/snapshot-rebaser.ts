import { fsrsScheduler, resetFsrsProgress } from "../domain/learning/scheduler";
import { createSnapshotRebaser } from "../storage/snapshot-rebase";

export const rebaseSnapshot = createSnapshotRebaser(
  fsrsScheduler,
  resetFsrsProgress,
);
