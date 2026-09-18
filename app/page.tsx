import { HomeShell } from "@/components/eraser/home-shell"
import { AccountGate } from "@/components/eraser/account-gate"
import { currentAccount, currentViewAccount } from "@/lib/server-auth"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function Home() {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()])
  if (!account) redirect("/connexion")
  if (account.status !== "actif" || !account.role) {
    return <AccountGate account={account} />
  }
  if (!viewAccount) redirect("/")
  return <HomeShell />
}
