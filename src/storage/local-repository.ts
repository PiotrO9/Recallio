import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  uuidSchema,
  reviewEventSchema,
  progressSchema,
  operationSchema,
  introductionSchema,
  snapshotResponseSchema,
  type SnapshotResponse,
  type Operation,
  type Card,
  type CommitReceipt,
  type Introduction,
  type LearningRepository,
  type PreparedReview,
  type Progress,
  type ReviewEvent,
} from "../contracts";

export type OutboxItem = {
  operation: Operation;
  sequence: number;
  state: "pending" | "leased" | "blocked";
  leaseOwner?: string;
  leaseUntil?: number;
};
interface Schema extends DBSchema {
  cards: { key: string; value: Card };
  progress: { key: [string, string]; value: Progress };
  reviews: {
    key: string;
    indexes: { deviceSequence: [string, string] };
    value: {
      event: ReviewEvent;
      command: PreparedReview;
      receipt: CommitReceipt;
    };
  };
  introductions: { key: string; value: Introduction };
  outbox: { key: string; value: OutboxItem };
  meta: { key: string; value: unknown };
  decks: { key: string; value: SnapshotResponse["decks"][number] };
  settings: { key: string; value: NonNullable<SnapshotResponse["settings"]> };
  conflicts: { key: string; value: unknown };
  staging: { key: string; value: StagedSnapshot };
}
type StagedSnapshot = {
  token: string;
  watermark: string;
  nextPage: string | null;
  pages: SnapshotResponse[];
};
export type SnapshotData = Pick<
  SnapshotResponse,
  "decks" | "cards" | "progress" | "introductions" | "settings"
