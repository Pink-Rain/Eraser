"use client"

import { useCallback, useEffect, useState } from "react"
import { AppWindow, ArrowLeft, BookOpen, CalendarDays, ChartColumnBig, Columns3, Filter, Gauge, GitCommitVertical, Images, LayoutGrid, LayoutList, ListTree, LoaderCircle, PanelsLeftRight, Plus, Table2, Trash2, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ColumnPreset, PresetColumn } from "@/lib/index-presets"
import { ALL_SOURCES, describeCondition, viewOperators, type IndexView, type ViewCondition } from "@/lib/index-views"
import type { IndexLayout, LayoutKind, LayoutPreset, TabLayouts } from "@/lib/index-layouts"
import type { CardPreset, CardTemplate, TabCards } from "@/lib/index-cards"
import { forgetResolvedReferences } from "@/components/eraser/reference-store"
import { Checkbox } from "@/components/ui/checkbox"
import { loadWorldIndexData } from "@/components/eraser/index-cells"
import { calendarsFromTables, REAL_CALENDAR } from "@/lib/calendars"
import type { StatColumnGroup, StatDefinition } from "@/lib/index-stats"
import { dashboardTileKinds, DEFAULT_ITEM_CARD, viewLayoutKinds, type DashboardTile, type TabPresentations, type ViewLayout, type ViewLayoutKind, type ViewLook, type ViewPreset } from "@/lib/index-view-layouts"

export const layoutIcons: Record<ViewLayoutKind, LucideIcon> = { table: Table2, cards: LayoutGrid, list: LayoutList, kanban: Columns3, "master-detail": PanelsLeftRight, calendar: CalendarDays, dashboard: Gauge, gallery: Images, timeline: GitCommitVertical, tree: ListTree, codex: BookOpen, stats: ChartColumnBig }

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


/** Un choix parmi quelques boutons (comme l'atelier des cartes). */
function Choice<T extends string>({ label, value, choices, onPick, hint }: { label: string; value: T; choices: Array<[T, string]>; onPick: (value: T) => void; hint?: string }) {
  return <div className="grid min-w-0 gap-1 text-xs font-semibold">
    <span>{label}{hint && <span className="font-normal text-muted-foreground"> · {hint}</span>}</span>
    <span className="inline-flex max-w-full flex-wrap gap-0.5 justify-self-start rounded-lg border bg-muted/30 p-0.5" role="radiogroup" aria-label={label}>
      {choices.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onPick(key)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${value === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{text}</button>)}
    </span>
  </div>
}

const lookKinds = {
  // Ce que chaque vue sait régler dans « Apparence ».
  density: ["list", "kanban", "master-detail", "calendar", "dashboard", "gallery", "timeline", "tree", "codex"],
  surface: ["list", "kanban", "master-detail", "calendar", "timeline", "tree"],
  accent: ["list", "kanban", "master-detail", "calendar", "gallery", "timeline", "tree", "codex"],
  title: ["list", "kanban", "master-detail", "calendar", "dashboard", "gallery", "timeline", "tree", "codex"],
  fields: ["list", "kanban", "master-detail", "calendar", "gallery", "timeline", "tree", "codex"],
  image: ["list", "kanban", "master-detail", "calendar", "gallery", "timeline", "tree", "codex"],
} as const

/**
 * « Apparence » d'une vue : l'atelier de création de la vue elle-même (densité, éléments
 * encadrés ou en lignes, couleur, nom, colonnes, images) et ses réglages propres.
 */
