"use client"

/**
 * L'affichage des items réglé dans « Index des items › Modifier › Affichage des items »
 * (lib/item-display.ts), côté page : les réglages du lecteur et la valeur des colonnes qu'ils
 * placent (GET /api/items/display), puis le dessin d'une zone.
 *
 * Les réglages sont gardés en mémoire pour toute la session (et le dernier reçu dans le
 * navigateur, pour le premier affichage) : un inventaire s'affiche aussitôt, sans attendre.
 * Relus en arrière-plan passé une minute, et dès que l'Index des items change.
 */
import Link from "next/link"
import { Settings2 } from "lucide-react"
import { useSyncExternalStore, type ReactNode } from "react"

import { useOptionalShellData } from "@/components/eraser/app-shell"
import { columnStyleCss } from "@/components/eraser/index-style"
import { ObjectText, ObjectTraits } from "@/components/eraser/object-combat-details"
import { matchChoice } from "@/lib/index-columns"
import type { ObjectCombatFields, ObjectTraitLook } from "@/lib/inventory-schema"
import { isItemTrait, itemDisplayForViewer, itemFieldStyle, itemListValues, knownItemField, parseItemDisplaySettings, type ItemDisplayField, type ItemDisplaySettings, type ItemFieldKey, type ItemPlace, type ItemPlaceDisplay, type ItemTraitKey } from "@/lib/item-display"
import { OBJECTS_INDEX_KEY } from "@/lib/world-index-definitions"
import { onWorldIndexChange } from "@/lib/world-index-events"
import { cn } from "@/lib/utils"

/** Une valeur de colonne : son texte, et sa mise en forme quand elle en a une. */
export type ItemColumnValue = { t: string; h?: string }

export type ItemDisplayState = {
  settings: Required<ItemDisplaySettings>
  /** Les colonnes placées, par identifiant d'item. */
  values: Record<string, Record<string, ItemColumnValue>>
  /** L'allure de chaque colonne placée (style imposé, couleurs, unité). */
  looks: Record<string, ObjectTraitLook>
  /** Quand la réponse est arrivée (0 : jamais). */
  at: number
}

// ---------------------------------------------------------------------------
// Les réglages du lecteur, gardés pour la session
// ---------------------------------------------------------------------------

const STORAGE_KEY = "eraser:item-display"
const STALE_MS = 60_000
const fallback: ItemDisplayState = { settings: itemDisplayForViewer({}, "mj"), values: {}, looks: {}, at: 0 }

function seed(): ItemDisplayState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    // Les derniers réglages reçus, tels quels (le serveur les avait déjà taillés pour ce lecteur).
    if (raw) return { ...fallback, settings: { ...fallback.settings, ...parseItemDisplaySettings(raw) } }
  } catch { /* Stockage du navigateur indisponible : l'affichage d'Eraser. */ }
  return fallback
}

let state: ItemDisplayState | null = null
let loading: Promise<void> | null = null
let watching = false
const listeners = new Set<() => void>()

function current() {
  if (!state) state = typeof window === "undefined" ? fallback : seed()
  return state
}

function emit() {
  for (const listener of listeners) listener()
}

function load() {
  if (loading) return loading
  loading = fetch("/api/items/display", { cache: "no-store" })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as { settings?: unknown; values?: ItemDisplayState["values"]; looks?: ItemDisplayState["looks"] } | null
      if (!response.ok || !payload?.settings) return
      const settings = { ...fallback.settings, ...parseItemDisplaySettings(payload.settings) }
      state = { settings, values: payload.values ?? {}, looks: payload.looks ?? {}, at: Date.now() }
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Rien à garder : la prochaine ouverture attendra la réponse. */ }
      emit()
    })
    .catch(() => undefined)
    .finally(() => { loading = null })
  return loading
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!watching) {
    watching = true
    // L'Index des items modifié (ici ou dans une autre fenêtre) : ses valeurs sont relues.
    onWorldIndexChange((keys) => { if (keys.includes(OBJECTS_INDEX_KEY) && listeners.size) void load() })
  }
  if (Date.now() - current().at > STALE_MS) void load()
  return () => { listeners.delete(listener) }
}

