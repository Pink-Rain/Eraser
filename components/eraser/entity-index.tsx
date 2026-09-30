"use client"

import { useCallback, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { indexGridColumn, type AutoLink } from "@/components/eraser/index-cells"
import { ReadOnlyIndexEditorButton } from "@/components/eraser/index-editor"
import { entityEditorModel } from "@/lib/system-index-models"
import { OwnerSelector } from "@/components/eraser/owner-selector"
import { SheetGrid, type SheetGridColumn } from "@/components/eraser/sheet-grid"
import { TrashItemButton } from "@/components/eraser/trash-item-button"
import { Input } from "@/components/ui/input"
import type { AccountRecord } from "@/lib/auth-types"
import { foldName } from "@/lib/index-columns"

export type EntityIndexRow = {
  id: string
  name: string
  href: string
  color?: string
  ownerUid: string
  ownerName: string
  /** Adresse du propriétaire, montrée à l'administrateur. */
  ownerDetail: string
  /** Colonne propre à l'index (la classe et le rang d'un personnage). */
  detail?: string
  links: AutoLink[]
  /** Le compte peut mettre la ligne à la corbeille (administrateur ou propriétaire). */
  canTrash: boolean
}

/**
 * Index des campagnes et des personnages : le même moteur que les autres index, en
 * lecture seule. Le nom ouvre la page, les liens automatiques mènent aux personnages
 * d'une campagne (ou aux campagnes d'un personnage), l'administrateur réattribue.
 */
export function EntityIndex({ kind, rows, accounts, isAdmin, nameLabel, linksLabel, detailLabel, empty }: {
  kind: "campaign" | "character"
  rows: EntityIndexRow[]
  accounts: AccountRecord[]
  isAdmin: boolean
  nameLabel: string
  linksLabel: string
  detailLabel?: string
  empty: string
}) {
  const [query, setQuery] = useState("")
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const row = byId.get(rowKey)
    if (!row) return ""
    if (columnKey === "name") return row.name
    if (columnKey === "owner") return isAdmin && row.ownerDetail ? `${row.ownerName} · ${row.ownerDetail}` : row.ownerName
    if (columnKey === "links") return row.links.map((link) => link.label).join(", ")
    if (columnKey === "detail") return row.detail ?? ""
    if (columnKey === "id") return row.id
    return ""
  }, [byId, isAdmin])

  const columns = useMemo<SheetGridColumn[]>(() => {
    const context = {
      valueOf,
      commit: () => undefined,
      hrefOf: (rowKey: string) => byId.get(rowKey)?.href ?? "",
      colorOf: (rowKey: string) => byId.get(rowKey)?.color,
      autoLinks: (rowKey: string) => byId.get(rowKey)?.links ?? [],
    }
    return [
      indexGridColumn("name", nameLabel, { kind: "name-form", also: ["fixed"] }, 260, context),
      ...(detailLabel ? [indexGridColumn("detail", detailLabel, { kind: "fixed" }, 200, context)] : []),
      indexGridColumn("owner", "Propriétaire", { kind: "fixed", display: "muted" }, 260, context),
      ...(isAdmin ? [indexGridColumn("assign", "Attribuer à", { kind: "choice" }, 240, context, {
        sortable: false,
        control: (rowKey: string) => { const row = byId.get(rowKey); return row ? <OwnerSelector kind={kind} itemId={row.id} ownerUid={row.ownerUid} accounts={accounts} /> : null },
      })] : []),
      indexGridColumn("links", linksLabel, { kind: "auto-links" }, 320, context),
      indexGridColumn("id", "ID", { kind: "id", hidden: true }, 200, context),
      // Mise à la corbeille : rien n'est effacé, l'élément se restaure depuis Administration.
      { key: "trash", label: "Corbeille", width: 110, custom: true, sortable: false, typeLabel: "Action" },
    ]
  }, [accounts, byId, detailLabel, isAdmin, kind, linksLabel, nameLabel, valueOf])

  const shown = useMemo(() => {
    const folded = foldName(query)
    return rows
      .filter((row) => !folded || foldName(`${row.name} ${row.ownerName} ${row.links.map((link) => link.label).join(" ")}`).includes(folded))
      .map((row, index) => ({ key: row.id, rowNumber: index + 1 }))
  }, [query, rows])

  return <section className="mt-8 flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher…" className="pl-9" /></div>
      <div className="ml-auto"><ReadOnlyIndexEditorButton model={() => entityEditorModel(kind === "campaign" ? "campaigns" : "characters")} /></div>
    </div>
    <SheetGrid
      layoutKey={`eraser:${kind}-index:grid`}
      columns={columns}
      rows={shown}
      valueOf={valueOf}
      onCommit={() => undefined}
      readOnly
      renderCustomCell={(rowKey) => { const row = byId.get(rowKey); return row?.canTrash ? <span className="flex min-h-8 items-center justify-center"><TrashItemButton kind={kind} id={row.id} name={row.name} /></span> : null }}
      empty={rows.length ? "Aucune ligne ne correspond à la recherche." : empty}
    />
  </section>
}
