import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { TrashManager } from "@/components/eraser/trash-manager"
import { listTrash } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function TrashPage() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")
  const trash = await listTrash()
  return <AuthenticatedShell pageLabel="Corbeille" roles={["admin"]}><TrashManager initial={trash} /></AuthenticatedShell>
}
