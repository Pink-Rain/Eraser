import { redirect } from "next/navigation"

import { OBJECT_REFERENCE_INDEX } from "@/lib/index-references"
import { isBuiltinWorldIndexKey, worldIndexDefinitions } from "@/lib/world-index-definitions"

/**
 * Une référence « {État:Sérénité} » est enregistrée comme un lien vers sa ligne. Les textes
 * qui l'affichent la remplacent par le nom ; un lien suivi tel quel (depuis une note, ou
 * depuis Google Sheets) mène à la page de son index.
 */
export default async function ReferencePage({ params }: { params: Promise<{ index: string; id: string }> }) {
  const { index } = await params
  const key = decodeURIComponent(index)
  if (key === OBJECT_REFERENCE_INDEX) redirect("/ressources/index-des-objets")
  if (isBuiltinWorldIndexKey(key)) redirect(worldIndexDefinitions[key].path)
  redirect(`/ressources/index/${encodeURIComponent(key)}`)
}
