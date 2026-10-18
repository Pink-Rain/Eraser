/**
 * Les versions d'une forme (formulaire, survol, liste, calendrier…) : la version à l'étoile vit
 * à la place principale, les autres sont nommées. `VersionMeta` garde le nom et l'identifiant de
 * la version à l'étoile : mettre l'étoile sur une autre version ne renomme rien, et un bloc de
 * page qui désigne une version par son identifiant la retrouve, à l'étoile ou non.
 */
export type VersionMeta = { id: string; name: string }

/** Le nom et l'identifiant d'une version à l'étoile, lus d'un enregistrement ; illisibles : `undefined`. */
export function cleanVersionMeta(input: unknown): VersionMeta | undefined {
  if (!input || typeof input !== "object") return undefined
  const raw = input as Record<string, unknown>
  const id = (typeof raw.id === "string" ? raw.id : "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)
  const name = (typeof raw.name === "string" ? raw.name : "").replace(/\s+/g, " ").trim().slice(0, 60)
  return id && name ? { id, name } : undefined
}
