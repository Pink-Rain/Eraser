"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ArchiveRestore, Eye, FilePlus2, LayoutGrid, PanelLeft, LayoutTemplate, LibraryBig, LoaderCircle, PenLine, Search, Table2, Trash2, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageIcon, formatWhen } from "@/components/eraser/custom-page-view"
import { fieldClass, Field } from "@/components/eraser/page-studio-settings"
import { pagePlaces, pageVisibilities, placeLabel, type PagePlace, type PageRole, type PageSummary, studioHref } from "@/lib/custom-pages"

/**
 * L'Index des pages (admins et MJ) : toutes les pages du créateur de pages, leur place,
 * leur visibilité et leur statut ; la corbeille ; les modèles faits par l'utilisateur.
 * « Nouvelle page » la crée (vide ou depuis un modèle) puis ouvre l'atelier.
 */

export type TemplateSummary = { id: string; name: string; createdAt: string; createdBy: string; title: string; icon: string; emoji: string; blocks: number }

type Filter = { query: string; status: "" | "publiee" | "brouillon" | "corbeille"; place: "" | PagePlace; vis: string; look: "table" | "cards" }

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function StatusPill({ page }: { page: PageSummary }) {
  if (page.trashedAt) return <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Corbeille</span>
  return <span className="inline-flex flex-wrap items-center gap-1">
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${page.status === "publiee" ? "border-[#0f7a65]/40 bg-[#0f7a65]/10 text-[#0f7a65]" : "border-[#9a6512]/40 bg-[#9a6512]/10 text-[#9a6512]"}`}>{page.status === "publiee" ? "Publiée" : "Brouillon"}</span>
    {page.status === "publiee" && page.unpublished && <span className="text-[11px] text-muted-foreground" title="Le brouillon a des modifications pas encore publiées">· modifiée</span>}
  </span>
}

function VisPill({ vis }: { vis: string }) {
  const tone = vis === "mj" ? "border-[#3b5c8a]/35 bg-[#3b5c8a]/8 text-[#3b5c8a]" : vis === "admin" ? "border-primary/35 bg-primary/8 text-primary" : "bg-card text-muted-foreground"
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{pageVisibilities.find((item) => item.value === vis)?.label ?? vis}</span>
}

export function PageDirectory({ pages: initialPages, templates: initialTemplates, campaigns, allCampaigns, role, newPage }: {
  pages: PageSummary[]
  templates: TemplateSummary[]
  /** Les campagnes où le compte peut créer une page (admin : toutes ; MJ : les siennes). */
  campaigns: Array<{ id: string; name: string }>
  allCampaigns: Array<{ id: string; name: string }>
  role: PageRole
  /** Ouvrir tout de suite « Nouvelle page » (lien « Nouvelle page » d'une section). */
  newPage?: { place?: string; template?: string }
}) {
  const router = useRouter()
  const [pages, setPages] = useState(initialPages)
  const [templates, setTemplates] = useState(initialTemplates)
  const [filter, setFilter] = useState<Filter>({ query: "", status: "", place: "", vis: "", look: "table" })
  const [creating, setCreating] = useState(Boolean(newPage))
  const [draft, setDraft] = useState(() => ({ title: "", place: (pagePlaces.some((place) => place.value === newPage?.place) ? newPage!.place : "hors-menu") as PagePlace, campaignId: campaigns[0]?.id ?? "", template: newPage?.template ?? "" }))
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<{ kind: "delete-page" | "delete-template"; id: string; name: string } | null>(null)
  const isAdmin = role === "admin"
  const campaignName = (id: string) => allCampaigns.find((campaign) => campaign.id === id)?.name ?? "Campagne"
  const where = (page: PageSummary) => page.place === "campagne" ? `Campagne · ${campaignName(page.campaignId)}` : page.place === "hors-menu" ? "Hors menu" : placeLabel(page.place)

  const rows = useMemo(() => {
    const words = fold(filter.query).split(/\s+/).filter(Boolean)
    return pages.filter((page) => {
      if (filter.status === "corbeille" ? !page.trashedAt : page.trashedAt) return false
      if (filter.status && filter.status !== "corbeille" && page.status !== filter.status) return false
      if (filter.place && page.place !== filter.place) return false
      if (filter.vis && page.vis !== filter.vis) return false
      const text = fold(`${page.title} ${page.description} ${page.href} ${where(page)}`)
      return words.every((word) => text.includes(word))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `where` ne dépend que des campagnes, fixes
  }, [filter, pages])
  const live = pages.filter((page) => !page.trashedAt).length
  const trashed = pages.length - live

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { page?: { id: string; status: PageSummary["status"]; unpublished: boolean; trashedAt: string; updatedAt: string; slug: string }; error?: string }
    return { ok: Boolean(response?.ok), ...payload, error: payload.error || (response ? "Cette action n’a pas pu être faite." : "Eraser ne répond pas : réessaie dans un instant.") }
  }

  async function create() {
    setBusy("create")
    setError("")
    const result = await post({ action: "create", templateId: draft.template || undefined, page: { title: draft.title.trim() || (draft.template ? templates.find((item) => item.id === draft.template)?.title : "") || "Nouvelle page", place: draft.place, campaignId: draft.place === "campagne" ? draft.campaignId : "", vis: draft.place === "administration" ? "admin" : "tous" } })
    if (!result.ok || !result.page) { setBusy(""); setError(result.error); return }
    router.push(studioHref(result.page.id))
  }

  async function act(page: PageSummary, action: "publish" | "unpublish" | "trash" | "restore" | "delete") {
    setBusy(`${action}:${page.id}`)
    setError("")
    const result = await post({ action, id: page.id, base: page.updatedAt })
    setBusy("")
    if (!result.ok) { setError(result.error); return }
    if (action === "delete") { setPages((list) => list.filter((item) => item.id !== page.id)); return }
    const next = result.page!
    setPages((list) => list.map((item) => item.id === page.id ? { ...item, status: next.status, unpublished: next.unpublished, trashedAt: next.trashedAt, updatedAt: next.updatedAt, slug: next.slug, href: item.href.replace(/[^/]+$/, encodeURIComponent(next.slug)) } : item))
  }

  async function deleteTemplate(id: string) {
    setBusy(`template:${id}`)
    const result = await post({ action: "delete-template", templateId: id })
    setBusy("")
    if (!result.ok) { setError(result.error); return }
    setTemplates((list) => list.filter((item) => item.id !== id))
  }

  const places = pagePlaces.filter((place) => isAdmin || place.value !== "administration")
  const actions = (page: PageSummary) => page.trashedAt
    ? <>
      {page.editable && <Button type="button" size="xs" variant="outline" disabled={Boolean(busy)} onClick={() => void act(page, "restore")}><ArchiveRestore />Restaurer</Button>}
      {isAdmin && <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "delete-page", id: page.id, name: page.title })}><Trash2 />Supprimer</Button>}
    </>
    : <>
      {page.editable && <Button asChild size="xs" variant="outline"><Link href={studioHref(page.id)} prefetch={false}><PenLine />Ouvrir</Link></Button>}
      <Button asChild size="icon-xs" variant="ghost" title="Voir la page" aria-label={`Voir ${page.title}`}><Link href={page.href} prefetch={false}><Eye /></Link></Button>
      {page.editable && (page.status !== "publiee" || page.unpublished) && <Button type="button" size="xs" variant="ghost" disabled={Boolean(busy)} onClick={() => void act(page, "publish")}>{busy === `publish:${page.id}` ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}Publier</Button>}
      {page.editable && <Button type="button" size="icon-xs" variant="ghost" className="hover:text-destructive" title="Mettre à la corbeille" aria-label={`Mettre ${page.title} à la corbeille`} disabled={Boolean(busy)} onClick={() => void act(page, "trash")}><Trash2 /></Button>}
    </>

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-12">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <section className="max-w-3xl">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Créateur de pages</div>
        <div className="flex items-start gap-4">
          <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]"><LibraryBig className="size-5" /></div>
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Index des pages</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Les pages créées dans l’atelier, rangées sous une section du menu, dans une campagne ou hors menu. Elles vivent sur le serveur partagé d’Eraser, jamais dans Google Sheets.</p>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline"><Link href="/pages/menu" prefetch={false}><PanelLeft />Menu</Link></Button>
        <Button type="button" onClick={() => { setError(""); setCreating(true) }}><FilePlus2 />Nouvelle page</Button>
      </div>
    </div>

    <div className="mt-9 flex flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-[1_1_16rem] items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-ring">
        <Search className="size-4 text-muted-foreground" />
        <input value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} placeholder="Chercher un titre, une adresse, une section…" aria-label="Chercher une page" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <select aria-label="Statut" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value as Filter["status"] })}>
        <option value="">Toutes (hors corbeille)</option><option value="publiee">Publiées</option><option value="brouillon">Brouillons</option><option value="corbeille">Corbeille{trashed ? ` (${trashed})` : ""}</option>
      </select>
      <select aria-label="Emplacement" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.place} onChange={(event) => setFilter({ ...filter, place: event.target.value as Filter["place"] })}>
        <option value="">Tout emplacement</option>
        {pagePlaces.map((place) => <option key={place.value} value={place.value}>{place.label.replace(" (lien direct)", "")}</option>)}
      </select>
      <select aria-label="Visibilité" className={`${fieldClass.replace("w-full ", "")} h-9 w-auto`} value={filter.vis} onChange={(event) => setFilter({ ...filter, vis: event.target.value })}>
        <option value="">Toute visibilité</option>
        {pageVisibilities.map((vis) => <option key={vis.value} value={vis.value}>{vis.label}</option>)}
      </select>
      <div role="group" aria-label="Affichage" className="inline-flex rounded-[11px] border bg-card p-0.5">
        {(["table", "cards"] as const).map((look) => <button key={look} type="button" aria-pressed={filter.look === look} onClick={() => setFilter({ ...filter, look })} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-muted aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background">{look === "table" ? <Table2 className="size-3.5" /> : <LayoutGrid className="size-3.5" />}{look === "table" ? "Tableau" : "Cartes"}</button>)}
      </div>
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    <p className="mb-2 mt-4 text-xs text-muted-foreground">{rows.length} page{rows.length > 1 ? "s" : ""} affichée{rows.length > 1 ? "s" : ""} sur {live}{trashed ? ` · ${trashed} dans la corbeille` : ""}</p>

    {!rows.length
      ? <div className="grid place-items-center gap-3 rounded-2xl border border-dashed px-5 py-14 text-center text-sm text-muted-foreground">
        <p>{filter.status === "corbeille" ? "La corbeille est vide." : pages.length ? "Aucune page ne correspond à ces filtres." : "Aucune page pour l’instant. Crée la première : un guide pour les joueurs, une page de règles maison, un tableau de campagne…"}</p>
        {!pages.length && <Button type="button" variant="outline" onClick={() => setCreating(true)}><FilePlus2 />Nouvelle page</Button>}
      </div>
      : filter.look === "cards"
        ? <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(17.5rem,100%),1fr))]">
          {rows.map((page) => <article key={page.id} className="grid content-start gap-2.5 rounded-2xl border bg-card/85 p-4 shadow-[0_10px_30px_rgb(67_50_31/0.05)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><PageIcon icon={page.icon} emoji={page.emoji} className="size-4" /></span>
              <span className="min-w-0"><b className="block truncate font-display text-base">{page.title}</b><small className="block truncate font-mono text-[11px] text-muted-foreground">{page.href}</small></span>
            </div>
            {page.description && <p className="line-clamp-2 text-[13px] text-muted-foreground">{page.description}</p>}
            <div className="flex flex-wrap items-center gap-1.5"><StatusPill page={page} /><VisPill vis={page.vis} /><span className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{where(page)}</span></div>
            <p className="text-[11.5px] text-muted-foreground">Modifiée le {formatWhen(page.updatedAt)}{page.updatedBy ? ` par ${page.updatedBy}` : ""} · {page.blocks} bloc{page.blocks > 1 ? "s" : ""}</p>
            <div className="flex flex-wrap items-center gap-1">{actions(page)}</div>
          </article>)}
        </div>
        : <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>{["Page", "Emplacement", "Visibilité", "Statut", "Modifiée", "Blocs", ""].map((label) => <th key={label} scope="col" className="whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
            <tbody>{rows.map((page) => <tr key={page.id} className="border-b border-border/60 last:border-b-0 hover:bg-background/50">
              <td className="px-3 py-2">
                <Link href={page.editable && !page.trashedAt ? studioHref(page.id) : page.href} prefetch={false} className="group flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-primary/20 bg-primary/8 text-primary"><PageIcon icon={page.icon} emoji={page.emoji} className="size-4" /></span>
                  <span className="min-w-0"><b className="block whitespace-nowrap font-display text-[15px] group-hover:text-primary group-hover:underline group-hover:underline-offset-3">{page.title}</b><small className="block font-mono text-[11px] text-muted-foreground">{page.href}</small></span>
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{where(page)}</td>
              <td className="px-3 py-2"><VisPill vis={page.vis} /></td>
              <td className="px-3 py-2"><StatusPill page={page} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatWhen(page.updatedAt)}{page.updatedBy ? <small className="block text-[11px]">{page.updatedBy}</small> : null}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{page.blocks}</td>
              <td className="px-3 py-2"><div className="flex items-center justify-end gap-1">{actions(page)}</div></td>
            </tr>)}</tbody>
          </table>
        </div>}

    <section aria-labelledby="modeles" className="mt-12">
      <h2 id="modeles" className="flex items-center gap-2 font-display text-2xl font-semibold"><LayoutTemplate className="size-5 text-primary" />Mes modèles</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ceux que tu as enregistrés depuis l’atelier (« Enregistrer comme modèle »). Eraser n’en impose aucun.</p>
      {templates.length
        ? <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(16rem,100%),1fr))]">
          {templates.map((template) => <article key={template.id} className="flex items-start gap-3 rounded-2xl border bg-card/85 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary"><PageIcon icon={template.icon} emoji={template.emoji} className="size-4" /></span>
            <span className="grid min-w-0 flex-1 gap-1">
              <b className="truncate font-display text-base">{template.name}</b>
              <small className="text-[11.5px] text-muted-foreground">{template.blocks} bloc{template.blocks > 1 ? "s" : ""}{template.createdBy ? ` · par ${template.createdBy}` : ""}</small>
              <span className="mt-1 flex flex-wrap gap-1">
                <Button type="button" size="xs" variant="outline" onClick={() => { setDraft({ ...draft, template: template.id, title: "" }); setError(""); setCreating(true) }}><FilePlus2 />Nouvelle page</Button>
                <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "delete-template", id: template.id, name: template.name })}><Trash2 />Supprimer</Button>
              </span>
            </span>
          </article>)}
        </div>
        : <p className="mt-4 rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">Aucun modèle pour l’instant.</p>}
    </section>

    <Dialog open={creating} onOpenChange={(open) => { setCreating(open); if (!open) setError("") }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Nouvelle page</DialogTitle>
          <DialogDescription>Elle naît en brouillon : seuls ceux qui peuvent la modifier la voient tant qu’elle n’est pas publiée.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Titre"><input autoFocus className={`${fieldClass} h-9 text-sm`} value={draft.title} maxLength={120} placeholder={draft.template ? templates.find((item) => item.id === draft.template)?.title : "Guide du joueur, Les dieux du Sud…"} onChange={(event) => setDraft({ ...draft, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void create() }} /></Field>
          <Field label="Rangée dans" hint={draft.place === "hors-menu" ? "Aucun menu : on y arrive par un lien ou la recherche (Ctrl + K)." : draft.place === "campagne" ? "Le dossier de la campagne ; ouverte à ses joueurs et à son MJ." : "Sur la page de la section, à l’adresse de la section."}>
            <select className={`${fieldClass} h-9 text-sm`} value={draft.place} onChange={(event) => setDraft({ ...draft, place: event.target.value as PagePlace })}>
              {places.map((place) => <option key={place.value} value={place.value} disabled={place.value === "campagne" && !campaigns.length}>{place.label}</option>)}
            </select>
          </Field>
          {draft.place === "campagne" && <Field label="Campagne"><select className={`${fieldClass} h-9 text-sm`} value={draft.campaignId} onChange={(event) => setDraft({ ...draft, campaignId: event.target.value })}>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></Field>}
          <Field label="À partir de">
            <select className={`${fieldClass} h-9 text-sm`} value={draft.template} onChange={(event) => setDraft({ ...draft, template: event.target.value })}>
              <option value="">Une page vide</option>
              {templates.map((template) => <option key={template.id} value={template.id}>Modèle : {template.name}</option>)}
            </select>
          </Field>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button type="button" disabled={busy === "create" || (draft.place === "campagne" && !draft.campaignId)} onClick={() => void create()}>{busy === "create" ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />}Créer et ouvrir l’atelier</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{confirm?.kind === "delete-page" ? `Supprimer « ${confirm.name} » pour de bon ?` : `Supprimer le modèle « ${confirm?.name} » ?`}</DialogTitle>
          <DialogDescription>{confirm?.kind === "delete-page" ? "La page, ses carnets et ses révélations disparaissent du serveur partagé. Rien ne pourra la restaurer." : "Les pages déjà créées depuis ce modèle ne changent pas."}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button>
          <Button type="button" variant="destructive" onClick={() => {
            const target = confirm
            setConfirm(null)
            if (!target) return
            if (target.kind === "delete-template") void deleteTemplate(target.id)
            else { const page = pages.find((item) => item.id === target.id); if (page) void act(page, "delete") }
          }}><Trash2 />Supprimer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
