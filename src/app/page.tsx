import { redirect } from "next/navigation";
import { serverAuth, verifiedIdentity } from "@/server/auth/client";

export default async function Home() {
  const account = await verifiedIdentity(await serverAuth());
  redirect(account ? "/decks" : "/auth/login");
}
