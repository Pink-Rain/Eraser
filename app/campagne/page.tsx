import { redirect } from "next/navigation"

import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function CampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ campagne?: string }>
}) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const { campagne } = await searchParams
  redirect(campagne ? `/campagne/${encodeURIComponent(campagne)}` : "/")
}
