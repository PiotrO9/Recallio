import type { NextRequest } from "next/server";
import { serverAuth } from "@/server/auth/client";
import { authRedirect } from "@/server/auth/request";

export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  let path = "/auth/login?status=link";
  if (hash && hash.length <= 512 && (type === "email" || type === "recovery")) {
    const client = await serverAuth(
      true,
      request.nextUrl.protocol === "https:",
    );
    if (client) {
      const { error } = await client.auth.verifyOtp({ token_hash: hash, type });
      if (!error) path = type === "recovery" ? "/auth/new-password" : "/decks";
    }
  }
  return authRedirect(path);
}
