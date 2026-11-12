"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

import { inventoryReceivedEvent } from "@/components/eraser/item-notifications"
import { withUnlockedEffect, type CharacterEffects } from "@/lib/hidden-effects"

/**
 * Les effets cachés d'un personnage, côté page (lib/hidden-effects.ts) : lus au serveur partagé
 * après la première peinture de l'inventaire (`GET /api/characters/[id]/effects`), relus quand on
 * revient sur la fenêtre passé une minute, et aussitôt quand son inventaire change ailleurs
 * (`eraser:inventory-received`, `eraser.inventory.changed(id)` d'une extension). Débloquer s'affiche tout de suite et s'enregistre
 * ensuite ; un refus remet l'état d'avant et le dit.
 *
 * Les types cachés de la dernière lecture sont gardés sur l'ordinateur : avant la lecture, un
 * item de ces types reste verrouillé (jamais un effet montré puis caché).
 */
/** `fallback` : ce qui vaut avant la première lecture (les types cachés de la dernière fois, rien de débloqué). */
type EffectsEntry = { effects: CharacterEffects | null; fallback: CharacterEffects | null; error: string }

const emptyEntry: EffectsEntry = { effects: null, fallback: null, error: "" }
const entries = new Map<string, EffectsEntry>()
const lastReads = new Map<string, number>()
const pendingWrites = new Map<string, number>()
const listeners = new Set<() => void>()
const knownTypesKey = "eraser:hidden-effect-types"

function entryOf(characterId: string) {
  return entries.get(characterId) ?? emptyEntry
}

/** L'entrée d'un personnage pour l'affichage, créée une fois (stable entre deux changements). */
function snapshotOf(characterId: string) {
  let entry = entries.get(characterId)
  if (!entry) {
    entry = { effects: null, fallback: { hiddenTypes: knownHiddenTypes(), unlocked: [] }, error: "" }
    entries.set(characterId, entry)
  }
  return entry
}

function setEntry(characterId: string, patch: Partial<EffectsEntry>) {
  entries.set(characterId, { ...entryOf(characterId), ...patch })
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function rememberTypes(types: string[]) {
  try { window.localStorage.setItem(knownTypesKey, JSON.stringify(types)) } catch { /* la lecture suivante suffit */ }
}

/** Les types cachés de la dernière lecture sur cet ordinateur (avant que celle-ci arrive). */
function knownHiddenTypes(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(knownTypesKey) ?? "[]")
    return Array.isArray(stored) ? stored.filter((type): type is string => typeof type === "string") : []
  } catch { return [] }
}

async function loadEffects(characterId: string) {
  if (Date.now() - (lastReads.get(characterId) ?? 0) < 2_000) return
  lastReads.set(characterId, Date.now())
  try {
    const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/effects`, { cache: "no-store" })
    const payload = (await response.json().catch(() => ({}))) as Partial<CharacterEffects> & { error?: string }
    // Un déblocage parti pendant la lecture garde la main : sa réponse arrivera après.
    if (!response.ok || pendingWrites.get(characterId)) return
    const effects = { hiddenTypes: payload.hiddenTypes ?? [], unlocked: payload.unlocked ?? [] }
    rememberTypes(effects.hiddenTypes)
    setEntry(characterId, { effects })
  } catch { /* hors ligne : l'état reste tel quel */ }
}

/**
 * Les effets cachés de ce personnage pour son inventaire (`characterId` vide : aucun, rien n'est
 * caché). `toggle(item, unlocked)` débloque ou reverrouille l'effet d'un item.
 */
export function useCharacterEffects(characterId: string) {
  const entry = useSyncExternalStore(subscribe, () => characterId ? snapshotOf(characterId) : emptyEntry, () => emptyEntry)

  useEffect(() => {
    if (!characterId) return
    const timer = window.setTimeout(() => void loadEffects(characterId), 0)
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - (lastReads.get(characterId) ?? 0) > 60_000) void loadEffects(characterId) }
    // L'inventaire du personnage a changé ailleurs (`eraser.inventory.changed(id)` d'une extension
    // qui vient aussi de débloquer un effet par l'API) : relu tout de suite, sans attendre.
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ targetId?: string }>).detail?.targetId !== characterId) return
      lastReads.delete(characterId)
      void loadEffects(characterId)
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener(inventoryReceivedEvent, onChanged)
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(inventoryReceivedEvent, onChanged) }
  }, [characterId])

  const toggle = useCallback(async (item: string, unlocked: boolean) => {
    if (!characterId) return false
    const before = entryOf(characterId).effects
    if (before) setEntry(characterId, { effects: { ...before, unlocked: withUnlockedEffect(before.unlocked, item, unlocked) }, error: "" })
    pendingWrites.set(characterId, (pendingWrites.get(characterId) ?? 0) + 1)
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/effects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item, unlocked }) })
      const payload = (await response.json().catch(() => ({}))) as { unlocked?: string[]; error?: string }
      if (!response.ok || !payload.unlocked) throw new Error(payload.error || "L’effet n’a pas pu être enregistré.")
      const current = entryOf(characterId).effects ?? before
      if (current) setEntry(characterId, { effects: { ...current, unlocked: payload.unlocked } })
      return true
    } catch (failure) {
      const current = entryOf(characterId).effects
      // Le reste (un autre déblocage confirmé entre-temps) est gardé : seul cet item revient.
      setEntry(characterId, { effects: current ? { ...current, unlocked: withUnlockedEffect(current.unlocked, item, !unlocked) } : before, error: failure instanceof Error ? failure.message : "L’effet n’a pas pu être enregistré." })
      return false
    } finally {
      pendingWrites.set(characterId, (pendingWrites.get(characterId) ?? 1) - 1)
    }
  }, [characterId])

  const clearError = useCallback(() => { if (characterId) setEntry(characterId, { error: "" }) }, [characterId])

  return { effects: entry.effects ?? entry.fallback, loaded: Boolean(entry.effects), error: entry.error, toggle, clearError }
}
