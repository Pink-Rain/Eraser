"use client"

import { useId, type CSSProperties, type ReactNode } from "react"

import type { StateFx } from "@/lib/state-fx"

/**
 * Les FX des états. Deux formats :
 * - « box » : dans un cadre (portrait, case d'une compétence) ;
 * - « page » : sur toute la fiche. Le calque suit la partie visible de la page (il reste
 *   en place quand on fait défiler) et se tient sur les bords, plus léger : la fiche doit
 *   toujours rester lisible.
 */
export type FxVariant = "box" | "page"
type FxItem = { name: StateFx; color: string }

/** Les FX simples, un calque CSS ; les autres sont des composants plus bas. */
const layerClass: Partial<Record<StateFx, string>> = {
  Pulsation: "eraser-fx-pulse",
  Rayons: "eraser-fx-rays",
}

/** Les FX qui changent ce qu'ils recouvrent (l'image, le nombre, la page). */
const imageClass: Partial<Record<StateFx, string>> = {
  Tremblement: "eraser-fx-shake",
  Flou: "eraser-fx-blur",
  Transparence: "eraser-fx-ghost",
  "Désaturé": "eraser-fx-grey",
  Coma: "eraser-fx-coma",
  Mort: "eraser-fx-mort",
}

/** Sur la page entière, version douce : flou léger, transparence qui laisse lire. */
const pageImageClass: Partial<Record<StateFx, string>> = {
  ...imageClass,
  Tremblement: "eraser-fx-shake-soft",
  Flou: "eraser-fx-blur-soft",
  Transparence: "eraser-fx-ghost-soft",
}

/** Les classes à poser sur l'image du portrait (tremblement, flou…). */
export function portraitImageFxClass(fx: Array<{ name: StateFx }>) {
  return fx.map((item) => imageClass[item.name]).filter(Boolean).join(" ")
}

/** Les mêmes, pour la page entière : jamais au point de la rendre illisible. */
export function pageImageFxClass(fx: Array<{ name: StateFx }>) {
  return fx.map((item) => pageImageClass[item.name]).filter(Boolean).join(" ")
}

/** Un tirage fixe (même rendu côté serveur et dans la page). */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

