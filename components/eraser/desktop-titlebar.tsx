"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Minus, Pin, Square, X } from "lucide-react"

import { AppTabStrip, useAppTabs } from "@/components/eraser/app-tabs"
import type { DesktopWindowState } from "@/lib/desktop-bridge"

const APP_TITLE = "Eraser - JDR"
const DOUBLE_CLICK_MS = 400
// Kept in sync by hand with TITLEBAR_HEIGHT/COLLAPSED_WIDTH in desktop/main.cjs
// (the two can't share a literal constant across the IPC boundary).
const TITLEBAR_HEIGHT_PX = 40
const COLLAPSED_WIDTH_PX = 220

// Electron's draggable-region CSS property isn't in React's CSSProperties.
type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" }
const dragStyle: AppRegionStyle = { WebkitAppRegion: "drag" }
const noDragStyle: AppRegionStyle = { WebkitAppRegion: "no-drag" }

// Only rendered inside the desktop app (window.eraserDesktop exists only
// there, injected by desktop/preload.cjs); on the website this returns null
// and nothing about the page layout changes.
export function DesktopTitlebar() {
  const [ready, setReady] = useState(false)
  const tabs = useAppTabs()
  const [state, setState] = useState<DesktopWindowState>({ isMaximized: false, isPinned: false, isCollapsed: false })
  const lastMouseDownAt = useRef(0)

  useEffect(() => {
    const bridge = window.eraserDesktop
    if (!bridge) return
    // Deferred like elsewhere in this app (see usePersistentState): avoids
    // chaining a synchronous setState directly into the effect's own body.
    const timer = window.setTimeout(() => {
      setReady(true)
      bridge.windowGetState().then(setState).catch(() => undefined)
    }, 0)
    const unsubscribe = bridge.onWindowStateChange(setState)
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.eraserTitlebar = "true"
    return () => {
      delete root.dataset.eraserTitlebar
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.eraserPinned = state.isPinned ? "true" : "false"
  }, [state.isPinned])

  useEffect(() => {
    document.documentElement.dataset.eraserCollapsed = state.isCollapsed ? "true" : "false"
  }, [state.isCollapsed])

  if (!ready) return null
  const bridge = window.eraserDesktop
  if (!bridge) return null

  // -webkit-app-region: drag areas swallow the OS-level click sequence Chromium
  // needs to recognize a dblclick (it starts treating mousedown-there as a
  // potential window-move instead), so a plain onDoubleClick here is
  // unreliable — only elements explicitly marked no-drag (the icon, before
  // this fix) ever saw it fire. Detecting the double-click off raw
  // mousedown timestamps instead works uniformly across the whole bar.
  function handleBarMouseDown() {
    // Collapsing pins the window automatically (main.cjs), so the double-click
    // is available whether or not the pin was clicked first.
    const now = Date.now()
    if (now - lastMouseDownAt.current < DOUBLE_CLICK_MS) {
      lastMouseDownAt.current = 0
      void bridge!.windowToggleCollapse().then((result) => setState((current) => ({ ...current, isCollapsed: result.isCollapsed })))
    } else {
      lastMouseDownAt.current = now
    }
  }

  async function togglePin() {
    const result = await bridge!.windowTogglePin()
    setState((current) => ({ ...current, isPinned: result.isPinned, isCollapsed: result.isPinned ? current.isCollapsed : false }))
  }

  return (
    <>
      <style>{`
        /* This bar is position:fixed (an overlay), not a normal-flow sibling,
           so the rest of the app doesn't automatically make room for it. Pad/
           shrink the sidebar's own primitives by its height instead — targets
           their stable data-slot attributes rather than sidebar.tsx directly. */
        /* Les pages qui se calent sur la hauteur visible (les index de ressources)
           lisent cette variable ; elle vaut 0 hors de l'application Windows. */
        html[data-eraser-titlebar="true"] { --eraser-titlebar: ${TITLEBAR_HEIGHT_PX}px; }
        html[data-eraser-titlebar="true"] body { padding-top: ${TITLEBAR_HEIGHT_PX}px; }
        /* La coque occupe exactement la place restante sous la barre : une hauteur
           de 100svh y ajouterait celle de la barre et ferait défiler le document
           entier, d'où une seconde barre de défilement et un bas de page coupé. */
        html[data-eraser-titlebar="true"] [data-slot="sidebar-wrapper"],
        html[data-eraser-titlebar="true"] [data-slot="sidebar-inset"] {
          height: calc(100svh - ${TITLEBAR_HEIGHT_PX}px);
          min-height: calc(100svh - ${TITLEBAR_HEIGHT_PX}px);
          max-height: calc(100svh - ${TITLEBAR_HEIGHT_PX}px);
        }
        html[data-eraser-titlebar="true"] [data-slot="sidebar-container"] { padding-top: ${TITLEBAR_HEIGHT_PX}px; }
        /* Le document lui-même ne défile jamais : seul le contenu de la coque le fait. */
        html[data-eraser-titlebar="true"] body { overflow: hidden; }
        /* Belt-and-suspenders: the collapsed mini bar should never show a
           scrollbar even if the height math above is off by a pixel. */
        html[data-eraser-collapsed="true"] body { overflow: hidden; padding-top: 0; }
        /* frame:false drops the native window edge entirely, so this stands in
           for it — a subtle border normally, lighter once pinned (the visual
           cue the pin button promises). */
        html[data-eraser-pinned="true"] { border: 1px solid rgba(224, 189, 130, 0.35); }
        html[data-eraser-pinned="false"] { border: 1px solid #4c4439; }
        html, body { scrollbar-width: thin; scrollbar-color: #4c4439 transparent; }
        html::-webkit-scrollbar, body::-webkit-scrollbar { width: 8px; height: 8px; }
        html::-webkit-scrollbar-track, body::-webkit-scrollbar-track { background: transparent; }
        html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb { background-color: #4c4439; border-radius: 9999px; }
      `}</style>
      <div
        className={`fixed left-0 top-0 z-[100] flex h-10 shrink-0 select-none items-center gap-2 overflow-hidden border-b border-[#4c4439] bg-[#1c1a17] pl-3 pr-1 text-[#e0bd82] ${state.isCollapsed ? "" : "right-0"}`}
        style={state.isCollapsed ? { ...dragStyle, width: COLLAPSED_WIDTH_PX } : dragStyle}
        onMouseDown={handleBarMouseDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.png" alt="" className="size-5 shrink-0 object-contain" style={noDragStyle} />
        {/* Dès qu'il y a plusieurs onglets, ce sont eux qui nomment la fenêtre. */}
        {tabs && tabs.tabs.length > 1 && !state.isCollapsed
          ? <AppTabStrip />
          : <span className="truncate text-xs font-medium tracking-wide">{APP_TITLE}</span>}
        {!state.isCollapsed && (
          <div className="ml-auto flex items-center gap-0.5" style={noDragStyle} onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-label={state.isPinned ? "Désépingler la fenêtre" : "Épingler la fenêtre au premier plan"}
              aria-pressed={state.isPinned}
              onClick={() => void togglePin()}
              className={`flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/10 ${state.isPinned ? "text-[#f6d49b]" : "text-[#e0bd82]/70"}`}
            >
              <Pin className={`size-4 ${state.isPinned ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              aria-label="Réduire"
              onClick={() => void bridge!.windowMinimize()}
              className="flex size-8 items-center justify-center rounded-md text-[#e0bd82]/70 transition-colors hover:bg-white/10 hover:text-[#f6d49b]"
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              aria-label={state.isMaximized ? "Restaurer" : "Agrandir"}
              onClick={() => void bridge!.windowToggleMaximize()}
              className="flex size-8 items-center justify-center rounded-md text-[#e0bd82]/70 transition-colors hover:bg-white/10 hover:text-[#f6d49b]"
            >
              <Square className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => void bridge!.windowClose()}
              className="flex size-8 items-center justify-center rounded-md text-[#e0bd82]/70 transition-colors hover:bg-red-500/80 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
