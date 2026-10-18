"use client"

import { useLayoutEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { sectionGrid } from "@/components/eraser/custom-page-view"
import { cleanSectionWidths, defaultSectionWidths, MIN_COLUMN_WIDTH, type SectionLayout } from "@/lib/custom-pages"

export const fmtWidth = (width: number) => `${Math.round(width)} %`

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

  const moveTo = (index: number, part: number, fine = false) => {
    const before = shown.slice(0, index).reduce((sum, width) => sum + width, 0)
    const pair = shown[index] + shown[index + 1]
    const step = fine ? 1 : 5
    const left = Math.min(pair - MIN_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round((part - before) / step) * step))
    const next = shown.map((width, at) => at === index ? left : at === index + 1 ? pair - left : width)
    onChange(cleanSectionWidths(next, layout))
  }
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
  const { className, style } = sectionGrid(layout, widths)
  return <div ref={setGrid} style={style} className={`relative grid items-start gap-3.5 ${className} ${framed ? "rounded-[18px] border bg-card/80 p-3" : ""}`}>
    {children}
    {grid && layout !== "1" && <ColumnResizers grid={grid} layout={layout} widths={widths} onChange={onWidths} />}
  </div>
}
