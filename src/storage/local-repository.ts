import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  uuidSchema,
  reviewEventSchema,
  progressSchema,
  operationSchema,
  introductionSchema,
  type Card,
  type CommitReceipt,
  type Introduction,
  type LearningRepository,
  type PreparedReview,
  type Progress,
  type ReviewEvent,
} from "../contracts";

type OutboxItem = {
  operation: PreparedReview["operation"];
  state: "pending" | "leased" | "blocked";
  leaseOwner?: string;
  leaseUntil?: number;
};
interface Schema extends DBSchema {
  cards: { key: string; value: Card };
  progress: { key: [string, string]; value: Progress };
  reviews: {
    key: string;
    value: {
      event: ReviewEvent;
      command: PreparedReview;
      receipt: CommitReceipt;
    };
  };
  introductions: { key: string; value: Introduction };
  outbox: { key: string; value: OutboxItem };
  meta: { key: string; value: unknown };
}
export interface LocalOptions {
  userId: string;
  now: () => Date;
  introduction: (event: ReviewEvent) => Introduction;
  blocked?: () => void;
  blocking?: () => void;
}

/** A separate database per authenticated account; it is never the demo database. */
export function createLocalRepository(
  options: LocalOptions,
): LearningRepository & {
  lease(
    owner: string,
    now: number,
    duration: number,
    limit: number,
  ): Promise<OutboxItem[]>;
  releaseLease(owner: string): Promise<void>;
  close(): void;
} {
  const userId = uuidSchema.parse(options.userId);
  let connection: Promise<IDBPDatabase<Schema>> | undefined;
  const connect = () => {
    if (!connection) {
      const opened = openDB<Schema>(`recallio-user-${userId}`, 1, {
        upgrade(db) {
          db.createObjectStore("cards", { keyPath: "id" });
          db.createObjectStore("progress", {
            keyPath: ["cardId", "direction"],
          });
          db.createObjectStore("reviews", { keyPath: "event.id" });
          db.createObjectStore("introductions", { keyPath: "cardId" });
          db.createObjectStore("outbox", { keyPath: "operation.id" });
          db.createObjectStore("meta");
        },
        blocked: options.blocked,
        blocking() {
          void opened.then((db) => db.close());
          connection = undefined;
          options.blocking?.();
        },
        terminated() {
          connection = undefined;
        },
      });
      connection = opened;
      void opened.catch(() => {
        if (connection === opened) connection = undefined;
      });
    }
    return connection;
  };
  return {
    async commitReview(command) {
      reviewEventSchema.parse(command.event);
      progressSchema.parse(command.progress);
      operationSchema.parse(command.operation);
      const { event, progress, operation } = command;
      const p = operation.payload;
      if (
        operation.id !== event.id ||
        operation.entityId !== event.cardId ||
        progress.cardId !== event.cardId ||
        progress.direction !== event.direction ||
        progress.epoch !== event.epoch ||
        progress.algorithmVersion !== event.algorithmVersion ||
        Object.entries(p).some(([k, v]) => event[k as keyof ReviewEvent] !== v)
      )
        throw new Error("Niespójne dane oceny");
      const db = await connect();
      const tx = db.transaction(
        ["reviews", "progress", "introductions", "outbox"],
        "readwrite",
      );
      try {
        const existing = await tx.objectStore("reviews").get(event.id);
        if (existing) {
          if (JSON.stringify(existing.command) !== JSON.stringify(command))
            throw new Error("Ponowne użycie identyfikatora");
          await tx.done;
          return existing.receipt;
        }
        const previous = await tx
          .objectStore("progress")
          .get([event.cardId, event.direction]);
        if (
          (previous?.revision ?? null) !== event.observedProgressRevision ||
          (previous && previous.epoch !== event.epoch)
        )
          throw new Error("Nieaktualny postęp");
        const receipt = {
          eventId: event.id,
          committedAt: options.now().toISOString(),
        };
        await tx.objectStore("reviews").add({ event, command, receipt });
        await tx.objectStore("progress").put(progress);
        if (
          event.observedMode === "introduction" &&
          !(await tx.objectStore("introductions").get(event.cardId))
        ) {
          const intro = introductionSchema.parse(options.introduction(event));
          if (intro.cardId !== event.cardId)
            throw new Error("Niespójne wprowadzenie");
          await tx.objectStore("introductions").add(intro);
        }
        await tx.objectStore("outbox").add({ operation, state: "pending" });
        await tx.done;
        return receipt;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async snapshot(deckId) {
      const db = await connect();
      const tx = db.transaction(["cards", "progress"], "readonly");
      const cards = (await tx.objectStore("cards").getAll()).filter(
        (card) => card.deckId === deckId && !card.deletedAt,
      );
      const ids = new Set(cards.map((card) => card.id));
      const progress = (await tx.objectStore("progress").getAll()).filter(
        (item) => ids.has(item.cardId),
      );
      await tx.done;
      return { cards, progress };
    },
    async lease(owner, now, duration, limit) {
      if (
        !owner ||
        !Number.isFinite(now) ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1
      )
        throw new Error("Nieprawidłowa dzierżawa");
      const db = await connect();
      const tx = db.transaction("outbox", "readwrite");
      const all = await tx.store.getAll();
      const selected = all
        .filter(
          (item) =>
            item.state === "pending" ||
            (item.state === "leased" && (item.leaseUntil ?? Infinity) <= now),
        )
        .slice(0, limit);
      for (const item of selected) {
        item.state = "leased";
        item.leaseOwner = owner;
        item.leaseUntil = now + duration;
        await tx.store.put(item);
      }
      await tx.done;
      return selected;
    },
    async releaseLease(owner) {
      const db = await connect();
      const tx = db.transaction("outbox", "readwrite");
      for (const item of await tx.store.getAll())
        if (item.state === "leased" && item.leaseOwner === owner) {
          delete item.leaseOwner;
          delete item.leaseUntil;
          item.state = "pending";
          await tx.store.put(item);
        }
      await tx.done;
    },
    close() {
      const opened = connection;
      connection = undefined;
      if (opened) void opened.then((db) => db.close());
    },
  };
}
