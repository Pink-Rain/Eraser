"use client"

/**
 * Le moteur des extensions dans le navigateur : la boîte à outils `eraser` (lib/extension-api.ts)
 * et tout ce qu'elle pose dans l'application — emplacements (`<ExtensionSlot>`), fenêtres,
 * messages, confirmations, styles, écoutes — ainsi que le démarrage des extensions qui déclarent
 * un module `boot` (`<ExtensionBoot>`, dans la coque).
 *
 * Eraser ne sait pas quelles extensions existent : il offre ces moyens d'agir, chacune s'en sert
 * comme elle veut. Fluidité : un emplacement sans ajout ne rend rien et ne charge rien ; les
 * modules de démarrage se chargent au premier moment libre, après l'affichage, et leur durée va
 * au relevé de fluidité. Une extension qui plante ne fait tomber que ce qu'elle a posé.
 */
import * as React from "react"
import { Component, useEffect, useSyncExternalStore, type ComponentType, type ErrorInfo, type ReactNode } from "react"
import * as ReactDOMClient from "react-dom/client"
import * as jsxRuntime from "react/jsx-runtime"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { announceInventoryReceived } from "@/components/eraser/item-notifications"
import type { SiteRole } from "@/lib/auth-types"
import type { Dispose, Eraser, ExtensionAccount, ExtensionBootModule, ExtensionDialogProps, ExtensionEvents, ExtensionPageState, ExtensionSlotProps } from "@/lib/extension-api"
import { EXTENSION_API_VERSION, extensionSlots, type ExtensionSlotName } from "@/lib/extensions"
import { noteExtensionBooted } from "@/lib/fluidity-journal"
import { cn } from "@/lib/utils"

/** `window.EraserExtensions` : ce qu'un module d'extension trouve en global (son build y emprunte React et les modules prêtés). */
export type ExtensionGlobals = {
  api: number
  React: typeof React
  ReactDOMClient: typeof ReactDOMClient
  jsxRuntime: typeof jsxRuntime
  /** Depuis l'API 2 : un module prêté par Eraser, par le nom sous lequel le code l'importe. */
  require: (id: string) => unknown
}

declare global {
  interface Window {
    EraserExtensions?: ExtensionGlobals
  }
}

let lending: Promise<(id: string) => unknown> | null = null

/** Les modules prêtés (components/eraser/extension-modules.ts), chargés une fois, seulement quand une extension en a besoin. */
export function lendEraserModules() {
  lending ??= import("@/components/eraser/extension-modules")
    .then(({ eraserRequire }) => {
      window.EraserExtensions = { api: EXTENSION_API_VERSION, React, ReactDOMClient, jsxRuntime, require: eraserRequire }
      return eraserRequire
    })
    .catch((error: unknown) => { lending = null; throw error })
  return lending
}

/** Une petite valeur partagée, lue par `useSyncExternalStore`. */
function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

const noop: Dispose = () => undefined

// ——— Ce que chaque extension a posé, pour tout défaire quand elle change de version ———

const owned = new Map<string, Set<Dispose>>()

function own(extension: string, undo: Dispose): Dispose {
  let done = false
  const dispose: Dispose = () => {
    if (done) return
    done = true
    owned.get(extension)?.delete(dispose)
    try { undo() } catch (error) { console.error("EXTENSION_DISPOSE_FAILED", extension, error) }
  }
  const set = owned.get(extension) ?? new Set<Dispose>()
  owned.set(extension, set)
  set.add(dispose)
  return dispose
}

function disposeExtension(extension: string) {
  for (const dispose of [...(owned.get(extension) ?? [])]) dispose()
  owned.delete(extension)
}

// ——— Emplacements ———

type SlotEntry = { key: string; component: ComponentType<ExtensionSlotProps>; eraser: Eraser; order: number }
const NO_ENTRIES: SlotEntry[] = []
const slotStore = createStore<Partial<Record<ExtensionSlotName, SlotEntry[]>>>({})
let counter = 0

function addToSlot(slot: ExtensionSlotName, entry: SlotEntry): Dispose {
  const all = slotStore.get()
  const list = [...(all[slot] ?? []), entry].sort((left, right) => left.order - right.order)
  slotStore.set({ ...all, [slot]: list })
  return () => {
    const current = slotStore.get()
    const rest = (current[slot] ?? []).filter((item) => item.key !== entry.key)
    slotStore.set({ ...current, [slot]: rest.length ? rest : undefined })
  }
}