function LookSettings({ layout, onChange }: { layout: ViewLayout; onChange: (layout: ViewLayout) => void }) {
  const look = layout.look ?? {}
  const kind = layout.kind
  const set = (changes: Partial<ViewLook>) => {
    const next: ViewLook = { ...look, ...changes }
    for (const key of Object.keys(next) as Array<keyof ViewLook>) if (next[key] === undefined) delete next[key]
    onChange({ ...layout, look: Object.keys(next).length ? next : undefined })
  }
  const has = (group: keyof typeof lookKinds) => (lookKinds[group] as readonly string[]).includes(kind)
  const agenda = kind === "calendar" && look.calendarMode === "agenda"
  // Le calendrier en grille n'a pas d'éléments à mettre en page : seulement ses entrées.
  const items = kind !== "calendar" || agenda
  return <div className="grid gap-3 rounded-xl border bg-gradient-to-b from-primary/[0.04] to-transparent p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">Apparence</p>{layout.look && <button type="button" onClick={() => onChange({ ...layout, look: undefined })} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Apparence d’office</button>}</div>
    {layout.groupBy && (kind === "list" || kind === "master-detail") && <Choice label="Sections" value={look.sectionStyle ?? "bar"} choices={[["bar", "Trait discret"], ["heading", "Grand titre centré"]]} onPick={(sectionStyle) => set({ sectionStyle: sectionStyle === "bar" ? undefined : sectionStyle })} />}
    {kind === "kanban" && <Choice label="Colonnes du kanban" value={look.laneStyle ?? "plain"} choices={[["plain", "Sobres"], ["tinted", "Teintées"], ["header", "En-tête coloré"]]} onPick={(laneStyle) => set({ laneStyle: laneStyle === "plain" ? undefined : laneStyle })} />}
    {kind === "calendar" && <div className="grid gap-3 sm:grid-cols-2">
      <Choice label="Affichage" value={look.calendarMode ?? "month"} choices={[["month", "Grille du mois"], ["agenda", "Agenda"]]} onPick={(calendarMode) => set({ calendarMode: calendarMode === "month" ? undefined : calendarMode })} />
      {!agenda && <Choice label="Entrées" value={look.entryStyle ?? "pill"} choices={[["pill", "Pastille"], ["dot", "Point"], ["bar", "Barre"]]} onPick={(entryStyle) => set({ entryStyle: entryStyle === "pill" ? undefined : entryStyle })} />}
    </div>}
    {kind === "dashboard" && <Choice label="Tuiles" value={look.tileStyle ?? "plain"} choices={[["plain", "Sobres"], ["accent", "Liseré de couleur"], ["tinted", "Teintées"]]} onPick={(tileStyle) => set({ tileStyle: tileStyle === "plain" ? undefined : tileStyle })} hint="la couleur de chaque tuile se choisit plus haut" />}
    {kind === "gallery" && <Choice label="Nom de l’image" value={look.caption ?? "overlay"} choices={[["overlay", "Posé sur l’image"], ["below", "Dessous"]]} onPick={(caption) => set({ caption: caption === "overlay" ? undefined : caption })} />}
    {kind === "codex" && <div className="grid gap-3 sm:grid-cols-2">
      <Choice label="Image de la fiche" value={look.codexImage ?? "side"} choices={[["side", "Dans l’encadré"], ["banner", "En bannière"]]} onPick={(codexImage) => set({ codexImage: codexImage === "side" ? undefined : codexImage })} />
      <label className="flex items-center gap-2 self-end pb-1.5 text-xs"><Checkbox checked={Boolean(look.dropCap)} onCheckedChange={(checked) => set({ dropCap: checked === true || undefined })} />Lettrine au premier paragraphe</label>
    </div>}
    {kind === "master-detail" && <Choice label="Largeur de la liste" value={look.masterWidth ?? "normal"} choices={[["narrow", "Étroite"], ["normal", "Normale"], ["wide", "Large"]]} onPick={(masterWidth) => set({ masterWidth: masterWidth === "normal" ? undefined : masterWidth })} />}
    <div className="grid gap-3 sm:grid-cols-2">
      {has("density") && <Choice label="Densité" value={look.density ?? "normal"} choices={[["compact", "Serrée"], ["normal", "Normale"], ["airy", "Aérée"]]} onPick={(density) => set({ density: density === "normal" ? undefined : density })} />}
      {has("surface") && items && <Choice label="Éléments" value={look.surface ?? (kind === "list" || kind === "tree" ? "plain" : "boxed")} choices={[["boxed", "Encadrés"], ["plain", "En lignes"]]} onPick={(surface) => set({ surface })} />}
    </div>
    {has("accent") && <Choice label="La couleur marque l’élément par" value={look.accent ?? "border"} choices={[["border", "Un liseré"], ["tint", "Un fond teinté"], ["dot", "Une pastille"], ["title", "Le nom"], ["none", "Rien"]]} onPick={(accent) => set({ accent: accent === "border" ? undefined : accent })} hint={layout.colorBy ? `selon « ${layout.colorBy} »` : "choisis « Couleur des lignes selon » plus bas"} />}
    {has("title") && <div className="grid gap-3 sm:grid-cols-2">
      <Choice label={kind === "dashboard" ? "Chiffres : police" : "Nom : police"} value={look.titleFont ?? (kind === "dashboard" || kind === "codex" || kind === "gallery" ? "display" : "sans")} choices={[["display", "Titre (serif)"], ["sans", "Texte"]]} onPick={(titleFont) => set({ titleFont })} />
      <Choice label={kind === "dashboard" ? "Chiffres : taille" : "Nom : taille"} value={look.titleSize ?? (kind === "codex" || kind === "dashboard" ? "md" : "sm")} choices={[["sm", "S"], ["md", "M"], ["lg", "L"]]} onPick={(titleSize) => set({ titleSize })} />
    </div>}
    {has("fields") && items && <Choice label="Colonnes sous le nom" value={look.fieldStyle ?? "inline"} choices={[["inline", "Texte « Champ : valeur »"], ["labels", "Libellés au-dessus"], ["pills", "Pastilles colorées"], ["stacked", "Valeurs empilées"]]} onPick={(fieldStyle) => set({ fieldStyle: fieldStyle === "inline" ? undefined : fieldStyle })} hint={kind === "codex" ? "dans l’encadré" : undefined} />}
    {has("image") && items && <div className="grid gap-3 sm:grid-cols-2">
      <Choice label="Images : forme" value={look.imageShape ?? "rounded"} choices={[["square", "Carrée"], ["rounded", "Arrondie"], ["circle", "Ronde"]]} onPick={(imageShape) => set({ imageShape: imageShape === "rounded" ? undefined : imageShape })} />
      {kind !== "gallery" && kind !== "codex" && <Choice label="Images : taille" value={look.imageSize ?? (kind === "master-detail" || kind === "tree" ? "sm" : "md")} choices={[["sm", "S"], ["md", "M"], ["lg", "L"]]} onPick={(imageSize) => set({ imageSize })} />}
    </div>}
    {layout.itemCard && ["list", "kanban", "master-detail", "timeline"].includes(kind) && <p className="text-[11px] leading-4 text-muted-foreground">Les éléments sont dessinés par une carte : leur intérieur se règle dans « Modifier › Cartes ». L’apparence règle le reste de la vue.</p>}
  </div>
}

const tilePalette = ["#682522", "#3b5c8a", "#0f7a65", "#8d6618", "#7652b8", "#c84d8c", "#2a95c2", "#5a9418"]

