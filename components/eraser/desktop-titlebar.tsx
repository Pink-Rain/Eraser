"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { Minus, Pin, Square, X } from "lucide-react"

import type { DesktopWindowState } from "@/lib/desktop-bridge"

const APP_TITLE = "Eraser - JDR"

// Electron's draggable-region CSS property isn't in React's CSSProperties.
type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" }
const dragStyle: AppRegionStyle = { WebkitAppRegion: "drag" }
const noDragStyle: AppRegionStyle = { WebkitAppRegion: "no-drag" }

// Only rendered inside the desktop app (window.eraserDesktop exists only
// there, injected by desktop/preload.cjs); on the website this returns null
// and nothing about the page layout changes.
export function DesktopTitlebar() {
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<DesktopWindowState>({ isMaximized: false, isPinned: false, isCollapsed: false })

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
    // Toggled here (rather than passed as a prop) so the border applies to
    // the whole window, not just this bar — see the <style> block below.
    document.documentElement.dataset.eraserPinned = state.isPinned ? "true" : "false"
  }, [state.isPinned])

  if (!ready) return null
  const bridge = window.eraserDesktop
  if (!bridge) return null

  function handleBarDoubleClick() {
    if (!state.isPinned) return
    void bridge!.windowToggleCollapse().then((result) => setState((current) => ({ ...current, isCollapsed: result.isCollapsed })))
  }

  async function togglePin() {
    const result = await bridge!.windowTogglePin()
    setState((current) => ({ ...current, isPinned: result.isPinned, isCollapsed: result.isPinned ? current.isCollapsed : false }))
  }

  return (
    <>
      {/* frame:false drops the native window edge entirely, so this stands in
          for it — a subtle border normally, lighter once pinned (the visual
          cue the pin button promises). Targets <html> so it wraps the whole
          window, not just this bar. */}
      <style>{`
        html[data-eraser-pinned="true"] { border: 1px solid rgba(224, 189, 130, 0.35); }
        html[data-eraser-pinned="false"] { border: 1px solid #4c4439; }
      `}</style>
      <div
        className="flex h-10 shrink-0 select-none items-center gap-2 border-b border-[#4c4439] bg-[#1c1a17] pl-3 pr-1 text-[#e0bd82]"
        style={dragStyle}
        onDoubleClick={handleBarDoubleClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.png" alt="" className="size-5 shrink-0 object-contain" style={noDragStyle} />
        <span className="truncate text-xs font-medium tracking-wide">{APP_TITLE}</span>
        <div className="ml-auto flex items-center gap-0.5" style={noDragStyle} onDoubleClick={(event) => event.stopPropagation()}>
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
      </div>
    </>
  )
}
