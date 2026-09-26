import { googleOAuthAuthorizedFetch } from "@/lib/google-oauth"

const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet"
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
const IMAGE_FILE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|tiff?|webp)$/iu

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  webViewLink?: string
  parents?: string[]
  shortcutDetails?: {
    targetId: string
    targetMimeType: string
  }
}

async function driveJson<T>(path: string, init?: RequestInit) {
  const response = await googleOAuthAuthorizedFetch(`https://www.googleapis.com/drive/v3/${path}`, init)
  const payload = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || `DRIVE_API_ERROR:${response.status}`)
  return payload
}

export async function listDriveFiles() {
  const query = encodeURIComponent("trashed = false")
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink)")
  const payload = await driveJson<{ files?: DriveFile[] }>(
    `files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=100`,
  )
  return payload.files ?? []
}

export async function listAllDriveFiles() {
  return listFilesMatching("trashed = false")
}

function driveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

async function listFilesMatching(query: string) {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const parameters = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents,shortcutDetails(targetId,targetMimeType))",
      orderBy: "name",
      pageSize: "100",
    })
    if (pageToken) parameters.set("pageToken", pageToken)
    const payload = await driveJson<{ files?: DriveFile[]; nextPageToken?: string }>(
      `files?${parameters.toString()}`,
    )
    files.push(...(payload.files ?? []))
    pageToken = payload.nextPageToken
  } while (pageToken)

  return files
}

export async function findDriveFolderByName(name: string) {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error("INVALID_FOLDER_NAME")
  const folders = await listFilesMatching(
    `name = '${driveQueryValue(normalizedName)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
  )
  if (folders[0]) return folders[0]

  // Google Drive keeps the exact spelling entered by the user (including
  // trailing spaces and plurals), and a visible folder can also be a shortcut.
  // Fall back to a normalized lookup so "Images Classe", "Images Classes"
  // and a shortcut with the same name are all recognized.
  const candidates = await listFilesMatching(
    `(mimeType = '${FOLDER_MIME_TYPE}' or mimeType = 'application/vnd.google-apps.shortcut') and trashed = false`,
  )
  const expected = normalizedDriveLabel(normalizedName)
  const selected = candidates.find((candidate) => {
    const candidateLabel = normalizedDriveLabel(candidate.name)
    const isFolder = candidate.mimeType === FOLDER_MIME_TYPE
    const isFolderShortcut =
      candidate.mimeType === "application/vnd.google-apps.shortcut" &&
      candidate.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE
    if (!isFolder && !isFolderShortcut) return false
    return (
      candidateLabel === expected ||
      candidateLabel === `${expected}s` ||
      `${candidateLabel}s` === expected ||
      (candidateLabel.includes("image") && candidateLabel.includes("classe"))
    )
  })
  if (!selected) return null
  if (
    selected.mimeType === "application/vnd.google-apps.shortcut" &&
    selected.shortcutDetails?.targetMimeType === FOLDER_MIME_TYPE
  ) {
    return {
      ...selected,
      id: selected.shortcutDetails.targetId,
      mimeType: FOLDER_MIME_TYPE,
    }
  }
  return selected
}

function normalizedDriveLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

export async function listDriveFolderFiles(folderId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(folderId)) throw new Error("INVALID_DRIVE_FILE_ID")
  return listFilesMatching(`'${folderId}' in parents and trashed = false`)
}

export async function listAllDriveImages() {
  const files = await listFilesMatching("trashed = false")
  return files.filter(isDriveImageFile)
}

export function isDriveImageFile(file: DriveFile) {
  const mimeType = file.mimeType === "application/vnd.google-apps.shortcut"
    ? file.shortcutDetails?.targetMimeType ?? ""
    : file.mimeType
  return mimeType.startsWith("image/") || IMAGE_FILE_EXTENSION.test(file.name)
}

export async function downloadDriveFile(fileId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) throw new Error("INVALID_DRIVE_FILE_ID")
  return googleOAuthAuthorizedFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
  )
}

export async function ensureDriveFolder(name: string) {
  const existing = await findDriveFolderByName(name)
  if (existing) return existing.id
  const created = await driveJson<DriveFile>("files?fields=id,name,mimeType", {
    method: "POST",
    body: JSON.stringify({ name: name.trim(), mimeType: FOLDER_MIME_TYPE }),
  })
  return created.id
}

export async function findDriveFileByName(folderId: string, name: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(folderId)) throw new Error("INVALID_DRIVE_FILE_ID")
  const files = await listFilesMatching(
    `name = '${driveQueryValue(name)}' and '${folderId}' in parents and trashed = false`,
  )
  return files.sort((left, right) => (right.modifiedTime || "").localeCompare(left.modifiedTime || ""))[0] ?? null
}

// Drive's multipart upload: metadata part, then the bytes, in one request.
export async function uploadDriveFile(input: {
  folderId: string
  name: string
  contentType: string
  bytes: ArrayBuffer
}) {
  const boundary = `eraser${crypto.randomUUID().replace(/-/g, "")}`
  const metadata = JSON.stringify({ name: input.name, parents: [input.folderId] })
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\ncontent-type: ${input.contentType}\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const payload = new Uint8Array(head.byteLength + input.bytes.byteLength + tail.byteLength)
  payload.set(head, 0)
  payload.set(new Uint8Array(input.bytes), head.byteLength)
  payload.set(tail, head.byteLength + input.bytes.byteLength)
  const response = await googleOAuthAuthorizedFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body: payload,
    },
  )
  const payloadJson = (await response.json()) as DriveFile & { error?: { message?: string } }
  if (!response.ok || !payloadJson.id) throw new Error(payloadJson.error?.message || `DRIVE_UPLOAD_FAILED:${response.status}`)
  return payloadJson
}

/** Lisible par toute personne qui a le lien : Google Sheets en a besoin pour afficher =IMAGE(). */
export async function shareDriveFileWithLink(fileId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) throw new Error("INVALID_DRIVE_FILE_ID")
  await driveJson(`files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  })
}

export async function createGoogleSpreadsheet(name: string) {
  const normalizedName = name.trim()
  if (!normalizedName || normalizedName.length > 120) throw new Error("INVALID_SHEET_NAME")
  return driveJson<DriveFile>("files?fields=id,name,mimeType,modifiedTime,webViewLink", {
    method: "POST",
    body: JSON.stringify({ name: normalizedName, mimeType: SPREADSHEET_MIME_TYPE }),
  })
}

export async function findGoogleSpreadsheetByName(name: string) {
  const normalizedName = name.trim()
  if (!normalizedName || normalizedName.length > 120) throw new Error("INVALID_SHEET_NAME")
  const files = await listFilesMatching(
    `name = '${driveQueryValue(normalizedName)}' and mimeType = '${SPREADSHEET_MIME_TYPE}' and trashed = false`,
  )
  return files.sort((left, right) => (right.modifiedTime || "").localeCompare(left.modifiedTime || ""))[0] ?? null
}

export async function trashDriveFile(fileId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) throw new Error("INVALID_DRIVE_FILE_ID")
  return driveJson<DriveFile>(`files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  })
}
