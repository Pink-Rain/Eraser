"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, CircleUserRound, Eye, EyeOff, FilePlus2, FlaskConical, Folder, FolderOpen, FolderPlus, Home, LibraryBig, Link2, LoaderCircle, Lock, Map, PanelLeft, PenLine, Plus, RotateCcw, ScrollText, Search, ShieldCheck, Star, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { PageCreatorNav } from "@/components/eraser/page-creator-nav"
import { FolderGlyph } from "@/components/eraser/page-folders-ui"
import { fieldClass, roleDot } from "@/components/eraser/page-studio-settings"
import { catalogEntry, cleanMenuHref, expandSectionPages, isFolderNode, isSectionNode, resolveMenu, type MenuIconKey, type MenuNode, type MenuPageEntry, type ResolvedMenuItem } from "@/lib/app-menu"
import { newId, pageVisibleTo, roleLabels, studioHref, type PageRole, type PageVisibility } from "@/lib/custom-pages"
import type { MenuEditorData, MenuPageChoice } from "@/lib/menu-editor-data"
import { flattenFolders, folderPathLabel, menuFolderEntries } from "@/lib/page-folders"
import { replaceableRoutes } from "@/lib/page-replacements"

/**
 * L'éditeur du menu latéral (administrateurs ; réglage commun à toute la table) : réordonner,
 * renommer, masquer et regrouper les entrées. Chaque page y est une entrée comme une autre,
 * qu'Eraser l'ait livrée ou qu'elle vienne de l'atelier : même icône, mêmes réglages, même
 * « Ouvrir dans l'atelier ». On y place aussi un lien, une section, ou un dossier du créateur de
 * pages entier (ses pages publiées y arrivent d'elles-mêmes). L'aperçu montre le menu de chaque
 * rôle. Masquer ne donne aucun accès : chaque entrée garde ses rôles. L'admin garde toujours le
 * Créateur de pages et cet éditeur.
 */

const icons: Record<MenuIconKey, typeof BookOpen> = { home: Home, map: Map, user: CircleUserRound, scroll: ScrollText, library: LibraryBig, flask: FlaskConical, shield: ShieldCheck, "file-plus": FilePlus2, menu: PanelLeft, link: Link2, folder: Folder, star: Star }

const dynamicHints: Record<string, string> = {
  "dossier": "MJ : la campagne choisie, ses pages en dessous.",
  "personnage": "Joueur : son personnage choisi et ses campagnes.",
  "index-rouges": "Les index à l’étoile rouge (page Index, clic droit sur l’étoile).",
  "index/etoiles": "Les index étoilés, dans l’ordre de la page Index.",
}

