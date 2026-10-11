"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, CircleUserRound, Eye, EyeOff, FilePlus2, FlaskConical, Folder, FolderPlus, Home, LibraryBig, Link2, LoaderCircle, Lock, Map, PanelLeft, Plus, RotateCcw, ScrollText, ShieldCheck, Star, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IconPicker, IndexIconGlyph } from "@/components/eraser/index-gauge"
import { fieldClass, roleDot } from "@/components/eraser/page-studio-settings"
import { catalogEntry, cleanMenuHref, isSectionNode, resolveMenu, type MenuIconKey, type MenuNode, type MenuPageEntry, type ResolvedMenuItem } from "@/lib/app-menu"
import { newId, roleLabels, type PageRole } from "@/lib/custom-pages"

/**
 * L'éditeur du menu latéral (admins et MJ ; réglage commun à toute la table) : réordonner,
 * renommer, masquer et regrouper les entrées — celles d'Eraser comprises —, y placer des
 * pages du créateur de pages et des liens. L'aperçu à droite montre le menu de chaque rôle.
 * Masquer ne donne aucun accès : chaque entrée garde ses rôles. L'admin garde toujours le
 * Créateur de pages et cet éditeur.
 */

type PageChoice = { id: string; title: string; href: string; icon: string; emoji: string; status: string; vis: string; place: string }

const icons: Record<MenuIconKey, typeof BookOpen> = { home: Home, map: Map, user: CircleUserRound, scroll: ScrollText, library: LibraryBig, flask: FlaskConical, shield: ShieldCheck, "file-plus": FilePlus2, menu: PanelLeft, link: Link2, folder: Folder, star: Star }

const dynamicHints: Record<string, string> = {
  "dossier": "MJ : la campagne choisie, ses pages en dessous.",
  "personnage": "Joueur : son personnage choisi et ses campagnes.",
  "index-rouges": "Les index à l’étoile rouge (page Index, clic droit sur l’étoile).",
  "index/etoiles": "Les index étoilés, dans l’ordre de la page Index.",
}

const clone = (items: MenuNode[]) => JSON.parse(JSON.stringify(items)) as MenuNode[]

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
  return <nav aria-label="Aperçu du menu" className="grid gap-0.5 rounded-2xl bg-sidebar p-2.5 text-sidebar-foreground shadow-[0_14px_36px_rgb(20_16_12/0.25)]">
    <div className="mb-2 flex items-center gap-2 border-b border-sidebar-border px-1.5 pb-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon.png" alt="" className="size-8 rounded-lg" />
      <span><b className="block font-display text-[15px]">Eraser</b><small className="block text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/55">Vue {roleLabels[role].toLowerCase()}</small></span>
    </div>
    {items.map((item) => {
      if (item.dynamic === "dossier") return <p key={item.key} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-sidebar-foreground/70"><Map className="size-4" />Dossier - <i>campagne choisie</i></p>
      if (item.dynamic === "personnage") return <p key={item.key} className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-sidebar-foreground/70"><CircleUserRound className="size-4" /><i>Personnage choisi</i></p>
      if (item.dynamic === "index-rouges") return <p key={item.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] italic text-sidebar-foreground/55"><Star className="size-3.5" />Index à l’étoile rouge</p>
      return <div key={item.key}>
        <p className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] hover:bg-sidebar-accent"><ItemIcon node={item} /><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.section && <ChevronDown className="size-3.5 opacity-60" />}{item.action && <Plus className="size-3.5 opacity-60" />}</p>
        {item.section && (item.children ?? []).length > 0 && <div className="ml-4 grid gap-0.5 border-l border-sidebar-border pl-2.5">
          {(item.children ?? []).flatMap((child) => child.dynamic === "section-pages" ? (child.pages ?? []).map((page) => <p key={page.href} className="truncate rounded-md px-2 py-1 text-[12.5px] text-sidebar-foreground/80">{page.title}</p>) : [<p key={child.key} className="truncate rounded-md px-2 py-1 text-[12.5px] text-sidebar-foreground/80">{child.dynamic === "index-etoiles" ? <i className="text-sidebar-foreground/55">Index étoilés</i> : child.label}</p>])}
        </div>}
      </div>
    })}
  </nav>
}

