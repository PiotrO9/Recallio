import type { NextRequest } from "next/server";
import { serveSync } from "@/server/sync/http";
import { readRepairCandidates } from "@/server/sync/repair-candidates";
export function GET(request: NextRequest) {
  return serveSync(request, (id) =>
    readRepairCandidates(id, new Date().toISOString()),
  );
}