/**
 * Un emplacement offert aux extensions (`extensionSlots`, lib/extensions.ts). Sans ajout, il ne
 * rend rien. Chaque ajout est protégé : s'il plante, il disparaît, la page reste.
 */
export function ExtensionSlot({ name, context, className, wrap }: {
  name: ExtensionSlotName
  context: Record<string, unknown>
  className?: string
  /** L'enveloppe des ajouts, posée seulement s'il y en a (un groupe de la barre latérale…) ; sans : un `div` (`contents` d'office). */
  wrap?: (content: ReactNode) => ReactNode
}) {
  const entries = useSyncExternalStore(slotStore.subscribe, () => slotStore.get()[name] ?? NO_ENTRIES, () => NO_ENTRIES)
  if (!entries.length) return null
  const content = entries.map((entry) => <ExtensionBoundary key={entry.key} label={entry.key}><SlotContribution entry={entry} context={context} /></ExtensionBoundary>)
  if (wrap) return wrap(content)
  return <div data-eraser-slot={name} className={className ?? "contents"}>{content}</div>
}

function SlotContribution({ entry, context }: { entry: SlotEntry; context: Record<string, unknown> }) {
  const Contribution = entry.component
  return <Contribution eraser={entry.eraser} context={context} />
}

/** Ce qu'une extension rend : s'il plante, il ne rend plus rien (et le dit dans la console). */
class ExtensionBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("EXTENSION_RENDER_FAILED", this.props.label, error, info.componentStack)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

// ——— Fenêtres, messages, confirmations ———

type Layer =
  | { key: string; kind: "dialog"; extension: string; component: ComponentType<ExtensionDialogProps>; props: Record<string, unknown>; title: string; description: string; wide: boolean; eraser: Eraser; close: Dispose }
  | { key: string; kind: "toast"; extension: string; message: ReactNode; tone: "info" | "erreur"; duration: number; close: Dispose }
  | { key: string; kind: "confirm"; extension: string; message: string; title: string; confirm: string; cancel: string; destructive: boolean; answer: (value: boolean) => void }

const layerStore = createStore<Layer[]>([])

function addLayer(layer: Layer): Dispose {
  layerStore.set([...layerStore.get(), layer])
  return () => layerStore.set(layerStore.get().filter((item) => item.key !== layer.key))
}

// ——— La page affichée et les écoutes ———

const pageStore = createStore<ExtensionPageState>({ pathname: "", viewRole: "joueur" })

/** Ouvre une adresse d'Eraser : le routeur de la coque dès qu'elle est là. */
let goTo: (href: string) => void = (href) => { window.location.assign(href) }

// ——— La boîte à outils ———

const toolboxes = new Map<string, Eraser>()

/**
 * La boîte à outils d'une extension (lib/extension-api.ts), une par version et par compte : le
 * module de démarrage, les pages et les composants posés reçoivent la même.
 */
