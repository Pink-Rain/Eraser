"use client"

/**
 * « Modifier › Vues » d'un onglet : la liste, le kanban, le maître-détail, le calendrier, le
 * tableau de bord, la galerie, la chronologie, l'arborescence et le codex. Chaque vue a son
 * propre éditeur, avec ses pages et ses réglages (pas les mêmes partout) : ce qu'elle montre,
 * son dessin, ses couleurs et ses icônes. Sous les onglets, le panneau des presets et de la
 * gestion (`PresentationsPanel`) ; au centre, les réglages (`PresentationKindSettings`) ; à droite, l'aperçu
 * sur les vraies lignes. Les onglets-fenêtres et les pages qui choisissent une de ces vues la
 * montrent avec ces réglages.
 */
import { useMemo, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, BookOpen, Bookmark, Check, Columns3, Gauge, Image as ImageIcon, LayoutGrid, LayoutList, ListTree, Monitor, MousePointerClick, Palette, PanelsLeftRight, Pencil, Plus, RotateCcw, Sigma, Smartphone, Sparkles, Star, Tablet, X } from "lucide-react"

import { IndexCard } from "@/components/eraser/index-card"
import { NewCardDialog, SingleCardEditor } from "@/components/eraser/index-card-editor"
import { IndexFormView } from "@/components/eraser/index-form-view"
import { IndexStats } from "@/components/eraser/index-stats"
import { IndexPresentation } from "@/components/eraser/index-presentation"
import { layoutIcons, useIndexSettings } from "@/components/eraser/index-windows"
import { CopyToTabsDialog, ManagePresetsDialog, NamePresetDialog, PreviewDialog, PreviewExpandButton, VariantsPanel } from "@/components/eraser/index-variants-panel"
import { accentOptions, Choice, ColorSwatches, ColumnField, ColumnsPicker, densityOptions, fieldLabel, fieldStyleOptions, hintText, IconPick, ImageBoxControls, imageShapeOptions, radiusOptions, Range, Segmented, settingsGroup, settingsTitle, SettingsRow, sizeOptions, Tabs, Toggle } from "@/components/eraser/editor-controls"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, REAL_CALENDAR } from "@/lib/calendars"
import { pickCard, type CardColumn, type CardTemplate } from "@/lib/index-cards"
import { foldName } from "@/lib/index-columns"
import type { StatDefinition } from "@/lib/index-stats"
import type { NamedLayout } from "@/lib/index-layouts"
import { builtinPresentationPresets, calendarFormChoices, calendarScaleOf, calendarScales, dashboardTileKinds, DEFAULT_ITEM_CARD, PRESENTATION_ITEM_CARD, fitLayoutToColumns, groupFormulaOps, namedPresentationsOf, presentationKinds, presentationClicks, type CalendarForms, type CalendarScale, type DashboardTile, type KanbanLane, type NamedPresentation, type PresentationKind, type TabPresentations, type TileFormula, type Presentation, type PresentationLook, type PresentationPreset } from "@/lib/index-presentations"
import { presentationStartersFor } from "@/lib/index-presentation-starters"
import { cn } from "@/lib/utils"
import { useEffect } from "react"

/** Les noms des calendriers de l'Index des calendriers (le calendrier réel en tête). */
function useCalendarNames(active: boolean) {
  const [names, setNames] = useState<string[]>([REAL_CALENDAR])
  useEffect(() => {
    if (!active) return
    let alive = true
    void loadWorldIndexData("calendars").then((data) => { if (alive) setNames([REAL_CALENDAR, ...calendarsFromTables(data?.tables ?? []).map((calendar) => calendar.name)]) })
    return () => { alive = false }
  }, [active])
  return names
}

// ---------------------------------------------------------------------------
// Les morceaux de réglages partagés par plusieurs vues (chaque vue choisit les siens)
// ---------------------------------------------------------------------------

type Ctx = {
  kind: PresentationKind
  layout: Presentation
  columns: string[]
  set: (changes: Partial<Presentation>) => void
  setLook: (changes: Partial<PresentationLook>) => void
  look: PresentationLook
  cards: Array<{ id: string; name: string }>
  /** Les formulaires de l'onglet (« principal » : l'étoilé), pour l'élément et le détail. */
  forms: Array<{ id: string; name: string }>
  /** Les statistiques de l'index et les autres vues réglées de l'onglet (tuiles du tableau de bord). */
  stats: Array<{ id: string; title: string }>
  presentations: TabPresentations
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  disabled?: boolean
  /** De quoi faire un élément sur mesure (les colonnes typées, les lignes de l'aperçu, les cartes de l'onglet) ; absent : pas d'élément sur mesure. */
  element?: ElementSource
}

/** Ce qu'il faut à l'élément sur mesure d'une vue : les colonnes typées, quelques lignes, les cartes de l'onglet (pour partir d'elles). */
export type ElementSource = { columns: CardColumn[]; samples: Array<Record<string, string>>; tabCards: CardTemplate[] }

