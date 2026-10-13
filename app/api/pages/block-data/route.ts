import { NextResponse } from "next/server"
import { tabLayoutsOf } from "@/lib/index-layout-defaults"
import { tabFormsOf } from "@/lib/index-layouts"
import { listIndexLayouts } from "@/lib/index-layouts-store"

import { canManagePages, cleanBlock, pageForViewer, type ViewBlock } from "@/lib/custom-pages"
import { isMeCondition, statBlockData, viewBlockData, viewKindsOf, type BlockDataOptions } from "@/lib/custom-pages-data"
import { identityUidsForUser } from "@/lib/identity-links"
import { backlinksOf, fillRowText, rowContextOf, rowPageHref, templateForRow, type RowContext } from "@/lib/custom-pages-rows"
import { readCustomPage } from "@/lib/custom-pages-store"
import { backlinkSources, indexSourceOf, readOptions, rowTemplates, viewerFor } from "@/lib/custom-pages-server"
import { listCustomIndexes } from "@/lib/custom-indexes"
import { listIndexCards } from "@/lib/index-cards-store"
import { listIndexPresentations, listIndexStatsRecord, listViewPresets } from "@/lib/index-presentations-store"
import { builtinViewPresets, presentationFor, type PresentationKind } from "@/lib/index-view-layouts"
import { rowOfRoute } from "@/lib/page-replacements"
import { virtualEraserPage } from "@/lib/eraser-page-blueprints"
import { authorizedAccount } from "@/lib/server-auth"
import { worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick, knownWorldIndexKey } from "@/lib/world-indexes"

const denied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })

/** Les calendriers de l'Index des calendriers, pour une vue Calendrier (un joueur ne peut pas les lire ailleurs). */
async function calendarTables() {
  const data = await getWorldIndexQuick("calendars").catch(() => null)
  return data ? data.tables.map((table) => ({ tabName: table.tabName, headers: table.headers, rows: table.rows.map((row) => ({ values: row.values })) })) : []
}

type RowPageOf = BlockDataOptions["rowPageOf"]

/** La forme d'un preset de vue (ceux d'Eraser, puis ceux enregistrés), lue seulement quand le bloc en désigne un. */
async function presetLayout(presetId: string | undefined) {
  if (!presetId) return null
  const builtin = builtinViewPresets.find((preset) => preset.id === presetId)
  if (builtin) return builtin.layout
  return (await listViewPresets().catch(() => [])).find((preset) => preset.id === presetId)?.layout ?? null
}

const hasToken = (value: string | undefined) => Boolean(value && /\{[^{}]+\}/.test(value))

/**
 * Page de ligne : « {Région} » dans une condition prend la valeur de la ligne affichée, et
 * « {ID} » dans un nom de colonne (regrouper, trier, condition) prend celle de sa colonne —
 * la page d'une classe range les sorts par la colonne de la classe. Sans ligne (atelier),
 * ce qui dépend de la ligne ne s'applique pas.
 */
function blockForRow(block: ViewBlock, row: RowContext | null): ViewBlock {
  const fill = (value: string) => row ? fillRowText(value, row) : value
  // « {Moi} » n'est pas une colonne de la ligne : il désigne le lecteur (lib/custom-pages-data.ts).
  const where = block.where ? { ...block.where, conditions: block.where.conditions.flatMap((condition) => {
    const me = isMeCondition(condition)
    if (!row && ((!me && hasToken(condition.value)) || hasToken(condition.column))) return []
    return [{ ...condition, column: fill(condition.column), value: me ? condition.value : fill(condition.value) }]
  }) } : undefined
  const sort = block.sort && !(hasToken(block.sort.column) && !row) ? { ...block.sort, column: fill(block.sort.column) } : undefined
  const layout = block.layout ? { ...block.layout, ...Object.fromEntries((["groupBy", "sortBy", "kanbanColumn", "dateColumn", "parentColumn", "colorBy", "imageColumn"] as const).flatMap((key) => block.layout?.[key] ? [[key, fill(block.layout[key]!)]] : [])) } : undefined
  return { ...block, where, sort, layout }
}

