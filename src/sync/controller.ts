import {
  pullResponseSchema,
  pushResponseSchema,
  snapshotResponseSchema,
  type Operation,
} from "../contracts";
import { fsrsScheduler, resetFsrsProgress } from "../domain/learning/scheduler";
import type { createLocalRepository } from "../storage/local-repository";
import { createSnapshotRebaser } from "../storage/snapshot-rebase";

type Repository = ReturnType<typeof createLocalRepository>;
export type SyncStatus =
  "idle" | "offline" | "requires_auth" | "retry" | "conflict" | "failed";

class TransportError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super(`Synchronizacja HTTP ${status}`);
  }
}

interface SyncOptions {
  userId: string;
  repository: Repository;
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
  id: () => string;
  online: () => boolean;
}

const rebase = createSnapshotRebaser(fsrsScheduler, resetFsrsProgress);

export function createSyncController(options: SyncOptions) {
  const { repository } = options;
  let active: Promise<SyncStatus> | undefined;
  let attempts = 0;
  let nextAttempt = 0;

  async function request(path: string, body?: object) {
    let response: Response;
    try {
      response = await options.fetch(`/api/v1/sync/${path}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "X-Recallio-Account": options.userId,
          ...(body && { "Content-Type": "application/json" }),
        },
        ...(body && { method: "POST", body: JSON.stringify(body) }),
      });
    } catch {
      throw new TransportError(503);
    }
    if (!response.ok)
      throw new TransportError(
        response.status,
        response.headers.get("retry-after"),
      );
    return response.json();
  }

  async function send(owner: string): Promise<SyncStatus> {
    const deviceId = await repository.getDeviceId(options.id);
    while (true) {
      // A receipt can change the base revision of the next unsent edit.
      const [item] = await repository.lease(
        owner,
        options.now(),
        30_000,
        1,
        true,
      );
      if (!item)
        return (await repository.listBlocked()).length ? "conflict" : "idle";
      const operation: Operation = item.operation;
      const batch = pushResponseSchema.parse(
        await request("push", {
          protocolVersion: 1,
          deviceId,
          operations: [operation],
        }),
      );
      const [result] = batch.results;
      if (batch.results.length !== 1 || result.operationId !== operation.id) {
        throw new Error("Nieprawidłowe potwierdzenie synchronizacji");
      }
      await repository.acknowledge(result);
      if (result.error === "dependency_pending") throw new TransportError(503);
      if (result.status === "conflict" || result.status === "rejected")
        return "conflict";
    }
  }

  async function replaceSnapshot() {
    const generation = await repository.beginSnapshot();
    let token: string | undefined;
    let next: string | null = null;
    try {
      do {
        const params: URLSearchParams = new URLSearchParams();
        if (token && next !== null) {
          params.set("snapshotToken", token);
          params.set("pageToken", next);
        }
        const page = snapshotResponseSchema.parse(
          await request(`snapshot?${params}`),
        );
        if (token && page.snapshotToken !== token)
          throw new Error("Snapshot zmienił token");
        token = page.snapshotToken;
        await repository.stageSnapshot(next, page, generation);
        next = page.nextPage;
      } while (next !== null);
      await repository.activateSnapshot(token!, rebase);
    } catch (error) {
      if (token) await repository.discardSnapshot(token);
      throw error;
    }
  }

  async function receive() {
    let cursor = (await repository.getCursor()) ?? "0";
    while (true) {
      const page = pullResponseSchema.parse(
        await request(`pull?cursor=${encodeURIComponent(cursor)}`),
      );
      if (!(await repository.applyPullPage(cursor, page))) return "retry";
      if (!page.hasMore) return "idle";
      cursor = page.nextCursor;
    }
  }

  function retry(error: TransportError) {
    const now = options.now();
    const backoff = Math.min(60_000, 1000 * 2 ** Math.min(attempts++, 6));
    const header = error.retryAfter;
    const retryAfter =
      header && /^\d+$/.test(header)
        ? Number(header) * 1000
        : header
          ? Date.parse(header) - now
          : 0;
    const jitter = backoff * (0.5 + options.random() * 0.5);
    nextAttempt =
      now + Math.max(jitter, Number.isFinite(retryAfter) ? retryAfter : 0);
  }

  async function synchronize(forceSnapshot: boolean): Promise<SyncStatus> {
    if (!options.online()) return "offline";
    if (options.now() < nextAttempt) return "retry";
    const owner = options.id();
    try {
      const sent = await send(owner);
      if (sent !== "idle") return sent;
      if (forceSnapshot) {
        await replaceSnapshot();
      } else {
        try {
          const received = await receive();
          if (received !== "idle") return received;
        } catch (error) {
          if (!(error instanceof TransportError) || error.status !== 409)
            throw error;
          await replaceSnapshot();
        }
      }
      attempts = 0;
      nextAttempt = 0;
      return "idle";
    } catch (error) {
      if (!(error instanceof TransportError)) return "failed";
      if (error.status === 401) return "requires_auth";
      if (error.status === 429 || error.status >= 500) {
        retry(error);
        return "retry";
      }
      return "failed";
    } finally {
      await repository.releaseLease(owner);
    }
  }

  function run(forceSnapshot = false): Promise<SyncStatus> {
    if (active) return forceSnapshot ? active.then(() => run(true)) : active;
    active = synchronize(forceSnapshot).finally(() => {
      active = undefined;
    });
    return active;
  }

  return {
    run,
    flush: () => (active ? active.then(() => run()) : run()),
    whenIdle: () => active,
    retryAt: () => nextAttempt,
  };
}
