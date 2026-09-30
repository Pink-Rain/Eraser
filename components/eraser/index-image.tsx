import type { ReactNode } from "react"

import { isImageSource } from "@/lib/index-columns"

/**
 * Le contenu d'une colonne « Image » : une image (importée ou par adresse), ou le
 * symbole saisi à sa place — l'icône « 🗡️ » d'un objet reste un symbole.
 */
export function IndexImage({ value, alt, className = "", fallback }: { value: string; alt: string; className?: string; fallback?: ReactNode }) {
  const trimmed = value.trim()
  // eslint-disable-next-line @next/next/no-img-element
  if (isImageSource(trimmed)) return <img src={trimmed} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} />
  if (trimmed && trimmed.length <= 8) return <span className={`grid place-items-center leading-none ${className}`} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>{trimmed}</span>
  return <>{fallback ?? null}</>
}