async function viewData(key: WorldIndexKey, raw: ViewBlock, match: Parameters<typeof viewBlockData>[1]["match"], row: RowContext | null, player: boolean, rowPageOf: RowPageOf, uid: string) {
  const block = blockForRow(raw, row)
  // « {Moi} » : les comptes du lecteur (lus seulement si une condition le demande).
  const me = block.where?.conditions.some(isMeCondition) ? await identityUidsForUser(uid).catch(() => [uid]) : undefined
  // Ce qu'une vue lit : l'index (copie en mémoire), les formes et les cartes de l'index (copies
  // du serveur partagé, relues toutes les 30 s) et, s'il est choisi, un preset. Jamais Google.
  const [source, presentations, cards, preset, layouts] = await Promise.all([indexSourceOf(key), listIndexPresentations(key).catch(() => ({})), listIndexCards(key).catch(() => ({})), presetLayout(block.presetId), listIndexLayouts(key).catch(() => ({}))])
  const input = { tab: block.tab, kind: block.kind, limit: block.limit, match, layout: block.layout, preset, cardId: block.cardId, where: block.where, sort: block.sort, me, click: block.click }
  const data = viewBlockData(source, input, { presentations, cards, layouts }, readOptions(key, player, rowPageOf))
  if (!data) return null
  return { ...data, ...(block.kind === "calendar" ? { calendars: await calendarTables() } : {}) }
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
 * - ?index=&def= (réglages du bloc, JSON) ou ?index=&stat= : pour l'atelier (MJ et admins ; &as=joueur :
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
      const [data, presentations, cards, record, presets, layouts] = await Promise.all([getWorldIndexQuick(key), listIndexPresentations(key).catch(() => ({})), listIndexCards(key).catch(() => ({})), listIndexStatsRecord(key).catch(() => ({ stats: [], groups: [] })), listViewPresets().catch(() => []), listIndexLayouts(key).catch(() => ({}))])
      const cardsOf = (tab: string) => Object.entries(cards).find(([name]) => name.toLocaleLowerCase("fr") === tab.toLocaleLowerCase("fr"))?.[1]?.cards ?? []
      return NextResponse.json({
        tabs: data.tables.map((table) => ({
          name: table.tabName,
          // Les présentations déjà réglées dans l'index ; toutes restent proposées.
          configured: viewKindsOf(presentations, table.tabName),
          // Leurs formes : la forme propre à une page part de celle de l'index.
          forms: Object.fromEntries(viewKindsOf(presentations, table.tabName).map((kind) => [kind, presentationFor(presentations, table.tabName, kind as PresentationKind)])),
          cards: cardsOf(table.tabName).length > 0,
          // Les formulaires de l'onglet (Modifier › Formulaire) : un bloc « Valeurs de la ligne » en choisit un.
          formList: tabFormsOf(tabLayoutsOf(layouts, table.tabName)).map((form) => ({ id: form.id, name: form.name })),
          cardList: cardsOf(table.tabName).map((card) => ({ id: card.id, name: card.name })),
          columns: (data.columns[table.tabName] ?? []).map((column) => column.header).filter((header) => !/^id$/i.test(header)),
          // Les valeurs proposées des colonnes à liste : les conditions d'un bloc les suggèrent.
          choices: Object.fromEntries((data.columns[table.tabName] ?? []).flatMap((column) => column.spec.options?.length ? [[column.header, column.spec.options.map((option) => option.value).slice(0, 80)]] : [])),
        })),
        stats: record.stats.map((stat) => ({ id: stat.id, title: stat.title, pinned: Boolean(stat.pinned) })),
        // Les presets de vues (« Kanban serré », les tiens…) : autant de formes à choisir pour un bloc.
        presets: [...presets, ...builtinViewPresets].map((preset) => ({ id: preset.id, name: preset.name, kind: preset.layout.kind, builtin: Boolean(preset.builtin) })),
      })
    }

    const pageId = parameters.get("page")
    const blueprintPath = parameters.get("blueprint")
    if (pageId || blueprintPath) {
      // Une page d'Eraser dessinée par le moteur (sans page enregistrée) : son plan, aux mêmes identifiants de blocs.
      const page = pageId ? await readCustomPage(pageId) : virtualEraserPage(blueprintPath ?? "")
      const view = page ? pageForViewer(page, await viewerFor(account, page), { draft: parameters.get("draft") === "1" }) : null
      const block = view?.sections.flatMap((section) => section.cols.flat()).find((item) => item.id === parameters.get("block"))
      if (!block || (block.type !== "view" && block.type !== "stat" && block.type !== "backlinks")) return NextResponse.json({ error: "Ce bloc n’existe pas, ou il ne t’est pas ouvert." }, { status: 404 })
      // Page de ligne : la ligne affichée, lue comme le lecteur peut la lire.
      // La ligne d'une page de ligne, ou d'une page qui remplace celle d'une ligne (une classe).
      const rowIndex = page?.rowOf?.index ?? rowOfRoute(page?.replaces)?.index
      const rowKey = rowIndex ? await knownWorldIndexKey(parameters.get("rowIndex")) : null
      const row = rowKey && rowKey === rowIndex ? rowContextOf(await indexSourceOf(rowKey), parameters.get("rowId") ?? "", readOptions(rowKey, player)) : null
      if (block.type === "backlinks") {
        if (!row) return NextResponse.json({ data: { kind: "backlinks", items: [] } })
        const items = backlinksOf(await backlinkSources(), row, { ...readOptions(row.index, player), hrefOf: (index, tab, id) => rowPageOf?.(index, tab, id) ?? (player ? undefined : `${(worldIndexDefinitions as Record<string, { path: string } | undefined>)[index]?.path ?? `/ressources/index/${encodeURIComponent(index)}`}?ligne=${encodeURIComponent(id)}`) })
        return NextResponse.json({ data: { kind: "backlinks", items } })
      }
      const key = await knownWorldIndexKey(block.index)
      if (!key) return NextResponse.json({ error: "L’index de ce bloc n’existe plus." }, { status: 404 })
      const match = block.type === "view" && block.rowMatch && row ? { column: block.rowMatch, index: row.index, id: row.id, name: row.name } : undefined
      const data = block.type === "view" ? await viewData(key, block, match, row, player, rowPageOf, account.uid) : await statData(key, block.statId, player, rowPageOf)
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
    // L'atelier envoie les réglages du bloc (encore non enregistrés), remis en forme comme à l'enregistrement.
    let raw: unknown = null
    try { raw = JSON.parse(parameters.get("def") ?? "null") } catch { raw = null }
    const block = cleanBlock({ ...(raw && typeof raw === "object" ? raw : {}), type: "view", id: "atelier", index: key })
    if (!block || block.type !== "view") return NextResponse.json({ error: "Réglages du bloc illisibles." }, { status: 400 })
    const data = await viewData(key, block, undefined, null, asPlayer, rowPageOf, account.uid)
    return data ? NextResponse.json({ data }) : NextResponse.json({ error: "Cet onglet n’existe pas dans l’index." }, { status: 404 })
  } catch (error) {
    console.error("PAGE_BLOCK_DATA_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les données de ce bloc n’ont pas pu être lues (Google est peut-être saturé). Réessaie dans un instant." }, { status: 502 })
  }
}
