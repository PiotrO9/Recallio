import { redirect } from "next/navigation";

export default async function LegacyAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; status?: string }>;
}) {
  const { mode, status } = await searchParams;
  const path =
    mode === "signup"
      ? "/auth/signup"
      : mode === "reset"
        ? "/auth/forgot-password"
        : "/auth/login";
  redirect(
    typeof status === "string"
      ? path + "?" + new URLSearchParams({ status })
      : path,
  );
}
