/**
 * Le dossier « Objets » du Drive, branché à la place de lib/google-drive : il liste les
 * classeurs du Google Sheets en mémoire (tests/fakes/sheets-api.ts) qu'un test y range.
 * Le reste du Drive est absent.
 */
export const drive = { objects: [] as Array<{ id: string; name: string }> }

export function reset() {
  drive.objects.length = 0
}

export async function findDriveFolderByName(name: string) {
  return name === "Objets" ? { id: "dossier-objets", name, mimeType: "application/vnd.google-apps.folder" } : null
}

export async function listDriveFolderFiles(folderId: string) {
  return folderId === "dossier-objets" ? drive.objects.map((file) => ({ ...file, mimeType: "application/vnd.google-apps.spreadsheet", webViewLink: "" })) : []
}

export async function findGoogleSpreadsheetByName() {
  return null
}
