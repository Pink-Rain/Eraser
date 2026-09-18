const GOOGLE_DRIVE_FILE_PATTERNS = [
  /\/file\/d\/([A-Za-z0-9_-]+)/,
  /\/api\/sheet-images\/([A-Za-z0-9_-]+)/,
  /[?&]id=([A-Za-z0-9_-]+)/,
  /ERASER_DRIVE_FILE_ID:([A-Za-z0-9_-]+)/,
]

export function googleDriveFileId(value: string) {
  const trimmed = value.trim()
  for (const pattern of GOOGLE_DRIVE_FILE_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export function classImageUrl(value: string) {
  const driveFileId = googleDriveFileId(value)
  if (driveFileId) return `/api/classes/images/${encodeURIComponent(driveFileId)}`

  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}
