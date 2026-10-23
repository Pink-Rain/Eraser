/**
 * Ce qu'une session cache aux joueurs : le MJ révèle chaque chose (un personnage, un PNJ,
 * un magasin, un événement) quand elle entre en jeu, et seules les choses révélées
 * s'affichent dans le journal de la session. Une chose ajoutée à la session est cachée.
 *
 * La session garde la liste de ce qui est caché (colonne « Cachés (JSON) ») : une session
 * d'avant cette colonne n'a rien de caché, son journal reste tel qu'il était.
 * Sans dépendance : le Créateur de session et le journal (serveur) la lisent tous deux.
 */
export type SessionRevealKind = "character" | "npc" | "shop" | "event" | "place"

/** La clé d'une chose de la session dans la liste des cachées : « npc:ID », « event:shop:ID »… */
export function sessionItemKey(kind: SessionRevealKind, id: string) {
  return `${kind}:${id}`
}

type SessionLists = { characterIds: string[]; npcIds: string[]; shopIds: string[]; eventIds: string[]; legacyEvents?: Array<{ id: string }>; /** Les lieux de l'Index des lieux liés à la session. */ placeLinks?: Array<{ id: string }>; hidden?: string[] }

/** Toutes les choses de la session, sous leur clé (« Tout cacher » les cache toutes). */
export function sessionItemKeys(session: SessionLists) {
  return [
    ...session.characterIds.map((id) => sessionItemKey("character", id)),
    ...session.npcIds.map((id) => sessionItemKey("npc", id)),
    ...session.shopIds.map((id) => sessionItemKey("shop", id)),
    ...session.eventIds.map((id) => sessionItemKey("event", id)),
    ...(session.legacyEvents ?? []).map((event) => sessionItemKey("event", event.id)),
    ...(session.placeLinks ?? []).map((place) => sessionItemKey("place", place.id)),
  ]
}

export function isSessionItemHidden(session: Pick<SessionLists, "hidden">, kind: SessionRevealKind, id: string) {
  return Boolean(session.hidden?.includes(sessionItemKey(kind, id)))
}

/**
 * Les cachées après un changement des listes : une chose ajoutée est cachée, une chose
 * retirée sort de la liste (rajoutée plus tard, elle sera de nouveau cachée).
 */
export function hiddenAfterChange(hidden: string[], kind: SessionRevealKind, before: string[], after: string[]) {
  const had = new Set(before)
  const has = new Set(after)
  const added = after.filter((id) => !had.has(id)).map((id) => sessionItemKey(kind, id))
  const removed = new Set(before.filter((id) => !has.has(id)).map((id) => sessionItemKey(kind, id)))
  return [...new Set([...hidden.filter((key) => !removed.has(key)), ...added])]
}

/** La session telle qu'un joueur la voit : seulement ce que le MJ a révélé. */
export function revealedSession<T extends SessionLists>(session: T): T {
  if (!session.hidden?.length) return session
  const hidden = new Set(session.hidden)
  const shown = (kind: SessionRevealKind) => (id: string) => !hidden.has(sessionItemKey(kind, id))
  return {
    ...session,
    characterIds: session.characterIds.filter(shown("character")),
    npcIds: session.npcIds.filter(shown("npc")),
    shopIds: session.shopIds.filter(shown("shop")),
    eventIds: session.eventIds.filter(shown("event")),
    ...(session.legacyEvents ? { legacyEvents: session.legacyEvents.filter((event) => shown("event")(event.id)) } : {}),
    ...(session.placeLinks ? { placeLinks: session.placeLinks.filter((place) => shown("place")(place.id)) } : {}),
  }
}
