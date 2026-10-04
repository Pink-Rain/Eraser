"use client"

import { useEffect, useRef, useState } from "react"
import { Gift, X } from "lucide-react"

import type { ItemNotification } from "@/lib/item-notifications"
import { playItemReceived } from "@/lib/sounds"

/** Annoncé quand un objet vient d'arriver : l'inventaire concerné, s'il est ouvert, se recharge. */
export const inventoryReceivedEvent = "eraser:inventory-received"

export function announceInventoryReceived(targetId: string) {
  window.dispatchEvent(new CustomEvent(inventoryReceivedEvent, { detail: { targetId } }))
}

const SHOW_EVENT = "eraser:item-notifications"

/** Les alertes déjà montrées dans cette fenêtre : jamais deux fois, même si leur effacement tarde. */
const shownNotificationIds = new Set<string>()

/** Celles qui n'ont pas encore été montrées dans cette fenêtre. */
export function unseenItemNotifications(notifications: ItemNotification[]) {
  return notifications.filter((notification) => !shownNotificationIds.has(notification.id))
}

/**
 * Montrées : le serveur peut les effacer. Tant qu'il ne l'a pas fait (réseau coupé), elles
 * reviennent à la relève suivante, sont effacées de nouveau, mais ne sont pas remontrées.
 */
function acknowledgeItemNotifications(notifications: ItemNotification[]) {
  if (!notifications.length) return
  void fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seen: notifications.map((notification) => notification.id) }) }).catch(() => undefined)
}

/** Montre des notifications relevées ailleurs (la fiche d'un personnage), avec leur petit son. */
export function showItemNotifications(notifications: ItemNotification[]) {
  if (notifications.length) window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: notifications }))
}

/** Appelle `onReceived` quand l'un de ces inventaires (personnage, PNJ, `CAMPAGNE:<id>`) reçoit un objet. */
export function useInventoryReceived(ids: string[], onReceived: () => void) {
  const callback = useRef(onReceived)
  useEffect(() => { callback.current = onReceived })
  const key = ids.join("\n")
  useEffect(() => {
    const wanted = new Set(key.split("\n").filter(Boolean))
    const listener = (event: Event) => {
      const targetId = (event as CustomEvent<{ targetId?: string }>).detail?.targetId
      if (targetId && wanted.has(targetId)) callback.current()
    }
    window.addEventListener(inventoryReceivedEvent, listener)
    return () => window.removeEventListener(inventoryReceivedEvent, listener)
  }, [key])
}

const POLL_MS = 15_000
const VISIBLE_MS = 12_000

/**
 * Relève régulièrement les objets reçus (plus souvent quand la fenêtre est active) et
 * les annonce dans une petite carte, au-dessus du bouton du chat.
 */
export function ItemNotifications() {
  const [shown, setShown] = useState<ItemNotification[]>([])

  // Les objets reçus par un personnage, relevés par sa fiche à son ouverture.
  useEffect(() => {
    const listener = (event: Event) => {
      const received = (event as CustomEvent<ItemNotification[]>).detail ?? []
      const fresh = unseenItemNotifications(received)
      acknowledgeItemNotifications(received)
      if (!fresh.length) return
      for (const notification of fresh) shownNotificationIds.add(notification.id)
      playItemReceived()
      setShown((current) => [...current, ...fresh.filter((item) => !current.some((known) => known.id === item.id))].slice(-4))
    }
    window.addEventListener(SHOW_EVENT, listener)
    return () => window.removeEventListener(SHOW_EVENT, listener)
  }, [])

  useEffect(() => {
    let alive = true
    let timer = 0
    let running = false
    async function check() {
      if (running || document.visibilityState !== "visible") return
      running = true
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" })
        const payload = (await response.json().catch(() => ({}))) as { notifications?: ItemNotification[] }
        const received = response.ok ? payload.notifications ?? [] : []
        // Plus là pour les montrer : elles restent sur le serveur pour la prochaine relève.
        if (!alive || !received.length) return
        const fresh = unseenItemNotifications(received)
        acknowledgeItemNotifications(received)
        if (fresh.length) {
          for (const notification of fresh) shownNotificationIds.add(notification.id)
          playItemReceived()
          setShown((current) => [...current, ...fresh.filter((item) => !current.some((known) => known.id === item.id))].slice(-4))
          for (const notification of fresh) if (notification.targetId) announceInventoryReceived(notification.targetId)
        }
      } catch {
        // Hors ligne : on réessaie au prochain passage.
      } finally {
        running = false
      }
    }
    function schedule() {
      window.clearTimeout(timer)
      timer = window.setTimeout(async () => { await check(); if (alive) schedule() }, POLL_MS)
    }
    const wake = () => { if (document.visibilityState === "visible") { void check(); schedule() } }
    void check()
    schedule()
    window.addEventListener("focus", wake)
    document.addEventListener("visibilitychange", wake)
    return () => {
      alive = false
      window.clearTimeout(timer)
      window.removeEventListener("focus", wake)
      document.removeEventListener("visibilitychange", wake)
    }
  }, [])

  const oldest = shown[0]?.id
  useEffect(() => {
    if (!oldest) return
    const timer = window.setTimeout(() => setShown((current) => current.filter((item) => item.id !== oldest)), VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [oldest])

  if (!shown.length) return null
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {shown.map((notification) => (
        <div key={notification.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-primary/20 bg-popover/95 p-3 text-popover-foreground shadow-[0_18px_45px_rgb(67_50_31/0.18)] backdrop-blur animate-in fade-in slide-in-from-bottom-2">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gift className="size-4" /></span>
          <div className="min-w-0 flex-1 text-sm leading-5">
            <p><b className="font-semibold">{notification.senderName}</b> vous a envoyé <b className="font-semibold">{notification.quantity > 1 ? `${notification.quantity} × ` : ""}{notification.itemName}</b></p>
            {notification.targetLabel && <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.targetLabel}</p>}
          </div>
          <button type="button" onClick={() => setShown((current) => current.filter((item) => item.id !== notification.id))} className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fermer"><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  )
}
