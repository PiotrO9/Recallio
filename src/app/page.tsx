import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";
import { readDashboardPreview } from "@/server/dashboard-recommendation";
import { Dashboard } from "./dashboard";
import { RecommendationCard, DeckList } from "./dashboard-content";
export const metadata = { title: { absolute: "Panel nauki · Recallio" } };

export default async function Home() {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login");
  const initialPreview = await readDashboardPreview(
    account.id,
    new Date().toISOString(),
  );
  return (
    <PageShell>
      <Dashboard
        key={account.id}
        userId={account.id}
        previewCard={
          initialPreview && <RecommendationCard item={initialPreview.item} />
        }
        previewLibrary={
          initialPreview && <DeckList decks={initialPreview.decks} />
        }
      />
    </PageShell>
  );
}
