/**
 * Le nettoyage d'un texte enrichi d'Eraser : seules les balises que l'éditeur sait écrire
 * restent (gras, listes, liens…), sans script ni attribut d'événement. Règle pure, sans
 * navigateur : l'éditeur (components/eraser/rich-text.tsx) et le serveur (pages créées
 * dans le créateur de pages) s'en servent.
 */
import { internalAppPath } from "@/lib/app-links"
import { normalizeCssColorToHex } from "@/lib/google-sheet-rich-text"

const allowedTags = "strong|b|em|i|u|s|br|p|div|ul|ol|li|a|span|h2|h3|hr|input"

function colorFromTag(tag: string) {
  const style = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] || ""
  const styleColor = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1] || ""
  const attributeColor = tag.match(/\bcolor\s*=\s*["']([^"']+)["']/i)?.[1] || ""
  return normalizeCssColorToHex(styleColor || attributeColor)
}

/**
 * Le gras et l'italique dits en CSS (un collage depuis Google Docs ou Sheets, Ctrl+B après une
 * couleur, « dégraisser » un mot d'un texte gras) : gardés sous une forme simple, que
 * l'écriture vers Sheets comprend. Les jeter faisait perdre ce gras à l'enregistrement.
 */
function typeStyleOf(tag: string) {
  const style = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] || ""
  const weight = style.match(/(?:^|;)\s*font-weight\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
  const italic = style.match(/(?:^|;)\s*font-style\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
  return [
    weight ? `font-weight:${weight === "bold" || weight === "bolder" || Number(weight) >= 600 ? "bold" : "normal"}` : "",
    italic ? `font-style:${/italic|oblique/.test(italic) ? "italic" : "normal"}` : "",
  ].filter(Boolean).join(";")
}

function spanOf(tag: string) {
  const color = colorFromTag(tag)
  const style = [color ? `color:${color}` : "", typeStyleOf(tag)].filter(Boolean).join(";")
  return style ? `<span style="${style}">` : "<span>"
}

export function sanitizeRichText(html: string) {
  return String(html ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/☑/g, '<input type="checkbox" checked>')
    .replace(/☐/g, '<input type="checkbox">')
    .replace(/<font\b[^>]*>/gi, spanOf)
    .replace(/<\/font\s*>/gi, "</span>")
    .replace(/<span\b[^>]*>/gi, spanOf)
    .replace(/<input\b[^>]*>/gi, (tag) => `<input type="checkbox"${/\schecked(?:\s|=|>)/i.test(tag) ? " checked" : ""}>`)
    .replace(new RegExp(`<(?!/?(?:${allowedTags})\\b)[^>]*>`, "gi"), "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, href: string) => {
      // Une page d'Eraser : lien relatif, ouvert sur place.
      const internal = internalAppPath(href.replace(/&amp;/g, "&"))
      if (internal) return `<a href="${internal.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`
      try {
        const url = new URL(href)
        return ["http:", "https:"].includes(url.protocol) ? `<a href="${url.toString().replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">` : "<a>"
      } catch { return "<a>" }
    })
    // Le gras d'un <b style="font-weight:normal"> (l'enveloppe d'un collage Google Docs) n'en est pas.
    .replace(/<(strong|b|em|i)\b([^>]*)>/gi, (_, tag: string, rest: string) => { const style = typeStyleOf(rest); return style ? `<${tag} style="${style}">` : `<${tag}>` })
    .replace(/<(u|s|br|p|div|ul|ol|li|h2|h3|hr)\b[^>]*>/gi, "<$1>")
    .replace(/<b(\s[^>]*)?>/gi, "<strong$1>").replace(/<\/b>/gi, "</strong>")
    .replace(/<i(\s[^>]*)?>/gi, "<em$1>").replace(/<\/i>/gi, "</em>")
    .replace(/\s(?:on\w+|class|id)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "")
}
