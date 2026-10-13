"use client"

/**
 * « Modifier › Vues » d'un onglet : la liste, le kanban, le maître-détail, le calendrier, le
 * tableau de bord, la galerie, la chronologie, l'arborescence et le codex. Chaque vue a son
 * propre éditeur, avec ses pages et ses réglages (pas les mêmes partout) : ce qu'elle montre,
 * son dessin, ses couleurs et ses icônes. Sous les onglets, le panneau des presets et de la
 * gestion (`ViewsPanel`) ; au centre, les réglages (`ViewKindSettings`) ; à droite, l'aperçu
 * sur les vraies lignes. Les onglets-fenêtres et les pages qui choisissent une de ces vues la
 * montrent avec ces réglages.
 */
import { useMemo, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, BookOpen, BookmarkPlus, Check, Columns3, Copy, Image as ImageIcon, LayoutGrid, LayoutList, ListTree, LoaderCircle, Monitor, Palette, PanelsLeftRight, Plus, RotateCcw, Smartphone, Sparkles, Tablet, Trash2, X } from "lucide-react"

import { IndexCard } from "@/components/eraser/index-card"
import { IndexViewLayout } from "@/components/eraser/index-view-layouts"
import { accentOptions, Choice, ColorSwatches, ColumnField, ColumnsPicker, densityOptions, fieldLabel, fieldStyleOptions, hintText, IconPick, ImageBoxControls, imageShapeOptions, radiusOptions, Range, Segmented, settingsGroup, settingsTitle, SettingsRow, sizeOptions, Tabs, Toggle } from "@/components/eraser/view-editor-controls"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, REAL_CALENDAR } from "@/lib/calendars"
import { pickCard, type CardColumn, type CardTemplate } from "@/lib/index-cards"
import { foldName } from "@/lib/index-columns"
import { builtinViewPresets, dashboardTileKinds, DEFAULT_ITEM_CARD, fitLayoutToColumns, presentationKinds, type DashboardTile, type KanbanLane, type PresentationKind, type TabPresentations, type ViewLayout, type ViewLook, type ViewPreset } from "@/lib/index-view-layouts"
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
  layout: ViewLayout
  columns: string[]
  set: (changes: Partial<ViewLayout>) => void
  setLook: (changes: Partial<ViewLook>) => void
  look: ViewLook
  cards: Array<{ id: string; name: string }>
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  disabled?: boolean
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
    <Choice label="Leurs libellés" value={look.fieldColor ?? "muted"} options={[{ value: "muted", label: "Discrets" }, { value: "accent", label: "À la couleur d’accent" }]} onChange={(fieldColor) => setLook({ fieldColor: fieldColor === "muted" ? undefined : fieldColor })} disabled={disabled} />
  </div>
}

/** La couleur : celle de la vue, celle des lignes (une colonne), et comment elle marque un élément. */
function ColorLook({ ctx, modes = accentOptions, withRows = true }: { ctx: Ctx; modes?: ReadonlyArray<{ value: "border" | "tint" | "dot" | "title" | "none"; label: string }>; withRows?: boolean }) {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return <>
    <span className={fieldLabel}>Couleur d’accent de la vue <span className="font-normal">— sections, points, lignes, tuiles sans couleur propre</span>
      <ColorSwatches value={look.color} onChange={(color) => setLook({ color })} disabled={disabled} none="Or d’Eraser" ariaLabel="Couleur d’accent de la vue" />
    </span>
    {withRows && <div className="grid gap-2 sm:grid-cols-2">
      <ColumnField label="Couleur des lignes selon" value={layout.colorBy} columns={columns} onChange={(colorBy) => set({ colorBy })} empty="— Aucune —" disabled={disabled} hint="Une colonne liste : la couleur de son choix marque chaque ligne" />
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
    <div className="grid gap-2 sm:grid-cols-2">
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
        <Choice label="Menu des sections" value={layout.menu ?? "none"} options={[{ value: "none", label: "Aucun" }, { value: "top", label: "En haut" }, { value: "side", label: "Sur le côté" }]} onChange={(menu) => set({ menu: menu === "none" ? undefined : menu })} disabled={disabled} />
        <span className={fieldLabel}>Icône des sections<IconPick value={look.sectionIcon} onChange={(sectionIcon) => setLook({ sectionIcon })} disabled={disabled} /></span>
      </div>
    </>}
  </div>
}

