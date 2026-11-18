import type { NextRequest } from "next/server";
import { pullQuerySchema } from "@/contracts";
import { SyncFailure } from "@/server/sync/database";
import { serveSync } from "@/server/sync/http";
import { pull } from "@/server/sync/service";

export function GET(request: NextRequest) {
  return serveSync(request, (account) => {
    const query = pullQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!query.success)
      throw new SyncFailure(
        422,
        "invalid_envelope",
        "Nieprawidłowy kursor lub limit",
      );
    return pull(
      account,
      query.data.cursor,
      query.data.limit,
      new Date().toISOString(),
    );
  });
}
