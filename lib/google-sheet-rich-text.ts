import { APP_ORIGIN, internalAppPath } from "@/lib/app-links"

export type GoogleRgbColor = {
  red?: number
  green?: number
  blue?: number
}

export type GoogleTextFormat = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  link?: { uri?: string }
  foregroundColor?: GoogleRgbColor
  foregroundColorStyle?: { rgbColor?: GoogleRgbColor }
}

export type GoogleTextFormatRun = {
  startIndex?: number
  format?: GoogleTextFormat
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function safeLink(value: string | undefined) {
  if (!value) return ""
  // Une page d'Eraser : Sheets veut une adresse complète, celle du serveur local.
  const internal = internalAppPath(value.replace(/&amp;/g, "&"))
  if (internal) return `${APP_ORIGIN}${internal}`
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

function textColor(format: GoogleTextFormat) {
  return format.foregroundColorStyle?.rgbColor || format.foregroundColor
}

function googleColorToHex(color?: GoogleRgbColor) {
  if (!color) return ""
  const channel = (value = 0) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`
}

export function normalizeCssColorToHex(value: string) {
  const normalized = value.trim().toLowerCase()
  const short = normalized.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (short) return `#${short.slice(1).map((channel) => `${channel}${channel}`).join("")}`
  const full = normalized.match(/^#([0-9a-f]{6})$/i)
  if (full) return `#${full[1]}`
  const rgb = normalized.match(/^rgba?\(\s*([+-]?[\d.]+)(%)?\s*[, ]\s*([+-]?[\d.]+)(%)?\s*[, ]\s*([+-]?[\d.]+)(%)?(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i)
  if (!rgb) return ""
  const channel = (raw: string, percent: string | undefined) => {
    const numeric = Number(raw)
    const value255 = percent ? numeric * 2.55 : numeric
    return Math.round(Math.max(0, Math.min(255, value255))).toString(16).padStart(2, "0")
  }
  return `#${channel(rgb[1], rgb[2])}${channel(rgb[3], rgb[4])}${channel(rgb[5], rgb[6])}`
}

function hexToGoogleColor(value: string): GoogleRgbColor | undefined {
  const normalized = normalizeCssColorToHex(value)
  const full = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!full) return undefined
  const channels = full.slice(1).map((channel) => Number.parseInt(channel, 16))
  return { red: channels[0] / 255, green: channels[1] / 255, blue: channels[2] / 255 }
}

function wrapFormattedText(value: string, format: GoogleTextFormat = {}) {
  let html = escapeHtml(value).replace(/\n/g, "<br />")
  if (format.bold) html = `<strong>${html}</strong>`
  if (format.italic) html = `<em>${html}</em>`
  if (format.underline) html = `<u>${html}</u>`
  if (format.strikethrough) html = `<s>${html}</s>`
  const href = safeLink(format.link?.uri)
  const internal = href ? internalAppPath(href) : ""
  if (internal) html = `<a href="${escapeHtml(internal)}">${html}</a>`
  else if (href) html = `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${html}</a>`
  const color = googleColorToHex(textColor(format))
  if (color) html = `<span style="color:${color}">${html}</span>`
  return html
}

export function richTextHtml(value: string, runs: GoogleTextFormatRun[] = [], baseFormat: GoogleTextFormat = {}) {
  if (!value) return ""
  if (!runs.length) return wrapFormattedText(value, baseFormat)
  // Google n'écrit pas un `startIndex` nul : le premier morceau arrive sans. L'écarter faisait
  // perdre le gras (l'italique…) de tout ce qui commence une cellule (« **Effet :** … »).
  const ordered = runs
    .map((run) => ({ startIndex: run.startIndex ?? 0, format: run.format }))
    .filter((run) => Number.isInteger(run.startIndex) && run.startIndex >= 0 && run.startIndex < value.length)
    .sort((left, right) => left.startIndex - right.startIndex)
  if (!ordered.length || ordered[0].startIndex > 0) ordered.unshift({ startIndex: 0, format: baseFormat })
  return ordered.map((run, index) => {
    const start = run.startIndex ?? 0
    const end = ordered[index + 1]?.startIndex ?? value.length
    return wrapFormattedText(value.slice(start, end), { ...baseFormat, ...(run.format || {}) })
  }).join("")
}

function decodeEntities(value: string) {
  // « &amp; » en dernier : un « &lt; » écrit dans la case (« &amp;lt; ») reste « &lt; ».
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
}

function formatsEqual(left: GoogleTextFormat, right: GoogleTextFormat) {
  return Boolean(left.bold) === Boolean(right.bold)
    && Boolean(left.italic) === Boolean(right.italic)
    && Boolean(left.underline) === Boolean(right.underline)
    && Boolean(left.strikethrough) === Boolean(right.strikethrough)
    && (left.link?.uri || "") === (right.link?.uri || "")
    && googleColorToHex(textColor(left)) === googleColorToHex(textColor(right))
}

/** Le gras (ou non) que dit un `style` : `font-weight: 700`, `bold`, `normal`… ; rien s'il n'en dit rien. */
function styleWeight(token: string) {
  const weight = token.match(/\bstyle\s*=\s*["'][^"']*\bfont-weight\s*:\s*([^;"']+)/i)?.[1]?.trim().toLowerCase()
  if (!weight) return undefined
  return weight === "bold" || weight === "bolder" || Number(weight) >= 600
}

function styleItalic(token: string) {
  const style = token.match(/\bstyle\s*=\s*["'][^"']*\bfont-style\s*:\s*([^;"']+)/i)?.[1]?.trim().toLowerCase()
  return style ? /italic|oblique/.test(style) : undefined
}

/**
 * Le format écrit pour un morceau de texte : gras, italique, souligné et barré y sont
 * toujours dits, vrais ou faux. Un format vide signifie pour Sheets « comme la cellule » :
 * une cellule mise en gras dans Sheets redevenait alors grasse en entier, et ce qu'on
 * avait dégraissé dans Eraser revenait gras à la relecture. Le lien et la couleur, eux,
 * restent hérités quand ils ne sont pas donnés (la couleur d'une colonne vient de la cellule).
 */
function explicitFormat(format: GoogleTextFormat): GoogleTextFormat {
  return {
    ...format,
    bold: Boolean(format.bold),
    italic: Boolean(format.italic),
    underline: Boolean(format.underline),
    strikethrough: Boolean(format.strikethrough),
    link: format.link ? { ...format.link } : undefined,
  }
}

export function htmlToRichText(value: string) {
  const tokens = value.replace(/\r/g, "").split(/(<[^>]+>)/g).filter(Boolean)
  const stack: Array<{ tag: string; format: GoogleTextFormat }> = [{ tag: "root", format: {} }]
  const runs: GoogleTextFormatRun[] = []
  let text = ""

  function activeFormat() { return stack[stack.length - 1]?.format || {} }
  function pushText(raw: string) {
    let decoded = decodeEntities(raw.replace(/<[^>]*>/g, ""))
    // Pas plus d'une ligne vide d'affilée. Resserré ici, avant de compter les positions :
    // resserré après coup, le texte reculait sous ses mises en forme (le gras glissait).
    const trailing = text.match(/\n*$/)?.[0].length ?? 0
    decoded = decoded.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, (lines) => lines.slice(0, Math.max(0, 2 - trailing)))
    if (!decoded) return
    const format = activeFormat()
    const previous = runs[runs.length - 1]
    if (!previous || !formatsEqual(previous.format || {}, format)) runs.push({ startIndex: text.length, format: explicitFormat(format) })
    text += decoded
  }
  function newline() {
    if (text && !text.endsWith("\n")) pushText("\n")
  }

  for (const token of tokens) {
    if (!token.startsWith("<")) { pushText(token); continue }
    const closing = /^<\//.test(token)
    const tag = token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase() || ""
    if (tag === "br" || tag === "hr") { newline(); continue }
    if (closing) {
      if (["p", "div", "li", "h2", "h3"].includes(tag)) newline()
      const index = stack.map((entry) => entry.tag).lastIndexOf(tag)
      if (index > 0) stack.splice(index)
      continue
    }
    if (["p", "div", "li", "h2", "h3"].includes(tag) && text) newline()
    const next: GoogleTextFormat = { ...activeFormat(), link: activeFormat().link ? { ...activeFormat().link } : undefined }
    if (tag === "strong" || tag === "b" || tag === "h2" || tag === "h3") next.bold = true
    if (tag === "em" || tag === "i") next.italic = true
    // Un collage (Google Docs, Sheets) ou Ctrl+B après une couleur : le gras dit en CSS.
    const weight = styleWeight(token)
    if (weight !== undefined) next.bold = weight
    const italic = styleItalic(token)
    if (italic !== undefined) next.italic = italic
    if (tag === "u") next.underline = true
    if (tag === "s" || tag === "strike") next.strikethrough = true
    if (tag === "a") {
      const href = safeLink(token.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
      if (href) next.link = { uri: href }
    }
    if (tag === "span" || tag === "font") {
      const color = token.match(/\bstyle\s*=\s*["'][^"']*\bcolor\s*:\s*([^;"']+)/i)?.[1]
        || token.match(/\bcolor\s*=\s*["']([^"']+)["']/i)?.[1]
      const rgbColor = color ? hexToGoogleColor(color) : undefined
      if (rgbColor) next.foregroundColorStyle = { rgbColor }
    }
    stack.push({ tag, format: next })
    if (tag === "li") pushText("• ")
  }
  text = text.replace(/\n+$/, "")
  return { text, runs: runs.filter((run) => (run.startIndex ?? 0) < text.length) }
}

export function rgbColorToHex(color?: GoogleRgbColor) {
  return googleColorToHex(color)
}

export function hexColorToRgb(value: string) {
  return hexToGoogleColor(value)
}