/** Les réglages du lecteur et les valeurs des colonnes qu'ils placent. */
export function useItemDisplay(): ItemDisplayState {
  return useSyncExternalStore(subscribe, current, () => fallback)
}

/** Relit l'affichage (après l'avoir enregistré) : les pages ouvertes le reprennent aussitôt. */
export function reloadItemDisplay() {
  return load()
}

/** Les valeurs des colonnes placées d'un item (identifiant d'inventaire ou de magasin). */
export function itemValuesOf(display: Pick<ItemDisplayState, "values">, id: string | undefined) {
  if (!id) return undefined
  return display.values[id] ?? (id.startsWith("DRIVE-") ? display.values[id.slice(6)] : display.values[`DRIVE-${id}`])
}

// ---------------------------------------------------------------------------
// Le dessin d'une zone
// ---------------------------------------------------------------------------

/** Ce qu'Eraser sait déjà d'un item (l'exemplaire et ses retouches compris). */
export type ItemSource = ObjectCombatFields & {
  id?: string
  description?: string
  descriptionHtml?: string
  effect?: string
  effectHtml?: string
  type?: string
  subtype?: string
  price?: string
}

/**
 * `renderKnown` : ce que l'endroit dessine lui-même pour une colonne qu'Eraser connaît (le type
 * modifiable de l'inventaire…) ; `undefined` : le dessin commun ; `null` : rien.
 */
export type ItemZoneContext = {
  item: ItemSource
  values?: Record<string, ItemColumnValue>
  looks?: Record<string, ObjectTraitLook>
  inline?: boolean
  renderKnown?: (key: ItemFieldKey, field: ItemDisplayField) => ReactNode | null | undefined
  /** La mise en forme des textes (celle des magasins…). */
  richClassName?: string
}

function knownValue(item: ItemSource, key: ItemFieldKey): ItemColumnValue | null {
  const html = key === "description" ? item.descriptionHtml : key === "effect" ? item.effectHtml : ""
  const text = String(item[key as keyof ItemSource] ?? "")
  if (!text.trim() && !html?.replace(/<[^>]+>/g, "").trim()) return null
  return html?.trim() ? { t: text, h: html } : { t: text }
}

const traitFilled = (item: ItemSource, key: ItemTraitKey) => Boolean(item[key]?.trim())
const labelClass = "font-semibold text-foreground/65"

function Pills({ text, look }: { text: string; look?: ObjectTraitLook }) {
  const css = columnStyleCss(look?.style)
  return <span className="inline-flex flex-wrap items-center gap-1 align-middle">{itemListValues(text).map((part, index) => {
    const color = look?.options ? matchChoice(part, look.options)?.color : undefined
    return <span key={`${part}:${index}`} className={cn("rounded-full border px-1.5 py-px text-[10px] font-medium leading-4", !color && "border-border bg-muted/50 text-foreground/75", css.className)} style={{ ...(color ? { color, borderColor: `${color}55`, backgroundColor: `${color}14` } : {}), ...css.style }}>{part}</span>
  })}</span>
}

/** Une valeur dans le style de sa colonne (gras, couleur…), son unité après un nombre. */
function Value({ value, look, item, block, className }: { value: ItemColumnValue; look?: ObjectTraitLook; item: ItemSource; block?: boolean; className?: string }) {
  const css = columnStyleCss(look?.style)
  const unit = look?.unit && /^-?\d+(?:[.,]\d+)?$/.test(value.t.trim()) ? ` ${look.unit}` : ""
  // Un texte sans mise en forme ni « {…} » : écrit tel quel (une longue liste d'items reste légère).
  if (!value.h && !value.t.includes("{")) {
    const Tag = block ? "div" : "span"
    return <Tag className={cn("whitespace-pre-line [overflow-wrap:anywhere]", css.className, className)} style={css.style}>{value.t}{unit}</Tag>
  }
  const text = <ObjectText as={block ? "div" : "span"} html={value.h} text={`${value.t}${unit}`} item={item} className={cn("[overflow-wrap:anywhere]", css.className, className)} />
  return Object.keys(css.style).length ? <span className={block ? "block" : undefined} style={css.style}>{text}</span> : text
}

