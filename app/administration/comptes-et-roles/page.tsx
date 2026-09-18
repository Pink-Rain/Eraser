import { redirect } from "next/navigation"

import { AccountAccessTable } from "@/components/eraser/account-access-table"
import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { authorizedAccount } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

export const dynamic = "force-dynamic"

export default async function AccountsAndRolesPage() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")
  const accounts = await listAccounts()

  return (
    <AuthenticatedShell pageLabel="Comptes et rôles" roles={["admin"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
          Administration
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">
          Comptes et rôles
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Aucun compte ne peut consulter le contenu avant d’avoir reçu un rôle
          et le statut actif.
        </p>
        <AccountAccessTable accounts={accounts} currentUid={admin.uid} />
      </div>
    </AuthenticatedShell>
  )
}
