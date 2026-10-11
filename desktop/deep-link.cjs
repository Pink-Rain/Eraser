"use strict"

/**
 * Les liens « eraser:// » : un lien de page copié dans Eraser (ou la page d'ouverture du
 * serveur partagé) ouvre l'application sur cette page, comme un lien Discord ou Spotify.
 *
 *   eraser://open/regles/classes?onglet=sorts   →   /regles/classes?onglet=sorts
 *
 * Seule une adresse de page d'Eraser passe : un chemin qui commence par une seule « / »,
 * sans schéma, sans « \ », sans caractère de contrôle. Tout le reste ouvre l'accueil.
 */

const DEEP_LINK_SCHEME = "eraser"
const MAX_PATH = 1000

/** Une adresse de page d'Eraser sûre, ou « / ». */
function safeAppPath(input) {
  const value = typeof input === "string" ? input.trim() : ""
  if (!value || value.length > MAX_PATH) return "/"
  if (!value.startsWith("/") || value.startsWith("//")) return "/"
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "/"
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return "/"
  return value
}

/** Le lien qui ouvre l'application sur une page. */
function deepLinkFor(path) {
  return `${DEEP_LINK_SCHEME}://open${safeAppPath(path)}`
}

/** La page demandée par un lien « eraser:// » (null si ce n'en est pas un). */
function pathFromDeepLink(link) {
  if (typeof link !== "string") return null
  const match = link.trim().match(/^eraser:(?:\/\/)?(.*)$/i)
  if (!match) return null
  let rest = match[1]
  // « eraser://open/… », « eraser:///… » et « eraser://… » mènent tous à la page.
  rest = rest.replace(/^open(?=\/|\?|#|$)/i, "")
  if (!rest.startsWith("/")) rest = `/${rest}`
  // Windows ajoute parfois une « / » finale au lien passé en argument.
  if (rest.length > 1 && rest.endsWith("/") && !rest.includes("?") && !rest.includes("#")) rest = rest.slice(0, -1)
  return safeAppPath(rest)
}

/** Le premier lien « eraser:// » d'une ligne de commande (Windows le passe en argument). */
function deepLinkInArgs(args) {
  return Array.isArray(args) ? args.find((arg) => typeof arg === "string" && /^eraser:/i.test(arg)) ?? null : null
}

module.exports = { DEEP_LINK_SCHEME, safeAppPath, deepLinkFor, pathFromDeepLink, deepLinkInArgs }
