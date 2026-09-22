"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { ArrowDownAZ, ArrowUpAZ, Bold, Italic, Link2, Palette, RotateCcw, Underline } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  applyRichTextCommand,
  escapeRichText,
  rememberRichTextSelection,
  richTextColors,
  richTextPlainText,
  sanitizeRichText,
  type RichTextCommand,
} from "@/components/eraser/rich-text-inline-editor"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { clampTableColumnWidth, clampTableRowHeight } from "@/hooks/use-persistent-table-layout"

export type SheetGridColumn = {
  key: string
  label: string
  width: number
  minWidth?: number
  maxWidth?: number
  /** Cellule pilotée par un composant dédié (« Classes et rangs ») plutôt que par du texte. */
  custom?: boolean
  /** La valeur est enregistrée en texte brut : la mise en forme est retirée à l’enregistrement. */
  plain?: boolean
  /** Classes appliquées au contenu de la cellule (couleur, graisse…). */
  cellClassName?: string
  sortable?: boolean
}

export type SheetGridRow = { key: string; rowNumber: number }

export type SheetGridSort = { column: string; direction: "asc" | "desc" } | null

type SheetGridLayout = { columnWidths: Record<string, number>; rowHeights: Record<string, number> }

function isSheetGridLayout(value: unknown): value is SheetGridLayout {
  if (!value || typeof value !== "object") return false
  const candidate = value as { columnWidths?: unknown; rowHeights?: unknown }
  const numericRecord = (entry: unknown) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    && Object.entries(entry as Record<string, unknown>).every(([key, width]) => key.length > 0 && typeof width === "number" && Number.isFinite(width))
  return numericRecord(candidate.columnWidths) && numericRecord(candidate.rowHeights)
}

const emptyLayout: SheetGridLayout = { columnWidths: {}, rowHeights: {} }

type ActiveEditor = { node: HTMLElement; flush: () => void }

/**
 * Une cellule de tableau qui se comporte comme Google Sheets : toujours modifiable,
 * jamais remplacée par une zone de saisie au clic, et enregistrée toute seule peu après
 * la frappe. Le contenu est piloté par le DOM et non par React tant que la cellule a le
 * focus, sinon chaque caractère replacerait le curseur au début.
 */
const SheetCell = memo(function SheetCell({ html, plain, disabled, onCommit, onActivate, className }: {
  html: string
  plain: boolean
  disabled: boolean
  onCommit: (value: string) => void
  onActivate: (editor: ActiveEditor | null) => void
  className: string
}) {
  const editor = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  // Le premier rendu porte déjà le contenu : la cellule n'apparaît jamais vide.
  // Cette valeur ne change plus ensuite, React ne réécrit donc jamais la cellule
  // dans le dos de la personne qui y tape ; l'effet ci-dessous s'en charge.
  const [initialHtml] = useState(html)
  const applied = useRef(html)
  const commit = useRef(onCommit)
  // Le rappel est relu à chaque rendu sans être une dépendance : la cellule garde
  // son curseur même quand le parent se redessine.
  useEffect(() => { commit.current = onCommit })

  const flush = useCallback(() => {
    const node = editor.current
    if (!node) return
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null }
    const safe = sanitizeRichText(node.innerHTML)
    if (safe === applied.current) return
    applied.current = safe
    commit.current(plain ? richTextPlainText(safe) : safe)
  }, [plain])

  useEffect(() => {
    const node = editor.current
    if (!node) return
    // La valeur distante ne réécrit jamais une cellule en cours d’édition.
    if (document.activeElement === node) return
    if (applied.current === html) return
    applied.current = html
    node.innerHTML = html
  }, [html])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const remember = () => onActivate(editor.current ? { node: editor.current, flush } : null)

  return <div
    ref={editor}
    contentEditable={!disabled}
    suppressContentEditableWarning
    spellCheck
    role="textbox"
    aria-multiline="true"
    tabIndex={0}
    onInput={() => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600) }}
    onBlur={flush}
    onFocus={remember}
    onMouseUp={remember}
    onKeyUp={remember}
    className={`min-h-full w-full whitespace-pre-wrap break-words rounded-md px-2 py-1.5 outline-none focus:bg-background focus:ring-2 focus:ring-ring/45 [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc ${className}`}
    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
    dangerouslySetInnerHTML={{ __html: initialHtml }}
  />
})

