import { cookies } from "next/headers"
import { cache } from "react"

import { AUTH_COOKIE, VIEW_ROLE_COOKIE } from "@/lib/auth-cookies"
import { allowedRoleViews, type AccountRecord, type SiteRole } from "@/lib/auth-types"
import { accountFromSession } from "@/lib/site-auth"

export type AuthorizedUser = Omit<AccountRecord, "role"> & {
  role: SiteRole
  accountRole: SiteRole
}

export const currentAccount = cache(async function currentAccount() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value
  if (!token) return null
  return accountFromSession(token).catch(() => null)
})

export const currentViewAccount = cache(async function currentViewAccount(): Promise<AuthorizedUser | null> {
  const account = await currentAccount()
  if (!account || account.status !== "actif" || !account.role) return null
  const cookieStore = await cookies()
  const savedView = cookieStore.get(VIEW_ROLE_COOKIE)?.value as SiteRole | undefined
  const role = savedView && allowedRoleViews[account.role].includes(savedView) ? savedView : account.role
  return { ...account, role, accountRole: account.role }
})

export async function authorizedAccount(roles?: SiteRole[]) {
  const account = await currentViewAccount()
  if (!account) return null
  if (roles && !roles.includes(account.role)) return null
  return account
}
