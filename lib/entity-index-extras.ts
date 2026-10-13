import { describeOwners, listAllCampaignsForAdmin, listAllCharactersForAdmin, listClasses, listIndexedClasses, trashedItemIds } from "@/lib/google-sheets"
import { classRankColumnsOf, classRankLabels, classRankOf, rankColumnsForPages } from "@/lib/class-rank-columns"
import { MAX_CLASS_SPELLS_PER_RANK } from "@/lib/class-spell-utils"
import { ownersOf } from "@/lib/ownership"
import { classImageUrl } from "@/lib/class-images"
import { isImageSource } from "@/lib/index-columns"
import { isLegacyListCell, parseListCell, serializeListCell } from "@/lib/multiple-values"
import { listAccounts } from "@/lib/site-auth"
import { foldName, isClassRankHeader } from "@/lib/world-index-definitions"
import type { ClassRanksExtra, EntityIndexExtras, WorldIndexData } from "@/lib/world-indexes"

/**
 * Ce que l'Index des personnages et celui des campagnes montrent en plus des colonnes de
 * leur feuille : le propriétaire de chaque ligne (et, pour un administrateur, à qui
 * l'attribuer) et les liens entre personnages et campagnes. Les lignes à la corbeille ne
 * sont pas montrées : elles se restaurent depuis Administration. Lu à chaque requête, pas
 * gardé avec l'index (les comptes dépendent de qui regarde).
 */
/**
 * L'Index des classes : la case Image montre l'image actuelle de chaque classe, même quand
 * la feuille la garde en formule =IMAGE, en image dans la cellule ou en note du Drive (la
 * case n'a alors pas de texte). Affichage seulement : rien n'est écrit tant qu'on n'importe
 * pas une autre image.
 */
