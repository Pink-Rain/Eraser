import { NextResponse } from "next/server"

import { canManagePages, pageForViewer, viewBlockKinds, type ViewBlockKind } from "@/lib/custom-pages"
import { statBlockData, viewBlockData, viewKindsOf, type BlockDataOptions } from "@/lib/custom-pages-data"
import { backlinksOf, rowContextOf, rowPageHref, templateForRow } from "@/lib/custom-pages-rows"
import { readCustomPage } from "@/lib/custom-pages-store"
import { backlinkSources, indexSourceOf, readOptions, rowTemplates, viewerFor } from "@/lib/custom-pages-server"
import { listCustomIndexes } from "@/lib/custom-indexes"
import { listIndexCards } from "@/lib/index-cards-store"
import { listIndexPresentations, listIndexStatsRecord } from "@/lib/index-presentations-store"
import { listIndexViews } from "@/lib/index-settings"
import { cleanViewLayout, presentationFor, type PresentationKind } from "@/lib/index-view-layouts"
import { ALL_SOURCES } from "@/lib/index-views"
import { authorizedAccount } from "@/lib/server-auth"
import { worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick, knownWorldIndexKey } from "@/lib/world-indexes"

const denied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })
const kinds = viewBlockKinds.map((kind) => kind.value)

/** Les calendriers de l'Index des calendriers, pour une vue Calendrier (un joueur ne peut pas les lire ailleurs). */
async function calendarTables() {
  const data = await getWorldIndexQuick("calendars").catch(() => null)
  return data ? data.tables.map((table) => ({ tabName: table.tabName, headers: table.headers, rows: table.rows.map((row) => ({ values: row.values })) })) : []
}

type RowPageOf = BlockDataOptions["rowPageOf"]

/** Une vue enregistrée de l'index (onglet-fenêtre), lue seulement quand le bloc en désigne une. */
async function savedView(key: WorldIndexKey, viewId: string | undefined) {
  if (!viewId) return null
  return (await listIndexViews(key).catch(() => [])).find((view) => view.id === viewId) ?? null
}

async function viewData(key: WorldIndexKey, input: Omit<Parameters<typeof viewBlockData>[1], "view"> & { viewId?: string }, player: boolean, rowPageOf: RowPageOf) {
  const [source, presentations, cards, view] = await Promise.all([indexSourceOf(key), listIndexPresentations(key).catch(() => ({})), listIndexCards(key).catch(() => ({})), savedView(key, input.viewId)])
  const data = viewBlockData(source, { ...input, view }, { presentations, cards }, readOptions(key, player, rowPageOf))
  if (!data) return null
  return { ...data, ...(input.kind === "calendar" ? { calendars: await calendarTables() } : {}) }
}

async function statData(key: WorldIndexKey, statId: string, player: boolean, rowPageOf: RowPageOf) {
  const [source, record] = await Promise.all([indexSourceOf(key), listIndexStatsRecord(key)])
  return statBlockData(source, record, statId, readOptions(key, player, rowPageOf))
}

