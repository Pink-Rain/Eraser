"use client"

import { useCallback, useMemo } from "react"

import { indexGridColumn } from "@/components/eraser/index-cells"
import { SheetGrid, type SheetGridColumn } from "@/components/eraser/sheet-grid"
import type { JdrSheetDiagnostic } from "@/lib/google-sheets"

/** Le diagnostic des feuilles dans le tableau des index : trié, filtré, en lecture seule. */
export function SheetDiagnosticsGrid({ diagnostics }: { diagnostics: JdrSheetDiagnostic[] }) {
  const byKey = useMemo(() => new Map(diagnostics.map((item) => [item.key as string, item])), [diagnostics])
  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const item = byKey.get(rowKey)
    if (!item) return ""
    if (columnKey === "name") return item.name
    if (columnKey === "tab") return item.expectedTab
    if (columnKey === "rows") return item.rows === null ? "" : String(item.rows)
    if (columnKey === "state") return item.status === "ok" ? "OK" : item.detail
    if (columnKey === "tabs") return item.actualTabs.join(", ")
    return ""
  }, [byKey])
  const columns = useMemo<SheetGridColumn[]>(() => {
    const context = { valueOf, commit: () => undefined }
    return [
      {
        key: "name", label: "Feuille", width: 260, plain: true, typeLabel: "Nom", description: "Ouvre la feuille dans Google Sheets.",
        // Lien externe : il s'ouvre dans le navigateur, pas à la place d'Eraser.
        control: (rowKey: string) => { const item = byKey.get(rowKey); return item ? (item.webViewLink ? <a href={item.webViewLink} target="_blank" rel="noreferrer" className="flex min-h-8 items-center px-2 py-1.5 font-semibold hover:text-primary hover:underline">{item.name}</a> : <span className="flex min-h-8 items-center px-2 py-1.5 font-semibold">{item.name}</span>) : null },
      },
      indexGridColumn("tab", "Onglet attendu", { kind: "rich", style: { color: "muted" } }, 200, context),
      indexGridColumn("rows", "Lignes", { kind: "number" }, 110, context),
      {
        key: "state", label: "État", width: 360, plain: true, typeLabel: "État", description: "« OK », ou l’erreur brute de Google.",
        control: (rowKey: string) => { const item = byKey.get(rowKey); return item ? <span className={`block px-2 py-1.5 text-sm ${item.status === "ok" ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{item.status === "ok" ? "OK" : item.detail}</span> : null },
      },
      indexGridColumn("tabs", "Onglets présents", { kind: "rich", style: { color: "muted" } }, 280, context),
    ]
  }, [byKey, valueOf])
  const rows = useMemo(() => diagnostics.map((item, index) => ({ key: item.key as string, rowNumber: index + 1 })), [diagnostics])
  return <SheetGrid layoutKey="eraser:sheet-diagnostics:grid" columns={columns} rows={rows} valueOf={valueOf} onCommit={() => undefined} readOnly fit empty="Aucune feuille." />
}
