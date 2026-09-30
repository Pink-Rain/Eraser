import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { TrashManager } from "@/components/eraser/trash-manager"
import { listTrash } from "@/lib/google-sheets"
import { listTrashedCustomIndexes } from "@/lib/custom-indexes"
import { listObjectIndexTrash } from "@/lib/object-schema"
import { listWorldIndexTrash } from "@/lib/world-indexes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function TrashPage() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")
  const [trash, worldItems, objectItems, customIndexes] = await Promise.all([
    listTrash(),
    listWorldIndexTrash().catch(() => []),
    listObjectIndexTrash().catch(() => []),
    listTrashedCustomIndexes().catch(() => []),
  ])
  const indexes = customIndexes.map((entry) => ({ family: "world" as const, key: entry.key, title: entry.title, tab: "", column: "", deletedAt: entry.deletedAt }))
  return <AuthenticatedShell pageLabel="Corbeille" roles={["admin"]}><TrashManager initial={trash} indexItems={[...indexes, ...worldItems, ...objectItems]} /></AuthenticatedShell>
}
