"use client"

import { useMemo, useState, type DragEvent, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Heading, LayoutTemplate, Plus, RotateCcw, Tag, Trash2, Wand2, X } from "lucide-react"

import { IndexLayoutView } from "@/components/eraser/index-layout-view"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { foldName, indexColumnKinds, isNameColumnSpec, normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import {
  arrangeLayout,
  layoutId,
  layoutSpans,
  startingLayout,
  type IndexLayout,
  type LayoutField,
  type LayoutKind,
  type LayoutSection,
  type LayoutSpan,
} from "@/lib/index-layouts"

/** Où se trouve un champ : la colonne latérale, ou une ligne d'une section. */
type Place = { area: "aside" } | { area: "row"; section: number; row: number }

export type LayoutColumn = { header: string; spec: IndexColumnSpec }

const sameColumn = (left: string, right: string) => foldName(left) === foldName(right)

function fieldsAt(layout: IndexLayout, place: Place) {
  return place.area === "aside" ? layout.aside : layout.sections[place.section]?.rows[place.row]?.fields ?? []
}

function placeOf(layout: IndexLayout, column: string): { place: Place; index: number } | null {
  const aside = layout.aside.findIndex((field) => sameColumn(field.column, column))
  if (aside >= 0) return { place: { area: "aside" }, index: aside }
  for (const [section, entry] of layout.sections.entries()) {
    for (const [row, line] of entry.rows.entries()) {
      const index = line.fields.findIndex((field) => sameColumn(field.column, column))
      if (index >= 0) return { place: { area: "row", section, row }, index }
    }
  }
  return null
}

function withFields(layout: IndexLayout, place: Place, fields: LayoutField[]): IndexLayout {
  if (place.area === "aside") return { ...layout, aside: fields }
  return {
    ...layout,
    sections: layout.sections.map((section, sectionIndex) => sectionIndex !== place.section ? section : {
      ...section,
      rows: section.rows.map((row, rowIndex) => rowIndex !== place.row ? row : { ...row, fields }),
    }),
  }
}

function withoutColumn(layout: IndexLayout, column: string): { layout: IndexLayout; field: LayoutField | null } {
  const found = placeOf(layout, column)
  if (!found) return { layout, field: null }
  const fields = fieldsAt(layout, found.place)
  return { layout: withFields(layout, found.place, fields.filter((_, index) => index !== found.index)), field: fields[found.index] }
}

function samePlace(left: Place, right: Place) {
  return left.area === right.area && (left.area === "aside" || (right.area === "row" && left.section === right.section && left.row === right.row))
}

/**
 * Pose un champ à une place : à la fin, ou avant le champ qui y est n-ième (compté avant
 * de l'ôter d'où il était, s'il vient de la même ligne).
 */
function placeField(layout: IndexLayout, column: string, place: Place, position?: number, base?: LayoutField): IndexLayout {
  const found = placeOf(layout, column)
  const removed = withoutColumn(layout, column)
  const field: LayoutField = removed.field ?? base ?? { column }
  const fields = [...fieldsAt(removed.layout, place)]
  const shifted = position !== undefined && found && samePlace(found.place, place) && found.index < position ? position - 1 : position
  const at = shifted === undefined ? fields.length : Math.max(0, Math.min(fields.length, shifted))
  fields.splice(at, 0, place.area === "aside" ? { ...field, span: undefined } : field)
  return withFields(removed.layout, place, fields)
}

const smallLabel = "grid gap-1 text-[11px] font-semibold text-muted-foreground"

/**
 * Le constructeur de mise en page d'un onglet : la fiche (et le formulaire d'ajout), ou le
 * survol d'une ligne citée. On range les colonnes dans une colonne latérale et dans des
 * sections faites de lignes ; chaque champ a sa largeur. Glisser un champ le déplace ; les
 * flèches font de même au clavier. L'aperçu, à droite, montre les premières lignes de
 * l'onglet. Sans mise en page, l'affichage reste automatique.
 */
export function IndexLayoutEditor({ kind, columns, value, onChange, sample = {}, disabled = false }: {
  kind: LayoutKind
  /** Les colonnes que la mise en page peut placer. */
  columns: LayoutColumn[]
  value: IndexLayout | null
  onChange: (layout: IndexLayout | null) => void
  /** Une ligne de l'onglet (en-tête → texte), pour l'aperçu. */
  sample?: Record<string, string>
  disabled?: boolean
}) {
  // La colonne qu'on glisse (le texte du glisser la porte aussi, pour un dépôt d'ailleurs).
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const hover = kind === "hover"
  const layout = value
  const placed = useMemo(() => new Set(layout ? [...layout.aside, ...layout.sections.flatMap((section) => section.rows.flatMap((row) => row.fields))].map((field) => foldName(field.column)) : []), [layout])
  const unplaced = columns.filter((column) => !placed.has(foldName(column.header)))
  const specOf = (header: string) => columns.find((column) => sameColumn(column.header, header))?.spec
  const known = (header: string) => columns.some((column) => sameColumn(column.header, header))
  const set = (next: IndexLayout) => onChange(next)

  function start() {
    const pictures = columns.filter((column) => { const spec = normalizeSpec(column.spec); return spec.kind === "file" && spec.file?.accept === "image" && !spec.file.multiple })
    if (!hover) return onChange(startingLayout(columns.map((column) => ({ header: column.header, picture: pictures.includes(column), name: isNameColumnSpec(column.spec), long: /description|histoire|note|effet|lore|biographie/i.test(column.header) }))))
    // Un survol de départ : l'image en tête, puis la description (ou les premières colonnes).
    const description = columns.find((column) => /description|effet/i.test(column.header))
    const first = columns.filter((column) => !isNameColumnSpec(column.spec) && !pictures.includes(column) && column !== description).slice(0, 4)
    onChange({
      aside: [],
      sections: [{ id: layoutId(), rows: [
        ...(first.length ? [{ id: layoutId(), fields: first.slice(0, 2).map((column): LayoutField => ({ column: column.header, span: 6 })) }] : []),
        ...(first.length > 2 ? [{ id: layoutId(), fields: first.slice(2, 4).map((column): LayoutField => ({ column: column.header, span: 6 })) }] : []),
        ...(description ? [{ id: layoutId(), fields: [{ column: description.header, span: 12 as LayoutSpan, hideLabel: true }] }] : []),
      ] }],
      rest: "hide",
      ...(pictures[0] ? { image: pictures[0].header } : {}),
    })
  }

  if (!layout) return <div className="grid gap-3 rounded-xl border border-dashed bg-muted/15 p-4 text-sm">
    <p className="flex items-center gap-2 font-semibold"><LayoutTemplate className="size-4 text-primary" />{hover ? "Survol automatique" : "Mise en page automatique"}</p>
    <p className="text-xs leading-5 text-muted-foreground">{hover
      ? "Citer une ligne entière avec « { » montre au survol son image, son type et sa description. Personnalise-le pour choisir les colonnes affichées, leur place et leur largeur, comme une petite fiche."
      : "La fiche s’affiche deux champs par ligne, les images à droite. Personnalise-la pour ranger les champs comme tu veux : colonne latérale (portrait), sections avec titre, plusieurs champs par ligne, chacun de sa largeur — sans écrire de code."}</p>
    <div><Button type="button" size="sm" disabled={disabled || !columns.length} onClick={start}><Wand2 />Personnaliser</Button></div>
  </div>

  const dropProps = (place: Place, key: string) => ({
    onDragOver: (event: DragEvent) => { if (!dragging || disabled) return; event.preventDefault(); setOver(key) },
    onDragLeave: () => setOver((current) => current === key ? null : current),
    onDrop: (event: DragEvent) => { event.preventDefault(); setOver(null); const column = dragging ?? event.dataTransfer.getData("text/plain"); setDragging(null); if (column) set(placeField(layout, column, place)) },
  })

  const addRow = (section: number, fields: LayoutField[] = []) => set({ ...layout, sections: layout.sections.map((entry, index) => index !== section ? entry : { ...entry, rows: [...entry.rows, { id: layoutId(), fields }] }) })
  const updateSection = (section: number, changes: Partial<LayoutSection>) => set({ ...layout, sections: layout.sections.map((entry, index) => index === section ? { ...entry, ...changes } : entry) })
  const moveSection = (section: number, delta: number) => {
    const target = section + delta
    if (target < 0 || target >= layout.sections.length) return
    const sections = [...layout.sections]
    const [moved] = sections.splice(section, 1)
    sections.splice(target, 0, moved)
    set({ ...layout, sections })
  }
  const moveRow = (section: number, row: number, delta: number) => {
    const rows = [...layout.sections[section].rows]
    const target = row + delta
    if (target < 0 || target >= rows.length) return
    const [moved] = rows.splice(row, 1)
    rows.splice(target, 0, moved)
    updateSection(section, { rows })
  }
  /** Ajoute une colonne non placée : à la ligne donnée, sinon à la dernière ligne (créée au besoin). */
  const addColumn = (column: string, place?: Place) => {
    if (place) return set(placeField(layout, column, place, undefined, { column, span: 6 }))
    const lastSection = layout.sections.length - 1
    if (lastSection < 0) return set({ ...layout, sections: [{ id: layoutId(), rows: [{ id: layoutId(), fields: [{ column, span: 12 }] }] }] })
    const rows = layout.sections[lastSection].rows
    const lastRow = rows[rows.length - 1]
    const used = lastRow?.fields.reduce((sum, field) => sum + (field.span ?? 6), 0) ?? 12
    if (lastRow && used + 6 <= 12) return set(placeField(layout, column, { area: "row", section: lastSection, row: rows.length - 1 }, undefined, { column, span: 6 }))
    addRow(lastSection, [{ column, span: 12 }])
  }
  /** Un champ passe à la ligne d'avant ou d'après (une nouvelle ligne au bout de la section). */
  const shiftRow = (column: string, delta: number) => {
    const found = placeOf(layout, column)
    if (!found || found.place.area !== "row") return
    const { section, row } = found.place
    const rows = layout.sections[section].rows
    const target = row + delta
    if (target < 0) return
    if (target >= rows.length) {
      const removed = withoutColumn(layout, column)
      return set({ ...removed.layout, sections: removed.layout.sections.map((entry, index) => index !== section ? entry : { ...entry, rows: [...entry.rows, { id: layoutId(), fields: removed.field ? [removed.field] : [] }] }) })
    }
    set(placeField(layout, column, { area: "row", section, row: target }))
  }
  const updateField = (column: string, changes: Partial<LayoutField>) => {
    const found = placeOf(layout, column)
    if (!found) return
    set(withFields(layout, found.place, fieldsAt(layout, found.place).map((field, index) => index === found.index ? { ...field, ...changes } : field)))
  }

  const chip = (field: LayoutField, place: Place, index: number, count: number) => {
    const spec = specOf(field.column)
    const missing = !known(field.column)
    return <div
      key={field.column}
      draggable={!disabled}
      onDragStart={(event) => { setDragging(field.column); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", field.column) }}
      onDragEnd={() => { setDragging(null); setOver(null) }}
      onDragOver={(event) => { if (dragging && dragging !== field.column && !disabled) { event.preventDefault(); event.stopPropagation() } }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(null); const column = dragging; setDragging(null); if (column && column !== field.column) set(placeField(layout, column, place, index)) }}
      className={`group/chip relative flex min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-xs shadow-xs ${missing ? "border-destructive/40 bg-destructive/5" : "bg-background"}`}
      // Sa part de la ligne, comme dans la fiche : un champ « ½ » seul n'en prend que la moitié.
      style={place.area === "row" ? { flex: `0 1 calc(${field.span ?? 6} / 12 * 100% - 0.375rem)`, minWidth: "7.5rem" } : undefined}
      title={missing ? "Cette colonne n’existe plus dans l’onglet : elle sera ignorée." : spec ? indexColumnKinds[normalizeSpec(spec).kind].label : undefined}
    >
      <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />
      <span className={`min-w-0 flex-1 truncate font-medium ${field.large ? "font-display text-sm" : ""} ${missing ? "line-through" : ""}`}>{field.column}</span>
      {place.area === "row" && <NativeSelect disabled={disabled} value={String(field.span ?? 6)} onChange={(event) => updateField(field.column, { span: Number(event.target.value) as LayoutSpan })} className="h-6 w-[4.5rem] py-0 pl-2 pr-7 text-xs" aria-label={`Largeur de ${field.column}`} title="Largeur sur la ligne">
        {layoutSpans.map((span) => <NativeSelectOption key={span.value} value={String(span.value)} title={span.label}>{span.short}</NativeSelectOption>)}
      </NativeSelect>}
      {(field.large || field.hideLabel) && <span className="flex shrink-0 gap-0.5 text-muted-foreground">{field.large && <Heading className="size-3" aria-label="En grand" />}{field.hideLabel && <Tag className="size-3" aria-label="Sans nom de colonne" />}</span>}
      {/* Les gestes du champ, dans une petite barre qui flotte au-dessus au survol : le champ reste compact. */}
      <span className="absolute -top-3.5 right-1 z-20 hidden items-center rounded-md border bg-popover px-0.5 shadow-md group-hover/chip:flex group-focus-within/chip:flex">
        <Button type="button" variant={field.large ? "secondary" : "ghost"} size="icon-xs" disabled={disabled} onClick={() => updateField(field.column, { large: !field.large || undefined })} title={field.large ? "Taille normale" : "En grand (un nom, un titre)"} aria-label="En grand"><Heading /></Button>
        <Button type="button" variant={field.hideLabel ? "secondary" : "ghost"} size="icon-xs" disabled={disabled} onClick={() => updateField(field.column, { hideLabel: !field.hideLabel || undefined })} title={field.hideLabel ? "Montrer le nom de la colonne" : "Cacher le nom de la colonne"} aria-label="Nom de la colonne"><Tag /></Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => set(placeField(layout, field.column, place, index - 1))} title="Vers la gauche (ou le haut)" aria-label="Avancer"><ArrowLeft /></Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === count - 1} onClick={() => set(placeField(layout, field.column, place, index + 2))} title="Vers la droite (ou le bas)" aria-label="Reculer"><ArrowRight /></Button>
        {place.area === "row" && <>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || place.row === 0} onClick={() => shiftRow(field.column, -1)} title="À la ligne d’avant" aria-label="Ligne d’avant"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} onClick={() => shiftRow(field.column, 1)} title="À la ligne d’après (une nouvelle ligne au bout)" aria-label="Ligne d’après"><ArrowDown /></Button>
        </>}
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set(withoutColumn(layout, field.column).layout)} title="Retirer de la mise en page" aria-label={`Retirer ${field.column}`}><X /></Button>
      </span>
    </div>
  }

  const addSelect = (place: Place, label: string) => unplaced.length > 0 && <NativeSelect disabled={disabled} value="" onChange={(event) => { if (event.target.value) addColumn(event.target.value, place) }} className="h-7 w-auto min-w-28 border-dashed py-0 pl-2 pr-8 text-[11px]" aria-label={label}>
    <NativeSelectOption value="">+ Champ…</NativeSelectOption>
    {unplaced.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
  </NativeSelect>

  // L'aperçu : les champs de l'onglet avec le texte de sa première ligne.
  const previewItems = columns.map((column) => ({ header: column.header, text: (sample[column.header] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
  const preview = arrangeLayout(layout, previewItems, (item) => item.header)
  const previewField = (item: (typeof previewItems)[number], field: Pick<LayoutField, "hideLabel" | "large">): ReactNode => <div className="grid gap-0.5">
    {!field.hideLabel && <span className="text-[10px] font-semibold text-muted-foreground">{item.header}</span>}
    <span className={`block min-h-6 truncate rounded-md border bg-background/70 px-1.5 py-1 ${field.large ? "font-display text-sm font-semibold" : "text-[11px]"}`}>{item.text || <span className="text-muted-foreground/60">—</span>}</span>
  </div>

  return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
    <div className="grid content-start gap-3">
      {hover && <div className="grid gap-2 rounded-xl border bg-muted/15 p-3 sm:grid-cols-2">
        <label className={smallLabel}>Image en tête
          <NativeSelect disabled={disabled} value={layout.image ?? ""} onChange={(event) => set({ ...layout, image: event.target.value || undefined })} className="h-8 py-0 text-xs">
            <NativeSelectOption value="">Automatique (Image, Portrait…)</NativeSelectOption>
            {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label className={smallLabel}>Sous-titre (sous le nom)
          <NativeSelect disabled={disabled} value={layout.subtitle ?? ""} onChange={(event) => set({ ...layout, subtitle: event.target.value || undefined })} className="h-8 py-0 text-xs">
            <NativeSelectOption value="">Automatique (Type, onglet)</NativeSelectOption>
            {columns.map((column) => <NativeSelectOption key={column.header} value={column.header}>{column.header}</NativeSelectOption>)}
          </NativeSelect>
        </label>
      </div>}

      <div className={`grid gap-2 rounded-xl border p-3 ${over === "aside" ? "border-primary bg-primary/5" : "bg-muted/10"}`} {...dropProps({ area: "aside" }, "aside")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold">Colonne latérale <span className="font-normal text-muted-foreground">— à gauche : portrait, image, icône…</span></p>
          <NativeSelect disabled={disabled} value={layout.asideWidth ?? "md"} onChange={(event) => set({ ...layout, asideWidth: event.target.value as IndexLayout["asideWidth"] })} className="h-7 w-auto py-0 pl-2 pr-8 text-[11px]" aria-label="Largeur de la colonne latérale">
            <NativeSelectOption value="sm">Étroite</NativeSelectOption>
            <NativeSelectOption value="md">Moyenne</NativeSelectOption>
            <NativeSelectOption value="lg">Large</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {layout.aside.map((field, index) => chip(field, { area: "aside" }, index, layout.aside.length))}
          {!layout.aside.length && <span className="text-[11px] text-muted-foreground">Vide : glisse un champ ici, ou</span>}
          {addSelect({ area: "aside" }, "Ajouter à la colonne latérale")}
        </div>
      </div>

      {layout.sections.map((section, sectionIndex) => <div key={section.id} className={`grid gap-2 rounded-xl border p-3 ${section.framed ? "bg-muted/25" : "bg-background/40"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Input disabled={disabled} value={section.title ?? ""} onChange={(event) => updateSection(sectionIndex, { title: event.target.value || undefined })} placeholder={`Section ${sectionIndex + 1} — titre (facultatif)`} className="h-8 min-w-40 flex-1 text-xs font-semibold" />
          <label className="flex items-center gap-1.5 text-[11px]"><Checkbox disabled={disabled} checked={Boolean(section.framed)} onCheckedChange={(checked) => updateSection(sectionIndex, { framed: checked === true || undefined })} />Encadrée</label>
          <span className="flex">
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)} aria-label="Monter la section"><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || sectionIndex === layout.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)} aria-label="Descendre la section"><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => set({ ...layout, sections: layout.sections.filter((_, index) => index !== sectionIndex) })} title="Supprimer la section (ses champs redeviennent libres)" aria-label="Supprimer la section"><Trash2 /></Button>
          </span>
        </div>
        {section.rows.map((row, rowIndex) => {
          const key = `${section.id}:${row.id}`
          const used = row.fields.reduce((sum, field) => sum + (field.span ?? 6), 0)
          return <div key={row.id} className={`group/row flex items-start gap-1.5 rounded-lg border border-dashed p-1.5 ${over === key ? "border-primary bg-primary/5" : "border-border/70"}`} {...dropProps({ area: "row", section: sectionIndex, row: rowIndex }, key)}>
            <span className="mt-1.5 w-5 shrink-0 text-center text-[10px] text-muted-foreground" title={used > 12 ? "La ligne dépasse : les champs se partagent la place" : `${used}/12 de la ligne`}>{rowIndex + 1}</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {row.fields.map((field, index) => chip(field, { area: "row", section: sectionIndex, row: rowIndex }, index, row.fields.length))}
              {!row.fields.length && <span className="px-1 text-[11px] text-muted-foreground">Ligne vide : glisse un champ ici, ou</span>}
              {addSelect({ area: "row", section: sectionIndex, row: rowIndex }, `Ajouter à la ligne ${rowIndex + 1}`)}
            </div>
            <span className="flex shrink-0 opacity-50 group-hover/row:opacity-100">
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || rowIndex === 0} onClick={() => moveRow(sectionIndex, rowIndex, -1)} aria-label="Monter la ligne"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || rowIndex === section.rows.length - 1} onClick={() => moveRow(sectionIndex, rowIndex, 1)} aria-label="Descendre la ligne"><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => updateSection(sectionIndex, { rows: section.rows.filter((_, index) => index !== rowIndex) })} title="Supprimer la ligne (ses champs redeviennent libres)" aria-label="Supprimer la ligne"><Trash2 /></Button>
            </span>
          </div>
        })}
        <div><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => addRow(sectionIndex)}><Plus />Ligne</Button></div>
      </div>)}
      <div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ ...layout, sections: [...layout.sections, { id: layoutId(), rows: [{ id: layoutId(), fields: [] }] }] })}><Plus />Section</Button></div>

      <div className="grid gap-2 rounded-xl border bg-muted/10 p-3">
        <p className="text-xs font-semibold">Champs non placés <span className="font-normal text-muted-foreground">— glisse-les dans une ligne, ou clique pour les ajouter à la fin</span></p>
        <div className="flex flex-wrap gap-1.5">
          {unplaced.map((column) => <button
            key={column.header}
            type="button"
            draggable={!disabled}
            disabled={disabled}
            onDragStart={(event) => { setDragging(column.header); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.header) }}
            onDragEnd={() => { setDragging(null); setOver(null) }}
            onClick={() => addColumn(column.header)}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed bg-background px-2 py-1 text-xs hover:border-primary hover:text-primary"
            title={`${indexColumnKinds[normalizeSpec(column.spec).kind].label} — cliquer pour l’ajouter`}
          ><Plus className="size-3" />{column.header}</button>)}
          {!unplaced.length && <span className="text-[11px] text-muted-foreground">Toutes les colonnes sont placées.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">Les colonnes non placées (et celles ajoutées plus tard) :</span>
          <label className="flex items-center gap-1.5"><input type="radio" disabled={disabled} checked={(layout.rest ?? (hover ? "hide" : "show")) === "show"} onChange={() => set({ ...layout, rest: "show" })} />s’affichent à la suite</label>
          <label className="flex items-center gap-1.5"><input type="radio" disabled={disabled} checked={(layout.rest ?? (hover ? "hide" : "show")) === "hide"} onChange={() => set({ ...layout, rest: "hide" })} />sont masquées</label>
        </div>
      </div>
      <div><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}><RotateCcw />Revenir à l’affichage automatique</Button></div>
    </div>

    <aside className="grid content-start gap-2 rounded-xl border bg-card/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Aperçu</p>
      {hover && <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-lg border bg-muted/40 text-[10px] text-muted-foreground">{layout.image ? "img" : "…"}</span>
        <span className="min-w-0"><span className="block truncate font-display text-sm font-semibold">{previewItems.find((item) => columns.find((column) => column.header === item.header && isNameColumnSpec(column.spec)))?.text || "Nom de la ligne"}</span><span className="block truncate text-[9px] uppercase tracking-[.14em] text-muted-foreground">{layout.subtitle ? previewItems.find((item) => sameColumn(item.header, layout.subtitle!))?.text || layout.subtitle : "Type"}</span></span>
      </div>}
      <IndexLayoutView
        compact
        arranged={{ ...preview, rest: (layout.rest ?? (hover ? "hide" : "show")) === "hide" ? [] : preview.rest }}
        render={(item, field) => previewField(item, field)}
        renderRest={(rest) => <div className="grid gap-2 md:grid-cols-2">{rest.map((item) => <div key={item.header}>{previewField(item, {})}</div>)}</div>}
      />
    </aside>
  </div>
}