async function withClassImages(data: WorldIndexData): Promise<WorldIndexData> {
  try {
    const images = new Map((await listIndexedClasses()).flatMap((item) => { const url = classImageUrl(item.image); return url ? [[item.id, url] as const] : [] }))
    return {
      ...data,
      tables: data.tables.map((table) => {
        const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
        const imageColumn = table.headers.findIndex((header) => foldName(header) === "image")
        if (idColumn < 0 || imageColumn < 0) return table
        return {
          ...table,
          rows: table.rows.map((row) => {
            const current = row.values[imageColumn] ?? ""
            const shown = images.get((row.values[idColumn] ?? "").trim())
            if (isImageSource(current) || !shown) return row
            const values = [...row.values]; const html = [...row.html]
            values[imageColumn] = shown; html[imageColumn] = shown
            return { ...row, values, html }
          }),
        }
      }),
    }
  } catch (error) {
    console.error("CLASS_INDEX_IMAGES_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return data
  }
}

/** Les cases à plusieurs valeurs d'un personnage (écrites par la fiche). */
const LIST_HEADERS = new Set(["peuple", "classe", "titre honorifique", "langue parlee", "langues parlees", "religion"])

/**
 * L'Index des personnages : une case encore écrite en ancien JSON (`["Chamane"]`,
 * `{"values": […], "selected": "…"}`) se montre en texte lisible (« A · B », le titre
 * choisi en premier), le format que la fiche écrit désormais. Affichage seulement : la
 * feuille garde son texte jusqu'à ce que la case (ou la fiche) soit modifiée.
 */
function withReadableLists(data: WorldIndexData): WorldIndexData {
  return {
    ...data,
    tables: data.tables.map((table) => {
      const columns = table.headers.flatMap((header, at) => LIST_HEADERS.has(foldName(header)) ? [at] : [])
      if (!columns.length) return table
      return {
        ...table,
        rows: table.rows.map((row) => {
          const legacy = columns.filter((at) => isLegacyListCell(row.values[at]))
          if (!legacy.length) return row
          const values = [...row.values]; const html = [...row.html]
          for (const at of legacy) {
            const { entries, selected } = parseListCell(values[at])
            values[at] = serializeListCell(entries, selected)
            html[at] = escapeHtml(values[at])
          }
          return { ...row, values, html }
        }),
      }
    }),
  }
}

/**
 * Index des personnages et des campagnes : leurs cases sont écrites par la fiche et le
 * tableau de bord, en texte simple. Une couleur de texte ou de fond posée dans Google
 * Sheets (souvent un blanc hérité de la mise en forme de la feuille) les rendait
 * illisibles : elle est ignorée à l'affichage, le reste de la mise en forme est gardé.
 */
function withoutSheetColors(data: WorldIndexData): WorldIndexData {
  const strip = (html: string) => html
    .replace(/\sstyle=(["'])(.*?)\1/gi, (_match, quote: string, css: string) => {
      const kept = css.split(";").filter((declaration) => declaration.trim() && !/^\s*(?:color|background(?:-color)?)\s*:/i.test(declaration)).join(";")
      return kept ? ` style=${quote}${kept}${quote}` : ""
    })
    .replace(/<font\b[^>]*>/gi, "").replace(/<\/font>/gi, "")
  return { ...data, tables: data.tables.map((table) => ({ ...table, rows: table.rows.map((row) => row.html.some((html) => /color|<font/i.test(html)) ? { ...row, html: row.html.map(strip) } : row) })) }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Les sorts des classes : la colonne « Classes et rangs » (une pastille par classe, avec son
 * rang), tirée des colonnes de rang de la feuille, qui restent dans Sheets mais sortent du
 * tableau (masquées, en lecture seule) : un rang n'admet que trois sorts, seule cette colonne
 * le vérifie. Les classes viennent de la mémoire locale : aucune lecture Google en plus.
 */
async function withClassRanks(data: WorldIndexData): Promise<WorldIndexData> {
  try {
    // La mémoire locale d'abord ; une installation neuve lit la liste des classes une fois. Illisible
    // (Google saturé) : la colonne le dit au lieu de disparaître, et les rangs ne se modifient pas.
    const indexed = await listIndexedClasses()
    let classes = indexed
    let error = ""
    if (!classes.length) {
      try { classes = await listClasses() } catch (reason) {
        console.error("CLASS_RANKS_CLASSES_FAILED", reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
        error = "Les classes n’ont pas pu être lues : actualise dans un instant pour régler les rangs."
      }
    }
    const ranks: ClassRanksExtra = { options: classes.map((item) => ({ id: item.id, name: item.name, color: item.accentDark })), headers: {}, rows: {}, perRankLimit: MAX_CLASS_SPELLS_PER_RANK, ...(error ? { error } : {}) }
    const columns = { ...data.columns }
    for (const table of data.tables) {
      const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
      const rankColumns = classRankColumnsOf(table.headers, classes)
      const rankHeaders = new Set([...rankColumns.map(({ column }) => table.headers[column]), ...table.headers.filter((header) => isClassRankHeader(header, classes.map((item) => item.name)))])
      ranks.headers[table.tabName] = [...rankHeaders]
      columns[table.tabName] = (columns[table.tabName] ?? []).map((column) => rankHeaders.has(column.header) ? { ...column, spec: { ...column.spec, hidden: true, readOnly: true } } : column)
      if (idColumn < 0) continue
      for (const row of table.rows) {
        const id = (row.values[idColumn] ?? "").trim()
        if (!id) continue
        const linked: Record<string, number> = {}
        for (const { classId, column } of rankColumns) {
          const rank = classRankOf(row.values[column])
          if (rank !== null) linked[classId] = rank
        }
        ranks.rows[id] = linked
      }
    }
    return { ...data, columns, classRanks: ranks }
  } catch (error) {
    console.error("CLASS_RANKS_EXTRA_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return data
  }
}

/** Les sorts des classes lus par une page : une colonne de rang par classe, nommée par son identifiant. */
async function withPageClassRanks(data: WorldIndexData): Promise<WorldIndexData> {
  try {
    let classes = await listIndexedClasses()
    if (!classes.length) classes = await listClasses()
    const { tables, rankHeaders } = rankColumnsForPages(data.tables, classes)
    const columns = { ...data.columns }
    for (const [tab, headers] of Object.entries(rankHeaders)) {
      const kept = (columns[tab] ?? []).filter((column) => !isClassRankHeader(column.header, classes.map((item) => item.name)))
      columns[tab] = [...kept, ...headers.map((header) => ({ header, spec: { kind: "choice" as const, options: classRankLabels.map((value) => ({ value })) } }))]
    }
    return { ...data, tables, columns }
  } catch (error) {
    console.error("PAGE_CLASS_RANKS_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return data
  }
}

/**
 * Un index lu par une page du créateur de pages : les classes y montrent leur image actuelle
 * et leur finition réelle (calculée sur leurs sorts, comme la page Règles › Classes : la case
 * « Finition » de la feuille n'est qu'un repli). Affichage seulement, rien n'est écrit.
 */
/**
 * Une colonne de plus pour les pages : « Campagnes » d'un personnage (aux couleurs des
 * campagnes), « Personnages » d'une campagne — les liens que l'index local connaît, que
 * l'accueil montrait sous chaque carte. Affichage seulement : rien n'est écrit dans la feuille.
 */
async function withEntityLinkColumn(data: WorldIndexData): Promise<WorldIndexData> {
  const character = data.key === "characters"
  const header = character ? "Campagnes" : "Personnages"
  const links = new Map<string, Array<{ name: string; color?: string }>>()
  if (character) for (const item of await listAllCharactersForAdmin()) links.set(item.id, item.campaigns.map((campaign) => ({ name: campaign.name, color: campaign.accentColor })))
  else for (const item of await listAllCampaignsForAdmin()) links.set(item.id, item.characters.map((entry) => ({ name: entry.name })))
  const options = new Map<string, { value: string; color?: string }>()
  for (const list of links.values()) for (const link of list) if (link.name && !options.has(link.name)) options.set(link.name, { value: link.name, ...(link.color ? { color: link.color } : {}) })
  const present = (headers: string[]) => headers.some((candidate) => foldName(candidate) === foldName(header))
  const tables = data.tables.map((table) => {
    const idColumn = table.headers.findIndex((candidate) => foldName(candidate) === "id")
    if (idColumn < 0 || present(table.headers)) return table
    return { ...table, headers: [...table.headers, header], rows: table.rows.map((row) => {
      const cell = (links.get((row.values[idColumn] ?? "").trim()) ?? []).map((link) => link.name).filter(Boolean).join(", ")
      return { ...row, values: [...row.values, cell], html: [...row.html, cell] }
    }) }
  })
  const columns = { ...data.columns }
  for (const table of tables) {
    const known = columns[table.tabName] ?? []
    if (!present(known.map((column) => column.header))) columns[table.tabName] = [...known, { header, spec: { kind: "choice", multiple: true, options: [...options.values()] } }]
  }
  return { ...data, tables, columns }
}

export async function forPageReading(data: WorldIndexData): Promise<WorldIndexData> {
  if (data.key === "class-spells") return withPageClassRanks(data)
  // Les personnages et les campagnes à la corbeille ne s'affichent pas (comme dans leur index) ;
  // chaque personnage montre ses campagnes, chaque campagne ses personnages (colonne dérivée).
  if (data.key === "characters" || data.key === "campaigns") {
    try {
      const trashed = await trashedItemIds(data.key === "characters" ? "character" : "campaign")
      const kept = !trashed.size ? data : { ...data, tables: data.tables.map((table) => {
        const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
        return idColumn < 0 ? table : { ...table, rows: table.rows.filter((row) => !trashed.has((row.values[idColumn] ?? "").trim())) }
      }) }
      return await withEntityLinkColumn(kept)
    } catch (error) {
      console.error("PAGE_TRASHED_ENTITIES_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
      return data
    }
  }
  if (data.key !== "classes") return data
  const shown = await withClassImages(data)
  try {
    const { classSpellsForDisplay } = await import("@/lib/class-content")
    const { classSpellState } = await import("@/lib/class-spell-utils")
    const { spells } = await classSpellsForDisplay()
    return {
      ...shown,
      tables: shown.tables.map((table) => {
        const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
        const finish = table.headers.findIndex((header) => foldName(header) === "finition")
        if (idColumn < 0 || finish < 0) return table
        return { ...table, rows: table.rows.map((row) => {
          const id = (row.values[idColumn] ?? "").trim()
          if (!id) return row
          const completion = String(classSpellState(spells, id).completion)
          const values = [...row.values]; const html = [...row.html]
          values[finish] = completion; html[finish] = completion
          return { ...row, values, html }
        }) }
      }),
    }
  } catch (error) {
    console.error("CLASS_PAGE_COMPLETION_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return shown
  }
}

export async function withEntityExtras(data: WorldIndexData, account: { role: string }, token?: string): Promise<WorldIndexData> {
  if (data.key === "classes") return withClassImages(data)
  if (data.key === "class-spells") return withClassRanks(data)
  if (data.key !== "characters" && data.key !== "campaigns") return data
  data = withoutSheetColors(data.key === "characters" ? withReadableLists(data) : data)
  const kind = data.key === "characters" ? "character" : "campaign"
  const isAdmin = account.role === "admin"
  try {
    const [trashed, accounts] = await Promise.all([trashedItemIds(kind), isAdmin ? listAccounts(token).catch(() => []) : Promise.resolve([])])
    // Les liens (campagnes d'un personnage, personnages d'une campagne) viennent de l'index local.
    const links = new Map<string, EntityIndexExtras["rows"][string]["links"]>()
    if (kind === "character") {
      for (const character of await listAllCharactersForAdmin(token)) links.set(character.id, character.campaigns.map((campaign) => ({ label: campaign.name, href: `/campagne/${encodeURIComponent(campaign.id)}`, color: campaign.accentColor, title: "Ouvrir la campagne" })))
    } else {
      for (const campaign of await listAllCampaignsForAdmin(token)) links.set(campaign.id, campaign.characters.map((character) => ({ label: character.name, href: `/personnage/${encodeURIComponent(character.id)}`, title: "Ouvrir la fiche" })))
    }
    // Le propriétaire de chaque ligne est lu dans la feuille elle-même (colonne « Joueur » ou
    // « MJ ») : une ligne que l'index local ne connaît pas (ou plus) s'attribue, se met à la
    // corbeille et se restaure comme les autres. Un administrateur voit aussi les lignes à la
    // corbeille, pour faire le tri ; les autres ne les voient pas.
    const ownerHeader = kind === "character" ? "joueur" : "mj"
    const rows: EntityIndexExtras["rows"] = {}
    const tables = data.tables.map((table) => {
      const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
      if (idColumn < 0) return table
      return isAdmin ? table : { ...table, rows: table.rows.filter((row) => !trashed.has((row.values[idColumn] ?? "").trim())) }
    })
    const cells: Array<{ id: string; cell: string }> = []
    for (const table of tables) {
      const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
      const ownerColumn = table.headers.findIndex((header) => foldName(header) === ownerHeader)
      if (idColumn < 0) continue
      for (const row of table.rows) {
        const id = (row.values[idColumn] ?? "").trim()
        if (id) cells.push({ id, cell: ownerColumn >= 0 ? (row.values[ownerColumn] ?? "").trim() : "" })
      }
    }
    const owners = await describeOwners(cells.map((item) => item.cell), token)
    for (const { id, cell } of cells) {
      const owner = owners.get(cell)
      rows[id] = {
        ownerUid: cell,
        ownerUids: owner?.ownerUids ?? ownersOf(cell),
        ownerName: owner?.ownerName ?? "Sans propriétaire",
        ownerDetail: owner?.ownerEmail || cell || "Aucun compte",
        links: links.get(id) ?? [],
        ...(trashed.has(id) ? { trashed: true } : {}),
      }
    }
    return {
      ...data,
      tables,
      extras: {
        linksLabel: kind === "character" ? "Campagnes" : "Personnages",
        rows,
        accounts,
        canAssign: isAdmin,
      },
    }
  } catch (error) {
    // Sans comptes ni liens, l'index reste lisible : seules ces colonnes manquent.
    console.error("ENTITY_INDEX_EXTRAS_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return data
  }
}
