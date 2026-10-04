/**
 * Les cases à plusieurs valeurs d'un personnage : peuples, classes, langues, religions,
 * titres honorifiques. Elles s'écrivent en texte lisible dans Google Sheets :
 *
 *   « Orc des Terres Libres »
 *   « Humaine de Valhelm · Elfe »          (plusieurs valeurs, séparées par « · »)
 *   « L'ivrogne du coin · Le barbu »       (un titre : le titre choisi vient en premier)
 *
 * Les anciennes fiches gardent du JSON (`["Chamane"]`, `{"values": […], "selected": "…"}`)
 * jusqu'à leur prochaine modification : il reste lu partout, jamais affiché tel quel.
 */
export const LIST_SEPARATOR = " · "

export type ListCell = { entries: string[]; selected: string }

function strings(items: unknown[]) {
  return items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
}

/** Les valeurs d'une case (texte lisible ou ancien JSON) et la valeur choisie (la première, faute de choix). */
export function parseListCell(value: string | null | undefined): ListCell {
  const raw = (value || "").trim()
  if (!raw) return { entries: [], selected: "" }
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) { const entries = strings(parsed); return { entries, selected: entries[0] || "" } }
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { values?: unknown }).values)) {
        const entries = strings((parsed as { values: unknown[] }).values)
        const chosen = (parsed as { selected?: unknown }).selected
        const selected = typeof chosen === "string" && chosen.trim() ? chosen.trim() : entries[0] || ""
        return { entries: entries.length ? entries : selected ? [selected] : [], selected }
      }
    } catch { /* un texte qui commence par un crochet : une valeur comme une autre */ }
  }
  const entries = [...new Set(raw.split(/\s*(?:·|\n)\s*/).map((item) => item.trim()).filter(Boolean))]
  return { entries, selected: entries[0] || "" }
}

/** Le texte écrit dans la case : les valeurs séparées par « · », la valeur choisie en premier. */
export function serializeListCell(entries: string[], selected?: string) {
  const clean = [...new Set(entries.map((entry) => entry.replace(/\s+/g, " ").trim()).filter(Boolean))]
  const first = selected?.trim()
  const ordered = first && clean.includes(first) ? [first, ...clean.filter((entry) => entry !== first)] : clean
  return ordered.join(LIST_SEPARATOR)
}

/** Une case écrite en ancien JSON, à montrer (et réécrire) en texte lisible. */
export function isLegacyListCell(value: string | null | undefined) {
  const raw = (value || "").trim()
  if (!raw.startsWith("[") && !raw.startsWith("{")) return false
  try {
    const parsed = JSON.parse(raw) as unknown
    const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? (parsed as { values?: unknown }).values : null
    return Array.isArray(list) && parseListCell(raw).entries.length > 0
  } catch { return false }
}

/** Ce qu'on affiche : la valeur choisie (« selected ») ou toutes les valeurs (« all »). */
export function displayedMultipleValue(value: string, mode: "selected" | "all" = "selected") {
  const { entries, selected } = parseListCell(value)
  return mode === "all" ? entries.join(LIST_SEPARATOR) : selected
}
