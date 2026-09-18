export type SiteRole = "admin" | "mj" | "joueur"
export type AccountStatus = "en_attente" | "actif" | "suspendu"

export const allowedRoleViews: Record<SiteRole, SiteRole[]> = {
  admin: ["joueur", "mj", "admin"],
  mj: ["joueur", "mj"],
  joueur: ["joueur"],
}

export type AccountRecord = {
  uid: string
  email: string
  displayName: string
  role: SiteRole | null
  status: AccountStatus
  createdAt: string
  updatedAt: string
}
