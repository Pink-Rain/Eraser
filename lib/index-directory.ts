/**
 * Le rangement de la page Index : des dossiers et un ordre, choisis par les MJ et
 * administrateurs et partagés par toute la table (serveur partagé d'Eraser). Un index
 * absent du rangement (ajouté depuis) se range à la racine, par ordre alphabétique.
 */
export type IndexFolder = { id: string; name: string; items: string[] }
export type IndexDirectoryLayout = { root: string[]; folders: IndexFolder[] }

export const FOLDER_PREFIX = "dossier:"

export const emptyIndexDirectoryLayout: IndexDirectoryLayout = { root: [], folders: [] }

const MAX_ITEMS = 500

function keys(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 200))].slice(0, MAX_ITEMS) : []
}

/** Un rangement lu (serveur, navigateur ou requête) : ce qui n'a pas la bonne forme est écarté. */
export function parseIndexDirectoryLayout(value: unknown): IndexDirectoryLayout {
  if (!value || typeof value !== "object") return emptyIndexDirectoryLayout
  const raw = value as { root?: unknown; folders?: unknown }
  const folders = (Array.isArray(raw.folders) ? raw.folders : []).flatMap((folder): IndexFolder[] => {
    if (!folder || typeof folder !== "object") return []
    const { id, name, items } = folder as Record<string, unknown>
    if (typeof id !== "string" || !/^[a-z0-9-]{1,40}$/i.test(id)) return []
    return [{ id, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : "Dossier", items: keys(items) }]
  }).slice(0, 60)
  return { root: keys(raw.root), folders }
}

/**
 * Le rangement appliqué aux index qui existent : chaque index une seule fois (dans son
 * dossier s'il en a un), les index inconnus retirés, les nouveaux ajoutés à la racine.
 */
export function arrangeIndexDirectory(layout: IndexDirectoryLayout, known: Array<{ key: string; label: string }>) {
  const exists = new Set(known.map((entry) => entry.key))
  const placed = new Set<string>()
  const folders = layout.folders.map((folder) => ({ ...folder, items: folder.items.filter((key) => exists.has(key) && !placed.has(key) && placed.add(key)) }))
  const folderIds = new Set(folders.map((folder) => `${FOLDER_PREFIX}${folder.id}`))
  const root = layout.root.filter((key) => (folderIds.has(key) || exists.has(key)) && !placed.has(key) && placed.add(key))
  // Un dossier oublié de la racine y revient, à la fin.
  for (const id of folderIds) if (!placed.has(id)) root.push(id)
  const missing = known.filter((entry) => !placed.has(entry.key)).sort((left, right) => left.label.localeCompare(right.label, "fr", { sensitivity: "base" }))
  return { root: [...root, ...missing.map((entry) => entry.key)], folders }
}

/** Les index dans l'ordre de la page (dossiers dépliés à leur place). */
export function indexDirectoryOrder(layout: IndexDirectoryLayout) {
  return layout.root.flatMap((key) => key.startsWith(FOLDER_PREFIX) ? layout.folders.find((folder) => `${FOLDER_PREFIX}${folder.id}` === key)?.items ?? [] : [key])
}
