import { ValidatedField } from "@/components/validated-field";
import { ActionLink } from "@/components/action-link";
import { AuthFrame } from "@/features/auth/auth-frame";
import { AuthActionForm } from "@/features/auth/auth-action-form";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export const metadata = { title: "Ustaw nowe hasło" };

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await verifiedIdentity(await serverAuth())))
    return (
      <AuthFrame title="Ustaw nowe hasło" variant="auth">
        <p role="alert">Sesja zmiany hasła wygasła. Poproś o nową wiadomość.</p>
        <ActionLink className="primary" href="/auth/forgot-password">
          Wyślij nowy link
        </ActionLink>
      </AuthFrame>
    );
  const { status } = await searchParams;
  return (
    <AuthFrame title="Ustaw nowe hasło" variant="auth">
      {status && (
        <p role="alert">Nie udało się zmienić hasła. Spróbuj ponownie.</p>
      )}
      <AuthActionForm label="Zapisz hasło" loadingLabel="Zapisywanie hasła…">
        <input type="hidden" name="intent" value="update-password" />
        <ValidatedField
          label="Nowe hasło"
          description="Od 8 do 128 znaków."
          hint="Użyj co najmniej 8 znaków."
        >
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </ValidatedField>
      </AuthActionForm>
    </AuthFrame>
  );
}
