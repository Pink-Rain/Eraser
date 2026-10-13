"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react"
import { Check, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RefreshCw, Search } from "lucide-react"

import { IndexField, type IndexFieldProps } from "@/components/eraser/index-cells"
import { RichTextToolbar, RichTextToolbarHost, type RichTextTarget } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DEFAULT_LAYOUT_ACCENT, FieldLabel, IndexLayoutView, labelLookOf, largeFieldClass, layoutBackgroundOf } from "@/components/eraser/index-layout-view"
import { LayoutBlockView, type LayoutBlockContext } from "@/components/eraser/index-layout-blocks"
import { richTextPlainText } from "@/components/eraser/rich-text"
import { foldName, normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { arrangeLayout, resolveLayoutColor, type IndexLayout, type LayoutBlock, type LayoutField } from "@/lib/index-layouts"

export type RowSheetField = { key: string; label: string; spec: IndexColumnSpec; value: string; long?: boolean; /** Un bloc de la mise en page (tuiles, inventaire…) à la place d'une colonne. */ block?: LayoutBlock }

/** Les lignes qu'on parcourt depuis la fiche : celles du tableau, dans l'ordre affiché. */
export type RowSheetNavigation = {
  rows: string[]
  labelOf: (rowKey: string) => string
  onGo: (rowKey: string) => void
}

const pictureField = (spec: IndexColumnSpec) => spec.kind === "file" && spec.file?.accept === "image" && !spec.file.multiple

/** Le temps de laisser finir la frappe avant d'enregistrer. */
const SAVE_DELAY = 800

type SaveStatus = "idle" | "saving" | "saved" | "error"

/** Fait sortir le curseur du champ en cours : un texte enrichi enregistre alors ce qui vient d'être tapé. */
function releaseFocus() {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}

/**
 * La fiche d'une ligne : tous ses champs (ceux du tableau et ceux du formulaire
 * seulement), modifiables ensemble. C'est ce qu'ouvre un Nom formulaire dans un index
 * qui n'a pas de fiche dédiée (les créatures gardent la leur).
 *
 * Chaque champ s'enregistre de lui-même, peu après la frappe : il n'y a ni « Enregistrer »
 * ni « Fermer ». Une seule barre de mise en forme, en haut, sert à tous les champs. En bas, « Précédente », « Aller à… » et « Suivante » passent d'une ligne
 * à l'autre sans quitter la fiche.
 */
export function IndexRowSheet({ open, rowKey, title, subtitle, fields, layout, rowFor, renderField, error = "", footer, navigation, onSave, onClose, rowRef, inventoryEndpoint }: {
  open: boolean
  /** La ligne affichée : chaque enregistrement la désigne, même si on est passé à une autre entre-temps. */
  rowKey: string
  title: string
  subtitle?: string
  fields: RowSheetField[]
  /** La mise en page de la fiche de l'onglet (« Modifier » › Mise en page) ; absente : automatique. */
  layout?: IndexLayout | null
  /** Les calculs, tirages et boutons propres à chaque champ de la ligne. */
  rowFor?: (key: string) => IndexFieldProps["row"]
  /** Un champ que la page dessine elle-même (« Classes et rangs » d'un sort) ; `undefined` : le champ ordinaire. */
  renderField?: (field: RowSheetField) => ReactNode | undefined
  error?: string
  footer?: ReactNode
  navigation?: RowSheetNavigation
  /** Enregistre des champs de la ligne `rowKey` ; refusé : lève une erreur (la page en affiche la raison). */
  onSave: (rowKey: string, changes: Record<string, string>) => Promise<void> | void
  onClose: () => void
  /** La ligne (index, identifiant, onglet) : les blocs Inventaire et Bouton de la mise en page en ont besoin. */
  rowRef?: { index: string; id: string; tab?: string }
  /** L'adresse de l'inventaire de la ligne (sinon celle d'office du moteur). */
  inventoryEndpoint?: (row: { index: string; id: string }) => string
}) {
  const [status, setStatus] = useState<SaveStatus>("idle")
  // « Réessayer » : renvoie ce que la fiche n'a pas pu enregistrer.
  const retryRef = useRef<(() => void) | null>(null)
  // Une seule barre de mise en forme, en haut, pour tous les champs (comme le tableau) :
  // elle agit sur le champ où se trouve le curseur.
  const targetRef = useRef<RichTextTarget | null>(null)
  const [toolbarReady, setToolbarReady] = useState(false)
  const toolbarHost = useMemo(() => ({ activate: (target: RichTextTarget) => { targetRef.current = target; setToolbarReady(true) } }), [])
  const id = fields.find((field) => normalizeSpec(field.spec).kind === "id")
  const position = navigation ? navigation.rows.indexOf(rowKey) : -1
  const previous = navigation && position > 0 ? navigation.rows[position - 1] : null
  const next = navigation ? navigation.rows[position + 1] ?? null : null

  function close() {
    // Le champ en cours rend sa saisie ; le corps de la fiche l'enregistre en se fermant.
    releaseFocus()
    onClose()
  }

  function go(target: string | null) {
    if (!target || !navigation) return
    releaseFocus()
    targetRef.current = null
    setToolbarReady(false)
    navigation.onGo(target)
  }

  const background = sheetBackgroundOf(layout, fields)
  return <Dialog open={open} onOpenChange={(value) => { if (!value) close() }}>
    <DialogContent
      className={`flex max-h-[92svh] flex-col gap-4 ${layout?.aside.length ? "sm:max-w-5xl" : "sm:max-w-4xl"}`}
      style={background ? { background } : undefined}
      onKeyDown={(event) => {
        // Alt + ← / → : ligne précédente ou suivante, sans quitter le clavier.
        if (!event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === "ArrowLeft" && previous) { event.preventDefault(); go(previous) }
        if (event.key === "ArrowRight" && next) { event.preventDefault(); go(next) }
      }}
    >
      <DialogHeader>
        <DialogTitle className="font-display text-3xl">{title || "Sans nom"}</DialogTitle>
        {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
      </DialogHeader>
      <div className="-mx-1 flex flex-wrap items-center gap-1 rounded-xl border bg-card/80 px-2 py-1">
        <RichTextToolbar targetRef={targetRef} ready={toolbarReady} />
        {!toolbarReady && <span className="ml-1 text-[11px] text-muted-foreground">Clique dans un champ pour le mettre en forme.</span>}
      </div>
      {/* Une ligne, un corps : passer à une autre ligne enregistre ce qui restait et repart de ses valeurs. */}
      <RichTextToolbarHost.Provider value={toolbarHost}>
        <RowSheetBody key={rowKey} rowKey={rowKey} fields={fields} layout={layout} rowFor={rowFor} renderField={renderField} retryRef={retryRef} onSave={onSave} onStatus={setStatus} rowRef={rowRef} inventoryEndpoint={inventoryEndpoint} />
      </RichTextToolbarHost.Provider>
      {error && <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <DialogFooter className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:justify-normal">
        <span className="flex min-w-0 items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {id?.value ? `ID ${id.value}` : ""}
        </span>
        {navigation && navigation.rows.length > 0 ? <span className="flex items-center justify-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => go(previous)} disabled={!previous} title={previous ? `Précédente : ${navigation.labelOf(previous) || "Sans nom"} (Alt + ←)` : "Première ligne"}><ChevronLeft />Précédente</Button>
          <RowJump navigation={navigation} current={rowKey} position={position} onGo={go} />
          <Button type="button" variant="outline" size="sm" onClick={() => go(next)} disabled={!next} title={next ? `Suivante : ${navigation.labelOf(next) || "Sans nom"} (Alt + →)` : "Dernière ligne"}>Suivante<ChevronRight /></Button>
        </span> : <span />}
        <span className="flex flex-wrap items-center justify-end gap-2">
          {footer}
          {(error || status === "error") && status !== "saving" && <Button type="button" size="sm" variant="outline" onClick={() => retryRef.current?.()} title="Renvoyer ce qui n’a pas été enregistré"><RefreshCw />Réessayer</Button>}
          <SaveIndicator status={error ? "error" : status} />
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Enregistrement…</span>
  if (status === "error") return <span className="flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" />Non enregistré</span>
  if (status === "saved") return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" />Enregistré</span>
  return <span className="text-xs text-muted-foreground">Enregistrement automatique</span>
}

/** « Aller à… » : une recherche parmi les lignes du tableau, ouverte au clic. */
function RowJump({ navigation, current, position, onGo }: { navigation: RowSheetNavigation; current: string; position: number; onGo: (rowKey: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const matches = useMemo(() => {
    if (!open) return []
    const folded = foldName(query)
    return navigation.rows
      .map((key, index) => ({ key, index, label: navigation.labelOf(key) || "Sans nom" }))
      .filter((entry) => !folded || foldName(entry.label).includes(folded))
      .slice(0, 60)
  }, [navigation, open, query])
  const choose = (key: string | undefined) => {
    if (!key) return
    setOpen(false)
    setQuery("")
    if (key !== current) onGo(key)
  }
  return <Popover open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery(""); setActive(0) }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="min-w-36 justify-center tabular-nums" title="Aller à une autre ligne">
        <Search />{position >= 0 ? `${position + 1} / ${navigation.rows.length}` : `${navigation.rows.length} lignes`}
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" className="w-80 p-2">
      <Input
        autoFocus
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0) }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, matches.length - 1)) }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)) }
          if (event.key === "Enter") { event.preventDefault(); choose(matches[active]?.key) }
        }}
        placeholder="Aller à…"
        aria-label="Chercher une ligne"
        className="h-8"
      />
      <div className="mt-1 max-h-72 overflow-y-auto" role="listbox">
        {matches.map((entry, index) => <button
          key={entry.key}
          type="button"
          role="option"
          aria-selected={index === active}
          onMouseEnter={() => setActive(index)}
          onClick={() => choose(entry.key)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${index === active ? "bg-accent text-accent-foreground" : ""} ${entry.key === current ? "font-semibold text-primary" : ""}`}
        >
          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{entry.index + 1}</span>
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        </button>)}
        {!matches.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Aucune ligne ne correspond.</p>}
      </div>
    </PopoverContent>
  </Popover>
}

/**
 * Les champs d'une ligne, enregistrés d'eux-mêmes. Les saisies attendent un court instant
 * (la frappe continue), puis partent l'une après l'autre ; ce qui reste quand on change de
 * ligne ou qu'on ferme la fiche part aussitôt, toujours vers la ligne d'où il vient.
 */
function RowSheetBody({ rowKey, fields, layout, rowFor, renderField, retryRef, onSave, onStatus, rowRef, inventoryEndpoint }: {
  rowKey: string
  fields: RowSheetField[]
  layout?: IndexLayout | null
  rowFor?: (key: string) => IndexFieldProps["row"]
  renderField?: (field: RowSheetField) => ReactNode | undefined
  retryRef: MutableRefObject<(() => void) | null>
  onSave: (rowKey: string, changes: Record<string, string>) => Promise<void> | void
  onStatus: (status: SaveStatus) => void
  rowRef?: { index: string; id: string; tab?: string }
  inventoryEndpoint?: (row: { index: string; id: string }) => string
}) {
  // Ce qui a été saisi ici : la fiche l'affiche tant que la page n'a pas relu la ligne.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const queued = useRef<Record<string, string>>({})
  const timer = useRef<number | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)
  const saveRef = useRef(onSave)
  const statusRef = useRef(onStatus)
  useEffect(() => { saveRef.current = onSave; statusRef.current = onStatus })

  // Ce qui a été refusé : repart avec la prochaine modification, ou avec « Réessayer ».
  const failed = useRef<Record<string, string>>({})
  const flush = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null }
    const changes = { ...failed.current, ...queued.current }
    if (!Object.keys(changes).length) return
    queued.current = {}
    failed.current = {}
    if (mounted.current) statusRef.current("saving")
    chain.current = chain.current
      .then(() => saveRef.current(rowKey, changes))
      .then(
        () => { if (mounted.current && !Object.keys(queued.current).length) statusRef.current("saved") },
        // Refusé : la page dit pourquoi ; la saisie reste affichée pour la reprendre.
        () => {
          // Une saisie plus récente du même champ l'emporte sur celle qui a été refusée.
          failed.current = { ...changes, ...failed.current }
          if (mounted.current) statusRef.current("error")
        },
      )
  }, [rowKey])
  useEffect(() => {
    retryRef.current = flush
    return () => { if (retryRef.current === flush) retryRef.current = null }
  }, [flush, retryRef])

  // Changer de ligne ou fermer : ce qui attendait part tout de suite.
  useEffect(() => {
    mounted.current = true
    statusRef.current("idle")
    return () => { mounted.current = false; flush() }
  }, [flush])

  const valueOf = (field: RowSheetField) => drafts[field.key] ?? field.value
  const change = (field: RowSheetField, value: string) => {
    if (value === valueOf(field)) return
    setDrafts((current) => ({ ...current, [field.key]: value }))
    queued.current = { ...queued.current, [field.key]: value }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY)
  }

  const pictures = fields.filter((field) => pictureField(normalizeSpec(field.spec)))
  const others = fields.filter((field) => !pictureField(normalizeSpec(field.spec)) && normalizeSpec(field.spec).kind !== "id")

  const byLabel = (column: string) => fields.find((item) => foldName(item.label) === foldName(column))
  const readColumn = (column: string) => { const item = byLabel(column); return item ? richTextPlainText(valueOf(item)) : "" }
  // La mise en page : sa couleur d'accent (blocs, couleurs « accent »), le style d'ensemble des libellés.
  const accent = resolveLayoutColor(layout?.accent, DEFAULT_LAYOUT_ACCENT, readColumn)
  const labels = labelLookOf(layout?.look, accent, readColumn)
  const field = (item: RowSheetField, hideLabel = false, placed?: LayoutField) => {
    const own = renderField?.(item)
    return own !== undefined ? <div key={item.key} className={item.long ? "md:col-span-2" : undefined}>{own}</div> : plainField(item, hideLabel, placed)
  }
  // `placed` : ce que la mise en page règle pour le champ (le texte au-dessus, son icône, sa couleur).
  const plainField = (item: RowSheetField, hideLabel: boolean, placed?: LayoutField) => <IndexField
    key={item.key}
    label={placed?.label || item.label}
    labelLook={{ className: labels.className, color: placed?.color ? resolveLayoutColor(placed.color, accent, readColumn) : labels.color, icon: placed?.icon }}
    // Dans la fiche, le nom se modifie : il n'ouvre pas une autre fiche.
    spec={item.spec.kind === "name-form" ? { ...item.spec, kind: "name" } : item.spec}
    value={valueOf(item)}
    long={item.long}
    hideLabel={hideLabel}
    row={rowFor?.(item.key)}
    onChange={(value) => change(item, value)}
  />
  // Une mise en page réglée dans « Modifier » : ses sections, ses lignes et sa colonne latérale.
  // Rangés par le nom de leur colonne (l'index des items désigne ses champs par leur place).
  // Un bloc (tuiles, inventaire, bouton…) devient un champ à part, dessiné par le moteur des blocs.
  const arranged = layout ? arrangeLayout(layout, fields.filter((item) => normalizeSpec(item.spec).kind !== "id"), (item) => item.label, (placed) => ({ key: placed.column, label: placed.label ?? "", spec: { kind: "rich" } as IndexColumnSpec, value: "", block: placed.block })) : null
  const blockContext: LayoutBlockContext = {
    valueOf: readColumn,
    htmlOf: (column) => { const item = byLabel(column); return item ? valueOf(item) : "" },
    accent,
    row: rowRef,
    onChange: (column, value) => { const item = byLabel(column); if (item) change(item, value) },
    inventoryEndpoint,
  }

  return <div className="min-h-0 flex-1 overflow-y-auto pr-1">
    {arranged
      ? <IndexLayoutView
        arranged={arranged}
        readColumn={blockContext.valueOf}
        // Une case à cocher (sans libellé au-dessus) s'aligne sur le bas des champs de sa ligne.
        render={(item, placed) => item.block
          ? <div key={item.key} className="grid gap-1">{!placed.hideLabel && placed.label && <FieldLabel field={placed} fallback="" accent={accent} readColumn={readColumn} look={layout?.look} className="text-xs font-semibold text-muted-foreground" />}<LayoutBlockView block={item.block} ctx={blockContext} /></div>
          : <div className={placed.large ? largeFieldClass : normalizeSpec(item.spec).kind === "checkbox" ? "grid flex-1" : undefined}>{field(item, placed.hideLabel, placed)}</div>}
        renderRest={(rest) => <div className="grid content-start gap-3 md:grid-cols-2">{rest.map((item) => field(item))}</div>}
      />
      : <div className={pictures.length ? "grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]" : ""}>
        <div className="grid content-start gap-3 md:grid-cols-2">{others.map((item) => field(item))}</div>
        {pictures.length > 0 && <div className="grid content-start gap-3">{pictures.map((item) => field(item))}</div>}
      </div>}
    {!fields.length && <p className="py-8 text-center text-sm text-muted-foreground">Aucun champ dans la fiche : règle sa mise en page dans « Modifier ».</p>}
  </div>
}

/** Le fond de la fiche (« Apparence » › style d'ensemble), résolu sur les valeurs de la ligne. */
function sheetBackgroundOf(layout: IndexLayout | null | undefined, fields: RowSheetField[]) {
  if (!layout?.look?.background) return undefined
  const readColumn = (column: string) => richTextPlainText(fields.find((item) => foldName(item.label) === foldName(column))?.value ?? "")
  return layoutBackgroundOf(layout.look, resolveLayoutColor(layout.accent, DEFAULT_LAYOUT_ACCENT, readColumn), readColumn)
}

/**
 * La fiche telle qu'elle s'ouvre, dessinée en place (l'aperçu en grand de « Modifier ») : le
 * même en-tête, la même barre de mise en forme, le même corps, la même largeur. On peut y
 * taper pour essayer : rien n'est enregistré.
 */
export function RowSheetPreview({ title, subtitle, fields, layout, rowRef }: { title: string; subtitle?: string; fields: RowSheetField[]; layout?: IndexLayout | null; rowRef?: { index: string; id: string; tab?: string } }) {
  const retryRef = useRef<(() => void) | null>(null)
  const targetRef = useRef<RichTextTarget | null>(null)
  const [toolbarReady, setToolbarReady] = useState(false)
  const toolbarHost = useMemo(() => ({ activate: (target: RichTextTarget) => { targetRef.current = target; setToolbarReady(true) } }), [])
  const id = fields.find((field) => normalizeSpec(field.spec).kind === "id")
  const background = sheetBackgroundOf(layout, fields)
  return <div className={`mx-auto grid w-full gap-4 rounded-lg border bg-background p-6 text-left shadow-lg ${layout?.aside.length ? "max-w-5xl" : "max-w-4xl"}`} style={background ? { background } : undefined}>
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-3xl leading-none font-semibold">{title || "Sans nom"}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    <div className="-mx-1 flex flex-wrap items-center gap-1 rounded-xl border bg-card/80 px-2 py-1">
      <RichTextToolbar targetRef={targetRef} ready={toolbarReady} />
      {!toolbarReady && <span className="ml-1 text-[11px] text-muted-foreground">Clique dans un champ pour le mettre en forme.</span>}
    </div>
    <RichTextToolbarHost.Provider value={toolbarHost}>
      <RowSheetBody rowKey="apercu" fields={fields} layout={layout} retryRef={retryRef} onSave={() => undefined} onStatus={() => undefined} rowRef={rowRef} />
    </RichTextToolbarHost.Provider>
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
      <span className="font-mono text-[11px] text-muted-foreground">{id?.value ? `ID ${id.value}` : ""}</span>
      <span className="flex items-center justify-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled><ChevronLeft />Précédente</Button>
        <Button type="button" variant="outline" size="sm" disabled>Suivante<ChevronRight /></Button>
      </span>
      <span className="text-right text-xs text-muted-foreground">Aperçu : rien n’est enregistré</span>
    </div>
  </div>
}