function svgId(raw: string, name: string) {
  return `fx-${name}-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

// ---------------------------------------------------------------------------
// Flammes
// ---------------------------------------------------------------------------

function embersFor(variant: FxVariant) {
  const random = seeded(variant === "page" ? 17 : 5)
  return Array.from({ length: variant === "page" ? 16 : 6 }, () => ({ x: 4 + random() * 92, delay: random() * 2.6, sway: (random() - 0.5) * 30, size: 2 + random() * (variant === "page" ? 3 : 2) }))
}

/** Le feu : deux couches de flammes qui montent, une lueur au pied, des braises. Sur la page, un mur de feu au bas de l'écran. */
function Flames({ style, variant }: { style: CSSProperties; variant: FxVariant }) {
  return <span aria-hidden="true" className={`eraser-fx-flames ${variant === "page" ? "eraser-fx-flames-page" : ""} pointer-events-none absolute inset-0 overflow-hidden`} style={style}>
    <s /><i /><i />
    {embersFor(variant).map((ember, index) => <b key={index} style={{ left: `${ember.x}%`, width: ember.size, height: ember.size, animationDelay: `${ember.delay}s`, "--sway": `${ember.sway}px` } as CSSProperties} />)}
  </span>
}

// ---------------------------------------------------------------------------
// Givre
// ---------------------------------------------------------------------------

function sparklesFor(variant: FxVariant) {
  const random = seeded(variant === "page" ? 23 : 3)
  return Array.from({ length: variant === "page" ? 26 : 6 }, () => {
    // Le long des bords : un côté au hasard, un peu vers l'intérieur.
    const side = Math.floor(random() * 4)
    const along = random() * 100
    const depth = random() * (variant === "page" ? 12 : 16)
    const [x, y] = side === 0 ? [along, depth] : side === 1 ? [100 - depth, along] : side === 2 ? [along, 100 - depth] : [depth, along]
    return { x, y, delay: random() * 3.2, size: variant === "page" ? 8 + random() * 10 : 11 }
  })
}

/** Le givre : verre dépoli sur les bords, cristaux, éclats qui scintillent. */
function Frost({ style, variant }: { style: CSSProperties; variant: FxVariant }) {
  return <span aria-hidden="true" className={`eraser-fx-frost ${variant === "page" ? "eraser-fx-frost-page" : ""} pointer-events-none absolute inset-0 overflow-hidden`} style={style}>
    <i />
    {sparklesFor(variant).map((sparkle, index) => <b key={index} style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, width: sparkle.size, height: sparkle.size, animationDelay: `${sparkle.delay}s` }} />)}
  </span>
}

// ---------------------------------------------------------------------------
// Dégoulinant (liquide qui coule du haut)
// ---------------------------------------------------------------------------

/** Un liquide épais coule du haut et tombe en gouttes (flou + seuil). Assez transparent pour lire dessous. */
function Dripping({ style, variant }: { style: CSSProperties; variant: FxVariant }) {
  const id = svgId(useId(), "goo")
  const width = variant === "page" ? 240 : 100
  const random = seeded(variant === "page" ? 41 : 9)
  const hangs = Array.from({ length: variant === "page" ? 9 : 4 }, (_, index) => ({ x: (index + 0.3 + random() * 0.4) * (width / (variant === "page" ? 9 : 4)), r: 2.6 + random() * 1.6, delay: random() * 3 }))
  const drops = Array.from({ length: variant === "page" ? 15 : 7 }, () => ({ x: random() * width, r: 2.4 + random() * 1.6, delay: random() * 3, duration: 3 + random() * 2 }))
  return <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ...style, color: "var(--fx)", opacity: variant === "page" ? 0.5 : 0.62 }}>
    <svg className="absolute inset-0 size-full" viewBox={`0 0 ${width} 140`} preserveAspectRatio="xMidYMin slice">
      <defs>
        <filter id={id}><feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" /><feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" /></filter>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.4" /><stop offset="0.3" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <g filter={`url(#${id})`} fill="currentColor">
        <rect x="-6" y="-6" width={width + 12} height="12" />
        {hangs.map((hang, index) => <ellipse key={`h${index}`} className="eraser-fx-drip-hang" cx={hang.x} cy="5" rx={hang.r} ry={hang.r * 1.6} style={{ animationDelay: `${hang.delay}s` }} />)}
        {drops.map((drop, index) => <ellipse key={`d${index}`} className="eraser-fx-drip-drop" cx={drop.x} cy="4" rx={drop.r} ry={drop.r * 1.2} style={{ animationDelay: `${drop.delay}s`, animationDuration: `${drop.duration}s` }} />)}
      </g>
      <rect x="0" y="0" width={width} height="14" fill={`url(#${id}-shine)`} />
    </svg>
  </span>
}

// ---------------------------------------------------------------------------
// Suintement (maladie : des pustules qui pullulent)
// ---------------------------------------------------------------------------

/**
 * Une maladie : des amas de pustules qui gonflent, se collent et crèvent sur les bords,
 * des têtes de pus qui pointent, une pourriture qui ronge. Le centre reste net.
 */
function Oozing({ style, variant }: { style: CSSProperties; variant: FxVariant }) {
  const id = svgId(useId(), "pus")
  const [width, height] = variant === "page" ? [160, 100] : [100, 140]
  const random = seeded(variant === "page" ? 61 : 13)
  // Des foyers le long des bords, chacun un amas de pustules serrées.
  const clusterCount = variant === "page" ? 20 : 11
  const clusters = Array.from({ length: clusterCount }, (_, index) => {
    const position = (index + random() * 0.6) / clusterCount
    const perimeter = 2 * (width + height)
    let distance = position * perimeter
    let x = 0
    let y = 0
    if (distance < width) { x = distance; y = random() * 3 } else if ((distance -= width) < height) { x = width - random() * 3; y = distance } else if ((distance -= height) < width) { x = width - distance; y = height - random() * 3 } else { x = random() * 3; y = height - (distance - width) }
    return { x, y, spread: (variant === "page" ? 5 : 7) + random() * 4, count: 9 + Math.floor(random() * 5) }
  })
  const pustules = clusters.flatMap((cluster) => Array.from({ length: cluster.count }, () => {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * cluster.spread
    return { x: cluster.x + Math.cos(angle) * distance, y: cluster.y + Math.sin(angle) * distance, r: 1.3 + random() * (variant === "page" ? 2 : 2.8), delay: random() * 5, duration: 2.8 + random() * 3, head: random() < 0.35 }
  }))
  return <span aria-hidden="true" className={`eraser-fx-ooze ${variant === "page" ? "eraser-fx-ooze-page" : ""} pointer-events-none absolute inset-0 overflow-hidden`} style={{ ...style, color: "var(--fx)" }}>
    <i />
    <svg className="absolute inset-0 size-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" /><feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -5" result="goo" /><feSpecularLighting in="goo" surfaceScale="2.5" specularConstant="0.9" specularExponent="18" lightingColor="#f6f3b0" result="light"><feDistantLight azimuth="235" elevation="45" /></feSpecularLighting><feComposite in="light" in2="goo" operator="in" result="shine" /><feMerge><feMergeNode in="goo" /><feMergeNode in="shine" /></feMerge></filter>
      </defs>
      {/* L'amas : une masse sombre et grumeleuse… */}
      <g filter={`url(#${id})`} className="eraser-fx-ooze-mass">
        {pustules.map((pustule, index) => <circle key={index} className="eraser-fx-pustule" cx={pustule.x} cy={pustule.y} r={pustule.r} style={{ animationDelay: `${pustule.delay}s`, animationDuration: `${pustule.duration}s` }} />)}
      </g>
      {/* …et des têtes de pus jaunâtres qui gonflent puis crèvent. */}
      {pustules.filter((pustule) => pustule.head).map((pustule, index) => <circle key={`h${index}`} className="eraser-fx-pus-head" cx={pustule.x - pustule.r * 0.2} cy={pustule.y - pustule.r * 0.25} r={pustule.r * 0.45} style={{ animationDelay: `${pustule.delay}s`, animationDuration: `${pustule.duration}s` }} />)}
    </svg>
  </span>
}

// ---------------------------------------------------------------------------
// Spirale, Brume
// ---------------------------------------------------------------------------

/** Les bras d'une spirale d'Archimède, en chemin SVG. */
function spiralPath(arm: number, arms: number, turns: number) {
  const steps = turns * 48
  const points: string[] = []
  for (let step = 0; step <= steps; step += 1) {
    const theta = (step / 48) * Math.PI * 2
    const radius = (step / steps) * 72
    const angle = theta + (arm * Math.PI * 2) / arms
    points.push(`${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`)
  }
  return `M${points.join(" L")}`
}

const spiralArms = [0, 1, 2].map((arm) => spiralPath(arm, 3, 4))

/** Une vraie spirale : trois bras qui s'enroulent et tournent lentement, plus clairs au centre. */
function Spiral({ style, variant }: { style: CSSProperties; variant: FxVariant }) {
  const id = svgId(useId(), "spiral")
  return <span aria-hidden="true" className={`eraser-fx-spiral ${variant === "page" ? "eraser-fx-spiral-page" : ""} pointer-events-none absolute inset-0 overflow-hidden`} style={{ ...style, color: "var(--fx)" }}>
    <svg className="absolute left-1/2 top-1/2 aspect-square w-[180%] max-w-none -translate-x-1/2 -translate-y-1/2" viewBox="0 0 100 100">
      <defs>
        <radialGradient id={`${id}-fade`}><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.12" stopColor="#fff" stopOpacity="1" /><stop offset="0.7" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <mask id={`${id}-mask`}><rect width="100" height="100" fill={`url(#${id}-fade)`} /></mask>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        <g className="eraser-fx-spiral-turn">
          {spiralArms.map((d, index) => <path key={index} d={d} fill="none" stroke="currentColor" strokeWidth={index === 0 ? 2.2 : 1.4} strokeLinecap="round" opacity={index === 0 ? 0.95 : 0.7} />)}
        </g>
      </g>
    </svg>
  </span>
}

/** La brume : des nappes de brouillard qui dérivent à deux vitesses, épaisses en bas et sur les bords. */
function Mist({ style, variant }: { style: CSSProperties; variant: FxVariant }) {
  return <span aria-hidden="true" className={`eraser-fx-mist ${variant === "page" ? "eraser-fx-mist-page" : ""} pointer-events-none absolute inset-0 overflow-hidden`} style={style}>
    <i /><i /><i />
  </span>
}

const components: Partial<Record<StateFx, (props: { style: CSSProperties; variant: FxVariant }) => ReactNode>> = {
  Flammes: Flames,
  Givre: Frost,
  "Dégoulinant": Dripping,
  Suintement: Oozing,
  Spirale: Spiral,
  Brume: Mist,
}

const defaultColors: Partial<Record<StateFx, string>> = {
  Flammes: "#ff6a1a",
  Givre: "#9fd8ff",
  "Dégoulinant": "#3f6212",
  Suintement: "#9bbf2a",
  Spirale: "#c084fc",
  Brume: "#d6d3d1",
}

/** Les calques des FX des états, chacun teinté par la couleur de son effet. */
export function PortraitFx({ fx, variant = "box" }: { fx: FxItem[]; variant?: FxVariant }) {
  return <>{fx.flatMap((item) => {
    const style = { "--fx": item.color || defaultColors[item.name] || "#a8a29e" } as CSSProperties
    const Component = components[item.name]
    if (Component) return [<Component key={item.name} style={style} variant={variant} />]
    const className = layerClass[item.name]
    return className ? [<span key={item.name} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className} ${variant === "page" ? `${className}-page` : ""}`} style={style} />] : []
  })}</>
}

/** Les FX des états posés sur une case de la fiche (« FX appliqué à » : compétences liées). */
export function stateFxOf(items: Array<{ source?: string; fx?: Array<{ name: string; color: string }> }>) {
  const fx = items.flatMap((item) => item.source === "état" ? item.fx ?? [] : []) as FxItem[]
  return [...new Map(fx.map((item) => [item.name, item])).values()]
}

/** Les calques de FX d'une case, coupés à ses bords (les survols restent libres). */
export function FxOverlay({ fx, className = "" }: { fx: FxItem[]; className?: string }) {
  if (!fx.length) return null
  // Confiné : ses animations ne font repeindre que lui, jamais le reste de la fiche.
  return <span aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [contain:strict] ${className}`}><PortraitFx fx={fx} /></span>
}

/**
 * Les FX « page entière » : un calque à la taille de l'écran, collé en haut de la zone
 * qui défile. Il reste visible où qu'on soit dans la fiche, sans jamais la masquer.
 */
export function PageFxOverlay({ fx }: { fx: FxItem[] }) {
  if (!fx.length) return null
  return <div aria-hidden="true" className="pointer-events-none sticky top-0 z-[5] h-0 w-full">
    <div className="absolute inset-x-0 top-0 h-[var(--eraser-viewport,100svh)] overflow-hidden [contain:strict]"><PortraitFx fx={fx} variant="page" /></div>
  </div>
}
