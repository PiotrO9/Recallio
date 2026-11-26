import type { Page } from "@playwright/test";
export async function failNextWorkspaceRead(page: Page) {
  await page.evaluate(() => {
    const read = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === "decks" && this.transaction.mode === "readonly") {
        IDBObjectStore.prototype.getAll = read;
        throw new DOMException("Read failed", "UnknownError");
      }
      return read.apply(this, args);
    };
  });
}
