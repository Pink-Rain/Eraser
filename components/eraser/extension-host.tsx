"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import * as ReactDOMClient from "react-dom/client"
import * as jsxRuntime from "react/jsx-runtime"
import { useRouter } from "next/navigation"
import { Puzzle } from "lucide-react"

import type { SiteRole } from "@/lib/auth-types"
import { EXTENSION_API_VERSION } from "@/lib/extensions"

/**
 * Ce qu'Eraser prête aux extensions dans le navigateur (version `EXTENSION_API_VERSION`). Une
 * extension rend avec le React d'Eraser — jamais le sien — pour pouvoir un jour afficher les
 * composants qu'Eraser lui prêtera.
 */
type ExtensionGlobals = { api: number; React: typeof React; ReactDOMClient: typeof ReactDOMClient; jsxRuntime: typeof jsxRuntime }

declare global {
  interface Window {
    EraserExtensions?: ExtensionGlobals
  }
}

export type ExtensionAccount = { uid: string; displayName: string; role: SiteRole }

/** L'objet donné à `mount` puis à `update` : stable d'une version d'API à l'autre, on n'y retire rien. */
export type EraserExtensionContext = ExtensionGlobals & {
  extension: { id: string; version: string; base: string }
  account: ExtensionAccount
  /** L'adresse sous `/extension/<id>/`, morceau par morceau. */
  path: string[]
  /** Change d'adresse dans l'extension (`navigate("carte/2")`). */
  navigate: (path: string) => void
  /** Appelle la partie serveur de l'extension (`/api/extensions/<id>/serveur/<chemin>`). */
  server: (path: string, init?: RequestInit) => Promise<Response>
  /** Appelle une API d'Eraser (« /api/… »), avec le compte connecté. */
  eraser: (path: string, init?: RequestInit) => Promise<Response>
}

type ExtensionModule = {
  mount?: (element: HTMLElement, eraser: EraserExtensionContext) => unknown
  update?: (eraser: EraserExtensionContext) => void
}

/**
 * Charge le module d'une extension installée et le monte dans la page, dans la coque d'Eraser
 * (barre latérale, polices, thème). Le module exporte `mount(élément, eraser)`, qui peut rendre
 * une fonction (ou `{ unmount }`) appelée en quittant la page, et peut exporter
 * `update(eraser)`, appelée quand l'adresse change sans quitter l'extension.
 */
export function ExtensionHost({ id, version, entry, styles, path, account }: {
  id: string
  version: string
  entry: string
  styles: string[]
  path: string[]
  account: ExtensionAccount
}) {
  const container = useRef<HTMLDivElement>(null)
  const latest = useRef<EraserExtensionContext | null>(null)
  const loaded = useRef<ExtensionModule | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const router = useRouter()
  const files = `/api/extensions/${encodeURIComponent(id)}/fichiers/${encodeURIComponent(version)}`
  const pathKey = path.join("/")
  const stylesKey = styles.join("\n")

  // Le contexte suit l'adresse et le compte ; l'extension montée le reçoit par `update`.
  useEffect(() => {
    const base = `/extension/${id}`
    const context: EraserExtensionContext = {
      api: EXTENSION_API_VERSION,
      React,
      ReactDOMClient,
      jsxRuntime,
      extension: { id, version, base },
      account: { uid: account.uid, displayName: account.displayName, role: account.role },
      path: pathKey ? pathKey.split("/") : [],
      navigate: (next) => {
        const clean = next.replace(/^\/+/, "")
        router.push(clean ? `${base}/${clean}` : base)
      },
      server: (next, init) => fetch(`/api/extensions/${encodeURIComponent(id)}/serveur/${next.replace(/^\/+/, "")}`, init),
      eraser: (next, init) => next.startsWith("/api/") ? fetch(next, init) : Promise.reject(new Error("Une API d'Eraser commence par « /api/ ».")),
    }
    latest.current = context
    loaded.current?.update?.(context)
  }, [id, version, pathKey, account.uid, account.displayName, account.role, router])

  useEffect(() => {
    const element = container.current
    if (!element) return
    window.EraserExtensions = { api: EXTENSION_API_VERSION, React, ReactDOMClient, jsxRuntime }
    let alive = true
    let unmount: (() => void) | null = null
    const links = (stylesKey ? stylesKey.split("\n") : []).map((style) => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = `${files}/${style}`
      link.dataset.eraserExtension = id
      document.head.appendChild(link)
      return link
    })
    import(/* @vite-ignore */ `${files}/${entry}`)
      .then((extension: ExtensionModule) => {
        if (!alive) return
        if (typeof extension.mount !== "function") throw new Error("Son module n'exporte pas « mount ».")
        if (!latest.current) throw new Error("Contexte d'Eraser absent.")
        loaded.current = extension
        const result = extension.mount(element, latest.current)
        if (typeof result === "function") unmount = result as () => void
        else if (result && typeof (result as { unmount?: unknown }).unmount === "function") unmount = () => (result as { unmount: () => void }).unmount()
      })
      .catch((error: unknown) => {
        if (alive) setFailure(error instanceof Error ? error.message : "Erreur inconnue.")
      })
    return () => {
      alive = false
      loaded.current = null
      try { unmount?.() } catch (error) { console.error("EXTENSION_UNMOUNT_FAILED", id, error) }
      for (const link of links) link.remove()
      element.replaceChildren()
    }
  }, [files, entry, stylesKey, id])

  return <>
    {failure && <ExtensionUnavailable title="L'extension n'a pas pu s'ouvrir" detail={failure} />}
    <div ref={container} data-eraser-extension={id} className="flex w-full min-w-0 flex-1 flex-col" />
  </>
}

export function ExtensionUnavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed bg-card/35 p-8 text-center">
        <div className="max-w-lg">
          <Puzzle className="mx-auto size-9 text-primary/45" />
          <h1 className="font-display mt-3 text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  )
}
