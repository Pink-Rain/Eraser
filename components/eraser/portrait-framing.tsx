"use client"

import { useEffect } from "react"

import { cleanPortraitFraming, framedImageStyle, type PortraitFraming } from "@/lib/portrait-framing-shared"

/**
 * Recadre les avatars des personnages (et des PNJ) partout où une vue les rogne
 * (`object-fit: cover`) : le visage choisi dans l'éditeur de token reste visible au lieu
 * du milieu de l'image (souvent les jambes, ou les pieds). Les avatars sont reconnus à
 * leur adresse ; une image marquée `data-no-framing` garde son cadrage.
 */
const EVENT = "eraser:portrait-framing"
const PATTERNS: Array<[RegExp, string]> = [[/\/api\/characters\/portrait\/([^/?#]+)/, "character"], [/\/api\/npcs\/portrait\/([^/?#]+)/, "npc"]]
const MARK = "data-eraser-framed"

let framings: Record<string, PortraitFraming> = {}

/** Un token vient d'être enregistré : son cadrage s'applique tout de suite, sans relire. */
export function announcePortraitFraming(kind: string, id: string, framing: PortraitFraming) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: `${kind}:${id}`, framing } }))
}

function keyOf(image: HTMLImageElement) {
  const source = image.getAttribute("src") ?? ""
  for (const [pattern, kind] of PATTERNS) {
    const match = source.match(pattern)
    if (match) { try { return `${kind}:${decodeURIComponent(match[1])}` } catch { return `${kind}:${match[1]}` } }
  }
  return ""
}

/** Les avatars (et ceux déjà recadrés) d'une partie de la page, sans passer toutes ses images. */
const CANDIDATES = `img[src*="/portrait/"], img[${MARK}]`

/**
 * Les images à recadrer attendent l'image suivante de l'écran, puis sont toutes mesurées
 * avant d'être toutes modifiées : une liste de cinquante portraits ne recalcule plus la mise
 * en page cinquante fois (une mesure après chaque modification).
 */
const queued = new Set<HTMLImageElement>()
let scheduled = 0

function frame(image: HTMLImageElement) {
  queued.add(image)
  if (!scheduled) scheduled = requestAnimationFrame(flush)
}

type Framed = { image: HTMLImageElement; key: string; style: ReturnType<typeof framedImageStyle> | null }

/** L'image remplit un parent qui la rogne : seul cas où l'agrandir ne déborde pas. */
function clipped(image: HTMLImageElement) {
  const parent = image.parentElement
  if (!parent) return false
  const overflow = getComputedStyle(parent)
  const clips = (value: string) => value !== "visible"
  return clips(overflow.overflowX) && clips(overflow.overflowY) && Math.abs(parent.clientWidth - image.clientWidth) <= 2 && Math.abs(parent.clientHeight - image.clientHeight) <= 2
}

function flush() {
  scheduled = 0
  const images = [...queued]
  queued.clear()
  // D'abord toutes les lectures…
  const plans: Framed[] = []
  for (const image of images) {
    if (!image.isConnected || image.hasAttribute("data-no-framing")) continue
    const key = keyOf(image)
    const framing = key ? framings[key] : undefined
    if (!framing || getComputedStyle(image).objectFit !== "cover") {
      // Plus de cadrage (une autre image dans la même balise) : on rend la place à la vue.
      if (image.hasAttribute(MARK)) plans.push({ image, key, style: null })
      continue
    }
    if (!image.naturalWidth) { image.addEventListener("load", () => frame(image), { once: true }); continue }
    const style = framedImageStyle(framing, { width: image.clientWidth, height: image.clientHeight }, { width: image.naturalWidth, height: image.naturalHeight })
    // Le resserrement agrandit et décale l'image elle-même : sans cadre qui la rogne, elle
    // débordait sur la page (un avatar rond devenait un grand disque). On garde alors le point de vue.
    plans.push({ image, key, style: style.transform && !clipped(image) ? { ...style, objectPosition: `${(framing.x * 100).toFixed(1)}% ${(framing.y * 100).toFixed(1)}%`, transformOrigin: "", transform: "" } : style })
  }
  // … puis toutes les écritures.
  for (const { image, key, style } of plans) {
    if (!style) { image.style.objectPosition = ""; image.style.transformOrigin = ""; image.style.transform = ""; image.removeAttribute(MARK); continue }
    image.style.objectPosition = style.objectPosition
    image.style.transformOrigin = style.transformOrigin
    image.style.transform = style.transform
    image.setAttribute(MARK, key)
  }
}

function frameAll(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>(CANDIDATES).forEach((image) => { if (keyOf(image) || image.hasAttribute(MARK)) frame(image) })
}

export function PortraitFramingEffect() {
  useEffect(() => {
    let alive = true
    fetch("/api/portrait-framing", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { framings?: Record<string, unknown> } | null) => {
        if (!alive || !payload?.framings) return
        framings = Object.fromEntries(Object.entries(payload.framings).flatMap(([key, value]) => { const framing = cleanPortraitFraming(value); return framing ? [[key, framing]] : [] }))
        frameAll()
      })
      .catch(() => {})
    const announced = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; framing: PortraitFraming }>).detail
      if (!detail?.key) return
      framings = { ...framings, [detail.key]: detail.framing }
      frameAll()
    }
    window.addEventListener(EVENT, announced)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) { if (keyOf(mutation.target) || mutation.target.hasAttribute(MARK)) frame(mutation.target) }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) { if (keyOf(node)) frame(node) }
          else if (node instanceof Element) frameAll(node)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] })
    return () => { alive = false; observer.disconnect(); window.removeEventListener(EVENT, announced); cancelAnimationFrame(scheduled); scheduled = 0; queued.clear() }
  }, [])
  return null
}
