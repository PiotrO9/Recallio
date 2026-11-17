import { openDB, type DBSchema } from "idb";
import type { Review } from "../domain/cards";
interface DemoSchema extends DBSchema {
  reviews: { key: string; value: Review };
}
export interface DemoRepository {
  save(review: Review): Promise<void>;
  count(): Promise<number>;
}
export function createDemoRepository(
  name = "recallio-demo-v1",
): DemoRepository {
  const connect = () =>
    openDB<DemoSchema>(name, 1, {
      upgrade(db) {
        db.createObjectStore("reviews", { keyPath: "id" });
      },
    });
  return {
    async save(review) {
      const db = await connect();
      try {
        const tx = db.transaction("reviews", "readwrite");
        const existing = await tx.store.get(review.id);
        if (!existing) await tx.store.add(review);
        await tx.done;
      } finally {
        db.close();
      }
    },
    async count() {
      const db = await connect();
      try {
        return await db.count("reviews");
      } finally {
        db.close();
      }
    },
  };
}
