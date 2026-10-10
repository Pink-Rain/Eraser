"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Plus, RotateCw, X } from "lucide-react"

/**
 * Les onglets de l'application, comme ceux d'un navigateur. Un seul rendu existe à la
 * fois : un onglet est une adresse, un titre et son propre historique (précédent /
 * suivant). Les onglets gardent leur place : sélectionner un onglet ne le déplace
 * pas, seul un glisser-déposer change l'ordre. Un onglet glissé hors de la fenêtre
 * ouvre une nouvelle fenêtre ; déposé sur une autre fenêtre d'Eraser, il la rejoint.
 * L'état vit dans le sessionStorage de la fenêtre : « Actualiser » ne le perd pas.
 */
export type AppTab = { id: string; href: string; label: string; back: string[]; forward: string[] }
type TabsState = { tabs: AppTab[]; activeId: string }

type AppTabsValue = {
  tabs: AppTab[]
  activeId: string
  canGoBack: boolean
  canGoForward: boolean
  /** Ouvre une page dans un nouvel onglet, en arrière-plan (ou au premier plan avec `focus`). */
  open: (href: string, label: string, options?: { focus?: boolean }) => void
  openWindow: (href: string) => void
  close: (id: string) => void
  select: (id: string) => void
  move: (id: string, toIndex: number) => void
  insert: (tab: Pick<AppTab, "href" | "label">, index: number) => void
  remove: (id: string) => void
  back: () => void
  forward: () => void
  reload: () => void
  /** Une actualisation est en cours : l'icône tourne, la page reste affichée. */
  refreshing: boolean
}

const AppTabsContext = createContext<AppTabsValue | null>(null)

export function useAppTabs() {
  return useContext(AppTabsContext)
}

const STORAGE_KEY = "eraser:tabs:v2"
const HISTORY_LIMIT = 50
export const TAB_DRAG_TYPE = "application/x-eraser-tab"
/** Événement à émettre après avoir changé l'adresse sans navigation (ex. `?classe=`). */
export const URL_CHANGE_EVENT = "eraser:url-change"
/**
 * Posé sur une page qui lit elle-même son `?…` (ex. `data-in-place-path="/creation-de-classe"`) :
 * y changer seulement de paramètres ne recharge pas la page, l'adresse est remplacée
 * et la page prévenue par `URL_CHANGE_EVENT`.
 */
export const IN_PLACE_ATTRIBUTE = "data-in-place-path"

/**
 * Change l'adresse affichée sans navigation, puis prévient les onglets et la page.
 * `record: false` : l'onglet garde la nouvelle adresse sans créer d'étape « précédent »
 * (choix d'une session, d'une carte…).
 */
export function replaceAppUrl(href: string | URL, { record = true }: { record?: boolean } = {}) {
  window.history.replaceState(window.history.state, "", href)
  window.dispatchEvent(new CustomEvent(URL_CHANGE_EVENT, { detail: { record } }))
}

/**
 * Avant une actualisation complète, les pages qui enregistrent encore quelque chose (une
 * fiche dont une case part vers Google) le terminent : sinon le rechargement l'aurait
 * bloqué ou interrompu. Elles s'inscrivent avec `event.detail.waitFor(promesse)`.
 */
export const BEFORE_HARD_REFRESH_EVENT = "eraser:before-hard-refresh"
export type BeforeHardRefreshDetail = { waitFor: (promise: Promise<unknown>) => void }

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * Actualise vraiment : le serveur local oublie ce qu'il a gardé de Google Sheets, puis la
 * fenêtre entière se recharge et relit tout (les onglets ouverts restent, ils vivent dans
 * le sessionStorage). Avant, « Actualiser » ne redemandait que la page et pouvait resservir
 * les données gardées en mémoire.
 */
async function hardRefresh() {
  const pending: Promise<unknown>[] = []
  const detail: BeforeHardRefreshDetail = { waitFor: (promise) => { pending.push(promise) } }
  window.dispatchEvent(new CustomEvent<BeforeHardRefreshDetail>(BEFORE_HARD_REFRESH_EVENT, { detail }))
  await Promise.race([Promise.allSettled(pending), pause(10_000)])
  await Promise.race([fetch("/api/refresh", { method: "POST", cache: "no-store" }).catch(() => undefined), pause(5_000)])
  window.location.reload()
}

