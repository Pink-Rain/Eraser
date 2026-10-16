/**
 * Qui regarde une ligne : les rôles d'Eraser (admin, MJ, joueur), précisés pour la ligne.
 * Un bouton de carte, l'ouverture d'un élément de liste ou le détail modifiable peuvent être
 * réservés à certains d'entre eux (plusieurs à la fois).
 *
 * - Joueur : tous les joueurs (ceux de la campagne et le propriétaire compris).
 * - Joueur de la campagne : un joueur qui a un personnage dans la campagne de la ligne (sa
 *   colonne « Campagne »), sinon dans celle du personnage choisi dans le menu.
 * - Joueur propriétaire : le joueur dont le personnage est la ligne (même identifiant ou même
 *   nom), ou la ligne d'un de ses personnages (colonne « Personnage », « PJ », « Propriétaire »).
 * - MJ : tous les MJ (celui de la campagne compris).
 * - MJ de la campagne : le MJ de la campagne de la ligne, sinon de celle choisie dans le menu
 *   (la campagne de la page et celle de la ligne reviennent au même pour lui).
 * - Admin.
 *
 * Règles pures : la page, l'aperçu des éditeurs (« Voir comme ») et les tests s'en servent.
 */
import type { SiteRole } from "@/lib/auth-types"

export type ViewRole = "player" | "player-campaign" | "player-owner" | "mj" | "mj-owner" | "admin"

export const viewRoles: Array<{ value: ViewRole; label: string; short: string; hint: string }> = [
  { value: "player", label: "Joueur", short: "Joueur", hint: "Tous les joueurs : ceux de la campagne et le propriétaire compris." },
  { value: "player-campaign", label: "Joueur de la campagne", short: "Joueur camp.", hint: "Un joueur qui a un personnage dans la campagne de la ligne (sa colonne « Campagne »), sinon dans celle du personnage choisi." },
  { value: "player-owner", label: "Joueur propriétaire", short: "Propriétaire", hint: "Le joueur dont le personnage est la ligne." },
  { value: "mj", label: "MJ", short: "MJ", hint: "Tous les MJ : celui de la campagne compris." },
  { value: "mj-owner", label: "MJ de la campagne", short: "MJ camp.", hint: "Le MJ de la campagne de la ligne, sinon de celle choisie dans le menu." },
  { value: "admin", label: "Admin", short: "Admin", hint: "L’administrateur d’Eraser." },
]

const roleSet = new Set<string>(viewRoles.map((role) => role.value))
export const isViewRole = (value: unknown): value is ViewRole => typeof value === "string" && roleSet.has(value)

/** Une liste de rôles propre (connus, sans doublon, dans l'ordre d'Eraser) ; `undefined` si vide. */
export function cleanViewRoles(value: unknown): ViewRole[] | undefined {
  if (!Array.isArray(value)) return undefined
  const kept = viewRoles.map((role) => role.value).filter((role) => value.includes(role))
  return kept.length ? kept : undefined
}

/** Ce qu'Eraser sait du lecteur : son rôle, ses personnages, ses campagnes, celle du menu. */
export type Viewer = {
  role: SiteRole
  /** Ses personnages (joueur) : identifiant, nom, campagnes (identifiants et noms). */
  characters: Array<{ id: string; name: string; campaigns: Array<{ id: string; name: string }> }>
  /** Les campagnes qu'il mène (MJ). */
  campaigns: Array<{ id: string; name: string }>
  /** La campagne de la page, ou celle choisie dans le menu (MJ), ou celles du personnage choisi (joueur). */
  context: Array<{ id: string; name: string }>
}

/** Ce qu'une ligne dit d'elle-même : son nom, son identifiant, ses cases. */
export type RoleRow = { name: string; id?: string; cell: (header: string) => string; headers: string[] }

const fold = (value: string) => value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
const parts = (value: string) => value.replace(/<[^>]+>/g, " ").split(/\s*[,;\n]\s*/).map(fold).filter(Boolean)
const campaignColumn = (header: string) => /^campagnes?$/.test(fold(header))
const ownerColumn = (header: string) => /^(personnages?|pj|proprietaire|propriétaire)$/.test(fold(header))
const sameCampaign = (wanted: string[], known: Array<{ id: string; name: string }>) => known.some((campaign) => wanted.includes(fold(campaign.id)) || wanted.includes(fold(campaign.name)))

/** Les rôles que tient le lecteur pour cette ligne (sans ligne : ceux de la page). */
export function viewerRolesFor(viewer: Viewer, row?: RoleRow): Set<ViewRole> {
  if (viewer.role === "admin") return new Set(["admin"])
  const rowCampaigns = row ? row.headers.filter(campaignColumn).flatMap((header) => parts(row.cell(header))) : []
  // La campagne de la ligne, si elle en dit une ; sinon celle de la page (ou du menu).
  const campaigns = rowCampaigns.length ? rowCampaigns : viewer.context.flatMap((campaign) => [fold(campaign.id), fold(campaign.name)])
  if (viewer.role === "mj") {
    const held = new Set<ViewRole>(["mj"])
    if (campaigns.length && sameCampaign(campaigns, viewer.campaigns)) held.add("mj-owner")
    return held
  }
  const held = new Set<ViewRole>(["player"])
  if (campaigns.length && viewer.characters.some((character) => sameCampaign(campaigns, character.campaigns))) held.add("player-campaign")
  if (row) {
    const id = fold(row.id ?? "")
    const name = fold(row.name)
    const owners = row.headers.filter(ownerColumn).flatMap((header) => parts(row.cell(header)))
    if (viewer.characters.some((character) => (id && fold(character.id) === id) || (name && fold(character.name) === name) || owners.includes(fold(character.name)) || owners.includes(fold(character.id)))) held.add("player-owner")
  }
  return held
}

/** Le lecteur peut-il voir ou se servir de ce qui est réservé à ces rôles ? (aucun : tout le monde) */
export function allowedFor(roles: ViewRole[] | undefined, held: Set<ViewRole>) {
  return !roles?.length || roles.some((role) => held.has(role))
}

/** Le plus précis des rôles tenus, dans l'ordre où un réglage par rôle l'emporte. */
export const roleOrder: ViewRole[] = ["admin", "mj-owner", "mj", "player-owner", "player-campaign", "player"]

/** Le réglage du rôle le plus précis que tient le lecteur (`byRole`), sinon `fallback`. */
export function pickForRole<T>(byRole: Partial<Record<ViewRole, T>> | undefined, held: Set<ViewRole>, fallback: T): T {
  if (!byRole) return fallback
  for (const role of roleOrder) if (held.has(role) && byRole[role] !== undefined) return byRole[role] as T
  return fallback
}

/**
 * Les rôles d'un lecteur imaginé (« Voir comme », dans les aperçus) : un joueur de la
 * campagne est aussi joueur, son propriétaire aussi ; le MJ de la campagne est aussi MJ.
 */
export function simulatedRoles(role: ViewRole): Set<ViewRole> {
  switch (role) {
    case "player-owner": return new Set(["player", "player-campaign", "player-owner"])
    case "player-campaign": return new Set(["player", "player-campaign"])
    case "mj-owner": return new Set(["mj", "mj-owner"])
    default: return new Set([role])
  }
}
