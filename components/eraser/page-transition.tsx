"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import { PageSkeleton, type PageSkeletonVariant } from "@/components/eraser/deferred-content-loading"
import { indexPages } from "@/lib/index-pages"

const NAVIGATION_START = "eraser:navigation-start"

type Pending = { from: string; to: string; title: string }

/** Le squelette qui ressemble à la page de destination. */
export function skeletonFor(pathname: string): { variant: PageSkeletonVariant; eyebrow?: string } {
  if (pathname.startsWith("/personnage/")) return { variant: "sheet" }
  if (/^\/campagne\/[^/]+\/?$/.test(pathname)) return { variant: "dashboard" }
  if (/^\/ressources\/(index-des-|index\/|sorts-des-creatures)/.test(pathname)) return { variant: "index", eyebrow: "Index" }
  if (pathname.startsWith("/administration")) return { variant: "page", eyebrow: "Administration" }
  if (pathname.startsWith("/regles")) return { variant: "page", eyebrow: "Règles" }
  return { variant: "page" }
}

function pathOf(url: string) {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.origin === window.location.origin ? parsed.pathname : null
  } catch {
    return null
  }
}

/**
 * La page vers laquelle on part, tant qu'elle n'est pas affichée. Le signal vient du
 * routeur (instrumentation-client.ts) : un clic qui ne navigue pas ne déclenche rien.
 * `names` donne le titre d'une page connue (personnage, campagne) dès le clic.
 */
export function usePendingPage(names: (pathname: string) => string | undefined, content: unknown) {
  const pathname = usePathname()
  const current = useRef(pathname)
  useEffect(() => { current.current = pathname }, [pathname])
  const namesRef = useRef(names)
  useEffect(() => { namesRef.current = names })
  const [pending, setPending] = useState<Pending | null>(null)
  // Le dernier lien cliqué : son libellé sert de titre à la page qui s'ouvre.
  const lastClick = useRef<{ to: string; label: string; at: number } | null>(null)

  useEffect(() => {
    let timer = 0
    function onClick(event: MouseEvent) {
      const element = (event.target as Element | null)?.closest?.("a[href], [data-tab-href]")
      if (!element) return
      const to = pathOf(element.getAttribute("data-tab-href") || element.getAttribute("href") || "")
      if (!to) return
      const label = element.getAttribute("data-tab-label") || element.getAttribute("aria-label") || element.textContent || ""
      lastClick.current = { to, label: label.replace(/\s+/g, " ").trim().slice(0, 90), at: Date.now() }
    }
    function onStart(event: Event) {
      const to = pathOf((event as CustomEvent<{ url?: string }>).detail?.url ?? "")
      const from = current.current
      if (!to || to === from) return
      const clicked = lastClick.current && lastClick.current.to === to && Date.now() - lastClick.current.at < 3000 ? lastClick.current.label : ""
      const known = indexPages.find((page) => page.href === to)?.label
      const next = { from, to, title: known || namesRef.current(to) || clicked }
      // Le routeur nous prévient depuis sa transition : une mise à jour faite là attendrait
      // la fin de la navigation. Hors transition, le squelette s'affiche tout de suite.
      queueMicrotask(() => setPending(next))
      // Garde-fou : une navigation perdue ne laisse jamais le squelette affiché.
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setPending(null), 20_000)
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener(NAVIGATION_START, onStart)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("click", onClick, true)
      window.removeEventListener(NAVIGATION_START, onStart)
    }
  }, [])

  // Une page arrivée (même redirigée vers celle où l'on était) efface le squelette.
  const [seenContent, setSeenContent] = useState(content)
  if (seenContent !== content) {
    setSeenContent(content)
    if (pending) setPending(null)
  }

  // Dès que la nouvelle page est affichée (l'adresse a changé), le squelette s'efface.
  return pending && pending.from === pathname ? pending : null
}

/** La page de destination, affichée au clic, sans ses données. */
export function PendingPage({ pending }: { pending: Pending }) {
  const { variant, eyebrow } = skeletonFor(pending.to)
  return <PageSkeleton variant={variant} eyebrow={eyebrow} title={pending.title || undefined} label="Ouverture de la page" />
}
