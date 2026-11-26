import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";
import { Dashboard } from "./dashboard";
export const metadata = { title: { absolute: "Panel nauki · Recallio" } };

export default async function Home() {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login");
  return (
    <PageShell>
      <Dashboard key={account.id} userId={account.id} />
    </PageShell>
  );
}
