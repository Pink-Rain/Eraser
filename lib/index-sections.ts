/**
 * La colonne « Sections » : des parties, chacune avec son titre et son texte mis en forme (les
 * parties d'une page de wiki, les tomes d'un livre). Dans la feuille, chaque partie commence
 * par une ligne « ## Titre » (en gras), son texte suit, avec sa mise en forme :
 *
 *   ## Tome 1
 *   Le début de l'histoire…
 *   ## Tome 2
 *   …
 *
 * Ce format traverse le texte enrichi de Google Sheets tel quel (les index du monde comme
 * l'Index des objets, ses Livres compris) et se lit, s'écrit à la main dans la feuille. Un
 * texte écrit avant le premier titre est une partie sans titre. Sans dépendance : la grille,
 * les cartes, les pages et les tests s'en servent.
 */
import { sanitizeRichText } from "@/lib/rich-text-sanitize"

export type IndexSection = { title: string; html: string }

const decode = (value: string) => value.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const plainOf = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
/** Un texte vide pour l'œil (balises vides, espaces) : pas de texte. */
const isBlank = (html: string) => !plainOf(html) && !/<(img|input|hr)\b/i.test(html)
/** Une ligne de titre : « ## Titre » (ou un titre `<h3>` collé). */
const TITLE = /^#{2,3}\s*/

/** Les lignes d'un HTML, mise en forme gardée dans chaque ligne. */
function linesOf(html: string) {
  return html
    .replace(/\r/g, "")
    .replace(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi, (_, inner: string) => `\n## ${plainOf(inner).replace(TITLE, "")}\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<(p|div)\b[^>]*>/gi, "")
    .split("\n")
}

/** Les parties d'une case (titre en texte simple, texte en HTML nettoyé, une ligne par `<br>`). */
export function parseSections(value: string): IndexSection[] {
  const sections: IndexSection[] = []
  let current: { title: string | null; lines: string[] } = { title: null, lines: [] }
  const flush = () => {
    while (current.lines.length && isBlank(current.lines[current.lines.length - 1])) current.lines.pop()
    while (current.lines.length && isBlank(current.lines[0])) current.lines.shift()
    const html = sanitizeRichText(current.lines.join("<br>")).trim()
    if (current.title !== null || !isBlank(html)) sections.push({ title: current.title ?? "", html: isBlank(html) ? "" : html })
  }
  for (const line of linesOf(sanitizeRichText(value ?? ""))) {
    const plain = plainOf(line)
    if (TITLE.test(plain)) {
      flush()
      current = { title: plain.replace(TITLE, "").trim(), lines: [] }
    } else current.lines.push(line)
  }
  flush()
  return sections
}

/** La case : chaque partie, sa ligne « ## Titre » en gras puis son texte ; une partie vide de tout est sautée. */
export function formatSections(sections: IndexSection[]) {
  return sections
    .map((section) => ({ title: section.title.replace(/\s+/g, " ").trim(), html: isBlank(section.html) ? "" : sanitizeRichText(section.html).trim() }))
    .filter((section) => section.title || section.html)
    .map((section, index) => [section.title || index > 0 ? `<b>## ${escape(section.title || "Sans titre")}</b>` : "", section.html].filter(Boolean).join("<br>"))
    .join("<br>")
}

/** Les titres des parties : ce que montre le tableau (« Tome 1 · Tome 2 »). */
export function sectionTitles(value: string) {
  return parseSections(value).map((section, index) => section.title || (index === 0 ? "Introduction" : `Partie ${index + 1}`))
}

/** Le texte simple de toutes les parties (recherche, tri, filtres). */
export function sectionsPlainText(value: string) {
  return parseSections(value).map((section) => [section.title, decode(section.html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, ""))].filter(Boolean).join("\n")).join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