export function MenuEditor({ initial, role }: { initial: { items: MenuNode[]; custom: boolean; updatedAt: string; updatedBy: string; previous: boolean; pages: PageChoice[] }; role: PageRole }) {
  const [items, setItems] = useState(initial.items)
  const [saved, setSaved] = useState(JSON.stringify(initial.items))
  const [base, setBase] = useState(initial.updatedAt)
  const [custom, setCustom] = useState(initial.custom)
  const [previous, setPrevious] = useState(initial.previous)
  const [previewRole, setPreviewRole] = useState<PageRole>(role)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [adding, setAdding] = useState<null | { kind: "page" | "lien" | "groupe"; parent: string }>(null)
  const [draft, setDraft] = useState({ pageId: "", label: "", href: "", roles: ["joueur", "mj", "admin"] as PageRole[] })
  const isAdmin = role === "admin"
  const dirty = JSON.stringify(items) !== saved
  const pageMap = useMemo(() => new globalThis.Map(initial.pages.map((page) => [page.id, page])), [initial.pages])
  const publishedPages = useMemo(() => Object.fromEntries(initial.pages.filter((page) => page.status === "publiee").map((page) => [page.id, { title: page.title, href: page.href, icon: page.icon, emoji: page.emoji } satisfies MenuPageEntry])), [initial.pages])
  const sectionPages = useMemo(() => {
    const out: Record<string, MenuPageEntry[]> = {}
    for (const page of initial.pages) if (page.status === "publiee" && page.place && page.place !== "hors-menu" && page.place !== "campagne") (out[page.place] ??= []).push({ title: page.title, href: page.href, icon: page.icon, emoji: page.emoji })
    return out
  }, [initial.pages])
  const preview = useMemo(() => resolveMenu(items, { role: previewRole, pages: publishedPages, sectionPages }), [items, previewRole, publishedPages, sectionPages])
  const sections = items.filter((node) => isSectionNode(node.id))

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

  function addEntry() {
    if (!adding) return
    const node: MenuNode | null = adding.kind === "page"
      ? (draft.pageId && !JSON.stringify(items).includes(`"page:${draft.pageId}"`) ? { id: `page:${draft.pageId}` } : null)
      : adding.kind === "lien"
        ? (cleanMenuHref(draft.href) && draft.label.trim() ? { id: newId("lien").replace("lien-", "lien:"), label: draft.label.trim(), href: cleanMenuHref(draft.href), roles: draft.roles } : null)
        : (draft.label.trim() ? { id: newId("groupe").replace("groupe-", "groupe:"), label: draft.label.trim(), roles: draft.roles, children: [] } : null)
    if (!node) return
    edit((next) => {
      const parent = adding.parent ? next.find((candidate) => candidate.id === adding.parent) : null
      if (parent && adding.kind !== "groupe") (parent.children ??= []).push(node)
      else next.push(node)
    })
    setAdding(null)
    setDraft({ pageId: "", label: "", href: "", roles: ["joueur", "mj", "admin"] })
  }

  // Une fonction, pas un composant : les champs gardent le curseur pendant la frappe.
  function renderRow(node: MenuNode, depth: number, index: number, count: number) {
    const entry = catalogEntry(node.id)
    const page = node.id.startsWith("page:") ? pageMap.get(node.id.slice(5)) : undefined
    const locked = Boolean(entry?.locked)
    const adminOnly = Boolean(entry && !entry.roles.includes("mj"))
    const readOnly = adminOnly && !isAdmin
    const custom = !entry
    const defaultLabel = entry?.label ?? page?.title ?? (node.id.startsWith("page:") ? "Page introuvable" : "")
    const roles = entry?.roles ?? (node.id.startsWith("page:") ? null : node.roles ?? [])
    const section = isSectionNode(node.id)
    return <div key={node.id} className={`grid gap-1.5 rounded-xl border px-2.5 py-2 transition ${node.hidden ? "border-dashed bg-muted/40 opacity-70" : "bg-card"} ${depth ? "" : "shadow-[0_6px_18px_rgb(67_50_31/0.05)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">{entry?.dynamic ? <Star className="size-4" /> : <ItemIcon node={{ icon: node.icon ?? page?.icon, emoji: node.emoji ?? page?.emoji, builtinIcon: entry?.icon ?? (section ? "folder" : "link") }} />}</span>
        {entry?.dynamic
          ? <span className="min-w-0 flex-1"><b className="block text-[13px]">{entry.label}</b><small className="block text-[11.5px] text-muted-foreground">{dynamicHints[node.id] ?? (entry.dynamic === "section-pages" ? "Les pages publiées du créateur de pages rangées dans cette section (sauf celles placées ailleurs dans le menu)." : "")}</small></span>
          : <input value={node.label ?? ""} disabled={readOnly} onChange={(event) => update(node.id, { label: event.target.value || undefined })} placeholder={defaultLabel} aria-label={`Libellé de ${defaultLabel}`} className={`${fieldClass} min-w-[9rem] flex-1 ${depth ? "" : "font-semibold"}`} />}
        <span className="flex items-center gap-1">{roles ? roles.map((item) => <span key={item} title={roleLabels[item]} className={`size-2 rounded-full ${roleDot[item]}`} />) : <span className="text-[10.5px] text-muted-foreground" title="Comme la page">page</span>}</span>
        {locked && <span title="L’admin la garde toujours dans son menu" className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[10.5px] text-muted-foreground"><Lock className="size-3" />toujours pour l’admin</span>}
        {readOnly && <span className="rounded-full border px-1.5 text-[10.5px] text-muted-foreground">réglée par les admins</span>}
        <span className="ml-auto flex items-center">
          {!entry?.dynamic && <IconPicker icon={node.icon} emoji={node.emoji} allowNone disabled={readOnly} cell={{ label: "Icône", filled: false }} onChange={(value) => update(node.id, { icon: value.icon, emoji: value.emoji })} />}
          <Button type="button" variant="ghost" size="icon-xs" disabled={readOnly} title={node.hidden ? "Montrer" : "Masquer"} aria-label={node.hidden ? "Montrer" : "Masquer"} onClick={() => update(node.id, { hidden: node.hidden ? undefined : true })}>{node.hidden ? <EyeOff /> : <Eye />}</Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === 0} title="Monter" aria-label="Monter" onClick={() => move(node.id, -1)}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={index === count - 1} title="Descendre" aria-label="Descendre" onClick={() => move(node.id, 1)}><ArrowDown /></Button>
          {custom && <Button type="button" variant="ghost" size="icon-xs" className="hover:text-destructive" title="Retirer du menu" aria-label="Retirer du menu" onClick={() => remove(node.id)}><Trash2 /></Button>}
        </span>
      </div>
      {!section && !entry?.dynamic && <label className="flex items-center gap-2 pl-10 text-[11.5px] text-muted-foreground">Rangée
        <select className={`${fieldClass} h-7 w-auto text-xs`} value={findParent(items, node.id)?.parent?.id ?? ""} onChange={(event) => moveTo(node.id, event.target.value)}>
          <option value="">Au premier niveau du menu</option>
          {sections.map((candidate) => <option key={candidate.id} value={candidate.id}>Dans « {candidate.label || catalogEntry(candidate.id)?.label || "Section"} »</option>)}
        </select>
        {node.id.startsWith("lien:") && <input value={node.href ?? ""} onChange={(event) => update(node.id, { href: event.target.value })} aria-label="Adresse du lien" className={`${fieldClass} h-7 max-w-64 font-mono text-[11.5px]`} />}
      </label>}
      {(node.id.startsWith("lien:") || node.id.startsWith("groupe:")) && <div className="flex flex-wrap items-center gap-1 pl-10 text-[11.5px] text-muted-foreground">Visible pour
        {(["joueur", "mj", "admin"] as PageRole[]).map((item) => { const on = (node.roles ?? []).includes(item); return <button key={item} type="button" aria-pressed={on} onClick={() => update(node.id, { roles: on ? (node.roles ?? []).filter((value) => value !== item) : [...(node.roles ?? []), item] })} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"><span className={`size-1.5 rounded-full ${roleDot[item]}`} />{roleLabels[item]}</button> })}
      </div>}
      {section && <div className="grid gap-1.5 border-l-2 border-border/70 pl-3 ml-4">
        {(node.children ?? []).map((child, childIndex) => renderRow(child, 1, childIndex, node.children!.length))}
        <span className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setAdding({ kind: "page", parent: node.id })} className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11.5px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"><Plus className="size-3" />Une page ici</button>
          <button type="button" onClick={() => setAdding({ kind: "lien", parent: node.id })} className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11.5px] text-muted-foreground hover:border-[#3b5c8a] hover:text-foreground"><Link2 className="size-3" />Un lien ici</button>
        </span>
      </div>}
    </div>
  }

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-12">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <section className="max-w-3xl">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Créateur de pages</div>
        <div className="flex items-start gap-4">
          <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]"><PanelLeft className="size-5" /></div>
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Menu</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Le menu latéral de toute la table : l’ordre, les noms, les icônes et les entrées masquées. Masquer une entrée ne donne rien à personne : chacun ne voit que ce que son rôle lui ouvre.</p>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {custom && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirmReset(true)}><RotateCcw />Rétablir le menu d’Eraser</Button>}
        {!custom && previous && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void post({ action: "restore" }, "Menu précédent remis.")}>{busy === "restore" ? <LoaderCircle className="animate-spin" /> : <Undo2 />}Remettre le menu précédent</Button>}
        <Button type="button" variant="ghost" disabled={!dirty || Boolean(busy)} onClick={() => setItems(JSON.parse(saved) as MenuNode[])}>Annuler les changements</Button>
        <Button type="button" disabled={!dirty || Boolean(busy)} onClick={() => void post({ action: "save", items, base }, "Menu enregistré pour toute la table.")}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : null}Enregistrer le menu</Button>
      </div>
    </div>
    {message && <p role="status" className={`mt-5 rounded-xl border px-4 py-2.5 text-sm ${message.tone === "ok" ? "border-[#0f7a65]/35 bg-[#0f7a65]/8 text-[#0f7a65]" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{message.text}</p>}
    <p className="mt-5 text-xs text-muted-foreground">{custom ? `Menu réglé${initial.updatedBy ? ` (dernière modification par ${initial.updatedBy})` : ""}.` : "Menu d’Eraser, tel qu’il est livré."} Une entrée d’Eraser ajoutée par une nouvelle version apparaît d’elle-même à sa place.</p>

    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-label="Entrées du menu" className="grid gap-2">
        {items.map((node, index) => renderRow(node, 0, index, items.length))}
        <div className="mt-1 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding({ kind: "page", parent: "" })}><FilePlus2 />Ajouter une page</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding({ kind: "lien", parent: "" })}><Link2 />Ajouter un lien</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding({ kind: "groupe", parent: "" })}><FolderPlus />Ajouter une section</Button>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{adding?.kind === "page" ? "Ajouter une page" : adding?.kind === "lien" ? "Ajouter un lien" : "Ajouter une section"}</DialogTitle>
          <DialogDescription>{adding?.parent ? `Dans « ${items.find((node) => node.id === adding.parent)?.label || catalogEntry(adding.parent)?.label || "la section"} ».` : "Au premier niveau du menu."}</DialogDescription>
        </DialogHeader>
        {adding?.kind === "page" && <select autoFocus className={`${fieldClass} h-9 text-sm`} value={draft.pageId} onChange={(event) => setDraft({ ...draft, pageId: event.target.value })}>
          <option value="">Choisir une page…</option>
          {initial.pages.map((page) => <option key={page.id} value={page.id} disabled={JSON.stringify(items).includes(`"page:${page.id}"`)}>{page.title}{page.status !== "publiee" ? " (brouillon : pas encore au menu)" : ""}</option>)}
        </select>}
        {adding && adding.kind !== "page" && <div className="grid gap-2">
          <input autoFocus value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder={adding.kind === "lien" ? "Libellé du lien" : "Nom de la section"} className={`${fieldClass} h-9 text-sm`} />
          {adding.kind === "lien" && <input value={draft.href} onChange={(event) => setDraft({ ...draft, href: event.target.value })} placeholder="/regles/combat ou https://…" className={`${fieldClass} h-9 font-mono text-[13px]`} />}
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">Visible pour
            {(["joueur", "mj", "admin"] as PageRole[]).map((item) => { const on = draft.roles.includes(item); return <button key={item} type="button" aria-pressed={on} onClick={() => setDraft({ ...draft, roles: on ? draft.roles.filter((value) => value !== item) : [...draft.roles, item] })} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"><span className={`size-1.5 rounded-full ${roleDot[item]}`} />{roleLabels[item]}</button> })}
          </div>
          <p className="text-[11.5px] text-muted-foreground">Un lien vers une page réservée ne l’ouvre pas pour autant : la page garde ses propres droits.</p>
        </div>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setAdding(null)}>Annuler</Button>
          <Button type="button" onClick={addEntry}><Plus />Ajouter</Button>
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
