import type { CSSProperties } from "react"

import type { ColumnStyle } from "@/lib/index-columns"

/** Les couleurs proposées pour un style imposé, une option de liste ou un bouton. */
export const stylePalette: Array<{ value: string; label: string }> = [
  { value: "muted", label: "Discret (gris)" },
  { value: "#1f1b16", label: "Encre" },
  { value: "#7f1d1d", label: "Bordeaux" },
  { value: "#b3261e", label: "Rouge (compétences)" },
  { value: "#c2410c", label: "Orange" },
  { value: "#b7791f", label: "Ambre" },
  { value: "#927640", label: "Or" },
  { value: "#4d7c0f", label: "Vert" },
  { value: "#315b55", label: "Sapin" },
  { value: "#285f8f", label: "Bleu" },
  { value: "#1e3a8a", label: "Nuit" },
  { value: "#6b4c9a", label: "Violet" },
  { value: "#9d174d", label: "Framboise" },
  { value: "#78716c", label: "Pierre" },
]

const sizes: Record<NonNullable<ColumnStyle["size"]>, string> = { sm: "text-xs", md: "text-sm", lg: "text-base", xl: "text-lg" }
const fonts: Record<NonNullable<ColumnStyle["font"]>, string> = { sans: "font-sans", serif: "font-serif", mono: "font-mono", display: "font-display" }
const cases: Record<NonNullable<ColumnStyle["letterCase"]>, string> = { upper: "uppercase", lower: "lowercase", title: "capitalize" }
const aligns: Record<NonNullable<ColumnStyle["align"]>, string> = { left: "text-left", center: "text-center", right: "text-right" }

/** Les classes et le style CSS d'un style imposé. */
export function columnStyleCss(style: ColumnStyle | undefined): { className: string; style: CSSProperties } {
  if (!style) return { className: "", style: {} }
  const classes = [
    style.bold ? "font-semibold" : "",
    style.italic ? "italic" : "",
    style.underline && style.strike ? "underline line-through" : style.underline ? "underline" : style.strike ? "line-through" : "",
    style.color === "muted" ? "text-muted-foreground" : "",
    style.size ? sizes[style.size] : "",
    style.font ? fonts[style.font] : "",
    style.letterCase ? cases[style.letterCase] : "",
    style.align ? aligns[style.align] : "",
  ].filter(Boolean)
  const css: CSSProperties = {}
  if (style.color && style.color !== "muted") css.color = style.color
  if (style.background) css.backgroundColor = style.background
  return { className: classes.join(" "), style: css }
}

/** Une couleur d'option (pastille) : un fond clair et un texte foncé de la même teinte. */
export function pillStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined
  if (color === "muted") return { backgroundColor: "color-mix(in srgb, var(--muted) 80%, transparent)", color: "var(--muted-foreground)", borderColor: "var(--border)" }
  return { backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }
}
