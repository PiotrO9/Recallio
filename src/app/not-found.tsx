import { ActionLink } from "@/components/action-link";
import { AuthFrame } from "@/features/auth/auth-frame";

export const metadata = { title: "Nie znaleziono strony" };

export default function NotFound() {
  return (
    <AuthFrame title="Nie znaleziono strony" variant="auth">
      <p className="field-note">Błąd 404</p>
      <p>Sprawdź adres lub przejdź na stronę główną Recallio.</p>
      <ActionLink className="primary" href="/">
        Strona główna
      </ActionLink>
    </AuthFrame>
  );
}
