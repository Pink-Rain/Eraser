"use client"

/**
 * Le clic droit des extensions (API 6, `eraser.menu.add`, lib/extension-api.ts) : ce qu'il y a
 * sous le pointeur (les choses d'Eraser repérées par `data-eraser-thing`, les images, les liens,
 * le texte sélectionné) et les entrées que les extensions proposent pour lui.
 *
 * Les entrées s'ajoutent aux menus d'Eraser qui existent déjà (`<ExtensionMenuItems>` : ligne d'un
 * tableau, liens de l'application de bureau) ; ailleurs, `<ExtensionContextMenu>` (dans la coque)
 * ouvre un menu au pointeur, seulement si une extension a quelque chose à proposer. Le menu du
 * système reste dans les zones de saisie (correction orthographique) et avec Maj + clic droit.
 *
 * Sans fournisseur, rien n'est calculé : un clic droit coûte une lecture de tableau vide.
 * Module à part du moteur (extension-runtime.tsx) : les onglets l'importent sans boucle.
 */
import { useEffect, useState, type ReactNode } from "react"
import { Copy } from "lucide-react"

import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import type { Dispose, ExtensionMenuEntry, ExtensionMenuProvider, ExtensionMenuTarget, ExtensionPageState } from "@/lib/extension-api"
import { extensionThingKinds, type ExtensionThing, type ExtensionThingKind } from "@/lib/extensions"
import { cn } from "@/lib/utils"

type Provider = { key: string; extension: string; provider: ExtensionMenuProvider }
let providers: Provider[] = []
let readPage: () => ExtensionPageState = () => ({ pathname: window.location.pathname, viewRole: "joueur", search: window.location.search, campaignId: null })

/** Le moteur donne la page affichée (son `pageStore`). */
export function setMenuPageSource(read: () => ExtensionPageState) {
  readPage = read
}

/** Ajoute ce qu'une extension propose au clic droit ; rend de quoi le retirer. */
export function addMenuProvider(extension: string, key: string, provider: ExtensionMenuProvider): Dispose {
  providers = [...providers, { key, extension, provider }]
  return () => { providers = providers.filter((entry) => entry.key !== key) }
}

/** Une adresse de cette application (« /… »), ou "" : une adresse extérieure n'est pas une page d'Eraser. */
function ownHref(raw: string) {
  if (!raw) return ""
  try {
    const url = new URL(raw, window.location.href)
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : ""
  } catch {
    return ""
  }
}

const isThingKind = (value: string): value is ExtensionThingKind => Object.hasOwn(extensionThingKinds, value)

/** Les choses reconnues sous un élément, la plus proche d'abord (sans doublon). */
export function thingsAt(target: EventTarget | null): ExtensionThing[] {
  const start = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  const found: ExtensionThing[] = []
  const seen = new Set<string>()
  const push = (thing: ExtensionThing) => {
    const key = `${thing.kind}\u0000${thing.id}`
    if (!thing.id || seen.has(key)) return
    seen.add(key)
    found.push(thing)
  }
  for (let node: Element | null = start; node; node = node.parentElement) {
    const kind = node.getAttribute("data-eraser-thing")
    if (kind && isThingKind(kind)) {
      push({ kind, id: node.getAttribute("data-eraser-thing-id") ?? "", label: node.getAttribute("data-eraser-thing-label") ?? "", href: node.getAttribute("data-eraser-thing-href") || null })
    } else if (node instanceof HTMLImageElement) {
      const src = ownHref(node.currentSrc || node.src) || node.currentSrc || node.src
      push({ kind: "image", id: src, label: node.alt || "", href: null })
    } else if (node instanceof HTMLAnchorElement && node.target !== "_blank") {
      const href = ownHref(node.getAttribute("href") ?? "")
      if (href) push({ kind: "lien", id: href, label: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200), href })
    }
  }
  return found
}

/** Le texte sélectionné, s'il y en a un. */
function selectedText() {
  return (window.getSelection()?.toString() ?? "").replace(/\s+\n/g, "\n").trim().slice(0, 4000)
}

let lastTarget: ExtensionMenuTarget | null = null

/** Ce qu'il y a sous ce clic droit (retenu pour les menus d'Eraser qui s'ouvrent ensuite). */
export function recordMenuTarget(target: EventTarget | null): ExtensionMenuTarget | null {
  if (!providers.length || !target) return (lastTarget = null)
  lastTarget = { things: thingsAt(target), selection: selectedText(), page: readPage() }
  return lastTarget
}

export type ShownMenuEntry = ExtensionMenuEntry & { key: string }

