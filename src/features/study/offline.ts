import type { SyncStatus } from "@/sync/controller";
export const offlineAccountCookie = "recallio-offline-account";

export function savedOfflineAccount(): string | undefined {
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${offlineAccountCookie}=`))
    ?.slice(offlineAccountCookie.length + 1);
}

export async function registerStudyWorker() {
  if (!("serviceWorker" in navigator)) return;
  const existing = await navigator.serviceWorker.getRegistration();
  return (
    existing ??
    (navigator.onLine
      ? await navigator.serviceWorker.register("/study-sw.js", {
          updateViaCache: "none",
        })
      : undefined)
  );
}

export async function prepareStudyShell(): Promise<
  "ready" | "quota" | "unavailable"
> {
  try {
    const registration = await registerStudyWorker();
    if (!registration) return "unavailable";
    const worker =
      registration.active ?? registration.installing ?? registration.waiting;
    if (!worker) return "unavailable";
    const channel = new MessageChannel();
    return await new Promise<"ready" | "quota" | "unavailable">((resolve) => {
      const finish = (ready: "ready" | "quota" | "unavailable") => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(ready);
      };
      const timer = setTimeout(() => finish("unavailable"), 15000);
      channel.port1.onmessage = ({ data }) =>
        finish(
          data === "study-ready"
            ? "ready"
            : data === "quota"
              ? "quota"
              : "unavailable",
        );
      worker.postMessage("prepare-study", [channel.port2]);
    });
  } catch {
    return "unavailable";
  }
}

type OfflineResult = "ready" | "quota" | "unavailable";
export const offlineErrors = {
  quota: "Brakuje miejsca na urządzeniu. Zwolnij miejsce i spróbuj ponownie.",
  unavailable:
    "Nie udało się przygotować zestawu offline. Sprawdź połączenie i ponów próbę.",
};
export async function prepareDeckOffline(
  deckId: string,
  sync: { run(force: boolean): Promise<SyncStatus> },
  repository: { markOfflineDeck(id: string): Promise<void> },
): Promise<{ status: SyncStatus; result: OfflineResult }> {
  let status: SyncStatus = "failed";
  try {
    status = await sync.run(true);
    if (status !== "idle")
      return { status, result: status === "quota" ? "quota" : "unavailable" };
    const result = await prepareStudyShell();
    if (result === "ready") await repository.markOfflineDeck(deckId);
    return { status, result };
  } catch (error) {
    return {
      status,
      result:
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "quota"
          : "unavailable",
    };
  }
}

export function activateStudyUpdate(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (activated: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(activated);
    };
    const onChange = () => {
      if (navigator.serviceWorker.controller === worker) finish(true);
    };
    const timer = setTimeout(() => finish(false), 15000);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    channel.port1.onmessage = () => finish(false);
    try {
      worker.postMessage("activate-update", [channel.port2]);
    } catch {
      finish(false);
    }
    onChange();
  });
}
