import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { TrashManager } from "@/components/eraser/trash-manager"
import { listTrash } from "@/lib/google-sheets"
import { listObjectIndexTrash } from "@/lib/object-schema"
import { listWorldIndexTrash } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function TrashPage() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")
  const [trash, worldItems, objectItems] = await Promise.all([
    listTrash(),
    listWorldIndexTrash().catch(() => []),
    listObjectIndexTrash().catch(() => []),
  ])
  return <AuthenticatedShell pageLabel="Corbeille" roles={["admin"]}><TrashManager initial={trash} indexItems={[...worldItems, ...objectItems]} /></AuthenticatedShell>
}
