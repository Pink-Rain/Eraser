/**
 * L'œil des effets (inventaires des joueurs) : l'effet d'un item est caché d'office, le joueur
 * clique sur l'œil pour le voir. On retient, sur cet ordinateur, les exemplaires (cases
 * d'inventaire) dont l'effet est montré : un effet montré le reste après une actualisation ou un
 * redémarrage d'Eraser, un effet recaché aussi.
 *
 * Commun à l'inventaire et aux extensions (`eraser.inventory.effectShown` / `showEffects`) : un
 * effet montré dans un atelier l'est aussi dans l'inventaire, et l'inverse. Navigateur seulement.
 */

const storageKey = "eraser:inventory-shown-effects"
const changedEvent = "eraser:shown-effects"
const limit = 1000

export function readShownEffects(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : []
  } catch { return [] }
}

/** L'effet de cet exemplaire est-il montré ? */
export function isEffectShown(slotId: string) {
  return readShownEffects().includes(slotId)
}

/** Montre ou cache l'effet de ces exemplaires, puis prévient l'inventaire et les ateliers ouverts. */
export function setEffectsShown(slotIds: string[], shown: boolean) {
  const ids = new Set(slotIds.filter(Boolean))
  if (!ids.size) return
  // Relu au moment du clic : chaque case garde la sienne sans effacer celle des autres.
  const others = readShownEffects().filter((key) => !ids.has(key))
  const next = shown ? [...others, ...ids].slice(-limit) : others
  try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* l'état vaut pour cette visite */ }
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { slotIds: [...ids], shown } }))
}

/** Écoute les changements (de cette page ou d'une extension) ; rend de quoi arrêter. */
export function onShownEffectsChange(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey) listener() }
  window.addEventListener(changedEvent, listener)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(changedEvent, listener)
    window.removeEventListener("storage", onStorage)
  }
}