/** Ce qu'un élément montre : les colonnes sous le nom, l'icône, la pastille, l'image. */
function ItemSettings({ ctx, fieldsLabel = "Sous le nom", withBadge = true, withImage = true, withIcon = true, max = 8 }: { ctx: Ctx; fieldsLabel?: string; withBadge?: boolean; withImage?: boolean; withIcon?: boolean; max?: number }) {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return <div className={settingsGroup}>
    <p className={settingsTitle}><LayoutList className="size-3.5" />Chaque élément</p>
    <span className={fieldLabel}>{fieldsLabel} <span className="font-normal">({max} au plus, dans l’ordre)</span><ColumnsPicker value={layout.fields ?? []} columns={columns} onChange={(fields) => set({ fields: fields.length ? fields : undefined })} disabled={disabled} ariaLabel="Colonnes montrées" max={max} /></span>
    {withIcon && <div className="grid gap-2 sm:grid-cols-2">
      <ColumnField label="Icône devant le nom, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} hint="Une colonne icône (ou un émoji écrit dans une case)" />
      <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe devant chaque nom"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
    </div>}
    {withBadge && <ColumnField label="Pastille à droite du nom, prise dans" value={layout.badgeColumn} columns={columns} onChange={(badgeColumn) => set({ badgeColumn })} empty="— Aucune —" disabled={disabled} hint="Un rang, un type, un état : en pastille, à la couleur du choix" />}
    {withImage && <>
      <SettingsRow>
        <ColumnField label="Image ou icône à côté du nom" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Aucune —" disabled={disabled} hint="Une adresse donne une image, un nom d’icône ou un émoji donne une icône" />
        {layout.imageColumn && <Choice label="Forme" value={look.imageShape ?? "rounded"} options={imageShapeOptions} onChange={(imageShape) => setLook({ imageShape: imageShape === "rounded" ? undefined : imageShape })} disabled={disabled} />}
      </SettingsRow>
      {layout.imageColumn && <ImageBoxControls value={{ widthPct: look.imageWidth, heightPct: look.imageHeight, linked: look.imageLinked }} defaults={{ widthPct: { sm: 24, md: 36, lg: 56 }[look.imageSize ?? "md"], heightPct: { sm: 24, md: 36, lg: 56 }[look.imageSize ?? "md"], edges: [] }} onChange={(changes) => setLook({ ...(changes.widthPct !== undefined ? { imageWidth: changes.widthPct } : {}), ...(changes.heightPct !== undefined ? { imageHeight: changes.heightPct } : {}), ...(changes.linked !== undefined ? { imageLinked: changes.linked || undefined } : {}) })} disabled={disabled} unit="px" widthRange={[12, 240]} heightRange={[12, 240]} withEdges={false} />}
    </>}
  </div>
}

function SortSettings({ ctx }: { ctx: Ctx }) {
  const { layout, set, columns, disabled } = ctx
  return <div className="grid gap-2 sm:grid-cols-2">
    <ColumnField label="Trier par" value={layout.sortBy} columns={columns} onChange={(sortBy) => set({ sortBy, sortDesc: sortBy ? layout.sortDesc : undefined })} empty="— L’ordre de la feuille —" disabled={disabled} />
    {layout.sortBy && <span className={cn(fieldLabel, "self-end pb-1.5")}><Toggle checked={Boolean(layout.sortDesc)} onChange={(sortDesc) => set({ sortDesc: sortDesc || undefined })} disabled={disabled}>Ordre décroissant</Toggle></span>}
  </div>
}

