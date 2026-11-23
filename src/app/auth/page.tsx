import Link from "next/link";
import { AuthFrame } from "@/features/auth/auth-frame";

const statusMessages: Record<string, string> = {
  credentials: "Sprawdź adres e-mail, hasło i potwierdzenie konta.",
  invalid: "Sprawdź wpisane dane.",
  error: "Operacja się nie powiodła. Spróbuj ponownie.",
  link: "Ten link wygasł albo jest nieprawidłowy.",
  session: "Sesja wygasła lub konto się zmieniło. Zaloguj się ponownie.",
  sent: "Jeśli możemy wysłać wiadomość na ten adres, znajdziesz ją w skrzynce.",
  unavailable: "Logowanie jest obecnie niedostępne.",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; status?: string }>;
}) {
  const { mode, status } = await searchParams;
  const intent = mode === "signup" || mode === "reset" ? mode : "login";
  const title = {
    login: "Zaloguj się",
    signup: "Utwórz konto",
    reset: "Odzyskaj hasło",
  }[intent];

  return (
    <AuthFrame title={title} linkLogo={false}>
      {status && Object.hasOwn(statusMessages, status) && (
        <p role={status === "sent" ? "status" : "alert"}>
          {statusMessages[status]}
        </p>
      )}
      <form className="auth-form" method="post" action="/auth/actions">
        <input type="hidden" name="intent" value={intent} />
        <label>
          Adres e-mail
          <input
            type="email"
            name="email"
            spellCheck={false}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        {intent !== "reset" && (
          <label>
            Hasło
            <input
              type="password"
              name="password"
              autoComplete={
                intent === "signup" ? "new-password" : "current-password"
              }
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        )}
        <button className="primary">
          {intent === "reset" ? "Wyślij link" : title}
        </button>
      </form>
      <nav aria-label="Opcje konta">
        {intent !== "login" && <Link href="/auth">Zaloguj się</Link>}
        {intent !== "signup" && (
          <Link href="/auth?mode=signup">Utwórz konto</Link>
        )}
        {intent !== "reset" && (
          <Link href="/auth?mode=reset">Nie pamiętam hasła</Link>
        )}
      </nav>
    </AuthFrame>
  );
}
