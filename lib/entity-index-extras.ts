import { listAllCampaignsForAdmin, listAllCharactersForAdmin, trashedItemIds } from "@/lib/google-sheets"
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
export async function withEntityExtras(data: WorldIndexData, account: { role: string }, token?: string): Promise<WorldIndexData> {
  if (data.key !== "characters" && data.key !== "campaigns") return data
  const kind = data.key === "characters" ? "character" : "campaign"
  const isAdmin = account.role === "admin"
  try {
    const [trashed, accounts] = await Promise.all([trashedItemIds(kind), isAdmin ? listAccounts(token).catch(() => []) : Promise.resolve([])])
    const rows: EntityIndexExtras["rows"] = {}
    if (kind === "character") {
      for (const character of await listAllCharactersForAdmin(token)) rows[character.id] = {
        ownerUid: character.ownerUid,
        ownerName: character.ownerName,
        ownerDetail: character.ownerEmail || character.ownerUid || "Aucun compte",
        links: character.campaigns.map((campaign) => ({ label: campaign.name, href: `/campagne/${encodeURIComponent(campaign.id)}`, color: campaign.accentColor, title: "Ouvrir la campagne" })),
      }
    } else {
      for (const campaign of await listAllCampaignsForAdmin(token)) rows[campaign.id] = {
        ownerUid: campaign.mjUid,
        ownerName: campaign.ownerName,
        ownerDetail: campaign.ownerEmail || campaign.mjUid || "Aucun compte",
        links: campaign.characters.map((character) => ({ label: character.name, href: `/personnage/${encodeURIComponent(character.id)}`, title: "Ouvrir la fiche" })),
      }
    }
    const tables = data.tables.map((table) => {
      const idColumn = table.headers.findIndex((header) => foldName(header) === "id")
      return idColumn < 0 ? table : { ...table, rows: table.rows.filter((row) => !trashed.has((row.values[idColumn] ?? "").trim())) }
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