function navigate(router: ReturnType<typeof useRouter>, href: string) {
  const target = new URL(href, window.location.origin)
  const inPlace = target.pathname === window.location.pathname
    && [...document.querySelectorAll(`[${IN_PLACE_ATTRIBUTE}]`)].some((node) => node.getAttribute(IN_PLACE_ATTRIBUTE) === target.pathname)
  if (inPlace) replaceAppUrl(href)
  else router.push(href)
}

function newId() {
  return `onglet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function currentHref() {
  return `${window.location.pathname}${window.location.search}`
}

function makeTab(href: string, label: string): AppTab {
  return { id: newId(), href, label, back: [], forward: [] }
}

function readStored(): TabsState | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null") as TabsState | null
    if (!parsed || !Array.isArray(parsed.tabs) || !parsed.tabs.length) return null
    const tabs = parsed.tabs.filter((tab) => tab && typeof tab.href === "string" && tab.href.startsWith("/")).map((tab) => ({
      id: String(tab.id || newId()), href: tab.href, label: String(tab.label || "Page"),
      back: Array.isArray(tab.back) ? tab.back.filter((item) => typeof item === "string") : [],
      forward: Array.isArray(tab.forward) ? tab.forward.filter((item) => typeof item === "string") : [],
    }))
    if (!tabs.length) return null
    return { tabs, activeId: tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id }
  } catch {
    return null
  }
}

function initialState(label: string): TabsState {
  if (typeof window === "undefined") {
    const tab = { id: "onglet-initial", href: "/", label, back: [], forward: [] }
    return { tabs: [tab], activeId: tab.id }
  }
  const href = currentHref()
  const stored = readStored()
  if (stored) {
    // La page affichée appartient à l'onglet actif ; s'il pointait ailleurs (fenêtre
    // rouverte sur une autre adresse), l'onglet actif prend l'adresse réelle.
    return { ...stored, tabs: stored.tabs.map((tab) => tab.id === stored.activeId ? { ...tab, href } : tab) }
  }
  const tab = makeTab(href, label)
  return { tabs: [tab], activeId: tab.id }
}

function labelFromElement(element: HTMLElement) {
  return (element.dataset.tabLabel || element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) || "Page"
}

/** Une adresse de l'application, pas un lien sortant ni une ancre. */
export function internalHref(raw: string) {
  if (!raw) return ""
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw
  try {
    const url = new URL(raw, window.location.href)
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : ""
  } catch {
    return ""
  }
}

/** Ce qui s'ouvre au clic droit : un lien de l'application ou un élément `data-tab-href`. */
function openableTarget(target: EventTarget | null) {
  const element = (target as HTMLElement | null)?.closest?.("[data-tab-href], a[href]") as HTMLElement | null
  if (!element) return null
  if (element instanceof HTMLAnchorElement && element.target === "_blank") return null
  const href = internalHref(element.dataset.tabHref || element.getAttribute("href") || "")
  return href ? { href, label: labelFromElement(element) } : null
}

function isDesktop() {
  return typeof document !== "undefined" && document.documentElement.dataset.eraserTitlebar === "true"
}

export function AppTabsProvider({ pathname, label, children }: { pathname: string; label: string; children: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<TabsState>(() => initialState(label))
  const [menu, setMenu] = useState<{ x: number; y: number; href: string; label: string } | null>(null)
  // Adresse attendue après une navigation lancée par les onglets eux-mêmes (sélection,
  // précédent, suivant) : elle ne doit pas s'inscrire dans l'historique de l'onglet.
  const expected = useRef<string | null>(null)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const active = state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0]

  // La page affichée (adresse, titre) appartient toujours à l'onglet actif.
  useEffect(() => {
    function sync(event?: Event) {
      const quiet = event instanceof CustomEvent && event.detail?.record === false
      const href = currentHref()
      setState((current) => {
        const activeTab = current.tabs.find((tab) => tab.id === current.activeId)
        if (!activeTab) {
          const tab = makeTab(href, label)
          return { tabs: [...current.tabs, tab], activeId: tab.id }
        }
        if (activeTab.href === href) return activeTab.label === label ? current : { ...current, tabs: current.tabs.map((tab) => tab.id === activeTab.id ? { ...tab, label } : tab) }
        const fromTabs = quiet || expected.current === href
        if (!quiet) expected.current = null
        return {
          ...current,
          tabs: current.tabs.map((tab) => tab.id !== activeTab.id ? tab : fromTabs
            ? { ...tab, href, label }
            : { ...tab, href, label, back: [...tab.back, tab.href].slice(-HISTORY_LIMIT), forward: [] }),
        }
      })
    }
    const timer = window.setTimeout(sync, 0)
    window.addEventListener(URL_CHANGE_EVENT, sync)
    return () => { window.clearTimeout(timer); window.removeEventListener(URL_CHANGE_EVENT, sync) }
  }, [label, pathname])

  useEffect(() => {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* aperçu sans stockage */ }
  }, [state])

  const go = useCallback((href: string) => {
    expected.current = href
    navigate(router, href)
  }, [router])

  const open = useCallback((href: string, tabLabel: string, options: { focus?: boolean } = {}) => {
    const tab = makeTab(href, tabLabel)
    // Comme dans un navigateur : le nouvel onglet se place juste après l'onglet actif
    // et les suivants ; il s'ouvre en arrière-plan sauf demande contraire.
    setState((current) => {
      const index = current.tabs.findIndex((item) => item.id === current.activeId)
      const tabs = [...current.tabs]
      tabs.splice(index < 0 ? tabs.length : index + 1, 0, tab)
      return { tabs, activeId: options.focus ? tab.id : current.activeId }
    })
    if (options.focus) go(href)
  }, [go])

  const openWindow = useCallback((href: string) => {
    const bridge = window.eraserDesktop
    if (bridge?.openWindow) void bridge.openWindow(href)
    else open(href, "Page")
  }, [open])

  const select = useCallback((id: string) => {
    const current = stateRef.current
    const target = current.tabs.find((tab) => tab.id === id)
    if (!target || id === current.activeId) return
    setState({ ...current, activeId: id })
    go(target.href)
  }, [go])

  /** Retire un onglet sans navigation ailleurs que nécessaire ; la fenêtre vide se ferme. */
  const remove = useCallback((id: string) => {
    const current = stateRef.current
    const index = current.tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const tabs = current.tabs.filter((tab) => tab.id !== id)
    if (!tabs.length) {
      try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* rien à nettoyer */ }
      void window.eraserDesktop?.windowClose()
      return
    }
    if (id !== current.activeId) return setState({ ...current, tabs })
    const next = tabs[Math.min(index, tabs.length - 1)]
    setState({ tabs, activeId: next.id })
    go(next.href)
  }, [go])

  const close = useCallback((id: string) => {
    // Le dernier onglet ne ferme pas la fenêtre principale par erreur : il revient à l'accueil.
    const current = stateRef.current
    if (current.tabs.length === 1) {
      const only = current.tabs[0]
      if (only.href !== "/") { setState({ tabs: [{ ...only, href: "/", label: "Accueil", back: [...only.back, only.href].slice(-HISTORY_LIMIT), forward: [] }], activeId: only.id }); go("/") }
      return
    }
    remove(id)
  }, [go, remove])

  const move = useCallback((id: string, toIndex: number) => {
    setState((current) => {
      const from = current.tabs.findIndex((tab) => tab.id === id)
      if (from < 0) return current
      const tabs = [...current.tabs]
      const [tab] = tabs.splice(from, 1)
      tabs.splice(Math.max(0, Math.min(tabs.length, from < toIndex ? toIndex - 1 : toIndex)), 0, tab)
      return { ...current, tabs }
    })
  }, [])

  /** Un onglet venu d'une autre fenêtre : il est inséré et affiché. */
  const insert = useCallback((incoming: Pick<AppTab, "href" | "label">, index: number) => {
    const tab = makeTab(incoming.href, incoming.label)
    setState((current) => {
      const tabs = [...current.tabs]
      tabs.splice(Math.max(0, Math.min(tabs.length, index)), 0, tab)
      return { tabs, activeId: tab.id }
    })
    go(tab.href)
  }, [go])

  const back = useCallback(() => {
    const current = stateRef.current
    const tab = current.tabs.find((item) => item.id === current.activeId)
    const previous = tab?.back.at(-1)
    if (!tab || !previous) return
    setState({ ...current, tabs: current.tabs.map((item) => item.id === tab.id ? { ...item, href: previous, back: item.back.slice(0, -1), forward: [...item.forward, item.href] } : item) })
    go(previous)
  }, [go])

  const forward = useCallback(() => {
    const current = stateRef.current
    const tab = current.tabs.find((item) => item.id === current.activeId)
    const next = tab?.forward.at(-1)
    if (!tab || !next) return
    setState({ ...current, tabs: current.tabs.map((item) => item.id === tab.id ? { ...item, href: next, forward: item.forward.slice(0, -1), back: [...item.back, item.href].slice(-HISTORY_LIMIT) } : item) })
    go(next)
  }, [go])

  const [refreshing, setRefreshing] = useState(false)
  const reload = useCallback(() => {
    setRefreshing(true)
    // Garde-fou : si le rechargement n'a pas lieu (fiche qui refuse de quitter), l'icône s'arrête.
    void Promise.race([hardRefresh(), pause(30_000)]).finally(() => setRefreshing(false))
  }, [])

  // Un onglet déposé depuis une autre fenêtre ailleurs que sur la barre : il s'ajoute à la fin.
  useEffect(() => {
    const bridge = window.eraserDesktop
    if (!bridge?.onTabAttach) return
    return bridge.onTabAttach((tab) => insert(tab, stateRef.current.tabs.length))
  }, [insert])

  // Clic droit : « ouvrir dans un nouvel onglet » sur tout ce qui s'ouvre. Ailleurs
  // (zone de texte…), le menu du système reste, avec ses corrections orthographiques.
  // Clic du milieu ou Ctrl+clic : nouvel onglet directement, comme dans un navigateur.
  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      if (!isDesktop()) return
      const target = openableTarget(event.target)
      if (!target) return
      event.preventDefault()
      setMenu({ x: event.clientX, y: event.clientY, ...target })
    }
    function onAuxClick(event: MouseEvent) {
      if (!isDesktop() || event.button !== 1) return
      const target = openableTarget(event.target)
      if (!target) return
      event.preventDefault()
      open(target.href, target.label)
    }
    function onClick(event: MouseEvent) {
      if (!isDesktop() || event.button !== 0 || !(event.ctrlKey || event.metaKey)) return
      const target = openableTarget(event.target)
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      open(target.href, target.label)
    }
    // Boutons « précédent » / « suivant » de la souris.
    function onMouseUp(event: MouseEvent) {
      if (!isDesktop()) return
      if (event.button === 3) { event.preventDefault(); back() }
      if (event.button === 4) { event.preventDefault(); forward() }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (!isDesktop()) return
      if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); back() }
      else if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); forward() }
      // F5 (et Ctrl+F5) : actualisation complète, comme le bouton.
      else if (event.key === "F5") { event.preventDefault(); reload() }
      else if (event.ctrlKey && (event.key === "w" || event.key === "W")) { event.preventDefault(); close(stateRef.current.activeId) }
      else if (event.ctrlKey && (event.key === "t" || event.key === "T")) { event.preventDefault(); open("/", "Accueil", { focus: true }) }
      else if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault()
        const { tabs, activeId } = stateRef.current
        const index = tabs.findIndex((tab) => tab.id === activeId)
        const next = tabs[(index + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length]
        if (next) select(next.id)
      }
    }
    document.addEventListener("contextmenu", onContextMenu)
    document.addEventListener("auxclick", onAuxClick)
    document.addEventListener("click", onClick, true)
    document.addEventListener("mouseup", onMouseUp)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("contextmenu", onContextMenu)
      document.removeEventListener("auxclick", onAuxClick)
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("mouseup", onMouseUp)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [back, close, forward, open, reload, select])

  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    window.addEventListener("pointerdown", dismiss)
    window.addEventListener("blur", dismiss)
    window.addEventListener("resize", dismiss)
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("blur", dismiss); window.removeEventListener("resize", dismiss) }
  }, [menu])

  const value = useMemo<AppTabsValue>(() => ({
    tabs: state.tabs,
    activeId: active?.id ?? "",
    canGoBack: Boolean(active?.back.length),
    canGoForward: Boolean(active?.forward.length),
    open, openWindow, close, select, move, insert, remove, back, forward, reload, refreshing,
  }), [active, back, close, forward, insert, move, open, openWindow, refreshing, reload, remove, select, state.tabs])

  const itemClass = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
  return <AppTabsContext.Provider value={value}>
    {children}
    {menu && <div
      role="menu"
      className="pointer-events-auto fixed z-[200] min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      // Le focus reste où il était : un menu déroulant ouvert derrière ne se referme pas.
      onMouseDown={(event) => event.preventDefault()}
      style={{ left: Math.min(menu.x, (typeof window === "undefined" ? 0 : window.innerWidth) - 240), top: Math.min(menu.y, (typeof window === "undefined" ? 0 : window.innerHeight) - 120) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => { open(menu.href, menu.label); setMenu(null) }} className={itemClass}>Ouvrir dans un nouvel onglet</button>
      {typeof window !== "undefined" && window.eraserDesktop?.openWindow && <button type="button" role="menuitem" onClick={() => { openWindow(menu.href); setMenu(null) }} className={itemClass}>Ouvrir dans une nouvelle fenêtre</button>}
      <button type="button" role="menuitem" onClick={() => { navigate(router, menu.href); setMenu(null) }} className={itemClass}>Ouvrir ici</button>
    </div>}
  </AppTabsContext.Provider>
}

type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" }
const noDragStyle: AppRegionStyle = { WebkitAppRegion: "no-drag" }

const navButton = "flex size-7 shrink-0 items-center justify-center rounded-md text-[#e0bd82]/75 transition-colors hover:bg-white/10 hover:text-[#f6d49b] disabled:pointer-events-none disabled:opacity-30"

/** Précédent, suivant, actualiser : l'historique de l'onglet actif. */
export function AppNavButtons() {
  const value = useAppTabs()
  if (!value) return null
  return <div className="flex shrink-0 items-center gap-0.5" style={noDragStyle} onMouseDown={(event) => event.stopPropagation()}>
    <button type="button" className={navButton} disabled={!value.canGoBack} onClick={value.back} aria-label="Page précédente" title="Page précédente (Alt+←)"><ArrowLeft className="size-4" /></button>
    <button type="button" className={navButton} disabled={!value.canGoForward} onClick={value.forward} aria-label="Page suivante" title="Page suivante (Alt+→)"><ArrowRight className="size-4" /></button>
    <button type="button" className={navButton} onClick={value.reload} disabled={value.refreshing} aria-busy={value.refreshing} aria-label="Actualiser" title="Actualiser (F5) : relit les données dans Google"><RotateCw className={`size-3.5 ${value.refreshing ? "animate-spin" : ""}`} /></button>
  </div>
}

function hasTabPayload(event: DragEvent) {
  return event.dataTransfer.types.includes(TAB_DRAG_TYPE)
}

/**
 * La bande d'onglets. Tous les onglets ont la même largeur (ils rétrécissent
 * ensemble quand il y en a beaucoup) et gardent leur place ; on les réordonne en les
 * glissant, on les sort de la fenêtre pour en ouvrir une nouvelle, on les dépose sur
 * une autre fenêtre d'Eraser pour les y ranger.
 */
export function AppTabStrip() {
  const value = useAppTabs()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const droppedHere = useRef(false)
  const stripRef = useRef<HTMLDivElement>(null)
  if (!value) return null
  const tabs = value.tabs

  function indexAt(clientX: number) {
    const nodes = [...(stripRef.current?.querySelectorAll<HTMLElement>("[data-tab-index]") ?? [])]
    for (const node of nodes) {
      const box = node.getBoundingClientRect()
      if (clientX < box.left + box.width / 2) return Number(node.dataset.tabIndex)
    }
    return tabs.length
  }

  function onDragStart(event: DragEvent, tab: AppTab) {
    droppedHere.current = false
    setDragId(tab.id)
    const payload = JSON.stringify({ href: tab.href, label: tab.label })
    // Type propre à Eraser seulement : lâché sur un champ de texte, rien ne s'y colle.
    event.dataTransfer.setData(TAB_DRAG_TYPE, payload)
    event.dataTransfer.effectAllowed = "move"
    void window.eraserDesktop?.tabDragStart?.({ href: tab.href, label: tab.label })
  }

  async function onDragEnd(tab: AppTab) {
    setDragId(null)
    setDropIndex(null)
    if (droppedHere.current) { void window.eraserDesktop?.tabDragCancel?.(); return }
    // Lâché ailleurs : sur une autre fenêtre d'Eraser (qui le garde) ou hors de toute
    // fenêtre (une nouvelle fenêtre s'ouvre). C'est l'application qui tranche.
    const result = await window.eraserDesktop?.tabDragEnd?.({ tabCount: tabs.length }).catch(() => null)
    if (result?.result === "moved") value?.remove(tab.id)
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault()
    const index = dropIndex ?? indexAt(event.clientX)
    setDropIndex(null)
    if (dragId) {
      droppedHere.current = true
      value?.move(dragId, index)
      return
    }
    // Un onglet d'une autre fenêtre : l'application confirme qu'il s'agit bien d'un
    // onglet en cours de déplacement, puis la fenêtre d'origine le retire.
    const claimed = await window.eraserDesktop?.tabDragClaim?.().catch(() => null)
    if (claimed) value?.insert(claimed, index)
  }

  // La bande elle-même reste une zone de déplacement de la fenêtre (comme l'espace
  // vide d'un navigateur) ; seuls les onglets et le bouton « + » captent la souris.
  return <div
    ref={stripRef}
    className="flex h-full min-w-0 flex-1 items-end gap-px overflow-hidden pt-1"
    onDragOver={(event) => { if (!hasTabPayload(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropIndex(indexAt(event.clientX)) }}
    onDragLeave={(event) => { if (!stripRef.current?.contains(event.relatedTarget as Node)) setDropIndex(null) }}
    onDrop={(event) => void onDrop(event)}
  >
    {tabs.map((tab, index) => {
      const active = tab.id === value.activeId
      return <div
        key={tab.id}
        data-tab-index={index}
        style={noDragStyle}
        draggable
        onDragStart={(event) => onDragStart(event, tab)}
        onDragEnd={() => void onDragEnd(tab)}
        onMouseDown={(event) => { event.stopPropagation(); if (event.button === 1) event.preventDefault() }}
        onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); value.close(tab.id) } }}
        onClick={() => value.select(tab.id)}
        title={tab.label}
        className={`group relative flex h-8 min-w-9 max-w-[13rem] flex-1 basis-0 cursor-default items-center gap-1 rounded-t-md px-2.5 text-xs transition-colors ${active ? "bg-[#2e2a24] text-[#f6d49b]" : "text-[#e0bd82]/60 hover:bg-white/5 hover:text-[#e0bd82]"} ${dragId === tab.id ? "opacity-40" : ""}`}
      >
        {dropIndex === index && dragId !== tab.id && <span className="absolute inset-y-1 -left-px w-0.5 rounded bg-[#f6d49b]" />}
        <span className="min-w-0 flex-1 truncate">{tab.label}</span>
        <button type="button" onClick={(event) => { event.stopPropagation(); value.close(tab.id) }} aria-label={`Fermer l’onglet ${tab.label}`} className={`shrink-0 rounded p-0.5 hover:bg-white/15 ${active ? "opacity-80" : "opacity-0 group-hover:opacity-80"}`}><X className="size-3" /></button>
      </div>
    })}
    {dropIndex === tabs.length && <span className="mb-1 h-6 w-0.5 shrink-0 rounded bg-[#f6d49b]" />}
    <button type="button" style={noDragStyle} onMouseDown={(event) => event.stopPropagation()} onClick={() => value.open("/", "Accueil", { focus: true })} className={`${navButton} mb-0.5 ml-0.5`} aria-label="Nouvel onglet" title="Nouvel onglet (Ctrl+T)"><Plus className="size-4" /></button>
    {/* Petite zone de dépôt après le dernier onglet (la bande vide sert à déplacer la fenêtre). */}
    <span className="h-8 w-10 shrink-0" style={noDragStyle} />
  </div>
}
