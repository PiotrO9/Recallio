import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { AccountPanel } from "@/features/auth/account-panel";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth?status=session");
  const { status } = await searchParams;
  return (
    <AuthFrame title="Twoje konto">
      {account.email && <p>{account.email}</p>}
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