function SheetGridToolbar({ active, leading, trailing, onReset }: { active: ActiveEditor | null; leading?: ReactNode; trailing?: ReactNode; onReset: () => void }) {
  const savedRange = useRef<Range | null>(null)
  useEffect(() => { if (active) rememberRichTextSelection(active.node, savedRange) }, [active])
  const keepSelection = (event: ReactMouseEvent) => { if (active) rememberRichTextSelection(active.node, savedRange); event.preventDefault() }
  function command(name: RichTextCommand, value?: string) {
    if (!active) return
    if (applyRichTextCommand(active.node, savedRange, name, value)) active.flush()
  }
  const disabled = !active
  return <div className="flex flex-wrap items-center gap-1 border-b bg-card/95 px-2 py-1.5 backdrop-blur">
    {leading}
    {leading && <span className="mx-1 h-5 w-px bg-border" />}
    <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} onMouseDown={keepSelection} onClick={() => command("bold")} title="Gras"><Bold /></Button>
    <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} onMouseDown={keepSelection} onClick={() => command("italic")} title="Italique"><Italic /></Button>
    <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} onMouseDown={keepSelection} onClick={() => command("underline")} title="Souligné"><Underline /></Button>
    <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} onMouseDown={keepSelection} onClick={() => { const href = window.prompt("Adresse du lien"); if (href) command("createLink", href) }} title="Lien"><Link2 /></Button>
    <span className="mx-1 h-5 w-px bg-border" />
    <span className="flex items-center gap-1" aria-label="Couleur du texte">
      <Palette className="mr-0.5 size-3.5 text-muted-foreground" />
      {richTextColors.map((color) => <button key={color} type="button" disabled={disabled} onMouseDown={keepSelection} onClick={() => command("foreColor", color)} className="size-5 rounded-full border border-black/15 shadow-sm disabled:opacity-40" style={{ backgroundColor: color }} aria-label={`Texte ${color}`} title={`Couleur ${color}`} />)}
      <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-muted-foreground/60" title="Choisir une autre couleur" onPointerDown={() => { if (active) rememberRichTextSelection(active.node, savedRange) }}>
        <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">+</span>
        <input type="color" disabled={disabled} className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => command("foreColor", event.target.value)} aria-label="Autre couleur du texte" />
      </label>
    </span>
    {!active && <span className="ml-1 text-[11px] text-muted-foreground">Clique dans une cellule pour mettre en forme.</span>}
    <span className="ml-auto flex items-center gap-1">
      {trailing}
      <Button type="button" size="sm" variant="ghost" onClick={onReset} title="Réinitialiser largeurs et hauteurs"><RotateCcw />Mise en page</Button>
    </span>
  </div>
}

