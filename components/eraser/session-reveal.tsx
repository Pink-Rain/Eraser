"use client"

import { createContext, useContext, type ReactNode } from "react"
import { Eye, EyeOff, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SessionRevealKind } from "@/lib/session-reveal"

/**
 * Ce que le Créateur de session révèle aux joueurs : chaque carte de la session (joueur, PNJ,
 * magasin, événement) y pose son œil. Hors du Créateur (pages PNJs, Magasins), pas de contexte :
 * l'œil ne s'affiche pas.
 */
type SessionReveal = {
  isHidden: (kind: SessionRevealKind, id: string) => boolean
  toggle: (kind: SessionRevealKind, id: string) => void
  /** La chose dont la visibilité s'enregistre en ce moment (« npc:ID »). */
  saving: string | null
}

const SessionRevealContext = createContext<SessionReveal | null>(null)

export function SessionRevealProvider({ value, children }: { value: SessionReveal; children: ReactNode }) {
  return <SessionRevealContext.Provider value={value}>{children}</SessionRevealContext.Provider>
}

/** L'œil d'une chose de la session : barré, elle n'est pas dans le journal des joueurs ; un clic la révèle. */
export function RevealToggle({ kind, id, name, className = "" }: { kind: SessionRevealKind; id: string; name: string; className?: string }) {
  const reveal = useContext(SessionRevealContext)
  if (!reveal) return null
  const hidden = reveal.isHidden(kind, id)
  const saving = reveal.saving === `${kind}:${id}`
  const label = hidden ? `Caché aux joueurs : révéler ${name} dans le journal de la session` : `Révélé aux joueurs : cacher ${name} du journal de la session`
  return <Button type="button" size="icon-sm" variant={hidden ? "ghost" : "secondary"} aria-pressed={!hidden} disabled={saving} title={hidden ? "Caché aux joueurs — cliquer pour le révéler dans le journal" : "Révélé dans le journal — cliquer pour le cacher"} aria-label={label} onClick={() => reveal.toggle(kind, id)} className={`${hidden ? "text-muted-foreground" : "text-primary"} ${className}`}>
    {saving ? <LoaderCircle className="animate-spin" /> : hidden ? <EyeOff /> : <Eye />}
  </Button>
}

/** « Tout révéler » / « Tout cacher », en haut du Créateur de session, avec le compte de ce qui est caché. */
export function RevealAllBar({ hiddenCount, total, pending, onAll }: { hiddenCount: number; total: number; pending: boolean; onAll: (all: "reveal" | "hide") => void }) {
  if (!total) return null
  return <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/65 px-3 py-2 text-sm">
    <EyeOff className="size-4 text-muted-foreground" />
    <span className="text-muted-foreground">{hiddenCount ? `${hiddenCount} sur ${total} caché${hiddenCount > 1 ? "s" : ""} aux joueurs : le journal de la session ne montre que ce qui est révélé.` : "Tout est révélé dans le journal de la session."}</span>
    <div className="ml-auto flex gap-2">
      <Button type="button" size="sm" variant="outline" disabled={pending || !hiddenCount} onClick={() => onAll("reveal")}><Eye />Tout révéler</Button>
      <Button type="button" size="sm" variant="outline" disabled={pending || hiddenCount === total} onClick={() => onAll("hide")}><EyeOff />Tout cacher</Button>
    </div>
  </div>
}
