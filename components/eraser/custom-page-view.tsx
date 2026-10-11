"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { ChevronRight, EyeOff, FileText, ImageOff, Info, LoaderCircle, LockKeyhole, NotebookPen, PenLine, ShieldAlert, Sparkles, TriangleAlert, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { IndexRichText } from "@/components/eraser/index-references"
import { PageStatBlock, PageViewBlock, type BlockSource } from "@/components/eraser/page-index-block"
import { RichTextField } from "@/components/eraser/rich-text"
import { placeLabel, sectionLayouts, type CalloutTone, type ImageRatio, type PageBlock, type PageView, type SectionLayout, type ViewedBlock, type ViewedSection } from "@/lib/custom-pages"

/**
 * Les pages du créateur de pages, telles qu'on les lit : les sections et leurs colonnes,
 * chaque bloc dans sa forme de lecture. Le serveur n'envoie que ce que le lecteur voit
 * (lib/custom-pages.ts › pageForViewer). L'atelier (page-studio.tsx) réutilise les mêmes
 * rendus pour son aperçu.
 */

/** Une page vers laquelle un bloc Lien mène, résolue par le serveur (seulement si le lecteur peut l'ouvrir). */
export type PageLinkTarget = { title: string; href: string; icon: string; emoji: string; description: string }

export const layoutGrid: Record<SectionLayout, string> = {
  "1": "grid-cols-[minmax(0,1fr)]",
  "2": "grid-cols-[minmax(0,1fr)] @[38rem]:grid-cols-2",
  "3": "grid-cols-[minmax(0,1fr)] @[38rem]:grid-cols-2 @[56rem]:grid-cols-3",
  "side-r": "grid-cols-[minmax(0,1fr)] @[38rem]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
  "side-l": "grid-cols-[minmax(0,1fr)] @[38rem]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
}

export const calloutTones: Record<CalloutTone, { label: string; icon: typeof Info; box: string; title: string }> = {
  info: { label: "Info", icon: Info, box: "border-border bg-card", title: "text-foreground" },
  mj: { label: "MJ", icon: ShieldAlert, box: "border-[#3b5c8a]/40 bg-[#3b5c8a]/[0.06]", title: "text-[#3b5c8a]" },
  secret: { label: "Secret", icon: LockKeyhole, box: "border-[#927640]/50 bg-[#927640]/[0.08]", title: "text-[#7a5f22]" },
  alerte: { label: "Alerte", icon: TriangleAlert, box: "border-destructive/40 bg-destructive/[0.05]", title: "text-destructive" },
}

export const imageRatios: Record<ImageRatio, string | undefined> = { "auto": undefined, "21/9": "21 / 9", "16/9": "16 / 9", "4/3": "4 / 3", "1/1": "1 / 1", "3/4": "3 / 4" }

export const separatorGlyphs = { ornement: "◆ ◆ ◆", etoile: "✶", points: "· · ·", trait: "" } as const

const proseClass = "max-w-[72ch] text-[15px] leading-7 [&_p+p]:mt-3 [&_ul]:my-2 [&_ol]:my-2"

export function formatWhen(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
}

/** L'icône d'une page : celle choisie, sinon une page. */
export function PageIcon({ icon, emoji, className = "size-5" }: { icon?: string; emoji?: string; className?: string }) {
  // Un émoji garde ses couleurs ; une icône est tracée au trait, à la couleur du texte.
  if (emoji?.trim()) return <IndexIconGlyph emoji={emoji} className={className} />
  return icon ? <IndexIconGlyph icon={icon} filled={false} className={className} /> : <FileText className={className} />
}

/* ---------- Les blocs, en lecture ---------- */