/** Une colonne placée, dans son style ; `null` si elle est vide. */
function fieldNode(field: ItemDisplayField, value: ItemColumnValue, context: ItemZoneContext, key: string): ReactNode {
  const look = context.looks?.[field.column]
  const style = itemFieldStyle(field)
  if (style === "pills") return <Pills key={key} text={value.t} look={look} />
  if (style === "label") {
    return context.inline
      ? <span key={key} className="min-w-0"><span className={labelClass}>{field.column} :</span> <Value value={value} look={look} item={context.item} className={context.richClassName} /></span>
      : <div key={key} className="flex min-w-0 gap-1"><span className={cn("shrink-0", labelClass)}>{field.column} :</span><Value value={value} look={look} item={context.item} block className={cn("min-w-0 flex-1", context.richClassName)} /></div>
  }
  return <Value key={key} value={value} look={look} item={context.item} block={!context.inline && style === "text"} className={context.richClassName} />
}

/**
 * Les morceaux d'une zone, dans l'ordre, les vides retirés. Les traits de combat placés dans la
 * zone se dessinent ensemble, comme leurs colonnes, à la place du premier d'entre eux.
 */
export function itemZoneParts(fields: ItemDisplayField[], context: ItemZoneContext): ReactNode[] {
  const traits = fields.flatMap((field) => { const key = knownItemField(field.column); return isItemTrait(key) ? [key] : [] })
  const filledTraits = traits.filter((key) => traitFilled(context.item, key))
  let traitsPlaced = false
  const parts: ReactNode[] = []
  fields.forEach((field, index) => {
    const key = knownItemField(field.column)
    const id = `${field.column}:${index}`
    if (isItemTrait(key)) {
      if (traitsPlaced || !filledTraits.length) return
      traitsPlaced = true
      parts.push(<ObjectTraits key={id} item={context.item} only={traits} className={context.inline ? "inline-grid align-middle" : ""} />)
      return
    }
    if (key) {
      const own = context.renderKnown?.(key, field)
      if (own === null) return
      if (own !== undefined) { parts.push(<span key={id} className="contents">{own}</span>); return }
      const value = knownValue(context.item, key)
      if (value) parts.push(fieldNode(field, value, context, id))
      return
    }
    const value = context.values?.[field.column]
    if (value?.t.trim()) parts.push(fieldNode(field, value, context, id))
  })
  return parts
}

/** Les colonnes d'une zone de l'endroit, pour ce lecteur. */
export function placeZone(display: ItemPlaceDisplay, zone: ItemDisplayField["zone"]) {
  return display.fields.filter((field) => field.zone === zone)
}

/** La colonne connue est-elle placée dans cette zone ? */
export function zoneHas(fields: ItemDisplayField[], key: ItemFieldKey) {
  return fields.some((field) => knownItemField(field.column) === key)
}

// ---------------------------------------------------------------------------
// Le raccourci vers les réglages
// ---------------------------------------------------------------------------

export const ITEM_DISPLAY_EDITOR_PARAM = "affichage-items"

/** L'adresse qui ouvre « Modifier › Affichage des items » de l'Index des items, sur cet endroit. */
export function itemDisplayEditorHref(place: ItemPlace) {
  return `/ressources/index-des-objets?modifier=${ITEM_DISPLAY_EDITOR_PARAM}&endroit=${place}`
}

/** La petite roue « Régler l'affichage des items », pour le MJ et l'administrateur. */
export function ItemDisplaySettingsLink({ place, className }: { place: ItemPlace; className?: string }) {
  const shell = useOptionalShellData()
  if (!shell || shell.viewRole === "joueur") return null
  return <Link href={itemDisplayEditorHref(place)} prefetch={false} className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground", className)} title="Régler l’affichage des items (Index des items › Modifier)" aria-label="Régler l’affichage des items"><Settings2 className="size-3.5" /></Link>
}
