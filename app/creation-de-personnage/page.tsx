import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CharacterCreationForm } from "@/components/eraser/character-creation-form"
import { listClassOptions } from "@/lib/google-sheets"

export const dynamic = "force-dynamic"

export default async function CharacterCreationPage() {
  const classes = await listClassOptions().catch(() => [])
  return (
    <AuthenticatedShell pageLabel="Création de personnage">
      <CharacterCreationForm classes={classes} />
    </AuthenticatedShell>
  )
}
