import type { Page } from "@playwright/test";

export async function holdStore(
  page: Page,
  userId: string,
  storeName: "progress" | "cards",
) {
  await page.evaluate(
    ([userId, storeName]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("recallio-user-" + userId);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          let hold = true;
          window.addEventListener(
            "release-test-store",
            () => {
              hold = false;
            },
            { once: true },
          );
          function keepOpen() {
            store.count().onsuccess = () => {
              resolve();
              if (hold) keepOpen();
            };
          }
          transaction.oncomplete = () => db.close();
          keepOpen();
        };
      }),
    [userId, storeName] as const,
  );
  return () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event("release-test-store"));
    });
}
