import { ensureDriveFolder, findDriveFolderByName, listDriveFolderFiles, shareDriveFileWithLink, uploadDriveFile, type DriveFile } from "@/lib/google-drive"
import { bundledIconBytes } from "@/lib/object-icon-assets"
import { OBJECT_ICON_KEYS, objectIconDriveFileName, objectIconKeyFromDriveFileName } from "@/lib/object-icons"

/** Dossier du Drive qui rassemble les icônes d'objets (celles d'Eraser et celles importées). */
export const OBJECT_ICON_FOLDER = "icone objet"

export async function objectIconFolderId() {
  return ensureDriveFolder(OBJECT_ICON_FOLDER)
}

/**
 * Jusqu'en octobre 2026, « icone objet » était confondu avec « Images classes » : les icônes
 * d'Eraser y ont été envoyées. Elles y sont encore reconnues (par leur nom d'icône), pour ne
 * pas les envoyer une seconde fois ; les déplacer dans « icone objet » garde leur ID.
 */
async function iconsLeftInClassImages() {
  const folder = await findDriveFolderByName("Images Classe")
  if (!folder) return []
  return (await listDriveFolderFiles(folder.id)).filter((file) => objectIconKeyFromDriveFileName(file.name))
}

/**
 * Met les icônes d'Eraser dans le dossier « icone objet » (en le créant s'il
 * n'existe pas) et renvoie l'identifiant Drive de chacune. Une icône déjà
 * présente n'est jamais envoyée deux fois.
 */
export async function ensureObjectIconsOnDrive(keys: Iterable<string> = OBJECT_ICON_KEYS) {
  const folderId = await objectIconFolderId()
  const existing = new Map<string, DriveFile>()
  for (const file of [...await listDriveFolderFiles(folderId), ...await iconsLeftInClassImages()]) {
    const key = objectIconKeyFromDriveFileName(file.name)
    if (key && !existing.has(key)) existing.set(key, file)
  }
  const fileIds = new Map<string, string>()
  for (const key of new Set(keys)) {
    if (!OBJECT_ICON_KEYS.has(key)) continue
    const found = existing.get(key)
    if (found) {
      fileIds.set(key, found.id)
      continue
    }
    const uploaded = await uploadDriveFile({ folderId, name: objectIconDriveFileName(key), contentType: "image/webp", bytes: await bundledIconBytes(key) })
    await shareDriveFileWithLink(uploaded.id)
    fileIds.set(key, uploaded.id)
  }
  return fileIds
}

/** Importe une image choisie à la main dans le dossier « icone objet ». */
export async function uploadObjectIcon(name: string, contentType: string, bytes: ArrayBuffer) {
  const folderId = await objectIconFolderId()
  const uploaded = await uploadDriveFile({ folderId, name, contentType, bytes })
  await shareDriveFileWithLink(uploaded.id)
  return uploaded.id
}

let folderFilesCache: { expiresAt: number; ids: Set<string> } | null = null

/** Fichiers du dossier « icone objet » : ils peuvent toujours être affichés par Eraser. */
let folderFilesRefresh: Promise<Set<string>> | null = null

async function readObjectIconFolderFiles() {
  const folder = await findDriveFolderByName(OBJECT_ICON_FOLDER)
  const ids = new Set([...(folder ? await listDriveFolderFiles(folder.id) : []), ...await iconsLeftInClassImages()].map((file) => file.id))
  folderFilesCache = { expiresAt: Date.now() + 60_000, ids }
  return ids
}

export async function objectIconFolderFileIds() {
  if (folderFilesCache && folderFilesCache.expiresAt > Date.now()) return folderFilesCache.ids
  // Déjà lus une fois : servis tout de suite (une icône importée d'ici est ajoutée à part),
  // relus en arrière-plan ; chaque icône n'attend plus la recherche dans le Drive.
  if (folderFilesCache) {
    folderFilesRefresh ??= readObjectIconFolderFiles().finally(() => { folderFilesRefresh = null })
    folderFilesRefresh.catch(() => undefined)
    return folderFilesCache.ids
  }
  return readObjectIconFolderFiles()
}

export function forgetObjectIconFolderFiles() {
  folderFilesCache = null
}
