"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

/**
 * Les onglets de l'application. Un seul rendu existe à la fois : un onglet n'est que
 * l'adresse et le titre d'une page mise de côté. L'onglet actif, lui, n'a rien à
 * mémoriser — son adresse est celle de la page affichée et son titre celui de
 * l'en-tête. Rien n'est donc à resynchroniser après une navigation, ce qui évite
 * toute une famille de décalages entre la barre d'onglets et la page réelle.
 */
export type AppTab = { id: string; href: string; label: string }

type AppTabsValue = {
  tabs: AppTab[]
  activeId: string
  open: (href: string, label: string) => void
  close: (id: string) => void
  select: (id: string) => void
}

const AppTabsContext = createContext<AppTabsValue | null>(null)

export function useAppTabs() {
  return useContext(AppTabsContext)
}

const ACTIVE_ID = "actif"

function labelFromLink(link: HTMLAnchorElement) {
  return (link.getAttribute("aria-label") || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) || "Page"
}

/** Une adresse de l'application, pas un lien sortant ni une ancre. */
function internalHref(link: HTMLAnchorElement) {
  const raw = link.getAttribute("href") || ""
  if (!raw.startsWith("/") || raw.startsWith("//")) return ""
  if (link.target === "_blank") return ""
  return raw
}

export function AppTabsProvider({ pathname, label, children }: { pathname: string; label: string; children: ReactNode }) {
  const router = useRouter()
  // L'onglet actif est implicite : il porte toujours la page affichée. Cette liste ne
  // contient donc que les pages mises de côté.
  const [parked, setParked] = useState<AppTab[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; href: string; label: string } | null>(null)

  const tabs = useMemo<AppTab[]>(() => [{ id: ACTIVE_ID, href: pathname, label }, ...parked], [label, parked, pathname])

  const open = useCallback((href: string, tabLabel: string) => {
    // Comme dans un navigateur, le nouvel onglet s'ouvre en arrière-plan : la page
    // en cours n'est jamais interrompue.
    setParked((current) => current.some((tab) => tab.href === href) ? current : [...current, { id: `${href}:${Date.now()}`, href, label: tabLabel }])
  }, [])

  const close = useCallback((id: string) => {
    if (id !== ACTIVE_ID) return setParked((current) => current.filter((tab) => tab.id !== id))
    // Fermer l'onglet affiché : la page passe à celle du premier onglet mis de côté.
    const [next, ...rest] = parked
    if (!next) return
    setParked(rest)
    router.push(next.href)
  }, [parked, router])

  const select = useCallback((id: string) => {
    if (id === ACTIVE_ID) return
    const target = parked.find((tab) => tab.id === id)
    if (!target) return
    // La page quittée prend la place de celle qu'on ouvre : rien ne se perd.
    setParked(parked.map((tab) => tab.id === id ? { id: `${pathname}:${Date.now()}`, href: pathname, label } : tab))
    router.push(target.href)
  }, [label, parked, pathname, router])

  // Un clic droit sur un lien de l'application propose de l'ouvrir dans un onglet.
  // Ailleurs — en particulier dans une zone de texte — le menu du système reste,
  // avec ses corrections orthographiques.
  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      // Hors de l'application Windows il n'y a pas de barre de titre pour porter les
      // onglets, et le navigateur propose déjà les siens : on lui laisse son menu.
      if (document.documentElement.dataset.eraserTitlebar !== "true") return
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link) return
      const href = internalHref(link)
      if (!href) return
      event.preventDefault()
      setMenu({ x: event.clientX, y: event.clientY, href, label: labelFromLink(link) })
    }
    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [])

  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    window.addEventListener("pointerdown", dismiss)
    window.addEventListener("blur", dismiss)
    window.addEventListener("resize", dismiss)
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("blur", dismiss); window.removeEventListener("resize", dismiss) }
  }, [menu])

  const value = useMemo<AppTabsValue>(() => ({ tabs, activeId: ACTIVE_ID, open, close, select }), [close, open, select, tabs])

  return <AppTabsContext.Provider value={value}>
    {children}
    {menu && <div
      role="menu"
      className="fixed z-[200] min-w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: Math.min(menu.x, (typeof window === "undefined" ? 0 : window.innerWidth) - 220), top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => { open(menu.href, menu.label); setMenu(null) }} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground">
        Ouvrir dans un nouvel onglet
      </button>
      <button type="button" role="menuitem" onClick={() => { router.push(menu.href); setMenu(null) }} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground">
        Ouvrir ici
      </button>
    </div>}
  </AppTabsContext.Provider>
}

type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" }
const noDragStyle: AppRegionStyle = { WebkitAppRegion: "no-drag" }

/** La bande d'onglets, affichée dans la barre de titre de l'application Windows. */
export function AppTabStrip() {
  const value = useAppTabs()
  if (!value || value.tabs.length < 2) return null
  return <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={noDragStyle} onMouseDown={(event) => event.stopPropagation()}>
    {value.tabs.map((tab) => {
      const active = tab.id === value.activeId
      return <div
        key={tab.id}
        className={`group flex min-w-0 max-w-48 shrink-0 items-center gap-1 rounded-t-md border-b-2 px-2 py-1 text-xs transition-colors ${active ? "border-[#e0bd82] bg-white/10 text-[#f6d49b]" : "border-transparent text-[#e0bd82]/60 hover:bg-white/5 hover:text-[#e0bd82]"}`}
      >
        <button type="button" onClick={() => value.select(tab.id)} className="min-w-0 flex-1 truncate text-left" title={tab.label}>{tab.label}</button>
        <button type="button" onClick={() => value.close(tab.id)} aria-label={`Fermer l’onglet ${tab.label}`} className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/15 group-hover:opacity-100"><X className="size-3" /></button>
      </div>
    })}
  </div>
}