/** Chaque élément dessiné avec une carte de « Modifier › Cartes ». */
function CardChoice({ ctx }: { ctx: Ctx }) {
  const { layout, set, cards, disabled } = ctx
  return <div className="grid gap-1.5 rounded-lg border border-dashed bg-background/50 p-2.5">
    <label className={fieldLabel}>Chaque élément s’affiche
      <NativeSelect value={layout.itemCard ?? ""} disabled={disabled} onChange={(event) => set({ itemCard: event.target.value || undefined })} className="h-8 py-0 text-xs">
        <NativeSelectOption value="">Avec les réglages de cette vue (nom, colonnes, icône, image)</NativeSelectOption>
        <NativeSelectOption value={DEFAULT_ITEM_CARD}>Avec la carte à l’étoile de l’onglet</NativeSelectOption>
        {cards.map((card) => <NativeSelectOption key={card.id} value={card.id}>Avec la carte « {card.name} »</NativeSelectOption>)}
        {layout.itemCard && layout.itemCard !== DEFAULT_ITEM_CARD && !cards.some((card) => card.id === layout.itemCard) && <NativeSelectOption value={layout.itemCard}>Carte retirée (la carte à l’étoile la remplace)</NativeSelectOption>}
      </NativeSelect>
    </label>
    <p className={hintText}>{layout.itemCard ? "La carte se dessine dans « Modifier › Cartes » : image, couleurs, blocs, composition. Une carte changée là change aussi ici." : "Avec une carte, l’élément prend le même visuel que la vue Cartes."}</p>
  </div>
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
      <ItemSettings ctx={ctx} />
      <CardChoice ctx={ctx} />
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
      <LanesEditor ctx={ctx} />
    </> },
    { key: "cards", label: "Cartes", icon: <LayoutGrid className="size-3.5" />, render: () => <><ItemSettings ctx={ctx} /><CardChoice ctx={ctx} /></> },
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
  return [
    { key: "dates", label: "Dates", icon: <LayoutGrid className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><LayoutGrid className="size-3.5" />Le calendrier</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ColumnField label="Colonne de la date" value={layout.dateColumn} columns={columns} onChange={(dateColumn) => set({ dateColumn })} empty="— Choisir… —" disabled={disabled} />
        <label className={fieldLabel}>Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} disabled={disabled} onChange={(event) => set({ calendar: event.target.value })} className="h-8 py-0 text-xs">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
      </div>
      <p className={hintText}>Les calendriers (mois, saisons, jours de la semaine) se créent dans l’Index des calendriers. « 12 Brumaire 1023 » dans la case : la ligne se place à sa date.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Affichage" value={look.calendarMode ?? "month"} options={[{ value: "month", label: "Grille du mois" }, { value: "agenda", label: "Agenda (liste par date)" }]} onChange={(calendarMode) => setLook({ calendarMode: calendarMode === "month" ? undefined : calendarMode })} disabled={disabled} />
        <Toggle checked={Boolean(layout.showUndated)} onChange={(showUndated) => set({ showUndated: showUndated || undefined })} disabled={disabled}>Lister les lignes sans date</Toggle>
      </div>
    </div> },
    { key: "entries", label: "Entrées", icon: <LayoutList className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><LayoutList className="size-3.5" />Les entrées</p>
        {look.calendarMode !== "agenda" && <>
          <Choice label="Dans la grille" value={look.entryStyle ?? "pill"} options={[{ value: "pill", label: "Pastilles" }, { value: "dot", label: "Points" }, { value: "bar", label: "Barres" }]} onChange={(entryStyle) => setLook({ entryStyle: entryStyle === "pill" ? undefined : entryStyle })} disabled={disabled} />
          <Range text="Entrées par jour, au plus" value={layout.maxPerDay ?? 0} min={0} max={12} format={(value) => value ? String(value) : "toutes"} onChange={(value) => set({ maxPerDay: value || undefined })} disabled={disabled} title="Au-delà, « +N » ouvre le reste" />
        </>}
        <div className="grid gap-2 sm:grid-cols-2">
          <ColumnField label="Icône devant chaque entrée, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} />
          <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
        </div>
        {look.calendarMode === "agenda" && <span className={fieldLabel}>Sous le nom (agenda)<ColumnsPicker value={layout.fields ?? []} columns={columns} onChange={(fields) => set({ fields: fields.length ? fields : undefined })} disabled={disabled} ariaLabel="Colonnes montrées" /></span>}
        {look.calendarMode === "agenda" && <ColumnField label="Image à côté du nom (agenda)" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Aucune —" disabled={disabled} />}
      </div>
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Hauteur des jours" value={look.density ?? "normal"} options={[{ value: "compact", label: "Basse" }, { value: "normal", label: "Normale" }, { value: "airy", label: "Haute" }]} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
          <Choice label="En-tête du mois" value={layout.monthStyle ?? "plain"} options={[{ value: "plain", label: "Sobre" }, { value: "season", label: "À la couleur de la saison" }]} onChange={(monthStyle) => set({ monthStyle: monthStyle === "plain" ? undefined : monthStyle })} disabled={disabled} />
          <Toggle checked={!layout.hideSeasons} onChange={(shown) => set({ hideSeasons: shown ? undefined : true })} disabled={disabled}>Afficher la saison</Toggle>
        </div>
        <TitleLook ctx={ctx} />
      </div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} modes={[{ value: "border", label: "Sa couleur" }, { value: "none", label: "Rien" }]} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

function TilesEditor({ ctx }: { ctx: Ctx }) {
  const { layout, set, columns, disabled } = ctx
  const tiles = layout.tiles ?? [{ kind: "count" }]
  const setTile = (position: number, tile: DashboardTile | null) => set({ tiles: tiles.flatMap((item, index) => index === position ? tile ? [tile] : [] : [item]) })
  const move = (position: number, delta: number) => { const next = [...tiles]; const [moved] = next.splice(position, 1); next.splice(position + delta, 0, moved); set({ tiles: next }) }
  return <div className={settingsGroup}>
    <div className="flex items-center justify-between gap-2">
      <p className={settingsTitle}><LayoutGrid className="size-3.5" />Les tuiles</p>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || tiles.length >= 16} onClick={() => set({ tiles: [...tiles, { kind: "breakdown", column: columns[0] }] })}><Plus />Ajouter une tuile</Button>
    </div>
    <div className="grid gap-2">
      {tiles.map((tile, position) => {
        const needsColumn = dashboardTileKinds.find((kind) => kind.value === tile.kind)?.needsColumn
        return <div key={position} className="grid gap-2 rounded-lg border bg-background/70 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <NativeSelect value={tile.kind} disabled={disabled} onChange={(event) => setTile(position, { ...tile, kind: event.target.value as DashboardTile["kind"] })} aria-label="Tuile" className="h-8 min-w-40 flex-1 py-0 text-xs">{dashboardTileKinds.map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}</NativeSelectOption>)}</NativeSelect>
            {needsColumn && <NativeSelect value={tile.column ?? ""} disabled={disabled} onChange={(event) => setTile(position, { ...tile, column: event.target.value || undefined })} aria-label="Colonne" className="h-8 min-w-32 flex-1 py-0 text-xs"><NativeSelectOption value="">Colonne…</NativeSelectOption>{columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect>}
            <span className="flex shrink-0">
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || position === 0} onClick={() => move(position, -1)} aria-label="Avancer la tuile"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || position === tiles.length - 1} onClick={() => move(position, 1)} aria-label="Reculer la tuile"><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-xs" className="text-destructive" disabled={disabled} onClick={() => setTile(position, null)} aria-label="Retirer la tuile"><X /></Button>
            </span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-3">
            <Input value={tile.label ?? ""} disabled={disabled} onChange={(event) => setTile(position, { ...tile, label: event.target.value || undefined })} placeholder="Titre (facultatif)" aria-label="Titre de la tuile" className="h-8 text-xs" />
            <Input value={tile.unit ?? ""} disabled={disabled} maxLength={12} onChange={(event) => setTile(position, { ...tile, unit: event.target.value || undefined })} placeholder="Unité (PO, %, km)" aria-label="Unité" className="h-8 text-xs" />
            <Input value={tile.note ?? ""} disabled={disabled} maxLength={80} onChange={(event) => setTile(position, { ...tile, note: event.target.value || undefined })} placeholder="Une ligne sous le nombre" aria-label="Note" className="h-8 text-xs" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={cn(fieldLabel, "flex-row items-center")}>Icône<IconPick value={tile.icon} onChange={(icon) => setTile(position, { ...tile, icon })} disabled={disabled} /></span>
            <Choice label="Nombre" value={tile.size ?? "md"} options={[{ value: "sm", label: "Petit" }, { value: "md", label: "Moyen" }, { value: "lg", label: "Grand" }]} onChange={(size) => setTile(position, { ...tile, size: size === "md" ? undefined : size })} disabled={disabled} />
            <Toggle checked={Boolean(tile.wide)} onChange={(wide) => setTile(position, { ...tile, wide: wide || undefined })} disabled={disabled}>Tuile large</Toggle>
          </div>
          <ColorSwatches value={tile.color} onChange={(color) => setTile(position, { ...tile, color })} disabled={disabled} none="Accent de la vue" ariaLabel="Couleur de la tuile" />
        </div>
      })}
    </div>
  </div>
}

function DashboardPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, disabled } = ctx
  return [
    { key: "tiles", label: "Tuiles", icon: <LayoutGrid className="size-3.5" />, render: () => <TilesEditor ctx={ctx} /> },
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
const galleryRatioOf = (layout: ViewLayout) => layout.galleryHeightRem ? galleryWidthOf(layout) / layout.galleryHeightRem : layout.galleryRatio ?? { square: 1, portrait: 0.8, landscape: 1.6 }[layout.galleryShape ?? "portrait"]
const galleryWidthOf = (layout: ViewLayout) => layout.galleryWidthRem ?? { sm: 8.5, md: 12, lg: 17 }[layout.gallerySize ?? "md"]

function GalleryPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  const ratio = galleryRatioOf(layout)
  return [
    { key: "images", label: "Images", icon: <ImageIcon className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><ImageIcon className="size-3.5" />Les vignettes</p>
      <ColumnField label="Colonne des images" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Choisir… —" disabled={disabled} />
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
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Image" value={layout.galleryFit ?? "cover"} options={[{ value: "cover", label: "Remplit" }, { value: "contain", label: "Entière" }]} onChange={(galleryFit) => set({ galleryFit: galleryFit === "cover" ? undefined : galleryFit })} disabled={disabled} />
        <Toggle checked={look.imageShape === "circle"} onChange={(circle) => setLook({ imageShape: circle ? "circle" : undefined })} disabled={disabled}>Rondes (médaillons)</Toggle>
        <Toggle checked={!layout.galleryStill} onChange={(zoom) => set({ galleryStill: zoom ? undefined : true })} disabled={disabled}>Zoom au survol</Toggle>
      </div>
    </div> },
    { key: "captions", label: "Légendes", icon: <LayoutList className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><LayoutList className="size-3.5" />Les légendes</p>
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Le nom" value={look.caption ?? "overlay"} options={[{ value: "overlay", label: "Posé sur l’image" }, { value: "below", label: "Sous l’image" }]} onChange={(caption) => setLook({ caption: caption === "overlay" ? undefined : caption })} disabled={disabled} />
        {look.caption !== "below" && <Toggle checked={Boolean(layout.captionOnHover)} onChange={(captionOnHover) => set({ captionOnHover: captionOnHover || undefined })} disabled={disabled}>Seulement au survol</Toggle>}
      </div>
      <TitleLook ctx={ctx} />
      <span className={fieldLabel}>Sous le nom <span className="font-normal">(4 au plus)</span><ColumnsPicker value={layout.fields ?? []} columns={columns} onChange={(fields) => set({ fields: fields.length ? fields : undefined })} disabled={disabled} ariaLabel="Colonnes montrées" max={4} /></span>
      <FieldsLook ctx={ctx} />
      <ColumnField label="Ruban sur l’image, pris dans" value={layout.badgeColumn} columns={columns} onChange={(badgeColumn) => set({ badgeColumn })} empty="— Aucun —" disabled={disabled} hint="Un rang, un type : en ruban dans le coin de la vignette" />
      <div className="grid gap-2 sm:grid-cols-2">
        <ColumnField label="Icône dans le coin, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} />
        <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
      </div>
    </div> },
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
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} modes={[{ value: "border", label: "Liseré sous l’image" }, { value: "tint", label: "Halo" }, { value: "title", label: "Nom coloré" }, { value: "none", label: "Rien" }]} /></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Chronologie
// ---------------------------------------------------------------------------

function TimelinePages(ctx: Ctx, calendars: string[]): Page[] {
  const { layout, set, columns, disabled } = ctx
  return [
    { key: "time", label: "Temps", icon: <LayoutList className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><LayoutList className="size-3.5" />La ligne du temps</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ColumnField label="Colonne de la date (ou de l’année)" value={layout.dateColumn} columns={columns} onChange={(dateColumn) => set({ dateColumn })} empty="— Choisir… —" disabled={disabled} />
        <label className={fieldLabel}>Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} disabled={disabled} onChange={(event) => set({ calendar: event.target.value })} className="h-8 py-0 text-xs">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
      </div>
      <p className={hintText}>Une date du calendrier (« 12 Brumaire 1023 ») ou une année seule (« 1023 »). Les lignes sans date restent listées en dessous.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Disposition" value={layout.timelineSide ?? "alternate"} options={[{ value: "alternate", label: "Des deux côtés" }, { value: "right", label: "D’un seul côté" }]} onChange={(timelineSide) => set({ timelineSide: timelineSide === "alternate" ? undefined : timelineSide })} disabled={disabled} />
        <Choice label="Un jalon par" value={String(layout.milestoneEvery ?? 1)} options={[{ value: "1", label: "An" }, { value: "10", label: "Décennie" }, { value: "100", label: "Siècle" }, { value: "1000", label: "Millénaire" }]} onChange={(value) => set({ milestoneEvery: value === "1" ? undefined : Number(value) as 10 | 100 | 1000 })} disabled={disabled} />
        <Choice label="La date de chaque élément" value={layout.dateStyle ?? "label"} options={[{ value: "label", label: "Écrite au-dessus" }, { value: "badge", label: "En étiquette" }, { value: "hidden", label: "Cachée" }]} onChange={(dateStyle) => set({ dateStyle: dateStyle === "label" ? undefined : dateStyle })} disabled={disabled} />
      </div>
      <span className={fieldLabel}>Icône des jalons<IconPick value={layout.milestoneIcon} onChange={(milestoneIcon) => set({ milestoneIcon })} disabled={disabled} /></span>
    </div> },
    { key: "items", label: "Éléments", icon: <LayoutGrid className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Le long de la ligne</p>
        <Choice label="Chaque élément est marqué par" value={layout.timelineStyle ?? "dots"} options={[{ value: "dots", label: "Un point" }, { value: "icons", label: "Un médaillon à icône" }, { value: "chapters", label: "Un chapitre (grand titre)" }]} onChange={(timelineStyle) => set({ timelineStyle: timelineStyle === "dots" ? undefined : timelineStyle })} disabled={disabled} />
      </div>
      <ItemSettings ctx={ctx} withBadge={false} />
      <CardChoice ctx={ctx} />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p><FrameLook ctx={ctx} surfaces={[{ value: "boxed", label: "Encadrés" }, { value: "plain", label: "Nus" }]} /><TitleLook ctx={ctx} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} /><p className={hintText}>La ligne du temps et les jalons prennent la couleur d’accent de la vue ; chaque point, celle de sa ligne.</p></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Arborescence
// ---------------------------------------------------------------------------

function TreePages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return [
    { key: "tree", label: "Arbre", icon: <ListTree className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><ListTree className="size-3.5" />L’arbre</p>
      <ColumnField label="Colonne du parent" value={layout.parentColumn} columns={columns} onChange={(parentColumn) => set({ parentColumn })} empty="— Choisir… —" disabled={disabled} hint="La case nomme une autre ligne du même onglet (une ville dont « Pays » vaut « Valdor » se range sous Valdor)" />
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Dessin" value={layout.treeStyle ?? "lines"} options={[{ value: "lines", label: "Lignes de liaison" }, { value: "indent", label: "Simple retrait" }, { value: "boxed", label: "Cartes emboîtées" }]} onChange={(treeStyle) => set({ treeStyle: treeStyle === "lines" ? undefined : treeStyle })} disabled={disabled} />
        <Choice label="Espacement" value={look.density ?? "normal"} options={densityOptions} onChange={(density) => setLook({ density: density === "normal" ? undefined : density })} disabled={disabled} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Toggle checked={Boolean(layout.collapsed)} onChange={(collapsed) => set({ collapsed: collapsed || undefined })} disabled={disabled}>Branches repliées à l’ouverture</Toggle>
        <Toggle checked={Boolean(layout.hideCounts)} onChange={(hideCounts) => set({ hideCounts: hideCounts || undefined })} disabled={disabled}>Sans le nombre de lignes</Toggle>
        <Toggle checked={Boolean(layout.rootsAsSections)} onChange={(rootsAsSections) => set({ rootsAsSections: rootsAsSections || undefined })} disabled={disabled}>Les racines en grandes sections</Toggle>
        <Toggle checked={Boolean(layout.depthColors)} onChange={(depthColors) => set({ depthColors: depthColors || undefined })} disabled={disabled}>Une couleur par profondeur</Toggle>
      </div>
    </div> },
    { key: "nodes", label: "Nœuds", icon: <LayoutList className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Icônes</p>
        <div className="flex flex-wrap items-end gap-4">
          <span className={fieldLabel}>Branches (lignes qui ont des enfants)<IconPick value={layout.branchIcon} onChange={(branchIcon) => set({ branchIcon })} disabled={disabled} /></span>
          <span className={fieldLabel}>Feuilles<IconPick value={layout.leafIcon} onChange={(leafIcon) => set({ leafIcon })} disabled={disabled} /></span>
        </div>
        <p className={hintText}>Une colonne icône (ci-dessous) passe avant ces icônes d’office.</p>
      </div>
      <ItemSettings ctx={ctx} fieldsLabel="À droite du nom" />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}><p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p><TitleLook ctx={ctx} sizes={[{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }]} /><FieldsLook ctx={ctx} /></div>
      <div className={settingsGroup}><p className={settingsTitle}><Palette className="size-3.5" />Couleurs</p><ColorLook ctx={ctx} modes={[{ value: "border", label: "Point et nom" }, { value: "tint", label: "Teinte" }, { value: "dot", label: "Point" }, { value: "title", label: "Nom coloré" }, { value: "none", label: "Rien" }]} /></div>
      <div className={settingsGroup}><p className={settingsTitle}>Tri des enfants</p><SortSettings ctx={ctx} /></div>
    </> },
  ]
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function CodexPages(ctx: Ctx): Page[] {
  const { layout, look, set, setLook, columns, disabled } = ctx
  return [
    { key: "sheets", label: "Fiches", icon: <BookOpen className="size-3.5" />, render: () => <div className={settingsGroup}>
      <p className={settingsTitle}><BookOpen className="size-3.5" />Chaque fiche</p>
      <span className={fieldLabel}>Colonnes de chaque fiche <span className="font-normal">(toutes si aucune choisie, 12 au plus)</span><ColumnsPicker value={layout.detailFields ?? []} columns={columns} onChange={(detailFields) => set({ detailFields: detailFields.length ? detailFields : undefined })} disabled={disabled} ariaLabel="Colonnes des fiches" max={12} /></span>
      <p className={hintText}>Les textes longs se lisent en paragraphes ; les valeurs courtes forment l’encadré.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ColumnField label="Image de chaque fiche" value={layout.imageColumn} columns={columns} onChange={(imageColumn) => set({ imageColumn })} empty="— Aucune —" disabled={disabled} />
        {layout.imageColumn && <Choice label="Posée" value={look.codexImage ?? "side"} options={[{ value: "side", label: "Dans l’encadré" }, { value: "banner", label: "En bannière" }]} onChange={(codexImage) => setLook({ codexImage: codexImage === "side" ? undefined : codexImage })} disabled={disabled} />}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Le texte" value={String(layout.proseColumns ?? 1)} options={[{ value: "1", label: "Sur une colonne" }, { value: "2", label: "Sur deux colonnes" }]} onChange={(value) => set({ proseColumns: value === "2" ? 2 : undefined })} disabled={disabled} />
        <Toggle checked={Boolean(look.dropCap)} onChange={(dropCap) => setLook({ dropCap: dropCap || undefined })} disabled={disabled}>Lettrine au premier paragraphe</Toggle>
        <Toggle checked={Boolean(layout.chapterNumbers)} onChange={(chapterNumbers) => set({ chapterNumbers: chapterNumbers || undefined })} disabled={disabled}>Fiches numérotées (chapitres)</Toggle>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ColumnField label="Icône devant le titre, prise dans" value={layout.iconColumn} columns={columns} onChange={(iconColumn) => set({ iconColumn })} empty="— Aucune colonne —" disabled={disabled} />
        <span className={fieldLabel}>{layout.iconColumn ? "Sinon, une icône fixe" : "Une icône fixe"}<IconPick value={layout.itemIcon} onChange={(itemIcon) => set({ itemIcon })} disabled={disabled} /></span>
      </div>
    </div> },
    { key: "toc", label: "Sommaire", icon: <ListTree className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><ListTree className="size-3.5" />Le sommaire</p>
        <div className="flex flex-wrap items-end gap-3">
          <Toggle checked={Boolean(layout.showToc)} onChange={(showToc) => set({ showToc: showToc || undefined })} disabled={disabled}>Un sommaire</Toggle>
          {layout.showToc && <Choice label="Placé" value={layout.tocPosition ?? "side"} options={[{ value: "side", label: "À côté des fiches" }, { value: "top", label: "Au-dessus" }]} onChange={(tocPosition) => set({ tocPosition: tocPosition === "side" ? undefined : tocPosition })} disabled={disabled} />}
        </div>
      </div>
      <SectionsSettings ctx={ctx} withAlphabet />
    </> },
    { key: "look", label: "Apparence", icon: <Palette className="size-3.5" />, render: () => <>
      <div className={settingsGroup}>
        <p className={settingsTitle}><Sparkles className="size-3.5" />Dessin</p>
        <div className="flex flex-wrap items-end gap-3">
          <Choice label="Style" value={layout.codexStyle ?? "book"} options={[{ value: "book", label: "Livre" }, { value: "scroll", label: "Parchemin" }, { value: "plain", label: "Nu" }]} onChange={(codexStyle) => set({ codexStyle: codexStyle === "book" ? undefined : codexStyle })} disabled={disabled} />
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
export function ViewKindSettings({ kind, layout, columns, onChange, cards = [], optionsOf, disabled = false }: {
  kind: PresentationKind
  layout: ViewLayout
  columns: string[]
  onChange: (layout: ViewLayout) => void
  cards?: Array<{ id: string; name: string }>
  optionsOf?: (header: string) => Array<{ value: string; color?: string }>
  disabled?: boolean
}) {
  const [page, setPage] = useState("")
  const calendars = useCalendarNames(kind === "calendar" || kind === "timeline")
  const look = layout.look ?? {}
  const set = (changes: Partial<ViewLayout>) => {
    const next: ViewLayout = { ...layout, ...changes, kind }
    for (const key of Object.keys(next) as Array<keyof ViewLayout>) if (next[key] === undefined) delete next[key]
    onChange(next)
  }
  const setLook = (changes: Partial<ViewLook>) => {
    const next: ViewLook = { ...look, ...changes }
    for (const key of Object.keys(next) as Array<keyof ViewLook>) if (next[key] === undefined) delete next[key]
    set({ look: Object.keys(next).length ? next : undefined })
  }
  const ctx: Ctx = { layout, columns, set, setLook, look, cards, optionsOf, disabled }
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
// Le panneau (sous les onglets) : presets, enregistrer, copier, revenir
// ---------------------------------------------------------------------------

function CopyDialog({ kindLabel, tabs, onCopy, onClose }: { kindLabel: string; tabs: Array<{ id: string; name: string }>; onCopy: (ids: string[]) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<string[]>([])
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Copier la vue « {kindLabel} » vers d’autres onglets</DialogTitle>
        <DialogDescription>Les réglages remplacent ceux de la même vue dans chaque onglet choisi ; les colonnes absentes y sont retirées.</DialogDescription>
      </DialogHeader>
      <div className="grid max-h-72 gap-1 overflow-y-auto">
        {tabs.map((tab) => <label key={tab.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"><Checkbox checked={chosen.includes(tab.id)} onCheckedChange={(checked) => setChosen((current) => checked === true ? [...current, tab.id] : current.filter((id) => id !== tab.id))} />{tab.name}</label>)}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={!chosen.length} onClick={() => onCopy(chosen)}><Copy />Copier</Button>
      </div>
    </DialogContent>
  </Dialog>
}

/** Le panneau d'une vue, sous les onglets : les presets (d'Eraser, les tiens), enregistrer, copier, revenir. */
export function ViewsPanel({ kind, columns, layout, configured, presets, onApply, onReset, onSavePreset, onDeletePreset, otherTabs, onCopyTo, disabled = false }: {
  kind: PresentationKind
  columns: string[]
  layout: ViewLayout
  /** La vue a des réglages enregistrés (ou en brouillon) pour cet onglet. */
  configured: boolean
  presets: ViewPreset[]
  onApply: (layout: ViewLayout) => void
  onReset: () => void
  onSavePreset?: (preset: { name: string; layout: ViewLayout }) => Promise<unknown>
  onDeletePreset?: (id: string) => Promise<unknown>
  otherTabs: Array<{ id: string; name: string }>
  onCopyTo: (tabIds: string[]) => void
  disabled?: boolean
}) {
  const [presetName, setPresetName] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [copying, setCopying] = useState(false)
  const available = [...builtinViewPresets, ...presets].filter((preset) => preset.layout.kind === kind)
  const kindLabel = presentationKinds.find((entry) => entry.value === kind)?.label ?? ""
  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage("")
    try { await task(); setMessage(done) } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Le preset n’a pas pu être enregistré.") }
    setBusy(false)
  }
  return <div className="mt-2 grid gap-1.5 rounded-lg border border-dashed bg-background/40 p-2">
    <p className={`${settingsTitle} px-1`}>{kindLabel}</p>
    <NativeSelect value="" disabled={disabled || busy} onChange={(event) => {
      const preset = available.find((entry) => entry.id === event.target.value)
      if (preset) { onApply(fitLayoutToColumns({ ...layout, ...preset.layout, kind }, columns)); setMessage(`« ${preset.name} » appliqué.`) }
    }} className="h-7 py-0 text-[11px]" aria-label="Appliquer un preset">
      <NativeSelectOption value="">Appliquer un preset…</NativeSelectOption>
      <NativeSelectOptGroup label="Eraser">{available.filter((preset) => preset.builtin).map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name}</NativeSelectOption>)}</NativeSelectOptGroup>
      {available.some((preset) => !preset.builtin) && <NativeSelectOptGroup label="Les tiens">{available.filter((preset) => !preset.builtin).map((preset) => <NativeSelectOption key={preset.id} value={preset.id}>{preset.name}</NativeSelectOption>)}</NativeSelectOptGroup>}
    </NativeSelect>
    {onSavePreset && <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); if (presetName.trim()) void run(async () => { await onSavePreset({ name: presetName.trim(), layout }); setPresetName("") }, "Preset enregistré : proposé dans tous les index.") }}>
      <Input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Nom du preset" maxLength={60} className="h-7 min-w-0 flex-1 text-[11px]" disabled={disabled || busy} aria-label="Nom du preset" />
      <Button type="submit" size="sm" variant="outline" className="h-7 text-[11px]" disabled={disabled || busy || !presetName.trim()} title="Garder ces réglages pour les reprendre dans n’importe quel index">{busy ? <LoaderCircle className="animate-spin" /> : <BookmarkPlus />}Preset</Button>
    </form>}
    <div className="flex flex-wrap gap-1">
      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={disabled || !otherTabs.length} onClick={() => setCopying(true)} title={otherTabs.length ? "Copier ces réglages vers d’autres onglets" : "Cet index n’a pas d’autre onglet"}><Copy />Copier vers…</Button>
      {configured && <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" disabled={disabled} onClick={onReset}><RotateCcw />Réglages d’office</Button>}
    </div>
    {onDeletePreset && available.some((preset) => !preset.builtin) && <details className="text-[11px]">
      <summary className="cursor-pointer text-muted-foreground">Supprimer un de tes presets</summary>
      <ul className="mt-1 space-y-0.5">{available.filter((preset) => !preset.builtin).map((preset) => <li key={preset.id} className="flex items-center justify-between gap-1"><span className="truncate">{preset.name}</span><Button type="button" size="icon-xs" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void run(() => onDeletePreset(preset.id), "Preset supprimé.")} aria-label={`Supprimer ${preset.name}`}><Trash2 /></Button></li>)}</ul>
    </details>}
    {message && <p className="flex items-center gap-1 text-[11px] text-primary"><Check className="size-3" />{message}</p>}
    {copying && <CopyDialog kindLabel={kindLabel} tabs={otherTabs} onClose={() => setCopying(false)} onCopy={(ids) => { onCopyTo(ids); setCopying(false) }} />}
  </div>
}

// ---------------------------------------------------------------------------
// L'éditeur : les réglages et l'aperçu
// ---------------------------------------------------------------------------

const screens = { phone: "24rem", tablet: "44rem", desktop: "100%" } as const

export function IndexViewsEditor({ kind, tabName, columns, rows, value, onChange, optionsOf, cards = [], cardColumns = [], disabled = false }: {
  /** La vue réglée (l'onglet de « Modifier » : Liste, Kanban…). */
  kind: PresentationKind
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
  disabled?: boolean
}) {
  const [screen, setScreen] = useState<keyof typeof screens>("desktop")
  const layout: ViewLayout = value[kind] ?? { kind }
  const setLayout = (next: ViewLayout) => onChange({ ...value, [kind]: { ...next, kind } })
  const nameColumn = columns.find((column) => /^nom\b/i.test(column)) ?? columns[0] ?? ""
  const keys = useMemo(() => rows.map((_, index) => String(index)), [rows])
  const specs = useMemo(() => new Map(cardColumns.map((column) => [foldName(column.header), column.spec])), [cardColumns])
  const renderCard = (key: string, cardId: string) => {
    const card = pickCard({ cards }, cardId === DEFAULT_ITEM_CARD ? null : cardId)
    const sample = rows[Number(key)] ?? {}
    const values = new Map(Object.entries(sample).map(([header, cell]) => [foldName(header), cell]))
    return card ? <IndexCard card={card} row={{ value: (header) => values.get(foldName(header)) ?? "", spec: (header) => specs.get(foldName(header)) }} /> : null
  }
  const kindLabel = presentationKinds.find((entry) => entry.value === kind)?.label ?? ""
  return <div className="grid min-h-0 items-start gap-3 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
    <ViewKindSettings kind={kind} layout={layout} columns={columns} onChange={setLayout} cards={cards.map((card) => ({ id: card.id, name: card.name }))} optionsOf={optionsOf} disabled={disabled} />
    <section className="min-w-0 rounded-xl border bg-muted/20 p-3 xl:sticky xl:top-0 xl:max-h-[calc(94svh-14rem)] xl:self-start xl:overflow-y-auto" aria-label="Aperçu">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Aperçu · {kindLabel} · {rows.length} ligne{rows.length > 1 ? "s" : ""} de « {tabName} »</p>
        <Segmented ariaLabel="Largeur d’écran simulée" value={screen} options={[{ value: "phone", label: "", icon: <Smartphone className="size-3.5" />, title: "Téléphone" }, { value: "tablet", label: "", icon: <Tablet className="size-3.5" />, title: "Tablette" }, { value: "desktop", label: "", icon: <Monitor className="size-3.5" />, title: "Toute la largeur" }]} onChange={setScreen} />
      </div>
      <div className={cn("overflow-auto rounded-lg", screen !== "desktop" && "mx-auto border bg-background/60 p-2")} style={{ maxWidth: screens[screen] }}>
        <IndexViewLayout
          layout={layout}
          rows={keys}
          headers={columns}
          nameOf={(key) => (rows[Number(key)]?.[nameColumn] ?? "").replace(/<[^>]+>/g, "").trim()}
          valueOf={(key, header) => rows[Number(key)]?.[header] ?? ""}
          optionsOf={optionsOf}
          onOpen={() => undefined}
          renderCard={renderCard}
          empty="Pas encore de ligne dans cet onglet."
        />
      </div>
    </section>
  </div>
}
