import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { uuidSchema } from "../../contracts";

export const privateCache = "private, no-store";

export function createAuthClient(methods: CookieMethodsServer, secure = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: methods,
    cookieOptions: { httpOnly: true, sameSite: "lax", path: "/", secure },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export async function serverAuth(writable = false, secure = false) {
  const jar = await cookies();
  return createAuthClient(
    {
      getAll: () => jar.getAll(),
      ...(writable && {
        setAll(values) {
          for (const { name, value, options } of values) {
            jar.set(name, value, options);
          }
        },
      }),
    },
    secure,
  );
}

export async function verifiedIdentity(
  client: ReturnType<typeof createAuthClient>,
) {
  if (!client) return null;
  const { data, error } = await client.auth.getClaims();
  const id = uuidSchema.safeParse(data?.claims.sub);
  if (error || !id.success || data?.claims.is_anonymous) return null;
  return { id: id.data, email: data?.claims.email };
}
