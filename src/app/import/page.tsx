import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { CsvImport } from "@/features/import/csv-import";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export const metadata = { title: "Import fiszek" };

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string; source?: string }>;
}) {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth/login?status=session");
  const { deck, source } = await searchParams;
  return (
    <AuthFrame variant="catalog">
      <CsvImport
        key={JSON.stringify([account.id, deck, source])}
        paste={source === "paste"}
        userId={account.id}
        initialDeck={deck}
      />
    </AuthFrame>
  );
}
