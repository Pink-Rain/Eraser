import { NextResponse } from "next/server"

import { withEntityExtras } from "@/lib/entity-index-extras"
import { addRankBonusRow, invalidateClassContentCaches, linkClassSpell } from "@/lib/class-content"
import { getCampaignForMj, getCharacterForUser, listCachedClassOptions } from "@/lib/google-sheets"
import { googleFailureMessage } from "@/lib/google-failures"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { isClassRankHeader } from "@/lib/world-index-definitions"
import {
  addWorldIndexRow,
  deleteWorldIndexRows,
  duplicateWorldIndexRows,
  ensureWorldIndexEntry,
  insertWorldIndexRows,
  getWorldIndex,
  knownWorldIndexKey,
  moveWorldIndexRows,
  normalizeWorldIndexChoices,
  trashWorldIndexRows,
  updateWorldIndexCell,
  updateWorldIndexFields,
  worldIndexRowGuard,
  type WorldIndexRowRef,
} from "@/lib/world-indexes"

async function authorized() {
  return authorizedAccount(["admin", "mj"])
}

/** Le tableau de la page date d'avant un changement fait ailleurs : rien n'a été écrit. */
const conflicts: Record<string, string> = {
  WORLD_INDEX_ROW_CHANGED: "Le tableau a changé entre-temps : actualise puis recommence.",
  WORLD_INDEX_ROW_DUPLICATE: "Plusieurs lignes portent cet identifiant dans Google Sheets : actualise (ou corrige le doublon dans Sheets) puis recommence.",
  WORLD_INDEX_CELL_CHANGED: "Cette case a été modifiée entre-temps (dans Sheets ou par quelqu’un d’autre) : actualise pour voir sa valeur actuelle, puis recommence.",
  WORLD_INDEX_COLUMN_NOT_FOUND: "Cette colonne n’existe plus dans Google Sheets : actualise puis recommence.",
  // « Classes et rangs » : la feuille des sorts a changé depuis que la page l'a lue.
  CLASS_SPELL_CHANGED: "La feuille a changé entre-temps : actualise puis recommence.",
  CLASS_SPELL_MOVED: "La feuille a changé entre-temps : actualise puis recommence.",
  CLASS_SPELL_ID_DUPLICATE: "Plusieurs lignes de la feuille des sorts portent cet ID : corrige-les dans Google Sheets, puis actualise.",
}

/** Le message montré et le code HTTP d'une écriture refusée. */
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (conflicts[code]) return { status: 409, message: conflicts[code] }
  if (code === "WORLD_INDEX_OWNER_LOCKED") return { status: 403, message: "Le propriétaire se change depuis l’administration, par un administrateur." }
  if (code === "WORLD_INDEX_WRITE_DENIED") return { status: 403, message: "Seuls son propriétaire, le MJ de sa campagne ou un administrateur peuvent modifier cette ligne." }
  if (code === "WORLD_INDEX_SCHEMA_UNAVAILABLE") return { status: 503, message: "Les réglages de cet index n’ont pas pu être lus dans Google Sheets : rien n’a été écrit. Réessaie dans un instant." }
  return { status: 400, message: errorMessage(code) }
}

function errorMessage(code: string) {
  if (code === "WORLD_INDEX_NAME_REQUIRED") return "Le nom est obligatoire."
  if (code === "WORLD_INDEX_ROW_NOT_FOUND") return "Cette ligne n’existe plus dans Google Sheets. Actualise le tableau."
  if (code === "WORLD_INDEX_ROW_ADDED_UNSEEN") return "La ligne a été ajoutée dans Google Sheets, mais n’a pas pu être retrouvée juste après : actualise le tableau avant de recommencer."
  if (code === "WORLD_INDEX_TAB_NOT_FOUND") return "Cet onglet n’existe plus dans Google Sheets. Actualise le tableau."
  if (code === "WORLD_INDEX_TRASH_DENIED") return "Seul son propriétaire (ou un administrateur) peut mettre cet élément à la corbeille."
  if (code === "RANK_BONUS_INVALID_RANK") return "Le dernier rang possible est déjà atteint."
  if (code === "CLASS_SPELLS_SHEET_NOT_FOUND") return "Le classeur « Sorts de classe » est introuvable dans le Drive."
  if (code === "CLASS_RANK_COLUMN_LOCKED") return "Les rangs se règlent dans la colonne « Classes et rangs » : elle vérifie qu’un rang n’a pas plus de trois sorts."
  if (code.startsWith("CLASS_RANK_FULL")) return "Ce rang contient déjà trois sorts. Déplace ou retire d’abord l’un d’eux."
  if (code === "CLASS_SPELL_ID_REQUIRED") return "Ce sort n’a pas encore d’identifiant : actualise le tableau puis recommence."
  if (code === "CLASS_RANK_INVALID") return "Le rang doit être compris entre 0 et 20."
  if (code.startsWith("CLASS_COLUMN_NOT_FOUND")) return "Cette classe n’a pas de colonne dans la feuille « Sorts de classe » et elle n’a pas pu être ajoutée."
  if (code === "OBJECT_INDEX_NOT_REGROUPED") return "Les items sont encore répartis dans plusieurs classeurs : regroupe-les d’abord en un seul « Index des objets »."
  if (code === "WORLD_INDEX_ROWS_LOCKED") return "Les lignes de cet index se créent depuis leur page et partent à la corbeille : le tableau n’en ajoute, n’en copie ni n’en supprime."
  // Le refus de Google (ou une coupure), tel quel : sans lui, impossible de savoir ce qui bloque.
  const google = googleFailureMessage(code)
  if (google) return google
  return `Cette modification n’a pas pu être enregistrée dans Google Sheets.${/^[A-Z0-9_]{3,60}$/.test(code) ? ` (${code})` : ""}`
}

