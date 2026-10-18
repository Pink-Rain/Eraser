"use client"

import { useLayoutEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { Minus, Plus } from "lucide-react"

import { studioSectionGrid } from "@/components/eraser/custom-page-view"
import { cleanSectionWidths, defaultSectionWidths, MAX_SECTION_COLUMNS, MIN_COLUMN_WIDTH, type SectionLayout } from "@/lib/custom-pages"

const fmtWidth = (width: number) => `${Math.round(width)} %`

/**
 * La séparation après la colonne `index` amenée à `part` % du bord gauche (par pas de 5 %, ou de
 * 1 % avec `fine`) : seules ses deux voisines changent, chacune gardant `MIN_COLUMN_WIDTH`.
 */
export function moveBoundary(shown: number[], index: number, part: number, layout: SectionLayout, fine = false) {
  const before = shown.slice(0, index).reduce((sum, width) => sum + width, 0)
  const pair = shown[index] + shown[index + 1]
  const step = fine ? 1 : 5
  const left = Math.min(pair - MIN_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round((part - before) / step) * step))
  return cleanSectionWidths(shown.map((width, at) => at === index ? left : at === index + 1 ? pair - left : width), layout)
}

/** La colonne `index` mise à `value` % : sa voisine de droite (de gauche pour la dernière) prend ou rend la différence. */
export function setColumnWidth(shown: number[], index: number, value: number, layout: SectionLayout) {
  const other = index < shown.length - 1 ? index + 1 : index - 1
  if (other < 0 || !Number.isFinite(value)) return cleanSectionWidths(shown, layout)
  const pair = shown[index] + shown[other]
  const width = Math.min(pair - MIN_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(value)))
  return cleanSectionWidths(shown.map((item, at) => at === index ? width : at === other ? pair - width : item), layout)
}

/** La part d'une colonne, à taper (Entrée ou en quittant le champ) ou aux flèches (± 5 ; Alt : ± 1). */
function WidthInput({ value, column, onCommit }: { value: number; column: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const number = Number(draft.replace(",", ".").replace(/[^\d.]/g, ""))
    setDraft(null)
    if (draft.trim() && Number.isFinite(number)) onCommit(number)
  }
  return <label className="inline-flex items-baseline gap-0.5 rounded-md px-1 py-0.5 tabular-nums transition focus-within:bg-background focus-within:ring-2 focus-within:ring-[#3b5c8a]/30 hover:bg-background/70" title={`Largeur de la colonne ${column} (en % de la section)`}>
    <input value={draft ?? String(Math.round(value))} inputMode="numeric" aria-label={`Largeur de la colonne ${column}, en %`}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); commit() }
        else if (event.key === "Escape") setDraft(null)
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setDraft(null); onCommit(Math.round(value) + (event.key === "ArrowUp" ? 1 : -1) * (event.altKey ? 1 : 5)) }
      }}
      className="w-[2.6ch] min-w-0 bg-transparent text-right text-[12px] font-semibold outline-none" />
    <span className="text-[10.5px] text-muted-foreground">%</span>
  </label>
}

/**
 * La règle des largeurs d'une section, sous sa barre : une case par colonne, à sa largeur, avec sa
 * part en % à taper ; on glisse une séparation pour régler deux colonnes voisines. Toujours là,
 * même quand l'atelier est trop étroit pour mettre les colonnes côte à côte.
 */