/**
 * La présentation d'une vue : tableau, cartes, liste (compacte, repliable), kanban,
 * maître-détail, calendrier, tableau de bord ; et ses sections. Elle s'enregistre avec la vue.
 */
export function LayoutSettings({ layout, columns, onChange, fixedKind = false, cards }: { layout: ViewLayout; columns: string[]; onChange: (layout: ViewLayout) => void; /** Modifier › Vues : la présentation est déjà choisie, seuls ses réglages se montrent. */ fixedKind?: boolean; /** Les cartes de l'onglet (Modifier › Cartes), pour dessiner chaque élément. */ cards?: Array<{ id: string; name: string }> }) {
  const set = (changes: Partial<ViewLayout>) => onChange({ ...layout, ...changes })
  const calendars = useCalendarNames(layout.kind === "calendar" || layout.kind === "timeline")
  const usesCards = ["list", "kanban", "master-detail", "timeline"].includes(layout.kind)
  const segmented = <T extends string>(label: string, value: T, choices: Array<[T, string]>, onPick: (value: T) => void) => <div className="grid gap-1 text-xs font-semibold">{label}<span className="inline-flex flex-wrap rounded-lg border bg-muted/30 p-0.5" role="radiogroup" aria-label={label}>{choices.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onPick(key)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${value === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{text}</button>)}</span></div>
  const columnSelect = (value: string | undefined, onPick: (value: string | undefined) => void, label: string, none = "Aucune") => <label className="grid gap-1 text-xs font-semibold">{label}<NativeSelect value={value ?? ""} onChange={(event) => onPick(event.target.value || undefined)} className="h-9 text-sm"><NativeSelectOption value="">{none}</NativeSelectOption>{columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect></label>
  const fields = layout.fields ?? []
  const toggleField = (column: string) => set({ fields: fields.includes(column) ? fields.filter((field) => field !== column) : [...fields, column].slice(0, 4) })
  const tiles = layout.tiles ?? [{ kind: "count" }]
  const setTile = (position: number, tile: DashboardTile | null) => set({ tiles: tiles.flatMap((item, index) => index === position ? tile ? [tile] : [] : [item]) })
  return <div className="grid gap-3 rounded-xl border bg-card/60 p-3">
    {!fixedKind && <><p className="text-sm font-medium">Présentation</p>
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Présentation">
      {viewLayoutKinds.map((kind) => { const Icon = layoutIcons[kind.value]; return <button key={kind.value} type="button" role="radio" aria-checked={layout.kind === kind.value} title={kind.hint} onClick={() => set({ kind: kind.value })} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors ${layout.kind === kind.value ? "border-primary bg-primary text-primary-foreground" : "bg-background/60 hover:bg-muted"}`}><Icon className="size-4 shrink-0" />{kind.label}</button> })}
    </div></>}
    <p className="text-xs text-muted-foreground">{viewLayoutKinds.find((kind) => kind.value === layout.kind)?.hint}</p>
    {usesCards && <div className="grid gap-1.5 rounded-lg border border-dashed bg-background/50 p-2.5">
      <label className="grid gap-1 text-xs font-semibold">Chaque élément s’affiche
        <NativeSelect value={layout.itemCard ?? ""} onChange={(event) => set({ itemCard: event.target.value || undefined })} className="h-9 text-sm">
          <NativeSelectOption value="">En ligne simple (nom et colonnes choisies)</NativeSelectOption>
          <NativeSelectOption value={DEFAULT_ITEM_CARD}>Avec la carte par défaut de l’onglet</NativeSelectOption>
          {(cards ?? []).map((card) => <NativeSelectOption key={card.id} value={card.id}>Avec la carte « {card.name} »</NativeSelectOption>)}
          {layout.itemCard && layout.itemCard !== DEFAULT_ITEM_CARD && !(cards ?? []).some((card) => card.id === layout.itemCard) && <NativeSelectOption value={layout.itemCard}>Carte retirée (la carte par défaut la remplace)</NativeSelectOption>}
        </NativeSelect>
      </label>
      <p className="text-[11px] leading-4 text-muted-foreground">{layout.itemCard ? "Les cartes se dessinent et se règlent dans « Modifier › Cartes » : image, couleurs, blocs, badges… Une carte changée là change aussi ici." : "Choisis une carte pour donner aux éléments le même visuel que la vue Cartes."}</p>
    </div>}
    {["list", "cards", "master-detail", "gallery", "codex"].includes(layout.kind) && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.groupBy, (groupBy) => set({ groupBy }), "Ranger en sections par", "Pas de sections")}
      {layout.groupBy && <div className="grid content-end gap-1.5 text-xs">
        <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsible)} onCheckedChange={(checked) => set({ collapsible: checked === true || undefined, collapsed: checked === true ? layout.collapsed : undefined })} />Sections repliables</label>
        {layout.collapsible && <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsed)} onCheckedChange={(checked) => set({ collapsed: checked === true || undefined })} />Repliées à l’ouverture</label>}
      </div>}
    </div>}
    {layout.kind === "list" && <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.compact)} onCheckedChange={(checked) => set({ compact: checked === true || undefined })} />Compacte (une ligne par élément)</label>
      {!layout.compact && !layout.groupBy && <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsible)} onCheckedChange={(checked) => set({ collapsible: checked === true || undefined })} />Lignes repliables (déplier montre tout)</label>}
      {!layout.compact && layout.groupBy && <span className="text-muted-foreground">Avec des sections, les lignes se déplient si les sections sont repliables.</span>}
    </div>}
    {layout.kind === "kanban" && columnSelect(layout.kanbanColumn, (kanbanColumn) => set({ kanbanColumn }), "Une colonne du kanban par valeur de", "Choisir…")}
    {layout.kind === "calendar" && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.dateColumn, (dateColumn) => set({ dateColumn }), "Colonne de la date", "Choisir…")}
      <label className="grid gap-1 text-xs font-semibold">Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} onChange={(event) => set({ calendar: event.target.value })} className="h-9 text-sm">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
      <p className="text-xs text-muted-foreground sm:col-span-2">Les calendriers (mois, saisons, jours de la semaine) se créent dans l’Index des calendriers.</p>
    </div>}
    {layout.kind === "gallery" && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.imageColumn, (imageColumn) => set({ imageColumn }), "Colonne des images", "Choisir…")}
      {segmented("Forme", layout.galleryShape ?? "portrait", [["portrait", "Portrait"], ["square", "Carrée"], ["landscape", "Paysage"]], (galleryShape) => set({ galleryShape: galleryShape === "portrait" ? undefined : galleryShape }))}
      {segmented("Taille", layout.gallerySize ?? "md", [["sm", "Petite"], ["md", "Moyenne"], ["lg", "Grande"]], (gallerySize) => set({ gallerySize: gallerySize === "md" ? undefined : gallerySize }))}
      <label className="flex items-center gap-2 self-end pb-1.5 text-xs"><Checkbox checked={Boolean(layout.captionOnHover)} onCheckedChange={(checked) => set({ captionOnHover: checked === true || undefined })} />Nom seulement au survol</label>
    </div>}
    {layout.kind === "timeline" && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.dateColumn, (dateColumn) => set({ dateColumn }), "Colonne de la date (ou de l’année)", "Choisir…")}
      <label className="grid gap-1 text-xs font-semibold">Calendrier<NativeSelect value={layout.calendar ?? REAL_CALENDAR} onChange={(event) => set({ calendar: event.target.value })} className="h-9 text-sm">{[...new Set([...calendars, ...(layout.calendar ? [layout.calendar] : [])])].map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
      {segmented("Disposition", layout.timelineSide ?? "alternate", [["alternate", "Des deux côtés"], ["right", "D’un seul côté"]], (timelineSide) => set({ timelineSide: timelineSide === "alternate" ? undefined : timelineSide }))}
      <p className="self-end text-[11px] leading-4 text-muted-foreground">Une date du calendrier (« 12 Brumaire 1023 ») ou une année seule (« 1023 ») : un jalon marque chaque nouvelle année.</p>
    </div>}
    {layout.kind === "tree" && <div className="grid gap-2 sm:grid-cols-2">
      {columnSelect(layout.parentColumn, (parentColumn) => set({ parentColumn }), "Colonne du parent", "Choisir…")}
      <div className="grid content-end gap-1.5 text-xs">
        <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.collapsed)} onCheckedChange={(checked) => set({ collapsed: checked === true || undefined })} />Branches repliées à l’ouverture</label>
        <label className="flex items-center gap-2"><Checkbox checked={Boolean(layout.hideCounts)} onCheckedChange={(checked) => set({ hideCounts: checked === true || undefined })} />Sans le nombre de lignes</label>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground sm:col-span-2">La case du parent nomme une autre ligne du même onglet (une ville dont « Pays » vaut « Valdor » se range sous Valdor). Une ligne sans parent connu est une racine.</p>
    </div>}
    {layout.kind === "codex" && <label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(layout.showToc)} onCheckedChange={(checked) => set({ showToc: checked === true || undefined })} />Sommaire à côté des fiches</label>}
    {["list", "kanban", "master-detail", "gallery", "timeline", "tree"].includes(layout.kind) && <div className="grid gap-1.5">
      <span className="text-xs font-semibold">{layout.kind === "gallery" ? "Montrer sous le nom" : layout.kind === "tree" ? "Montrer à droite du nom" : "Montrer sous le nom"} (4 au plus){layout.itemCard && usesCards ? <span className="font-normal text-muted-foreground"> · sans effet sur les cartes</span> : null}</span>
      <div className="flex flex-wrap gap-1">{columns.map((column) => <button key={column} type="button" aria-pressed={fields.includes(column)} onClick={() => toggleField(column)} className={`rounded-full border px-2 py-0.5 text-xs ${fields.includes(column) ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>{column}</button>)}</div>
    </div>}
    {layout.kind === "dashboard" && <div className="grid gap-2">
      {tiles.map((tile, position) => { const needsColumn = dashboardTileKinds.find((kind) => kind.value === tile.kind)?.needsColumn; return <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
        <NativeSelect value={tile.kind} onChange={(event) => setTile(position, { ...tile, kind: event.target.value as DashboardTile["kind"] })} aria-label="Tuile" className="h-9 text-sm">{dashboardTileKinds.map((kind) => <NativeSelectOption key={kind.value} value={kind.value}>{kind.label}</NativeSelectOption>)}</NativeSelect>
        {needsColumn ? <NativeSelect value={tile.column ?? ""} onChange={(event) => setTile(position, { ...tile, column: event.target.value || undefined })} aria-label="Colonne" className="h-9 text-sm"><NativeSelectOption value="">Colonne…</NativeSelectOption>{columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}</NativeSelect> : <span />}
        <Input value={tile.label ?? ""} onChange={(event) => setTile(position, { ...tile, label: event.target.value || undefined })} placeholder="Titre (facultatif)" aria-label="Titre de la tuile" className="h-9" />
        <button type="button" onClick={() => setTile(position, null)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Retirer la tuile"><X className="size-3.5" /></button>
        <div className="col-span-4 -mt-1 flex flex-wrap items-center gap-1 pb-1 text-[11px] text-muted-foreground">
          <span className="mr-1">Couleur</span>
          <button type="button" aria-pressed={!tile.color} onClick={() => setTile(position, { ...tile, color: undefined })} className={`h-5 rounded-full border px-1.5 ${!tile.color ? "border-primary text-foreground" : ""}`}>Aucune</button>
          {tilePalette.map((color) => <button key={color} type="button" aria-label={`Couleur ${color}`} aria-pressed={tile.color === color} onClick={() => setTile(position, { ...tile, color })} className={`size-5 rounded-full border ${tile.color === color ? "ring-2 ring-primary ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}
          <label className="ml-3 flex items-center gap-1.5"><Checkbox checked={Boolean(tile.wide)} onCheckedChange={(checked) => setTile(position, { ...tile, wide: checked === true || undefined })} />Tuile large</label>
        </div>
      </div> })}
      <div><Button type="button" variant="ghost" size="sm" onClick={() => set({ tiles: [...tiles, { kind: "breakdown", column: columns[0] }] })}><Plus />Ajouter une tuile</Button></div>
    </div>}
    {layout.kind !== "stats" && layout.kind !== "table" && layout.kind !== "cards" && <LookSettings layout={layout} onChange={onChange} />}
    {layout.kind !== "stats" && layout.kind !== "table" && layout.kind !== "cards" && <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
      <p className="text-sm font-medium sm:col-span-2">Affichage</p>
      {layout.kind !== "dashboard" && <>
        {columnSelect(layout.sortBy, (sortBy) => set({ sortBy, sortDesc: sortBy ? layout.sortDesc : undefined }), "Trier par", "Ordre de la feuille")}
        {layout.sortBy ? <label className="flex items-center gap-2 self-end pb-2 text-xs"><Checkbox checked={Boolean(layout.sortDesc)} onCheckedChange={(checked) => set({ sortDesc: checked === true || undefined })} />Ordre décroissant</label> : <span />}
        {columnSelect(layout.colorBy, (colorBy) => set({ colorBy }), "Couleur des lignes selon", "Aucune")}
        {layout.kind !== "gallery" && columnSelect(layout.imageColumn, (imageColumn) => set({ imageColumn }), layout.kind === "codex" ? "Image de chaque fiche" : "Image à côté du nom", "Aucune")}
      </>}
      {(layout.groupBy || layout.kind === "kanban") && <label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(layout.hideEmpty)} onCheckedChange={(checked) => set({ hideEmpty: checked === true || undefined })} />Masquer « Sans valeur »</label>}
      {layout.groupBy && <label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(layout.hideCounts)} onCheckedChange={(checked) => set({ hideCounts: checked === true || undefined })} />Sans le nombre de lignes</label>}
      {layout.kind === "list" && <label className="grid gap-1 text-xs font-semibold">Colonnes de la liste<NativeSelect value={String(layout.listColumns ?? 1)} onChange={(event) => set({ listColumns: Number(event.target.value) === 1 ? undefined : Number(event.target.value) as 2 | 3 | 4 | 5 })} className="h-9 text-sm">{[1, 2, 3, 4, 5].map((count) => <NativeSelectOption key={count} value={String(count)}>{["Une", "Deux", "Trois", "Quatre", "Cinq"][count - 1]}</NativeSelectOption>)}</NativeSelect></label>}
      {layout.kind === "kanban" && <label className="grid gap-1 text-xs font-semibold">Largeur des colonnes<NativeSelect value={layout.laneWidth ?? "normal"} onChange={(event) => set({ laneWidth: event.target.value === "normal" ? undefined : event.target.value as "narrow" | "wide" })} className="h-9 text-sm"><NativeSelectOption value="narrow">Serrées</NativeSelectOption><NativeSelectOption value="normal">Normales</NativeSelectOption><NativeSelectOption value="wide">Larges</NativeSelectOption></NativeSelect></label>}
      {layout.kind === "calendar" && <label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(layout.showUndated)} onCheckedChange={(checked) => set({ showUndated: checked === true || undefined })} />Lister les lignes sans date</label>}
      {layout.kind === "dashboard" && <label className="grid gap-1 text-xs font-semibold">Tuiles par rangée<NativeSelect value={String(layout.tileColumns ?? 3)} onChange={(event) => set({ tileColumns: Number(event.target.value) === 3 ? undefined : Number(event.target.value) as 1 | 2 | 4 })} className="h-9 text-sm">{[1, 2, 3, 4].map((count) => <NativeSelectOption key={count} value={String(count)}>{count}</NativeSelectOption>)}</NativeSelect></label>}
      {(layout.kind === "master-detail" || layout.kind === "codex") && <div className="grid gap-1.5 sm:col-span-2">
        <span className="text-xs font-semibold">{layout.kind === "codex" ? "Colonnes de chaque fiche" : "Colonnes du détail"} <span className="font-normal text-muted-foreground">(toutes si aucune choisie, 12 au plus)</span></span>
        <div className="flex flex-wrap gap-1">{columns.map((column) => { const chosen = (layout.detailFields ?? []).includes(column); return <button key={column} type="button" aria-pressed={chosen} onClick={() => set({ detailFields: chosen ? (layout.detailFields ?? []).filter((field) => field !== column) : [...(layout.detailFields ?? []), column].slice(0, 12) })} className={`rounded-full border px-2 py-0.5 text-xs ${chosen ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>{column}</button> })}</div>
      </div>}
    </div>}
  </div>
}

type Settings = { views: IndexView[]; presets: ColumnPreset[]; layouts: Record<string, TabLayouts>; layoutPresets: LayoutPreset[]; cards: Record<string, TabCards>; cardPresets: CardPreset[]; presentations: Record<string, TabPresentations>; viewPresets: ViewPreset[]; stats: StatDefinition[]; statGroups: StatColumnGroup[] }

const emptySettings: Settings = { views: [], presets: [], layouts: {}, layoutPresets: [], cards: {}, cardPresets: [], presentations: {}, viewPresets: [], stats: [], statGroups: [] }

// Gardés d'un affichage à l'autre : revenir sur un index montre aussitôt ses fenêtres.
const known = new Map<string, Settings>()

async function postSettings(body: Record<string, unknown>) {
  const response = await fetch("/api/resources/index-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as Partial<Settings> & { id?: string; error?: string }
  if (!response.ok) throw new Error(payload.error || "Le réglage n’a pas pu être enregistré.")
  return payload
}

/** Les onglets-fenêtres d'un index et les presets d'onglets (partagés par tous les index). */
export function useIndexSettings(index: string) {
  const [settings, setSettings] = useState<Settings>(() => known.get(index) ?? emptySettings)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch(`/api/resources/index-settings?index=${encodeURIComponent(index)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as Partial<Settings> & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) { setError(payload.error || ""); return }
        const next = { views: payload.views ?? [], presets: payload.presets ?? [], layouts: payload.layouts ?? {}, layoutPresets: payload.layoutPresets ?? [], cards: payload.cards ?? {}, cardPresets: payload.cardPresets ?? [], presentations: payload.presentations ?? {}, viewPresets: payload.viewPresets ?? [], stats: payload.stats ?? [], statGroups: payload.statGroups ?? [] }
        known.set(index, next)
        setSettings(next)
      })
      .catch(() => { if (active) setError("Les onglets-fenêtres n’ont pas pu être chargés.") })
    return () => { active = false }
  }, [index])
  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes }
      known.set(index, next)
      return next
    })
  }, [index])
  const saveView = useCallback(async (view: Omit<IndexView, "id" | "position"> & { id?: string }) => {
    const payload = await postSettings({ action: "save-view", ...view })
    if (payload.views) update({ views: payload.views })
    return payload.id ?? ""
  }, [update])
  /** Les mises en page (fiche, survol) d'onglets de cet index ; `null` : l'affichage automatique. */
  const saveLayouts = useCallback(async (changes: Array<{ tab: string; form: IndexLayout | null; hover: IndexLayout | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-layouts", index, changes })
    if (payload.layouts) update({ layouts: payload.layouts })
    // Le survol a pu changer : les lignes citées déjà lues sont relues.
    forgetResolvedReferences()
  }, [index, update])
  const deleteView = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-view", id, index })
    if (payload.views) update({ views: payload.views })
  }, [index, update])
  const savePreset = useCallback(async (preset: { id?: string; name: string; description?: string; columns: PresetColumn[] }) => {
    const payload = await postSettings({ action: "save-preset", ...preset })
    if (payload.presets) update({ presets: payload.presets })
    return payload.id ?? ""
  }, [update])
  const deletePreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-preset", id })
    if (payload.presets) update({ presets: payload.presets })
  }, [update])
  /** Les presets de mise en page (fiche ou survol), communs à tous les index. */
  const saveLayoutPreset = useCallback(async (preset: { id?: string; name: string; kind: LayoutKind; layout: IndexLayout }) => {
    const payload = await postSettings({ action: "save-layout-preset", ...preset })
    if (payload.layoutPresets) update({ layoutPresets: payload.layoutPresets })
    return payload.id ?? ""
  }, [update])
  const deleteLayoutPreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-layout-preset", id })
    if (payload.layoutPresets) update({ layoutPresets: payload.layoutPresets })
  }, [update])
  /** Les cartes d'onglets de cet index ; `null` : l'onglet revient aux cartes d'Eraser. */
  const saveCards = useCallback(async (changes: Array<{ tab: string; cards: TabCards | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-cards", index, changes })
    if (payload.cards) update({ cards: payload.cards })
  }, [index, update])
  /** Les vues (liste, kanban…) d'onglets de cet index ; `null` : l'onglet revient aux réglages d'office. */
  const savePresentations = useCallback(async (changes: Array<{ tab: string; presentations: TabPresentations | null }>) => {
    if (!changes.length) return
    const payload = await postSettings({ action: "save-presentations", index, changes })
    if (payload.presentations) update({ presentations: payload.presentations })
  }, [index, update])
  /** Les statistiques de cet index (Modifier › Stats), enregistrées toutes ensemble, et ses colonnes regroupées si elles sont données. */
  const saveStats = useCallback(async (stats: StatDefinition[], groups?: StatColumnGroup[]) => {
    const payload = await postSettings({ action: "save-stats", index, stats, ...(groups ? { groups } : {}) })
    if (payload.stats) update({ stats: payload.stats, ...(payload.statGroups ? { statGroups: payload.statGroups } : {}) })
  }, [index, update])
  /** Les presets de vues, communs à tous les index. */
  const saveViewPreset = useCallback(async (preset: { id?: string; name: string; layout: ViewLayout }) => {
    const payload = await postSettings({ action: "save-view-preset", ...preset })
    if (payload.viewPresets) update({ viewPresets: payload.viewPresets })
    return payload.id ?? ""
  }, [update])
  const deleteViewPreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-view-preset", id })
    if (payload.viewPresets) update({ viewPresets: payload.viewPresets })
  }, [update])
  /** Les presets de cartes, communs à tous les index. */
  const saveCardPreset = useCallback(async (preset: { id?: string; name: string; card: CardTemplate }) => {
    const payload = await postSettings({ action: "save-card-preset", ...preset })
    if (payload.cardPresets) update({ cardPresets: payload.cardPresets })
    return payload.id ?? ""
  }, [update])
  const deleteCardPreset = useCallback(async (id: string) => {
    const payload = await postSettings({ action: "delete-card-preset", id })
    if (payload.cardPresets) update({ cardPresets: payload.cardPresets })
  }, [update])
  return { ...settings, error, saveView, deleteView, savePreset, deletePreset, saveLayouts, saveLayoutPreset, deleteLayoutPreset, saveCards, saveCardPreset, deleteCardPreset, savePresentations, saveViewPreset, deleteViewPreset, saveStats }
}

const emptyCondition = (column: string): ViewCondition => ({ column, operator: "est", value: "" })

/**
 * Créer ou modifier un onglet-fenêtre : son nom, d'où il prend ses lignes (tout l'index
 * ou un onglet) et ses conditions. Les lignes ne sont jamais copiées.
 */
export function IndexViewDialog({ open, onOpenChange, index, view, sources, columnsOf, onSave, onDelete, allowStats = false }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: IndexView | null
  /** Les sources possibles : la valeur (« * » ou un onglet) et son libellé. */
  sources: Array<{ value: string; label: string }>
  /** Les colonnes proposées pour les conditions, selon la source choisie. */
  columnsOf: (source: string) => string[]
  onSave: (view: Omit<IndexView, "id" | "position"> & { id?: string }) => Promise<string>
  onDelete?: (id: string) => Promise<void>
  /** Un nouvel onglet peut être un onglet stat (le moteur des index sait l'afficher). */
  allowStats?: boolean
}) {
  // Nouvel onglet : d'abord le choix entre onglet fenêtre et onglet stat.
  const [kind, setKind] = useState<"window" | "stats" | null>(() => view ? view.layout?.kind === "stats" ? "stats" : "window" : allowStats ? null : "window")
  if (kind === null) return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Nouvel onglet</DialogTitle>
        <DialogDescription className="sr-only">Choisir le genre d’onglet à créer.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { value: "window", Icon: AppWindow, label: "Onglet fenêtre", hint: "Le tableau, seulement avec les lignes qui remplissent tes conditions." },
          { value: "stats", Icon: ChartColumnBig, label: "Onglet stat", hint: "Des chiffres, barres et tableaux croisés sur l’index." },
        ] as const).map((choice) => <button key={choice.value} type="button" autoFocus={choice.value === "window"} onClick={() => setKind(choice.value)} className="group grid justify-items-start gap-2 rounded-xl border bg-card/70 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring">
          <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><choice.Icon className="size-6" /></span>
          <span className="font-display text-lg font-semibold">{choice.label}</span>
          <span className="text-xs text-muted-foreground">{choice.hint}</span>
        </button>)}
      </div>
    </DialogContent>
  </Dialog>
  if (kind === "stats") return <StatsTabDialog open={open} onOpenChange={onOpenChange} index={index} view={view} onBack={view ? undefined : () => setKind(null)} onSave={onSave} onDelete={onDelete} />
  return <WindowViewDialog open={open} onOpenChange={onOpenChange} index={index} view={view} sources={sources} columnsOf={columnsOf} onSave={onSave} onDelete={onDelete} onBack={!view && allowStats ? () => setKind(null) : undefined} />
}

/** Un onglet stat : son nom ; ses statistiques se règlent dans l'onglet même. */
function StatsTabDialog({ open, onOpenChange, index, view, onBack, onSave, onDelete }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: IndexView | null
  onBack?: () => void
  onSave: (view: Omit<IndexView, "id" | "position"> & { id?: string }) => Promise<string>
  onDelete?: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(view?.name ?? "")
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  async function save() {
    setPending("save"); setError("")
    try {
      // Ses statistiques (la présentation) restent telles quelles : seul le nom change ici.
      await onSave({ id: view?.id, index, name, source: view?.source ?? ALL_SOURCES, match: view?.match ?? "toutes", conditions: view?.conditions ?? [], layout: view?.layout?.kind === "stats" ? view.layout : { kind: "stats" } })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’onglet stat n’a pas pu être enregistré.")
    }
    setPending("")
  }
  async function remove() {
    if (!view || !onDelete || !window.confirm(`Supprimer l’onglet stat « ${view.name} » et ses statistiques ? Les lignes de l’index ne sont pas touchées.`)) return
    setPending("delete"); setError("")
    try { await onDelete(view.id); onOpenChange(false) } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending("")
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ChartColumnBig className="size-4 text-primary" />{view ? "Modifier l’onglet stat" : "Nouvel onglet stat"}</DialogTitle>
        <DialogDescription className="sr-only">Le nom de l’onglet stat.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !pending) void save() }}>
        <label className="grid gap-1.5 text-sm font-medium">Nom de l’onglet<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Statistiques, Raretés…" autoFocus /></label>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {onBack && <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}><ArrowLeft />Retour</Button>}
          {view && onDelete && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => void remove()}>{pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="submit" disabled={Boolean(pending) || !name.trim()}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <ChartColumnBig />}{view ? "Enregistrer" : "Créer"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

function WindowViewDialog({ open, onOpenChange, index, view, sources, columnsOf, onSave, onDelete, onBack }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string
  view?: IndexView | null
  sources: Array<{ value: string; label: string }>
  columnsOf: (source: string) => string[]
  onSave: (view: Omit<IndexView, "id" | "position"> & { id?: string }) => Promise<string>
  onDelete?: (id: string) => Promise<void>
  onBack?: () => void
}) {
  const [name, setName] = useState(view?.name ?? "")
  const [source, setSource] = useState(view?.source ?? ALL_SOURCES)
  const [match, setMatch] = useState<IndexView["match"]>(view?.match ?? "toutes")
  const columns = columnsOf(source)
  const [conditions, setConditions] = useState<ViewCondition[]>(() => view?.conditions.length ? view.conditions : [emptyCondition(columns.find((column) => /^type$/i.test(column)) ?? columns[0] ?? "")])
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")

  function change(position: number, changes: Partial<ViewCondition>) {
    setConditions((current) => current.map((condition, index) => index === position ? { ...condition, ...changes } : condition))
  }

  async function save() {
    setPending("save"); setError("")
    try {
      // Un onglet-fenêtre est le tableau filtré : il n'a pas de présentation à lui (kanban, liste… se
      // posent dans une page). Une présentation d'avant se retire en l'enregistrant.
      await onSave({ id: view?.id, index, name, source, match, conditions: conditions.filter((condition) => condition.column) })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’onglet-fenêtre n’a pas pu être enregistré.")
    }
    setPending("")
  }

  async function remove() {
    if (!view || !onDelete || !window.confirm(`Supprimer l’onglet-fenêtre « ${view.name} » ? Les lignes qu’il affiche ne sont pas touchées.`)) return
    setPending("delete"); setError("")
    try { await onDelete(view.id); onOpenChange(false) } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible.") }
    setPending("")
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Filter className="size-4 text-primary" />{view ? "Modifier la vue" : "Nouvelle vue"}</DialogTitle>
        <DialogDescription>Un onglet-fenêtre : le tableau, avec seulement les lignes qui remplissent les conditions. Rien n’est copié : une case modifiée ici l’est dans son onglet d’origine.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Nom de l’onglet<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Runes, Armes légendaires…" autoFocus /></label>
        <label className="grid gap-1.5 text-sm font-medium">Chercher les lignes dans
          <NativeSelect value={source} onChange={(event) => setSource(event.target.value)}>
            {sources.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
          </NativeSelect>
        </label>
      </div>
      <div className="grid gap-2 rounded-xl border bg-card/60 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Afficher les lignes qui remplissent</span>
          <NativeSelect value={match} onChange={(event) => setMatch(event.target.value === "une" ? "une" : "toutes")} className="h-8 w-auto text-sm">
            <NativeSelectOption value="toutes">toutes les conditions</NativeSelectOption>
            <NativeSelectOption value="une">au moins une condition</NativeSelectOption>
          </NativeSelect>
        </div>
        {conditions.map((condition, position) => {
          const operator = viewOperators.find((candidate) => candidate.value === condition.operator)
          return <div key={position} className="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,1fr)_2rem] items-center gap-2">
            <NativeSelect value={condition.column} onChange={(event) => change(position, { column: event.target.value })} aria-label="Colonne" className="h-9 text-sm">
              {!columns.includes(condition.column) && condition.column && <NativeSelectOption value={condition.column}>{condition.column}</NativeSelectOption>}
              {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect value={condition.operator} onChange={(event) => change(position, { operator: event.target.value as ViewCondition["operator"] })} aria-label="Comparaison" className="h-9 text-sm">
              {viewOperators.map((candidate) => <NativeSelectOption key={candidate.value} value={candidate.value}>{candidate.label}</NativeSelectOption>)}
            </NativeSelect>
            {operator?.needsValue ? <Input value={condition.value} onChange={(event) => change(position, { value: event.target.value })} placeholder="Valeur" aria-label="Valeur" className="h-9" /> : <span />}
            <button type="button" onClick={() => setConditions((current) => current.filter((_, index) => index !== position))} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Retirer la condition"><X className="size-3.5" /></button>
          </div>
        })}
        <div><Button type="button" variant="ghost" size="sm" onClick={() => setConditions((current) => [...current, emptyCondition(columns[0] ?? "")])}><Plus />Ajouter une condition</Button></div>
        {!conditions.length && <p className="text-xs text-muted-foreground">Sans condition, la fenêtre montre toutes les lignes de la source.</p>}
        {conditions.length > 0 && <p className="text-xs text-muted-foreground">{conditions.filter((condition) => condition.column).map(describeCondition).join(match === "une" ? " ou " : " et ")}</p>}
      </div>
      <p className="text-xs text-muted-foreground">L’onglet-fenêtre montre le tableau (ou les cartes, comme les autres onglets), seulement avec ces lignes. Un kanban, une liste ou une galerie se posent dans une page (bloc Vue d’index).</p>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onBack && <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}><ArrowLeft />Retour</Button>}
        {view && onDelete && <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={Boolean(pending)} onClick={() => void remove()}>{pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Supprimer</Button>}
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="button" disabled={Boolean(pending) || !name.trim()} onClick={() => void save()}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <Filter />}Enregistrer</Button>
      </div>
    </DialogContent>
  </Dialog>
}
