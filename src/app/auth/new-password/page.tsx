import { ValidatedField } from "@/components/validated-field";
import Link from "next/link";
import { AuthFrame } from "@/features/auth/auth-frame";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await verifiedIdentity(await serverAuth())))
    return (
      <AuthFrame title="Ustaw nowe hasło" variant="auth">
        <p role="alert">Sesja zmiany hasła wygasła. Poproś o nową wiadomość.</p>
        <Link className="primary" href="/auth/forgot-password">
          Wyślij nowy link
        </Link>
      </AuthFrame>
    );
  const { status } = await searchParams;
  return (
    <AuthFrame title="Ustaw nowe hasło" variant="auth">
      {status && (
        <p role="alert">Nie udało się zmienić hasła. Spróbuj ponownie.</p>
      )}
      <form className="auth-form" action="/auth/actions" method="post">
        <input type="hidden" name="intent" value="update-password" />
        <ValidatedField label="Nowe hasło" hint="Użyj co najmniej 8 znaków.">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </ValidatedField>
        <button className="primary">Zapisz hasło</button>
      </form>
    </AuthFrame>
  );
}
