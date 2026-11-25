import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  privateCache,
  serverAuth,
  verifiedIdentity,
} from "@/server/auth/client";

import { authRedirect, requestOrigin } from "@/server/auth/request";
import { offlineAccountCookie } from "@/features/study/offline";

const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(8).max(128);

export async function POST(request: NextRequest) {
  const origin = requestOrigin(request);
  if (!origin || request.headers.get("origin") !== origin) {
    return new Response(null, {
      status: 403,
      headers: { "Cache-Control": privateCache },
    });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return authRedirect("/auth/login?status=invalid");

  const client = await serverAuth(true, request.nextUrl.protocol === "https:");
  if (!client) return authRedirect("/auth/login?status=unavailable");
  const intent = form.get("intent");
  const email = emailSchema.safeParse(form.get("email")?.toString().trim());
  const password = passwordSchema.safeParse(form.get("password"));
  const callback = new URL("/auth/confirm", origin).href;

  if (intent === "logout") {
    const identity = await verifiedIdentity(client);
    if (!identity || identity.id !== form.get("accountId")) {
      return authRedirect("/auth/login?status=session");
    }
    const { error } = await client.auth.signOut({ scope: "local" });
    const response = authRedirect(
      error ? "/account?status=logout" : "/auth/login",
    );
    if (!error) response.cookies.delete(offlineAccountCookie);
    return response;
  }
  if (intent === "update-password") {
    if (!(await verifiedIdentity(client)))
      return authRedirect("/auth/login?status=session");
    if (!password.success)
      return authRedirect("/auth/new-password?status=invalid");
    const { error } = await client.auth.updateUser({ password: password.data });
    return authRedirect(
      error ? "/auth/new-password?status=error" : "/account?status=password",
    );
  }
  if (intent === "reset") {
    if (!email.success)
      return authRedirect("/auth/forgot-password?status=invalid");
    await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: callback,
    });
    return authRedirect("/auth/forgot-password?status=sent");
  }
  if (intent !== "signup" && intent !== "login") {
    return authRedirect("/auth/login?status=invalid");
  }
  if (!email.success || !password.success) {
    return authRedirect(`/auth/${intent}?status=invalid`);
  }
  if (intent === "signup") {
    const { error } = await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: callback },
    });
    return authRedirect(
      error ? "/auth/signup?status=error" : "/auth/signup?status=sent",
    );
  }
  const { error } = await client.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  return authRedirect(error ? "/auth/login?status=credentials" : "/");
}
