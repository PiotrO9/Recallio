import type { NextRequest } from "next/server";
import { readPush, serveSync } from "@/server/sync/http";
import { push } from "@/server/sync/service";

export function POST(request: NextRequest) {
  return serveSync(request, async (account) => {
    const { deviceId, operations } = await readPush(request);
    return push(account, deviceId, operations, new Date().toISOString());
  });
}