>;
export type RebaseSnapshot = (
  snapshot: SnapshotData,
  pending: readonly OutboxItem[],
) => { data: SnapshotData; handledOperationIds: readonly string[] };

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
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
  stageSnapshot(
    pageToken: string | null,
    page: SnapshotResponse,
  ): Promise<void>;
  activateSnapshot(token: string, rebase: RebaseSnapshot): Promise<void>;
  getCursor(): Promise<string | undefined>;
  readProgress(
    cardId: string,
    direction: Progress["direction"],
  ): Promise<Progress | null>;
  commitReviewFrom(
    command: PreparedReview,
    expected: Progress | null,
  ): Promise<CommitReceipt>;
  close(): void;
} {
  const userId = uuidSchema.parse(options.userId);
  let connection: Promise<IDBPDatabase<Schema>> | undefined;
  const connect = () => {
    if (!connection) {
      const opened = openDB<Schema>(`recallio-user-${userId}`, 2, {
        upgrade(db, oldVersion, _newVersion, tx) {
          void tx.done.catch(() => {});
          if (oldVersion < 1) {
            db.createObjectStore("cards", { keyPath: "id" });
            db.createObjectStore("progress", {
              keyPath: ["cardId", "direction"],
            });
            db.createObjectStore("reviews", { keyPath: "event.id" });
            db.createObjectStore("introductions", { keyPath: "cardId" });
            db.createObjectStore("outbox", { keyPath: "operation.id" });
            db.createObjectStore("meta");
          }
          if (oldVersion < 2) {
            tx.objectStore("reviews").createIndex(
              "deviceSequence",
              ["event.deviceId", "event.clientSeq"],
              { unique: true },
            );
            db.createObjectStore("decks", { keyPath: "id" });
            db.createObjectStore("settings");
            db.createObjectStore("conflicts");
            db.createObjectStore("staging", { keyPath: "token" });
            const store = tx.objectStore("outbox");
            let sequence = 0;
            void store
              .openCursor()
              .then(function migrate(cursor): void {
                if (!cursor) {
                  void tx
                    .objectStore("meta")
                    .put(sequence, "outboxSequence")
                    .catch(() => {});
                  return;
                }
                void cursor
                  .update({ ...cursor.value, sequence: ++sequence })
                  .catch(() => {});
                void cursor
                  .continue()
                  .then(migrate)
                  .catch(() => {});
              })
              .catch(() => {});
          }
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
      // The shared port carries no local base. Accept only the first review;
      // subsequent callers must use the local compare-and-swap extension.
      return this.commitReviewFrom(command, null);
    },
    async readProgress(cardId, direction) {
      const db = await connect();
      return (await db.get("progress", [cardId, direction])) ?? null;
    },
    async commitReviewFrom(command, expected) {
      reviewEventSchema.parse(command.event);
      progressSchema.parse(command.progress);
      operationSchema.parse(command.operation);
      if (expected !== null) progressSchema.parse(expected);
      const { event, progress, operation } = command;
      const p = operation.payload;
      if (
        operation.type !== "review.record" ||
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
        ["reviews", "progress", "introductions", "outbox", "meta"],
        "readwrite",
      );
      try {
        const existing = await tx.objectStore("reviews").get(event.id);
        if (existing) {
          if (canonical(existing.command) !== canonical(command))
            throw new Error("Ponowne użycie identyfikatora");
          await tx.done;
          return existing.receipt;
        }
        const previous = await tx
          .objectStore("progress")
          .get([event.cardId, event.direction]);
        if (canonical(previous ?? null) !== canonical(expected))
          throw new Error(
            "Lokalny postęp zmienił się; przelicz projekcję tej samej oceny",
          );
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
        const meta = tx.objectStore("meta");
        const sequence = Number((await meta.get("outboxSequence")) ?? 0) + 1;
        if (!Number.isSafeInteger(sequence))
          throw new Error("Wyczerpano kolejność outbox");
        await meta.put(sequence, "outboxSequence");
        await tx
          .objectStore("outbox")
          .add({ operation, sequence, state: "pending" });
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
      const selected: OutboxItem[] = [];
      for (const item of all.sort((a, b) => a.sequence - b.sequence)) {
        if (
          item.state === "blocked" ||
          (item.state === "leased" && (item.leaseUntil ?? Infinity) > now)
        )
          break;
        selected.push(item);
        if (selected.length === limit) break;
      }
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
    async stageSnapshot(pageToken, input) {
      const page = snapshotResponseSchema.parse(input);
      const db = await connect();
      const tx = db.transaction("staging", "readwrite");
      try {
        const staged = await tx.store.get(page.snapshotToken);
        if (!staged) {
          if (pageToken !== null)
            throw new Error("Brak pierwszej strony snapshotu");
          await tx.store.add({
            token: page.snapshotToken,
            watermark: page.watermark,
            nextPage: page.nextPage,
            pages: [page],
          });
        } else {
          const priorIndex =
            pageToken === null
              ? 0
              : staged.pages.findIndex(
                  (_, index) =>
                    index > 0 && staged.pages[index - 1].nextPage === pageToken,
                );
          if (priorIndex >= 0) {
            if (canonical(staged.pages[priorIndex]) !== canonical(page))
              throw new Error("Ponowne użycie tokenu strony z inną treścią");
            await tx.done;
            return;
          }
          if (
            staged.nextPage === null ||
            pageToken !== staged.nextPage ||
            page.watermark !== staged.watermark
          )
            throw new Error("Nieprawidłowa kolejność strony snapshotu");
          if (
            page.nextPage !== null &&
            (page.nextPage === pageToken ||
              staged.pages.some((p) => p.nextPage === page.nextPage))
          )
            throw new Error("Powtarzający się token strony");
          staged.pages.push(page);
          staged.nextPage = page.nextPage;
          await tx.store.put(staged);
        }
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async activateSnapshot(token, rebase) {
      const db = await connect();
      const tx = db.transaction(
        [
          "staging",
          "decks",
          "cards",
          "progress",
          "introductions",
          "settings",
          "outbox",
          "meta",
        ],
        "readwrite",
      );
      try {
        const staged = await tx.objectStore("staging").get(token);
        if (!staged || staged.nextPage !== null)
          throw new Error("Snapshot nie jest kompletny");
        const cursor = await tx.objectStore("meta").get("cursor");
        if (
          typeof cursor === "string" &&
          BigInt(staged.watermark) < BigInt(cursor)
        )
          throw new Error("Snapshot jest starszy od lokalnego kursora");
        const pages = staged.pages;
        const settings = pages.map((p) => p.settings).filter((s) => s !== null);
        if (settings.length > 1)
          throw new Error("Powtórzone ustawienia snapshotu");
        const data: SnapshotData = {
          decks: pages.flatMap((p) => p.decks),
          cards: pages.flatMap((p) => p.cards),
          progress: pages.flatMap((p) => p.progress),
          introductions: pages.flatMap((p) => p.introductions),
          settings: settings[0] ?? null,
        };
        const unique = (values: string[]) =>
          new Set(values).size === values.length;
        const check = (value: SnapshotData) => {
          const parsed = snapshotResponseSchema.parse({
            ...value,
            snapshotToken: token,
            watermark: staged.watermark,
            nextPage: null,
          });
          if (
            !unique(parsed.decks.map((v) => v.id)) ||
            !unique(parsed.cards.map((v) => v.id)) ||
            !unique(parsed.progress.map((v) => `${v.cardId}:${v.direction}`)) ||
            !unique(parsed.introductions.map((v) => v.cardId))
          )
            throw new Error("Powtórzony rekord snapshotu");
          return parsed;
        };
        const base = check(data);
        const pending = (await tx.objectStore("outbox").getAll()).sort(
          (a, b) => a.sequence - b.sequence,
        );
        const rebased = rebase(structuredClone(base), structuredClone(pending));
        const expectedIds = pending.map((item) => item.operation.id);
        if (
          rebased.handledOperationIds.length !== expectedIds.length ||
          expectedIds.some(
            (id, index) => rebased.handledOperationIds[index] !== id,
          )
        )
          throw new Error("Rebase nie uwzględnia całego outboxa w kolejności");
        const result = check(rebased.data);
        for (const card of base.cards.filter((c) => c.deletedAt)) {
          const rebased = result.cards.find((c) => c.id === card.id);
          if (!rebased?.deletedAt)
            throw new Error("Rebase przywraca usuniętą kartę");
        }
        for (const deck of base.decks.filter((d) => d.deletedAt)) {
          const rebased = result.decks.find((d) => d.id === deck.id);
          if (!rebased?.deletedAt)
            throw new Error("Rebase przywraca usunięty zestaw");
        }
        for (const name of [
          "decks",
          "cards",
          "progress",
          "introductions",
          "settings",
        ] as const)
          await tx.objectStore(name).clear();
        for (const value of result.decks)
          await tx.objectStore("decks").add(value);
        for (const value of result.cards)
          await tx.objectStore("cards").add(value);
        for (const value of result.progress)
          await tx.objectStore("progress").add(value);
        for (const value of result.introductions)
          await tx.objectStore("introductions").add(value);
        if (result.settings)
          await tx.objectStore("settings").put(result.settings, "current");
        await tx.objectStore("meta").put(staged.watermark, "cursor");
        await tx.objectStore("meta").put(token, "snapshotGeneration");
        await tx.objectStore("staging").delete(token);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async getCursor() {
      const db = await connect();
      return (await db.get("meta", "cursor")) as string | undefined;
    },
    close() {
      const opened = connection;
      connection = undefined;
      if (opened) void opened.then((db) => db.close());
    },
  };
}
