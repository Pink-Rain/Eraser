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

function hexToGoogleColor(value: string): GoogleRgbColor | undefined {
  const normalized = value.trim().toLowerCase()
  const short = normalized.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  const full = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  const channels = short
    ? short.slice(1).map((channel) => Number.parseInt(`${channel}${channel}`, 16))
    : full?.slice(1).map((channel) => Number.parseInt(channel, 16))
  if (!channels) return undefined
  return { red: channels[0] / 255, green: channels[1] / 255, blue: channels[2] / 255 }
}

function wrapFormattedText(value: string, format: GoogleTextFormat = {}) {
  let html = escapeHtml(value).replace(/\n/g, "<br />")
  if (format.bold) html = `<strong>${html}</strong>`
  if (format.italic) html = `<em>${html}</em>`
  if (format.underline) html = `<u>${html}</u>`
  if (format.strikethrough) html = `<s>${html}</s>`
  const href = safeLink(format.link?.uri)
  if (href) html = `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${html}</a>`
  const color = googleColorToHex(textColor(format))
  if (color) html = `<span style="color:${color}">${html}</span>`
  return html
}

export function richTextHtml(value: string, runs: GoogleTextFormatRun[] = [], baseFormat: GoogleTextFormat = {}) {
  if (!value) return ""
  if (!runs.length) return wrapFormattedText(value, baseFormat)
  const ordered = [...runs]
    .filter((run) => Number.isInteger(run.startIndex) && (run.startIndex ?? 0) >= 0 && (run.startIndex ?? 0) < value.length)
    .sort((left, right) => (left.startIndex ?? 0) - (right.startIndex ?? 0))
  if (!ordered.length || (ordered[0].startIndex ?? 0) > 0) ordered.unshift({ startIndex: 0, format: baseFormat })
  return ordered.map((run, index) => {
    const start = run.startIndex ?? 0
    const end = ordered[index + 1]?.startIndex ?? value.length
    return wrapFormattedText(value.slice(start, end), { ...baseFormat, ...(run.format || {}) })
  }).join("")
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function formatsEqual(left: GoogleTextFormat, right: GoogleTextFormat) {
  return Boolean(left.bold) === Boolean(right.bold)
    && Boolean(left.italic) === Boolean(right.italic)
    && Boolean(left.underline) === Boolean(right.underline)
    && Boolean(left.strikethrough) === Boolean(right.strikethrough)
    && (left.link?.uri || "") === (right.link?.uri || "")
    && googleColorToHex(textColor(left)) === googleColorToHex(textColor(right))
}

export function htmlToRichText(value: string) {
  const tokens = value.replace(/\r/g, "").split(/(<[^>]+>)/g).filter(Boolean)
  const stack: Array<{ tag: string; format: GoogleTextFormat }> = [{ tag: "root", format: {} }]
  const runs: GoogleTextFormatRun[] = []
  let text = ""

  function activeFormat() { return stack[stack.length - 1]?.format || {} }
  function pushText(raw: string) {
    const decoded = decodeEntities(raw.replace(/<[^>]*>/g, ""))
    if (!decoded) return
    const format = activeFormat()
    const previous = runs[runs.length - 1]
    if (!previous || !formatsEqual(previous.format || {}, format)) runs.push({ startIndex: text.length, format: { ...format, link: format.link ? { ...format.link } : undefined } })
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
    if (tag === "strong" || tag === "b") next.bold = true
    if (tag === "em" || tag === "i") next.italic = true
    if (tag === "u") next.underline = true
    if (tag === "s" || tag === "strike") next.strikethrough = true
    if (tag === "a") {
      const href = safeLink(token.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
      if (href) next.link = { uri: href }
    }
    if (tag === "span") {
      const color = token.match(/\bstyle\s*=\s*["'][^"']*\bcolor\s*:\s*(#[0-9a-f]{3}|#[0-9a-f]{6})\b[^"']*["']/i)?.[1]
      const rgbColor = color ? hexToGoogleColor(color) : undefined
      if (rgbColor) next.foregroundColorStyle = { rgbColor }
    }
    stack.push({ tag, format: next })
    if (tag === "li") pushText("• ")
  }
  text = text.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "")
  return { text, runs: runs.filter((run) => (run.startIndex ?? 0) < text.length) }
}

export function rgbColorToHex(color?: GoogleRgbColor) {
  return googleColorToHex(color)
}

export function hexColorToRgb(value: string) {
  return hexToGoogleColor(value)
}
