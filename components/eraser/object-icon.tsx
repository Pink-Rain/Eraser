import type { ReactNode } from "react"

import { objectIconSource, resolvedObjectIcon } from "@/lib/object-icons"

/**
 * Icône d'un objet : l'icône croquis d'Eraser, ou l'émoji choisi à la main.
 * Les anciennes icônes générées (émojis) sont remplacées à l'affichage, y compris
 * dans les magasins déjà enregistrés.
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
  const value = resolvedObjectIcon(icon, name, type || "", subtype || "")
  const source = objectIconSource(value)
  // Une adresse d'image saisie à la main s'affiche telle quelle.
  // eslint-disable-next-line @next/next/no-img-element
  if (/^(?:https?:\/\/|\/)/i.test(value)) return <img src={value} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} className={`${className} object-cover`} />
  // eslint-disable-next-line @next/next/no-img-element
  if (source) return <img src={source} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} className={`${className} object-contain`} />
  if (value) return <span className={emojiClassName} aria-hidden="true">{value}</span>
  return <>{fallback}</>
}