export function SheetGrid({
  layoutKey, columns, rows, valueOf, onCommit, renderCustomCell, renderActions, actionsLabel = "Actions", actionsWidth = 150,
  sort, onSort, toolbarLeading, toolbarTrailing, empty, disabled = false,
}: {
  layoutKey: string
  columns: SheetGridColumn[]
  rows: SheetGridRow[]
  /** Valeur enregistrée d’une cellule : HTML pour une colonne enrichie, texte brut sinon. */
  valueOf: (rowKey: string, columnKey: string) => string
  onCommit: (rowKey: string, columnKey: string, value: string) => void
  renderCustomCell?: (rowKey: string, columnKey: string) => ReactNode
  renderActions?: (rowKey: string) => ReactNode
  actionsLabel?: string
  actionsWidth?: number
  sort?: SheetGridSort
  onSort?: (next: SheetGridSort) => void
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  empty: ReactNode
  disabled?: boolean
}) {
  const [layout, setLayout] = usePersistentState<SheetGridLayout>(layoutKey, emptyLayout, isSheetGridLayout)
  const [preview, setPreview] = useState<{ columns: Record<string, number>; rows: Record<string, number> }>({ columns: {}, rows: {} })
  const [active, setActive] = useState<ActiveEditor | null>(null)

  const defaultWidths = useMemo(() => Object.fromEntries([...columns.map((column) => [column.key, column.width] as const), ["line", 72], ["actions", actionsWidth]]), [actionsWidth, columns])
  const columnWidth = (key: string) => preview.columns[key] ?? layout.columnWidths[key] ?? defaultWidths[key] ?? 200
  const rowHeight = (key: string) => preview.rows[key] ?? layout.rowHeights[key]
  const totalWidth = ["line", ...columns.map((column) => column.key), ...(renderActions ? ["actions"] : [])].reduce((total, key) => total + columnWidth(key), 0)

  function startColumnResize(event: ReactPointerEvent<HTMLSpanElement>, key: string, minimum: number, maximum: number) {
    event.preventDefault(); event.stopPropagation()
    const startX = event.clientX
    const startWidth = columnWidth(key)
    let latest = startWidth
    const move = (pointerEvent: PointerEvent) => {
      latest = clampTableColumnWidth(startWidth + pointerEvent.clientX - startX, minimum, maximum)
      setPreview((current) => ({ ...current, columns: { ...current.columns, [key]: latest } }))
    }
    const finish = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish)
      setLayout({ ...layout, columnWidths: { ...layout.columnWidths, [key]: latest } })
      setPreview((current) => { const next = { ...current.columns }; delete next[key]; return { ...current, columns: next } })
    }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish)
  }

  function startRowResize(event: ReactPointerEvent<HTMLSpanElement>, key: string, element: HTMLElement | null) {
    event.preventDefault(); event.stopPropagation()
    const startY = event.clientY
    const startHeight = rowHeight(key) ?? element?.getBoundingClientRect().height ?? 48
    let latest = startHeight
    const move = (pointerEvent: PointerEvent) => {
      latest = clampTableRowHeight(startHeight + pointerEvent.clientY - startY)
      setPreview((current) => ({ ...current, rows: { ...current.rows, [key]: latest } }))
    }
    const finish = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish)
      setLayout({ ...layout, rowHeights: { ...layout.rowHeights, [key]: latest } })
      setPreview((current) => { const next = { ...current.rows }; delete next[key]; return { ...current, rows: next } })
    }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish)
  }

  function clearRowHeight(key: string) {
    const next = { ...layout.rowHeights }
    delete next[key]
    setLayout({ ...layout, rowHeights: next })
  }

  const headerCell = "sticky top-0 z-30 border-b border-r bg-muted px-2 py-2 text-left align-bottom font-semibold"
  const resizeHandle = "absolute inset-y-0 right-0 z-40 w-2 translate-x-1 cursor-col-resize touch-none"

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background/60">
    <SheetGridToolbar active={active} leading={toolbarLeading} trailing={toolbarTrailing} onReset={() => { setLayout(emptyLayout); setPreview({ columns: {}, rows: {} }) }} />
    {/* Un seul conteneur défile, dans les deux sens : les en-têtes restent collés en haut
        de l’écran et la barre horizontale reste collée en bas, comme dans Google Sheets. */}
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Changer de tableau remonte les cellules : aucune ne garde le contenu du précédent. */}
      <table key={layoutKey} className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}>
        <colgroup>
          <col style={{ width: columnWidth("line") }} />
          {columns.map((column) => <col key={column.key} style={{ width: columnWidth(column.key) }} />)}
          {renderActions && <col style={{ width: columnWidth("actions") }} />}
        </colgroup>
        <thead>
          <tr>
            <th className={`${headerCell} left-0 z-40 relative`}>Ligne<span role="separator" aria-label="Redimensionner la colonne Ligne" onPointerDown={(event) => startColumnResize(event, "line", 56, 160)} className={resizeHandle} /></th>
            {columns.map((column) => <th key={column.key} className={`${headerCell} relative`}>
              {column.sortable !== false && onSort
                ? <button type="button" onClick={() => onSort(sort?.column === column.key ? (sort.direction === "asc" ? { column: column.key, direction: "desc" } : null) : { column: column.key, direction: "asc" })} className="flex w-full items-center justify-between gap-1 whitespace-normal break-words text-left hover:text-primary" title="Trier sur cette colonne">
                    <span>{column.label}</span>
                    {sort?.column === column.key ? (sort.direction === "asc" ? <ArrowDownAZ className="size-3.5 shrink-0" /> : <ArrowUpAZ className="size-3.5 shrink-0" />) : null}
                  </button>
                : <span className="block whitespace-normal break-words">{column.label}</span>}
              <span role="separator" aria-label={`Redimensionner la colonne ${column.label}`} onPointerDown={(event) => startColumnResize(event, column.key, column.minWidth ?? 80, column.maxWidth ?? 900)} className={resizeHandle} />
            </th>)}
            {renderActions && <th className={`${headerCell} right-0 z-40 relative border-l`}>{actionsLabel}<span role="separator" aria-label={`Redimensionner la colonne ${actionsLabel}`} onPointerDown={(event) => startColumnResize(event, "actions", 110, 360)} className="absolute inset-y-0 left-0 z-40 w-2 -translate-x-1 cursor-col-resize touch-none" /></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const manualHeight = rowHeight(row.key)
            return <tr key={row.key} style={manualHeight ? { height: manualHeight } : undefined}>
              <td className="sticky left-0 z-20 relative border-b border-r bg-background px-2 py-1.5 align-top text-xs tabular-nums text-muted-foreground">
                {row.rowNumber}
                <span
                  role="separator"
                  aria-label={`Redimensionner la ligne ${row.rowNumber}`}
                  title="Glisser pour fixer la hauteur, double-cliquer pour revenir à l’ajustement automatique"
                  onPointerDown={(event) => startRowResize(event, row.key, event.currentTarget.parentElement)}
                  onDoubleClick={() => clearRowHeight(row.key)}
                  className="absolute inset-x-0 bottom-0 z-30 h-1.5 translate-y-0.5 cursor-row-resize touch-none"
                />
              </td>
              {columns.map((column) => <td key={column.key} className={`border-b border-r p-1 align-top ${manualHeight ? "overflow-hidden" : ""}`}>
                {column.custom
                  ? renderCustomCell?.(row.key, column.key)
                  : <SheetCell
                      html={column.plain ? escapeRichText(valueOf(row.key, column.key)) : sanitizeRichText(valueOf(row.key, column.key))}
                      plain={Boolean(column.plain)}
                      disabled={disabled}
                      onCommit={(value) => onCommit(row.key, column.key, value)}
                      onActivate={setActive}
                      className={column.cellClassName || ""}
                    />}
              </td>)}
              {renderActions && <td className="sticky right-0 z-20 border-b border-l bg-background px-2 py-1.5 align-top">{renderActions(row.key)}</td>}
            </tr>
          })}
        </tbody>
      </table>
      {!rows.length && <div className="px-5 py-12 text-center text-sm text-muted-foreground">{empty}</div>}
    </div>
  </div>
}
