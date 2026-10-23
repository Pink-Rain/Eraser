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