export function extensionToolbox(extension: { id: string; version: string }, account: ExtensionAccount, require: (id: string) => unknown): Eraser {
  const cacheKey = [extension.id, extension.version, account.uid, account.displayName, account.role].join("\u0000")
  const known = toolboxes.get(cacheKey)
  if (known) return known
  const { id, version } = extension
  const base = `/extension/${id}`
  const files = `/api/extensions/${encodeURIComponent(id)}/fichiers/${encodeURIComponent(version)}`
  const mine = (undo: Dispose) => own(id, undo)
  const toolbox: Eraser = {
    api: EXTENSION_API_VERSION,
    extension: { id, version, base },
    account: { uid: account.uid, displayName: account.displayName, role: account.role },
    require,
    file: (path) => `${files}/${path.replace(/^\/+/, "")}`,
    page: () => pageStore.get(),
    go: (href) => {
      const clean = href.replace(/^\/+/, "")
      goTo(href.startsWith("/") ? href : clean ? `${base}/${clean}` : base)
    },
    server: (path, init) => fetch(`/api/extensions/${encodeURIComponent(id)}/serveur/${path.replace(/^\/+/, "")}`, init),
    eraser: (path, init) => path.startsWith("/api/") ? fetch(path, init) : Promise.reject(new Error("Une API d'Eraser commence par « /api/ ».")),
    inventory: { changed: (ownerId) => announceInventoryReceived(ownerId) },
    slots: {
      add(slot, component, options) {
        if (!Object.hasOwn(extensionSlots, slot)) {
          console.warn("EXTENSION_UNKNOWN_SLOT", id, slot)
          return noop
        }
        counter += 1
        return mine(addToSlot(slot, { key: `${id}:${counter}`, component, eraser: toolbox, order: options?.order ?? 0 }))
      },
    },
    ui: {
      dialog(component, options) {
        counter += 1
        const key = `${id}:${counter}`
        let dispose: Dispose = noop
        const close: Dispose = () => dispose()
        dispose = mine(addLayer({ key, kind: "dialog", extension: id, component: component as ComponentType<ExtensionDialogProps>, props: options?.props ?? {}, title: options?.title ?? "", description: options?.description ?? "", wide: Boolean(options?.wide), eraser: toolbox, close }))
        return close
      },
      toast(message, options) {
        counter += 1
        const key = `${id}:${counter}`
        let dispose: Dispose = noop
        const close: Dispose = () => dispose()
        dispose = mine(addLayer({ key, kind: "toast", extension: id, message, tone: options?.tone ?? "info", duration: options?.duration ?? 5000, close }))
        return close
      },
      confirm(message, options) {
        counter += 1
        const key = `${id}:${counter}`
        return new Promise<boolean>((resolve) => {
          let answered = false
          let dispose: Dispose = noop
          const answer = (value: boolean) => {
            if (answered) return
            answered = true
            dispose()
            resolve(value)
          }
          const remove = addLayer({ key, kind: "confirm", extension: id, message, title: options?.title ?? "Confirmer", confirm: options?.confirm ?? "Confirmer", cancel: options?.cancel ?? "Annuler", destructive: Boolean(options?.destructive), answer })
          // Défaite sans réponse (l'extension change de version) : c'est un refus.
          dispose = mine(() => { remove(); if (!answered) { answered = true; resolve(false) } })
        })
      },
    },
    styles: {
      add(css, options) {
        const element = options?.href ? Object.assign(document.createElement("link"), { rel: "stylesheet", href: css }) : Object.assign(document.createElement("style"), { textContent: css })
        element.dataset.eraserExtension = id
        document.head.appendChild(element)
        return mine(() => element.remove())
      },
    },
    on(event, listener) {
      if (event !== "page") return noop
      const call = listener as (value: ExtensionEvents["page"]) => void
      let last = pageStore.get()
      const notify = (value: ExtensionPageState) => { try { call(value) } catch (error) { console.error("EXTENSION_LISTENER_FAILED", id, error) } }
      if (last.pathname) queueMicrotask(() => notify(pageStore.get()))
      const unsubscribe = pageStore.subscribe(() => {
        const next = pageStore.get()
        if (next.pathname === last.pathname && next.viewRole === last.viewRole) return
        last = next
        notify(next)
      })
      return mine(unsubscribe)
    },
  }
  toolboxes.set(cacheKey, toolbox)
  return toolbox
}

// ——— Démarrage des extensions (`boot`) ———

type BootTarget = { id: string; version: string; boot: string }
type Booted = { version: string; boot: string; token: number; stop: Dispose }
const booted = new Map<string, Booted>()
let bootToken = 0

function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 })
  else window.setTimeout(run, 200)
}

function stopExtension(id: string) {
  const current = booted.get(id)
  if (!current) return
  booted.delete(id)
  current.stop()
}

function startExtension(target: BootTarget, account: ExtensionAccount) {
  bootToken += 1
  const token = bootToken
  let undo: Dispose = noop
  let stopped = false
  booted.set(target.id, {
    version: target.version,
    boot: target.boot,
    token,
    stop: () => {
      stopped = true
      try { undo() } catch (error) { console.error("EXTENSION_DISPOSE_FAILED", target.id, error) }
      disposeExtension(target.id)
    },
  })
  whenIdle(() => {
    if (stopped) return
    const startedAt = performance.now()
    void (async () => {
      try {
        const require = await lendEraserModules()
        const toolbox = extensionToolbox(target, account, require)
        const loaded = await import(/* @vite-ignore */ toolbox.file(target.boot)) as ExtensionBootModule
        if (stopped) return
        const codeMs = performance.now() - startedAt
        const result = typeof loaded.activate === "function" ? await loaded.activate(toolbox) : undefined
        if (typeof result === "function") {
          if (stopped) result()
          else undo = result
        }
        if (!stopped && booted.get(target.id)?.token === token) noteExtensionBooted({ id: target.id, version: target.version, ms: performance.now() - startedAt, codeMs })
      } catch (error) {
        console.error("EXTENSION_BOOT_FAILED", target.id, target.version, error)
        if (booted.get(target.id)?.token === token) stopExtension(target.id)
      }
    })()
  })
}

