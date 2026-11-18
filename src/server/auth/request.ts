import { NextResponse, type NextRequest } from "next/server";
import { privateCache } from "./client";

export function requestOrigin(request: NextRequest): string | null {
  // next start may normalize its own listen address to localhost.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  try {
    const url = new URL(`${request.nextUrl.protocol}//${host}`);
    if (url.host !== host.toLowerCase()) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function authRedirect(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": privateCache,
      "Referrer-Policy": "no-referrer",
    },
  });
}
