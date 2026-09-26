"use client"

import { useState, type ReactNode } from "react"

import { objectIconImage } from "@/lib/object-icons"

/**
 * Icône d'un objet : ce que contient sa case « Icône » (image du Drive, adresse
 * d'image, émoji). Une case vide ou une ancienne icône générée prend l'icône
 * d'Eraser ; une image qui ne se charge pas aussi.
 */
export function ObjectIcon({ icon, name, type, subtype, className = "size-full", emojiClassName = "text-xl", fallback = null }: {
  icon?: string
  name: string
  type?: string
  subtype?: string
  className?: string
  emojiClassName?: string
  fallback?: ReactNode
}) {
  const image = objectIconImage(icon, name, type || "", subtype || "")
  const [failed, setFailed] = useState("")
  if (image) {
    const src = failed === image.src ? image.fallback : image.src
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} onError={() => { if (src !== image.fallback) setFailed(image.src) }} className={`${className} object-contain`} />
  }
  const value = (icon || "").trim()
  if (value) return <span className={emojiClassName} aria-hidden="true">{value}</span>
  return <>{fallback}</>
}