const allRoles: PageRole[] = ["joueur", "mj", "admin"]
/** Les rôles qui voient une page, d'après sa visibilité. */
const rolesOfVis = (vis: PageVisibility): PageRole[] => allRoles.filter((role) => pageVisibleTo(vis, role))
const routeOf = (href: string | undefined) => href ? replaceableRoutes.find((route) => route.path === href.split(/[?#]/)[0]) : undefined

const clone = (items: MenuNode[]) => JSON.parse(JSON.stringify(items)) as MenuNode[]
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function findParent(items: MenuNode[], id: string): { list: MenuNode[]; index: number; parent: MenuNode | null } | null {
  const top = items.findIndex((node) => node.id === id)
  if (top >= 0) return { list: items, index: top, parent: null }
  for (const node of items) {
    const at = node.children?.findIndex((child) => child.id === id) ?? -1
    if (at >= 0) return { list: node.children!, index: at, parent: node }
  }
  return null
}

function ItemIcon({ node, className = "size-4" }: { node: { icon?: string; emoji?: string; builtinIcon?: MenuIconKey }; className?: string }) {
  if (node.icon || node.emoji) return <IndexIconGlyph icon={node.icon} emoji={node.emoji} filled={Boolean(node.emoji)} className={className} />
  const Icon = icons[node.builtinIcon ?? "link"]
  return <Icon className={className} />
}

/** L'aperçu : le menu tel que le rôle le voit (barre sombre, comme la vraie). */
function Preview({ items, role }: { items: ResolvedMenuItem[]; role: PageRole }) {
  const sub = (child: ResolvedMenuItem) => {
    if (child.dynamic === "section-pages") return (child.pages ?? []).map((page) => <p key={`${child.key}:${page.href}`} className="truncate rounded-md px-2 py-1 text-[12.5px] text-sidebar-foreground/80">{page.title}</p>)
    if (child.dynamic === "dossier-pages") return [<div key={child.key}>
      <p className="flex items-center gap-1.5 px-2 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50"><Folder className="size-3" />{child.label}</p>
      {(child.pages ?? []).map((page) => <p key={page.href} className="ml-3 truncate rounded-md px-2 py-1 text-[12.5px] text-sidebar-foreground/80">{page.title}</p>)}
    </div>]
    return [<p key={child.key} className="truncate rounded-md px-2 py-1 text-[12.5px] text-sidebar-foreground/80">{child.dynamic === "index-etoiles" ? <i className="text-sidebar-foreground/55">Index étoilés</i> : child.label}</p>]
  }
  return <nav aria-label="Aperçu du menu" className="grid gap-0.5 rounded-2xl bg-sidebar p-2.5 text-sidebar-foreground shadow-[0_14px_36px_rgb(20_16_12/0.25)]">
    <div className="mb-2 flex items-center gap-2 border-b border-sidebar-border px-1.5 pb-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/eraser-logo.png" alt="" className="size-8 rounded-lg" />
      <span><b className="block font-display text-[15px]">Eraser</b><small className="block text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/55">Vue {roleLabels[role].toLowerCase()}</small></span>
    </div>
    {items.map((item) => {
      if (item.dynamic === "dossier") return <p key={item.key} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-sidebar-foreground/70"><Map className="size-4" />Dossier - <i>campagne choisie</i></p>
      if (item.dynamic === "personnage") return <p key={item.key} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-sidebar-foreground/70"><CircleUserRound className="size-4" /><i>Personnage choisi</i></p>
      if (item.dynamic === "index-rouges") return <p key={item.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] italic text-sidebar-foreground/55"><Star className="size-3.5" />Index à l’étoile rouge</p>
      return <div key={item.key}>
        <p className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] hover:bg-sidebar-accent"><ItemIcon node={item} /><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.section && <ChevronDown className="size-3.5 opacity-60" />}{item.action && <Plus className="size-3.5 opacity-60" />}</p>
        {item.section && (item.children ?? []).length > 0 && <div className="ml-4 grid gap-0.5 border-l border-sidebar-border pl-2.5">{(item.children ?? []).flatMap(sub)}</div>}
      </div>
    })}
  </nav>
}

type Adding = { kind: "page" | "lien" | "groupe" | "dossier"; parent: string }

export function MenuEditor({ initial, role }: { initial: MenuEditorData; role: PageRole }) {
  const router = useRouter()
  // Les pages d'une section y sont des entrées comme les autres (lib/app-menu.ts, `expandSectionPages`).
  const [start] = useState(() => {
    const byPlace: Record<string, string[]> = {}
    for (const page of initial.pages) if (page.id && !page.eraser && page.place && page.place !== "hors-menu" && page.place !== "campagne") (byPlace[page.place] ??= []).push(page.id)
    return expandSectionPages(initial.items, byPlace)
  })
  const [items, setItems] = useState(start)
  const [saved, setSaved] = useState(JSON.stringify(start))
  const [base, setBase] = useState(initial.updatedAt)
  const [custom, setCustom] = useState(initial.custom)
  const [previous, setPrevious] = useState(initial.previous)
  const [previewRole, setPreviewRole] = useState<PageRole>(role)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [adding, setAdding] = useState<Adding | null>(null)
  const [draft, setDraft] = useState({ page: "", folder: "", query: "", label: "", href: "", roles: allRoles })
  const isAdmin = role === "admin"
  const dirty = JSON.stringify(items) !== saved
  const pageById = useMemo(() => new globalThis.Map(initial.pages.filter((page) => page.id).map((page) => [page.id, page])), [initial.pages])
  const pageByHref = useMemo(() => new globalThis.Map(initial.pages.map((page) => [page.href, page])), [initial.pages])
  const folderById = useMemo(() => new globalThis.Map(initial.folders.folders.map((folder) => [folder.id, folder])), [initial.folders])

  const preview = useMemo(() => {
    const readable = initial.pages.filter((page) => page.published && pageVisibleTo(page.vis, previewRole))
    const pages = Object.fromEntries(readable.filter((page) => page.id).map((page) => [page.id, { title: page.title, href: page.href, icon: page.icon, emoji: page.emoji } satisfies MenuPageEntry]))
    const sectionPages: Record<string, MenuPageEntry[]> = {}
    for (const page of readable) if (page.id && !page.eraser && page.place && page.place !== "hors-menu" && page.place !== "campagne") (sectionPages[page.place] ??= []).push(pages[page.id])
    const folders = menuFolderEntries(initial.folders, readable.map((page) => ({ key: page.key, page: { title: page.title, href: page.href, icon: page.icon, emoji: page.emoji } })))
    return resolveMenu(items, { role: previewRole, pages, sectionPages, folders })
  }, [items, previewRole, initial.pages, initial.folders])
  const sections = items.filter((node) => isSectionNode(node.id))

  /** Les adresses déjà au menu (une page n'y entre qu'une fois). */
  const inMenu = useMemo(() => {
    const hrefs = new Set<string>()
    const walk = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        const href = node.id.startsWith("page:") ? pageById.get(node.id.slice(5))?.href : node.href ?? catalogEntry(node.id)?.href
        if (href) hrefs.add(href.split(/[?#]/)[0])
        if (node.children) walk(node.children)
      }
    }
    walk(items)
    return hrefs
  }, [items, pageById])
  const foldersInMenu = useMemo(() => new Set(JSON.stringify(items).match(/dossier:d-[a-z0-9]+/g) ?? []), [items])

  const edit = (mutate: (next: MenuNode[]) => void) => setItems((current) => { const next = clone(current); mutate(next); return next })
  const update = (id: string, patch: Partial<MenuNode>) => edit((next) => { const at = findParent(next, id); if (at) Object.assign(at.list[at.index], patch) })
  const move = (id: string, step: -1 | 1) => edit((next) => {
    const at = findParent(next, id)
    if (!at) return
    const target = at.index + step
    if (target < 0 || target >= at.list.length) return
    const [node] = at.list.splice(at.index, 1)
    at.list.splice(target, 0, node)
  })
  const moveTo = (id: string, parentId: string) => edit((next) => {
    const at = findParent(next, id)
    if (!at) return
    const [node] = at.list.splice(at.index, 1)
    const parent = parentId ? next.find((candidate) => candidate.id === parentId) : null
    if (parent) (parent.children ??= []).push(node)
    else next.push(node)
  })
  const remove = (id: string) => edit((next) => { const at = findParent(next, id); if (at) at.list.splice(at.index, 1) })

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(String(body.action))
    setMessage(null)
    const response = await fetch("/api/menu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { items?: MenuNode[]; custom?: boolean; updatedAt?: string; previous?: boolean; error?: string }
    setBusy("")
    if (!response?.ok || !payload.items) { setMessage({ tone: "error", text: payload.error || "Eraser ne répond pas : réessaie dans un instant." }); return }
    setItems(payload.items)
    setSaved(JSON.stringify(payload.items))
    setBase(payload.updatedAt ?? "")
    setCustom(Boolean(payload.custom))
    if (payload.previous !== undefined) setPrevious(payload.previous)
    setMessage({ tone: "ok", text: done })
    // La barre latérale suit à la prochaine page ; on recharge pour la voir tout de suite.
    window.setTimeout(() => window.location.reload(), 900)
  }

  /** « Ouvrir dans l'atelier » : la page de l'atelier (une page d'Eraser y est reprise d'abord). */
  async function openInStudio(path: string, pageId: string) {
    if (dirty) { setMessage({ tone: "error", text: "Enregistre (ou annule) tes changements du menu avant d’ouvrir une page dans l’atelier." }); return }
    if (pageId) { router.push(studioHref(pageId)); return }
    setBusy(`open:${path}`)
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adopt", path }) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { page?: { id: string }; error?: string }
    if (!response?.ok || !payload.page) { setBusy(""); setMessage({ tone: "error", text: payload.error || "Eraser ne répond pas : réessaie dans un instant." }); return }
    router.push(studioHref(payload.page.id))
  }

  function openAdding(kind: Adding["kind"], parent: string) {
    setDraft({ page: "", folder: "", query: "", label: "", href: "", roles: allRoles })
    setAdding({ kind, parent })
  }

  const chosenPage = initial.pages.find((page) => page.key === draft.page)
  function addEntry() {
    if (!adding) return
    let node: MenuNode | null = null
    if (adding.kind === "page" && chosenPage && !inMenu.has(chosenPage.href)) {
      // Une page d'Eraser entre comme un lien vers son adresse : on y lit ce que les lecteurs lisent.
      node = chosenPage.eraser || !chosenPage.id ? { id: newId("lien").replace("lien-", "lien:"), label: chosenPage.title, href: chosenPage.href, roles: rolesOfVis(chosenPage.vis) } : { id: `page:${chosenPage.id}` }
    } else if (adding.kind === "dossier" && draft.folder && !foldersInMenu.has(`dossier:${draft.folder}`)) {
      node = { id: `dossier:${draft.folder}`, roles: draft.roles }
    } else if (adding.kind === "lien" && cleanMenuHref(draft.href) && draft.label.trim()) {
      node = { id: newId("lien").replace("lien-", "lien:"), label: draft.label.trim(), href: cleanMenuHref(draft.href), roles: draft.roles }
    } else if (adding.kind === "groupe" && draft.label.trim()) {
      node = { id: newId("groupe").replace("groupe-", "groupe:"), label: draft.label.trim(), roles: draft.roles, children: [] }
    }
    if (!node) return
    const entry = node
    edit((next) => {
      const parent = adding.parent ? next.find((candidate) => candidate.id === adding.parent) : null
      if (parent && adding.kind !== "groupe") (parent.children ??= []).push(entry)
      else next.push(entry)
    })
    setAdding(null)
  }

  /** Les pages proposées : par dossier, ou à plat (avec leur dossier) pendant une recherche. */
  const pickerGroups = useMemo(() => {
    const words = fold(draft.query).split(/\s+/).filter(Boolean)
    const matches = (page: MenuPageChoice) => !words.length || words.every((word) => fold(`${page.title} ${page.href} ${folderPathLabel(initial.folders, initial.folders.placement[page.key] ?? "")}`).includes(word))
    const pages = initial.pages.filter(matches)
    if (words.length) return [{ id: "recherche", label: "", depth: 0, pages }]
    const groups = flattenFolders(initial.folders).map(({ folder, depth }) => ({ id: folder.id, label: folder.name, depth, pages: pages.filter((page) => initial.folders.placement[page.key] === folder.id) }))
    return [...groups, { id: "", label: initial.folders.folders.length ? "Non rangées" : "", depth: 0, pages: pages.filter((page) => !initial.folders.placement[page.key]) }].filter((group) => group.pages.length)
  }, [draft.query, initial.pages, initial.folders])

  const roleToggles = (value: PageRole[], onChange: (roles: PageRole[]) => void) => <div className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground">Visible pour
    {allRoles.map((item) => { const on = value.includes(item); return <button key={item} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((other) => other !== item) : [...value, item])} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"><span className={`size-1.5 rounded-full ${roleDot[item]}`} />{roleLabels[item]}</button> })}
  </div>

  // Une fonction, pas un composant : les champs gardent le curseur pendant la frappe.
  function renderRow(node: MenuNode, depth: number, index: number, count: number) {
    const entry = catalogEntry(node.id)
    const pageNode = node.id.startsWith("page:") ? pageById.get(node.id.slice(5)) : undefined
    const folderNode = isFolderNode(node.id) ? folderById.get(node.id.slice(8)) : undefined
    const href = pageNode?.href ?? node.href ?? entry?.href
    // Une page d'Eraser (au menu par son entrée d'Eraser ou un lien) ou de l'atelier : même ligne, même « Ouvrir dans l'atelier ».
    const route = !pageNode ? routeOf(href) : undefined
    const page = pageNode ?? (href ? pageByHref.get(href.split(/[?#]/)[0]) : undefined)
    const isPage = Boolean(pageNode || route)
    const locked = Boolean(entry?.locked)
    const adminOnly = Boolean(entry && !entry.roles.includes("mj"))
    const readOnly = adminOnly && !isAdmin
    const removable = !entry
    const section = isSectionNode(node.id)
    const defaultLabel = entry?.label ?? pageNode?.title ?? folderNode?.name ?? (node.id.startsWith("page:") ? "Page introuvable" : isFolderNode(node.id) ? "Dossier supprimé" : "")
    const roles = entry?.roles ?? (pageNode ? rolesOfVis(pageNode.vis) : node.roles ?? [])

    if (entry?.dynamic === "section-pages") {
      // L'entrée automatique de la section : les pages qu'on y rangera plus tard.
      return <div key={node.id} className={`flex items-center gap-2 rounded-xl border border-dashed px-3 py-1.5 text-[11.5px] text-muted-foreground ${node.hidden ? "opacity-60" : ""}`}>
        <FilePlus2 className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{node.hidden ? "Les nouvelles pages de cette section n’apparaîtront pas d’elles-mêmes." : "Les pages rangées plus tard dans cette section s’ajouteront ici d’elles-mêmes."}</span>
        <Button type="button" variant="ghost" size="icon-xs" title={node.hidden ? "Les montrer" : "Ne plus les ajouter d’office"} aria-label={node.hidden ? "Montrer les nouvelles pages" : "Ne plus montrer les nouvelles pages"} onClick={() => update(node.id, { hidden: node.hidden ? undefined : true })}>{node.hidden ? <EyeOff /> : <Eye />}</Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} title="Monter" aria-label="Monter" onClick={() => move(node.id, -1)}><ArrowUp /></Button>
        <Button type="button" variant="ghost" size="icon-xs" disabled={index === count - 1} title="Descendre" aria-label="Descendre" onClick={() => move(node.id, 1)}><ArrowDown /></Button>
      </div>
    }

    return <div key={node.id} className={`grid gap-1 rounded-xl border px-2.5 py-1.5 transition ${node.hidden ? "border-dashed bg-muted/40 opacity-70" : "bg-card"} ${depth ? "" : "shadow-[0_6px_18px_rgb(67_50_31/0.05)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          {entry?.dynamic ? <Star className="size-4" />
            : isFolderNode(node.id) && !node.icon && !node.emoji ? <FolderGlyph folder={folderNode} className="size-4" />
            : <ItemIcon node={{ icon: node.icon ?? (isPage ? page?.icon || route?.icon || (entry ? undefined : "file-text") : undefined), emoji: node.emoji ?? (isPage ? page?.emoji : undefined), builtinIcon: entry?.icon ?? (section ? "folder" : "link") }} />}
        </span>
        {entry?.dynamic
          ? <span className="min-w-0 flex-1"><b className="block text-[13px]">{entry.label}</b><small className="block text-[11.5px] text-muted-foreground">{dynamicHints[node.id] ?? ""}</small></span>
          : <span className="grid min-w-[9rem] flex-1 gap-0.5">
            <input value={node.label ?? ""} disabled={readOnly} onChange={(event) => update(node.id, { label: event.target.value || undefined })} placeholder={defaultLabel} aria-label={`Libellé de ${defaultLabel || "l’entrée"}`} title="Laisse vide pour garder le nom de la page" className={`${fieldClass} placeholder:text-foreground/75 ${depth ? "" : "font-semibold"}`} />
            {isFolderNode(node.id) && <small className="truncate pl-1 text-[11px] text-muted-foreground">{folderNode ? `Dossier « ${folderPathLabel(initial.folders, folderNode.id)} » : ses pages publiées, sous-dossiers compris` : "Ce dossier n’existe plus : l’entrée ne s’affiche pas."}</small>}
          </span>}
        <span className="flex items-center gap-1" title={roles.map((item) => roleLabels[item]).join(", ")}>{roles.map((item) => <span key={item} className={`size-2 rounded-full ${roleDot[item]}`} />)}</span>
        {locked && <span title="L’admin la garde toujours dans son menu" className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[10.5px] text-muted-foreground"><Lock className="size-3" />toujours pour l’admin</span>}
        {readOnly && <span className="rounded-full border px-1.5 text-[10.5px] text-muted-foreground">réglée par les admins</span>}
        <span className="ml-auto flex items-center">
          {isPage && <Button type="button" variant="ghost" size="xs" disabled={Boolean(busy)} title="Modifier cette page dans l’atelier" onClick={() => void openInStudio(route?.path ?? "", pageNode?.id ?? (route ? initial.studio[route.path] ?? "" : ""))}>{busy === `open:${route?.path}` ? <LoaderCircle className="animate-spin" /> : <PenLine />}<span className="max-sm:hidden">Ouvrir</span></Button>}
          {folderNode && <Button asChild variant="ghost" size="xs" title="Ouvrir le dossier dans l’Index des pages"><Link href={`/pages?dossier=${encodeURIComponent(folderNode.id)}`} prefetch={false}><FolderOpen /><span className="max-sm:hidden">Dossier</span></Link></Button>}
          {!entry?.dynamic && <IconPicker icon={node.icon} emoji={node.emoji} allowNone disabled={readOnly} cell={{ label: "Icône", filled: false }} onChange={(value) => update(node.id, { icon: value.icon, emoji: value.emoji })} />}
          <Button type="button" variant="ghost" size="icon-xs" disabled={readOnly} title={node.hidden ? "Montrer" : "Masquer"} aria-label={node.hidden ? "Montrer" : "Masquer"} onClick={() => update(node.id, { hidden: node.hidden ? undefined : true })}>{node.hidden ? <EyeOff /> : <Eye />}</Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} title="Monter" aria-label="Monter" onClick={() => move(node.id, -1)}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === count - 1} title="Descendre" aria-label="Descendre" onClick={() => move(node.id, 1)}><ArrowDown /></Button>
          {removable && <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" title="Retirer du menu" aria-label="Retirer du menu" onClick={() => remove(node.id)}><Trash2 /></Button>}
        </span>
      </div>
      {(!section && !entry?.dynamic) || (section && href) ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-10 text-[11.5px] text-muted-foreground">
        {href && !(node.id.startsWith("lien:") && !route) && <span className="min-w-0 truncate font-mono text-[10.5px]">{href}{pageNode && !pageNode.published ? " · brouillon : au menu une fois publiée" : ""}</span>}
        {node.id.startsWith("lien:") && !route && <input value={node.href ?? ""} onChange={(event) => update(node.id, { href: event.target.value })} aria-label="Adresse du lien" className={`${fieldClass.replace("w-full ", "").replace("h-8 ", "")} h-6 w-64 max-w-full font-mono text-[11px]`} />}
        {!section && <label className="ml-auto flex items-center gap-1.5">Rangée
          <select className={`${fieldClass.replace("w-full ", "").replace("h-8 ", "")} h-6 w-auto max-w-56 py-0 text-[11.5px]`} value={findParent(items, node.id)?.parent?.id ?? ""} onChange={(event) => moveTo(node.id, event.target.value)}>
            <option value="">Au premier niveau</option>
            {sections.map((candidate) => <option key={candidate.id} value={candidate.id}>Dans « {candidate.label || catalogEntry(candidate.id)?.label || "Section"} »</option>)}
          </select>
        </label>}
      </div> : null}
      {(node.id.startsWith("lien:") || node.id.startsWith("groupe:") || isFolderNode(node.id)) && <div className="pl-10">{roleToggles(node.roles ?? [], (next) => update(node.id, { roles: next }))}</div>}
      {section && <div className="ml-4 grid gap-1.5 border-l-2 border-border/70 pl-3">
        {(node.children ?? []).map((child, childIndex) => renderRow(child, 1, childIndex, node.children!.length))}
        <span className="flex flex-wrap gap-1">
          <button type="button" onClick={() => openAdding("page", node.id)} className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11.5px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"><Plus className="size-3" />Une page ici</button>
          <button type="button" onClick={() => openAdding("dossier", node.id)} className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11.5px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"><Folder className="size-3" />Un dossier ici</button>
          <button type="button" onClick={() => openAdding("lien", node.id)} className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11.5px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"><Link2 className="size-3" />Un lien ici</button>
        </span>
      </div>}
    </div>
  }

  const parentLabel = adding?.parent ? items.find((node) => node.id === adding.parent)?.label || catalogEntry(adding.parent)?.label || "la section" : ""

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-12">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <section className="max-w-3xl">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Créateur de pages</div>
        <div className="flex items-start gap-4">
          <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]"><PanelLeft className="size-5" /></div>
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Menu</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Le menu latéral de toute la table : l’ordre, les noms, les icônes et les entrées masquées. Chaque page y est une entrée comme une autre ; un dossier entier peut y prendre place. Masquer une entrée ne donne rien à personne : chacun ne voit que ce que son rôle lui ouvre.</p>
          </div>
        </div>
      </section>
      <div className="flex flex-col items-start gap-2 lg:items-end">
        <PageCreatorNav active="menu" />
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {custom && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirmReset(true)}><RotateCcw />Rétablir le menu d’Eraser</Button>}
          {!custom && previous && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void post({ action: "restore" }, "Menu précédent remis.")}>{busy === "restore" ? <LoaderCircle className="animate-spin" /> : <Undo2 />}Remettre le menu précédent</Button>}
          <Button type="button" variant="ghost" disabled={!dirty || Boolean(busy)} onClick={() => setItems(JSON.parse(saved) as MenuNode[])}>Annuler les changements</Button>
          <Button type="button" disabled={!dirty || Boolean(busy)} onClick={() => void post({ action: "save", items, base }, "Menu enregistré pour toute la table.")}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : null}Enregistrer le menu</Button>
        </div>
      </div>
    </div>
    {message && <p role="status" className={`mt-5 rounded-xl border px-4 py-2.5 text-sm ${message.tone === "ok" ? "border-[#0f7a65]/35 bg-[#0f7a65]/8 text-[#0f7a65]" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{message.text}</p>}
    <p className="mt-5 text-xs text-muted-foreground">{custom ? `Menu réglé${initial.updatedBy ? ` (dernière modification par ${initial.updatedBy})` : ""}.` : "Menu d’Eraser, tel qu’il est livré."} Une entrée d’Eraser ajoutée par une nouvelle version apparaît d’elle-même à sa place.</p>

    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-label="Entrées du menu" className="grid gap-2">
        {items.map((node, index) => renderRow(node, 0, index, items.length))}
        <div className="mt-1 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openAdding("page", "")}><FilePlus2 />Ajouter une page</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openAdding("dossier", "")}><Folder />Ajouter un dossier de pages</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openAdding("lien", "")}><Link2 />Ajouter un lien</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openAdding("groupe", "")}><FolderPlus />Ajouter une section</Button>
        </div>
      </section>
      <aside className="grid gap-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Aperçu</h2>
          <div role="group" aria-label="Voir comme" className="inline-flex rounded-[10px] border bg-card p-0.5">
            {(isAdmin ? ["admin", "mj", "joueur"] as PageRole[] : ["mj", "joueur"] as PageRole[]).map((value) => <button key={value} type="button" aria-pressed={previewRole === value} onClick={() => setPreviewRole(value)} className="rounded-md px-2 py-0.5 text-xs text-muted-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background">{roleLabels[value]}</button>)}
          </div>
        </div>
        <Preview items={preview} role={previewRole} />
        <p className="text-[11.5px] leading-snug text-muted-foreground">Les entrées du compte (campagne, personnage, index étoilés) se remplissent pour chacun. Une page n’apparaît qu’une fois publiée, et seulement à qui peut la lire. La Corbeille et les mises à jour restent en bas du menu.</p>
      </aside>
    </div>

    <Dialog open={Boolean(adding)} onOpenChange={(open) => { if (!open) setAdding(null) }}>
      <DialogContent className={adding?.kind === "page" ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{adding?.kind === "page" ? "Ajouter une page" : adding?.kind === "dossier" ? "Ajouter un dossier de pages" : adding?.kind === "lien" ? "Ajouter un lien" : "Ajouter une section"}</DialogTitle>
          <DialogDescription>{adding?.kind === "dossier" ? `Ses pages publiées, sous-dossiers compris, à qui peut les lire ; une page qu’on y range plus tard y apparaît d’elle-même. ${parentLabel ? `Dans « ${parentLabel} ».` : "Au premier niveau : une section à son nom."}` : parentLabel ? `Dans « ${parentLabel} ».` : "Au premier niveau du menu."}</DialogDescription>
        </DialogHeader>
        {adding?.kind === "page" && <div className="grid gap-2">
          <label className="flex items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-ring">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} placeholder="Chercher une page : titre, adresse, dossier…" aria-label="Chercher une page" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div role="listbox" aria-label="Pages" className="grid max-h-[50vh] gap-1 overflow-y-auto rounded-xl border bg-card p-1">
            {pickerGroups.map((group) => <div key={group.id || "racine"} className="grid gap-px">
              {group.label && <p style={{ paddingLeft: `${0.5 + group.depth * 0.9}rem` }} className="flex items-center gap-1.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><Folder className="size-3" />{group.label}</p>}
              {group.pages.map((page) => {
                const already = inMenu.has(page.href)
                return <button key={page.key} type="button" role="option" aria-selected={draft.page === page.key} disabled={already} onClick={() => setDraft({ ...draft, page: page.key })} style={{ paddingLeft: `${0.5 + (group.label ? (group.depth + 1) * 0.9 : 0)}rem` }} className="flex h-9 w-full items-center gap-2 rounded-lg pr-2 text-left text-[13px] hover:bg-muted disabled:cursor-default disabled:opacity-50 aria-selected:bg-foreground aria-selected:text-background">
                  <IndexIconGlyph icon={page.icon || "file-text"} emoji={page.emoji} filled={false} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{page.title}</span>{draft.query && initial.folders.placement[page.key] ? <small className="block truncate text-[10.5px] opacity-70">{folderPathLabel(initial.folders, initial.folders.placement[page.key])}</small> : null}</span>
                  <small className="shrink-0 text-[10.5px] opacity-70">{already ? "déjà au menu" : !page.published ? "brouillon" : ""}</small>
                  {draft.page === page.key && <Check className="size-3.5" />}
                </button>
              })}
            </div>)}
            {!pickerGroups.length && <p className="px-2 py-4 text-center text-[12.5px] text-muted-foreground">Aucune page ne correspond.</p>}
          </div>
        </div>}
        {adding?.kind === "dossier" && <div className="grid gap-2">
          {initial.folders.folders.length
            ? <select autoFocus className={`${fieldClass} h-9 text-sm`} value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })}>
              <option value="">Choisir un dossier…</option>
              {flattenFolders(initial.folders).map(({ folder, depth }) => <option key={folder.id} value={folder.id} disabled={foldersInMenu.has(`dossier:${folder.id}`)}>{`${" ".repeat(depth)}${folder.name}${foldersInMenu.has(`dossier:${folder.id}`) ? " (déjà au menu)" : ""}`}</option>)}
            </select>
            : <p className="rounded-xl border border-dashed px-3 py-3 text-[13px] text-muted-foreground">Aucun dossier pour l’instant : crée-les dans l’<Link href="/pages" prefetch={false} className="font-semibold underline underline-offset-2">Index des pages</Link>.</p>}
          {roleToggles(draft.roles, (roles) => setDraft({ ...draft, roles }))}
        </div>}
        {adding && (adding.kind === "lien" || adding.kind === "groupe") && <div className="grid gap-2">
          <input autoFocus value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder={adding.kind === "lien" ? "Libellé du lien" : "Nom de la section"} className={`${fieldClass} h-9 text-sm`} />
          {adding.kind === "lien" && <input value={draft.href} onChange={(event) => setDraft({ ...draft, href: event.target.value })} placeholder="/regles/combat ou https://…" className={`${fieldClass} h-9 font-mono text-[13px]`} />}
          {roleToggles(draft.roles, (roles) => setDraft({ ...draft, roles }))}
          <p className="text-[11.5px] text-muted-foreground">Un lien vers une page réservée ne l’ouvre pas pour autant : la page garde ses propres droits.</p>
        </div>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setAdding(null)}>Annuler</Button>
          <Button type="button" onClick={addEntry} disabled={adding?.kind === "page" ? !chosenPage : adding?.kind === "dossier" ? !draft.folder : false}><Plus />Ajouter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Rétablir le menu d’Eraser ?</DialogTitle>
          <DialogDescription>Le menu revient tel qu’Eraser le livre, pour toute la table. Le réglage actuel est gardé de côté : « Remettre le menu précédent » le rend d’un clic.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setConfirmReset(false)}>Annuler</Button>
          <Button type="button" onClick={() => { setConfirmReset(false); void post({ action: "reset" }, "Menu d’Eraser rétabli.") }}><RotateCcw />Rétablir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
