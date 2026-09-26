import { ensureDriveFolder, findDriveFolderByName, listDriveFolderFiles, shareDriveFileWithLink, uploadDriveFile, type DriveFile } from "@/lib/google-drive"
import { bundledIconBytes } from "@/lib/object-icon-assets"
import { OBJECT_ICON_KEYS, objectIconDriveFileName, objectIconKeyFromDriveFileName } from "@/lib/object-icons"

/** Dossier du Drive qui rassemble les icônes d'objets (celles d'Eraser et celles importées). */
export const OBJECT_ICON_FOLDER = "icone objet"

export async function objectIconFolderId() {
  return ensureDriveFolder(OBJECT_ICON_FOLDER)
}

/**
 * Met les icônes d'Eraser dans le dossier « icone objet » (en le créant s'il
 * n'existe pas) et renvoie l'identifiant Drive de chacune. Une icône déjà
 * présente n'est jamais envoyée deux fois.
 */
export async function ensureObjectIconsOnDrive(keys: Iterable<string> = OBJECT_ICON_KEYS) {
  const folderId = await objectIconFolderId()
  const existing = new Map<string, DriveFile>()
  for (const file of await listDriveFolderFiles(folderId)) {
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
export async function objectIconFolderFileIds() {
  if (folderFilesCache && folderFilesCache.expiresAt > Date.now()) return folderFilesCache.ids
  const folder = await findDriveFolderByName(OBJECT_ICON_FOLDER)
  const ids = new Set(folder ? (await listDriveFolderFiles(folder.id)).map((file) => file.id) : [])
  folderFilesCache = { expiresAt: Date.now() + 60_000, ids }
  return ids
}

export function forgetObjectIconFolderFiles() {
  folderFilesCache = null
}
