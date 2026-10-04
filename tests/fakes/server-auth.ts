/**
 * Un compte toujours connecté, branché à la place de lib/server-auth : les tests appellent
 * les routes (/api/…) comme le ferait la page, sans cookie de session.
 */
export const session = { account: { uid: "admin-test", email: "", displayName: "Admin", status: "actif", role: "admin", accountRole: "admin" } as Record<string, unknown> | null }

export async function currentAccount() {
  return session.account
}

export async function currentAuthToken() {
  return undefined
}

export async function currentViewAccount() {
  return session.account
}

export async function authorizedAccount(roles?: string[]) {
  const account = session.account
  if (!account) return null
  if (roles && !roles.includes(String(account.role))) return null
  return account
}
