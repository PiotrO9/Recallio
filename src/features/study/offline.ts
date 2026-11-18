export const offlineAccountCookie = "recallio-offline-account";

export function savedOfflineAccount(): string | undefined {
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${offlineAccountCookie}=`))
    ?.slice(offlineAccountCookie.length + 1);
}

export async function prepareStudyShell(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register("/study-sw.js");
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return false;
    const channel = new MessageChannel();
    return await new Promise<boolean>((resolve) => {
      const finish = (ready: boolean) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(ready);
      };
      const timer = setTimeout(() => finish(false), 15000);
      channel.port1.onmessage = ({ data }) => finish(data === "study-ready");
      worker.postMessage("prepare-study", [channel.port2]);
    });
  } catch {
    return false;
  }
}
