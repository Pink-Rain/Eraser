/**
 * Se souvenir d'où l'on était dans un conteneur qui défile (le tableau d'un index, la
 * page), le temps de la fenêtre : changer d'onglet d'Eraser démonte la page, revenir
 * la remet au même endroit.
 */
type Position = { top: number; left: number }

function read(key: string): Position | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as Position | null
    return stored && typeof stored.top === "number" && typeof stored.left === "number" ? stored : null
  } catch { return null }
}

/** Une position gardée plus bas que le haut du conteneur (le tableau doit alors être complet). */
export function hasRememberedScroll(key: string) {
  if (typeof window === "undefined") return false
  return Boolean(read(key)?.top)
}

/**
 * Remet le conteneur à la position gardée, puis enregistre chaque défilement. Le contenu
 * peut arriver un peu après (lignes, filtres) : on réessaie quelques images, et on
 * s'arrête dès que la personne fait défiler elle-même.
 */
export function rememberScroll(key: string, element: HTMLElement, frames = 30) {
  let frame = 0
  let request = 0
  let restoring = true
  const target = read(key)
  const stop = () => { restoring = false; window.cancelAnimationFrame(request) }
  const restore = () => {
    if (!restoring || !target) return
    element.scrollTop = target.top
    element.scrollLeft = target.left
    const reached = Math.abs(element.scrollTop - target.top) < 2 && Math.abs(element.scrollLeft - target.left) < 2
    frame += 1
    if (reached || frame >= frames) { stop(); return }
    request = window.requestAnimationFrame(restore)
  }
  if (target && (target.top || target.left)) restore()
  else restoring = false

  let saving = 0
  const save = () => {
    if (restoring) return
    window.cancelAnimationFrame(saving)
    saving = window.requestAnimationFrame(() => {
      try { window.sessionStorage.setItem(key, JSON.stringify({ top: element.scrollTop, left: element.scrollLeft })) } catch { /* stockage indisponible */ }
    })
  }
  const userInput = ["wheel", "touchstart", "pointerdown", "keydown"] as const
  for (const type of userInput) element.addEventListener(type, stop, { passive: true })
  element.addEventListener("scroll", save, { passive: true })
  return () => {
    stop()
    window.cancelAnimationFrame(saving)
    for (const type of userInput) element.removeEventListener(type, stop)
    element.removeEventListener("scroll", save)
  }
}