export function TitleView({ block }: { block: Extract<PageBlock, { type: "title" }> }) {
  const Heading = block.level === "h3" ? "h3" : "h2"
  return <div className={`grid gap-1 ${block.align === "center" ? "justify-items-center text-center" : ""}`}>
    {block.eyebrow && <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">{block.eyebrow}</span>}
    <Heading className={`font-display font-semibold tracking-[-0.015em] text-balance ${block.level === "h3" ? "text-xl" : "text-[1.65rem] leading-tight sm:text-3xl"}`}>{block.text}</Heading>
  </div>
}

export function CalloutFrame({ tone, title, children }: { tone: CalloutTone; title: ReactNode; children: ReactNode }) {
  const look = calloutTones[tone]
  const Icon = look.icon
  return <aside className={`grid gap-1.5 rounded-2xl border px-4 py-3.5 ${look.box}`}>
    <div className={`flex items-center gap-2 font-display text-[15px] font-semibold ${look.title}`}><Icon className="size-4 shrink-0" />{title}</div>
    {children}
  </aside>
}

export function QuoteView({ block }: { block: Extract<PageBlock, { type: "quote" }> }) {
  return <figure className="grid gap-1.5 border-l-[3px] border-primary/70 py-1 pl-5">
    <blockquote className="font-display text-lg italic leading-relaxed text-foreground/90 sm:text-xl">{block.text}</blockquote>
    {block.cite && <figcaption className="text-xs text-muted-foreground">— {block.cite}</figcaption>}
  </figure>
}

export function ImageView({ block }: { block: Extract<PageBlock, { type: "image" }> }) {
  const [failed, setFailed] = useState("")
  const ratio = imageRatios[block.ratio]
  const broken = !block.src || failed === block.src
  return <figure className="grid gap-2">
    <div className="relative overflow-hidden rounded-2xl border bg-muted/50 shadow-[0_10px_30px_rgb(67_50_31/0.07)]" style={ratio ? { aspectRatio: ratio } : undefined}>
      {broken
        ? <div className={`flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground ${ratio ? "absolute inset-0" : "py-14"}`}><ImageOff className="size-6 opacity-60" />{block.src ? "L’image n’a pas pu être chargée." : "Aucune image choisie."}</div>
        // eslint-disable-next-line @next/next/no-img-element -- images du Drive ou d'Eraser
        : <img src={block.src} alt={block.caption} loading="lazy" onError={() => setFailed(block.src)} className={`${ratio ? "absolute inset-0 size-full" : "h-auto w-full"} ${block.fit === "contain" ? "object-contain" : "object-cover"}`} />}
    </div>
    {block.caption && <figcaption className="px-1 text-center text-xs italic text-muted-foreground">{block.caption}</figcaption>}
  </figure>
}

export function SeparatorView({ block }: { block: Extract<PageBlock, { type: "separator" }> }) {
  const glyph = separatorGlyphs[block.glyph]
  if (!glyph) return <hr className="my-2 border-border" />
  return <div role="separator" className="flex items-center gap-4 py-1.5 text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
    <span className="font-display text-sm tracking-[0.4em]">{glyph}</span>
  </div>
}

export function LinkCard({ title, description, icon, emoji, href, compact, disabled = false }: { title: string; description: string; icon?: string; emoji?: string; href?: string; compact?: boolean; disabled?: boolean }) {
  const body = <>
    <span className={`flex shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary ${compact ? "size-8" : "size-10"}`}><PageIcon icon={icon} emoji={emoji} className="size-4.5" /></span>
    <span className="min-w-0 flex-1">
      <span className={`block font-display font-semibold leading-tight ${compact ? "text-[15px]" : "text-lg"}`}>{title}</span>
      {description && !compact && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}
    </span>
    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
  </>
  const className = `group flex items-start gap-3 rounded-2xl border bg-card/85 shadow-[0_10px_30px_rgb(67_50_31/0.06)] transition ${compact ? "items-center px-3 py-2.5" : "p-4"} ${disabled ? "" : "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_40px_rgb(67_50_31/0.11)]"}`
  if (!href || disabled) return <div className={className}>{body}</div>
  return <Link href={href} prefetch={false} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{body}</Link>
}

/** Le carnet : son texte, et pour qui a le droit, « Modifier » sur place. */
function NotesView({ block, onSave }: { block: ViewedBlock & { type: "notes" }; onSave?: (html: string, base: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(block.html)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function save() {
    if (!onSave) return
    setPending(true)
    setError("")
    const problem = await onSave(draft, block.editedAt ?? "")
    setPending(false)
    if (problem) setError(problem)
    else setEditing(false)
  }
  return <section className="grid gap-2 rounded-2xl border border-l-[3px] border-l-[#3b5c8a]/55 bg-[linear-gradient(180deg,color-mix(in_srgb,#3b5c8a_5%,var(--card)),var(--card)_3rem)] px-4 pb-4 pt-3 shadow-[0_10px_30px_rgb(67_50_31/0.05)]">
    <div className="flex items-center gap-2">
      <NotebookPen className="size-4 shrink-0 text-[#3b5c8a]" />
      <h3 className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-[#3b5c8a]">{block.title || "Carnet"}</h3>
      {block.canEdit && onSave && !editing && <Button type="button" size="xs" variant="outline" onClick={() => { setDraft(block.html); setEditing(true) }}><PenLine />Écrire</Button>}
    </div>
    {editing
      ? <div className="grid gap-2">
        <RichTextField value={draft} onCommit={setDraft} toolbar="always" minHeight="min-h-32" ariaLabel={block.title || "Carnet"} />
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setError("") }}>Annuler</Button>
          <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>{pending && <LoaderCircle className="animate-spin" />}Enregistrer</Button>
        </div>
      </div>
      : block.html.replace(/<[^>]+>/g, "").trim()
        ? <IndexRichText html={block.html} className="text-[14.5px] leading-7" />
        : <p className="text-sm italic text-muted-foreground">Rien d’écrit pour l’instant.</p>}
    {block.editedAt && !editing && <p className="text-[11px] text-muted-foreground">Écrit par {block.editedBy || "quelqu’un"}, le {formatWhen(block.editedAt)}</p>}
  </section>
}

/** Un secret : caché aux joueurs jusqu'à ce qu'un MJ ou un admin le révèle. */
function SecretView({ block, canReveal, onToggle }: { block: ViewedBlock & { type: "secret" }; canReveal: boolean; onToggle?: (reveal: boolean) => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const revealed = Boolean(block.revealedAt)
  async function toggle() {
    if (!onToggle) return
    setPending(true)
    await onToggle(!revealed)
    setPending(false)
  }
  if (!canReveal) return <section className="grid gap-1.5 rounded-2xl border border-[#927640]/45 bg-[linear-gradient(135deg,color-mix(in_srgb,#927640_10%,var(--card)),var(--card))] px-4 py-3.5">
    <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-[#7a5f22]"><Sparkles className="size-4" />{block.title || "Secret révélé"}</p>
    <IndexRichText html={block.html} className="text-[14.5px] leading-7" />
    <p className="text-[11px] text-muted-foreground">Révélé{block.revealedBy ? ` par ${block.revealedBy}` : ""} le {formatWhen(block.revealedAt)}</p>
  </section>
  return <section className={`grid gap-2 rounded-2xl border px-4 py-3.5 ${revealed ? "border-[#927640]/45 bg-[#927640]/[0.07]" : "border-dashed border-[#927640]/60 bg-[repeating-linear-gradient(135deg,rgb(146_118_64/0.06)_0_8px,transparent_8px_16px)]"}`}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-2 font-display text-[15px] font-semibold text-[#7a5f22]">{revealed ? <Sparkles className="size-4 shrink-0" /> : <LockKeyhole className="size-4 shrink-0" />}<span className="truncate">{block.title || "Secret"}</span></span>
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${revealed ? "border-[#0f7a65]/40 bg-[#0f7a65]/10 text-[#0f7a65]" : "border-[#927640]/45 bg-card text-[#7a5f22]"}`}>{revealed ? "Révélé aux joueurs" : "Caché aux joueurs"}</span>
    </div>
    <IndexRichText html={block.html} className="text-[14.5px] leading-7" />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] text-muted-foreground">{revealed ? `Révélé${block.revealedBy ? ` par ${block.revealedBy}` : ""} le ${formatWhen(block.revealedAt)}` : "Les joueurs ne reçoivent rien de ce bloc tant qu’il n’est pas révélé."}</p>
      {onToggle && <Button type="button" size="sm" variant={revealed ? "outline" : "default"} disabled={pending} onClick={() => void toggle()} className={revealed ? "" : "bg-[#7a5f22] hover:bg-[#7a5f22]/90"}>
        {pending ? <LoaderCircle className="animate-spin" /> : revealed ? <EyeOff /> : <WandSparkles />}{revealed ? "Recacher" : "Révéler aux joueurs"}
      </Button>}
    </div>
  </section>
}

export type BlockContext = {
  /** Les données des blocs Vue et Stat : la page enregistrée, ou l'index directement (atelier). */
  source: BlockSource
  canReveal: boolean
  links: Record<string, PageLinkTarget>
  /** Les liens vers les index (MJ et admins) : l'adresse de chaque index. */
  indexPaths?: Record<string, string>
  onReveal?: (blockId: string, reveal: boolean) => Promise<void>
  onNotes?: (blockId: string, html: string, base: string) => Promise<string | null>
}

/** Un bloc dans sa forme de lecture. */
export function BlockView({ block, context }: { block: ViewedBlock; context: BlockContext }) {
  switch (block.type) {
    case "title": return <TitleView block={block} />
    case "text": return block.html.replace(/<[^>]+>/g, "").trim() ? <IndexRichText html={block.html} className={proseClass} /> : null
    case "callout": return <CalloutFrame tone={block.tone} title={block.title || calloutTones[block.tone].label}>{block.html && <IndexRichText html={block.html} className="text-[14px] leading-6 text-foreground/85" />}</CalloutFrame>
    case "quote": return block.text ? <QuoteView block={block} /> : null
    case "image": return <ImageView block={block} />
    case "separator": return <SeparatorView block={block} />
    case "link": {
      const target = block.pageId ? context.links[block.pageId] : null
      if (block.pageId && !target) return null
      if (!block.pageId && !block.href) return null
      return <LinkCard title={block.title || target?.title || block.href} description={block.description || target?.description || ""} icon={target?.icon} emoji={target?.emoji} href={target?.href ?? block.href} compact={block.style === "compact"} />
    }
    case "secret": return <SecretView block={block} canReveal={context.canReveal} onToggle={context.onReveal ? (reveal) => context.onReveal!(block.id, reveal) : undefined} />
    case "notes": return <NotesView key={`${block.editedAt ?? ""}`} block={block} onSave={context.onNotes ? (html, base) => context.onNotes!(block.id, html, base) : undefined} />
    case "view": return <PageViewBlock block={block} source={context.source} path={context.indexPaths?.[block.index]} />
    case "stat": return <PageStatBlock block={block} source={context.source} />
  }
}

/** Les sections d'une page et leurs colonnes ; une section vide disparaît. */
export function PageSections({ sections, render }: { sections: ViewedSection[]; render: (block: ViewedBlock) => ReactNode }) {
  return <div className="@container grid gap-8">
    {sections.map((section) => {
      // Une colonne vide pour ce lecteur (blocs qu'il ne voit pas) laisse la place aux autres.
      const columns = section.cols.filter((column) => column.length)
      if (!columns.length) return null
      const layout: SectionLayout = columns.length === section.cols.length ? section.layout : columns.length === 1 ? "1" : "2"
      return <section key={section.id} className={`grid items-start gap-6 ${layoutGrid[layout]} ${section.framed ? "rounded-[1.5rem] border bg-card/80 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.06)] sm:p-6" : ""}`}>
        {columns.map((column, index) => <div key={index} className="grid min-w-0 content-start gap-5">
          {column.map((block) => <div key={block.id} id={`bloc-${block.id}`} className="min-w-0">{render(block)}</div>)}
        </div>)}
      </section>
    })}
  </div>
}

export const layoutColumns = (layout: SectionLayout) => sectionLayouts.find((item) => item.value === layout)?.columns.length ?? 1

/** L'en-tête d'une page : sa place, son icône, son titre et sa description. */
export function PageHeader({ eyebrow, title, description, icon, emoji, children }: { eyebrow: string; title: string; description: string; icon?: string; emoji?: string; children?: ReactNode }) {
  return <header className="max-w-3xl">
    <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
      <span className="h-px w-7 bg-primary/50" />
      {eyebrow}
    </div>
    <div className="flex items-start gap-4">
      <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]"><PageIcon icon={icon} emoji={emoji} /></div>
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] text-balance sm:text-5xl">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>}
        {children}
      </div>
    </div>
  </header>
}

/**
 * Une page publiée (ou un brouillon, pour qui peut le modifier), lue par son lecteur.
 * Révéler un secret et écrire dans un carnet passent par /api/pages : la page revient
 * telle que le serveur la voit après le changement.
 */
export function CustomPageView({ initial, links, campaignName, indexPaths }: { initial: PageView; links: Record<string, PageLinkTarget>; campaignName?: string; indexPaths?: Record<string, string> }) {
  const [view, setView] = useState(initial)
  const [error, setError] = useState("")
  const eyebrow = view.place === "campagne" ? `Campagne${campaignName ? ` · ${campaignName}` : ""}` : view.place === "hors-menu" ? "Page" : placeLabel(view.place)

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: view.id, ...body }) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { page?: PageView; error?: string }
    if (!response?.ok || !payload.page) return payload.error || "Eraser ne répond pas : réessaie dans un instant."
    setView(payload.page)
    return null
  }

  const context: BlockContext = {
    source: { pageId: view.id, draft: view.draft },
    canReveal: view.canReveal,
    links,
    indexPaths,
    onReveal: view.canReveal ? async (blockId, reveal) => { const problem = await post({ action: reveal ? "reveal" : "hide", blockId }); setError(problem ?? "") } : undefined,
    onNotes: (blockId, html, base) => post({ action: "edit-notes", blockId, html, base }),
  }

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
    <PageHeader eyebrow={eyebrow} title={view.title} description={view.description} icon={view.icon} emoji={view.emoji}>
      {view.editable && <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${view.draft ? "border-[#9a6512]/40 bg-[#9a6512]/10 text-[#9a6512]" : "border-[#0f7a65]/40 bg-[#0f7a65]/10 text-[#0f7a65]"}`}>{view.draft ? "Brouillon" : "Publiée"}</span>
        {view.unpublished && !view.draft && <span className="text-xs text-muted-foreground">Des modifications attendent d’être publiées.</span>}
        <Button asChild size="sm" variant="outline" className="ml-1"><Link href={`/pages/atelier?id=${encodeURIComponent(view.id)}`} prefetch={false}><PenLine />Modifier dans l’atelier</Link></Button>
      </div>}
    </PageHeader>
    {view.draft && view.editable && <p className="mt-6 flex max-w-3xl items-start gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground"><EyeOff className="mt-0.5 size-4 shrink-0" />Ce brouillon n’est visible que de ceux qui peuvent modifier la page. Publie-le depuis l’atelier pour l’ouvrir aux autres.</p>}
    {error && <p role="alert" className="mt-6 max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    <div className="mt-10">
      {view.sections.some((section) => section.cols.some((column) => column.length))
        ? <PageSections sections={view.sections} render={(block) => <BlockView block={block} context={context} />} />
        : <p className="rounded-2xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Cette page est encore vide.</p>}
    </div>
  </div>
}
