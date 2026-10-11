/**
 * L'identifiant d'un objet de l'Index des objets, partout où Eraser le cite (inventaires,
 * citations « { », magasins, fouilles) : la case ID (ou « Identifiant ») de sa ligne, sinon
 * sa place — classeur, onglet, ligne. Une seule règle : ces identifiants sont écrits dans
 * les inventaires et les magasins enregistrés, le moindre écart y perdrait l'objet.
 */
export function positionalObjectId(fileId: string, sheetId: number | string, rowNumber: number | string) {
  return `DRIVE-${fileId}-${sheetId}-${rowNumber}`
}

/** L'identifiant d'un objet : sa case ID, sinon sa place. */
export function objectItemId(idCell: string | undefined, fileId: string, sheetId: number | string, rowNumber: number | string) {
  return (idCell ?? "").trim() || positionalObjectId(fileId, sheetId, rowNumber)
}

/**
 * La variante des magasins, sans « DRIVE- » : gardée telle quelle, des magasins et des
 * fouilles enregistrés la citent. `positionalFromShopObjectId` la ramène à celle de l'inventaire.
 */
export function shopObjectId(idCell: string | undefined, fileId: string, sheetId: number | string, rowNumber: number | string) {
  return (idCell ?? "").trim() || `${fileId}-${sheetId}-${rowNumber}`
}

export function isPositionalObjectId(id: string) {
  return id.startsWith("DRIVE-")
}

export function positionalFromShopObjectId(id: string) {
  return isPositionalObjectId(id) ? id : `DRIVE-${id}`
}