export function WidthRuler({ layout, widths, onChange }: { layout: SectionLayout; widths?: number[]; onChange: (widths: number[] | undefined) => void }) {
  const shown = widths ?? defaultSectionWidths(layout)
  const [dragging, setDragging] = useState<number | null>(null)
  if (shown.length < 2) return null
  const start = (index: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const ruler = event.currentTarget.parentElement!.getBoundingClientRect()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(index)
    const onMove = (move: PointerEvent) => onChange(moveBoundary(shown, index, (move.clientX - ruler.left) / ruler.width * 100, layout, move.altKey))
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      setDragging(null)
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }
  // La place de chaque séparation : la somme des colonnes à sa gauche.
  const edges = shown.slice(0, -1).map((_, index) => shown.slice(0, index + 1).reduce((sum, width) => sum + width, 0))
  return <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
    <span className="shrink-0 text-[10.5px] font-semibold text-muted-foreground max-sm:hidden">Largeurs</span>
    <div role="group" aria-label="Largeur de chaque colonne" className="relative flex h-7 min-w-0 flex-1 rounded-lg border bg-card">
      {shown.map((width, index) => <div key={index} className={`flex min-w-0 items-center justify-center ${index ? "border-l border-dashed border-border" : ""}`} style={{ width: `${width}%` }}>
        <WidthInput value={width} column={index + 1} onCommit={(value) => onChange(setColumnWidth(shown, index, value, layout))} />
      </div>)}
      {edges.map((edge, index) => {
        return <span key={index} role="separator" aria-orientation="vertical" aria-label={`Séparation des colonnes ${index + 1} et ${index + 2}`} aria-valuenow={Math.round(edge)} title="Glisser pour régler ces deux colonnes (Alt : au pour cent près)"
          onPointerDown={start(index)} onDoubleClick={() => onChange(undefined)}
          className="group/handle absolute inset-y-[-3px] z-[1] flex w-3 -translate-x-1/2 cursor-col-resize touch-none justify-center" style={{ left: `${edge}%` }}>
          <span className={`w-1 rounded-full transition ${dragging === index ? "bg-[#3b5c8a]" : "bg-foreground/25 group-hover/handle:bg-[#3b5c8a]/80"}`} />
        </span>
      })}
    </div>
    {widths && <button type="button" onClick={() => onChange(undefined)} title="Rendre les largeurs de la disposition" className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">Égaliser</button>}
  </div>
}

/** Le nombre de colonnes d'une section : « − » retire la dernière (ses blocs rejoignent la précédente), « + » en ajoute une. */
export function ColumnCount({ count, onChange }: { count: number; onChange: (count: number) => void }) {
  const button = "grid size-6 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
  return <span role="group" aria-label="Nombre de colonnes" className="inline-flex items-center gap-0.5 rounded-[11px] border bg-card p-0.5">
    <button type="button" className={button} disabled={count <= 1} onClick={() => onChange(count - 1)} title="Retirer la dernière colonne (ses blocs passent dans la précédente)" aria-label="Retirer une colonne"><Minus className="size-3.5" /></button>
    <span className="min-w-[5.5rem] px-1 text-center text-[11.5px] font-semibold tabular-nums text-foreground/80">{count} colonne{count > 1 ? "s" : ""}</span>
    <button type="button" className={button} disabled={count >= MAX_SECTION_COLUMNS} onClick={() => onChange(count + 1)} title={count >= MAX_SECTION_COLUMNS ? `${MAX_SECTION_COLUMNS} colonnes au plus` : "Ajouter une colonne"} aria-label="Ajouter une colonne"><Plus className="size-3.5" /></button>
  </span>
}

/**
 * Les poignées entre les colonnes d'une section : on les glisse pour régler la part de chaque
 * colonne (par pas de 5 % ; Alt : au pour cent près), aux flèches du clavier aussi ; un
 * double-clic rend les largeurs de la disposition. Cachées tant que les colonnes s'empilent
 * (atelier trop étroit).
 */
function ColumnResizers({ grid, layout, widths, onChange }: { grid: HTMLDivElement; layout: SectionLayout; widths?: number[]; onChange: (widths: number[] | undefined) => void }) {
  const shown = widths ?? defaultSectionWidths(layout)
  const [places, setPlaces] = useState<number[] | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const count = shown.length
  useLayoutEffect(() => {
    const node = grid
    if (typeof ResizeObserver === "undefined") return
    const columns = () => [...node.querySelectorAll<HTMLElement>(":scope > [data-col]")]
    // Le premier rappel arrive dès l'observation : la place des poignées, puis à chaque changement de taille.
    const observer = new ResizeObserver(() => {
      const box = node.getBoundingClientRect()
      const rects = columns().map((column) => column.getBoundingClientRect())
      // Côte à côte seulement si toutes les colonnes sont sur une même ligne.
      const sideBySide = rects.length === count && rects.every((rect, index) => index === 0 || Math.abs(rect.top - rects[0].top) < 2 && rect.left > rects[index - 1].left)
      const next = sideBySide ? rects.slice(0, -1).map((rect, index) => Math.round((rect.right + rects[index + 1].left) / 2 - box.left)) : null
      setPlaces((current) => current && next && current.length === next.length && current.every((place, index) => place === next[index]) ? current : next)
    })
    observer.observe(node)
    for (const column of columns()) observer.observe(column)
    return () => observer.disconnect()
  }, [grid, count, widths])
  if (!places) return null

  const moveTo = (index: number, part: number, fine = false) => onChange(moveBoundary(shown, index, part, layout, fine))
  const start = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = grid
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const columns = [...node.querySelectorAll<HTMLElement>(":scope > [data-col]")].map((column) => column.getBoundingClientRect())
    const gap = columns.length > 1 ? columns[1].left - columns[0].right : 0
    const tracks = columns[columns.length - 1].right - columns[0].left - gap * (columns.length - 1)
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(index)
    const onMove = (move: PointerEvent) => moveTo(index, (move.clientX - columns[0].left - gap * index - gap / 2) / tracks * 100, move.altKey)
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      setDragging(null)
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }
  const keys = (index: number) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
    if (!delta) return
    event.preventDefault()
    const before = shown.slice(0, index + 1).reduce((sum, width) => sum + width, 0)
    moveTo(index, before + delta * (event.altKey ? 1 : 5), event.altKey)
  }

  return <>{places.map((left, index) => <div key={index} role="separator" aria-orientation="vertical" tabIndex={0}
    aria-label={`Largeur des colonnes ${index + 1} et ${index + 2}`} aria-valuemin={MIN_COLUMN_WIDTH} aria-valuemax={100 - MIN_COLUMN_WIDTH} aria-valuenow={Math.round(shown[index])}
    title="Glisser pour régler la largeur des colonnes (Alt : au pour cent près) · double-clic : largeurs de la disposition"
    onPointerDown={start(index)} onKeyDown={keys(index)} onDoubleClick={(event) => { event.stopPropagation(); onChange(undefined) }} onClick={(event) => event.stopPropagation()}
    className="group/resize absolute inset-y-1 z-[4] flex w-3 -translate-x-1/2 cursor-col-resize touch-none justify-center outline-none" style={{ left }}>
    <span className={`w-[3px] rounded-full transition ${dragging === index ? "bg-[#3b5c8a]" : "bg-transparent group-hover/section:bg-border group-hover/resize:bg-[#3b5c8a]/70 group-focus-visible/resize:bg-[#3b5c8a]"}`} />
    <span className={`pointer-events-none absolute top-1/2 inline-flex -translate-y-1/2 gap-1 whitespace-nowrap rounded-md border bg-card px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-foreground shadow-[0_4px_14px_rgb(67_50_31/0.14)] transition ${dragging === index ? "opacity-100" : "opacity-0 group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100"}`}>
      {fmtWidth(shown[index])}<span className="text-muted-foreground">|</span>{fmtWidth(shown[index + 1])}
    </span>
  </div>)}</>
}

/** La grille d'une section dans l'atelier : ses colonnes, aux largeurs de la page, et leurs poignées. */
export function SectionGrid({ layout, widths, framed, onWidths, children }: { layout: SectionLayout; widths?: number[]; framed: boolean; onWidths: (widths: number[] | undefined) => void; children: ReactNode }) {
  // L'élément lui-même (pas une ref) : les poignées le mesurent une fois la grille posée.
  const [grid, setGrid] = useState<HTMLDivElement | null>(null)
  const { className, style } = studioSectionGrid(widths ?? defaultSectionWidths(layout))
  return <div ref={setGrid} style={style} className={`relative grid items-start gap-3.5 ${className} ${framed ? "rounded-[18px] border bg-card/80 p-3" : ""}`}>
    {children}
    {grid && layout !== "1" && <ColumnResizers grid={grid} layout={layout} widths={widths} onChange={onWidths} />}
  </div>
}
