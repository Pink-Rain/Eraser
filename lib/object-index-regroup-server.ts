/**
 * Regrouper les classeurs du dossier « Objets » en un seul classeur à onglets, et
 * l'annuler. Règles du projet : rien n'est supprimé ni modifié dans les anciens
 * classeurs, la copie est vérifiée avant toute bascule, et l'opération se défait.
 *
 * 1. Un classeur « Index des objets » est créé dans un sous-dossier de sauvegarde,
 *    jamais si un classeur de ce nom existe déjà dans le Drive.
 * 2. Chaque tableau y est copié (copyTo : valeurs, mise en forme, =IMAGE) sous un nom
 *    court (Objets, Équipement, Parchemins, Consommables, Armes).
 * 3. Les objets sans ID reçoivent leur ancien identifiant calculé dans une colonne ID :
 *    inventaires, boutiques et fouilles les retrouvent à l'identique.
 * 4. Le schéma « Eraser · colonnes » de chaque classeur suit, onglets renommés.
 * 5. La copie est relue et comparée ligne à ligne ; à la moindre différence, rien ne bascule.
 * 6. Les anciens classeurs sont rangés dans le sous-dossier de sauvegarde (Eraser ne lit
 *    que le dossier « Objets » lui-même), le nouveau prend leur place, et les
 *    onglets-fenêtres sont renvoyés vers les nouveaux onglets.
 */
import {
  findDriveFolderByName,
  findGoogleSpreadsheetByName,
  createGoogleSpreadsheet,
  ensureDriveSubfolder,
  listDriveFolderFiles,
  moveDriveFile,
  renameDriveFile,
} from "@/lib/google-drive"
import {
  clearObjectIndexTableCache,
  clearSpreadsheetReadCache,
  columnName,
  googleSheetsJson,
  objectIndexRowName,
  objectIndexTablesForRegroup,
  readObjectIndexSpreadsheet,
  readRange,
  sheetTabRange,
  spreadsheetTabs,
  updateRange,
  updateRanges,
  type ObjectIndexTable,
} from "@/lib/google-sheets"
import { appendRawSchemaRows, readRawSchemaRows } from "@/lib/index-schema"
import { remapIndexViewSources } from "@/lib/index-settings"
import {
  copyMismatches,
  MERGED_OBJECT_INDEX_NAME,
  OBJECT_INDEX_BACKUP_FOLDER,
  OBJECT_INDEX_REGROUP_HEADERS,
  OBJECT_INDEX_REGROUP_TAB,
  objectTableSource,
  plannedObjectIds,
  regroupedTabNames,
} from "@/lib/object-index-regroup"

const SPREADSHEET = "application/vnd.google-apps.spreadsheet"
const SHORTCUT = "application/vnd.google-apps.shortcut"

export type ObjectIndexRegroupStatus = {
  state: "séparé" | "regroupé"
  /** Les classeurs lus aujourd'hui dans « Objets ». */
  files: string[]
  /** Le classeur regroupé (quand state = « regroupé »). */
  merged: { id: string; url: string; regroupedAt: string } | null
}

async function objectsFolder() {
  const folder = await findDriveFolderByName("Objets")
  if (!folder) throw new Error("OBJECT_INDEX_FOLDER_NOT_FOUND")
  return folder
}

/** Les classeurs (ou raccourcis vers des classeurs) posés directement dans « Objets ». */
async function folderSpreadsheets(folderId: string) {
  return (await listDriveFolderFiles(folderId)).flatMap((entry) => {
    if (entry.mimeType === SPREADSHEET) return [{ entryId: entry.id, fileId: entry.id, name: entry.name, webViewLink: entry.webViewLink }]
    if (entry.mimeType === SHORTCUT && entry.shortcutDetails?.targetMimeType === SPREADSHEET) return [{ entryId: entry.id, fileId: entry.shortcutDetails.targetId, name: entry.name, webViewLink: entry.webViewLink }]
    return []
  })
}

