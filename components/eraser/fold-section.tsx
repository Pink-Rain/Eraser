"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, LoaderCircle } from "lucide-react"

import { OPEN_SECTIONS_PARAM, openSectionsOf } from "@/lib/open-sections"
import { cn } from "@/lib/utils"

/**
 * Une partie repliable d'une page (titre, petite description, flèche). Repliée, son contenu
 * n'est pas monté : rien n'est lu ni dessiné pour elle.
 *
 * - `serverOpen` donné : le contenu vient du serveur et n'est calculé qu'une fois la partie
 *   dépliée. Le clic change l'adresse (`?ouvert=…`), et la page se relit sans squelette.
 * - sinon : le pli est gardé sur cet ordinateur (`defaultOpen` la première fois).
 */
export function FoldSection({ id, title, eyebrow, summary, icon, badge, defaultOpen = false, serverOpen, className, children }: {
  id: string
  title: string
  eyebrow?: string
  summary?: ReactNode
  icon?: ReactNode
  badge?: ReactNode
  defaultOpen?: boolean
  serverOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const storageKey = `eraser:fold:${pathname}:${id}`
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  useEffect(() => {
    if (serverOpen !== undefined) return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored !== null) queueMicrotask(() => setLocalOpen(stored === "1"))
    } catch { /* stockage indisponible : le pli d'origine */ }
  }, [serverOpen, storageKey])
  // Dépliée tout de suite au clic, même si le serveur prépare encore son contenu.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const open = serverOpen === undefined ? localOpen : optimistic ?? serverOpen
  const [seenServerOpen, setSeenServerOpen] = useState(serverOpen)
  if (seenServerOpen !== serverOpen) { setSeenServerOpen(serverOpen); setOptimistic(null) }

  function toggle() {
    const next = !open
    if (serverOpen === undefined) {
      setLocalOpen(next)
      try { window.localStorage.setItem(storageKey, next ? "1" : "0") } catch { /* le pli vaut pour cette visite */ }
      return
    }
    setOptimistic(next)
    const params = new URLSearchParams(searchParams.toString())
    const sections = openSectionsOf(params.get(OPEN_SECTIONS_PARAM) ?? "")
    if (next) sections.add(id); else sections.delete(id)
    if (sections.size) params.set(OPEN_SECTIONS_PARAM, [...sections].join(",")); else params.delete(OPEN_SECTIONS_PARAM)
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  return <section className={cn("rounded-2xl border bg-card/90 shadow-[0_10px_35px_rgb(67_50_31/0.06)]", className)}>
    <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 rounded-2xl p-5 text-left transition-colors hover:bg-muted/30 sm:p-6">
      {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>}
      <span className="min-w-0 flex-1">
        {eyebrow && <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">{eyebrow}</span>}
        <span className={cn("block font-display text-xl font-semibold sm:text-2xl", eyebrow && "mt-1")}>{title}</span>
        {summary && <span className="mt-1 block text-sm leading-6 text-muted-foreground">{summary}</span>}
      </span>
      {badge}
      {pending ? <LoaderCircle className="size-5 shrink-0 animate-spin text-muted-foreground" /> : <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
    </button>
    {open && <div className="border-t px-5 pb-5 pt-5 sm:px-6 sm:pb-6">{children}</div>}
  </section>
}
