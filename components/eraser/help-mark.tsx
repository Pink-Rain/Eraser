"use client"

import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

/**
 * Le petit « ? » d'une notion : son explication au survol (ou au toucher). Ce n'est pas un
 * bouton — il peut se poser dans une ligne qui en est déjà un (compétence de la fiche) —
 * et un clic dessus n'ouvre pas ce qui l'entoure. `className` : souvent caché tant que la
 * ligne n'est pas survolée (`opacity-0 group-hover/…:opacity-100`). Sans contenu, rien.
 */
export function HelpMark({ children, title, className = "" }: { children?: ReactNode; title?: string; className?: string }) {
  if (!children) return null
  return <HoverCard openDelay={120} closeDelay={80}>
    <HoverCardTrigger asChild>
      <span
        role="note"
        tabIndex={0}
        aria-label={title ? `À propos de ${title}` : "À propos"}
        onClick={(event) => { event.stopPropagation(); event.preventDefault() }}
        className={`inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-full align-[-2px] transition-opacity focus-visible:opacity-100 focus-visible:outline-none ${className}`}
      ><CircleHelp className="size-full" /></span>
    </HoverCardTrigger>
    <HoverCardContent side="top" align="start" collisionPadding={12} className="max-h-[min(28rem,70vh)] w-80 overflow-y-auto rounded-xl p-3 text-left text-xs font-normal normal-case leading-5 tracking-normal text-popover-foreground">
      {title && <p className="mb-1.5 font-display text-sm font-semibold">{title}</p>}
      {children}
    </HoverCardContent>
  </HoverCard>
}