async function regroupLog(fileId: string) {
  const tabs = await spreadsheetTabs(fileId)
  if (!tabs.some((tab) => tab.title === OBJECT_INDEX_REGROUP_TAB)) return null
  clearSpreadsheetReadCache(fileId)
  return (await readRange(fileId, sheetTabRange(OBJECT_INDEX_REGROUP_TAB, `A2:${columnName(OBJECT_INDEX_REGROUP_HEADERS.length)}`))).filter((row) => row[0]?.trim())
}

export async function objectIndexRegroupStatus(): Promise<ObjectIndexRegroupStatus> {
  const folder = await objectsFolder()
  const files = await folderSpreadsheets(folder.id)
  const candidate = files.find((file) => file.name.trim() === MERGED_OBJECT_INDEX_NAME)
  const log = candidate ? await regroupLog(candidate.fileId).catch(() => null) : null
  return {
    state: log?.length ? "regroupé" : "séparé",
    files: files.map((file) => file.name).sort((left, right) => left.localeCompare(right, "fr")),
    merged: candidate && log?.length ? { id: candidate.fileId, url: candidate.webViewLink || `https://docs.google.com/spreadsheets/d/${candidate.fileId}/edit`, regroupedAt: log[0][9] ?? "" } : null,
  }
}

async function batchUpdate(spreadsheetId: string, requests: unknown[]) {
  if (!requests.length) return { replies: [] as unknown[] }
  return googleSheetsJson<{ replies?: unknown[] }>(`spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export async function regroupObjectIndexes() {
  const folder = await objectsFolder()
  // Règle du projet : ne jamais recréer une feuille qui existe déjà sous ce nom.
  if (await findGoogleSpreadsheetByName(MERGED_OBJECT_INDEX_NAME)) throw new Error("OBJECT_REGROUP_NAME_TAKEN")
  const entries = await folderSpreadsheets(folder.id)
  if (entries.length < 2) throw new Error("OBJECT_REGROUP_NOTHING_TO_DO")
  const tables = await objectIndexTablesForRegroup()
  if (!tables.length) throw new Error("OBJECT_REGROUP_NOTHING_TO_DO")
  const fileIds = [...new Set(tables.map((table) => table.fileId))]
  // Les tableaux tels qu'ils sont dans Sheets, pour comparer la copie à l'identique.
  const raw = new Map((await Promise.all(fileIds.map(async (fileId) => {
    const entry = entries.find((candidate) => candidate.fileId === fileId)
    return readObjectIndexSpreadsheet({ id: fileId, name: entry?.name ?? fileId })
  }))).flat().map((table) => [objectTableSource(table.fileId, table.sheetId), table]))

  const { names, order } = regroupedTabNames(tables.map((table) => ({ key: objectTableSource(table.fileId, table.sheetId), fileName: table.fileName, tabName: table.tabName })))
  const ordered = order.map((key) => tables.find((table) => objectTableSource(table.fileId, table.sheetId) === key) as ObjectIndexTable)

  const backupId = await ensureDriveSubfolder(folder.id, OBJECT_INDEX_BACKUP_FOLDER)
  const created = await createGoogleSpreadsheet(MERGED_OBJECT_INDEX_NAME, backupId)
  const blankTabs = await spreadsheetTabs(created.id)
  const regroupedAt = new Date().toISOString()

  try {
    // 2. Copier chaque tableau, puis le renommer.
    const copies: Array<{ table: ObjectIndexTable; name: string; sheetId: number; columnCount: number }> = []
    for (const [position, table] of ordered.entries()) {
      const copied = await googleSheetsJson<{ sheetId: number; title: string; gridProperties?: { columnCount?: number } }>(
        `spreadsheets/${table.fileId}/sheets/${table.sheetId}:copyTo`,
        { method: "POST", body: JSON.stringify({ destinationSpreadsheetId: created.id }) },
      )
      const name = names.get(objectTableSource(table.fileId, table.sheetId)) as string
      await batchUpdate(created.id, [{ updateSheetProperties: { properties: { sheetId: copied.sheetId, title: name, index: position, hidden: false }, fields: "title,index,hidden" } }])
      copies.push({ table, name, sheetId: copied.sheetId, columnCount: copied.gridProperties?.columnCount ?? 26 })
    }
    await batchUpdate(created.id, blankTabs.flatMap((tab) => tab.sheetId === undefined ? [] : [{ deleteSheet: { sheetId: tab.sheetId } }]))

    // 3. Les identifiants : chaque objet garde celui que les inventaires connaissent.
    const plans = new Map<number, ReturnType<typeof plannedObjectIds>>()
    for (const copy of copies) {
      const source = raw.get(objectTableSource(copy.table.fileId, copy.table.sheetId))
      const plan = plannedObjectIds({ ...copy.table, rawWidth: source?.headers.length ?? copy.table.headers.length }, (row) => objectIndexRowName(copy.table, row as ObjectIndexTable["rows"][number]))
      plans.set(copy.sheetId, plan)
      if (!plan.cells.length && !plan.addHeader) continue
      if (plan.column >= copy.columnCount) await batchUpdate(created.id, [{ appendDimension: { sheetId: copy.sheetId, dimension: "COLUMNS", length: plan.column - copy.columnCount + 1 } }])
      const letter = columnName(plan.column + 1)
      await updateRanges(created.id, [
        ...(plan.addHeader ? [{ range: sheetTabRange(copy.name, `${letter}1`), values: [["ID"]] }] : []),
        ...plan.cells.map((cell) => ({ range: sheetTabRange(copy.name, `${letter}${cell.rowNumber}`), values: [[cell.value]] })),
      ], { valueInputOption: "RAW" })
    }

    // 4. Le schéma des colonnes suit ses onglets.
    const schemaRows: string[][] = []
    for (const fileId of fileIds) {
      const rows = await readRawSchemaRows(fileId).catch(() => [] as string[][])
      for (const row of rows) {
        const copy = copies.find((candidate) => candidate.table.fileId === fileId && candidate.table.tabName === row[0]?.trim())
        if (copy) schemaRows.push([copy.name, ...row.slice(1)])
      }
    }
    await appendRawSchemaRows(created.id, schemaRows)

    // De quoi annuler, gardé dans le classeur lui-même (onglet caché).
    const logRows = copies.map((copy) => {
      const entry = entries.find((candidate) => candidate.fileId === copy.table.fileId)
      return [copy.table.fileId, copy.table.fileName, copy.table.tabName, String(copy.table.sheetId), copy.name, String(copy.sheetId), entry?.entryId ?? copy.table.fileId, folder.id, backupId, regroupedAt]
    })
    await batchUpdate(created.id, [{ addSheet: { properties: { title: OBJECT_INDEX_REGROUP_TAB, hidden: true, gridProperties: { rowCount: Math.max(20, logRows.length + 5), columnCount: OBJECT_INDEX_REGROUP_HEADERS.length, frozenRowCount: 1 } } } }])
    await updateRange(created.id, sheetTabRange(OBJECT_INDEX_REGROUP_TAB, `A1:${columnName(OBJECT_INDEX_REGROUP_HEADERS.length)}${logRows.length + 1}`), [OBJECT_INDEX_REGROUP_HEADERS, ...logRows], { valueInputOption: "RAW" })

    // 5. Relire la copie et la comparer à l'original, tableau par tableau.
    clearSpreadsheetReadCache(created.id)
    const copiedTables = await readObjectIndexSpreadsheet({ id: created.id, name: MERGED_OBJECT_INDEX_NAME })
    const problems: string[] = []
    for (const copy of copies) {
      const source = raw.get(objectTableSource(copy.table.fileId, copy.table.sheetId))
      const copied = copiedTables.find((table) => table.sheetId === copy.sheetId)
      if (!source || !copied) { problems.push(`${copy.name} : tableau introuvable`); continue }
      const plan = plans.get(copy.sheetId)
      const mismatches = copyMismatches(source.rows, copied.rows, source.headers.length, plan?.cells.length ? plan.column : -1)
      if (mismatches.length) problems.push(`${copy.name} : ${mismatches.join(" ; ")}`)
    }
    if (problems.length) {
      const error = new Error("OBJECT_REGROUP_VERIFY_FAILED")
      ;(error as Error & { details?: string[] }).details = problems.slice(0, 8)
      throw error
    }

    // 6. Bascule : les anciens classeurs vont à la sauvegarde, le nouveau dans « Objets ».
    const moved: string[] = []
    try {
      for (const entryId of [...new Set(logRows.map((row) => row[6]))]) {
        await moveDriveFile(entryId, backupId, folder.id)
        moved.push(entryId)
      }
      await moveDriveFile(created.id, folder.id, backupId)
    } catch (error) {
      // Une bascule à moitié faite est défaite : les anciens classeurs reviennent.
      for (const entryId of moved) await moveDriveFile(entryId, folder.id, backupId).catch(() => undefined)
      throw error
    }
    const views = await remapIndexViewSources("objects", new Map(copies.map((copy) => [objectTableSource(copy.table.fileId, copy.table.sheetId), objectTableSource(created.id, copy.sheetId)]))).catch(() => 0)
    clearObjectIndexTableCache()
    return {
      fileId: created.id,
      url: created.webViewLink || `https://docs.google.com/spreadsheets/d/${created.id}/edit`,
      tabs: copies.map((copy) => ({ name: copy.name, from: `${copy.table.fileName} · ${copy.table.tabName}`, rows: copy.table.rows.length, idsWritten: plans.get(copy.sheetId)?.cells.length ?? 0 })),
      backupFolder: OBJECT_INDEX_BACKUP_FOLDER,
      views,
    }
  } catch (error) {
    // Rien n'a basculé : la copie reste dans la sauvegarde, renommée, pour qu'on puisse
    // la regarder et relancer le regroupement.
    await renameDriveFile(created.id, `${MERGED_OBJECT_INDEX_NAME} · essai interrompu ${today()}`).catch(() => undefined)
    clearObjectIndexTableCache()
    throw error
  }
}

