import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";
import { createSnapshotRebaser, type ResetProjection } from "./snapshot-rebase";
import {
  uuidSchema,
  reviewEventSchema,
  progressSchema,
  operationSchema,
  operationResultSchema,
  revisionSchema,
  introductionSchema,
  snapshotResponseSchema,
  pullResponseSchema,
  deckSchema,
  cardSchema,
  settingsSchema,
  syncedReviewSchema,
  type SnapshotResponse,
  type PullResponse,
  type Operation,
  type OperationResult,
  type Card,
  type CommitReceipt,
  type ContentRecord,
  type ContentOperation,
  type ContentRepository,
  type ResetRepository,
  type Introduction,
  type LearningRepository,
  type PreparedReview,
  type Progress,
  type ReviewEvent,
} from "../contracts";
import type { z } from "zod";

export type OutboxItem = {
  operation: Operation;
  sequence: number;
  deliveryUnknown: boolean;
  state: "pending" | "leased" | "blocked" | "acknowledged";
  receipt?: OperationResult;
  receiptCursor?: string;
  leaseOwner?: string;
  leaseUntil?: number;
};

export class ReviewProjectionConflict extends Error {
  constructor() {
    super("Lokalny postęp zmienił się; przelicz projekcję tej samej oceny");
  }
}
interface Schema extends DBSchema {
  cards: { key: string; value: Card };
  progress: { key: [string, string]; value: Progress };
  progressVersions: {
    key: [string, string];
    value: {
      cardId: string;
      direction: Progress["direction"];
      version: string;
    };
  };
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
  syncedReviews: { key: string; value: z.infer<typeof syncedReviewSchema> };
  outbox: { key: string; value: OutboxItem };
  meta: { key: string; value: unknown };
  decks: { key: string; value: SnapshotResponse["decks"][number] };
  settings: { key: string; value: NonNullable<SnapshotResponse["settings"]> };
  conflicts: { key: string; value: unknown };
  staging: { key: string; value: StagedSnapshot };
  contentOperations: {
    key: string;
    value: { operation: Operation; expected: unknown; committedAt: string };
  };
}
type StagedSnapshot = {
  token: string;
  watermark: string;
  nextPage: string | null;
  pages: SnapshotResponse[];
  receiptGeneration: number;
  totalBytes?: number;
};
export type SnapshotData = Pick<
  SnapshotResponse,
  "decks" | "cards" | "progress" | "introductions" | "settings"
>;
export type StoredImport = {
  id: string;
  deckId: string;
  next: number;
  total: number;
};
export type ImportStep = {
  operation: ContentOperation;
  expected: ContentRecord;
};
const importKey = (id: string, index: number) => `csvImport:${id}:${index}`;
export type RebaseSnapshot = (
  snapshot: SnapshotData,
  pending: readonly OutboxItem[],
  local: {
    reviews: readonly ReviewEvent[];
    introductions: readonly Introduction[];
    decks: SnapshotData["decks"];
    cards: SnapshotData["cards"];
    settings: SnapshotData["settings"];
  },
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
  maxSnapshotBytes?: number;
  blocked?: () => void;
  blocking?: () => void;
}

