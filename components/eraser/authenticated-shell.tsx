import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { PageLabel } from "@/components/eraser/app-shell"
import type { SiteRole } from "@/lib/auth-types"
import { currentAccount, currentViewAccount } from "@/lib/server-auth"

export async function AuthenticatedShell({
  pageLabel,
  roles,
  children,
}: {
  pageLabel: string
  roles?: SiteRole[]
  children: ReactNode
}) {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()])
  if (!account) redirect("/connexion")
  if (!viewAccount || !account.role) redirect("/")
  if (roles && !roles.includes(viewAccount.role)) redirect("/")

  return <PageLabel label={pageLabel}>{children}</PageLabel>
}
