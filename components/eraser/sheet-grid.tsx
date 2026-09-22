"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { ArrowDownAZ, ArrowUpAZ, ClipboardPaste, Copy, CornerDownLeft, Eraser, Plus, RotateCcw, Scissors, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  escapeRichText,
  richTextPlainText,
  RichTextSurface,
  RichTextToolbar,
  sanitizeRichText,
  type RichTextTarget,
} from "@/components/eraser/rich-text"
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

/**
 * Les gestes qui touchent à la structure du tableau. Écrire dans une cellule passe
 * par `onCommit` : seules l'insertion, la copie de lignes entières et la suppression
 * ont besoin du gestionnaire.
 */
export type SheetGridRowCommands = {
  /** La ligne fantôme au bas du tableau. */
  append?: () => void
  /** Insertion en place. N'est proposée que si l'ordre affiché est celui de la feuille. */
  insertAfter?: (rowKey: string) => void
  insertBefore?: (rowKey: string) => void
  duplicate?: (rowKeys: string[]) => void
  remove?: (rowKeys: string[]) => void
}

type SheetGridLayout = { columnWidths: Record<string, number>; rowHeights: Record<string, number> }

/** Largeur de la poignée de ligne. Fixe : la colonne n'est pas redimensionnable. */
const HANDLE_WIDTH = 30

function isSheetGridLayout(value: unknown): value is SheetGridLayout {
  if (!value || typeof value !== "object") return false
  const candidate = value as { columnWidths?: unknown; rowHeights?: unknown }
  const numericRecord = (entry: unknown) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    && Object.entries(entry as Record<string, unknown>).every(([key, width]) => key.length > 0 && typeof width === "number" && Number.isFinite(width))
  return numericRecord(candidate.columnWidths) && numericRecord(candidate.rowHeights)
}

const emptyLayout: SheetGridLayout = { columnWidths: {}, rowHeights: {} }

/**
 * Le presse-papiers interne. Le système ne reçoit que du texte séparé par des
 * tabulations — c'est ce que Google Sheets comprend — mais la version mise en forme
 * est gardée ici. Au collage, si le texte du système est exactement celui qu'on a
 * copié, c'est la version mise en forme qui est écrite ; sinon on colle ce qui vient
 * d'ailleurs. Copier depuis Sheets et coller ici fonctionne donc aussi.
 */
let clipboard: { signature: string; rows: string[][] } | null = null

function tsvOf(rows: string[][]) {
  return rows.map((row) => row.map((value) => richTextPlainText(value).replace(/[\t\n\r]+/g, " ").trim()).join("\t")).join("\n")
}

function parseTsv(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"))
}

/** Habillage de la barre d'outils commune : mêmes boutons partout, plus la mise en page du tableau. */
function SheetGridToolbar({ targetRef, ready, leading, trailing, onReset }: { targetRef: MutableRefObject<RichTextTarget | null>; ready: boolean; leading?: ReactNode; trailing?: ReactNode; onReset: () => void }) {
  return <div className="flex flex-wrap items-center gap-1 border-b bg-card/95 px-2 py-1.5 backdrop-blur">
    <RichTextToolbar targetRef={targetRef} ready={ready} leading={leading} />
    {!ready && <span className="ml-1 text-[11px] text-muted-foreground">Clique dans une cellule pour mettre en forme.</span>}
    <span className="ml-auto flex items-center gap-1">
      {trailing}
      <Button type="button" size="sm" variant="ghost" onClick={onReset} title="Réinitialiser largeurs et hauteurs"><RotateCcw />Mise en page</Button>
    </span>
  </div>
}

