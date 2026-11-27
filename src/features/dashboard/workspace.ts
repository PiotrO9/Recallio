import type { SnapshotData } from "@/storage/local-repository";
import { listDashboardDecks, recommend } from "./recommendation";
export { openLocalAccount as openDashboardAccount } from "../local-account";

export function dashboardLibrary(data: SnapshotData) {
  return {
    decks: listDashboardDecks(data),
    recommend: (now: string, prepared?: ReadonlySet<string>) =>
      recommend(data, now, prepared),
  };
}
export type DashboardLibrary = ReturnType<typeof dashboardLibrary>;
