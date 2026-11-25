import Link from "next/link";
import { AuthFrame } from "@/features/auth/auth-frame";

export default function NotFound() {
  return (
    <AuthFrame title="Nie znaleziono strony" variant="auth">
      <p>Sprawdź adres lub przejdź na stronę główną Recallio.</p>
      <Link className="primary" href="/">
        Strona główna
      </Link>
    </AuthFrame>
  );
}
