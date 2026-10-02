"use client"

import type { CSSProperties } from "react"

import type { StateFx } from "@/lib/state-fx"

/** Les FX qui se posent par-dessus le portrait (calques) ; les autres changent l'image elle-même. */
const layerClass: Partial<Record<StateFx, string>> = {
  Pulsation: "eraser-fx-pulse",
  Aura: "eraser-fx-aura",
  Flammes: "eraser-fx-flames",
  Givre: "eraser-fx-frost",
  Suintement: "eraser-fx-drip",
  Spirale: "eraser-fx-spiral",
  Brume: "eraser-fx-mist",
}

const imageClass: Partial<Record<StateFx, string>> = {
  Tremblement: "eraser-fx-shake",
  Flou: "eraser-fx-blur",
  Transparence: "eraser-fx-ghost",
  "Désaturé": "eraser-fx-grey",
}

/** Les classes à poser sur l'image du portrait (tremblement, flou…). */
export function portraitImageFxClass(fx: Array<{ name: StateFx }>) {
  return fx.map((item) => imageClass[item.name]).filter(Boolean).join(" ")
}

/** Les calques des FX des états sur le portrait, chacun teinté par la couleur de son effet. */
export function PortraitFx({ fx }: { fx: Array<{ name: StateFx; color: string }> }) {
  return <>{fx.flatMap((item) => {
    const className = layerClass[item.name]
    return className ? [<span key={item.name} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`} style={{ "--fx": item.color || "#a8a29e" } as CSSProperties} />] : []
  })}</>
}
