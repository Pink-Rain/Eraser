import type { CharacterInventoryRecord } from "@/lib/inventory-schema"

/**
 * L'inventaire complet (avec le catalogue des objets). S'il revient sans le catalogue
 * (Google a refusé la lecture un instant), il est redemandé deux fois, après 4 puis 12
 * secondes. `onLoaded` reçoit chaque version reçue ; `isActive` arrête les relances quand
 * la page a changé.
 */
export async function loadFullInventory(endpoint: string, onLoaded: (inventory: CharacterInventoryRecord) => void, isActive: () => boolean, delays = [0, 4_000, 12_000]) {
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    if (!isActive()) return
    try {
      const response = await fetch(endpoint, { cache: "no-store" })
      const payload = (await response.json().catch(() => ({}))) as { inventory?: CharacterInventoryRecord }
      if (!isActive()) return
      if (response.ok && payload.inventory) {
        onLoaded(payload.inventory)
        if (!payload.inventory.catalogMissing) return
      }
    } catch {
      // Hors ligne : la relance suivante réessaie.
    }
  }
}
