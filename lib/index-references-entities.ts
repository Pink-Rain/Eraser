/**
 * Les index d'entités qu'on cite avec « {} » : personnages, campagnes, PNJs, classes, sorts
 * des classes et sorts des créatures. Ils vivent dans leurs propres feuilles, lues par le
 * nom de leurs colonnes ; ce module les présente comme des index, en lecture seule (aucune
 * feuille n'est créée ni modifiée ici).
 *
 * Un joueur ne lit d'une entité que ce qu'il voit déjà ailleurs : jamais les notes MJ ni
 * l'histoire d'un PNJ, et d'un personnage seulement son nom, son peuple, sa classe, son
 * rang, son titre et son portrait.
 */
import { getDb } from "@/db"
import { campaignIndex, characterIndex } from "@/db/schema"
import { characterBaseHeaders, characterNarrativeHeaders } from "@/lib/character-sheet-schema"
import { CREATURE_SPELLS_TAB, listClassSpells, type ClassSpell, type SpellIndexKind } from "@/lib/class-content"
import { classImageUrl } from "@/lib/class-images"
import {
  campaignReferenceTable,
  characterReferenceTable,
  formatCharacterClasses,
  listIndexedClasses,
  npcReferenceTable,
  resolveJdrSheet,
  spreadsheetTabs,
} from "@/lib/google-sheets"
import { foldName } from "@/lib/index-columns"
import type { SourceHints, SourceRow, SourceTable } from "@/lib/index-references-cells"
import { isNpcLibraryPage, npcIndexTabs } from "@/lib/npc-pages"
import { displayedMultipleValue } from "@/lib/multiple-values"

export const ENTITY_REFERENCE_KEYS = ["characters", "campaigns", "npcs", "classes", "class-spells", "creature-spells"] as const
export type EntityReferenceKey = (typeof ENTITY_REFERENCE_KEYS)[number]

export function isEntityReferenceKey(value: string): value is EntityReferenceKey {
  return (ENTITY_REFERENCE_KEYS as readonly string[]).includes(value)
}

/** Où mène une référence suivie comme un lien. */
export function entityReferencePath(key: EntityReferenceKey, id: string) {
  if (key === "characters") return `/personnage/${encodeURIComponent(id)}`
  if (key === "campaigns") return `/campagne/${encodeURIComponent(id)}`
  if (key === "classes") return `/regles/classes/${encodeURIComponent(id)}`
  if (key === "npcs") return "/ressources/index-des-pnjs"
  if (key === "class-spells") return "/ressources/sorts-des-classes"
  return "/ressources/sorts-des-creatures"
}

/**
 * Un index d'entités. `unlisted` : ses lignes se résolvent (un texte qui les cite les
 * affiche toujours) mais le menu « { » ne les propose pas (campagne à la corbeille…).
 */
export type EntityTable = SourceTable & { unlisted?: boolean }