/** Les entrées que les extensions proposent pour ce clic droit (une qui plante est ignorée). */
export function menuEntriesFor(target: ExtensionMenuTarget | null): ShownMenuEntry[] {
  if (!target || !providers.length) return []
  const shown: ShownMenuEntry[] = []
  for (const { key, extension, provider } of providers) {
    try {
      const answer = provider(target)
      const list = Array.isArray(answer) ? answer : answer ? [answer] : []
      list.forEach((entry, index) => {
        if (entry && typeof entry.label === "string" && entry.label.trim() && typeof entry.onSelect === "function") shown.push({ ...entry, key: `${key}:${index}` })
      })
    } catch (error) {
      console.error("EXTENSION_MENU_FAILED", extension, error)
    }
  }
  return shown
}

function run(entry: ExtensionMenuEntry) {
  try { entry.onSelect() } catch (error) { console.error("EXTENSION_MENU_ACTION_FAILED", error) }
}

/**
 * Les entrées des extensions dans un menu d'Eraser qui vient de s'ouvrir au clic droit : un menu
 * Radix (`kind="context"`, d'office) ou un menu simple de boutons (`kind="plain"`). Rien sans entrée.
 */
export function ExtensionMenuItems({ kind = "context", itemClassName, onDone }: { kind?: "context" | "plain"; itemClassName?: string; onDone?: () => void }) {
  // Lu une fois, à l'ouverture : le menu montre ce qui était sous ce clic droit-là.
  const [entries] = useState(() => menuEntriesFor(lastTarget))
  if (!entries.length) return null
  if (kind === "plain") return <>
    <div role="separator" className="-mx-1 my-1 h-px bg-border" />
    {entries.map((entry) => <button key={entry.key} type="button" role="menuitem" className={cn(itemClassName, entry.destructive && "text-destructive")} onClick={() => { run(entry); onDone?.() }}>{entry.icon}{entry.label}</button>)}
  </>
  return <>
    <ContextMenuSeparator />
    {entries.map((entry) => <ContextMenuItem key={entry.key} variant={entry.destructive ? "destructive" : "default"} onSelect={() => run(entry)}>{entry.icon}{entry.label}</ContextMenuItem>)}
  </>
}

const editable = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"

type OpenMenu = { x: number; y: number; entries: ShownMenuEntry[]; selection: string }

/**
 * Dans la coque : retient ce qu'il y a sous chaque clic droit et, là où Eraser n'a pas son propre
 * menu, ouvre celui des extensions au pointeur (si elles proposent quelque chose).
 */
export function ExtensionContextMenu() {
  const [menu, setMenu] = useState<OpenMenu | null>(null)

  useEffect(() => {
    // Avant tout le monde : les menus d'Eraser qui s'ouvrent ensuite lisent ce qui a été retenu.
    function remember(event: MouseEvent) {
      recordMenuTarget(event.shiftKey ? null : event.target)
    }
    // Après tout le monde : un menu d'Eraser (Radix, onglets) a déjà annulé l'événement.
    function open(event: MouseEvent) {
      if (event.defaultPrevented || event.shiftKey || !lastTarget) return
      if ((event.target as Element | null)?.closest?.(editable)) return
      const entries = menuEntriesFor(lastTarget)
      if (!entries.length) return
      event.preventDefault()
      setMenu({ x: event.clientX, y: event.clientY, entries, selection: lastTarget.selection })
    }
    window.addEventListener("contextmenu", remember, true)
    window.addEventListener("contextmenu", open)
    return () => {
      window.removeEventListener("contextmenu", remember, true)
      window.removeEventListener("contextmenu", open)
    }
  }, [])

  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss() }
    window.addEventListener("pointerdown", dismiss)
    window.addEventListener("blur", dismiss)
    window.addEventListener("resize", dismiss)
    window.addEventListener("scroll", dismiss, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", dismiss)
      window.removeEventListener("blur", dismiss)
      window.removeEventListener("resize", dismiss)
      window.removeEventListener("scroll", dismiss, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu])

  if (!menu) return null
  const item = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0"
  const close = () => setMenu(null)
  const rows: ReactNode[] = []
  // Le menu du système est remplacé : « Copier » reste là pour le texte sélectionné.
  if (menu.selection) rows.push(<button key="copier" type="button" role="menuitem" className={item} onClick={() => { void navigator.clipboard?.writeText(menu.selection).catch(() => undefined); close() }}><Copy />Copier</button>, <div key="separateur" role="separator" className="-mx-1 my-1 h-px bg-border" />)
  for (const entry of menu.entries) rows.push(<button key={entry.key} type="button" role="menuitem" className={cn(item, entry.destructive && "text-destructive")} onClick={() => { run(entry); close() }}>{entry.icon}{entry.label}</button>)
  return <div
    role="menu"
    data-eraser-part="menu-extensions"
    className="pointer-events-auto fixed z-[200] min-w-56 max-w-80 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    style={{ left: Math.max(4, Math.min(menu.x, window.innerWidth - 260)), top: Math.max(4, Math.min(menu.y, window.innerHeight - 40 - 34 * rows.length)) }}
    // Le focus reste où il était, la sélection aussi.
    onMouseDown={(event) => event.preventDefault()}
    onPointerDown={(event) => event.stopPropagation()}
  >{rows}</div>
}