/** La formule d'un groupe (en-tête de section ou de colonne) : compte, somme… d'une colonne, contre une cible. */
function GroupFormulaSettings({ ctx, what = "section" }: { ctx: Ctx; what?: string }) {
  const { layout, set, columns, disabled } = ctx
  const formula = layout.groupFormula
  const update = (changes: Partial<NonNullable<Presentation["groupFormula"]>>) => set({ groupFormula: { op: "count", ...formula, ...changes } })
  return <div className="grid gap-1.5 rounded-lg border border-dashed bg-background/50 p-2.5">
    <SettingsRow>
      <label className={fieldLabel}><span className="flex items-center gap-1"><Sigma className="size-3" />Formule dans l’en-tête de chaque {what}</span>
        <NativeSelect value={formula ? formula.op : ""} disabled={disabled} onChange={(event) => event.target.value ? update({ op: event.target.value as NonNullable<Presentation["groupFormula"]>["op"] }) : set({ groupFormula: undefined })} className="h-8 py-0 text-xs">
          <NativeSelectOption value="">— Aucune —</NativeSelectOption>
          {groupFormulaOps.map((op) => <NativeSelectOption key={op.value} value={op.value}>{op.label}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      {formula && formula.op !== "count" && <ColumnField label="D’une colonne nombre" value={formula.column} columns={columns} onChange={(column) => update({ column })} empty="— Choisir… —" disabled={disabled} />}
      {formula && <label className={fieldLabel}>Cible <span className="font-normal">(vide : aucune)</span><Input type="number" min={0} step="any" value={formula.target ?? ""} disabled={disabled} placeholder="—" onChange={(event) => update({ target: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} className="h-8 w-24 text-xs" /></label>}
      {formula && <label className={fieldLabel}>Libellé<Input value={formula.label ?? ""} disabled={disabled} maxLength={40} placeholder="Σ, PV…" onChange={(event) => update({ label: event.target.value || undefined })} className="h-8 w-28 text-xs" /></label>}
      {formula && formula.target !== undefined && <Choice label="Dessin" value={formula.style ?? "text"} options={[{ value: "text", label: "Chiffre" }, { value: "bar", label: "Barre vers la cible" }]} onChange={(style) => update({ style: style === "text" ? undefined : style })} disabled={disabled} />}
    </SettingsRow>
  </div>
}

/** La jauge sous chaque élément : une colonne nombre en barre ou en charges, sur son maximum. */
function GaugeSettings({ ctx }: { ctx: Ctx }) {
  const { layout, set, columns, disabled } = ctx
  const gauge = layout.gauge
  const update = (changes: Partial<NonNullable<Presentation["gauge"]>>) => set({ gauge: gauge ? { ...gauge, ...changes } : undefined })
  return <SettingsRow>
    <label className={fieldLabel}><span className="flex items-center gap-1"><Gauge className="size-3" />Jauge sous chaque élément, prise dans</span>
      <NativeSelect value={gauge?.column ?? ""} disabled={disabled} onChange={(event) => event.target.value ? set({ gauge: { ...gauge, column: event.target.value } }) : set({ gauge: undefined })} className="h-8 py-0 text-xs">
        <NativeSelectOption value="">— Aucune —</NativeSelectOption>
        {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
      </NativeSelect>
    </label>
    {gauge && <Choice label="Dessin" value={gauge.style ?? "bar"} options={[{ value: "bar", label: "Barre" }, { value: "charges", label: "Charges (points)" }]} onChange={(style) => update({ style: style === "bar" ? undefined : style })} disabled={disabled} />}
    {gauge && <label className={fieldLabel}>Maximum <span className="font-normal">(vide : 100, ou la colonne)</span><Input type="number" min={0} step="any" value={gauge.max ?? ""} disabled={disabled} placeholder="—" onChange={(event) => update({ max: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} className="h-8 w-20 text-xs" /></label>}
    {gauge && <ColumnField label="…ou le maximum d’une colonne" value={gauge.maxColumn} columns={columns} onChange={(maxColumn) => update({ maxColumn })} empty="— Aucune —" disabled={disabled} />}
    {gauge && <label className={fieldLabel}>Libellé<Input value={gauge.label ?? ""} disabled={disabled} maxLength={40} placeholder={gauge.column} onChange={(event) => update({ label: event.target.value || undefined })} className="h-8 w-28 text-xs" /></label>}
  </SettingsRow>
}

/** « Au clic » sur un élément, et le panneau de détail (à côté, dessous, maître-détail). */
function ClickSettings({ ctx }: { ctx: Ctx }) {
  const { kind, layout, set, cards, forms, disabled } = ctx
  const master = kind === "master-detail"
  const click = master ? "side" : layout.click ?? "sheet"
  const panel = click === "side" || click === "below"
  const detail = layout.detail ?? {}
  const update = (changes: Partial<NonNullable<Presentation["detail"]>>) => { const next = { ...detail, ...changes }; for (const key of Object.keys(next) as Array<keyof typeof next>) if (next[key] === undefined) delete next[key]; set({ detail: Object.keys(next).length ? next : undefined }) }
  return <div className="grid gap-1.5 rounded-lg border border-dashed bg-background/50 p-2.5">
    <SettingsRow>
      {!master && <label className={fieldLabel}><span className="flex items-center gap-1"><MousePointerClick className="size-3" />Au clic sur un élément</span>
        <NativeSelect value={click} disabled={disabled} onChange={(event) => set({ click: event.target.value === "sheet" ? undefined : event.target.value as Presentation["click"] })} className="h-8 py-0 text-xs" title={presentationClicks.find((entry) => entry.value === click)?.hint}>
          {presentationClicks.map((entry) => <NativeSelectOption key={entry.value} value={entry.value}>{entry.label}</NativeSelectOption>)}
        </NativeSelect>
      </label>}
      {panel && <label className={fieldLabel}>{master ? "Le détail montre" : "Le panneau montre"}
        <NativeSelect value={detail.kind === "form" ? `form:${detail.form ?? "principal"}` : detail.kind === "card" ? `card:${detail.card ?? DEFAULT_ITEM_CARD}` : "fields"} disabled={disabled} onChange={(event) => {
          const value = event.target.value
          if (value === "fields") update({ kind: undefined, form: undefined, card: undefined })
          else if (value.startsWith("form:")) update({ kind: "form", form: value.slice(5) === "principal" ? undefined : value.slice(5), card: undefined })
          else update({ kind: "card", card: value.slice(5) === DEFAULT_ITEM_CARD ? undefined : value.slice(5), form: undefined })
        }} className="h-8 py-0 text-xs">
          <NativeSelectOption value="fields">Les colonnes de la ligne</NativeSelectOption>
          <NativeSelectOptGroup label="Un formulaire, en lecture">{forms.map((form) => <NativeSelectOption key={form.id} value={`form:${form.id}`}>{form.name}</NativeSelectOption>)}</NativeSelectOptGroup>
          <NativeSelectOptGroup label="Une carte"><NativeSelectOption value={`card:${DEFAULT_ITEM_CARD}`}>La carte à l’étoile</NativeSelectOption>{cards.map((card) => <NativeSelectOption key={card.id} value={`card:${card.id}`}>{card.name}</NativeSelectOption>)}</NativeSelectOptGroup>
        </NativeSelect>
      </label>}
      {click === "side" && !master && <Choice label="Largeur du panneau" value={detail.width ?? "normal"} options={[{ value: "narrow", label: "Étroit" }, { value: "normal", label: "Normal" }, { value: "wide", label: "Large" }]} onChange={(width) => update({ width: width === "normal" ? undefined : width })} disabled={disabled} />}
      {panel && <span className={cn(fieldLabel, "self-end pb-1.5")}><Toggle checked={Boolean(detail.nav)} onChange={(nav) => update({ nav: nav || undefined })} disabled={disabled}>Précédent / suivant</Toggle></span>}
    </SettingsRow>
  </div>
}

/** Le nom des éléments : police, taille, capitales. */
function TitleLook({ ctx, sizes = sizeOptions }: { ctx: Ctx; sizes?: ReadonlyArray<{ value: "sm" | "md" | "lg"; label: string }> }) {
  const { look, setLook, disabled } = ctx
  return <div className="flex flex-wrap items-end gap-3">
    <Choice label="Police du nom" value={look.titleFont ?? "sans"} options={[{ value: "display", label: "Titre" }, { value: "sans", label: "Texte" }]} onChange={(titleFont) => setLook({ titleFont: titleFont === "sans" ? undefined : titleFont })} disabled={disabled} />
    <Choice label="Taille" value={look.titleSize ?? "sm"} options={sizes} onChange={(titleSize) => setLook({ titleSize: titleSize === "sm" ? undefined : titleSize })} disabled={disabled} />
    <Toggle checked={Boolean(look.titleCaps)} onChange={(titleCaps) => setLook({ titleCaps: titleCaps || undefined })} disabled={disabled}>Capitales espacées</Toggle>
  </div>
}

/** Le cadre des éléments : encadrés ou non, espacement, coins, ombre. */
function FrameLook({ ctx, surfaces = [{ value: "plain", label: "Lignes séparées" }, { value: "zebra", label: "Lignes alternées" }, { value: "boxed", label: "Encadrés" }] }: { ctx: Ctx; surfaces?: ReadonlyArray<{ value: "plain" | "zebra" | "boxed"; label: string }> }) {
  const { look, setLook, disabled } = ctx
  return <>
    <div className="flex flex-wrap items-end gap-3">
      {surfaces.length > 0 && <Choice label="Éléments" value={look.surface ?? "plain"} options={surfaces} onChange={(surface) => setLook({ surface: surface === "plain" ? undefined : surface })} disabled={disabled} />}
      <Choice label="Espacement" value={look.density ?? "normal"} options={densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <Choice label="Coins" value={look.radius ?? "md"} options={radiusOptions} onChange={(radius) => setLook({ radius: radius === "md" ? undefined : radius })} disabled={disabled} />
      <Toggle checked={Boolean(look.shadow)} onChange={(shadow) => setLook({ shadow: shadow || undefined })} disabled={disabled}>Ombre</Toggle>
    </div>
  </>
}

/** Les colonnes montrées sous le nom : leur style et leur couleur. */
function FieldsLook({ ctx }: { ctx: Ctx }) {
  const { look, setLook, disabled } = ctx
  return <div className="flex flex-wrap items-end gap-3">
    <Choice label="Colonnes montrées" value={look.fieldStyle ?? "inline"} options={fieldStyleOptions} onChange={(fieldStyle) => setLook({ fieldStyle: fieldStyle === "inline" ? undefined : fieldStyle })} disabled={disabled} />
    <Choice label="Leurs libellés" value={look.hideFieldLabels ? "hidden" : look.fieldColor ?? "muted"} options={[{ value: "muted", label: "Discrets" }, { value: "accent", label: "À la couleur d’accent" }, { value: "hidden", label: "Sans libellé" }]} onChange={(choice) => setLook(choice === "hidden" ? { hideFieldLabels: true } : { hideFieldLabels: undefined, fieldColor: choice === "muted" ? undefined : choice })} disabled={disabled} />
  </div>
}

/** La couleur : celle de la vue, celle des lignes (une colonne), et comment elle marque un élément. */
function ColorLook({ ctx, modes = accentOptions, withRows = true }: { ctx: Ctx; modes?: ReadonlyArray<{ value: "border" | "tint" | "dot" | "title" | "none"; label: string }>; withRows?: boolean }) {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return <>
    <span className={fieldLabel}>Couleur d’accent de la vue <span className="font-normal">— sections, points, lignes, tuiles sans couleur propre</span>
      <ColorSwatches value={look.color} onChange={(color) => setLook({ color })} disabled={disabled} none="Or d’Eraser" ariaLabel="Couleur d’accent de la vue" />
    </span>
    {withRows && <div className="grid gap-2">
      <ColumnField label="Couleur des lignes selon" value={layout.colorBy} columns={columns} onChange={(colorBy) => set({ colorBy })} empty="— Aucune —" disabled={disabled} hint="Une colonne Couleur (« #a46a6a ») donne sa couleur ; une colonne liste, la couleur de son choix" />
      <Choice label="Elle marque l’élément par" value={look.accent ?? "border"} options={modes} onChange={(accent) => setLook({ accent: accent === "border" ? undefined : accent })} disabled={disabled} />
    </div>}
  </>
}

/** Les sections : une par valeur d'une colonne (ou par lettre), repliables, avec leur style et leur icône. */
function SectionsSettings({ ctx, withAlphabet = false }: { ctx: Ctx; withAlphabet?: boolean }) {
  const { layout, look, set, setLook, columns, disabled } = ctx
  const grouped = Boolean(layout.groupBy) || Boolean(layout.alphabet)
  return <div className={settingsGroup}>
    <p className={settingsTitle}><LayoutList className="size-3.5" />Sections</p>
    <div className="grid gap-2">
      <ColumnField label="Ranger en sections par" value={layout.groupBy} columns={columns} onChange={(groupBy) => set({ groupBy, ...(groupBy ? { alphabet: undefined } : {}) })} empty="— Pas de sections —" disabled={disabled} />
      {withAlphabet && <span className={cn(fieldLabel, "self-end pb-1.5")}><Toggle checked={Boolean(layout.alphabet)} onChange={(alphabet) => set({ alphabet: alphabet || undefined, ...(alphabet ? { groupBy: undefined } : {}) })} disabled={disabled}>…ou par première lettre (annuaire)</Toggle></span>}
    </div>
    {grouped && <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Toggle checked={Boolean(layout.collapsible)} onChange={(collapsible) => set({ collapsible: collapsible || undefined, collapsed: collapsible ? layout.collapsed : undefined })} disabled={disabled}>Repliables</Toggle>
        {layout.collapsible && <Toggle checked={Boolean(layout.collapsed)} onChange={(collapsed) => set({ collapsed: collapsed || undefined })} disabled={disabled}>Repliées à l’ouverture</Toggle>}
        <Toggle checked={Boolean(layout.hideEmpty)} onChange={(hideEmpty) => set({ hideEmpty: hideEmpty || undefined })} disabled={disabled}>Sans « Sans valeur »</Toggle>
        <Toggle checked={Boolean(layout.hideCounts)} onChange={(hideCounts) => set({ hideCounts: hideCounts || undefined })} disabled={disabled}>Sans le nombre de lignes</Toggle>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Titre des sections" value={look.sectionStyle ?? "bar"} options={[{ value: "bar", label: "Trait discret" }, { value: "heading", label: "Grand titre centré" }, { value: "letter", label: "En marge (glossaire)" }]} onChange={(sectionStyle) => setLook({ sectionStyle: sectionStyle === "bar" ? undefined : sectionStyle })} disabled={disabled} />
        <Choice label="Menu des sections" value={layout.menu ?? "none"} options={[{ value: "none", label: "Aucun" }, { value: "top", label: "En haut" }, { value: "side", label: "Sur le côté" }, { value: "tabs", label: "Onglets" }]} onChange={(menu) => set({ menu: menu === "none" ? undefined : menu })} disabled={disabled} />
        <span className={fieldLabel}>Icône des sections<IconPick value={look.sectionIcon} onChange={(sectionIcon) => setLook({ sectionIcon })} disabled={disabled} /></span>
      </div>
      <GroupFormulaSettings ctx={ctx} />
    </>}
  </div>
}

/** Ce qu'un élément montre : les colonnes sous le nom, l'icône, la pastille, l'image. */
function ItemSettings({ ctx, fieldsLabel = "Sous le nom", withBadge = true, withImage = true, withIcon = true, max = 8 }: { ctx: Ctx; fieldsLabel?: string; withBadge?: boolean; withImage?: boolean; withIcon?: boolean; max?: number }) {
  const { layout, look, set, setLook, columns, disabled } = ctx
  // Une carte, un formulaire ou un élément sur mesure dessine l'élément : ces réglages ne servent qu'à l'élément simple.
  if ((layout.itemCard || layout.itemForm) && ctx.kind !== "calendar") return null
  return <div className={settingsGroup}>
    <p className={settingsTitle}><LayoutList className="size-3.5" />Chaque élément</p>
    <span className={fieldLabel}>{fieldsLabel} <span className="font-normal">({max} au plus, dans l’ordre)</span><ColumnsPicker value={layout.fields ?? []} columns={columns} onChange={(fields) => set({ fields: fields.length ? fields : undefined })} disabled={disabled} ariaLabel="Colonnes montrées" max={max} /></span>
    {withIcon && <div className="grid gap-2">
      <ColumnField label="Icône devant le nom, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} hint="Une colonne icône (ou un émoji écrit dans une case)" />
      <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe devant chaque nom"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
    </div>}
    {withBadge && <ColumnField label="Pastille à droite du nom, prise dans" value={layout.badgeColumn} columns={columns} onChange={(badgeColumn) => set({ badgeColumn })} empty="— Aucune —" disabled={disabled} hint="Un rang, un type, un état : en pastille, à la couleur du choix" />}
    {withImage && <>
      <SettingsRow>
        <ColumnField label="Image ou icône à côté du nom" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Aucune —" disabled={disabled} hint="Une adresse donne une image, un nom d’icône ou un émoji donne une icône" />
        {layout.imageColumn && <Choice label="Forme" value={look.imageShape ?? "rounded"} options={imageShapeOptions} onChange={(imageShape) => setLook({ imageShape: imageShape === "rounded" ? undefined : imageShape })} disabled={disabled} />}
      </SettingsRow>
      {layout.imageColumn && <ImageBoxControls value={{ widthPct: look.imageWidth, heightPct: look.imageHeight, linked: look.imageLinked, bare: look.imageBare }} defaults={{ widthPct: { sm: 24, md: 36, lg: 56 }[look.imageSize ?? "md"], heightPct: { sm: 24, md: 36, lg: 56 }[look.imageSize ?? "md"], edges: [] }} onChange={(changes) => setLook({ ...(changes.widthPct !== undefined ? { imageWidth: changes.widthPct } : {}), ...(changes.heightPct !== undefined ? { imageHeight: changes.heightPct } : {}), ...(changes.linked !== undefined ? { imageLinked: changes.linked || undefined } : {}), ...("bare" in changes ? { imageBare: changes.bare || undefined } : {}) })} disabled={disabled} unit="px" widthRange={[12, 240]} heightRange={[12, 240]} withEdges={false} />}
      {layout.imageColumn && ctx.kind === "list" && !layout.compact && <span className={fieldLabel}><Toggle checked={Boolean(look.zigzag)} onChange={(zigzag) => setLook({ zigzag: zigzag || undefined })} disabled={disabled}>Image alternée gauche / droite (zigzag)</Toggle></span>}
    </>}
    <GaugeSettings ctx={ctx} />
  </div>
}

function SortSettings({ ctx }: { ctx: Ctx }) {
  const { layout, set, columns, disabled } = ctx
  return <div className="grid gap-2">
    <ColumnField label="Trier par" value={layout.sortBy} columns={columns} onChange={(sortBy) => set({ sortBy, sortDesc: sortBy ? layout.sortDesc : undefined })} empty="— L’ordre de la feuille —" disabled={disabled} />
    {layout.sortBy && <span className={cn(fieldLabel, "self-end pb-1.5")}><Toggle checked={Boolean(layout.sortDesc)} onChange={(sortDesc) => set({ sortDesc: sortDesc || undefined })} disabled={disabled}>Ordre décroissant</Toggle></span>}
  </div>
}

/** L'élément : chaque ligne dessinée avec les réglages de la vue, une carte de « Modifier › Cartes », ou un formulaire de l'onglet en lecture ; puis « Au clic ». */
function CardChoice({ ctx }: { ctx: Ctx }) {
  const { layout, set, cards, forms, disabled, element } = ctx
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const own = layout.itemCard === PRESENTATION_ITEM_CARD
  const value = layout.itemForm ? `form:${layout.itemForm}` : layout.itemCard ?? ""
  const kindLabel = presentationKinds.find((entry) => entry.value === ctx.kind)?.label ?? ""
  const choose = (next: string) => {
    if (next === PRESENTATION_ITEM_CARD) {
      // L'élément sur mesure : on part d'une forme (une carte de l'onglet, une forme de départ, un preset) s'il n'en a pas encore.
      if (layout.itemTemplate) set({ itemCard: PRESENTATION_ITEM_CARD, itemForm: undefined })
      else setPicking(true)
      return
    }
    set(next.startsWith("form:") ? { itemForm: next.slice(5), itemCard: undefined } : { itemCard: next || undefined, itemForm: undefined })
  }
  return <>
    <div className="grid gap-1.5 rounded-lg border border-dashed bg-background/50 p-2.5">
      <label className={cn(fieldLabel, "[&_[data-slot=native-select-wrapper]]:w-full")}>Élément : chaque ligne s’affiche
        <NativeSelect value={value} disabled={disabled} onChange={(event) => choose(event.target.value)} className="h-8 w-full py-0 text-xs">
          <NativeSelectOption value="">Avec les réglages de cette vue (nom, colonnes, icône, image)</NativeSelectOption>
          {(element || own) && <NativeSelectOptGroup label="Sur mesure"><NativeSelectOption value={PRESENTATION_ITEM_CARD}>Un élément propre à cette vue (moteur des cartes)</NativeSelectOption></NativeSelectOptGroup>}
          <NativeSelectOptGroup label="Avec une carte de l’onglet"><NativeSelectOption value={DEFAULT_ITEM_CARD}>La carte à l’étoile de l’onglet</NativeSelectOption>{cards.map((card) => <NativeSelectOption key={card.id} value={card.id}>{card.name}</NativeSelectOption>)}{layout.itemCard && !own && layout.itemCard !== DEFAULT_ITEM_CARD && !cards.some((card) => card.id === layout.itemCard) && <NativeSelectOption value={layout.itemCard}>Carte retirée (la carte à l’étoile la remplace)</NativeSelectOption>}</NativeSelectOptGroup>
          <NativeSelectOptGroup label="Avec un formulaire en lecture">{forms.map((form) => <NativeSelectOption key={form.id} value={`form:${form.id}`}>{form.name}</NativeSelectOption>)}</NativeSelectOptGroup>
        </NativeSelect>
      </label>
      {own && layout.itemTemplate && element && <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" className="h-8" disabled={disabled} onClick={() => setEditing(true)}><Pencil />Modifier l’élément</Button>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={() => setPicking(true)}><Sparkles />Repartir d’une forme…</Button>
      </div>}
      <p className={hintText}>{own ? "Fait avec le moteur des cartes : taille, image, couleurs, blocs (titre, pastilles, libellé : valeur, jauge ou charges, tuiles, détails…), composition. Gardé dans cette vue, qui le pose à sa taille." : layout.itemForm ? "Le formulaire se règle dans « Modifier › Formulaire » : sections, onglets, blocs. Ici il se lit, le clic ouvre la fiche." : layout.itemCard ? "La carte se dessine dans « Modifier › Cartes » : image, couleurs, blocs, composition. Une carte changée là change aussi ici." : "Pour régler l’élément aussi finement qu’une carte : « Un élément propre à cette vue »."}</p>
    </div>
    <ClickSettings ctx={ctx} />
    {picking && element && <NewCardDialog
      title={`Élément de la vue ${kindLabel} : point de départ`}
      columns={element.columns}
      samples={element.samples}
      builtins={element.tabCards}
      builtinsLabel="Les cartes de cet onglet"
      builtinsHint="Une copie, à retoucher pour cette vue seulement."
      onPick={(card) => { set({ itemCard: PRESENTATION_ITEM_CARD, itemTemplate: { ...card, name: `Élément · ${kindLabel}` }, itemForm: undefined }); setPicking(false); setEditing(true) }}
      onClose={() => setPicking(false)}
    />}
    {editing && element && layout.itemTemplate && <Dialog open onOpenChange={(open) => { if (!open) setEditing(false) }}>
      <DialogContent className="flex h-[92svh] max-h-[92svh] flex-col gap-3 sm:max-w-[min(96vw,1360px)]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-2xl">Élément de la vue {kindLabel}</DialogTitle>
          <DialogDescription>Chaque ligne de la vue se dessine ainsi : la carte, son image, ses blocs, sa composition. L’aperçu, à droite, montre les lignes de l’onglet. Rien n’est écrit avant « Enregistrer ».</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden"><SingleCardEditor card={layout.itemTemplate} columns={element.columns} samples={element.samples} onChange={(itemTemplate) => set({ itemTemplate })} disabled={disabled} /></div>
        <div className="flex shrink-0 justify-end"><Button type="button" onClick={() => setEditing(false)}><Check />Terminé</Button></div>
      </DialogContent>
    </Dialog>}
  </>
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

function ListPages(ctx: Ctx): Page[] {
  const { layout, set, disabled } = ctx
  return [
    { key: "items", label: "Lignes", icon: <LayoutList className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutList className="size-3.5" />La liste</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle checked={Boolean(layout.compact)} onChange={(compact) => set({ compact: compact || undefined })} disabled={disabled}>Compacte (une ligne par élément)</Toggle>
          {!layout.compact && <Toggle checked={Boolean(layout.collapsible) && !layout.groupBy && !layout.alphabet} onChange={(collapsible) => set({ collapsible: collapsible || undefined })} disabled={disabled || Boolean(layout.groupBy || layout.alphabet)} title={layout.groupBy || layout.alphabet ? "Avec des sections, ce sont elles qui se replient" : "Déplier une ligne montre toutes ses colonnes"}>Lignes dépliables</Toggle>}
          <Toggle checked={Boolean(layout.numbered)} onChange={(numbered) => set({ numbered: numbered || undefined })} disabled={disabled}>Numérotées</Toggle>
        </div>
        <Range text="Colonnes de la liste (sur un écran assez large)" value={layout.listColumns ?? 1} min={1} max={5} onChange={(value) => set({ listColumns: value === 1 ? undefined : value as 2 | 3 | 4 | 5 })} disabled={disabled} />
      </div>
      <CardChoice ctx={ctx} />
      <ItemSettings ctx={ctx} />
    </> },
    { key: "sections", label: "Sections", icon: <ListTree className="size-3.5" />, render: () => <SectionsSettings ctx={ctx} withAlphabet /> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p><FrameLook ctx={ctx} /><TitleLook ctx={ctx} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------

function LanesEditor({ ctx }: { ctx: Ctx }) {
  const { layout, set, optionsOf, disabled } = ctx
  const [added, setAdded] = useState("")
  const column = layout.kanbanColumn ?? ""
  const options = column ? optionsOf?.(column) ?? [] : []
  const lanes = layout.lanes ?? []
  const values = [...new Set([...options.map((option) => option.value), ...lanes.map((lane) => lane.value)])]
  const laneOf = (value: string) => lanes.find((lane) => foldName(lane.value) === foldName(value))
  const update = (value: string, changes: Partial<KanbanLane>) => {
    const next = { ...(laneOf(value) ?? { value }), ...changes }
    for (const key of Object.keys(next) as Array<keyof KanbanLane>) if (next[key] === undefined || next[key] === false) delete next[key]
    const rest = lanes.filter((lane) => foldName(lane.value) !== foldName(value))
    const kept = Object.keys(next).length > 1 ? [...rest, next] : rest
    set({ lanes: kept.length ? kept : undefined })
  }
  if (!column) return null
  return <div className={settingsGroup}>
    <p className={settingsTitle}><Columns3 className="size-3.5" />Chaque colonne du kanban</p>
    <p className={hintText}>Les valeurs de « {column} » dans leur ordre. Chacune peut avoir son libellé, sa couleur, son icône, une limite de cartes, ou rester cachée.</p>
    <div className="grid gap-1.5">
      {values.map((value) => {
        const lane = laneOf(value)
        const option = options.find((candidate) => foldName(candidate.value) === foldName(value))
        return <div key={value} className={cn("grid gap-1.5 rounded-lg border bg-background/70 p-2", lane?.hidden && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold">{(lane?.color ?? option?.color) && <span className="size-2.5 rounded-full" style={{ backgroundColor: lane?.color ?? option?.color }} />}{value}</span>
            <Input value={lane?.label ?? ""} disabled={disabled} maxLength={60} placeholder="Libellé affiché (sinon la valeur)" onChange={(event) => update(value, { label: event.target.value || undefined })} className="h-7 min-w-40 flex-1 text-xs" aria-label={`Libellé de ${value}`} />
            <IconPick value={lane?.icon} onChange={(icon) => update(value, { icon })} disabled={disabled} />
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Limite<Input type="number" min={1} max={999} value={lane?.limit ?? ""} disabled={disabled} placeholder="—" onChange={(event) => update(value, { limit: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} className="h-7 w-16 text-xs" aria-label={`Limite de ${value}`} /></label>
            <Toggle checked={Boolean(lane?.hidden)} onChange={(hidden) => update(value, { hidden: hidden || undefined })} disabled={disabled}>Cachée</Toggle>
          </div>
          <ColorSwatches value={lane?.color} onChange={(color) => update(value, { color })} disabled={disabled} none={option?.color ? "Celle de la liste" : "Accent"} ariaLabel={`Couleur de ${value}`} />
        </div>
      })}
    </div>
    {!options.length && <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); if (added.trim()) { update(added.trim(), { label: undefined }); set({ lanes: [...lanes, { value: added.trim() }] }); setAdded("") } }}>
      <Input value={added} disabled={disabled} placeholder="Une valeur à régler (« En cours »)" onChange={(event) => setAdded(event.target.value)} className="h-7 text-xs" />
      <Button type="submit" size="sm" variant="outline" className="h-7 text-[11px]" disabled={disabled || !added.trim()}><Plus />Ajouter</Button>
    </form>}
  </div>
}

function KanbanPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return [
    { key: "lanes", label: "Colonnes", icon: <Columns3 className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Columns3 className="size-3.5" />Le kanban</p>
        <ColumnField label="Une colonne du kanban par valeur de" value={layout.kanbanColumn} columns={columns} onChange={(kanbanColumn) => set({ kanbanColumn, lanes: undefined })} empty="— Choisir… —" disabled={disabled} hint="Glisser une carte d’une colonne à l’autre change la case" />
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Largeur des colonnes" value={layout.laneWidth ?? "normal"} options={[{ value: "narrow", label: "Serrées" }, { value: "normal", label: "Normales" }, { value: "wide", label: "Larges" }]} onChange={(laneWidth) => set({ laneWidth: laneWidth === "normal" ? undefined : laneWidth })} disabled={disabled} />
          <Choice label="En-tête des colonnes" value={look.laneStyle ?? "plain"} options={[{ value: "plain", label: "Sobre" }, { value: "tinted", label: "Teinté" }, { value: "header", label: "Bandeau coloré" }]} onChange={(laneStyle) => setLook({ laneStyle: laneStyle === "plain" ? undefined : laneStyle })} disabled={disabled} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle checked={Boolean(layout.hideEmpty)} onChange={(hideEmpty) => set({ hideEmpty: hideEmpty || undefined })} disabled={disabled}>Sans la colonne « Sans valeur »</Toggle>
          <Toggle checked={Boolean(layout.hideCounts)} onChange={(hideCounts) => set({ hideCounts: hideCounts || undefined })} disabled={disabled}>Sans le nombre de cartes</Toggle>
          <Toggle checked={Boolean(layout.laneCollapse)} onChange={(laneCollapse) => set({ laneCollapse: laneCollapse || undefined })} disabled={disabled}>Colonnes repliables (clic sur l’en-tête)</Toggle>
        </div>
        <span className={fieldLabel}>Icône d’office des colonnes<IconPick value={look.sectionIcon} onChange={(sectionIcon) => setLook({ sectionIcon })} disabled={disabled} /></span>
      </div>
      {layout.kanbanColumn && <GroupFormulaSettings ctx={ctx} what="colonne" />}
      <LanesEditor ctx={ctx} />
    </> },
    { key: "cards", label: "Cartes", icon: <LayoutGrid className="size-3.5" />, render: () => <><CardChoice ctx={ctx} /><ItemSettings ctx={ctx} /></> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin des cartes</p><FrameLook ctx={ctx} surfaces={[{ value: "boxed", label: "Encadrées" }, { value: "plain", label: "Séparées d’un trait" }]} /><TitleLook ctx={ctx} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri dans chaque colonne</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Maître-détail
// ---------------------------------------------------------------------------

function MasterDetailPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return [
    { key: "master", label: "Liste", icon: <PanelsLeftRight className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><PanelsLeftRight className="size-3.5" />La liste</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Côté" value={layout.masterSide ?? "left"} options={[{ value: "left", label: "À gauche" }, { value: "right", label: "À droite" }]} onChange={(masterSide) => set({ masterSide: masterSide === "left" ? undefined : masterSide })} disabled={disabled} />
          <Choice label="Largeur" value={look.masterWidth ?? "normal"} options={[{ value: "narrow", label: "Étroite" }, { value: "normal", label: "Normale" }, { value: "wide", label: "Large" }]} onChange={(masterWidth) => setLook({ masterWidth: masterWidth === "normal" ? undefined : masterWidth })} disabled={disabled} />
        </div>
      </div>
      <ItemSettings ctx={ctx} max={4} />
      <SectionsSettings ctx={ctx} />
    </> },
    { key: "detail", label: "Détail", icon: <BookOpen className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><BookOpen className="size-3.5" />La ligne choisie</p>
        <span className={fieldLabel}>Colonnes du détail <span className="font-normal">(toutes si aucune choisie, 12 au plus)</span><ColumnsPicker value={layout.detailFields ?? []} columns={columns} onChange={(detailFields) => set({ detailFields: detailFields.length ? detailFields : undefined })} disabled={disabled} ariaLabel="Colonnes du détail" max={12} /></span>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Sur" value={String(layout.detailColumns ?? 2)} options={[{ value: "1", label: "Une colonne" }, { value: "2", label: "Deux" }, { value: "3", label: "Trois" }]} onChange={(value) => set({ detailColumns: value === "2" ? undefined : Number(value) as 1 | 3 })} disabled={disabled} />
          <Choice label="Son image" value={layout.detailImage ?? "side"} options={[{ value: "side", label: "À côté du titre" }, { value: "banner", label: "En bannière" }, { value: "none", label: "Sans" }]} onChange={(detailImage) => set({ detailImage: detailImage === "side" ? undefined : detailImage })} disabled={disabled || !layout.imageColumn} hint={layout.imageColumn ? undefined : "Choisis d’abord une image dans « Liste »"} />
        </div>
      </div>
      <CardChoice ctx={ctx} />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p><FrameLook ctx={ctx} surfaces={[{ value: "plain", label: "Lignes séparées" }, { value: "boxed", label: "Encadrées" }]} /><TitleLook ctx={ctx} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Calendrier
// ---------------------------------------------------------------------------

function CalendarPages(ctx: Ctx, calendars: string[]): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  const scale = calendarScaleOf(layout)
  const forms = layout.calendarForms ?? {}
  const setForm = (value: string) => {
    const next = { ...forms, [scale]: calendarFormChoices[scale][0].value === value ? undefined : value } as CalendarForms
    for (const key of Object.keys(next) as CalendarScale[]) if (next[key] === undefined) delete next[key]
    set({ calendarForms: Object.keys(next).length ? next : undefined })
  }
  const withLines = (scale === "month" && forms.month === "lines") || (scale === "week" && forms.week === "lines")
  const withGrid = scale === "month" && forms.month !== "lines"
  return [
    { key: "dates", label: "Dates", icon: <LayoutGrid className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutGrid className="size-3.5" />Le calendrier</p>
        <div className="grid gap-2">
          <ColumnField label="Colonne de la date" value={layout.dateColumn} columns={columns} onChange={(dateColumn) => set({ dateColumn })} empty="— Choisir… —" disabled={disabled} />
          <label className={fieldLabel}>Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} disabled={disabled} onChange={(event) => set({ calendar: event.target.value })} className="h-8 py-0 text-xs">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
        </div>
        <p className={hintText}>Les calendriers (mois, saisons, jours de la semaine, images) se créent dans l’Index des calendriers. « 12 Brumaire 1023 » dans la case : la ligne se place à sa date.</p>
      </div>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />L’échelle</p>
        <Choice label="Échelle" value={scale} options={calendarScales.map((option) => ({ value: option.value, label: option.label, title: option.hint }))} onChange={(calendarScale) => set({ calendarScale, look: look.calendarMode ? { ...look, calendarMode: undefined } : look })} disabled={disabled} />
        <Choice label="Forme" value={(forms[scale] ?? calendarFormChoices[scale][0].value) as string} options={calendarFormChoices[scale] as ReadonlyArray<{ value: string; label: string }>} onChange={setForm} disabled={disabled} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle checked={Boolean(layout.calendarSwitcher)} onChange={(calendarSwitcher) => set({ calendarSwitcher: calendarSwitcher || undefined })} disabled={disabled} title="Année · Mois · Semaine · Jour · Agenda · Saisons, au-dessus du calendrier">Barre des échelles</Toggle>
          <Toggle checked={!layout.calendarStay} onChange={(drill) => set({ calendarStay: drill ? undefined : true })} disabled={disabled} title="Un mois de l’année ouvre le mois, un jour du mois ouvre le jour">Les échelles s’emboîtent au clic</Toggle>
          <Toggle checked={Boolean(layout.showUndated)} onChange={(showUndated) => set({ showUndated: showUndated || undefined })} disabled={disabled}>Lister les lignes sans date</Toggle>
          {withLines && <Toggle checked={Boolean(layout.hideEmptyDays)} onChange={(hideEmptyDays) => set({ hideEmptyDays: hideEmptyDays || undefined })} disabled={disabled}>Masquer les jours vides</Toggle>}
        </div>
        <p className={hintText}>{calendarScales.find((option) => option.value === scale)?.hint}</p>
      </div>
      <GroupFormulaSettings ctx={ctx} what={scale === "week" ? "semaine" : scale === "seasons" ? "saison" : "mois"} />
    </> },
    { key: "entries", label: "Entrées", icon: <LayoutList className="size-3.5" />, render: () => <>
      {withGrid && <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutList className="size-3.5" />Dans la grille</p>
        <Choice label="Entrées" value={look.entryStyle ?? "pill"} options={[{ value: "pill", label: "Pastilles" }, { value: "dot", label: "Points" }, { value: "bar", label: "Barres" }]} onChange={(entryStyle) => setLook({ entryStyle: entryStyle === "pill" ? undefined : entryStyle })} disabled={disabled} />
        <Range text="Entrées par jour, au plus" value={layout.maxPerDay ?? 0} min={0} max={12} format={(value) => value ? String(value) : "toutes"} onChange={(value) => set({ maxPerDay: value || undefined })} disabled={disabled} title="Au-delà, « +N » ouvre le reste" />
      </div>}
      <CardChoice ctx={ctx} />
      <ItemSettings ctx={ctx} fieldsLabel={scale === "day" && forms.day === "paragraphs" ? "Sous le nom (la première en paragraphe)" : scale === "week" && forms.week === "table" ? "Colonnes du tableau" : "Sous le nom (listes, fiches)"} />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><ImageIcon className="size-3.5" />Bannière</p>
        <Choice label="Image" value={layout.calendarBanner ?? "none"} options={[{ value: "none", label: "Aucune" }, { value: "month", label: "Du mois" }, { value: "season", label: "De la saison" }, { value: "fixed", label: "Fixe" }]} onChange={(calendarBanner) => set({ calendarBanner: calendarBanner === "none" ? undefined : calendarBanner })} disabled={disabled} hint="L’image du mois ou de la saison se lit dans la colonne « Image » de l’Index des calendriers" />
        {layout.calendarBanner === "fixed" && <Input value={layout.bannerImage ?? ""} disabled={disabled} onChange={(event) => set({ bannerImage: event.target.value || undefined })} placeholder="Adresse de l’image (https://… ou /api/…)" aria-label="Image de la bannière" className="h-8 text-xs" />}
        {layout.calendarBanner && <Range text="Hauteur" value={layout.bannerHeight ?? 120} min={40} max={400} step={10} format={(value) => `${value} px`} onChange={(value) => set({ bannerHeight: value === 120 ? undefined : value })} disabled={disabled} />}
      </div>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label={withGrid ? "Hauteur des jours" : "Espacement"} value={look.density ?? "normal"} options={withGrid ? [{ value: "compact", label: "Basse" }, { value: "normal", label: "Normale" }, { value: "airy", label: "Haute" }] : densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
          <Choice label="En-tête du mois" value={layout.monthStyle ?? "plain"} options={[{ value: "plain", label: "Sobre" }, { value: "season", label: "À la couleur de la saison" }]} onChange={(monthStyle) => set({ monthStyle: monthStyle === "plain" ? undefined : monthStyle })} disabled={disabled} />
          <Toggle checked={!layout.hideSeasons} onChange={(shown) => set({ hideSeasons: shown ? undefined : true })} disabled={disabled}>Afficher la saison</Toggle>
          <Toggle checked={!layout.hideCounts} onChange={(shown) => set({ hideCounts: shown ? undefined : true })} disabled={disabled}>Compter les lignes par mois</Toggle>
        </div>
        <FrameLook ctx={ctx} surfaces={[{ value: "plain", label: "Lignes séparées" }, { value: "boxed", label: "Encadrés" }]} />
        <TitleLook ctx={ctx} />
        <FieldsLook ctx={ctx} />
      </div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

const tileViewKinds = presentationKinds.filter((kind) => kind.value !== "dashboard")

/** Une tuile du tableau de bord : son genre, puis les réglages propres à ce genre, puis les communs. */
function TileEditor({ tile, position, total, ctx, onChange, onMove, onRemove }: { tile: DashboardTile; position: number; total: number; ctx: Ctx; onChange: (tile: DashboardTile) => void; onMove: (delta: number) => void; onRemove: () => void }) {
  const { columns, cards, forms, stats, presentations, disabled } = ctx
  const patch = (changes: Partial<DashboardTile>) => { const next = { ...tile, ...changes }; for (const key of Object.keys(next) as Array<keyof DashboardTile>) if (next[key] === undefined) delete next[key]; onChange(next) }
  const needsColumn = dashboardTileKinds.find((kind) => kind.value === tile.kind)?.needsColumn
  const numeric = ["count", "sum", "average", "min", "max", "filled"].includes(tile.kind)
  const columnSelect = (value: string | undefined, onPick: (value: string | undefined) => void, label: string, empty = "Colonne…") => <NativeSelect value={value ?? ""} disabled={disabled} onChange={(event) => onPick(event.target.value || undefined)} aria-label={label} className="h-8 min-w-32 flex-1 py-0 text-xs"><NativeSelectOption value="">{empty}</NativeSelectOption>{columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect>
  const formulas = tile.formulas?.length ? tile.formulas : [{ op: "count" as const }]
  const setFormula = (at: number, formula: TileFormula | null) => patch({ formulas: formulas.flatMap((item, index) => index === at ? formula ? [formula] : [] : [item]) })
  return <div className="grid gap-2 rounded-lg border bg-background/70 p-2">
    <div className="flex flex-wrap items-center gap-1.5">
      <NativeSelect value={tile.kind} disabled={disabled} onChange={(event) => patch({ kind: event.target.value as DashboardTile["kind"] })} aria-label="Tuile" className="h-8 min-w-40 flex-1 py-0 text-xs">
        <NativeSelectOptGroup label="Chiffres">{dashboardTileKinds.filter((kind) => kind.group === "number").map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}</NativeSelectOption>)}</NativeSelectOptGroup>
        <NativeSelectOptGroup label="Autres tuiles">{dashboardTileKinds.filter((kind) => kind.group === "other").map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}</NativeSelectOption>)}</NativeSelectOptGroup>
      </NativeSelect>
      {needsColumn && columnSelect(tile.column, (column) => patch({ column }), "Colonne", tile.kind === "linked" ? "Colonne liée…" : "Colonne…")}
      <span className="flex shrink-0">
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || position === 0} onClick={() => onMove(-1)} aria-label="Avancer la tuile"><ArrowUp /></Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || position === total - 1} onClick={() => onMove(1)} aria-label="Reculer la tuile"><ArrowDown /></Button>
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={onRemove} aria-label="Retirer la tuile"><X /></Button>
      </span>
    </div>
    {tile.kind === "gauge" && <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Choice label="Mesure" value={tile.row !== undefined ? "row" : tile.measure ?? "count"} options={[{ value: "count", label: "Nombre de lignes" }, { value: "sum", label: "Somme" }, { value: "average", label: "Moyenne" }, { value: "min", label: "Min" }, { value: "max", label: "Max" }, { value: "row", label: "Une ligne précise" }]} onChange={(measure) => patch(measure === "row" ? { row: tile.row ?? "", measure: undefined } : { measure: measure === "count" ? undefined : measure, row: undefined, maxColumn: undefined })} disabled={disabled} />
        <Choice label="Dessin" value={tile.style ?? "ring"} options={[{ value: "ring", label: "Anneau" }, { value: "bar", label: "Barre" }, { value: "charges", label: "Charges" }]} onChange={(style) => patch({ style: style === "ring" ? undefined : style })} disabled={disabled} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tile.row !== undefined && <Input value={tile.row} disabled={disabled} onChange={(event) => patch({ row: event.target.value })} placeholder="Nom de la ligne" aria-label="Nom de la ligne" className="h-8 min-w-32 flex-1 text-xs" />}
        {(tile.row !== undefined || (tile.measure && tile.measure !== "count")) && columnSelect(tile.column, (column) => patch({ column }), "Colonne du nombre", "Colonne du nombre…")}
        <Input type="number" min={0} step="any" value={tile.target ?? ""} disabled={disabled} onChange={(event) => patch({ target: event.target.value ? Number(event.target.value) : undefined })} placeholder="Cible" aria-label="Cible" className="h-8 w-24 text-xs" />
        {tile.row !== undefined && columnSelect(tile.maxColumn, (maxColumn) => patch({ maxColumn }), "Colonne du maximum", "ou le maximum lu dans…")}
      </div>
      <p className={hintText}>Une formule sur les lignes de la vue, ou la case d’une ligne (« Vie » d’Aldric sur « Vie max »), contre une cible : au-delà, la jauge passe au rouge.</p>
    </div>}
    {tile.kind === "stat" && <div className="grid gap-1.5">
      <NativeSelect value={tile.stat ?? ""} disabled={disabled} onChange={(event) => patch({ stat: event.target.value || undefined })} aria-label="Statistique" className="h-8 py-0 text-xs"><NativeSelectOption value="">— Choisir une statistique… —</NativeSelectOption>{stats.map((stat) => <NativeSelectOption key={stat.id} value={stat.id}>{stat.title}</NativeSelectOption>)}{tile.stat && !stats.some((stat) => stat.id === tile.stat) && <NativeSelectOption value={tile.stat}>Statistique retirée ({tile.stat})</NativeSelectOption>}</NativeSelect>
      <p className={hintText}>Les statistiques se construisent dans « Modifier › Stats » (barres, anneaux, histogrammes…) ; ici elle se calcule sur les lignes de la vue.</p>
    </div>}
    {tile.kind === "view" && <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={tile.view ?? ""} disabled={disabled} onChange={(event) => patch({ view: (event.target.value || undefined) as DashboardTile["view"] })} aria-label="Vue" className="h-8 min-w-40 flex-1 py-0 text-xs"><NativeSelectOption value="">— Choisir une vue… —</NativeSelectOption>{tileViewKinds.map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}{presentations[kind.value] ? " (réglée)" : ""}</NativeSelectOption>)}</NativeSelect>
      </div>
      <Range text="Lignes au plus" value={tile.limit ?? 10} min={1} max={100} onChange={(value) => patch({ limit: value === 10 ? undefined : value })} disabled={disabled} />
      <p className={hintText}>La vue garde ses propres réglages (Modifier › la vue) : trier par une colonne et limiter donne un « top N ».</p>
    </div>}
    {tile.kind === "card" && <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input value={tile.row ?? ""} disabled={disabled} onChange={(event) => patch({ row: event.target.value || undefined })} placeholder="Nom de la ligne" aria-label="Nom de la ligne" className="h-8 min-w-32 flex-1 text-xs" />
        <NativeSelect value={tile.form ? `form:${tile.form}` : tile.card ?? DEFAULT_ITEM_CARD} disabled={disabled} onChange={(event) => { const next = event.target.value; patch(next.startsWith("form:") ? { form: next.slice(5), card: undefined } : { card: next === DEFAULT_ITEM_CARD ? undefined : next, form: undefined }) }} aria-label="Élément" className="h-8 min-w-40 flex-1 py-0 text-xs">
          <NativeSelectOptGroup label="Avec une carte (3)"><NativeSelectOption value={DEFAULT_ITEM_CARD}>La carte à l’étoile de l’onglet</NativeSelectOption>{cards.map((card) => <NativeSelectOption key={card.id} value={card.id}>{card.name}</NativeSelectOption>)}</NativeSelectOptGroup>
          <NativeSelectOptGroup label="Avec un formulaire en lecture (1)">{forms.map((form) => <NativeSelectOption key={form.id} value={`form:${form.id}`}>{form.name}</NativeSelectOption>)}</NativeSelectOptGroup>
        </NativeSelect>
      </div>
    </div>}
    {tile.kind === "text" && <div className="grid gap-1.5">
      <textarea value={tile.text ?? ""} disabled={disabled} maxLength={2000} onChange={(event) => patch({ text: event.target.value || undefined })} rows={3} placeholder="Le groupe compte {nombre} membres et porte {somme Or} po…" aria-label="Texte" className="min-h-16 rounded-md border bg-background px-2 py-1.5 text-xs" />
      <p className={hintText}>Entre accolades, des formules recalculées sur les lignes de la vue : {"{nombre}"}, {"{somme Or}"}, {"{moyenne Niveau}"}, {"{min X}"}, {"{max X}"}, {"{remplies X}"}, {"{Or de Aldric}"} (la case d’une ligne nommée), {"{Or}"} (sa somme).</p>
    </div>}
    {tile.kind === "linked" && <div className="grid gap-1.5">
      <p className={hintText}>Une tuile par valeur de la colonne liée (chaque personnage, chaque lieu…), avec des formules sur les lignes qui la citent.</p>
      {formulas.map((formula, at) => <div key={at} className="flex flex-wrap items-center gap-1.5">
        <NativeSelect value={formula.op} disabled={disabled} onChange={(event) => setFormula(at, { ...formula, op: event.target.value as TileFormula["op"] })} aria-label="Formule" className="h-8 min-w-28 py-0 text-xs">{groupFormulaOps.map((op) => <NativeSelectOption key={op.value} value={op.value}>{op.label}</NativeSelectOption>)}</NativeSelect>
        {formula.op !== "count" && columnSelect(formula.column, (column) => setFormula(at, { ...formula, column }), "Colonne de la formule")}
        <Input value={formula.label ?? ""} disabled={disabled} maxLength={40} onChange={(event) => setFormula(at, { ...formula, label: event.target.value || undefined })} placeholder="Libellé" aria-label="Libellé" className="h-8 w-28 text-xs" />
        <Input value={formula.unit ?? ""} disabled={disabled} maxLength={12} onChange={(event) => setFormula(at, { ...formula, unit: event.target.value || undefined })} placeholder="Unité" aria-label="Unité" className="h-8 w-16 text-xs" />
        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled || formulas.length <= 1} onClick={() => setFormula(at, null)} aria-label="Retirer la formule"><X /></Button>
      </div>)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || formulas.length >= 4} onClick={() => patch({ formulas: [...formulas, { op: "sum", column: columns[0] }] })}><Plus />Formule</Button>
        <Range text="Tuiles au plus" value={tile.limit ?? 24} min={1} max={100} onChange={(value) => patch({ limit: value === 24 ? undefined : value })} disabled={disabled} />
      </div>
    </div>}
    <div className="grid gap-1.5 sm:grid-cols-3">
      <Input value={tile.label ?? ""} disabled={disabled} onChange={(event) => patch({ label: event.target.value || undefined })} placeholder="Titre (facultatif)" aria-label="Titre de la tuile" className="h-8 text-xs" />
      {(numeric || tile.kind === "gauge") && <Input value={tile.unit ?? ""} disabled={disabled} maxLength={12} onChange={(event) => patch({ unit: event.target.value || undefined })} placeholder="Unité (PO, %, km)" aria-label="Unité" className="h-8 text-xs" />}
      <Input value={tile.note ?? ""} disabled={disabled} maxLength={80} onChange={(event) => patch({ note: event.target.value || undefined })} placeholder="Une ligne sous la tuile" aria-label="Note" className="h-8 text-xs" />
      <Input value={tile.section ?? ""} disabled={disabled} maxLength={60} onChange={(event) => patch({ section: event.target.value || undefined })} placeholder="Section (Groupe, Monde…)" aria-label="Section" className="h-8 text-xs" />
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className={cn(fieldLabel, "flex-row items-center")}>Icône<IconPick value={tile.icon} onChange={(icon) => patch({ icon })} disabled={disabled} /></span>
      {numeric && <Choice label="Nombre" value={tile.size ?? "md"} options={[{ value: "sm", label: "Petit" }, { value: "md", label: "Moyen" }, { value: "lg", label: "Grand" }]} onChange={(size) => patch({ size: size === "md" ? undefined : size })} disabled={disabled} />}
      <Choice label="Largeur" value={tile.full ? "full" : tile.wide ? "wide" : "one"} options={[{ value: "one", label: "Une place" }, { value: "wide", label: "Deux" }, { value: "full", label: "Toute la rangée" }]} onChange={(width) => patch({ wide: width === "wide" || undefined, full: width === "full" || undefined })} disabled={disabled} />
    </div>
    <ColorSwatches value={tile.color} onChange={(color) => patch({ color })} disabled={disabled} none="Accent de la vue" ariaLabel="Couleur de la tuile" />
  </div>
}

function TilesEditor({ ctx }: { ctx: Ctx }) {
  const { layout, set, columns, disabled } = ctx
  const tiles = layout.tiles ?? [{ kind: "count" }]
  const setTile = (position: number, tile: DashboardTile | null) => set({ tiles: tiles.flatMap((item, index) => index === position ? tile ? [tile] : [] : [item]) })
  const move = (position: number, delta: number) => { const next = [...tiles]; const [moved] = next.splice(position, 1); next.splice(position + delta, 0, moved); set({ tiles: next }) }
  return <div className={settingsGroup}>
    <div className="flex items-center justify-between gap-2">
      <p className={settingsTitle}><LayoutGrid className="size-3.5" />Les tuiles</p>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || tiles.length >= 24} onClick={() => set({ tiles: [...tiles, { kind: "breakdown", column: columns[0] }] })}><Plus />Ajouter une tuile</Button>
    </div>
    <div className="grid gap-2">
      {tiles.map((tile, position) => <TileEditor key={position} tile={tile} position={position} total={tiles.length} ctx={ctx} onChange={(next) => setTile(position, next)} onMove={(delta) => move(position, delta)} onRemove={() => setTile(position, null)} />)}
    </div>
  </div>
}

function DashboardPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, disabled } = ctx
  const sections = [...new Set((layout.tiles ?? []).map((tile) => tile.section).filter(Boolean))]
  return [
    { key: "tiles", label: "Tuiles", icon: <LayoutGrid className="size-3.5" />, render: () => <TilesEditor ctx={ctx} /> },
    { key: "sections", label: "Sections", icon: <ListTree className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><ListTree className="size-3.5" />Les sections</p>
      <p className={hintText}>Chaque tuile nomme sa section dans ses réglages (« Groupe », « Monde », « Règles ») : les tuiles d’une même section vont ensemble, sous son titre.{sections.length ? ` Sections : ${sections.join(", ")}.` : " Aucune pour l’instant."}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Toggle checked={Boolean(layout.collapsible)} onChange={(collapsible) => set({ collapsible: collapsible || undefined, collapsed: collapsible ? layout.collapsed : undefined })} disabled={disabled}>Sections repliables</Toggle>
        {layout.collapsible && <Toggle checked={Boolean(layout.collapsed)} onChange={(collapsed) => set({ collapsed: collapsed || undefined })} disabled={disabled}>Repliées à l’ouverture</Toggle>}
      </div>
      <span className={fieldLabel}>Icône devant les titres de sections<IconPick value={look.sectionIcon} onChange={(sectionIcon) => setLook({ sectionIcon })} disabled={disabled} /></span>
    </div> },
    { key: "look", label: "Grille et apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutGrid className="size-3.5" />La grille</p>
        <Range text="Tuiles par rangée" value={layout.tileColumns ?? 3} min={1} max={6} onChange={(value) => set({ tileColumns: value === 3 ? undefined : value as 1 | 2 | 4 | 5 | 6 })} disabled={disabled} />
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Tuiles" value={look.tileStyle ?? "plain"} options={[{ value: "plain", label: "Sobres" }, { value: "accent", label: "Liseré coloré" }, { value: "tinted", label: "Teintées" }]} onChange={(tileStyle) => setLook({ tileStyle: tileStyle === "plain" ? undefined : tileStyle })} disabled={disabled} />
          <Choice label="Espacement" value={look.density ?? "normal"} options={densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Coins" value={look.radius ?? "md"} options={radiusOptions} onChange={(radius) => setLook({ radius: radius === "md" ? undefined : radius })} disabled={disabled} />
          <Toggle checked={Boolean(look.shadow)} onChange={(shadow) => setLook({ shadow: shadow || undefined })} disabled={disabled}>Ombre</Toggle>
          <Choice label="Police des nombres" value={look.titleFont ?? "display"} options={[{ value: "display", label: "Titre" }, { value: "sans", label: "Texte" }]} onChange={(titleFont) => setLook({ titleFont: titleFont === "display" ? undefined : titleFont })} disabled={disabled} />
        </div>
      </div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} withRows={false} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Galerie
// ---------------------------------------------------------------------------

const galleryShapes = [{ key: "square", label: "Carré", ratio: 1, w: 16, h: 16 }, { key: "portrait", label: "Rectangle vertical", ratio: 0.8, w: 13, h: 16 }, { key: "landscape", label: "Rectangle horizontal", ratio: 1.6, w: 18, h: 11 }] as const
const galleryRatioOf = (layout: Presentation) => layout.galleryHeightRem ? galleryWidthOf(layout) / layout.galleryHeightRem : layout.galleryRatio ?? { square: 1, portrait: 0.8, landscape: 1.6 }[layout.galleryShape ?? "portrait"]
const galleryWidthOf = (layout: Presentation) => layout.galleryWidthRem ?? { sm: 8.5, md: 12, lg: 17 }[layout.gallerySize ?? "md"]

function GalleryPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  const ratio = galleryRatioOf(layout)
  const style = layout.galleryStyle ?? "plain"
  return [
    { key: "images", label: "Images", icon: <ImageIcon className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><ImageIcon className="size-3.5" />Les vignettes</p>
      <ColumnField label="Colonne des images" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Choisir… —" disabled={disabled} />
      <Choice label="Galerie" value={style} options={[{ value: "plain", label: "Mosaïque" }, { value: "wall", label: "Mur sans marge" }, { value: "cabinet", label: "Cabinet (cadres)" }, { value: "strip", label: "Planche large" }, { value: "carousel", label: "Carrousel" }]} onChange={(galleryStyle) => set({ galleryStyle: galleryStyle === "plain" ? undefined : galleryStyle })} disabled={disabled} />
      <p className={hintText}>{style === "wall" ? "Les images collées les unes aux autres, le nom au survol." : style === "cabinet" ? "Fond sombre, un cadre à la couleur de la ligne (ou de la vue), le nom sur une plaque." : style === "strip" ? "Des vignettes larges, le ruban, le nom et le texte dessous." : style === "carousel" ? "Une image à la fois, ses voisines en retrait, des flèches." : "Les images en grille, chacune à la largeur réglée."}</p>
      <span className={fieldLabel}>Forme de départ <span className="font-normal">— règle les deux curseurs</span>
        <span className="flex flex-wrap gap-1">{galleryShapes.map((shape) => <button key={shape.key} type="button" disabled={disabled} title={shape.label} aria-label={shape.label} aria-pressed={Math.abs(ratio - shape.ratio) < 0.02} onClick={() => set({ galleryHeightRem: Math.round(galleryWidthOf(layout) / shape.ratio * 2) / 2, galleryWidthRem: galleryWidthOf(layout), galleryRatio: undefined })} className={cn("grid h-9 min-w-10 place-items-center rounded-md border px-1.5", Math.abs(ratio - shape.ratio) < 0.02 ? "border-primary bg-primary/10" : "hover:bg-muted")}><span className="block rounded-[2px] border border-current opacity-70" style={{ width: shape.w, height: shape.h }} /></button>)}</span>
      </span>
      <ImageBoxControls
        value={{ widthPct: layout.galleryWidthRem, heightPct: layout.galleryHeightRem, linked: layout.galleryLinked }}
        defaults={{ widthPct: galleryWidthOf(layout), heightPct: Math.round(galleryWidthOf(layout) / ratio), edges: [] }}
        onChange={(changes) => set({ ...(changes.widthPct !== undefined ? { galleryWidthRem: changes.widthPct } : {}), ...(changes.heightPct !== undefined ? { galleryHeightRem: changes.heightPct, galleryRatio: undefined } : {}), ...(changes.linked !== undefined ? { galleryLinked: changes.linked || undefined } : {}) })}
        disabled={disabled || look.imageShape === "circle"}
        unit="rem"
        widthRange={[5, 30]}
        heightRange={[3, 40]}
        withEdges={false}
        radius={layout.galleryRadiusPx ?? { square: 6, rounded: 12, circle: 999 }[look.imageShape ?? "rounded"]}
        onRadius={(galleryRadiusPx) => set({ galleryRadiusPx })}
      />
      <ColumnField label="Largeur selon une colonne nombre" value={layout.gallerySizeColumn} columns={columns} onChange={(gallerySizeColumn) => set({ gallerySizeColumn })} empty="— Toutes la même largeur —" disabled={disabled} hint="La plus grande valeur prend la largeur réglée, les autres en proportion (une taille, une importance)" />
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Image" value={layout.galleryFit ?? "cover"} options={[{ value: "cover", label: "Remplit" }, { value: "contain", label: "Entière" }]} onChange={(galleryFit) => set({ galleryFit: galleryFit === "cover" ? undefined : galleryFit })} disabled={disabled} />
        <Toggle checked={look.imageShape === "circle"} onChange={(circle) => setLook({ imageShape: circle ? "circle" : undefined })} disabled={disabled}>Rondes (médaillons)</Toggle>
        <Toggle checked={!layout.galleryStill} onChange={(zoom) => set({ galleryStill: zoom ? undefined : true })} disabled={disabled}>Zoom au survol</Toggle>
      </div>
    </div> },
    { key: "captions", label: "Légendes", icon: <LayoutList className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutList className="size-3.5" />Les légendes</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Le nom" value={look.caption ?? "overlay"} options={[{ value: "overlay", label: "Posé sur l’image" }, { value: "below", label: "Sous l’image" }]} onChange={(caption) => setLook({ caption: caption === "overlay" ? undefined : caption })} disabled={disabled} />
          {look.caption !== "below" && <Toggle checked={Boolean(layout.captionOnHover)} onChange={(captionOnHover) => set({ captionOnHover: captionOnHover || undefined })} disabled={disabled}>Seulement au survol</Toggle>}
        </div>
        <TitleLook ctx={ctx} />
        <span className={fieldLabel}>Sous le nom <span className="font-normal">(4 au plus)</span><ColumnsPicker value={layout.fields ?? []} columns={columns} onChange={(fields) => set({ fields: fields.length ? fields : undefined })} disabled={disabled} ariaLabel="Colonnes montrées" max={4} /></span>
        <FieldsLook ctx={ctx} />
        <ColumnField label="Ruban sur l’image, pris dans" value={layout.badgeColumn} columns={columns} onChange={(badgeColumn) => set({ badgeColumn })} empty="— Aucun —" disabled={disabled} hint="Un rang, un type : en ruban dans le coin de la vignette" />
        <div className="grid gap-2">
          <ColumnField label="Icône dans le coin, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} />
          <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
        </div>
        <GaugeSettings ctx={ctx} />
        <p className={hintText}>Sur la vignette : la barre en bas de l’image, les charges dans un coin.</p>
      </div>
      <ClickSettings ctx={ctx} />
    </> },
    { key: "sections", label: "Sections", icon: <ListTree className="size-3.5" />, render: () => <SectionsSettings ctx={ctx} withAlphabet /> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Espacement" value={look.density ?? "normal"} options={densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
          <Choice label="Vignettes" value={look.surface ?? "plain"} options={[{ value: "plain", label: "Nues" }, { value: "boxed", label: "Encadrées (polaroïd)" }]} onChange={(surface) => setLook({ surface: surface === "plain" ? undefined : surface })} disabled={disabled} />
          <Toggle checked={Boolean(look.shadow)} onChange={(shadow) => setLook({ shadow: shadow || undefined })} disabled={disabled}>Ombre</Toggle>
        </div>
      </div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} modes={[{ value: "border", label: "Liseré sous l’image" }, { value: "tint", label: "Halo" }, { value: "title", label: "Nom coloré" }, { value: "none", label: "Rien" }]} /><p className={hintText}>Le cabinet prend cette couleur pour ses cadres.</p></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Chronologie
// ---------------------------------------------------------------------------

function TimelinePages(ctx: Ctx, calendars: string[]): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  const style = layout.timelineStyle ?? "dots"
  const axis = style === "bars" || style === "lanes"
  return [
    { key: "time", label: "Temps", icon: <LayoutList className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutList className="size-3.5" />La ligne du temps</p>
        <div className="grid gap-2">
          <ColumnField label="Colonne de la date (ou de l’année)" value={layout.dateColumn} columns={columns} onChange={(dateColumn) => set({ dateColumn })} empty="— Choisir… —" disabled={disabled} />
          <label className={fieldLabel}>Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} disabled={disabled} onChange={(event) => set({ calendar: event.target.value })} className="h-8 py-0 text-xs">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
        </div>
        <p className={hintText}>Une date du calendrier (« 12 Brumaire 1023 ») ou une année seule (« 1023 »). Les lignes sans date restent listées en dessous.</p>
        <Choice label="Chaque ligne" value={style} options={[{ value: "dots", label: "Un point" }, { value: "icons", label: "Un médaillon" }, { value: "chapters", label: "Un chapitre" }, { value: "bars", label: "Une barre de durée" }, { value: "lanes", label: "Sur un fil" }]} onChange={(timelineStyle) => set({ timelineStyle: timelineStyle === "dots" ? undefined : timelineStyle })} disabled={disabled} />
        {style === "bars" && <ColumnField label="Colonne de la fin (date ou année)" value={layout.endColumn} columns={columns} onChange={(endColumn) => set({ endColumn })} empty="— Sans fin : un instant —" disabled={disabled} hint="Chaque ligne devient une barre du début à la fin sur l’axe des années" />}
        {style === "lanes" && <ColumnField label="Un fil par valeur de" value={layout.laneColumn} columns={columns} onChange={(laneColumn) => set({ laneColumn })} empty="— Choisir… —" disabled={disabled} hint="Une colonne liée (personnage, lieu…) : un fil horizontal par valeur, les événements posés dessus" />}
        {!axis && <div className="flex flex-wrap items-end gap-3">
          <Choice label="Axe" value={layout.timelineAxis ?? "vertical"} options={[{ value: "vertical", label: "Vertical" }, { value: "horizontal", label: "Frise horizontale" }]} onChange={(timelineAxis) => set({ timelineAxis: timelineAxis === "vertical" ? undefined : timelineAxis })} disabled={disabled} />
          {layout.timelineAxis !== "horizontal" && <Choice label="Disposition" value={layout.timelineSide ?? "alternate"} options={[{ value: "alternate", label: "Des deux côtés" }, { value: "right", label: "D’un seul côté" }, { value: "groups", label: "Un côté par groupe" }]} onChange={(timelineSide) => set({ timelineSide: timelineSide === "alternate" ? undefined : timelineSide })} disabled={disabled} hint="« Un côté par groupe » suit la colonne des périodes ci-dessous" />}
        </div>}
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Un jalon par" value={String(layout.milestoneEvery ?? 1)} options={[{ value: "1", label: "An" }, { value: "10", label: "Décennie" }, { value: "100", label: "Siècle" }, { value: "1000", label: "Millénaire" }]} onChange={(value) => set({ milestoneEvery: value === "1" ? undefined : Number(value) as 10 | 100 | 1000 })} disabled={disabled} />
          {!axis && <Choice label="La date de chaque élément" value={layout.dateStyle ?? "label"} options={[{ value: "label", label: "Écrite au-dessus" }, { value: "badge", label: "En étiquette" }, { value: "hidden", label: "Cachée" }]} onChange={(dateStyle) => set({ dateStyle: dateStyle === "label" ? undefined : dateStyle })} disabled={disabled} />}
        </div>
        {!axis && <span className={fieldLabel}>Icône des jalons<IconPick value={layout.milestoneIcon} onChange={(milestoneIcon) => set({ milestoneIcon })} disabled={disabled} /></span>}
      </div>
      <div className={settingsGroup}>
        <p className={settingsTitle}><ListTree className="size-3.5" />Les périodes</p>
        <ColumnField label="Une période par valeur de" value={layout.groupBy} columns={columns} onChange={(groupBy) => set({ groupBy })} empty="— Aucune —" disabled={disabled} hint="Une ère, un règne, une saison : une colonne (ou une colonne liée) dont chaque valeur fait une période" />
        {layout.groupBy && !axis && <Choice label="Dessinées" value={layout.timelinePeriods ?? "none"} options={[{ value: "none", label: "Pas à part" }, { value: "bands", label: "En bandes" }, { value: "scale", label: "En échelle (clic = déplier)" }]} onChange={(timelinePeriods) => set({ timelinePeriods: timelinePeriods === "none" ? undefined : timelinePeriods })} disabled={disabled} />}
        {layout.groupBy && <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><Toggle checked={Boolean(layout.hideEmpty)} onChange={(hideEmpty) => set({ hideEmpty: hideEmpty || undefined })} disabled={disabled}>Sans la période « Sans valeur »</Toggle><Toggle checked={Boolean(layout.hideCounts)} onChange={(hideCounts) => set({ hideCounts: hideCounts || undefined })} disabled={disabled}>Sans le nombre de lignes</Toggle></div>}
        {layout.groupBy && <span className={fieldLabel}>Icône devant les périodes<IconPick value={look.sectionIcon} onChange={(sectionIcon) => setLook({ sectionIcon })} disabled={disabled} /></span>}
        <GroupFormulaSettings ctx={ctx} what="période (ou fil)" />
      </div>
    </> },
    { key: "items", label: "Éléments", icon: <LayoutGrid className="size-3.5" />, render: () => <>
      <CardChoice ctx={ctx} />
      <ItemSettings ctx={ctx} withBadge fieldsLabel={style === "bars" || style === "lanes" ? "Sous le nom (jauge)" : "Sous le nom"} />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p><FrameLook ctx={ctx} surfaces={[{ value: "boxed", label: "Encadrés" }, { value: "plain", label: "Nus" }]} /><TitleLook ctx={ctx} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} /><p className={hintText}>La ligne du temps et les jalons prennent la couleur d’accent de la vue ; chaque point, celle de sa ligne (ou de sa période).</p></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Arborescence
// ---------------------------------------------------------------------------

function TreePages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  const style = layout.treeStyle ?? "lines"
  return [
    { key: "tree", label: "Arbre", icon: <ListTree className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><ListTree className="size-3.5" />L’arbre</p>
        <ColumnField label="Colonne du parent" value={layout.parentColumn} columns={columns} onChange={(parentColumn) => set({ parentColumn })} empty="— Choisir… —" disabled={disabled} hint="La case nomme une autre ligne du même onglet (une ville dont « Pays » vaut « Valdor » se range sous Valdor)" />
        <Choice label="Dessin" value={style} options={[{ value: "lines", label: "Lignes" }, { value: "indent", label: "Retrait" }, { value: "boxed", label: "Cartes emboîtées" }, { value: "org", label: "Organigramme" }, { value: "mindmap", label: "Carte mentale" }]} onChange={(treeStyle) => set({ treeStyle: treeStyle === "lines" ? undefined : treeStyle })} disabled={disabled} />
        <p className={hintText}>{style === "org" ? "Les enfants en rangée sous leur parent, reliés par un trait ; l’élément en carte si tu le veux." : style === "mindmap" ? "La racine au centre, ses branches de part et d’autre, chacune à sa couleur." : style === "boxed" ? "Chaque nœud encadré, ses enfants dedans ; l’élément en carte si tu le veux." : "Un nœud par ligne, en retrait sous son parent."}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Espacement" value={look.density ?? "normal"} options={densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Toggle checked={Boolean(layout.collapsed)} onChange={(collapsed) => set({ collapsed: collapsed || undefined })} disabled={disabled}>Branches repliées à l’ouverture</Toggle>
          <Toggle checked={Boolean(layout.hideCounts)} onChange={(hideCounts) => set({ hideCounts: hideCounts || undefined })} disabled={disabled}>Sans le nombre de lignes</Toggle>
          <Toggle checked={Boolean(layout.numbered)} onChange={(numbered) => set({ numbered: numbered || undefined })} disabled={disabled}>Numérotés 1., 1.1, 1.1.1</Toggle>
          <Toggle checked={Boolean(layout.rootsAsSections)} onChange={(rootsAsSections) => set({ rootsAsSections: rootsAsSections || undefined })} disabled={disabled}>Les racines en grandes sections</Toggle>
          <Toggle checked={Boolean(layout.depthColors)} onChange={(depthColors) => set({ depthColors: depthColors || undefined })} disabled={disabled}>Une couleur par profondeur</Toggle>
        </div>
      </div>
      <GroupFormulaSettings ctx={ctx} what="branche (sur ses enfants)" />
    </> },
    { key: "nodes", label: "Nœuds", icon: <LayoutList className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Icônes</p>
        <div className="flex flex-wrap items-end gap-4">
          <span className={fieldLabel}>Branches (lignes qui ont des enfants)<IconPick value={layout.branchIcon} onChange={(branchIcon) => set({ branchIcon })} disabled={disabled} /></span>
          <span className={fieldLabel}>Feuilles<IconPick value={layout.leafIcon} onChange={(leafIcon) => set({ leafIcon })} disabled={disabled} /></span>
        </div>
        <p className={hintText}>Une colonne icône (ci-dessous) passe avant ces icônes d’office.</p>
      </div>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutList className="size-3.5" />Dates et état</p>
        <div className="grid gap-2">
          <ColumnField label="Date de début, sous le nom" value={layout.dateColumn} columns={columns} onChange={(dateColumn) => set({ dateColumn })} empty="— Aucune —" disabled={disabled} />
          <ColumnField label="Date de fin" value={layout.endColumn} columns={columns} onChange={(endColumn) => set({ endColumn })} empty="— Aucune —" disabled={disabled} />
        </div>
        <ColumnField label="Grisé quand cette colonne est vide ou dit non" value={layout.dimColumn} columns={columns} onChange={(dimColumn) => set({ dimColumn })} empty="— Jamais —" disabled={disabled} hint="Une lignée : les disparus en grisé (« Vivant » vide ou « non »)" />
      </div>
      <CardChoice ctx={ctx} />
      <ItemSettings ctx={ctx} fieldsLabel="À droite du nom" />
      {layout.click === "side" && <div className={settingsGroup}><Toggle checked={layout.detail?.kind === "children"} onChange={(children) => set({ detail: { ...(layout.detail ?? {}), kind: children ? "children" : undefined } })} disabled={disabled}>Le panneau montre les enfants du nœud choisi (explorateur)</Toggle><p className={hintText}>Les enfants se dessinent avec l’élément (carte ou lignes) ; un clic sur l’un d’eux descend d’un niveau.</p></div>}
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p><TitleLook ctx={ctx} sizes={[{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }]} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} modes={[{ value: "border", label: "Point et nom" }, { value: "tint", label: "Teinte" }, { value: "dot", label: "Point" }, { value: "title", label: "Nom coloré" }, { value: "none", label: "Rien" }]} /><p className={hintText}>« Couleur des lignes selon » une colonne de rang teinte chaque niveau de la hiérarchie.</p></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri des enfants</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function CodexPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, cards, disabled } = ctx
  const style = layout.codexStyle ?? "book"
  return [
    { key: "sheets", label: "Fiches", icon: <BookOpen className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><BookOpen className="size-3.5" />Chaque fiche</p>
        <span className={fieldLabel}>Colonnes de chaque fiche <span className="font-normal">(toutes si aucune choisie, 12 au plus)</span><ColumnsPicker value={layout.detailFields ?? []} columns={columns} onChange={(detailFields) => set({ detailFields: detailFields.length ? detailFields : undefined })} disabled={disabled} ariaLabel="Colonnes des fiches" max={12} /></span>
        <p className={hintText}>Les textes longs se lisent en paragraphes ; les valeurs courtes forment l’encadré.</p>
        <div className="grid gap-2">
          <ColumnField label="Image de chaque fiche" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Aucune —" disabled={disabled} />
          {layout.imageColumn && style !== "sketch" && <Choice label="Posée" value={look.codexImage ?? "side"} options={[{ value: "side", label: "Dans l’encadré" }, { value: "banner", label: "En bannière" }]} onChange={(codexImage) => setLook({ codexImage: codexImage === "side" ? undefined : codexImage })} disabled={disabled} />}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Le texte" value={String(layout.proseColumns ?? 1)} options={[{ value: "1", label: "Sur une colonne" }, { value: "2", label: "Sur deux colonnes" }]} onChange={(value) => set({ proseColumns: value === "2" ? 2 : undefined })} disabled={disabled} />
          <Toggle checked={Boolean(look.dropCap)} onChange={(dropCap) => setLook({ dropCap: dropCap || undefined })} disabled={disabled}>Lettrine au premier paragraphe</Toggle>
          <Toggle checked={Boolean(layout.chapterNumbers)} onChange={(chapterNumbers) => set({ chapterNumbers: chapterNumbers || undefined })} disabled={disabled}>Fiches numérotées (chapitres)</Toggle>
        </div>
        <div className="grid gap-2">
          <ColumnField label="Icône devant le titre, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} />
          <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
        </div>
        <ColumnField label="Pastille à droite du titre, prise dans" value={layout.badgeColumn} columns={columns} onChange={(badgeColumn) => set({ badgeColumn })} empty="— Aucune —" disabled={disabled} />
      </div>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutGrid className="size-3.5" />Tuiles, renvois, jauge</p>
        <span className={fieldLabel}>Colonnes en tuiles sous le titre <span className="font-normal">(nombres, 6 au plus)</span><ColumnsPicker value={layout.codexTiles ?? []} columns={columns} onChange={(codexTiles) => set({ codexTiles: codexTiles.length ? codexTiles : undefined })} disabled={disabled} ariaLabel="Colonnes en tuiles" max={6} /></span>
        <span className={fieldLabel}>Colonnes de renvois (« voir aussi ») <span className="font-normal">(4 au plus)</span><ColumnsPicker value={layout.codexLinks ?? []} columns={columns} onChange={(codexLinks) => set({ codexLinks: codexLinks.length ? codexLinks : undefined })} disabled={disabled} ariaLabel="Colonnes de renvois" max={4} /></span>
        <p className={hintText}>Une valeur qui nomme une fiche de la vue s’ouvre d’un clic ; les autres restent écrites.</p>
        <GaugeSettings ctx={ctx} />
        <p className={hintText}>La jauge se dessine en en-tête de la fiche et en barre dans le sommaire.</p>
      </div>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Star className="size-3.5" />Recto et verso</p>
        <div className="grid gap-2">
          <label className={fieldLabel}>Recto (une carte)<NativeSelect value={layout.codexRecto ?? ""} disabled={disabled} onChange={(event) => set({ codexRecto: event.target.value || undefined, codexVerso: event.target.value ? layout.codexVerso : undefined })} className="h-8 py-0 text-xs"><NativeSelectOption value="">— Pas de recto-verso : la fiche —</NativeSelectOption><NativeSelectOption value={DEFAULT_ITEM_CARD}>La carte à l’étoile de l’onglet</NativeSelectOption>{cards.map((card) => <NativeSelectOption key={card.id} value={card.id}>{card.name}</NativeSelectOption>)}</NativeSelect></label>
          {layout.codexRecto && <label className={fieldLabel}>Verso<NativeSelect value={layout.codexVerso ?? ""} disabled={disabled} onChange={(event) => set({ codexVerso: event.target.value || undefined })} className="h-8 py-0 text-xs"><NativeSelectOption value="">— La même carte —</NativeSelectOption><NativeSelectOption value={DEFAULT_ITEM_CARD}>La carte à l’étoile de l’onglet</NativeSelectOption>{cards.map((card) => <NativeSelectOption key={card.id} value={card.id}>{card.name}</NativeSelectOption>)}</NativeSelect></label>}
        </div>
        <p className={hintText}>Chaque fiche devient une carte qu’un bouton retourne : deux cartes de « Modifier › Cartes », une par face.</p>
      </div>
      <ClickSettings ctx={ctx} />
    </> },
    { key: "toc", label: "Sommaire", icon: <ListTree className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><ListTree className="size-3.5" />Le sommaire et les pages</p>
        <div className="flex flex-wrap items-end gap-3">
          <Toggle checked={Boolean(layout.showToc)} onChange={(showToc) => set({ showToc: showToc || undefined })} disabled={disabled}>Un sommaire</Toggle>
          {layout.showToc && <Choice label="Placé" value={layout.tocPosition ?? "side"} options={[{ value: "side", label: "À côté des fiches" }, { value: "top", label: "Au-dessus" }]} onChange={(tocPosition) => set({ tocPosition: tocPosition === "side" ? undefined : tocPosition })} disabled={disabled} />}
          <Toggle checked={Boolean(layout.codexPages)} onChange={(codexPages) => set({ codexPages: codexPages || undefined })} disabled={disabled} title="Deux fiches face à face, feuilletées ; les sections ne s’appliquent pas">Double page</Toggle>
        </div>
      </div>
      <SectionsSettings ctx={ctx} withAlphabet />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p>
        <Choice label="Style" value={style} options={[{ value: "book", label: "Livre" }, { value: "scroll", label: "Parchemin" }, { value: "plain", label: "Nu" }, { value: "board", label: "Journal de bord" }, { value: "sketch", label: "Croquis" }]} onChange={(codexStyle) => set({ codexStyle: codexStyle === "book" ? undefined : codexStyle })} disabled={disabled} />
        {style === "board" && <ColumnField label="Colonne de la date (en tampon, et l’ordre des entrées)" value={layout.dateColumn} columns={columns} onChange={(dateColumn) => set({ dateColumn })} empty="— Aucune —" disabled={disabled} />}
        {style === "sketch" && <p className={hintText}>L’image d’abord, posée de travers ; le texte et les notes en écriture penchée sur papier pointillé.</p>}
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Marges" value={look.density ?? "normal"} options={densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
          <Choice label="Image" value={look.imageShape ?? "rounded"} options={imageShapeOptions} onChange={(imageShape) => setLook({ imageShape: imageShape === "rounded" ? undefined : imageShape })} disabled={disabled} />
        </div>
        <TitleLook ctx={ctx} />
        <FieldsLook ctx={ctx} />
      </div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} modes={[{ value: "border", label: "Liseré en haut" }, { value: "tint", label: "Teinte" }, { value: "title", label: "Titre coloré" }, { value: "none", label: "Rien" }]} /></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Les réglages d'une vue, en pages propres à son type
// ---------------------------------------------------------------------------

type Page = { key: string; label: string; icon: ReactNode; render: () => ReactNode }

/** Les réglages d'une vue (sa forme déjà choisie), en pages propres à son type. */
export function PresentationKindSettings({ kind, layout, columns, onChange, cards = [], forms = [], stats = [], presentations = {}, optionsOf, disabled = false, element }: {
  kind: PresentationKind
  layout: Presentation
  columns: string[]
  onChange: (layout: Presentation) => void
  cards?: Array<{ id: string; name: string }>
  /** Les formulaires de l'onglet (« principal » : l'étoilé) : l'élément et le détail peuvent en lire un. */
  forms?: Array<{ id: string; name: string }>
  /** Les statistiques de l'index et les vues réglées de l'onglet : le tableau de bord en fait des tuiles. */
  stats?: Array<{ id: string; title: string }>
  presentations?: TabPresentations
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  disabled?: boolean
  /** De quoi faire un élément sur mesure ; absent (bloc de page) : seulement les éléments existants. */
  element?: ElementSource
}) {
  const [page, setPage] = useState("")
  const calendars = useCalendarNames(kind === "calendar" || kind === "timeline")
  const look = layout.look ?? {}
  const set = (changes: Partial<Presentation>) => {
    const next: Presentation = { ...layout, ...changes, kind }
    for (const key of Object.keys(next) as Array<keyof Presentation>) if (next[key] === undefined) delete next[key]
    onChange(next)
  }
  const setLook = (changes: Partial<PresentationLook>) => {
    const next: PresentationLook = { ...look, ...changes }
    for (const key of Object.keys(next) as Array<keyof PresentationLook>) if (next[key] === undefined) delete next[key]
    set({ look: Object.keys(next).length ? next : undefined })
  }
  const ctx: Ctx = { kind, layout, columns, set, setLook, look, cards, forms, stats, presentations, optionsOf, disabled, element }
  const pages = kind === "list" ? ListPages(ctx)
    : kind === "kanban" ? KanbanPages(ctx)
    : kind === "master-detail" ? MasterDetailPages(ctx)
    : kind === "calendar" ? CalendarPages(ctx, calendars)
    : kind === "dashboard" ? DashboardPages(ctx)
    : kind === "gallery" ? GalleryPages(ctx)
    : kind === "timeline" ? TimelinePages(ctx, calendars)
    : kind === "tree" ? TreePages(ctx)
    : CodexPages(ctx)
  const current = pages.find((entry) => entry.key === page) ?? pages[0]
  return <div className="grid content-start gap-3">
    <Tabs ariaLabel="Réglages de la vue" value={current.key} options={pages.map((entry) => ({ value: entry.key, label: entry.label, icon: entry.icon }))} onChange={setPage} />
    {current.render()}
  </div>
}

// ---------------------------------------------------------------------------
// Le panneau (sous les onglets) : les versions de la vue et ses presets
// ---------------------------------------------------------------------------

/** L'identifiant de la version étoilée d'une vue (celle rangée sous son genre). */
export const MAIN_PRESENTATION_ID = "principal"

/** Les versions d'une vue d'un onglet : l'étoilée d'abord, puis les autres. */
export function presentationVersionsOf(value: TabPresentations, kind: PresentationKind) {
  return [{ id: MAIN_PRESENTATION_ID, name: "Vue principale", layout: value[kind] ?? { kind } }, ...namedPresentationsOf(value, kind)]
}

/** La forme de la version choisie d'une vue (l'étoilée si elle n'existe plus). */
export function presentationVersionOf(value: TabPresentations, kind: PresentationKind, id: string): Presentation {
  return (id !== MAIN_PRESENTATION_ID ? namedPresentationsOf(value, kind).find((item) => item.id === id)?.layout : undefined) ?? value[kind] ?? { kind }
}

/** Les vues d'un onglet où la version choisie prend cette forme. */
export function withPresentationVersion(value: TabPresentations, kind: PresentationKind, id: string, layout: Presentation): TabPresentations {
  if (id === MAIN_PRESENTATION_ID || !namedPresentationsOf(value, kind).some((item) => item.id === id)) return { ...value, [kind]: { ...layout, kind } }
  return { ...value, named: (value.named ?? []).map((item) => item.id === id ? { ...item, layout: { ...layout, kind } } : item) }
}

const viewId = () => Math.random().toString(36).slice(2, 10)

/** Le panneau d'une vue, sous les onglets : ses versions (l'étoile, nouvelle, dupliquer…) et ses presets. */
export function PresentationsPanel({ kind, tabName, columns, value, selectedId, onSelect, onChange, presets, onSavePreset, onDeletePreset, otherTabs, onCopyTo, disabled = false }: {
  kind: PresentationKind
  tabName: string
  columns: string[]
  /** Toutes les vues de l'onglet (brouillon compris). */
  value: TabPresentations
  /** La version modifiée. */
  selectedId: string
  onSelect: (id: string) => void
  onChange: (next: TabPresentations) => void
  presets: PresentationPreset[]
  onSavePreset?: (preset: { id?: string; name: string; layout: Presentation }) => Promise<unknown>
  onDeletePreset?: (id: string) => Promise<unknown>
  otherTabs: Array<{ id: string; name: string }>
  /** La version choisie donnée, comme vue à l'étoile, aux onglets cochés. */
  onCopyTo: (tabIds: string[], layout: Presentation) => void
  disabled?: boolean
}) {
  const [dialog, setDialog] = useState<"save" | "copy" | "manage" | null>(null)
  const kindInfo = presentationKinds.find((entry) => entry.value === kind)
  const kindLabel = kindInfo?.label ?? ""
  const versions = presentationVersionsOf(value, kind)
  const selected = versions.find((item) => item.id === selectedId) ?? versions[0]
  const layout = selected.layout
  const named = namedPresentationsOf(value, kind)
  const others = (value.named ?? []).filter((item) => item.layout.kind !== kind)
  const setNamed = (list: NamedPresentation[], main?: Presentation | null) => {
    const next: TabPresentations = { ...value, named: [...others, ...list] }
    if (main === null) delete next[kind]
    else if (main) next[kind] = main
    if (!next.named?.length) delete next.named
    onChange(next)
  }
  const add = (name: string, shape: Presentation) => { const id = viewId(); setNamed([...named, { id, name, layout: { ...shape, kind } }]); onSelect(id) }
  const available = [...builtinPresentationPresets, ...presets].filter((preset) => preset.layout.kind === kind)
  const mine = available.filter((preset) => !preset.builtin)
  const configured = selected.id === MAIN_PRESENTATION_ID ? Boolean(value[kind]) : Object.keys(layout).length > 1
  return <>
    <VariantsPanel
      title={`${kindLabel} de « ${tabName} »`}
      icon={layoutIcons[kind]}
      noun="vue"
      items={versions.map((item) => ({ id: item.id, name: item.name }))}
      selectedId={selected.id}
      starredId={MAIN_PRESENTATION_ID}
      onSelect={onSelect}
      onStar={(id) => {
        // L'étoile passe à cette version : elle devient celle des pages, l'ancienne garde une place nommée.
        const target = named.find((item) => item.id === id)
        if (!target) return
        setNamed([...named.filter((item) => item.id !== id), ...(value[kind] ? [{ id: viewId(), name: "Ancienne vue principale", layout: { ...value[kind]!, kind } }] : [])], target.layout)
        onSelect(MAIN_PRESENTATION_ID)
      }}
      starHint="celle que montrent les pages et le tableau de bord ; les autres se choisissent dans un bloc de page"
      onRename={(id, name) => setNamed(named.map((item) => item.id === id ? { ...item, name } : item))}
      renameable={(id) => id !== MAIN_PRESENTATION_ID}
      onNew={() => add(`${kindLabel} ${named.length + 2}`, { kind })}
      newHint={`Nouvelle version de la vue ${kindLabel}, avec ses réglages d’office`}
      onDuplicate={() => add(`${selected.id === MAIN_PRESENTATION_ID ? kindLabel : selected.name} (copie)`, layout)}
      onRemove={() => { setNamed(named.filter((item) => item.id !== selected.id)); onSelect(MAIN_PRESENTATION_ID) }}
      removable={(id) => id !== MAIN_PRESENTATION_ID}
      full={named.length >= 11}
      presets={available.map((preset) => ({ id: preset.id, name: preset.name, group: preset.builtin ? "Eraser" : "Les tiens" }))}
      onApplyPreset={(id) => {
        const preset = available.find((entry) => entry.id === id)
        if (preset) onChange(withPresentationVersion(value, kind, selected.id, fitLayoutToColumns({ ...layout, ...preset.layout, kind }, columns)))
      }}
      onSavePreset={onSavePreset ? () => setDialog("save") : undefined}
      onCopy={otherTabs.length ? () => setDialog("copy") : undefined}
      copyHint={otherTabs.length ? "Copier cette vue vers d’autres onglets…" : "Cet index n’a pas d’autre onglet"}
      onManagePresets={onDeletePreset && mine.length ? () => setDialog("manage") : undefined}
      disabled={disabled}
      footer={configured && <Button type="button" variant="ghost" size="sm" className="h-7 justify-start text-[11px] text-muted-foreground" disabled={disabled} onClick={() => selected.id === MAIN_PRESENTATION_ID ? setNamed(named, null) : onChange(withPresentationVersion(value, kind, selected.id, { kind }))}><RotateCcw />Revenir aux réglages d’office</Button>}
    />
    {dialog === "save" && onSavePreset && <NamePresetDialog
      title="Enregistrer en preset"
      description={<>Les réglages de cette vue {kindLabel}, pour les reprendre dans n’importe quel index (Forme de base, bloc de page). Les colonnes absentes y sont sautées.</>}
      initialName={selected.id === MAIN_PRESENTATION_ID ? `${kindLabel} · ${tabName}` : selected.name}
      existing={mine}
      onSave={(name, id) => onSavePreset({ id, name, layout })}
      onClose={() => setDialog(null)}
    />}
    {dialog === "copy" && <CopyToTabsDialog
      title={`Copier la vue ${kindLabel} vers d’autres onglets`}
      description="Elle remplace la vue à l’étoile de chaque onglet choisi ; les colonnes absentes y sont retirées."
      tabs={otherTabs}
      onCopy={(ids) => { onCopyTo(ids, layout); setDialog(null) }}
      onClose={() => setDialog(null)}
    />}
    {dialog === "manage" && onDeletePreset && <ManagePresetsDialog
      title={`Presets de ${kindLabel}`}
      description="Tes presets, communs à tous les index. Ceux d’Eraser restent. Supprimer un preset ne change aucune vue."
      presets={mine.map((preset) => ({ id: preset.id, name: preset.name, ...(preset.updatedAt ? { hint: `Enregistré le ${new Date(preset.updatedAt).toLocaleDateString("fr-FR")}` } : {}) }))}
      onRename={onSavePreset ? (id, name) => { const preset = mine.find((entry) => entry.id === id); return preset ? onSavePreset({ id, name, layout: preset.layout }) : Promise.resolve() } : undefined}
      onDelete={onDeletePreset}
      onClose={() => setDialog(null)}
    />}
  </>
}

// ---------------------------------------------------------------------------
// L'éditeur : les réglages et l'aperçu
// ---------------------------------------------------------------------------

const screens = { phone: "24rem", tablet: "44rem", desktop: "100%" } as const
const screenOptions: Array<{ value: keyof typeof screens; label: string; icon: ReactNode; title: string }> = [{ value: "phone", label: "", icon: <Smartphone className="size-3.5" />, title: "Téléphone" }, { value: "tablet", label: "", icon: <Tablet className="size-3.5" />, title: "Tablette" }, { value: "desktop", label: "", icon: <Monitor className="size-3.5" />, title: "Toute la largeur" }]

export function IndexPresentationsEditor({ kind, versionId = MAIN_PRESENTATION_ID, tabName, columns, rows, value, onChange, optionsOf, cards = [], cardColumns = [], forms = [], stats = [], disabled = false }: {
  /** La vue réglée (l'onglet de « Modifier » : Liste, Kanban…). */
  kind: PresentationKind
  /** La version de la vue modifiée (l'étoilée par défaut). */
  versionId?: string
  tabName: string
  /** Les colonnes de l'onglet (sans l'identifiant). */
  columns: string[]
  /** Quelques lignes de l'onglet (en-tête → valeur), pour l'aperçu. */
  rows: Array<Record<string, string>>
  value: TabPresentations
  onChange: (next: TabPresentations) => void
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  /** Les cartes de l'onglet (Modifier › Cartes, brouillon compris) et ses colonnes typées, pour l'aperçu. */
  cards?: CardTemplate[]
  cardColumns?: CardColumn[]
  /** Les formulaires de l'onglet (brouillon compris) : un élément ou un détail « formulaire en lecture » les dessine. */
  forms?: NamedLayout[]
  /** Les statistiques de l'index (Modifier › Stats) : une tuile du tableau de bord en dessine une. */
  stats?: StatDefinition[]
  disabled?: boolean
}) {
  const [screen, setScreen] = useState<keyof typeof screens>("desktop")
  const [starting, setStarting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [bigScreen, setBigScreen] = useState<keyof typeof screens>("desktop")
  const layout: Presentation = presentationVersionOf(value, kind, versionId)
  const setLayout = (next: Presentation) => onChange(withPresentationVersion(value, kind, versionId, next))
  const nameColumn = columns.find((column) => /^nom\b/i.test(column)) ?? columns[0] ?? ""
  const keys = useMemo(() => rows.map((_, index) => String(index)), [rows])
  const specs = useMemo(() => new Map(cardColumns.map((column) => [foldName(column.header), column.spec])), [cardColumns])
  const renderCard = (key: string, cardId: string) => {
    const card = pickCard({ cards }, cardId === DEFAULT_ITEM_CARD ? null : cardId)
    const sample = rows[Number(key)] ?? {}
    const values = new Map(Object.entries(sample).map(([header, cell]) => [foldName(header), cell]))
    return card ? <IndexCard card={card} row={{ value: (header) => values.get(foldName(header)) ?? "", spec: (header) => specs.get(foldName(header)) }} /> : null
  }
  const renderForm = (key: string, formId: string) => {
    const form = forms.find((item) => item.id === formId) ?? forms[0]
    const sample = rows[Number(key)] ?? {}
    const values = new Map(Object.entries(sample).map(([header, cell]) => [foldName(header), cell]))
    return form ? <IndexFormView layout={form.layout} columns={cardColumns.length ? cardColumns : columns.map((header) => ({ header }))} valueOf={(header) => values.get(foldName(header)) ?? ""} compact /> : null
  }
  const kindLabel = presentationKinds.find((entry) => entry.value === kind)?.label ?? ""
  const previewNameOf = (key: string) => (rows[Number(key)]?.[nameColumn] ?? "").replace(/<[^>]+>/g, "").trim()
  const previewValueOf = (key: string, header: string) => rows[Number(key)]?.[header] ?? ""
  // Une statistique de l'index, calculée sur les lignes de l'aperçu (sans ses colonnes regroupées).
  const renderStat = (statId: string) => {
    const stat = stats.find((item) => item.id === statId)
    return stat ? <IndexStats stats={[{ ...stat, pinned: true }]} pinnedOnly single rows={keys} columns={columns} tabs={[tabName]} valueOf={previewValueOf} tabOf={() => tabName} nameOf={previewNameOf} optionsOf={optionsOf ?? (() => [])} canEdit={false} onSave={async () => undefined} /> : null
  }
  const preview = (shown: Presentation, limit?: number) => <IndexPresentation
    layout={shown}
    rows={limit ? keys.slice(0, limit) : keys}
    headers={columns}
    nameOf={(key) => (rows[Number(key)]?.[nameColumn] ?? "").replace(/<[^>]+>/g, "").trim()}
    valueOf={(key, header) => rows[Number(key)]?.[header] ?? ""}
    optionsOf={optionsOf}
    specOf={(header) => specs.get(foldName(header))}
    cardOf={(_rowKey, cardId) => pickCard({ cards }, cardId === DEFAULT_ITEM_CARD ? null : cardId)}
    onOpen={() => undefined}
    renderCard={renderCard}
    renderForm={forms.length ? renderForm : undefined}
    renderStat={stats.length ? renderStat : undefined}
    presentations={value}
    empty="Pas encore de ligne dans cet onglet."
  />
  // Deux volets : les réglages à gauche, l'aperçu à droite, chacun avec sa barre de défilement.
  return <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
    <div className="grid content-start gap-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
      <div className="flex justify-end"><Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={disabled} onClick={() => setStarting(true)} title="Repartir d’une forme de base, remplie avec les colonnes de cet onglet et dessinée sur ses lignes"><Sparkles className="size-3.5" />Forme de base</Button></div>
      <PresentationKindSettings kind={kind} layout={layout} columns={columns} onChange={setLayout} element={cardColumns.length ? { columns: cardColumns, samples: rows, tabCards: cards } : undefined} cards={cards.map((card) => ({ id: card.id, name: card.name }))} forms={forms.map((form) => ({ id: form.id, name: form.name }))} stats={stats.map((stat) => ({ id: stat.id, title: stat.title }))} presentations={value} optionsOf={optionsOf} disabled={disabled} />
    </div>
    <section className="min-w-0 rounded-xl border bg-muted/20 p-3 lg:min-h-0 lg:overflow-auto" aria-label="Aperçu">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Aperçu · {kindLabel} · {rows.length} ligne{rows.length > 1 ? "s" : ""} de « {tabName} »</p><PreviewExpandButton onClick={() => setExpanded(true)} /></span>
        <Segmented ariaLabel="Largeur d’écran simulée" value={screen} options={screenOptions} onChange={setScreen} />
      </div>
      <div className={cn("overflow-auto rounded-lg", screen !== "desktop" && "mx-auto border bg-background/60 p-2")} style={{ maxWidth: screens[screen] }}>
        {preview(layout)}
      </div>
    </section>
    {expanded && <PreviewDialog
      title={`Aperçu · ${kindLabel}`}
      description={`Comme sur une page ou dans un tableau de bord, sur ${rows.length} ligne${rows.length > 1 ? "s" : ""} de « ${tabName} ». Rien ne s’ouvre au clic ici.`}
      tools={<Segmented ariaLabel="Largeur d’écran simulée" value={bigScreen} options={screenOptions} onChange={setBigScreen} />}
      onClose={() => setExpanded(false)}
    >
      <div className={cn("mx-auto", bigScreen !== "desktop" && "rounded-lg border bg-background/60 p-2")} style={{ maxWidth: screens[bigScreen] }}>{preview(layout)}</div>
    </PreviewDialog>}
    {starting && <ViewStarterDialog kind={kind} columns={columns} cardColumns={cardColumns} preview={(shown) => preview(fitLayoutToColumns(shown, columns), 6)} onPick={(picked) => { setLayout(fitLayoutToColumns({ ...picked, kind }, columns)); setStarting(false) }} onClose={() => setStarting(false)} />}
  </div>
}

/**
 * « Forme de base » d'une vue : les formes de départ bâties sur les colonnes de l'onglet, les
 * presets d'Eraser et les presets enregistrés, chacune dessinée sur les premières lignes de
 * l'onglet. En choisir une remplace les réglages de la vue (tout se modifie après).
 */
function ViewStarterDialog({ kind, columns, cardColumns, preview, onPick, onClose }: { kind: PresentationKind; columns: string[]; cardColumns: CardColumn[]; preview: (layout: Presentation) => ReactNode; onPick: (layout: Presentation) => void; onClose: () => void }) {
  const { viewPresets } = useIndexSettings("")
  const starters = useMemo(() => presentationStartersFor(kind, cardColumns.length ? cardColumns : columns.map((header) => ({ header }))), [cardColumns, columns, kind])
  const builtins = builtinPresentationPresets.filter((preset) => preset.layout.kind === kind)
  const saved = viewPresets.filter((preset) => preset.layout.kind === kind)
  const kindLabel = presentationKinds.find((entry) => entry.value === kind)?.label ?? ""
  const tile = (key: string, title: string, hint: string, layout: Presentation) => <button key={key} type="button" onClick={() => onPick(layout)} className="group grid content-start gap-2 rounded-xl border bg-card/70 p-2.5 text-left transition hover:border-primary hover:shadow-md">
    <span className="pointer-events-none block max-h-60 min-h-24 overflow-hidden rounded-lg bg-muted/30 p-2"><span className="block origin-top-left scale-[0.7]" style={{ width: "143%" }}>{preview(layout)}</span></span>
    <span><span className="block text-sm font-semibold">{title}</span><span className="block text-[11px] leading-4 text-muted-foreground">{hint}</span></span>
  </button>
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[min(94vw,1200px)]">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">Forme de base · {kindLabel}</DialogTitle>
        <DialogDescription>Un point de départ, rempli avec les colonnes de cet onglet et dessiné sur ses lignes. Tout se mélange et se modifie ensuite ; les réglages de la vue sont remplacés.</DialogDescription>
      </DialogHeader>
      <section className="grid gap-2">
        <p className={settingsTitle}><Sparkles className="size-3.5" />Formes de départ</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{starters.map((starter) => tile(starter.key, starter.label, starter.hint, starter.layout))}</div>
      </section>
      {builtins.length > 0 && <section className="grid gap-2">
        <p className={settingsTitle}><Star className="size-3.5" />Presets d’Eraser</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{builtins.map((preset) => tile(preset.id, preset.name, "Sans colonne : il se complète avec celles de l’onglet.", preset.layout))}</div>
      </section>}
      <section className="grid gap-2">
        <p className={settingsTitle}><Bookmark className="size-3.5" />Presets enregistrés</p>
        {saved.length
          ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{saved.map((preset) => tile(preset.id, preset.name, `Enregistré${preset.updatedAt ? ` le ${new Date(preset.updatedAt).toLocaleDateString("fr-FR")}` : ""}. Les colonnes absentes ici sont sautées.`, preset.layout))}</div>
          : <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Aucun preset pour l’instant : « Preset » dans le panneau garde une vue pour la reprendre dans n’importe quel index.</p>}
      </section>
    </DialogContent>
  </Dialog>
}
