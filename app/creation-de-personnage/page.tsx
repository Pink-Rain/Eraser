import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CharacterCreationForm, type CreationClassOption } from "@/components/eraser/character-creation-form"
import { classImageUrl } from "@/lib/class-images"
import { listClasses, listClassOptions } from "@/lib/google-sheets"
import { isNameColumn } from "@/lib/world-index-definitions"
import { getWorldIndex } from "@/lib/world-indexes"

export const dynamic = "force-dynamic"

async function creationClasses(): Promise<CreationClassOption[]> {
  try {
    return (await listClasses()).map((item) => ({ id: item.id, name: item.name, type: item.type, imageUrl: classImageUrl(item.image), accent: item.accentDark }))
  } catch {
    // Sans la feuille des classes, le formulaire reste utilisable avec l’index local.
    return (await listClassOptions().catch(() => [])).map((item) => ({ id: item.id, name: item.name, type: "", imageUrl: null, accent: "" }))
  }
}

async function creationPeoples() {
  try {
    const index = await getWorldIndex("peoples")
    const names = index.tables.flatMap((table) => {
      const column = table.headers.findIndex(isNameColumn)
      return column < 0 ? [] : table.rows.map((row) => row.values[column]?.trim() || "")
    }).filter(Boolean)
    return [...new Set(names)].sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }))
  } catch {
    return []
  }
}

export default async function CharacterCreationPage() {
  const [classes, peoples] = await Promise.all([creationClasses(), creationPeoples()])
  return (
    <AuthenticatedShell pageLabel="Création de personnage">
      <CharacterCreationForm classes={classes} peoples={peoples} />
    </AuthenticatedShell>
  )
}
