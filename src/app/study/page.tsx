import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { StudySession } from "@/features/study/study-session";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string; scope?: string }>;
}) {
  const identity = await verifiedIdentity(await serverAuth());
  if (!identity) redirect("/auth/login?status=session");
  const { deck, scope } = await searchParams;
  return (
    <AuthFrame variant="study">
      <StudySession
        accountId={identity.id}
        deckId={deck}
        daily={!deck && scope === "today"}
      />
    </AuthFrame>
  );
}
