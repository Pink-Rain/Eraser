import { NextResponse } from "next/server"

import { canManagePages, pageForViewer, viewBlockKinds, type ViewBlockKind } from "@/lib/custom-pages"
import { statBlockData, viewBlockData, viewKindsOf, type IndexSource } from "@/lib/custom-pages-data"
import { readCustomPage } from "@/lib/custom-pages-store"
import { viewerFor } from "@/lib/custom-pages-server"
import { listCustomIndexes } from "@/lib/custom-indexes"
import { listIndexCards } from "@/lib/index-cards-store"
import { listIndexPresentations, listIndexStatsRecord } from "@/lib/index-presentations-store"
import { entityColumnHiddenForPlayers } from "@/lib/index-references-entities"
import { authorizedAccount } from "@/lib/server-auth"
import { worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick, knownWorldIndexKey } from "@/lib/world-indexes"

const denied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })
const kinds = viewBlockKinds.map((kind) => kind.value)

async function sourceOf(key: WorldIndexKey): Promise<IndexSource> {
  const data = await getWorldIndexQuick(key)
  return {
    key,
    title: data.definition.title,
    path: data.definition.path,
    nameHref: data.definition.entity?.nameHref,
    nameHeader: data.definition.entity?.nameHeader,
    tables: data.tables.map((table) => ({ tabName: table.tabName, headers: table.headers, rows: table.rows })),
    columns: data.columns,
  }
}

/** Les calendriers de l'Index des calendriers, pour une vue Calendrier (un joueur ne peut pas les lire ailleurs). */
async function calendarTables() {
  const data = await getWorldIndexQuick("calendars").catch(() => null)
  return data ? data.tables.map((table) => ({ tabName: table.tabName, headers: table.headers, rows: table.rows.map((row) => ({ values: row.values })) })) : []
}

async function viewData(key: WorldIndexKey, input: { tab: string; kind: ViewBlockKind; limit: number }, player: boolean) {
  const [source, presentations, cards] = await Promise.all([sourceOf(key), listIndexPresentations(key).catch(() => ({})), listIndexCards(key).catch(() => ({}))])
  const data = viewBlockData(source, input, { presentations, cards }, { player, hiddenForPlayers: (column) => entityColumnHiddenForPlayers(key, column) })
  if (!data) return null
  return { ...data, ...(input.kind === "calendar" ? { calendars: await calendarTables() } : {}) }
}

async function statData(key: WorldIndexKey, statId: string, player: boolean) {
  const [source, record] = await Promise.all([sourceOf(key), listIndexStatsRecord(key)])
  return statBlockData(source, record, statId, { player, hiddenForPlayers: (column) => entityColumnHiddenForPlayers(key, column) })
}

/**
 * Les données d'un bloc Vue d'index ou Stat épinglée.
 * - ?page=&block= : pour tout lecteur de la page qui voit ce bloc (les joueurs n'ont pas
 *   accès aux routes des index : seul ce que le bloc montre leur est envoyé).
 * - ?index=&tab=&kind=&limit= ou ?index=&stat= : pour l'atelier (MJ et admins).
 * - ?catalog=1 (&index=) : les index, leurs onglets, leurs vues et leurs stats (atelier).
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return denied()
  const parameters = new URL(request.url).searchParams
  const player = account.role === "joueur"
  try {
    if (parameters.get("catalog")) {
      if (!canManagePages(account.role)) return denied()
      const wanted = parameters.get("index")
      if (!wanted) {
        const builtin = Object.values(worldIndexDefinitions).map((definition) => ({ key: definition.key, title: definition.title, path: definition.path }))
        const custom = (await listCustomIndexes().catch(() => [])).map((entry) => ({ key: entry.key, title: entry.title, path: `/ressources/index/${entry.key}` }))
        return NextResponse.json({ indexes: [...builtin, ...custom].sort((left, right) => left.title.localeCompare(right.title, "fr")) })
      }
      const key = await knownWorldIndexKey(wanted)
      if (!key) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
      const [data, presentations, cards, record] = await Promise.all([getWorldIndexQuick(key), listIndexPresentations(key).catch(() => ({})), listIndexCards(key).catch(() => ({})), listIndexStatsRecord(key).catch(() => ({ stats: [], groups: [] }))])
      return NextResponse.json({
        tabs: data.tables.map((table) => ({ name: table.tabName, kinds: viewKindsOf(presentations, table.tabName), cards: Object.entries(cards).some(([name, entry]) => name.toLocaleLowerCase("fr") === table.tabName.toLocaleLowerCase("fr") && entry.cards.length > 0) })),
        stats: record.stats.map((stat) => ({ id: stat.id, title: stat.title, pinned: Boolean(stat.pinned) })),
      })
    }

    const pageId = parameters.get("page")
    if (pageId) {
      const page = await readCustomPage(pageId)
      const view = page ? pageForViewer(page, await viewerFor(account, page), { draft: parameters.get("draft") === "1" }) : null
      const block = view?.sections.flatMap((section) => section.cols.flat()).find((item) => item.id === parameters.get("block"))
      if (!block || (block.type !== "view" && block.type !== "stat")) return NextResponse.json({ error: "Ce bloc n’existe pas, ou il ne t’est pas ouvert." }, { status: 404 })
      const key = await knownWorldIndexKey(block.index)
      if (!key) return NextResponse.json({ error: "L’index de ce bloc n’existe plus." }, { status: 404 })
      const data = block.type === "view" ? await viewData(key, block, player) : await statData(key, block.statId, player)
      return data ? NextResponse.json({ data }) : NextResponse.json({ error: block.type === "view" ? "L’onglet de ce bloc n’existe plus dans l’index." : "Cette statistique n’existe plus dans l’index." }, { status: 404 })
    }

    if (!canManagePages(account.role)) return denied()
    // L'aperçu « Voir comme Joueur » de l'atelier : ce qu'un joueur recevrait.
    const asPlayer = parameters.get("as") === "joueur"
    const key = await knownWorldIndexKey(parameters.get("index"))
    if (!key) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
    const statId = parameters.get("stat")
    if (statId) {
      const data = await statData(key, statId, asPlayer)
      return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Cette statistique n’existe plus dans l’index." }, { status: 404 })
    }
    const kind = kinds.includes(parameters.get("kind") as ViewBlockKind) ? parameters.get("kind") as ViewBlockKind : "table"
    const limit = Math.max(0, Math.min(500, Number.parseInt(parameters.get("limit") ?? "0", 10) || 0))
    const data = await viewData(key, { tab: parameters.get("tab") ?? "", kind, limit }, asPlayer)
    return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Cet onglet n’existe pas dans l’index." }, { status: 404 })
  } catch (error) {
    console.error("PAGE_BLOCK_DATA_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les données de ce bloc n’ont pas pu être lues (Google est peut-être saturé). Réessaie dans un instant." }, { status: 502 })
  }
}
