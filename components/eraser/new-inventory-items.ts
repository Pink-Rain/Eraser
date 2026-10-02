"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

import type { CharacterInventoryRecord } from "@/lib/inventory-schema"

/**
 * Les objets tout juste reçus d'un inventaire : une petite pastille rouge les signale
 * jusqu'à ce qu'on les survole. Gardés dans ce navigateur, par inventaire.
 */
const storageKey = (ownerId: string) => `eraser:inventory-new:${ownerId}`
const changedEvent = "eraser:inventory-new-changed"

function read(ownerId: string) {
  try { return new Set(JSON.parse(window.localStorage.getItem(storageKey(ownerId)) || "[]") as string[]) } catch { return new Set<string>() }
}

function write(ownerId: string, slots: Set<string>) {
  try { window.localStorage.setItem(storageKey(ownerId), JSON.stringify([...slots].slice(-60))) } catch { /* stockage indisponible */ }
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { ownerId } }))
}

export function markNewSlots(ownerId: string, slotIds: string[]) {
  if (!slotIds.length) return
  const slots = read(ownerId)
  for (const id of slotIds) slots.add(id)
  write(ownerId, slots)
}

/**
 * Les emplacements où un objet vient d'arriver : un objet absent auparavant, ou une pile
 * qui a grossi. Sert à repérer l'objet reçu, quel que soit le chemin (transfert, fouille…).
 */
export function receivedSlots(before: CharacterInventoryRecord | null, after: CharacterInventoryRecord) {
  if (!before) return []
  const previous = new Map(before.containers.flatMap((container) => container.slots.map((slot) => [slot.id, slot] as const)))
  return after.containers.flatMap((container) => container.slots.flatMap((slot) => {
    if (!slot.item || slot.quantity <= 0) return []
    const old = previous.get(slot.id)
    const appeared = !old?.item || old.quantity <= 0 || old.itemId !== slot.itemId || old.item.name !== slot.item.name
    return appeared || slot.quantity > old.quantity ? [slot.id] : []
  }))
}

export function useNewSlots(ownerId: string) {
  const [slots, setSlots] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const load = () => setSlots(read(ownerId))
    load()
    const listener = (event: Event) => { if ((event as CustomEvent<{ ownerId?: string }>).detail?.ownerId === ownerId) load() }
    window.addEventListener(changedEvent, listener)
    return () => window.removeEventListener(changedEvent, listener)
  }, [ownerId])
  const seen = useCallback((slotId: string) => {
    const current = read(ownerId)
    if (!current.delete(slotId)) return
    write(ownerId, current)
  }, [ownerId])
  return { isNew: (slotId: string) => slots.has(slotId), seen }
}

export const NewSlotsContext = createContext<{ isNew: (slotId: string) => boolean; seen: (slotId: string) => void }>({ isNew: () => false, seen: () => undefined })

export function useNewSlot(slotId: string) {
  const context = useContext(NewSlotsContext)
  return { isNew: context.isNew(slotId), seen: () => context.seen(slotId) }
}
