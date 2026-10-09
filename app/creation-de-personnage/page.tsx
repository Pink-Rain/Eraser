import { Suspense } from "react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { CharacterCreationForm, type CreationClassOption } from "@/components/eraser/character-creation-form"
import { classImageUrl } from "@/lib/class-images"
import { googleFailureMessage } from "@/lib/google-failures"
import { listClasses, listClassOptions } from "@/lib/google-sheets"
import { isNameColumn } from "@/lib/world-index-definitions"
import { getWorldIndex } from "@/lib/world-indexes"

export const dynamic = "force-dynamic"

async function creationClasses(): Promise<{ classes: CreationClassOption[]; error: string }> {
  try {
    return { classes: (await listClasses()).map((item) => ({ id: item.id, name: item.name, type: item.type, imageUrl: classImageUrl(item.image), accent: item.accentDark })), error: "" }
  } catch (error) {
    // Sans la feuille des classes, le formulaire reste utilisable avec l’index local ; s'il
    // est vide (installation neuve), la raison s'affiche au lieu d'une liste vide muette.
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("CHARACTER_CREATION_CLASSES_FAILED", code)
    const local = (await listClassOptions().catch(() => [])).map((item) => ({ id: item.id, name: item.name, type: "", imageUrl: null, accent: "" }))
    return { classes: local, error: local.length ? "" : googleFailureMessage(code) || `Les classes n’ont pas pu être lues dans Google Sheets (${code}).` }
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

async function CreationData() {
  const [{ classes, error }, peoples] = await Promise.all([creationClasses(), creationPeoples()])
  return <CharacterCreationForm classes={classes} classesError={error} peoples={peoples} />
}

export default async function CharacterCreationPage() {
  return (
    <AuthenticatedShell pageLabel="Création de personnage">
      <Suspense fallback={<DeferredPageLoading label="Préparation du formulaire…" />}>
        <CreationData />
      </Suspense>
    </AuthenticatedShell>
  )
}
