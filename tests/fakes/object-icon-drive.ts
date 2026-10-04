/**
 * Le dossier « icone objet », branché à la place de lib/object-icon-drive : chaque icône
 * d'Eraser y a un identifiant fixe. `hold()` fait attendre les envois jusqu'à `release()` :
 * un test change la feuille pendant que la pose des icônes est en route.
 */
let gate: Promise<void> | null = null
let open: () => void = () => undefined

export function hold() {
  gate = new Promise((resolve) => { open = resolve })
}

export function release() {
  open()
  gate = null
}

export async function ensureObjectIconsOnDrive(keys: Iterable<string>) {
  if (gate) await gate
  return new Map([...new Set(keys)].map((key) => [key, `icone-${key.replace(/[^a-z0-9]+/gi, "-")}`]))
}

export function forgetObjectIconFolderFiles() {}

export async function objectIconFolderFileIds() {
  return new Set<string>()
}
