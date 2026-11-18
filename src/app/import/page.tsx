import { redirect } from "next/navigation";
import { AuthFrame } from "@/features/auth/auth-frame";
import { CsvImport } from "@/features/import/csv-import";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string }>;
}) {
  const account = await verifiedIdentity(await serverAuth());
  if (!account) redirect("/auth?status=session");
  const { deck } = await searchParams;
  return (
    <AuthFrame title="Importuj fiszki">
      <CsvImport userId={account.id} initialDeck={deck} />
    </AuthFrame>
  );
}
