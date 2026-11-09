"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import * as ReactDOMClient from "react-dom/client"
import * as jsxRuntime from "react/jsx-runtime"
import { useRouter } from "next/navigation"
import { Puzzle } from "lucide-react"

import { extensionToolbox, lendEraserModules, type ExtensionGlobals } from "@/components/eraser/extension-runtime"
import type { Eraser, ExtensionAccount } from "@/lib/extension-api"
import { noteExtensionShown } from "@/lib/fluidity-journal"

export type { ExtensionAccount } from "@/lib/extension-api"

/**
 * L'objet donné aux pages d'une extension : stable d'une version d'API à l'autre, on n'y retire
 * rien. Depuis l'API 3, c'est la boîte à outils de toute extension (lib/extension-api.ts) plus ce
 * qui est propre à une page : son adresse et `navigate`.
 */
export type EraserExtensionContext = ExtensionGlobals & Eraser & {
  /** L'adresse sous `/extension/<id>/`, morceau par morceau. */
  path: string[]
  /** Change d'adresse dans l'extension (`navigate("carte/2")`). */
  navigate: (path: string) => void
}

type ExtensionModule = {
  /** API 2 : un composant rendu dans la coque d'Eraser (ses contextes, ses composants prêtés). */
  Page?: ComponentType<{ eraser: EraserExtensionContext }>
  /** API 1 : l'extension monte elle-même son rendu dans un élément. */
  mount?: (element: HTMLElement, eraser: EraserExtensionContext) => unknown
  update?: (eraser: EraserExtensionContext) => void
}

/**
 * Charge le module d'une extension installée et l'affiche dans la coque d'Eraser (barre latérale,
 * polices, thème). Le module exporte `Page`, un composant qui reçoit `eraser` et se rend dans
 * l'arbre d'Eraser ; ou bien `mount(élément, eraser)` (qui peut rendre une fonction de
 * démontage) et `update(eraser)`, appelée quand l'adresse change sans quitter l'extension.
 *
 * Le relevé de fluidité compte son ouverture (`noteExtensionShown`) : du chargement à son contenu
 * prêt, quand plus rien n'est marqué `aria-busy="true"` dans son écran — la même règle que les
 * pages d'Eraser. Une extension met donc `aria-busy` sur ce qu'elle charge encore.
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
  const screen = useRef<HTMLDivElement>(null)
  const opening = useRef<{ startedAt: number; codeMs: number } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [requireLent, setRequireLent] = useState<ExtensionGlobals["require"] | null>(null)
  const [loaded, setLoaded] = useState<ExtensionModule | null>(null)
  const router = useRouter()
  const files = `/api/extensions/${encodeURIComponent(id)}/fichiers/${encodeURIComponent(version)}`
  const pathKey = path.join("/")
  const stylesKey = styles.join("\n")

  // Le contexte suit l'adresse et le compte : `Page` le reçoit en propriété, `mount` par `update`.
  const context = useMemo<EraserExtensionContext | null>(() => {
    if (!requireLent) return null
    const toolbox = extensionToolbox({ id, version }, { uid: account.uid, displayName: account.displayName, role: account.role }, requireLent)
    const base = toolbox.extension.base
    return {
      ...toolbox,
      React,
      ReactDOMClient,
      jsxRuntime,
      path: pathKey ? pathKey.split("/") : [],
      navigate: (next) => {
        const clean = next.replace(/^\/+/, "")
        router.push(clean ? `${base}/${clean}` : base)
      },
    }
  }, [requireLent, id, version, pathKey, account.uid, account.displayName, account.role, router])

  // Les pièces prêtées d'abord (chargées seulement quand une extension s'ouvre), puis l'extension et ses styles.
  useEffect(() => {
    let alive = true
    const startedAt = performance.now()
    opening.current = null
    const links = (stylesKey ? stylesKey.split("\n") : []).map((style) => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = `${files}/${style}`
      link.dataset.eraserExtension = id
      document.head.appendChild(link)
      return link
    })
    lendEraserModules()
      .then((eraserRequire) => {
        if (alive) setRequireLent(() => eraserRequire)
        return import(/* @vite-ignore */ `${files}/${entry}`) as Promise<ExtensionModule>
      })
      .then((extension) => {
        if (!alive) return
        if (typeof extension.Page !== "function" && typeof extension.mount !== "function") throw new Error("Son module n'exporte ni « Page » ni « mount ».")
        opening.current = { startedAt, codeMs: performance.now() - startedAt }
        setLoaded(extension)
      })
      .catch((error: unknown) => {
        if (alive) setFailure(error instanceof Error ? error.message : "Erreur inconnue.")
      })
    return () => {
      alive = false
      setLoaded(null)
      for (const link of links) link.remove()
    }
  }, [files, entry, stylesKey, id])

  // API 1 : l'extension monte elle-même son rendu, une fois, puis reçoit chaque nouveau contexte.
  const contextRef = useRef(context)
  useEffect(() => {
    contextRef.current = context
    if (context && loaded && typeof loaded.Page !== "function") loaded.update?.(context)
  }, [context, loaded])
  useEffect(() => {
    const element = container.current
    if (!element || !loaded || typeof loaded.Page === "function" || typeof loaded.mount !== "function" || !contextRef.current) return
    let unmount: (() => void) | null = null
    const result = loaded.mount(element, contextRef.current)
    if (typeof result === "function") unmount = result as () => void
    else if (result && typeof (result as { unmount?: unknown }).unmount === "function") unmount = () => (result as { unmount: () => void }).unmount()
    return () => {
      try { unmount?.() } catch (error) { console.error("EXTENSION_UNMOUNT_FAILED", id, error) }
      element.replaceChildren()
    }
  }, [loaded, id])

  // Le contenu est prêt quand l'écran de l'extension n'a plus rien d'`aria-busy` : une seule
  // mesure par ouverture (les changements d'adresse ensuite sont des changements de page).
  useEffect(() => {
    const element = screen.current
    const started = opening.current
    if (!element || !loaded || !started) return
    let frame = 0
    let done = false
    const finish = (complete: boolean) => {
      if (done) return
      done = true
      observer.disconnect()
      window.clearTimeout(timer)
      if (opening.current === started) opening.current = null
      noteExtensionShown({ id, version, ms: performance.now() - started.startedAt, codeMs: started.codeMs, complete })
    }
    const check = () => {
      if (element.querySelector("[aria-busy='true']")) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (!element.querySelector("[aria-busy='true']")) finish(true) })
    }
    const observer = new MutationObserver(check)
    observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] })
    const timer = window.setTimeout(() => finish(false), 20_000)
    check()
    return () => { done = true; observer.disconnect(); window.clearTimeout(timer); cancelAnimationFrame(frame) }
  }, [loaded, id, version])

  const Page = loaded && typeof loaded.Page === "function" ? loaded.Page : null

  // `contents` : l'enveloppe ne compte pas dans la mise en page de la coque, elle sert à la mesure.
  // Pendant le chargement, une place `aria-busy` : le changement de page attend l'extension.
  return <div ref={screen} className="contents">
    {failure && <ExtensionUnavailable title="L'extension n'a pas pu s'ouvrir" detail={failure} />}
    {!failure && !loaded && <div aria-busy="true" className="w-full flex-1"><span className="sr-only">Chargement de l’extension…</span></div>}
    {Page && context && <Page eraser={context} />}
    <div ref={container} data-eraser-extension={id} className={Page ? "hidden" : "flex w-full min-w-0 flex-1 flex-col"} />
  </div>
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
