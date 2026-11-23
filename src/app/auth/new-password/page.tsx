import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await verifiedIdentity(await serverAuth())))
    redirect("/auth/login?status=session");
  const { status } = await searchParams;
  return (
    <AuthFrame title="Ustaw nowe hasło" variant="auth">
      {status && (
        <p role="alert">Nie udało się zmienić hasła. Spróbuj ponownie.</p>
      )}
      <form className="auth-form" action="/auth/actions" method="post">
        <input type="hidden" name="intent" value="update-password" />
        <label>
          Nowe hasło
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        <button className="primary">Zapisz hasło</button>
      </form>
    </AuthFrame>
  );
}
