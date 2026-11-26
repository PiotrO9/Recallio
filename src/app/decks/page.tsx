import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { DeckManager } from "@/features/decks/deck-manager";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export const metadata = { title: "Moje zestawy" };

export default async function DecksPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string; new?: string; card?: string }>;
}) {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login?status=session");
  const params = await searchParams;
  return (
    <AuthFrame variant="catalog">
      <DeckManager
        key={JSON.stringify([account.id, params])}
        userId={account.id}
        initialDeck={params.deck}
        createDeck={params.new === "1"}
        initialCard={params.card === "new" ? undefined : params.card}
        createCard={params.card === "new"}
      />
    </AuthFrame>
  );
}
