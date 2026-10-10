/**
 * Les règles gardées en mémoire (index et leurs réglages, classes, sorts, spécificités,
 * bonus de rang, catalogue des objets…) : oubliées quand l'administrateur ou le MJ
 * actualise, puisque ce sont eux qui les modifient, parfois directement dans Google Sheets.
 * Chaque module qui en garde s'inscrit ici et sait l'oublier lui-même. Ce que la page
 * affiche, lui, est relu par lib/request-freshness.ts, pour tout le monde.
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
