import type { NextRequest } from "next/server";
import { snapshotQuerySchema } from "@/contracts";
import { SyncFailure } from "@/server/sync/database";
import { serveSync } from "@/server/sync/http";
import { snapshot } from "@/server/sync/service";

export function GET(request: NextRequest) {
  return serveSync(request, (account) => {
    const query = snapshotQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!query.success)
      throw new SyncFailure(
        422,
        "invalid_envelope",
        "Nieprawidłowy token snapshotu",
      );
    return snapshot(account, query.data.snapshotToken, query.data.pageToken);
  });
}
