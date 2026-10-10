/**
 * « Actualiser » (bouton de la barre, F5) : tout ce que le serveur local garde en mémoire
 * de Google Sheets est oublié, pour que la page rechargée relise les données. Chaque module
 * qui garde un cache s'inscrit ici et sait l'oublier lui-même.
 *
 * Rien n'est supprimé ni écrit : ni dans Google, ni dans la base locale (hors marque de
 * synchronisation), ni sur le serveur partagé.
 *
 * `all` : tout (administrateur, MJ : ce sont eux qui modifient Google Sheets directement).
 * `play` : seulement ce qui change pendant une partie (fiches, inventaires, campagnes, PNJ…).
 * Les données de référence (classes, sorts, spécificités, index, réglages) restent alors en
 * mémoire et se relisent d'elles-mêmes au bout de quelques minutes : cinq joueurs qui
 * actualisent en même temps pour voir ce que le MJ vient d'ajouter ne relisent pas toutes
 * les règles, sur le quota Google qu'ils partagent.
 */
export type ForgetScope = "all" | "play"

const listeners = new Set<(scope: ForgetScope) => void | Promise<void>>()

/** Un module qui garde Google en mémoire : il oublie ce que la portée demande (tout, par défaut). */
export function onForgetGoogleData(listener: (scope: ForgetScope) => void | Promise<void>) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function forgetGoogleData(scope: ForgetScope = "all") {
  await Promise.all([...listeners].map(async (listener) => {
    try { await listener(scope) } catch (error) { console.error("DATA_REFRESH_FORGET_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR") }
  }))
}
