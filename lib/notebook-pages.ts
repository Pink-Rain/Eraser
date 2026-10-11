/**
 * Le carnet de notes d'une fiche, en pages nommées, dans sa seule case « Note ». Une page
 * unique nommée « Notes » s'écrit telle quelle (le carnet d'avant, inchangé dans Sheets) ;
 * plusieurs pages s'écrivent chacune dans une <section data-eraser-page="Nom">.
 */
export type NotebookPage = { name: string; html: string }

export const DEFAULT_NOTEBOOK_PAGE = "Notes"

const SECTION = /<section data-eraser-page="([^"]*)">([\s\S]*?)<\/section>/g

const escapeName = (name: string) => name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const unescapeName = (name: string) => name.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&")

/** Un nom de page propre : une ligne, 40 caractères au plus. */
export function notebookPageName(name: string, fallback = DEFAULT_NOTEBOOK_PAGE) {
  return name.replace(/\s+/g, " ").trim().slice(0, 40) || fallback
}

/** Un nom qu'aucune autre page ne porte : « Notes », sinon « Notes 2 », « Notes 3 »… */
export function uniqueNotebookPageName(name: string, pages: readonly NotebookPage[], exceptIndex = -1) {
  const taken = new Set(pages.filter((_, index) => index !== exceptIndex).map((page) => page.name.toLocaleLowerCase("fr")))
  if (!taken.has(name.toLocaleLowerCase("fr"))) return name
  let number = 2
  while (taken.has(`${name} ${number}`.toLocaleLowerCase("fr"))) number += 1
  return `${name} ${number}`
}

export function readNotebook(value: string): NotebookPage[] {
  const text = value ?? ""
  if (!text.includes("<section data-eraser-page=")) return [{ name: DEFAULT_NOTEBOOK_PAGE, html: text }]
  // Deux pages du même nom (écrites à la main dans Sheets) : la seconde est renommée, chaque page reste à part.
  const pages: NotebookPage[] = []
  for (const match of text.matchAll(SECTION)) pages.push({ name: uniqueNotebookPageName(notebookPageName(unescapeName(match[1])), pages), html: match[2] })
  // Du texte hors des pages (écrit à la main dans Sheets) : gardé en tête, dans sa propre page.
  const outside = text.replace(SECTION, "").trim()
  if (outside) pages.unshift({ name: uniqueNotebookPageName(DEFAULT_NOTEBOOK_PAGE, pages), html: outside })
  return pages.length ? pages : [{ name: DEFAULT_NOTEBOOK_PAGE, html: "" }]
}

export function writeNotebook(pages: readonly NotebookPage[]): string {
  // Le contenu d'une page ne peut pas ouvrir ni fermer une page.
  const clean = pages.map((page) => ({ name: notebookPageName(page.name), html: page.html.replace(/<\/?section\b[^>]*>/gi, "") }))
  if (!clean.length) return ""
  if (clean.length === 1 && clean[0].name === DEFAULT_NOTEBOOK_PAGE) return clean[0].html
  return clean.map((page) => `<section data-eraser-page="${escapeName(page.name)}">${page.html}</section>`).join("")
}

/** Un nom libre pour une nouvelle page (« Page 2 », « Page 3 »…). */
export function nextNotebookPageName(pages: readonly NotebookPage[]) {
  const taken = new Set(pages.map((page) => page.name.toLocaleLowerCase("fr")))
  let number = pages.length + 1
  while (taken.has(`page ${number}`)) number += 1
  return `Page ${number}`
}
