import { Suspense, type ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { WorldIndexManager } from "@/components/eraser/world-index-manager"
import { worldIndexDefinitions, type BuiltinWorldIndexKey, type WorldIndexKey } from "@/lib/world-index-definitions"
import { withEntityExtras } from "@/lib/entity-index-extras"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { getWorldIndex, type WorldIndexData } from "@/lib/world-indexes"

async function IndexData({ indexKey, sheetName, nameOpensDetails }: { indexKey: WorldIndexKey; sheetName: string; nameOpensDetails?: boolean }) {
  let data: WorldIndexData | null = null
  let error = ""
  try {
    const account = await authorizedAccount(["admin", "mj"])
    data = await getWorldIndex(indexKey)
    if (account) data = await withEntityExtras(data, account, await currentAuthToken())
  } catch (reason) {
    console.error("WORLD_INDEX_LOAD_FAILED", indexKey, reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
    error = `La feuille « ${sheetName} » n’a pas pu être chargée depuis Google Drive.`
  }
  return <WorldIndexManager indexKey={indexKey} initialData={data} initialError={error} nameOpensDetails={nameOpensDetails} />
}

type IndexPageHead = { title: string; sheetName: string; description?: string }

/**
 * La page d'un index, prévu par Eraser ou créé : son titre et son tableau, sur le moteur des index.
 * `aside` : un lien sous le titre (une page liée, une ancienne vue gardée).
 */
export function WorldIndexPage({ indexKey, head, aside, nameOpensDetails }: { indexKey: WorldIndexKey; head?: IndexPageHead; aside?: ReactNode; nameOpensDetails?: boolean }) {
  const { title, sheetName, description } = head ?? worldIndexDefinitions[indexKey as BuiltinWorldIndexKey]
  return (
    <div className="w-full px-4 pt-4 sm:px-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
          {head && description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      <Suspense key={indexKey} fallback={<DeferredContentLoading variant="table" label="Chargement de l’index…" />}>
        <IndexData indexKey={indexKey} sheetName={sheetName} nameOpensDetails={nameOpensDetails} />
      </Suspense>
    </div>
  )
}

/**
 * Ce qui distingue la page d'un index prévu par Eraser, et seulement ça : le reste (titre,
 * feuille, colonnes, liens) vient de sa définition et de son schéma.
 */
const pageSpecifics: Partial<Record<BuiltinWorldIndexKey, { label?: string; aside?: { href: string; text: string }; nameOpensDetails?: boolean }>> = {
  // Le nom d'une créature ouvre sa fiche ; le tableau ne garde que les colonnes de grille.
  creatures: { nameOpensDetails: true },
  vocabulary: { label: "Vocabulaire", aside: { href: "/regles/vocabulaire", text: "Voir la page Vocabulaire (Règles)" } },
  npcs: { label: "PNJs", aside: { href: "/ressources/index-des-pnjs/recuperer", text: "Ancienne vue : récupérer des PNJs d’une campagne" } },
  campaigns: { label: "Campagnes" },
  characters: { label: "Personnages" },
  classes: { label: "Classes", aside: { href: "/creation-de-classe", text: "Création de classe" } },
  "class-spells": { label: "Sorts des classes", aside: { href: "/creation-de-classe", text: "Rangs, doublons et fusion (Création de classe)" } },
  "creature-spells": { label: "Sorts des créatures", aside: { href: "/ressources/sorts-des-creatures/doublons", text: "Doublons et fusion" } },
}

/**
 * La page entière d'un index prévu par Eraser (garde MJ comprise) : chaque route n'a plus
 * qu'à la nommer, `export default worldIndexRoute("religions")`.
 */
export function worldIndexRoute(indexKey: BuiltinWorldIndexKey) {
  const specifics = pageSpecifics[indexKey] ?? {}
  return async function IndexRoute() {
    const account = await authorizedAccount(["admin", "mj"])
    if (!account) redirect("/")
    return (
      <AuthenticatedShell pageLabel={specifics.label ?? worldIndexDefinitions[indexKey].title} roles={["admin", "mj"]}>
        <WorldIndexPage
          indexKey={indexKey}
          nameOpensDetails={specifics.nameOpensDetails}
          aside={specifics.aside && <Link href={specifics.aside.href} className="text-primary underline-offset-4 hover:underline">{specifics.aside.text}</Link>}
        />
      </AuthenticatedShell>
    )
  }
}
