import { NextResponse, type NextRequest } from "next/server";
import {
  createAuthClient,
  privateCache,
  verifiedIdentity,
} from "./server/auth/client";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createAuthClient(
    {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options);
        }
      },
    },
    request.nextUrl.protocol === "https:",
  );
  await verifiedIdentity(client);
  response.headers.set("Cache-Control", privateCache);
  return response;
}

export const config = {
  matcher: ["/account/:path*", "/auth/new-password"],
};
