/**
 * Les presets d'onglets : la liste des colonnes d'un onglet (noms, types et réglages),
 * enregistrée sous un petit nom pour créer d'autres onglets pareils. Sans dépendance
 * serveur : l'éditeur, le serveur et les tests s'en servent.
 */
import { foldName, indexColumnKinds, isIdHeader, type IndexColumnSpec } from "@/lib/index-columns"

export type PresetColumn = { header: string; spec: IndexColumnSpec }

export type ColumnPreset = {
  id: string
  name: string
  description: string
  columns: PresetColumn[]
  updatedAt: string
}

/** Ce qu'un preset garde : ni le Nom ni l'ID (chaque onglet a déjà les siens), ni les colonnes système. */
export function presetColumnsOf(columns: PresetColumn[]): PresetColumn[] {
  const seen = new Set<string>()
  return columns.flatMap((column) => {
    const header = column.header.replace(/\s+/g, " ").trim()
    const key = foldName(header)
    if (!header || seen.has(key) || key === "nom" || isIdHeader(header)) return []
    if (!(column.spec.kind in indexColumnKinds) || ["id", "name", "name-form", "archived", "tab", "auto-links", "ranked-links"].includes(column.spec.kind)) return []
    seen.add(key)
    return [{ header: header.slice(0, 120), spec: column.spec }]
  }).slice(0, 80)
}

/** Les colonnes lues dans la feuille (JSON) ; une entrée abîmée est ignorée. */
export function parsePresetColumns(raw: string): PresetColumn[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return presetColumnsOf(parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return []
      const { header, spec } = entry as { header?: unknown; spec?: unknown }
      return typeof header === "string" && spec && typeof spec === "object" && typeof (spec as { kind?: unknown }).kind === "string" ? [{ header, spec: spec as IndexColumnSpec }] : []
    }))
  } catch {
    return []
  }
}
