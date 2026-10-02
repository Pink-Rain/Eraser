/**
 * Un index du monde vient de changer (cellule, ligne ajoutée, nom créé…). L'annonce
 * passe aux autres vues de la même page (onglets de l'application) et, par un canal du
 * navigateur, aux autres fenêtres d'Eraser : l'onglet « États » voit aussitôt l'effet
 * créé dans l'onglet « Effets » ouvert ailleurs.
 *
 * `origin` désigne la vue qui a écrit : elle a déjà ses données et s'ignore elle-même.
 */
const EVENT = "eraser:world-index-changed"
const CHANNEL = "eraser-world-index"

type Change = { keys: string[]; origin: string }
type Listener = (keys: string[], origin: string) => void

const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null
let started = false

function deliver(change: Change) {
  if (!change || !Array.isArray(change.keys) || !change.keys.length) return
  for (const listener of [...listeners]) listener(change.keys, change.origin ?? "")
}

function start() {
  if (started || typeof window === "undefined") return
  started = true
  window.addEventListener(EVENT, (event) => deliver((event as CustomEvent<Change>).detail))
  if (typeof BroadcastChannel === "function") {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event: MessageEvent<Change>) => deliver(event.data)
  }
}

export function announceWorldIndexChange(keys: Iterable<string>, origin = "") {
  if (typeof window === "undefined") return
  start()
  const change: Change = { keys: [...new Set(keys)].filter(Boolean), origin }
  if (!change.keys.length) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: change }))
  channel?.postMessage(change)
}

/** Écoute les changements ; les écouteurs inscrits d'abord passent d'abord. */
export function onWorldIndexChange(listener: Listener) {
  start()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
