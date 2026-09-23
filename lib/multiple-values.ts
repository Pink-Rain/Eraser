/**
 * Titres, classes et peuples d'un personnage sont enregistrés comme une liste
 * (`["Chamane"]`) ou comme une liste avec la valeur active
 * (`{"values": […], "selected": "…"}`). Les anciennes fiches gardent un texte simple.
 */
export function displayedMultipleValue(value: string, mode: "selected" | "all" = "selected") {
  const raw = (value || "").trim()
  if (!raw) return ""
  try {
    const parsed = JSON.parse(raw) as unknown
    const strings = (items: unknown[]) => items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    if (Array.isArray(parsed)) return mode === "all" ? strings(parsed).join(" · ") : strings(parsed)[0] || ""
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { values?: unknown }).values)) {
      const entries = strings((parsed as { values: unknown[] }).values)
      const selected = (parsed as { selected?: unknown }).selected
      const active = typeof selected === "string" && selected.trim() ? selected.trim() : entries[0] || ""
      return mode === "all" ? (entries.length ? entries.join(" · ") : active) : active
    }
  } catch { /* ancienne valeur simple */ }
  return raw
}