export function SheetGrid({
  layoutKey, columns, rows, valueOf, onCommit, renderCustomCell, rowCommands, rowMenuExtras, addRowLabel = "Ajouter une ligne",
  sort, onSort, toolbarLeading, toolbarTrailing, empty, disabled = false, version = 0,
}: {
  layoutKey: string
  columns: SheetGridColumn[]
  rows: SheetGridRow[]
  /** Valeur enregistrée d’une cellule : HTML pour une colonne enrichie, texte brut sinon. */
  valueOf: (rowKey: string, columnKey: string) => string
  onCommit: (rowKey: string, columnKey: string, value: string) => void
  renderCustomCell?: (rowKey: string, columnKey: string) => ReactNode
  rowCommands?: SheetGridRowCommands
  /** Entrées propres à la page, ajoutées au bas du menu contextuel d'une ligne. */
  rowMenuExtras?: (rowKey: string) => ReactNode
  addRowLabel?: string
  sort?: SheetGridSort
  onSort?: (next: SheetGridSort) => void
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  empty: ReactNode
  disabled?: boolean
  /** À incrémenter quand les valeurs viennent réellement du serveur : les cellules
   *  sont alors remontées avec le nouveau contenu. Une frappe ne doit jamais le changer. */
  version?: number
}) {
  const [layout, setLayout] = usePersistentState<SheetGridLayout>(layoutKey, emptyLayout, isSheetGridLayout)
  const [preview, setPreview] = useState<{ columns: Record<string, number>; rows: Record<string, number> }>({ columns: {}, rows: {} })
  // La cellule active vit dans une référence : la sélectionner ne redessine rien.
  // Seul le passage « aucune cellule » → « une cellule » réveille la barre d'outils.
  const activeRef = useRef<RichTextTarget | null>(null)
  const [toolbarReady, setToolbarReady] = useState(false)
  // Cellule qui porte la poignée de recopie, et lignes sélectionnées par leur poignée.
  const [activeCell, setActiveCell] = useState<{ row: string; column: string } | null>(null)
  const [rawSelection, setSelection] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  const [fill, setFill] = useState<{ column: string; from: number; to: number } | null>(null)
  // Une écriture en bloc (collage, recopie, vidage) remonte les cellules pour qu'elles
  // affichent la nouvelle valeur. La frappe, elle, ne le fait jamais.
  const [writeTick, setWriteTick] = useState(0)
  const [notice, setNotice] = useState("")
  // Google Sheets a son historique, pas nous : une suppression se confirme.
  const [pendingRemoval, setPendingRemoval] = useState<string[] | null>(null)

  const activate = useCallback((editor: RichTextTarget) => {
    activeRef.current = editor
    setToolbarReady((current) => current || true)
  }, [])

  const textColumns = useMemo(() => columns.filter((column) => !column.custom), [columns])
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows])
  // Une ligne disparue (suppression, filtre, tri) sort de la sélection d'elle-même :
  // elle est recalculée à l'affichage plutôt que corrigée après coup.
  const selection = useMemo(() => rawSelection.filter((key) => rowKeys.includes(key)), [rawSelection, rowKeys])
  const indexOfRow = useCallback((key: string) => rowKeys.indexOf(key), [rowKeys])

  const defaultWidths = useMemo(() => Object.fromEntries(columns.map((column) => [column.key, column.width] as const)), [columns])
  const columnWidth = (key: string) => preview.columns[key] ?? layout.columnWidths[key] ?? defaultWidths[key] ?? 200
  const rowHeight = (key: string) => preview.rows[key] ?? layout.rowHeights[key]
  const totalWidth = columns.reduce((total, column) => total + columnWidth(column.key), HANDLE_WIDTH)

  /** Valeurs mises en forme d'un bloc de lignes, colonnes de texte uniquement. */
  const blockOf = useCallback((keys: string[]) => keys.map((key) => textColumns.map((column) => valueOf(key, column.key))), [textColumns, valueOf])

  const writeBlock = useCallback((startKey: string, block: string[][]) => {
    const start = indexOfRow(startKey)
    if (start < 0) return 0
    let written = 0
    block.forEach((values, offset) => {
      const target = rowKeys[start + offset]
      if (!target) return
      textColumns.forEach((column, index) => {
        if (index >= values.length) return
        onCommit(target, column.key, column.plain ? richTextPlainText(values[index]) : sanitizeRichText(values[index]))
      })
      written += 1
    })
    setWriteTick((current) => current + 1)
    return written
  }, [indexOfRow, onCommit, rowKeys, textColumns])

  const copyRows = useCallback(async (keys: string[], cut = false) => {
    const block = blockOf(keys)
    const signature = tsvOf(block)
    clipboard = { signature, rows: block }
    try { await navigator.clipboard.writeText(signature) } catch { /* le presse-papiers interne suffit */ }
    if (cut) { keys.forEach((key) => textColumns.forEach((column) => onCommit(key, column.key, ""))); setWriteTick((current) => current + 1) }
    setNotice(`${keys.length} ligne${keys.length > 1 ? "s" : ""} ${cut ? "coupée" : "copiée"}${keys.length > 1 ? "s" : ""}.`)
  }, [blockOf, onCommit, textColumns])

  const pasteRows = useCallback(async (startKey: string) => {
    let text = ""
    try { text = await navigator.clipboard.readText() } catch { text = "" }
    const block = clipboard && (!text || text === clipboard.signature) ? clipboard.rows : parseTsv(text)
    if (!block.length || (block.length === 1 && !block[0].some(Boolean))) return setNotice("Le presse-papiers est vide.")
    const written = writeBlock(startKey, block)
    setNotice(`${written} ligne${written > 1 ? "s" : ""} collée${written > 1 ? "s" : ""}.`)
  }, [writeBlock])

  const clearRows = useCallback((keys: string[]) => {
    keys.forEach((key) => textColumns.forEach((column) => onCommit(key, column.key, "")))
    setWriteTick((current) => current + 1)
    setNotice(`${keys.length} ligne${keys.length > 1 ? "s" : ""} vidée${keys.length > 1 ? "s" : ""}.`)
  }, [onCommit, textColumns])

  function selectRow(key: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    const index = indexOfRow(key)
    if (event.shiftKey && anchor.current) {
      const start = indexOfRow(anchor.current)
      if (start >= 0 && index >= 0) {
        const [low, high] = start < index ? [start, index] : [index, start]
        return setSelection(rowKeys.slice(low, high + 1))
      }
    }
    if (event.ctrlKey || event.metaKey) {
      anchor.current = key
      return setSelection((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
    }
    anchor.current = key
    setSelection([key])
  }

  /** Le menu contextuel agit sur la sélection si la ligne visée en fait partie. */
  const targetRows = useCallback((key: string) => selection.includes(key) ? selection : [key], [selection])
  /** Un Ctrl+clic sélectionne dans le désordre : copier et coller partent du haut. */
  const ordered = useMemo(() => [...selection].sort((left, right) => indexOfRow(left) - indexOfRow(right)), [indexOfRow, selection])
  const orderedTargets = useCallback((key: string) => selection.includes(key) ? ordered : [key], [ordered, selection])

  // Les raccourcis ne s'appliquent qu'à une sélection de lignes, jamais pendant la
  // frappe : dans une cellule, le navigateur garde son copier-coller de texte.
  useEffect(() => {
    if (!selection.length) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('[contenteditable="true"], input, textarea, select')) return
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === "c") { event.preventDefault(); void copyRows(ordered) }
      else if (modifier && key === "x") { event.preventDefault(); void copyRows(ordered, true) }
      else if (modifier && key === "v") { event.preventDefault(); void pasteRows(ordered[0]) }
      else if (modifier && key === "d") { event.preventDefault(); rowCommands?.duplicate?.(ordered) }
      else if (key === "delete" || key === "backspace") {
        event.preventDefault()
        if (modifier) { if (rowCommands?.remove) setPendingRemoval(ordered) } else clearRows(ordered)
      } else if (key === "escape") setSelection([])
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [clearRows, copyRows, ordered, pasteRows, rowCommands, selection])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 2500)
    return () => window.clearTimeout(timer)
  }, [notice])

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

  /**
   * La poignée de recopie : on la tire vers le haut ou vers le bas et le contenu de la
   * cellule est écrit dans toutes celles qu'elle survole, comme dans Google Sheets.
   */
  function startFill(event: ReactPointerEvent<HTMLSpanElement>, rowKey: string, columnKey: string) {
    event.preventDefault(); event.stopPropagation()
    const origin = indexOfRow(rowKey)
    if (origin < 0) return
    const value = valueOf(rowKey, columnKey)
    let last = origin
    const move = (pointerEvent: PointerEvent) => {
      const element = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
      const row = element?.closest<HTMLElement>("tr[data-row-key]")
      const index = row?.dataset.rowKey ? indexOfRow(row.dataset.rowKey) : -1
      if (index >= 0) { last = index; setFill({ column: columnKey, from: Math.min(origin, index), to: Math.max(origin, index) }) }
    }
    const finish = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish)
      setFill(null)
      const [low, high] = origin < last ? [origin, last] : [last, origin]
      if (high === low) return
      const column = columns.find((candidate) => candidate.key === columnKey)
      for (let index = low; index <= high; index += 1) {
        if (index === origin) continue
        onCommit(rowKeys[index], columnKey, column?.plain ? richTextPlainText(value) : value)
      }
      setWriteTick((current) => current + 1)
      setNotice(`Contenu recopié sur ${high - low} cellule${high - low > 1 ? "s" : ""}.`)
    }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish)
  }

  function clearRowHeight(key: string) {
    const next = { ...layout.rowHeights }
    delete next[key]
    setLayout({ ...layout, rowHeights: next })
  }

  const headerCell = "sticky top-0 border-b border-r bg-muted px-2 py-2 text-left align-bottom font-semibold"
  const resizeHandle = "absolute inset-y-0 right-0 z-40 w-2 translate-x-1 cursor-col-resize touch-none"
  const firstKey = columns[0]?.key

  // La grille défile avec la page puis se fige sous l'en-tête de l'application : le
  // titre, la recherche et les onglets s'effacent vers le haut, la barre d'outils et
  // les noms de colonnes restent. La hauteur retire l'en-tête (3.5rem) et, sur
  // l'application Windows, la barre de titre.
  return <div className="sticky top-0 z-20 flex h-[calc(100svh-3.5rem-var(--eraser-titlebar,0px))] flex-col overflow-hidden rounded-xl border bg-background/60">
    <SheetGridToolbar
      targetRef={activeRef}
      ready={toolbarReady}
      leading={toolbarLeading}
      trailing={<>{notice && <span className="text-[11px] text-muted-foreground">{notice}</span>}{toolbarTrailing}</>}
      onReset={() => { setLayout(emptyLayout); setPreview({ columns: {}, rows: {} }) }}
    />
    {/* Un seul conteneur défile, dans les deux sens : les en-têtes restent collés en haut
        de l’écran et la barre horizontale reste collée en bas, comme dans Google Sheets. */}
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Changer de tableau remonte les cellules : aucune ne garde le contenu du précédent. */}
      <table key={layoutKey} className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}>
        <colgroup>
          <col style={{ width: HANDLE_WIDTH }} />
          {columns.map((column) => <col key={column.key} style={{ width: columnWidth(column.key) }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className={`${headerCell} left-0 z-50 p-0`}><span className="sr-only">Poignée de ligne</span></th>
            {columns.map((column) => <th
              key={column.key}
              className={`${headerCell} relative ${column.key === firstKey ? "z-40" : "z-30"}`}
              style={column.key === firstKey ? { position: "sticky", left: HANDLE_WIDTH } : undefined}
            >
              {column.sortable !== false && onSort
                ? <button type="button" onClick={() => onSort(sort?.column === column.key ? (sort.direction === "asc" ? { column: column.key, direction: "desc" } : null) : { column: column.key, direction: "asc" })} className="flex w-full items-center justify-between gap-1 whitespace-normal break-words text-left hover:text-primary" title="Trier sur cette colonne">
                    <span>{column.label}</span>
                    {sort?.column === column.key ? (sort.direction === "asc" ? <ArrowDownAZ className="size-3.5 shrink-0" /> : <ArrowUpAZ className="size-3.5 shrink-0" />) : null}
                  </button>
                : <span className="block whitespace-normal break-words">{column.label}</span>}
              <span role="separator" aria-label={`Redimensionner la colonne ${column.label}`} onPointerDown={(event) => startColumnResize(event, column.key, column.minWidth ?? 80, column.maxWidth ?? 900)} className={resizeHandle} />
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const manualHeight = rowHeight(row.key)
            const selected = selection.includes(row.key)
            // Le fond reste opaque : une cellule figée laisserait sinon voir la colonne
            // qui défile derrière elle. La teinte de sélection est posée par-dessus.
            const cellBase = `relative border-b border-r bg-background p-1 align-top ${manualHeight ? "overflow-hidden" : ""}`
            return <tr key={row.key} data-row-key={row.key} style={manualHeight ? { height: manualHeight } : undefined}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <td
                    className={`sticky left-0 z-20 cursor-pointer border-b border-r bg-muted p-0 align-top ${selected ? "" : "hover:bg-accent"}`}
                    onPointerDown={(event) => { if (event.button === 0) selectRow(row.key, event) }}
                    onContextMenu={() => { if (!selection.includes(row.key)) { anchor.current = row.key; setSelection([row.key]) } }}
                    aria-label={`Ligne ${row.rowNumber}`}
                    title="Cliquer pour sélectionner la ligne, clic droit pour le menu"
                  >
                    {selected && <span className="pointer-events-none absolute inset-0 bg-primary/40" />}
                    <span className="pointer-events-none relative flex h-full min-h-8 items-start justify-center pt-2 text-[10px] leading-none text-muted-foreground/70">⠿</span>
                    <span
                      role="separator"
                      aria-label={`Redimensionner la ligne ${row.rowNumber}`}
                      title="Glisser pour fixer la hauteur, double-cliquer pour revenir à l’ajustement automatique"
                      onPointerDown={(event) => startRowResize(event, row.key, event.currentTarget.parentElement)}
                      onDoubleClick={() => clearRowHeight(row.key)}
                      className="absolute inset-x-0 bottom-0 z-30 h-1.5 translate-y-0.5 cursor-row-resize touch-none"
                    />
                  </td>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel>{targetRows(row.key).length > 1 ? `${targetRows(row.key).length} lignes sélectionnées` : `Ligne ${row.rowNumber}`}</ContextMenuLabel>
                  <ContextMenuItem onSelect={() => void copyRows(orderedTargets(row.key))}><Copy />Copier<ContextMenuShortcut>Ctrl+C</ContextMenuShortcut></ContextMenuItem>
                  <ContextMenuItem onSelect={() => void copyRows(orderedTargets(row.key), true)}><Scissors />Couper<ContextMenuShortcut>Ctrl+X</ContextMenuShortcut></ContextMenuItem>
                  <ContextMenuItem onSelect={() => void pasteRows(row.key)}><ClipboardPaste />Coller ici<ContextMenuShortcut>Ctrl+V</ContextMenuShortcut></ContextMenuItem>
                  <ContextMenuItem onSelect={() => clearRows(orderedTargets(row.key))}><Eraser />Vider le contenu<ContextMenuShortcut>Suppr</ContextMenuShortcut></ContextMenuItem>
                  {(rowCommands?.insertBefore || rowCommands?.insertAfter) && <>
                    <ContextMenuSeparator />
                    {rowCommands.insertBefore && <ContextMenuItem onSelect={() => rowCommands.insertBefore?.(row.key)}><CornerDownLeft className="rotate-180" />Insérer une ligne au-dessus</ContextMenuItem>}
                    {rowCommands.insertAfter && <ContextMenuItem onSelect={() => rowCommands.insertAfter?.(row.key)}><CornerDownLeft />Insérer une ligne en dessous</ContextMenuItem>}
                  </>}
                  {rowCommands?.duplicate && <ContextMenuItem onSelect={() => rowCommands.duplicate?.(orderedTargets(row.key))}><Copy />Dupliquer<ContextMenuShortcut>Ctrl+D</ContextMenuShortcut></ContextMenuItem>}
                  {rowCommands?.remove && <>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => setPendingRemoval(orderedTargets(row.key))}><Trash2 />Supprimer<ContextMenuShortcut>Ctrl+Suppr</ContextMenuShortcut></ContextMenuItem>
                  </>}
                  {rowMenuExtras?.(row.key)}
                </ContextMenuContent>
              </ContextMenu>
              {columns.map((column) => {
                const inFill = fill?.column === column.key && rowIndex >= fill.from && rowIndex <= fill.to
                const isActive = activeCell?.row === row.key && activeCell.column === column.key
                return <td
                  key={column.key}
                  className={`${cellBase} ${inFill ? "ring-2 ring-inset ring-primary/60" : ""} ${column.key === firstKey ? "z-10" : ""}`}
                  style={column.key === firstKey ? { position: "sticky", left: HANDLE_WIDTH } : undefined}
                >
                  {selected && <span className="pointer-events-none absolute inset-0 z-10 bg-primary/10" />}
                  {column.custom
                    ? renderCustomCell?.(row.key, column.key)
                    : <RichTextSurface
                        key={`${version}:${writeTick}:${column.key}`}
                        initialHtml={column.plain ? escapeRichText(valueOf(row.key, column.key)) : sanitizeRichText(valueOf(row.key, column.key))}
                        plain={Boolean(column.plain)}
                        disabled={disabled}
                        placeholder=""
                        onCommit={(value) => onCommit(row.key, column.key, value)}
                        onActivate={(editor) => { activate(editor); setActiveCell({ row: row.key, column: column.key }); setSelection((current) => current.length ? [] : current) }}
                        className={`min-h-full w-full rounded-md px-2 py-1.5 focus:bg-background focus:ring-2 focus:ring-ring/45 ${column.cellClassName || ""}`}
                      />}
                  {isActive && !column.custom && <span
                    role="separator"
                    aria-label="Recopier le contenu vers les lignes suivantes"
                    title="Tirer pour recopier le contenu"
                    onPointerDown={(event) => startFill(event, row.key, column.key)}
                    className="absolute -bottom-1 -right-1 z-30 size-2.5 cursor-crosshair rounded-[2px] border border-background bg-primary touch-none"
                  />}
                </td>
              })}
            </tr>
          })}
          {rowCommands?.append && Boolean(rows.length) && <tr>
            <td className="sticky left-0 z-20 border-b border-r bg-muted/40 p-0" />
            <td colSpan={columns.length} className="border-b p-0">
              <button type="button" onClick={() => rowCommands.append?.()} disabled={disabled} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50">
                <Plus className="size-3.5" />{addRowLabel}
              </button>
            </td>
          </tr>}
        </tbody>
      </table>
      {!rows.length && <div className="px-5 py-12 text-center text-sm text-muted-foreground">{empty}</div>}
    </div>
    <AlertDialog open={Boolean(pendingRemoval)} onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingRemoval && pendingRemoval.length > 1 ? `Supprimer ces ${pendingRemoval.length} lignes ?` : "Supprimer cette ligne ?"}</AlertDialogTitle>
          <AlertDialogDescription>La suppression est définitive dans Google Sheets. Pour effacer le contenu en gardant la ligne, choisis plutôt « Vider le contenu ».</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { if (pendingRemoval) rowCommands?.remove?.(pendingRemoval); setPendingRemoval(null); setSelection([]) }}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
