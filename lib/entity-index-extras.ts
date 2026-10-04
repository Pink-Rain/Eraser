import { listAllCampaignsForAdmin, listAllCharactersForAdmin, listIndexedClasses, trashedItemIds } from "@/lib/google-sheets"
import { ownersOf } from "@/lib/ownership"
import { classImageUrl } from "@/lib/class-images"
import { isImageSource } from "@/lib/index-columns"
import { isLegacyListCell, parseListCell, serializeListCell } from "@/lib/multiple-values"
import { listAccounts } from "@/lib/site-auth"
import { foldName } from "@/lib/world-index-definitions"
import type { EntityIndexExtras, WorldIndexData } from "@/lib/world-indexes"

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

export async function withEntityExtras(data: WorldIndexData, account: { role: string }, token?: string): Promise<WorldIndexData> {
  if (data.key === "classes") return withClassImages(data)
  if (data.key !== "characters" && data.key !== "campaigns") return data
  data = withoutSheetColors(data.key === "characters" ? withReadableLists(data) : data)
  const kind = data.key === "characters" ? "character" : "campaign"
  const isAdmin = account.role === "admin"
  try {
    const [trashed, accounts] = await Promise.all([trashedItemIds(kind), isAdmin ? listAccounts(token).catch(() => []) : Promise.resolve([])])
    const rows: EntityIndexExtras["rows"] = {}
    if (kind === "character") {
      for (const character of await listAllCharactersForAdmin(token)) rows[character.id] = {
        ownerUid: character.ownerUid,
        ownerUids: character.ownerUids,
        ownerName: character.ownerName,
        ownerDetail: character.ownerEmail || character.ownerUid || "Aucun compte",
        links: character.campaigns.map((campaign) => ({ label: campaign.name, href: `/campagne/${encodeURIComponent(campaign.id)}`, color: campaign.accentColor, title: "Ouvrir la campagne" })),
      }
    } else {
      for (const campaign of await listAllCampaignsForAdmin(token)) rows[campaign.id] = {
        ownerUid: campaign.mjUid,
        ownerUids: campaign.ownerUids,
        ownerName: campaign.ownerName,
        ownerDetail: campaign.ownerEmail || campaign.mjUid || "Aucun compte",
        links: campaign.characters.map((character) => ({ label: character.name, href: `/personnage/${encodeURIComponent(character.id)}`, title: "Ouvrir la fiche" })),
      }
    }
    // Un administrateur voit aussi les lignes à la corbeille, pour faire le tri : il les
    // restaure ou les supprime d'ici. Les autres ne les voient pas.
    const ownerHeader = kind === "character" ? "joueur" : "mj"
    const names = new Map(accounts.map((item) => [item.uid, item.displayName || item.email]))
    const tables = data.tables.map((table) => {
      const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
      if (idColumn < 0) return table
      if (!isAdmin) return { ...table, rows: table.rows.filter((row) => !trashed.has((row.values[idColumn] ?? "").trim())) }
      const ownerColumn = table.headers.findIndex((header) => foldName(header) === ownerHeader)
      for (const row of table.rows) {
        const id = (row.values[idColumn] ?? "").trim()
        if (!id || !trashed.has(id)) continue
        const cell = ownerColumn >= 0 ? (row.values[ownerColumn] ?? "").trim() : ""
        const ownerUids = ownersOf(cell)
        rows[id] = {
          ownerUid: cell,
          ownerUids,
          ownerName: ownerUids.map((uid) => names.get(uid) || "Identifiant historique").join(" & ") || "Sans propriétaire",
          ownerDetail: cell || "Aucun compte",
          links: [],
          trashed: true,
        }
      }
      return table
    })
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
