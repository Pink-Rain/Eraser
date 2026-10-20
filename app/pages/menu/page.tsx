import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { MenuEditor } from "@/components/eraser/menu-editor"
import { menuEditorData } from "@/lib/menu-editor-data"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** L'éditeur du menu latéral (administrateurs) : un réglage commun à toute la table. */
export default async function MenuEditorPage() {
  const account = await authorizedAccount(["admin"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Menu" roles={["admin"]}>
      <MenuEditor role={account.role} initial={await menuEditorData(account)} />
    </AuthenticatedShell>
  )
}