const text = (value: unknown) => typeof value === "string" ? value : ""

/**
 * Les lignes visées, telles que la page les a vues : leur numéro (un simple indice), leur
 * identifiant et leur nom. Sans eux (simples numéros), seule une ligne vide est reconnue.
 */
function rowRefs(value: unknown, rowNumbers: number[]): WorldIndexRowRef[] {
  if (!Array.isArray(value)) return rowNumbers.map((rowNumber) => ({ rowNumber }))
  return value.flatMap((item) => {
    const row = (item && typeof item === "object" ? item : {}) as { rowNumber?: unknown; id?: unknown; name?: unknown }
    return typeof row.rowNumber === "number" && Number.isInteger(row.rowNumber) ? [{ rowNumber: row.rowNumber, id: text(row.id), name: text(row.name) }] : []
  })
}

export async function GET(request: Request) {
  const account = await authorized()
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const parameters = new URL(request.url).searchParams
  try {
    const key = await knownWorldIndexKey(parameters.get("key"))
    if (!key) return NextResponse.json({ error: "Index inconnu." }, { status: 400 })
    // « Actualiser » relit Google Sheets ; sinon l'index gardé en mémoire suffit.
    return NextResponse.json({ data: await withEntityExtras(await getWorldIndex(key, { refresh: parameters.get("refresh") === "1" }), account, await currentAuthToken()) })
  } catch (error) {
    // La cause est gardée dans le journal et montrée : sans elle, impossible de savoir ce qui bloque.
    const code = error instanceof Error ? error.message : ""
    console.error("WORLD_INDEX_READ_FAILED", parameters.get("key"), code || "UNKNOWN_ERROR")
    const detail = googleFailureMessage(code) || (code ? `(${code.slice(0, 160)})` : "")
    return NextResponse.json({ error: `Cet index n’a pas pu être chargé depuis Google Sheets.${detail ? ` ${detail}` : ""}` }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const account = await authorized()
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  // Personnages et campagnes : propriétaires et liens, ajoutés à chaque réponse.
  const withExtras = async (data: Awaited<ReturnType<typeof getWorldIndex>>) => withEntityExtras(data, account, await currentAuthToken())
  try {
    const body = (await request.json()) as { key?: unknown; action?: string; tabName?: string; rowNumber?: number; rowNumbers?: unknown; rowId?: unknown; rowName?: unknown; rows?: unknown; column?: number; header?: unknown; html?: string; previous?: unknown; values?: unknown[]; headers?: unknown; name?: unknown; fields?: Record<string, unknown>; toTab?: string; count?: number; classId?: unknown; rank?: unknown; originalRank?: unknown }
    const rowNumbers = Array.isArray(body.rowNumbers) ? body.rowNumbers.filter((value): value is number => Number.isInteger(value)) : []
    const rows = rowRefs(body.rows, rowNumbers)
    // La ligne d'une seule case (ou d'une fiche) : son numéro, son identifiant et son nom.
    const row: WorldIndexRowRef | null = typeof body.rowNumber === "number" ? { rowNumber: body.rowNumber, id: text(body.rowId), name: text(body.rowName) } : rows[0] ?? null
    const key = await knownWorldIndexKey(body.key)
    if (!key || !body.tabName) throw new Error("INVALID_WORLD_INDEX")
    // Personnages et campagnes, pour un MJ : seulement ses lignes, jamais la case du propriétaire.
    const guard = worldIndexRowGuard(key, account)
    let changed: string[] = []
    // Sorts des classes : les colonnes de rang ne s'écrivent que par « Classes et rangs » (trois sorts
    // par rang au plus). Les classes viennent de la mémoire locale : jamais de lecture Google ici.
    if (key === "class-spells" && ["update-cell", "update-fields", "add", "ensure"].includes(body.action ?? "")) {
      const classNames = (await listCachedClassOptions().catch(() => [])).map((item) => item.name)
      const written = body.action === "update-cell" ? [String(body.header ?? "")]
        : body.action === "add" ? (Array.isArray(body.headers) ? body.headers.map((header) => String(header ?? "")).filter((_, index) => String(body.values?.[index] ?? "").trim()) : [])
        : Object.entries(body.fields ?? {}).filter(([, value]) => String(value ?? "").trim() || body.action === "update-fields").map(([header]) => header)
      if (written.some((header) => isClassRankHeader(header, classNames))) throw new Error("CLASS_RANK_COLUMN_LOCKED")
    }
    if (key === "class-spells" && body.action === "set-class-rank") {
      const spellId = text(body.rowId).trim()
      const classId = text(body.classId).trim()
      const rank = body.rank === null ? null : typeof body.rank === "number" ? body.rank : Number.NaN
      const originalRank = body.originalRank === null ? null : typeof body.originalRank === "number" ? body.originalRank : undefined
      if (!spellId || !classId || (rank !== null && !Number.isInteger(rank))) throw new Error("INVALID_WORLD_INDEX_ACTION")
      await linkClassSpell(spellId, classId, rank, originalRank)
      // Les pages de classe et la fiche de personnage relisent la feuille ; le moteur aussi
      // (l'écriture, faite hors de lui, lui fait oublier sa copie).
      invalidateClassContentCaches({ keepSpellTabs: true })
      return NextResponse.json({ ok: true, changed, data: await withExtras(await getWorldIndex(key)) })
    }
    // Bonus de rang : « Ajouter » écrit le rang suivant (« Rang 21 »), une seule fois même si deux pages le demandent ensemble.
    if (key === "rank-bonuses" && body.action === "add-next") {
      await addRankBonusRow()
      return NextResponse.json({ ok: true, changed, data: await withExtras(await getWorldIndex(key)) })
    }
    if (body.action === "update-cell" && row && typeof body.header === "string" && body.header.trim() && typeof body.html === "string") {
      let warning = ""
      changed = await updateWorldIndexCell(key, body.tabName, row, body.header, body.html, { previous: typeof body.previous === "string" ? body.previous : undefined, guard, onWarning: (message) => { warning = message } })
      // La frappe reste fluide : le classeur n'est renvoyé que si un lien l'a modifié.
      return NextResponse.json({ ok: true, changed, ...(warning ? { warning } : {}), data: changed.includes(key) ? await withExtras(await getWorldIndex(key)) : undefined })
    }
    if (body.action === "ensure" && typeof body.name === "string") {
      // Liste déroulante liée : la réponse reste légère, la page n'affiche pas cet index.
      // Une liste filtrée (« Type : Rune ») remplit aussi ce champ dans la ligne créée.
      const fields = body.fields && typeof body.fields === "object" ? Object.fromEntries(Object.entries(body.fields as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined
      const created = await ensureWorldIndexEntry(key, body.tabName, body.name, fields)
      return NextResponse.json({ ok: true, created })
    }
    if (body.action === "normalize-choices") {
      // Réécrit des cases de toutes les lignes : pas pour un MJ dans les personnages ou les campagnes.
      if (guard) throw new Error("WORLD_INDEX_WRITE_DENIED")
      const corrected = await normalizeWorldIndexChoices(key)
      return NextResponse.json({ ok: true, corrected, data: await withExtras(await getWorldIndex(key)) })
    }
    if (body.action === "add" && Array.isArray(body.values)) {
      const headers = Array.isArray(body.headers) ? body.headers.map((header) => String(header ?? "")) : undefined
      changed = await addWorldIndexRow(key, body.tabName, body.values.map((value) => String(value ?? "")), headers)
    }
    else if (body.action === "insert" && row) await insertWorldIndexRows(key, body.tabName, row, typeof body.count === "number" ? body.count : 1)
    else if (body.action === "duplicate" && rows.length) await duplicateWorldIndexRows(key, body.tabName, rows, { guard })
    else if (body.action === "delete" && rows.length && (key === "characters" || key === "campaigns")) {
      // Comme depuis sa page : la corbeille, par son propriétaire ou un administrateur.
      await trashWorldIndexRows(key, rows, async (kind, id) => account.role === "admin" || Boolean(kind === "character" ? await getCharacterForUser(account.uid, id) : await getCampaignForMj(account.uid, id)))
    }
    else if (body.action === "delete" && rows.length) await deleteWorldIndexRows(key, body.tabName, rows)
    else if (body.action === "move" && rows.length && typeof body.toTab === "string") await moveWorldIndexRows(key, body.tabName, body.toTab, rows)
    else if (body.action === "update-fields" && row && body.fields && typeof body.fields === "object") {
      const previous = body.previous && typeof body.previous === "object" ? Object.fromEntries(Object.entries(body.previous as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined
      await updateWorldIndexFields(key, body.tabName, row, Object.fromEntries(Object.entries(body.fields).map(([header, value]) => [header, String(value ?? "")])), { previous, guard })
    }
    else throw new Error("INVALID_WORLD_INDEX_ACTION")
    return NextResponse.json({ ok: true, changed, data: await withExtras(await getWorldIndex(key)) })
  } catch (error) {
    console.error("WORLD_INDEX_WRITE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    const { status, message } = failure(error)
    return NextResponse.json({ error: message }, { status })
  }
}
