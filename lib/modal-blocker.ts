/**
 * Ce qui rend la page inerte derrière une fenêtre ou un menu Radix (« modal »).
 *
 * Radix mettait `pointer-events: none` sur <body> à chaque ouverture et le retirait à la
 * fermeture. Cette propriété se transmet à tous les éléments : le navigateur recalculait le
 * style de toute la page, deux fois par fenêtre (un quart de seconde et plus sur un gros index).
 * À la place, un calque transparent est posé juste sous la fenêtre (même plan, juste avant elle
 * dans la page) : il reçoit les clics et le survol de tout ce qui est derrière, comme le faisait
 * <body>, sans rien changer au style de la page. Un clic dessus est un clic « dehors » pour
 * Radix, qui ferme la fenêtre ; rien derrière ne le reçoit.
 *
 * Branché dans @radix-ui/react-dismissable-layer par vite.config.ts ; sans lui (rendu serveur,
 * retouche absente), Radix garde sa façon de faire.
 */
type Blocker = { show: (doc: Document, layer: HTMLElement) => void; hide: (doc: Document) => void }

const BLOCKER_ATTRIBUTE = "data-eraser-modal-blocker"

function topLevelOf(doc: Document, node: Element) {
  let current: Element = node
  while (current.parentElement && current.parentElement !== doc.body) current = current.parentElement
  return current.parentElement === doc.body ? current : null
}

function zIndexOf(element: Element) {
  const value = Number.parseInt(getComputedStyle(element).zIndex, 10)
  return Number.isFinite(value) ? value : 0
}

const blocker: Blocker = {
  show(doc, layer) {
    const top = topLevelOf(doc, layer)
    if (!top) {
      // Une fenêtre posée ailleurs que directement dans <body> : la façon de Radix.
      doc.body.dataset.eraserModalFallback = doc.body.style.pointerEvents || "-"
      doc.body.style.pointerEvents = "none"
      return
    }
    const shield = doc.createElement("div")
    shield.setAttribute(BLOCKER_ATTRIBUTE, "")
    shield.setAttribute("aria-hidden", "true")
    // Le plan de la fenêtre (son enveloppe, sinon elle-même) : le calque passe sous elle et
    // au-dessus de tout le reste de la page.
    const z = Math.max(zIndexOf(top), zIndexOf(layer))
    shield.style.cssText = `position:fixed;inset:0;z-index:${z};background:transparent;pointer-events:auto;`
    doc.body.insertBefore(shield, top)
  },
  hide(doc) {
    for (const shield of doc.querySelectorAll(`body > [${BLOCKER_ATTRIBUTE}]`)) shield.remove()
    const fallback = doc.body.dataset.eraserModalFallback
    if (fallback !== undefined) {
      doc.body.style.pointerEvents = fallback === "-" ? "" : fallback
      delete doc.body.dataset.eraserModalFallback
    }
  },
}

if (typeof window !== "undefined") (window as Window & { __ERASER_BLOCK_OUTSIDE__?: Blocker }).__ERASER_BLOCK_OUTSIDE__ = blocker
