"use client"

import { useId, type CSSProperties } from "react"

import type { StateFx } from "@/lib/state-fx"

/** Les FX qui se posent par-dessus le portrait (calques) ; les autres changent l'image elle-même. */
const layerClass: Partial<Record<StateFx, string>> = {
  Pulsation: "eraser-fx-pulse",
  Aura: "eraser-fx-aura",
  Spirale: "eraser-fx-spiral",
  Brume: "eraser-fx-mist",
}

const imageClass: Partial<Record<StateFx, string>> = {
  Tremblement: "eraser-fx-shake",
  Flou: "eraser-fx-blur",
  Transparence: "eraser-fx-ghost",
  "Désaturé": "eraser-fx-grey",
  Coma: "eraser-fx-coma",
  Mort: "eraser-fx-mort",
}

/** Les classes à poser sur l'image du portrait (tremblement, flou…). */
export function portraitImageFxClass(fx: Array<{ name: StateFx }>) {
  return fx.map((item) => imageClass[item.name]).filter(Boolean).join(" ")
}

// Positions fixes (le rendu serveur et la page doivent dessiner la même chose).
const embers = [{ x: 14, delay: 0, sway: 8 }, { x: 31, delay: 0.9, sway: -10 }, { x: 47, delay: 1.7, sway: 6 }, { x: 62, delay: 0.4, sway: -7 }, { x: 78, delay: 1.3, sway: 11 }, { x: 88, delay: 2, sway: -5 }]
const sparkles = [{ x: 8, y: 12, delay: 0 }, { x: 84, y: 9, delay: 1.1 }, { x: 90, y: 58, delay: 2.2 }, { x: 6, y: 74, delay: 0.6 }, { x: 70, y: 88, delay: 1.7 }, { x: 22, y: 92, delay: 2.6 }]
const hangs = [{ x: 16, r: 3.2, delay: 0.3 }, { x: 46, r: 4, delay: 1.6 }, { x: 76, r: 3.4, delay: 0.9 }, { x: 98, r: 2.8, delay: 2.4 }]
const drops = [{ x: 9, r: 3.4, delay: 0, duration: 3.6 }, { x: 24, r: 2.6, delay: 1.4, duration: 4.4 }, { x: 38, r: 3.9, delay: 0.6, duration: 3.1 }, { x: 55, r: 2.9, delay: 2.1, duration: 4.8 }, { x: 69, r: 3.6, delay: 0.9, duration: 3.5 }, { x: 83, r: 2.7, delay: 2.7, duration: 4.1 }, { x: 94, r: 3.2, delay: 1.8, duration: 3.8 }]

/** Le feu : deux couches de flammes qui montent, une lueur au pied, des braises. */
function Flames({ style }: { style: CSSProperties }) {
  return <span aria-hidden="true" className="eraser-fx-flames pointer-events-none absolute inset-0 overflow-hidden" style={style}>
    <s /><i /><i />
    {embers.map((ember) => <b key={ember.x} style={{ left: `${ember.x}%`, animationDelay: `${ember.delay}s`, "--sway": `${ember.sway}px` } as CSSProperties} />)}
  </span>
}

/** Le givre : verre dépoli sur les bords, cristaux, éclats qui scintillent. */
function Frost({ style }: { style: CSSProperties }) {
  return <span aria-hidden="true" className="eraser-fx-frost pointer-events-none absolute inset-0 overflow-hidden" style={style}>
    <i />
    {sparkles.map((sparkle) => <b key={sparkle.x} style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, animationDelay: `${sparkle.delay}s` }} />)}
  </span>
}

/** Le suintement : un liquide épais coule du haut et tombe en gouttes (flou + seuil). */
function Drips({ style }: { style: CSSProperties }) {
  const id = `fx-goo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ...style, color: "var(--fx)" }}>
    <svg className="absolute inset-0 size-full" viewBox="0 0 100 140" preserveAspectRatio="xMidYMin slice">
      <defs>
        <filter id={id}><feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" /><feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" /></filter>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.25" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <g filter={`url(#${id})`} fill="currentColor" opacity="0.92">
        <rect x="-6" y="-6" width="112" height="12" />
        {hangs.map((hang) => <ellipse key={hang.x} className="eraser-fx-drip-hang" cx={hang.x} cy="5" rx={hang.r} ry={hang.r * 1.6} style={{ animationDelay: `${hang.delay}s` }} />)}
        {drops.map((drop) => <ellipse key={drop.x} className="eraser-fx-drip-drop" cx={drop.x} cy="4" rx={drop.r} ry={drop.r * 1.2} style={{ animationDelay: `${drop.delay}s`, animationDuration: `${drop.duration}s` }} />)}
      </g>
      <rect x="0" y="0" width="100" height="14" fill={`url(#${id}-shine)`} />
    </svg>
  </span>
}

/** Les calques des FX des états, chacun teinté par la couleur de son effet. */
export function PortraitFx({ fx }: { fx: Array<{ name: StateFx; color: string }> }) {
  return <>{fx.flatMap((item) => {
    const style = { "--fx": item.color || "#a8a29e" } as CSSProperties
    if (item.name === "Flammes") return [<Flames key={item.name} style={{ ...style, "--fx": item.color || "#ff6a1a" } as CSSProperties} />]
    if (item.name === "Givre") return [<Frost key={item.name} style={{ ...style, "--fx": item.color || "#9fd8ff" } as CSSProperties} />]
    if (item.name === "Suintement") return [<Drips key={item.name} style={{ ...style, "--fx": item.color || "#3f6212" } as CSSProperties} />]
    const className = layerClass[item.name]
    return className ? [<span key={item.name} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`} style={style} />] : []
  })}</>
}

/** Les FX des états posés sur une case de la fiche (« FX appliqué à » : compétences liées). */
export function stateFxOf(items: Array<{ source?: string; fx?: Array<{ name: string; color: string }> }>) {
  const fx = items.flatMap((item) => item.source === "état" ? item.fx ?? [] : []) as Array<{ name: StateFx; color: string }>
  return [...new Map(fx.map((item) => [item.name, item])).values()]
}

/** Les calques de FX d'une case ou de la page, coupés à leurs bords (les survols restent libres). */
export function FxOverlay({ fx, className = "" }: { fx: Array<{ name: StateFx; color: string }>; className?: string }) {
  if (!fx.length) return null
  return <span aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}><PortraitFx fx={fx} /></span>
}