/**
 * Annule le regroupement : les anciens classeurs reviennent dans « Objets », tels
 * qu'ils étaient, et le classeur regroupé va dans la sauvegarde (renommé, jamais
 * supprimé). Ce qui a été modifié dans le classeur regroupé depuis y reste.
 */
export async function revertObjectIndexRegroup() {
  const folder = await objectsFolder()
  const files = await folderSpreadsheets(folder.id)
  const merged = files.find((file) => file.name.trim() === MERGED_OBJECT_INDEX_NAME)
  const log = merged ? await regroupLog(merged.fileId) : null
  if (!merged || !log?.length) throw new Error("OBJECT_REGROUP_NOT_FOUND")
  const backupId = log[0][8]?.trim()
  if (!backupId) throw new Error("OBJECT_REGROUP_NOT_FOUND")
  for (const entryId of [...new Set(log.map((row) => row[6]?.trim()).filter(Boolean))]) {
    await moveDriveFile(entryId, folder.id, backupId)
  }
  await moveDriveFile(merged.entryId, backupId, folder.id)
  await renameDriveFile(merged.fileId, `${MERGED_OBJECT_INDEX_NAME} · annulé le ${today()}`).catch(() => undefined)
  const views = await remapIndexViewSources("objects", new Map(log.map((row) => [objectTableSource(merged.fileId, Number(row[5])), objectTableSource(row[0], Number(row[3]))]))).catch(() => 0)
  clearObjectIndexTableCache()
  return { restored: [...new Set(log.map((row) => row[1]))], views }
}
