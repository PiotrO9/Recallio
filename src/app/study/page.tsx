import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { StudySession } from "@/features/study/study-session";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function StudyPage() {
  const identity = await verifiedIdentity(await serverAuth());
  if (!identity) redirect("/auth?status=session");
  return (
    <AuthFrame title="Nauka">
      <StudySession accountId={identity.id} />
    </AuthFrame>
  );
}