/**
 * Dans la coque : lance le module de démarrage de chaque extension installée qui en a un (une fois
 * par version), tient à jour la page affichée et le routeur de `eraser.go`.
 */
export function ExtensionBoot({ extensions, account, pathname, viewRole }: {
  extensions: Array<{ id: string; version: string; boot?: string | null }>
  account: ExtensionAccount
  pathname: string
  viewRole: SiteRole
}) {
  const router = useRouter()
  const { uid, displayName, role } = account
  const wanted = extensions.flatMap((extension) => extension.boot ? [`${extension.id}\u0000${extension.version}\u0000${extension.boot}`] : []).join("\n")

  useEffect(() => {
    goTo = (href) => router.push(href)
  }, [router])

  useEffect(() => {
    const current = pageStore.get()
    if (current.pathname !== pathname || current.viewRole !== viewRole) pageStore.set({ pathname, viewRole })
  }, [pathname, viewRole])

  useEffect(() => {
    const targets = (wanted ? wanted.split("\n") : []).map((line) => {
      const [id, version, boot] = line.split("\u0000")
      return { id, version, boot }
    })
    for (const [id, current] of [...booted]) {
      if (!targets.some((target) => target.id === id && target.version === current.version && target.boot === current.boot)) stopExtension(id)
    }
    for (const target of targets) {
      if (!booted.has(target.id)) startExtension(target, { uid, displayName, role })
    }
  }, [wanted, uid, displayName, role])

  return null
}

// ——— Ce qui se rend par-dessus tout ———

/** Dans la coque : l'emplacement « calque », les fenêtres, messages et confirmations ouverts par les extensions. */
export function ExtensionLayers({ context }: { context: Record<string, unknown> }) {
  const layers = useSyncExternalStore(layerStore.subscribe, layerStore.get, () => NO_LAYERS)
  const toasts = layers.filter((layer) => layer.kind === "toast")
  return <>
    <ExtensionSlot name="calque" context={context} />
    {layers.map((layer) => {
      if (layer.kind === "dialog") return <ExtensionDialog key={layer.key} layer={layer} />
      if (layer.kind === "confirm") return <ExtensionConfirm key={layer.key} layer={layer} />
      return null
    })}
    {toasts.length > 0 && <div data-eraser-part="messages" className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((layer) => <ExtensionToast key={layer.key} layer={layer} />)}
    </div>}
  </>
}

const NO_LAYERS: Layer[] = []

function ExtensionDialog({ layer }: { layer: Extract<Layer, { kind: "dialog" }> }) {
  const Body = layer.component
  return <Dialog open onOpenChange={(open) => { if (!open) layer.close() }}>
    <DialogContent className={cn("max-h-[92svh] overflow-y-auto", layer.wide && "sm:max-w-4xl")} {...(layer.description ? {} : { "aria-describedby": undefined })}>
      <DialogHeader className={layer.title ? undefined : "sr-only"}>
        <DialogTitle className="font-display text-2xl">{layer.title || "Extension"}</DialogTitle>
        {layer.description && <DialogDescription>{layer.description}</DialogDescription>}
      </DialogHeader>
      <ExtensionBoundary label={layer.key}><Body {...layer.props} eraser={layer.eraser} close={layer.close} /></ExtensionBoundary>
    </DialogContent>
  </Dialog>
}

function ExtensionConfirm({ layer }: { layer: Extract<Layer, { kind: "confirm" }> }) {
  return <AlertDialog open onOpenChange={(open) => { if (!open) layer.answer(false) }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{layer.title}</AlertDialogTitle>
        <AlertDialogDescription>{layer.message}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => layer.answer(false)}>{layer.cancel}</AlertDialogCancel>
        <AlertDialogAction variant={layer.destructive ? "destructive" : "default"} onClick={() => layer.answer(true)}>{layer.confirm}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

function ExtensionToast({ layer }: { layer: Extract<Layer, { kind: "toast" }> }) {
  const { close, duration } = layer
  useEffect(() => {
    if (!duration) return
    const timer = window.setTimeout(close, duration)
    return () => window.clearTimeout(timer)
  }, [close, duration])
  return <div role="status" className={cn("pointer-events-auto flex items-start gap-2 rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg", layer.tone === "erreur" && "border-destructive/40 text-destructive")}>
    <div className="min-w-0 flex-1">{layer.message}</div>
    <button type="button" onClick={layer.close} className="-mr-1 shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground" aria-label="Fermer"><X className="size-4" /></button>
  </div>
}
