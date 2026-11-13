/** Un lien vers Roll20 en https, ou "" pour l'effacer ; sinon `INVALID_ROLL20_URL`. */
export function cleanRoll20Url(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return ""
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new Error("INVALID_ROLL20_URL")
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== "https:" || !(host === "roll20.net" || host.endsWith(".roll20.net")) || url.href.length > 500) throw new Error("INVALID_ROLL20_URL")
  return url.href
}

/**
 * La page des scripts Mod d'une partie Roll20, déduite du lien de la partie (« join/123/abc »,
 * « campaigns/details/123 », « editor/setcampaign/123 ») : le numéro de la partie est le même.
 * "" si le lien ne le donne pas.
 */
export function roll20ScriptsUrlFrom(gameUrl: string) {
  const id = gameUrl.match(/roll20\.net\/(?:join|campaigns\/(?:details|scripts|settings)|editor\/setcampaign)\/(\d+)/i)?.[1]
  return id ? `https://app.roll20.net/campaigns/scripts/${id}` : ""
}
