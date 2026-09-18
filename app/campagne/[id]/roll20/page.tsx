import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { Roll20BridgePanel } from "@/components/eraser/roll20-bridge-panel"
import { getRoll20LinkForManager } from "@/lib/roll20-bridge"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function Roll20BridgePage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const link = await getRoll20LinkForManager(account, id)
  if (link === null) {
    const campaign = await import("@/lib/roll20-bridge").then(({ campaignForRoll20Manager }) => campaignForRoll20Manager(account, id))
    if (!campaign) notFound()
  }
  return <AuthenticatedShell pageLabel="Roll20" roles={["admin", "mj"]}><Roll20BridgePanel campaignId={id} initialLink={link} /></AuthenticatedShell>
}
