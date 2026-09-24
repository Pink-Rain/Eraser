/**
 * Liens vers une page d'Eraser dans un texte enrichi. Dans l'application ils restent
 * relatifs (« /campagne/… ») et s'ouvrent sur place ; Google Sheets n'accepte que des
 * adresses complètes, on leur donne donc celle du serveur local à l'écriture, et on la
 * retire à la lecture.
 */
export const APP_ORIGIN = "http://127.0.0.1:32147"

/** Le chemin interne d'un lien, ou "" s'il mène ailleurs. */
export function internalAppPath(href: string) {
  const value = String(href ?? "").trim()
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) return value
  try {
    const url = new URL(value)
    if (url.origin === APP_ORIGIN) return `${url.pathname}${url.search}${url.hash}`
  } catch { /* pas une adresse complète */ }
  return ""
}

export type AppLinkTarget = { label: string; href: string; group: string; hint?: string }
