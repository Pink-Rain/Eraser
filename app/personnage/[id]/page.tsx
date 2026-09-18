import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CharacterSheet } from "@/components/eraser/character-sheet"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { getCharacterById, getCharacterForMj, getCharacterForUser, getCharacterSheet } from "@/lib/google-sheets"
import type { SiteRole } from "@/lib/auth-types"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function CharacterData({ id, accountUid, role }: { id: string; accountUid: string; role: SiteRole }) {
  let character: Awaited<ReturnType<typeof getCharacterSheet>> = null
  let loadError = false
  try {
    character = await getCharacterSheet(role === "admin" || role === "mj" ? null : accountUid, id)
  } catch (error) {
    loadError = true
    console.error("CHARACTER_SHEET_LOAD_FAILED", id, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  }
  if (loadError || !character) {
    return <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <h1 className="font-display text-2xl font-semibold">La fiche n’a pas pu être chargée</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Tes données n’ont pas disparu. Google Sheets n’a pas répondu correctement ; recharge la fiche pour réessayer.</p>
      <a href={`/personnage/${encodeURIComponent(id)}`} className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Réessayer</a>
    </div>
  }
  return <CharacterSheet initialCharacter={character} classes={[]} classSpells={[]} loadClassCatalog />
}

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const indexedCharacter = await (account.role === "admin"
    ? getCharacterById(id)
    : account.role === "mj"
      ? getCharacterForMj(account.uid, id)
      : getCharacterForUser(account.uid, id)).catch(() => null)
  if (!indexedCharacter) notFound()

  return (
    <AuthenticatedShell pageLabel={indexedCharacter.name}>
      <Suspense fallback={<DeferredPageLoading label="Chargement de la fiche…" />}>
        <CharacterData id={id} accountUid={account.uid} role={account.role} />
      </Suspense>
    </AuthenticatedShell>
  )
}