/**
 * Les données d'un bloc Vue d'index, Stat épinglée ou « Cité dans ».
 * - ?page=&block= (&rowIndex=&rowId= pour une page de ligne) : pour tout lecteur de la page qui
 *   voit ce bloc (les joueurs n'ont pas accès aux routes des index : seul ce que le bloc montre
 *   leur est envoyé, sans colonne masquée ni privée).
 * - ?index=&tab=&kind=&limit= ou ?index=&stat= : pour l'atelier (MJ et admins ; &as=joueur :
 *   ce que recevrait un joueur).
 * - ?catalog=1 (&index=) : les index, leurs onglets, leurs vues et leurs stats (atelier).
 * - ?row-templates=1 : les index dont les lignes ont une page (fiche de l'index).
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return denied()
  const parameters = new URL(request.url).searchParams
  const player = account.role === "joueur"
  try {
    const templates = await rowTemplates(account).catch(() => [])
    const rowPageOf: RowPageOf = templates.length ? (index, tab, id) => templateForRow(templates, index, tab) ? rowPageHref(index, id) : undefined : undefined

    if (parameters.get("row-templates")) return NextResponse.json({ templates: templates.map((page) => ({ index: page.rowOf!.index, tab: page.rowOf!.tab ?? "" })) })

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
      const [data, presentations, cards, record, views] = await Promise.all([getWorldIndexQuick(key), listIndexPresentations(key).catch(() => ({})), listIndexCards(key).catch(() => ({})), listIndexStatsRecord(key).catch(() => ({ stats: [], groups: [] })), listIndexViews(key).catch(() => [])])
      const cardsOf = (tab: string) => Object.entries(cards).find(([name]) => name.toLocaleLowerCase("fr") === tab.toLocaleLowerCase("fr"))?.[1]?.cards ?? []
      return NextResponse.json({
        tabs: data.tables.map((table) => ({
          name: table.tabName,
          // Les présentations déjà réglées dans l'index ; toutes restent proposées.
          configured: viewKindsOf(presentations, table.tabName),
          // Leurs formes : la forme propre à une page part de celle de l'index.
          forms: Object.fromEntries(viewKindsOf(presentations, table.tabName).map((kind) => [kind, presentationFor(presentations, table.tabName, kind as PresentationKind)])),
          cards: cardsOf(table.tabName).length > 0,
          cardList: cardsOf(table.tabName).map((card) => ({ id: card.id, name: card.name })),
          columns: (data.columns[table.tabName] ?? []).map((column) => column.header).filter((header) => !/^id$/i.test(header)),
          // Les vues enregistrées de l'index qui portent sur cet onglet (ou sur tous).
          views: views.filter((view) => view.source === ALL_SOURCES || view.source.toLocaleLowerCase("fr") === table.tabName.toLocaleLowerCase("fr")).map((view) => ({ id: view.id, name: view.name, kind: view.layout?.kind ?? "table" })),
        })),
        stats: record.stats.map((stat) => ({ id: stat.id, title: stat.title, pinned: Boolean(stat.pinned) })),
      })
    }

    const pageId = parameters.get("page")
    if (pageId) {
      const page = await readCustomPage(pageId)
      const view = page ? pageForViewer(page, await viewerFor(account, page), { draft: parameters.get("draft") === "1" }) : null
      const block = view?.sections.flatMap((section) => section.cols.flat()).find((item) => item.id === parameters.get("block"))
      if (!block || (block.type !== "view" && block.type !== "stat" && block.type !== "backlinks")) return NextResponse.json({ error: "Ce bloc n’existe pas, ou il ne t’est pas ouvert." }, { status: 404 })
      // Page de ligne : la ligne affichée, lue comme le lecteur peut la lire.
      const rowKey = page?.rowOf?.index ? await knownWorldIndexKey(parameters.get("rowIndex")) : null
      const row = rowKey && rowKey === page?.rowOf?.index ? rowContextOf(await indexSourceOf(rowKey), parameters.get("rowId") ?? "", readOptions(rowKey, player)) : null
      if (block.type === "backlinks") {
        if (!row) return NextResponse.json({ data: { kind: "backlinks", items: [] } })
        const items = backlinksOf(await backlinkSources(), row, { ...readOptions(row.index, player), hrefOf: (index, tab, id) => rowPageOf?.(index, tab, id) ?? (player ? undefined : `${(worldIndexDefinitions as Record<string, { path: string } | undefined>)[index]?.path ?? `/ressources/index/${encodeURIComponent(index)}`}?ligne=${encodeURIComponent(id)}`) })
        return NextResponse.json({ data: { kind: "backlinks", items } })
      }
      const key = await knownWorldIndexKey(block.index)
      if (!key) return NextResponse.json({ error: "L’index de ce bloc n’existe plus." }, { status: 404 })
      const match = block.type === "view" && block.rowMatch && row ? { column: block.rowMatch, index: row.index, id: row.id, name: row.name } : undefined
      const data = block.type === "view" ? await viewData(key, { tab: block.tab, kind: block.kind, limit: block.limit, match, layout: block.layout, viewId: block.viewId }, player, rowPageOf) : await statData(key, block.statId, player, rowPageOf)
      return data ? NextResponse.json({ data }) : NextResponse.json({ error: block.type === "view" ? "L’onglet de ce bloc n’existe plus dans l’index." : "Cette statistique n’existe plus dans l’index." }, { status: 404 })
    }

    if (!canManagePages(account.role)) return denied()
    // L'aperçu « Voir comme Joueur » de l'atelier : ce qu'un joueur recevrait.
    const asPlayer = parameters.get("as") === "joueur"
    const key = await knownWorldIndexKey(parameters.get("index"))
    if (!key) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
    const statId = parameters.get("stat")
    if (statId) {
      const data = await statData(key, statId, asPlayer, rowPageOf)
      return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Cette statistique n’existe plus dans l’index." }, { status: 404 })
    }
    const kind = kinds.includes(parameters.get("kind") as ViewBlockKind) ? parameters.get("kind") as ViewBlockKind : "table"
    const limit = Math.max(0, Math.min(500, Number.parseInt(parameters.get("limit") ?? "0", 10) || 0))
    // L'atelier envoie la forme propre au bloc (encore non enregistrée) et sa vue enregistrée.
    let layout: ReturnType<typeof cleanViewLayout>
    try { layout = cleanViewLayout(JSON.parse(parameters.get("layout") ?? "null")) } catch { layout = undefined }
    const data = await viewData(key, { tab: parameters.get("tab") ?? "", kind, limit, layout, viewId: parameters.get("view") ?? undefined }, asPlayer, rowPageOf)
    return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Cet onglet n’existe pas dans l’index." }, { status: 404 })
  } catch (error) {
    console.error("PAGE_BLOCK_DATA_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les données de ce bloc n’ont pas pu être lues (Google est peut-être saturé). Réessaie dans un instant." }, { status: 502 })
  }
}
