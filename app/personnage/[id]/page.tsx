import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CharacterSheet } from "@/components/eraser/character-sheet"
import { DeferredPageLoading } from "@/components/eraser/deferred-content-loading"
import { getCharacterCatalog } from "@/lib/character-catalog-server"
import { builtinCharacterCatalog } from "@/lib/character-catalog"
import { findCharacterForAccount, getCharacterSheet } from "@/lib/google-sheets"
import type { SiteRole } from "@/lib/auth-types"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function CharacterData({ id, accountUid, role }: { id: string; accountUid: string; role: SiteRole }) {
  let character: Awaited<ReturnType<typeof getCharacterSheet>> = null
  let loadError = false
  let catalog = builtinCharacterCatalog
  try {
    // La fiche et le catalogue des caractéristiques sont lus en même temps.
    const [sheet, loadedCatalog] = await Promise.all([getCharacterSheet(role === "admin" || role === "mj" ? null : accountUid, id), getCharacterCatalog()])
    character = sheet
    catalog = loadedCatalog
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
  return <CharacterSheet initialCharacter={character} catalog={catalog} classes={[]} classSpells={[]} loadClassCatalog />
}

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const indexedCharacter = await findCharacterForAccount(account, id)
  // Introuvable (supprimée, à la corbeille, ou d'un autre joueur) : un message dans l'appli,
  // avec de quoi revenir, plutôt qu'une page brute « not found » sans menu ni retour.
  if (!indexedCharacter) return (
    <AuthenticatedShell pageLabel="Fiche introuvable">
      <main className="grid min-h-[60svh] place-items-center px-5">
        <div className="max-w-lg rounded-2xl border bg-card p-7 text-center shadow-sm">
          <h1 className="font-display text-2xl font-semibold">Cette fiche est introuvable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Elle a peut-être été supprimée, mise à la corbeille, ou elle appartient à un autre joueur. Eraser a relu Google Sheets avant de conclure.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Revenir à l’accueil</Link>
            <a href={`/personnage/${encodeURIComponent(id)}`} className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Réessayer</a>
          </div>
        </div>
      </main>
    </AuthenticatedShell>
  )

  return (
    <AuthenticatedShell pageLabel={indexedCharacter.name}>
      <Suspense key={id} fallback={<DeferredPageLoading variant="sheet" title={indexedCharacter.name} label="Chargement de la fiche…" />}>
        <CharacterData id={id} accountUid={account.uid} role={account.role} />
      </Suspense>
    </AuthenticatedShell>
  )
}
