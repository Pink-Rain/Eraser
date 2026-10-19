import type { ObjectIndexTable } from "@/lib/google-sheets"

/**
 * Les items pour l'inventaire, les magasins, les fouilles, les événements, les références et
 * les dons : l'Index des items tel que le moteur des index le garde (lib/world-indexes.ts,
 * `objectCatalog`) — une seule lecture, une seule copie en mémoire.
 *
 * Le moteur est chargé à la demande : il dépend de lib/google-sheets.ts, qui sert lui-même
 * l'inventaire et les magasins.
 *
 * `current` : la version à jour, pour écrire d'après elle. `forWrite` : jamais la version de
 * secours gardée quand Google ne répond pas.
 */
export async function objectCatalog(options: { current?: boolean; forWrite?: boolean } = {}): Promise<ObjectIndexTable[]> {
  const engine = await import("@/lib/world-indexes")
  return engine.objectCatalog(options)
}

/** Les items déjà en mémoire, sans rien lire dans Google Sheets (vide s'ils n'ont jamais été lus). */
export async function objectCatalogInMemory(): Promise<ObjectIndexTable[]> {
  const engine = await import("@/lib/world-indexes")
  return engine.objectCatalogInMemory()
}

/** Le classeur des items a changé (regroupé, regroupement annulé) : le moteur le relit en entier à la prochaine lecture. */
export async function forgetObjectCatalog() {
  const [engine, { OBJECTS_INDEX_KEY }] = await Promise.all([import("@/lib/world-indexes"), import("@/lib/world-index-definitions")])
  engine.forgetEffectiveIndex(OBJECTS_INDEX_KEY)
}
