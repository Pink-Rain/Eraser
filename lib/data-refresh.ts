/**
 * « Actualiser » (bouton de la barre, F5) : tout ce que le serveur local garde en mémoire
 * de Google Sheets est oublié, pour que la page rechargée relise les données. Chaque module
 * qui garde un cache s'inscrit ici et sait l'oublier lui-même.
 *
 * Rien n'est supprimé ni écrit : ni dans Google, ni dans la base locale (hors marque de
 * synchronisation), ni sur le serveur partagé.
 */
const listeners = new Set<() => void | Promise<void>>()

export function onForgetGoogleData(listener: () => void | Promise<void>) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export async function forgetGoogleData() {
  await Promise.all([...listeners].map(async (listener) => {
    try { await listener() } catch (error) { console.error("DATA_REFRESH_FORGET_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR") }
  }))
}
