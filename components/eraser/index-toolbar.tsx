"use client"

import { useEffect, useState, type ComponentProps, type ReactNode } from "react"
import { ExternalLink, Maximize2, Minimize2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Un bouton de barre d'index réduit à son icône : son nom s'affiche au survol (et reste lu
 * par les lecteurs d'écran). `href` en fait un lien ouvert dans le navigateur.
 */
export function ToolbarIconButton({ label, href, children, variant = "outline", className, ...props }: Omit<ComponentProps<typeof Button>, "size" | "title"> & { label: ReactNode; href?: string }) {
  const name = typeof label === "string" ? label : undefined
  const button = href
    ? <Button asChild variant={variant} size="icon" className={className} aria-label={name}><a href={href} target="_blank" rel="noreferrer">{children}</a></Button>
    : <Button type="button" variant={variant} size="icon" className={className} aria-label={name} {...props}>{children}</Button>
  return <TooltipProvider delayDuration={150}>
    <Tooltip>
      {/* Un bouton désactivé ne reçoit pas le survol : l'enveloppe, si. */}
      <TooltipTrigger asChild>{props.disabled ? <span className="inline-flex" tabIndex={0}>{button}</span> : button}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-64">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
}

/** « Ouvrir dans Sheets », réduit à son icône. */
export function SheetsLinkButton({ href }: { href: string }) {
  return <ToolbarIconButton href={href} variant="ghost" label="Ouvrir dans Google Sheets"><ExternalLink /></ToolbarIconButton>
}

/**
 * Le tableau en plein écran : seul le tableau (avec sa barre de mise en forme) passe
 * par-dessus le menu et la page. Échap (hors d'une case en cours de saisie) ou le bouton de
 * sa barre le remet à sa place. Les fenêtres et menus ouverts depuis le tableau restent
 * au-dessus (ils sont rendus à la racine de la page).
 */
export function useFullscreenPanel() {
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    const leave = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      // Échap ferme d'abord la fenêtre ou le menu ouvert, ou quitte la case en cours de saisie.
      if (document.querySelector("[role=dialog],[role=menu],[data-radix-popper-content-wrapper]")) return
      const active = document.activeElement
      if (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return
      setFullscreen(false)
    }
    window.addEventListener("keydown", leave)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", leave); document.body.style.overflow = overflow }
  }, [fullscreen])
  return {
    fullscreen,
    toggle: () => setFullscreen((current) => !current),
    exit: () => setFullscreen(false),
  }
}

export function FullscreenButton({ fullscreen, onToggle }: { fullscreen: boolean; onToggle: () => void }) {
  return <ToolbarIconButton variant="ghost" label={fullscreen ? "Quitter le plein écran (Échap)" : "Tableau en plein écran"} onClick={onToggle} aria-pressed={fullscreen}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</ToolbarIconButton>
}

/** La barre d'un index : ses éléments passent à la ligne plutôt que de se chevaucher. */
export function indexToolbarClassName(extra?: string) {
  return cn("flex flex-wrap items-end gap-2", extra)
}
