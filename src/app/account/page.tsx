import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { AccountPanel } from "@/features/auth/account-panel";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export const metadata = { title: "Moje konto" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login?status=session");
  const { status } = await searchParams;
  return (
    <AuthFrame title="Moje konto">
      {account.email && (
        <div>
          <small>Adres e-mail</small>
          <p>
            <strong>{account.email}</strong>
          </p>
        </div>
      )}
      {status === "password" && <p role="status">Hasło zostało zmienione.</p>}
      {status === "logout" && (
        <p role="alert">Nie udało się wylogować. Spróbuj ponownie.</p>
      )}
      <AccountPanel key={account.id} accountId={account.id} />
      <nav aria-label="Nauka">
        <Link href="/decks">Moje zestawy</Link>
        <a href="/study">Przejdź do nauki</a>
      </nav>
    </AuthFrame>
  );
}