/** A separate database per authenticated account; it is never the demo database. */
export function createLocalRepository(
  options: LocalOptions,
): LearningRepository &
  ContentRepository &
  ResetRepository & {
    lease(
      owner: string,
      now: number,
      duration: number,
      limit: number,
      rebaseUnsent?: boolean,
    ): Promise<OutboxItem[]>;
    releaseLease(owner: string): Promise<void>;
    acknowledge(result: OperationResult): Promise<void>;
    listBlocked(): Promise<OutboxItem[]>;
    getDeviceId(generate: () => string): Promise<string>;
    reserveReviewSequence(): Promise<string>;
    readWorkspace(): Promise<SnapshotData>;
    readImport(): Promise<StoredImport | null>;
    startImport(
      plan: Pick<StoredImport, "id" | "deckId"> & {
        steps: readonly ImportStep[];
      },
      expectedDeck: SnapshotData["decks"][number] | null,
      expectedCards: readonly Card[],
    ): Promise<void>;
    readImportStep(id: string, index: number): Promise<ImportStep>;
    forgetImport(id: string): Promise<void>;
    applyPullPage(expected: string, page: PullResponse): Promise<boolean>;
    clearForLogout(discardPending: boolean): Promise<number>;
    discardBlocked(operationId: string): Promise<void>;
    readContent(
      type: "deck" | "card" | "settings",
      id: string,
    ): Promise<ContentRecord>;
    commitContent(
      operation: Operation,
      expected: unknown,
      importStep?: { id: string; index: number },
    ): Promise<{ operationId: string; committedAt: string }>;
    commitReset(
      operation: Operation,
      expected: Progress,
      localVersion: string,
      reset: ResetProjection,
    ): Promise<{ operationId: string; committedAt: string }>;
    stageSnapshot(
      pageToken: string | null,
      page: SnapshotResponse,
      requestGeneration?: number,
    ): Promise<void>;
    beginSnapshot(): Promise<number>;
    discardSnapshot(token: string): Promise<void>;
    activateSnapshot(token: string, rebase: RebaseSnapshot): Promise<void>;
    getCursor(): Promise<string | undefined>;
    readProgress(
      cardId: string,
      direction: Progress["direction"],
    ): Promise<Progress | null>;
    readProgressVersion(
      cardId: string,
      direction: Progress["direction"],
    ): Promise<{ progress: Progress | null; localVersion: string }>;
    commitReviewFrom(
      command: PreparedReview,
      expected: Progress | null,
      localVersion: string,
    ): Promise<CommitReceipt>;
    close(): void;
  } {
  const userId = uuidSchema.parse(options.userId);
  const maxSnapshotBytes = options.maxSnapshotBytes ?? 32 * 1024 * 1024;
  if (!Number.isSafeInteger(maxSnapshotBytes) || maxSnapshotBytes <= 0)
    throw new Error("Nieprawidłowy limit snapshotu");
  let connection: Promise<IDBPDatabase<Schema>> | undefined;
  const connect = () => {
    if (!connection) {
      const opened = openDB<Schema>(`recallio-user-${userId}`, 7, {
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
          if (oldVersion < 7) {
            db.createObjectStore("syncedReviews", { keyPath: "event.id" });
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
                  .update({
                    ...cursor.value,
                    sequence: ++sequence,
                    deliveryUnknown: true,
                  })
                  .catch(() => {});
                void cursor
                  .continue()
                  .then(migrate)
                  .catch(() => {});
              })
              .catch(() => {});
          }
          if (oldVersion === 2) {
            const store = tx.objectStore("outbox");
            void store
              .openCursor()
              .then(function migrateDelivery(cursor): void {
                if (!cursor) return;
                void cursor
                  .update({ ...cursor.value, deliveryUnknown: true })
                  .catch(() => {});
                void cursor
                  .continue()
                  .then(migrateDelivery)
                  .catch(() => {});
              })
              .catch(() => {});
          }
          if (oldVersion === 3) {
            void tx
              .objectStore("outbox")
              .openCursor()
              .then(function migrateReceipts(cursor): void {
                if (!cursor) return;
                const item = cursor.value;
                if (item.state === "acknowledged") {
                  item.state = "pending";
                  item.deliveryUnknown = true;
                  delete item.receipt;
                  void cursor.update(item).catch(() => {});
                }
                void cursor
                  .continue()
                  .then(migrateReceipts)
                  .catch(() => {});
              })
              .catch(() => {});
          }
          if (oldVersion < 4)
            db.createObjectStore("progressVersions", {
              keyPath: ["cardId", "direction"],
            });
          if (oldVersion === 4) {
            void tx
              .objectStore("outbox")
              .openCursor()
              .then(function migrateCursor(cursor): void {
                if (!cursor) return;
                const item = cursor.value;
                if (item.state === "acknowledged") {
                  if (
                    item.receipt &&
                    item.receiptCursor &&
                    revisionSchema.safeParse(item.receiptCursor).success
                  ) {
                    item.receipt = {
                      ...item.receipt,
                      commitCursor: item.receiptCursor,
                    };
                  } else {
                    item.state = "pending";
                    item.deliveryUnknown = true;
                    delete item.receipt;
                    delete item.receiptCursor;
                  }
                  void cursor.update(item).catch(() => {});
                }
                void cursor
                  .continue()
                  .then(migrateCursor)
                  .catch(() => {});
              })
              .catch(() => {});
          }
          if (oldVersion < 6)
            db.createObjectStore("contentOperations", {
              keyPath: "operation.id",
            });
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
      const previous = await this.readProgress(
        command.event.cardId,
        command.event.direction,
      );
      return this.commitReviewFrom(command, previous, command.localVersion);
    },
    async readProgress(cardId, direction) {
      const db = await connect();
      return (await db.get("progress", [cardId, direction])) ?? null;
    },
    async readProgressVersion(cardId, direction) {
      const db = await connect();
      const tx = db.transaction(["progress", "progressVersions"], "readonly");
      const progress =
        (await tx.objectStore("progress").get([cardId, direction])) ?? null;
      const version = await tx
        .objectStore("progressVersions")
        .get([cardId, direction]);
      await tx.done;
      return { progress, localVersion: version?.version ?? "0" };
    },
    async commitReviewFrom(command, expected, localVersion) {
      reviewEventSchema.parse(command.event);
      progressSchema.parse(command.progress);
      operationSchema.parse(command.operation);
      if (expected !== null) progressSchema.parse(expected);
      if (localVersion !== command.localVersion)
        throw new Error("Niespójna lokalna wersja");
      if (!/^(0|[1-9]\d*)$/.test(localVersion))
        throw new Error("Nieprawidłowa lokalna wersja");
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
        [
          "reviews",
          "contentOperations",
          "progress",
          "progressVersions",
          "cards",
          "decks",
          "introductions",
          "outbox",
          "meta",
        ],
        "readwrite",
      );
      try {
        const existing = await tx.objectStore("reviews").get(event.id);
        if (existing) {
          const oldCommand = existing.command as PreparedReview & {
            localVersion?: string;
          };
          const comparable =
            oldCommand.localVersion === undefined
              ? { ...oldCommand, localVersion: command.localVersion }
              : oldCommand;
          if (canonical(comparable) !== canonical(command))
            throw new Error("Ponowne użycie identyfikatora");
          await tx.done;
          return existing.receipt;
        }
        if (await tx.objectStore("contentOperations").get(event.id))
          throw new Error("Ponowne użycie identyfikatora");
        const card = await tx.objectStore("cards").get(event.cardId);
        const deck = card && (await tx.objectStore("decks").get(card.deckId));
        const deleted = !!card?.deletedAt || !!deck?.deletedAt;
        const previous = await tx
          .objectStore("progress")
          .get([event.cardId, event.direction]);
        const version = await tx
          .objectStore("progressVersions")
          .get([event.cardId, event.direction]);
        if (
          !deleted &&
          ((version?.version ?? "0") !== localVersion ||
            canonical(previous ?? null) !== canonical(expected))
        )
          throw new ReviewProjectionConflict();
        if (
          !deleted &&
          ((!previous && event.observedProgressRevision !== null) ||
            (previous && previous.epoch !== event.epoch))
        )
          throw new Error("Nieaktualny postęp");
        const receipt = {
          eventId: event.id,
          committedAt: options.now().toISOString(),
        };
        await tx.objectStore("reviews").add({ event, command, receipt });
        if (!deleted) await tx.objectStore("progress").put(progress);
        if (!deleted)
          await tx.objectStore("progressVersions").put({
            cardId: event.cardId,
            direction: event.direction,
            version: (BigInt(localVersion) + 1n).toString(),
          });
        if (
          !deleted &&
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
        await tx.objectStore("outbox").add({
          operation,
          sequence,
          deliveryUnknown: false,
          state: "pending",
        });
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
      const tx = db.transaction(["cards", "progress", "decks"], "readonly");
      const deck = await tx.objectStore("decks").get(deckId);
      const cards = (await tx.objectStore("cards").getAll()).filter(
        (card) =>
          deck && !deck.deletedAt && card.deckId === deckId && !card.deletedAt,
      );
      const ids = new Set(cards.map((card) => card.id));
      const progress = (await tx.objectStore("progress").getAll()).filter(
        (item) => ids.has(item.cardId),
      );
      await tx.done;
      return { cards, progress };
    },
    async readContent(type, id) {
      const db = await connect();
      if (type === "deck") return (await db.get("decks", id)) ?? null;
      if (type === "card") return (await db.get("cards", id)) ?? null;
      if (id !== userId) throw new Error("Nieprawidłowe konto ustawień");
      return (await db.get("settings", "current")) ?? null;
    },
    async commitReset(input, expected, localVersion, reset) {
      const operation = operationSchema.parse(input);
      if (operation.type !== "progress.reset")
        throw new Error("Nieprawidłowa operacja resetu");
      progressSchema.parse(expected);
      if (!/^(0|[1-9]\d*)$/.test(localVersion))
        throw new Error("Nieprawidłowa lokalna wersja");
      const db = await connect();
      const tx = db.transaction(
        [
          "progress",
          "progressVersions",
          "outbox",
          "meta",
          "reviews",
          "contentOperations",
          "cards",
          "decks",
        ],
        "readwrite",
      );
      try {
        const receipts = tx.objectStore("contentOperations");
        const prior = await receipts.get(operation.id);
        const base = { progress: expected, localVersion };
        if (prior) {
          if (
            canonical(prior.operation) !== canonical(operation) ||
            canonical(prior.expected) !== canonical(base)
          )
            throw new Error("Ponowne użycie identyfikatora");
          await tx.done;
          return { operationId: operation.id, committedAt: prior.committedAt };
        }
        if (await tx.objectStore("reviews").get(operation.id))
          throw new Error("Ponowne użycie identyfikatora");
        const key: [string, string] = [
          operation.entityId,
          operation.payload.direction,
        ];
        const current = await tx.objectStore("progress").get(key);
        const version = await tx.objectStore("progressVersions").get(key);
        const card = await tx.objectStore("cards").get(operation.entityId);
        const deck = card && (await tx.objectStore("decks").get(card.deckId));
        if (!card || card.deletedAt || !deck || deck.deletedAt)
          throw new Error("Karta jest niedostępna");
        if (
          !current ||
          canonical(current) !== canonical(expected) ||
          (version?.version ?? "0") !== localVersion ||
          current.revision !== operation.baseRevision ||
          BigInt(operation.payload.epoch) !== BigInt(current.epoch) + 1n
        )
          throw new Error("Konflikt resetu postępu");
        const projected = progressSchema.parse(
          reset(current, operation.payload.epoch),
        );
        if (
          projected.cardId !== current.cardId ||
          projected.direction !== current.direction ||
          projected.epoch !== operation.payload.epoch ||
          projected.algorithmVersion !== current.algorithmVersion
        )
          throw new Error("Niespójny wynik resetu");
        const committedAt = options.now().toISOString();
        const meta = tx.objectStore("meta");
        const sequence = Number((await meta.get("outboxSequence")) ?? 0) + 1;
        if (!Number.isSafeInteger(sequence))
          throw new Error("Wyczerpano kolejność outbox");
        await tx.objectStore("progress").put(projected);
        await tx.objectStore("progressVersions").put({
          cardId: current.cardId,
          direction: current.direction,
          version: (BigInt(localVersion) + 1n).toString(),
        });
        await meta.put(sequence, "outboxSequence");
        await tx.objectStore("outbox").add({
          operation,
          sequence,
          deliveryUnknown: false,
          state: "pending",
        });
        await receipts.add({ operation, expected: base, committedAt });
        await tx.done;
        return { operationId: operation.id, committedAt };
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async commitContent(
      input,
      expected,
      importStep?: { id: string; index: number },
    ) {
      const operation = operationSchema.parse(input);
      if (
        operation.type === "review.record" ||
        operation.type === "progress.reset"
      )
        throw new Error("Nieobsługiwany typ zapisu treści");
      if (operation.type === "settings.update" && operation.entityId !== userId)
        throw new Error("Nieprawidłowe konto ustawień");
      const db = await connect();
      const tx = db.transaction(
        [
          "decks",
          "cards",
          "settings",
          "outbox",
          "meta",
          "reviews",
          "contentOperations",
        ],
        "readwrite",
      );
      try {
        const receipts = tx.objectStore("contentOperations");
        const meta = tx.objectStore("meta");
        const existing = await receipts.get(operation.id);
        if (existing) {
          if (
            canonical(existing.operation) !== canonical(operation) ||
            canonical(existing.expected) !== canonical(expected)
          )
            throw new Error("Ponowne użycie identyfikatora");
          await tx.done;
          return {
            operationId: operation.id,
            committedAt: existing.committedAt,
          };
        }
        if (await tx.objectStore("reviews").get(operation.id))
          throw new Error("Ponowne użycie identyfikatora");
        const plan = importStep
          ? ((await meta.get("csvImport")) as StoredImport | undefined)
          : undefined;
        if (
          importStep &&
          (plan?.id !== importStep.id ||
            plan.next !== importStep.index ||
            canonical(await meta.get(importKey(plan.id, plan.next))) !==
              canonical({ operation, expected }))
        )
          throw new Error("Plan importu zmienił się");
        const card = operation.type.startsWith("card.")
          ? await tx.objectStore("cards").get(operation.entityId)
          : undefined;
        const parentId =
          operation.type === "card.create"
            ? operation.payload.deckId
            : card?.deckId;
        const deckKey = operation.type.startsWith("deck.")
          ? operation.entityId
          : parentId;
        const deck = deckKey
          ? await tx.objectStore("decks").get(deckKey)
          : undefined;
        if (
          plan &&
          operation.type.startsWith("card.") &&
          (!deck || deck.deletedAt)
        ) {
          throw new Error("Docelowy zestaw importu jest niedostępny");
        }
        const decks = deck ? [deck] : [];
        const cards = card ? [card] : [];
        const settings =
          (await tx.objectStore("settings").get("current")) ?? null;
        const current = operation.type.startsWith("deck.")
          ? (decks.find((x) => x.id === operation.entityId) ?? null)
          : operation.type.startsWith("card.")
            ? (cards.find((x) => x.id === operation.entityId) ?? null)
            : settings;
        if (canonical(current) !== canonical(expected))
          throw new Error("Lokalna treść zmieniła się");
        const committedAt = options.now().toISOString();
        const localDecks =
          operation.type === "deck.delete"
            ? decks.map((d) =>
                d.id === operation.entityId
                  ? { ...d, deletedAt: committedAt }
                  : d,
              )
            : decks;
        const localCards =
          operation.type === "card.delete"
            ? cards.map((c) =>
                c.id === operation.entityId
                  ? { ...c, deletedAt: committedAt }
                  : c,
              )
            : cards;
        const rebase = createSnapshotRebaser({
          version: "unused",
          review() {
            throw new Error("Nieoczekiwana ocena");
          },
        });
        const result = rebase(
          { decks, cards, settings, progress: [], introductions: [] },
          [
            {
              operation,
              sequence: 0,
              state: "pending",
              deliveryUnknown: false,
            },
          ],
          {
            reviews: [],
            introductions: [],
            decks: localDecks,
            cards: localCards,
            settings,
          },
        );
        if (operation.type.startsWith("deck.")) {
          const value = result.data.decks.find(
            (x) => x.id === operation.entityId,
          );
          if (!value) throw new Error("Brak wynikowego zestawu");
          await tx.objectStore("decks").put(value);
        } else if (operation.type.startsWith("card.")) {
          const value = result.data.cards.find(
            (x) => x.id === operation.entityId,
          );
          if (!value) throw new Error("Brak wynikowej fiszki");
          await tx.objectStore("cards").put(value);
        } else {
          if (!result.data.settings)
            throw new Error("Brak wynikowych ustawień");
          await tx.objectStore("settings").put(result.data.settings, "current");
        }
        const sequence = Number((await meta.get("outboxSequence")) ?? 0) + 1;
        if (!Number.isSafeInteger(sequence))
          throw new Error("Wyczerpano kolejność outbox");
        await meta.put(sequence, "outboxSequence");
        await tx.objectStore("outbox").add({
          operation,
          sequence,
          deliveryUnknown: false,
          state: "pending",
        });
        await receipts.add({ operation, expected, committedAt });
        if (plan)
          await meta.put(
            { ...plan, next: plan.next + 1 } satisfies StoredImport,
            "csvImport",
          );
        await tx.done;
        return { operationId: operation.id, committedAt };
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async lease(owner, now, duration, limit, rebaseUnsent = false) {
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
        if (item.state === "acknowledged") continue;
        if (
          item.state === "blocked" ||
          (item.state === "leased" && (item.leaseUntil ?? Infinity) > now)
        )
          break;
        selected.push(item);
        if (selected.length === limit) break;
      }
      for (const item of selected) {
        const operation = item.operation;
        if (
          rebaseUnsent &&
          !item.deliveryUnknown &&
          !item.receipt &&
          "baseRevision" in operation
        ) {
          const kind = operation.type.split(".")[0];
          if (kind === "deck" || kind === "card" || kind === "settings") {
            const predecessor = all.findLast(
              (candidate) =>
                candidate.state === "acknowledged" &&
                candidate.sequence < item.sequence &&
                candidate.operation.entityId === operation.entityId &&
                candidate.operation.type.split(".")[0] === kind,
            );
            const prior = predecessor?.operation;
            const revision = predecessor?.receipt?.revision;
            if (
              prior &&
              revision &&
              operation.baseRevision ===
                ("baseRevision" in prior ? prior.baseRevision : "0")
            ) {
              item.operation = { ...operation, baseRevision: revision };
            }
          }
        }
        item.state = "leased";
        item.deliveryUnknown = true;
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
    async acknowledge(input) {
      const result = operationResultSchema.parse(input);
      const accepted =
        result.status === "applied" || result.status === "duplicate";
      const commitCursor = accepted
        ? revisionSchema.parse(result.commitCursor)
        : undefined;
      const db = await connect();
      const tx = db.transaction(["outbox", "meta"], "readwrite");
      try {
        const item = await tx.objectStore("outbox").get(result.operationId);
        if (item?.state === "acknowledged") {
          if (!accepted || item.receiptCursor !== commitCursor)
            throw new Error("Potwierdzenie ma inną pozycję commita");
          await tx.done;
          return;
        }
        if (
          item?.state === "blocked" &&
          canonical(item.receipt) === canonical(result)
        ) {
          await tx.done;
          return;
        }
        if (!item || !item.deliveryUnknown)
          throw new Error("Brak wysłanej operacji");
        const meta = tx.objectStore("meta");
        const generation =
          Number((await meta.get("receiptGeneration")) ?? 0) + 1;
        if (!Number.isSafeInteger(generation))
          throw new Error("Wyczerpano licznik potwierdzeń");
        await meta.put(generation, "receiptGeneration");
        item.state = accepted
          ? "acknowledged"
          : result.error === "dependency_pending"
            ? "pending"
            : "blocked";
        item.deliveryUnknown = false;
        item.receipt = result;
        if (commitCursor !== undefined) item.receiptCursor = commitCursor;
        delete item.leaseOwner;
        delete item.leaseUntil;
        await tx.objectStore("outbox").put(item);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async discardBlocked(operationId) {
      uuidSchema.parse(operationId);
      const db = await connect();
      const tx = db.transaction(["outbox", "meta"], "readwrite");
      try {
        const item = await tx.objectStore("outbox").get(operationId);
        if (!item || item.state !== "blocked")
          throw new Error("Operacja nie jest zablokowana");
        const meta = tx.objectStore("meta");
        const generation =
          Number((await meta.get("receiptGeneration")) ?? 0) + 1;
        if (!Number.isSafeInteger(generation))
          throw new Error("Wyczerpano licznik potwierdzeń");
        await meta.put(generation, "receiptGeneration");
        await tx.objectStore("outbox").delete(operationId);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async listBlocked() {
      const db = await connect();
      return (await db.getAll("outbox"))
        .filter((item) => item.state === "blocked")
        .sort((a, b) => a.sequence - b.sequence);
    },
    async getDeviceId(generate) {
      const db = await connect();
      const tx = db.transaction("meta", "readwrite");
      const existing = await tx.store.get("deviceId");
      const id =
        existing === undefined
          ? uuidSchema.parse(generate())
          : uuidSchema.parse(existing);
      if (existing === undefined) await tx.store.put(id, "deviceId");
      await tx.done;
      return id;
    },
    async reserveReviewSequence() {
      const db = await connect();
      const tx = db.transaction("meta", "readwrite");
      const previous = revisionSchema.parse(
        (await tx.store.get("reviewSequence")) ?? "0",
      );
      const sequence = revisionSchema.parse((BigInt(previous) + 1n).toString());
      await tx.store.put(sequence, "reviewSequence");
      await tx.done;
      return sequence;
    },
    async readWorkspace() {
      const db = await connect();
      const tx = db.transaction(
        ["decks", "cards", "progress", "introductions", "settings"],
        "readonly",
      );
      const [decks, cards, progress, introductions, settings] =
        await Promise.all([
          tx.objectStore("decks").getAll(),
          tx.objectStore("cards").getAll(),
          tx.objectStore("progress").getAll(),
          tx.objectStore("introductions").getAll(),
          tx.objectStore("settings").get("current"),
        ]);
      await tx.done;
      return {
        decks,
        cards,
        progress,
        introductions,
        settings: settings ?? null,
      };
    },
    async readImport() {
      const db = await connect();
      return (
        ((await db.get("meta", "csvImport")) as StoredImport | undefined) ??
        null
      );
    },
    async startImport(plan, expectedDeck, expectedCards) {
      const db = await connect();
      const tx = db.transaction(["meta", "decks", "cards"], "readwrite");
      const meta = tx.objectStore("meta");
      if (await meta.get("csvImport")) {
        await tx.done;
        throw new Error("Najpierw dokończ bieżący import");
      }
      const deck = (await tx.objectStore("decks").get(plan.deckId)) ?? null;
      const cards = (await tx.objectStore("cards").getAll()).filter(
        (card) => card.deckId === plan.deckId && !card.deletedAt,
      );
      if (
        canonical(deck) !== canonical(expectedDeck) ||
        canonical(cards) !== canonical(expectedCards)
      ) {
        await tx.done;
        throw new Error("Zestaw zmienił się od czasu podglądu");
      }
      const { id, deckId, steps } = plan;
      await Promise.all(
        steps.map((step, index) => meta.put(step, importKey(id, index))),
      );
      await meta.put(
        { id, deckId, next: 0, total: steps.length } satisfies StoredImport,
        "csvImport",
      );
      await tx.done;
    },
    async readImportStep(id, index) {
      const db = await connect();
      const step = (await db.get("meta", importKey(id, index))) as
        ImportStep | undefined;
      if (!step) throw new Error("Brak kroku importu");
      return step;
    },
    async forgetImport(id) {
      const db = await connect();
      const tx = db.transaction("meta", "readwrite");
      const plan = (await tx.store.get("csvImport")) as
        StoredImport | undefined;
      if (plan?.id === id) {
        await Promise.all(
          Array.from({ length: plan.total }, (_, index) =>
            tx.store.delete(importKey(id, index)),
          ),
        );
        await tx.store.delete("csvImport");
      }
      await tx.done;
    },
    async applyPullPage(expected, input) {
      const page = pullResponseSchema.parse(input);
      let cursor = BigInt(revisionSchema.parse(expected));
      for (const change of page.changes) {
        if (BigInt(change.sequence) !== ++cursor)
          throw new Error("Niespójny kursor zmian");
      }
      if (
        page.nextCursor !== cursor.toString() ||
        (page.hasMore && !page.changes.length)
      ) {
        throw new Error("Niespójna strona zmian");
      }
      const db = await connect();
      const tx = db.transaction(
        [
          "cards",
          "decks",
          "progress",
          "progressVersions",
          "introductions",
          "settings",
          "syncedReviews",
          "meta",
          "outbox",
        ],
        "readwrite",
      );
      const meta = tx.objectStore("meta");
      const outbox = tx.objectStore("outbox");
      try {
        const items = await outbox.getAll();
        if (
          ((await meta.get("cursor")) ?? "0") !== expected ||
          items.some((item) => item.state !== "acknowledged")
        ) {
          await tx.done;
          return false;
        }
        for (const change of page.changes) {
          switch (change.entity) {
            case "deck": {
              const deck = deckSchema.parse(change.payload);
              if (
                deck.id !== change.entityId ||
                deck.revision !== change.revision
              )
                throw new Error("Niespójny zestaw");
              await tx.objectStore("decks").put(deck);
              break;
            }
            case "card": {
              const card = cardSchema.parse(change.payload);
              if (
                card.id !== change.entityId ||
                card.contentRevision !== change.revision
              )
                throw new Error("Niespójna fiszka");
              await tx.objectStore("cards").put(card);
              break;
            }
            case "progress":
            case "reset": {
              const progress = progressSchema.parse(change.payload);
              if (
                progress.cardId !== change.entityId ||
                progress.revision !== change.revision
              )
                throw new Error("Niespójny postęp");
              const versions = tx.objectStore("progressVersions");
              const current = await versions.get([
                progress.cardId,
                progress.direction,
              ]);
              await versions.put({
                cardId: progress.cardId,
                direction: progress.direction,
                version: (BigInt(current?.version ?? "0") + 1n).toString(),
              });
              await tx.objectStore("progress").put(progress);
              break;
            }
            case "introduction": {
              const introduction = introductionSchema.parse(change.payload);
              if (introduction.cardId !== change.entityId)
                throw new Error("Niespójne wprowadzenie");
              await tx.objectStore("introductions").put(introduction);
              break;
            }
            case "review": {
              const review = syncedReviewSchema.parse(change.payload);
              if (review.event.id !== change.entityId)
                throw new Error("Niespójna ocena");
              await tx.objectStore("syncedReviews").put(review);
              break;
            }
            case "settings": {
              const settings = settingsSchema.parse(change.payload);
              if (
                change.entityId !== userId ||
                settings.revision !== change.revision
              )
                throw new Error("Niespójne ustawienia");
              await tx.objectStore("settings").put(settings, "current");
              break;
            }
          }
        }
        for (const item of items) {
          if (item.receiptCursor && BigInt(item.receiptCursor) <= cursor)
            await outbox.delete(item.operation.id);
        }
        await meta.put(page.nextCursor, "cursor");
        await tx.done;
        return true;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async clearForLogout(discardPending) {
      const db = await connect();
      const names = [...db.objectStoreNames] as StoreNames<Schema>[];
      const tx = db.transaction(names, "readwrite");
      const outbox = await tx.objectStore("outbox").getAll();
      const pending = outbox.filter(
        (item) => item.state !== "acknowledged",
      ).length;
      if (pending && !discardPending) {
        await tx.done;
        return pending;
      }
      await Promise.all(names.map((name) => tx.objectStore(name).clear()));
      await tx.done;
      return 0;
    },
    async beginSnapshot() {
      const db = await connect();
      const tx = db.transaction(["meta", "outbox"], "readonly");
      const generation = Number(
        (await tx.objectStore("meta").get("receiptGeneration")) ?? 0,
      );
      const items = await tx.objectStore("outbox").getAll();
      if (
        items.some(
          (item) => item.state !== "acknowledged" && item.deliveryUnknown,
        )
      ) {
        await tx.done;
        throw new Error(
          "Nieznany wynik wysłanej operacji; rozlicz receipt przed snapshotem",
        );
      }
      await tx.done;
      return generation;
    },
    async stageSnapshot(pageToken, input, requestGeneration) {
      const page = snapshotResponseSchema.parse(input);
      const pageBytes = new TextEncoder().encode(
        JSON.stringify(page),
      ).byteLength;
      const db = await connect();
      const tx = db.transaction(["staging", "meta"], "readwrite");
      const store = tx.objectStore("staging");
      try {
        const staged = await store.get(page.snapshotToken);
        if (!staged) {
          if (pageToken !== null)
            throw new Error("Brak pierwszej strony snapshotu");
          const receiptGeneration = Number(
            (await tx.objectStore("meta").get("receiptGeneration")) ?? 0,
          );
          if (
            !Number.isSafeInteger(requestGeneration) ||
            requestGeneration !== receiptGeneration
          )
            throw new Error(
              "Snapshot musi być zamówiony po rozliczeniu potwierdzeń",
            );
          if (pageBytes > maxSnapshotBytes)
            throw new Error("Snapshot przekracza lokalny limit rozmiaru");
          await store.add({
            token: page.snapshotToken,
            watermark: page.watermark,
            nextPage: page.nextPage,
            pages: [page],
            receiptGeneration,
            totalBytes: pageBytes,
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
          const totalBytes =
            staged.totalBytes ??
            staged.pages.reduce(
              (sum, item) =>
                sum + new TextEncoder().encode(JSON.stringify(item)).byteLength,
              0,
            );
          if (totalBytes + pageBytes > maxSnapshotBytes)
            throw new Error("Snapshot przekracza lokalny limit rozmiaru");
          staged.pages.push(page);
          staged.nextPage = page.nextPage;
          staged.totalBytes = totalBytes + pageBytes;
          await store.put(staged);
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
    async discardSnapshot(token) {
      const db = await connect();
      await db.delete("staging", token);
    },
    async activateSnapshot(token, rebase) {
      const db = await connect();
      const tx = db.transaction(
        [
          "staging",
          "decks",
          "cards",
          "progress",
          "progressVersions",
          "reviews",
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
        const stagedBytes =
          staged.totalBytes ??
          staged.pages.reduce(
            (sum, item) =>
              sum + new TextEncoder().encode(JSON.stringify(item)).byteLength,
            0,
          );
        if (stagedBytes > maxSnapshotBytes)
          throw new Error("Snapshot przekracza lokalny limit rozmiaru");
        const receiptGeneration = Number(
          (await tx.objectStore("meta").get("receiptGeneration")) ?? 0,
        );
        if (staged.receiptGeneration !== receiptGeneration)
          throw new Error("Snapshot utworzono przed rozliczeniem potwierdzeń");
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
        const allOutbox = (await tx.objectStore("outbox").getAll()).sort(
          (a, b) => a.sequence - b.sequence,
        );
        if (
          allOutbox.some(
            (item) =>
              item.state === "acknowledged" &&
              (!item.receiptCursor ||
                BigInt(item.receiptCursor) > BigInt(staged.watermark)),
          )
        )
          throw new Error(
            "Watermark snapshotu nie obejmuje potwierdzonych operacji",
          );
        const pending = allOutbox.filter(
          (item) => item.state !== "acknowledged",
        );
        if (pending.some((item) => item.deliveryUnknown))
          throw new Error(
            "Nieznany wynik wysłanej operacji; rozlicz receipt przed snapshotem",
          );
        // Rebase only never-sent dependent content operations, and only when
        // the snapshot revision matches a receipt for our own predecessor.
        for (const item of pending) {
          const operation = item.operation;
          if (
            item.state !== "pending" ||
            item.deliveryUnknown ||
            item.receipt !== undefined ||
            !("baseRevision" in operation)
          )
            continue;
          if (
            !operation.type.startsWith("deck.") &&
            !operation.type.startsWith("card.")
          )
            continue;
          const kind = operation.type.split(".")[0];
          const predecessor = allOutbox
            .filter(
              (prior) =>
                prior.state === "acknowledged" &&
                prior.sequence < item.sequence &&
                prior.operation.entityId === operation.entityId &&
                prior.operation.type.startsWith(`${kind}.`),
            )
            .at(-1);
          const prior = predecessor?.operation;
          const receiptRevision = predecessor?.receipt?.revision;
          const snapshotRevision =
            kind === "deck"
              ? base.decks.find((value) => value.id === operation.entityId)
                  ?.revision
              : base.cards.find((value) => value.id === operation.entityId)
                  ?.contentRevision;
          const previousBase =
            prior && "baseRevision" in prior ? prior.baseRevision : "0";
          if (
            receiptRevision &&
            snapshotRevision === receiptRevision &&
            operation.baseRevision === previousBase
          ) {
            item.operation = operationSchema.parse({
              ...operation,
              baseRevision: receiptRevision,
            });
            await tx.objectStore("outbox").put(item);
          }
        }
        const local = {
          reviews: (await tx.objectStore("reviews").getAll()).map(
            (item) => item.event,
          ),
          introductions: await tx.objectStore("introductions").getAll(),
          decks: await tx.objectStore("decks").getAll(),
          cards: await tx.objectStore("cards").getAll(),
          settings: (await tx.objectStore("settings").get("current")) ?? null,
        };
        const rebased = rebase(
          structuredClone(base),
          structuredClone(pending),
          structuredClone(local),
        );
        const expectedIds = pending.map((item) => item.operation.id);
        if (
          rebased.handledOperationIds.length !== expectedIds.length ||
          expectedIds.some(
            (id, index) => rebased.handledOperationIds[index] !== id,
          )
        )
          throw new Error("Rebase nie uwzględnia całego outboxa w kolejności");
        const result = check(rebased.data);
        const versions = await tx.objectStore("progressVersions").getAll();
        const versionMap = new Map(
          versions.map((item) => [`${item.cardId}:${item.direction}`, item]),
        );
        for (const item of result.progress) {
          const key = `${item.cardId}:${item.direction}`;
          if (!versionMap.has(key))
            versionMap.set(key, {
              cardId: item.cardId,
              direction: item.direction,
              version: "0",
            });
        }
        for (const item of versionMap.values()) {
          await tx
            .objectStore("progressVersions")
            .put({ ...item, version: (BigInt(item.version) + 1n).toString() });
        }
        for (const card of base.cards.filter((c) => c.deletedAt)) {
          const rebased = result.cards.find((c) => c.id === card.id);
          if (!rebased?.deletedAt)
            throw new Error("Rebase przywraca usuniętą kartę");
        }
        for (const deck of base.decks.filter((d) => d.deletedAt)) {
          const rebased = result.decks.find((d) => d.id === deck.id);
          if (!rebased?.deletedAt)
            throw new Error("Rebase przywraca usunięty zestaw");
          if (
            result.cards.some(
              (card) => card.deckId === deck.id && !card.deletedAt,
            )
          )
            throw new Error("Rebase przywraca kartę usuniętego zestawu");
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
        for (const item of allOutbox.filter(
          (item) => item.state === "acknowledged",
        ))
          await tx.objectStore("outbox").delete(item.operation.id);
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
