import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { DeckManager } from "@/features/decks/deck-manager";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function DecksPage() {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login?status=session");
  return (
    <AuthFrame title="Moje zestawy">
      <DeckManager userId={account.id} />
    </AuthFrame>
  );
}