export type EntitySource = {
  key: EntityReferenceKey
  title: string
  itemLabel: string
  tabs: Array<{ name: string }>
  tables: EntityTable[]
  /** Les colonnes qu'un joueur ne lit pas, même citées. */
  hiddenForPlayers: (column: string) => boolean
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const folded = (names: readonly string[]) => new Set(names.map(foldName))

function table(tab: string, headers: string[], rows: SourceRow[], options: { name: string; columns: string[]; hints?: SourceHints; unlisted?: boolean }): EntityTable {
  return {
    tab,
    headers,
    columns: options.columns,
    name: headers.findIndex((header) => foldName(header) === foldName(options.name)),
    specs: new Map(),
    rows,
    ...(options.hints ? { hints: options.hints } : {}),
    ...(options.unlisted ? { unlisted: true } : {}),
  }
}

/** Une ligne lue dans une feuille : valeurs complétées jusqu'à la largeur des en-têtes. */
function sheetRow(headers: string[], values: readonly (string | undefined)[], id: string, name: string): SourceRow {
  const dense = headers.map((_, index) => String(values[index] ?? ""))
  return { id, name, values: dense, html: dense.map(escapeHtml) }
}

/** Les colonnes que le menu propose : celles de la feuille, moins celles qu'Eraser tient pour lui. */
function menuColumns(headers: string[], technical: readonly string[]) {
  const skip = folded(technical)
  const seen = new Set<string>()
  return headers.filter((header) => {
    const key = foldName(header)
    if (!header.trim() || skip.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ---------------------------------------------------------------------------
// PNJs
// ---------------------------------------------------------------------------

const NPC_TECHNICAL = ["ID", "Page lié", "Nom du PNJ", "Inventaire JSON (archive)", "Ajouté au créateur de session", "Créé le", "Modifié le", "Dossier", "Dans le groupe joueur", "PNJ important", "Créé par"]
const NPC_PRIVATE = folded(["Notes MJ", "Histoire / Lore", "Inventaire JSON (archive)", "Créé par", "Page lié", "Dossier"])

async function npcSource(): Promise<EntitySource | null> {
  const sheet = await npcReferenceTable()
  if (!sheet) return null
  const { headers, columns, rows } = sheet
  const campaigns = await getDb().select({ id: campaignIndex.id, name: campaignIndex.name, deletedAt: campaignIndex.deletedAt }).from(campaignIndex)
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  // Un onglet par page : l'index, le bac à sable, chaque campagne (le menu le montre à côté du nom).
  const pageName = (page: string) => npcIndexTabs.find((tab) => tab.id === page)?.label ?? (page === "bac-a-sable" ? "Bac à sable" : campaignById.get(page)?.name ?? "PNJs")
  const groups = new Map<string, { rows: SourceRow[]; unlisted: boolean }>()
  for (const values of rows) {
    const id = columns.get(values, "ID").trim()
    const name = columns.get(values, "Nom du PNJ").trim()
    const page = columns.get(values, "Page lié").trim()
    if (!id || !name || !page) continue
    // Comme l'Index des PNJs : les PNJs d'une campagne fermée ne sont plus proposés.
    const listed = isNpcLibraryPage(page) || Boolean(campaignById.get(page) && !campaignById.get(page)?.deletedAt)
    const tab = `${pageName(page)}${listed ? "" : " (fermée)"}`
    const group = groups.get(tab) ?? { rows: [], unlisted: !listed }
    group.rows.push(sheetRow(headers, values, id, name))
    groups.set(tab, group)
  }
  const shown = menuColumns(headers, NPC_TECHNICAL)
  const hints: SourceHints = { type: ["Titre", "Classe / métier"], description: ["Notes joueurs"], image: ["Portrait"] }
  const tables = [...groups.entries()].map(([tab, group]) => table(tab, headers, group.rows, { name: "Nom du PNJ", columns: shown, hints, unlisted: group.unlisted }))
  return { key: "npcs", title: "PNJs", itemLabel: "un PNJ", tabs: tables.map((item) => ({ name: item.tab })), tables, hiddenForPlayers: (column) => NPC_PRIVATE.has(foldName(column)) }
}

// ---------------------------------------------------------------------------
// Campagnes
// ---------------------------------------------------------------------------

async function campaignSource(): Promise<EntitySource | null> {
  const sheet = await campaignReferenceTable()
  if (!sheet) return null
  const { headers, columns, rows } = sheet
  const trashed = new Set((await getDb().select({ id: campaignIndex.id, deletedAt: campaignIndex.deletedAt }).from(campaignIndex)).filter((row) => row.deletedAt).map((row) => row.id))
  const listed: SourceRow[] = []
  const hidden: SourceRow[] = []
  for (const values of rows) {
    const id = columns.get(values, "ID").trim()
    const name = columns.get(values, "Nom de la campagne").trim()
    if (!id || !name) continue
    ;(trashed.has(id) ? hidden : listed).push(sheetRow(headers, values, id, name))
  }
  const shown = menuColumns(headers, ["ID", "MJ", "Nom de la campagne", "Bannière"])
  const hints: SourceHints = { description: ["Description"], image: ["Bannière"], color: ["Couleur d’accent"] }
  const tables = [table("Campagnes", headers, listed, { name: "Nom de la campagne", columns: shown, hints }), table("Corbeille", headers, hidden, { name: "Nom de la campagne", columns: shown, hints, unlisted: true })]
  return { key: "campaigns", title: "Campagnes", itemLabel: "une campagne", tabs: [{ name: "Campagnes" }], tables, hiddenForPlayers: (column) => foldName(column) === foldName("MJ") }
}

// ---------------------------------------------------------------------------
// Personnages
// ---------------------------------------------------------------------------

/** Ce qu'un joueur voit d'un personnage cité : rien de plus que sa carte. */
const CHARACTER_PUBLIC = folded(["Nom personnage", "Peuple", "Classe", "Level", "Titre honorifique", "Portrait"])
const CHARACTER_MENU = [...characterBaseHeaders, ...characterNarrativeHeaders].filter((header) => header !== "Nom personnage")

async function characterSource(cited: readonly string[] = []): Promise<EntitySource | null> {
  const sheet = await characterReferenceTable(["Joueur", ...characterBaseHeaders, ...characterNarrativeHeaders, ...cited])
  if (!sheet) return null
  const { headers, columns, rows } = sheet
  const classColumn = columns.at("Classe")
  // Peuple et titres sont des listes (JSON) : le survol montre les peuples et le titre choisi.
  const listColumns = [{ at: columns.at("Peuple"), mode: "all" as const }, { at: columns.at("Titre honorifique"), mode: "selected" as const }].filter((entry) => entry.at >= 0)
  const trashed = new Set((await getDb().select({ id: characterIndex.id, deletedAt: characterIndex.deletedAt }).from(characterIndex)).filter((row) => row.deletedAt).map((row) => row.id))
  const listed: SourceRow[] = []
  const hidden: SourceRow[] = []
  for (const values of rows) {
    const id = columns.get(values, "ID").trim()
    const name = columns.get(values, "Nom personnage").trim()
    if (!id || !name) continue
    const row = sheetRow(headers, values, id, name)
    // La classe est parfois une liste (JSON) : elle se lit « Mage · Prêtre ».
    if (classColumn >= 0) { row.values[classColumn] = formatCharacterClasses(row.values[classColumn]); row.html[classColumn] = escapeHtml(row.values[classColumn]) }
    for (const { at, mode } of listColumns) { row.values[at] = displayedMultipleValue(row.values[at] ?? "", mode); row.html[at] = escapeHtml(row.values[at]) }
    ;(trashed.has(id) ? hidden : listed).push(row)
  }
  const shown = CHARACTER_MENU.filter((header) => columns.at(header) >= 0)
  const hints: SourceHints = { type: ["Classe", "Peuple"], description: ["Titre honorifique"], image: ["Portrait"] }
  const tables = [table("Personnages", headers, listed, { name: "Nom personnage", columns: shown, hints }), table("Corbeille", headers, hidden, { name: "Nom personnage", columns: shown, hints, unlisted: true })]
  return { key: "characters", title: "Personnages", itemLabel: "un personnage", tabs: [{ name: "Personnages" }], tables, hiddenForPlayers: (column) => !CHARACTER_PUBLIC.has(foldName(column)) }
}

// ---------------------------------------------------------------------------
// Classes et sorts
// ---------------------------------------------------------------------------

async function classSource(): Promise<EntitySource | null> {
  const classes = await listIndexedClasses()
  if (!classes.length) return null
  const headers = ["ID", "Nom de la classe", "Type", "Mots-clés", "Difficulté", "Image", "Couleur"]
  const rows = classes.map((item) => sheetRow(headers, [item.id, item.name, item.type, item.keywords.filter(Boolean).join(" · "), item.difficulty, classImageUrl(item.image) ?? "", item.accentReady ? item.accentDark : ""], item.id, item.name))
  const tables = [table("Classes", headers, rows, { name: "Nom de la classe", columns: ["Type", "Mots-clés", "Difficulté"], hints: { type: ["Type"], description: ["Mots-clés"], image: ["Image"], color: ["Couleur"] } })]
  return { key: "classes", title: "Classes", itemLabel: "une classe", tabs: [{ name: "Classes" }], tables, hiddenForPlayers: () => false }
}

const SPELL_HEADERS = ["ID", "Nom", "Type", "Effet", "Description", "Compétences", "Distance", "Charges", "Couleur"]

function spellRow(spell: ClassSpell): SourceRow {
  const values = [spell.id, spell.name, spell.type, spell.effect, spell.description, spell.skillsRaw, spell.distance, spell.chargesLabel ?? (spell.charges === null ? "" : String(spell.charges)), spell.tone.background]
  const html = values.map(escapeHtml)
  if (spell.effectHtml) html[3] = spell.effectHtml
  if (spell.descriptionHtml) html[4] = spell.descriptionHtml
  if (spell.distanceHtml) html[6] = spell.distanceHtml
  return { id: spell.id, name: spell.name, values, html }
}

async function spellSource(kind: SpellIndexKind): Promise<EntitySource | null> {
  if (kind === "creatures") {
    // Sans classeur des créatures, ou sans son onglet de sorts, rien n'est créé : pas d'index.
    const sheet = await resolveJdrSheet("creatures")
    if (!sheet || !(await spreadsheetTabs(sheet.spreadsheetId)).some((tab) => tab.title === CREATURE_SPELLS_TAB)) return null
  }
  const { spells } = await listClassSpells(false, kind)
  const rows = spells.filter((spell) => spell.id.trim() && spell.name.trim()).map(spellRow)
  const key: EntityReferenceKey = kind === "creatures" ? "creature-spells" : "class-spells"
  const title = kind === "creatures" ? "Sorts des créatures" : "Sorts des classes"
  const tables = [table(title, SPELL_HEADERS, rows, { name: "Nom", columns: ["Type", "Effet", "Description", "Compétences", "Distance", "Charges"], hints: { type: ["Type"], description: ["Effet", "Description"], color: ["Couleur"] } })]
  return { key, title, itemLabel: kind === "creatures" ? "un sort de créature" : "un sort", tabs: [{ name: title }], tables, hiddenForPlayers: () => false }
}

/** Les index d'entités disponibles (leurs feuilles existent), sans les lire en entier. */
export async function entityReferenceKeys(): Promise<EntityReferenceKey[]> {
  const [characters, campaigns, npcs, classes, creatures] = await Promise.all([
    resolveJdrSheet("characters").catch(() => null),
    resolveJdrSheet("campaigns").catch(() => null),
    resolveJdrSheet("npcs").catch(() => null),
    // Les classes de l'index local (les sorts des classes vont avec elles).
    listIndexedClasses().then((list) => list.length > 0).catch(() => false),
    resolveJdrSheet("creatures").catch(() => null),
  ])
  return [
    ...(characters ? ["characters" as const] : []),
    ...(campaigns ? ["campaigns" as const] : []),
    ...(npcs ? ["npcs" as const] : []),
    ...(classes ? ["classes" as const, "class-spells" as const] : []),
    ...(creatures ? ["creature-spells" as const] : []),
  ]
}

/** Un index d'entités, lu à la demande. `cited` : colonnes de personnage citées à lire en plus. */
export async function loadEntitySource(key: EntityReferenceKey, options: { cited?: readonly string[] } = {}): Promise<EntitySource | null> {
  if (key === "characters") return characterSource(options.cited)
  if (key === "campaigns") return campaignSource()
  if (key === "npcs") return npcSource()
  if (key === "classes") return classSource()
  if (key === "class-spells") return spellSource("classes")
  return spellSource("creatures")
}
