"use client"

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { ArrowUpRight, BookOpen, CalendarDays, Check, Hourglass, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Feather, Lock, NotebookPen, NotebookText, Plus, Store, type LucideIcon } from "lucide-react"

import { replaceAppUrl } from "@/components/eraser/app-tabs"
import { RevealToggle, SessionRevealProvider } from "@/components/eraser/session-reveal"
import { patchSession } from "@/components/eraser/session-picker"
import { onCampaignChange, upsertSessionNote } from "@/lib/campaign-live"
import { RichTextView } from "@/components/eraser/rich-text"
import { RestButton, sendSatiety } from "@/components/eraser/satiety"
import {
  EmptyHint,
  LinkChip,
  SessionNotesBoard,
  SessionQuestChains,
  linkKindLabels,
  noteTypeIcons,
  tone,
  useLinkLabel,
  type JournalEntity,
  type SessionNoteEntities,
  type SessionNotesHandle,
} from "@/components/eraser/session-notes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { sessionNoteLabel, sessionNoteType, type SessionLinkKind, type SessionNote, type SessionNoteType } from "@/lib/session-note-rules"
import type { SessionRevealKind } from "@/lib/session-reveal"
import { ObjectIcon } from "@/components/eraser/object-icon"
import { cn } from "@/lib/utils"

// La vitrine d'un magasin n'est chargée qu'à son ouverture : le journal reste léger.
const JournalShopWindow = dynamic(() => import("@/components/eraser/journal-shop-window").then((module) => module.JournalShopWindow))

export type JournalSession = { id: string; name: string; createdAt: string }
export type JournalSessionDetail = JournalSession & {
  bannerUrl: string; characterIds: string[]; npcIds: string[]; shopIds: string[]; eventIds: string[]; places: string
  /** Les lieux de l'Index des lieux liés dans le Créateur de session (pour un joueur : ceux révélés). */
  placeLinks?: Array<{ id: string; name: string; tab: string }>
  /** La date en jeu (calendrier du monde), choisie par le MJ dans le Créateur de session. */
  calendar?: string; startDate?: string; endDate?: string
  /** Les marchés ambulants de la session (rangés parmi ses événements), aussi dans `shopIds`. */
  marketIds?: string[]
  /** Pour le MJ : ce que le Créateur de session cache encore aux joueurs (« npc:ID », « event:shop:ID »…). */
  hidden?: string[]
  /** Pour un joueur : les personnages de la session qu'on ne lui montre pas (ni dans le groupe, ni parmi les absents). */
  veiledCharacterIds?: string[]
}
/** Ce que l'index montre d'un lieu, d'une créature ou d'un objet cité par une note (« place:Nom »). */
export type JournalVisual = { image?: string; type?: string; color?: string; object?: { icon: string; type: string; subtype: string } }
/** Un personnage du groupe, avec ce qu'en montre sa carte sur la page de campagne. */
export type JournalMember = JournalEntity & { playerName?: string; honoraryTitle?: string; classAndLevel?: string; people?: string; /** Le lecteur peut ouvrir sa fiche (MJ, ou son joueur). */ canOpen?: boolean }
/** L'auteur d'une note : le MJ de la campagne, ou ses personnages (le plus récent d'abord à égalité). */
export type JournalAuthor = { mj: boolean; characters: Array<{ id: string; name: string; updatedAt: string }> }
/** Un PNJ et ses notes visibles par les joueurs (texte enrichi). */
export type JournalNpc = JournalEntity & { playerNotes?: string }
/** Un magasin et quelques objets de sa vitrine (icônes de l'Index des items). */
export type JournalShop = JournalEntity & { items?: Array<{ name: string; icon: string; type: string; subtype: string }> }
export type JournalEvent = JournalEntity & { kind: string; tag: string; tagColor: string; description: string }

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

function sessionDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date)
}

const initials = (name: string) => name.replace(/^(Frère|Sœur|Dame|Sire|Maître|Le|La|Les|L’|L')\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"

/** Une couleur d'avatar stable pour un nom, prise dans une palette accordée au parchemin. */
const avatarPalette = ["#8d6618", "#3b5c8a", "#2f7558", "#a3402f", "#6a4a8a", "#8a5a2b", "#1d7589", "#7f3a5a"]
function avatarColor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return avatarPalette[hash % avatarPalette.length]
}

const LootIcon = noteTypeIcons.butin

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Ce que partagent les cartes de la page : les notes liées à un élément, et comment en ouvrir une. */
type JournalContext = {
  notesFor: (links: string[]) => SessionNote[]
  sessionNumber: (sessionId: string) => number
  currentId: string
  openNote: (noteId: string) => void
  /** La signature d'une note : le personnage de son joueur, ou « MJ - pseudo ». */
  authorLabel: (note: SessionNote) => string
  /** Les couleurs de la campagne, pour les fenêtres posées hors de la page (portails). */
  vars: CSSProperties
}
const JournalCtx = createContext<JournalContext | null>(null)
const useJournal = () => useContext(JournalCtx)!

/* ---------- Petits éléments ---------- */

/** Un portrait, ou à défaut une pastille (initiales ou icône) ; un portrait cassé redevient pastille. */
function Avatar({ name, image, icon: Icon, color, square = false, muted = false, media }: { name: string; image?: string; icon?: LucideIcon; color: string; square?: boolean; muted?: boolean; /** Une icône d'objet de l'index, posée sur fond clair. */ media?: ReactNode }) {
  const [broken, setBroken] = useState("")
  const shape = square ? "rounded-xl" : "rounded-full"
  const ring = "ring-2 ring-card shadow-[0_0_0_3px_var(--border)]"
  if (media && !(image && broken !== image)) return <span className={cn("flex size-12 shrink-0 items-center justify-center overflow-hidden bg-tone/10 p-1", shape, ring, muted && "opacity-50 grayscale")} style={tone(color)} aria-hidden>{media}</span>
  if (image && broken !== image) {
    // Le cadre rogne l'image : le cadrage du token (PortraitFramingEffect) l'agrandit et la décale.
    return <span className={cn("block size-12 shrink-0 overflow-hidden bg-muted", shape, ring, muted && "opacity-50 grayscale")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- portraits servis par l'app ou Google Drive */}
      <img src={image} alt="" loading="lazy" onError={() => setBroken(image)} ref={(node) => { if (node?.complete && !node.naturalWidth) setBroken(image) }} className="size-full object-cover" />
    </span>
  }
  return <span className={cn("flex size-10 shrink-0 items-center justify-center bg-tone font-display text-[15px] font-semibold text-white", shape, ring, muted && "opacity-45 grayscale")} style={tone(color)} aria-hidden>
    {Icon ? <Icon className="size-[18px]" /> : initials(name)}
  </span>
}

function Tag({ children, fresh = false, dot }: { children: ReactNode; fresh?: boolean; dot?: string }) {
  return <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 text-[11px] leading-5 whitespace-nowrap", fresh ? "bg-journal/12 font-semibold text-journal-ink" : "bg-muted text-muted-foreground")}>
    {dot && <span className="size-2 shrink-0 rounded-full bg-tone" style={tone(dot)} aria-hidden />}
    <span className="truncate">{children}</span>
  </span>
}

/** Un bouton discret posé à droite du titre d'une section (« + Quête », « + Événement »). */
function HeadAction({ color, onClick, children }: { color: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} style={tone(color)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium outline-none transition-colors hover:border-tone/60 hover:bg-tone/5 focus-visible:ring-2 focus-visible:ring-ring/50">
    <Plus className="size-3 text-tone" strokeWidth={2.5} aria-hidden />{children}
  </button>
}

function Section({ id, icon: Icon, title, count, action, children }: { id: string; icon: LucideIcon; title: string; count?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-titre`} tabIndex={-1} className="scroll-mt-24 outline-none">
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-journal/10 text-journal-ink ring-1 ring-journal/15" aria-hidden><Icon className="size-4" /></span>
      <h2 id={`${id}-titre`} className="font-display text-[1.35rem] font-semibold leading-tight">{title}</h2>
      {count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
    <div className="journal-rule mb-4 mt-2.5 h-px" aria-hidden />
    {children}
  </section>
}

const cardGrid = "grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,14.5rem),1fr))]"
/** Les cartes du groupe, un peu plus larges : portrait, joueur, titre, classe et niveau. */
const groupGrid = "grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))]"

/* ---------- Cartes et notes liées ---------- */

/**
 * Le survol (souris) d'une carte montre ses notes liées ; au clavier ou au doigt, la pastille
 * « n notes » ouvre la même liste. Ouverte au survol, la fenêtre ne prend pas le focus.
 */
function useHoverPopover(enabled: boolean) {
  const [open, setOpen] = useState(false)
  const timer = useRef(0)
  const hovered = useRef(false)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const later = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }
  const isMouse = (event: ReactPointerEvent) => event.pointerType === "mouse"
  return {
    open,
    setOpen: (next: boolean) => { window.clearTimeout(timer.current); if (!next) hovered.current = false; setOpen(next) },
    card: {
      onPointerEnter: (event: ReactPointerEvent) => { if (enabled && isMouse(event)) { hovered.current = true; later(true, open ? 0 : 280) } },
      onPointerLeave: (event: ReactPointerEvent) => { if (enabled && isMouse(event) && hovered.current) later(false, 180) },
    },
    content: {
      onPointerEnter: () => window.clearTimeout(timer.current),
      onPointerLeave: (event: ReactPointerEvent) => { if (isMouse(event) && hovered.current) later(false, 180) },
      onOpenAutoFocus: (event: Event) => { if (hovered.current) event.preventDefault() },
    },
    /** Un clic sur la pastille : ouvre (ou garde ouverte) la liste et y passe le focus. */
    onTrigger: (event: ReactMouseEvent) => {
      event.preventDefault()
      window.clearTimeout(timer.current)
      const wasHover = hovered.current && open
      hovered.current = false
      if (wasHover) { setOpen(false); window.setTimeout(() => setOpen(true), 0) } else setOpen(!open)
    },
  }
}

/** La pastille « n notes » d'une carte : survolée, cliquée ou au clavier, elle déroule ses notes liées. */
function NotesBadge({ name, kind, related, hover }: { name: string; kind: SessionLinkKind; related: SessionNote[]; hover: ReturnType<typeof useHoverPopover> }) {
  const journal = useJournal()
  const meta = linkKindLabels[kind]
  const here = related.filter((note) => note.sessionId === journal.currentId).length
  if (!related.length) return null
  return <Popover open={hover.open} onOpenChange={hover.setOpen}>
    <PopoverTrigger asChild>
      <button type="button" onClick={hover.onTrigger} aria-label={`${related.length} note${related.length > 1 ? "s" : ""} liée${related.length > 1 ? "s" : ""} à ${name}`} title={here === related.length ? undefined : here ? `${here} dans cette session, ${related.length} en tout` : "Notes d’autres sessions"}
        className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold leading-5 tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          // Aucune note de cette session : la pastille reste discrète.
          here ? "bg-journal/10 text-journal-ink hover:bg-journal/20 data-[state=open]:bg-journal/20" : "bg-muted text-muted-foreground hover:bg-accent data-[state=open]:bg-accent")}>
        <NotebookPen className="size-3" aria-hidden />{related.length}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} onOpenAutoFocus={hover.content.onOpenAutoFocus} onPointerEnter={hover.content.onPointerEnter} onPointerLeave={hover.content.onPointerLeave}
      style={{ ...journal.vars, ...tone(meta.color) }} className="w-[min(21rem,calc(100vw-1rem))] rounded-xl border-border/80 p-1.5 shadow-[0_18px_44px_rgb(33_30_26/0.18)]">
      <LinkedNotesList name={name} kindLabel={meta.one} icon={meta.icon} notes={related} onPick={(noteId) => { hover.setOpen(false); journal.openNote(noteId) }} />
    </PopoverContent>
  </Popover>
}

/** L'œil du Créateur de session, à la taille des icônes des cartes. */
const eyeClass = "-mr-1 size-6 shrink-0 rounded-md [&_svg]:size-[15px]"

/**
 * L'action d'une carte, en haut à droite à côté de la pastille des notes : une icône seule,
 * sans cadre, qui ne prend pas de place (fiche, notes d'un PNJ, vitrine d'un magasin).
 */
function CornerButton({ icon: Icon, href, onClick, label }: { icon: LucideIcon; href?: string; onClick?: () => void; label: string }) {
  const className = "-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/80 outline-none transition-colors hover:bg-tone/10 hover:text-tone focus-visible:ring-2 focus-visible:ring-ring/50"
  const body = <Icon className="size-[15px]" strokeWidth={2.1} aria-hidden />
  return href
    ? <Link href={href} prefetch={false} aria-label={label} title={label} className={className}>{body}</Link>
    : <button type="button" onClick={onClick} aria-label={label} title={label} className={className}>{body}</button>
}

function EntityCard({ name, hint, image, media, kind, link, color, icon, square, tags, absent = false, action, reveal, children }: {
  /** L'œil du MJ (chose de la session) : révéler ou cacher aux joueurs, comme dans le Créateur de session. */
  reveal?: { kind: SessionRevealKind; id: string }
  name: string
  hint?: string
  image?: string
  media?: ReactNode
  kind: SessionLinkKind
  /** Les liens que portent les notes (« npc:ID », « place:Nom ») : la pastille et la liste en dépendent. */
  link?: string | string[]
  color?: string
  icon?: LucideIcon
  square?: boolean
  tags?: ReactNode
  absent?: boolean
  /** L'action de la carte, en haut à droite (CornerButton). */
  action?: ReactNode
  children?: ReactNode
}) {
  const journal = useJournal()
  const meta = linkKindLabels[kind]
  const related = link ? journal.notesFor(typeof link === "string" ? [link] : link) : []
  const hover = useHoverPopover(related.length > 0)
  return <div {...hover.card} style={tone(meta.color)} className={cn(
    "group/card relative flex min-w-0 items-start gap-3 rounded-xl border p-3 transition-[border-color,box-shadow,transform] duration-200",
    absent ? "border-dashed border-border bg-transparent" : "border-border/70 bg-card shadow-[0_1px_2px_rgb(67_50_31/0.05)] hover:-translate-y-px hover:border-tone/45 hover:shadow-[0_6px_18px_rgb(67_50_31/0.09)]",
  )}>
    <Avatar name={name} image={image} media={media} icon={icon} color={color ?? meta.color} square={square} muted={absent} />
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-2">
        <p className={cn("min-w-0 flex-1 font-display text-[15.5px] font-semibold leading-snug [overflow-wrap:anywhere]", absent && "text-muted-foreground")}>{name}</p>
        <NotesBadge name={name} kind={kind} related={related} hover={hover} />
        {action}
        {reveal && <RevealToggle kind={reveal.kind} id={reveal.id} name={name} className={eyeClass} />}
      </div>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      {tags && <div className="mt-1.5 flex flex-wrap gap-1">{tags}</div>}
      {children}
    </div>
  </div>
}

/**
 * Un personnage du groupe : la carte de la page de campagne en plus petit (portrait, joueur,
 * titre honorifique, classe et niveau, peuple). Sa fiche s'ouvre pour le MJ, et pour le
 * joueur sur ses propres personnages.
 */
function CharacterCard({ member, absent = false, tags, reveal = false }: { member: JournalMember; absent?: boolean; tags?: ReactNode; /** L'œil du MJ : le personnage est de la session. */ reveal?: boolean }) {
  const journal = useJournal()
  const meta = linkKindLabels.character
  const related = journal.notesFor([`character:${member.id}`])
  const hover = useHoverPopover(related.length > 0)
  const [broken, setBroken] = useState("")
  const image = member.image && broken !== member.image ? member.image : ""
  return <article {...hover.card} style={tone(meta.color)} className={cn(
    "group/card relative grid min-w-0 grid-cols-[4.75rem_minmax(0,1fr)] overflow-hidden rounded-xl border transition-[border-color,box-shadow,transform] duration-200",
    absent ? "border-dashed border-border bg-transparent" : "border-border/70 bg-card shadow-[0_1px_2px_rgb(67_50_31/0.05)] hover:-translate-y-px hover:border-tone/45 hover:shadow-[0_6px_18px_rgb(67_50_31/0.09)]",
  )}>
    <div className={cn("relative min-h-[6.5rem] overflow-hidden bg-muted", absent && "opacity-50 grayscale")}>
      <div className="absolute inset-0 grid place-items-center text-journal-ink/25" aria-hidden><CircleUserRound className="size-8" /></div>
      {/* eslint-disable-next-line @next/next/no-img-element -- portrait servi par l'app */}
      {image && <img src={image} alt={`Portrait de ${member.name}`} loading="lazy" decoding="async" onError={() => setBroken(image)} ref={(node) => { if (node?.complete && !node.naturalWidth) setBroken(image) }}
        className="absolute inset-0 size-full object-cover transition-[scale] duration-300 group-hover/card:scale-[1.03]" />}
    </div>
    <div className="min-w-0 px-3 py-2.5">
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-display text-[15.5px] font-semibold leading-tight [overflow-wrap:anywhere]", absent && "text-muted-foreground")}>{member.name}</h3>
          {member.playerName && <p className="truncate text-[11.5px] text-muted-foreground">{member.playerName}</p>}
        </div>
        <NotesBadge name={member.name} kind="character" related={related} hover={hover} />
        {member.canOpen && <CornerButton icon={ArrowUpRight} href={`/personnage/${encodeURIComponent(member.id)}`} label={`Ouvrir la fiche de ${member.name}`} />}
        {reveal && <RevealToggle kind="character" id={member.id} name={member.name} className={eyeClass} />}
      </div>
      {member.honoraryTitle && <p className="mt-0.5 text-xs font-medium leading-snug text-journal-ink">{member.honoraryTitle}</p>}
      {member.classAndLevel && <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-foreground/80">{member.classAndLevel}</p>}
      {(member.people || member.hint) && <p className="text-xs leading-snug text-muted-foreground">{member.people || member.hint}</p>}
      {tags && <div className="mt-1.5 flex flex-wrap gap-1">{tags}</div>}
    </div>
  </article>
}

function LinkedNotesList({ name, kindLabel, icon: Icon, notes, onPick }: { name: string; kindLabel: string; icon: LucideIcon; notes: SessionNote[]; onPick: (noteId: string) => void }) {
  const journal = useJournal()
  return <div aria-label={`Notes liées à ${name}`}>
    <div className="flex min-w-0 items-center gap-2 border-b border-border/70 px-2 pb-1.5 pt-1">
      <Icon className="size-4 shrink-0 text-tone" aria-hidden />
      <b className="min-w-0 truncate font-display text-[15px] font-semibold">{name}</b>
      <span className="ml-auto shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{kindLabel}</span>
    </div>
    <ul className="max-h-72 space-y-px overflow-y-auto overscroll-contain py-1 scrollbar-thin">{notes.map((note) => {
      const type = sessionNoteType(note.type)
      const TypeIcon = noteTypeIcons[note.type]
      const elsewhere = note.sessionId !== journal.currentId
      return <li key={note.id}>
        <button type="button" onClick={() => onPick(note.id)} style={tone(type.color)} className="grid w-full grid-cols-[1rem_minmax(0,1fr)] gap-x-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40">
          <TypeIcon className="row-span-2 mt-0.5 size-3.5 text-tone" aria-hidden />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-tone">{type.label}{elsewhere && <span className="text-muted-foreground"> · S{journal.sessionNumber(note.sessionId)}</span>}{note.type === "quete" && <span className="text-muted-foreground"> · {note.quest?.done ? "accomplie" : "en cours"}</span>}</span>
          <span className={cn("line-clamp-2 text-[12.5px] leading-snug", note.type === "citation" && "font-display italic")}>{note.type === "citation" ? `« ${note.text} »` : note.title && note.text ? `${note.title} — ${note.text}` : note.title || note.text}</span>
        </button>
      </li>
    })}</ul>
    <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">Une note s’ouvre dans le panneau des notes.</p>
  </div>
}

/* ---------- Un PNJ au fil des sessions ---------- */

/** Le PNJ dont la fenêtre « Notes » est ouverte. */
type NpcHistory = { name: string; hint?: string; image?: string; color: string; /** Absentes pour un PNJ venu d'un événement : il n'a pas de notes pour les joueurs. */ playerNotes?: string; link: string }
/** Une session où le PNJ apparaît, ou qu'une note lui lie. */
type NpcHistoryRow = { session: JournalSessionDetail; number: number; notes: SessionNote[]; appeared: boolean }

/**
 * Les notes d'un PNJ que voient les joueurs, puis toutes les sessions où il est passé, dans
 * leur ordre, avec les notes qui le citent (une apparition sans note reste dans la liste).
 */
function NpcHistoryDialog({ npc, rows, onClose, onGoSession }: { npc: NpcHistory | null; rows: NpcHistoryRow[]; onClose: () => void; onGoSession: (sessionId: string) => void }) {
  const journal = useJournal()
  // Une note choisie prend le focus dans le panneau des notes : la fenêtre ne le rend pas au bouton.
  const picked = useRef(false)
  const pick = (noteId: string) => { picked.current = true; onClose(); journal.openNote(noteId) }
  return <Dialog open={Boolean(npc)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent style={{ ...journal.vars, ...tone(linkKindLabels.npc.color) }} onCloseAutoFocus={(event) => { if (picked.current) { event.preventDefault(); picked.current = false } }}
      className="flex max-h-[min(46rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
      {npc && <>
        <DialogHeader className="flex-row items-center gap-3 border-b border-border/70 px-5 py-4 pr-12 text-left">
          <Avatar name={npc.name} image={npc.image} color={npc.color} square />
          <div className="min-w-0">
            <DialogTitle className="font-display text-xl leading-tight [overflow-wrap:anywhere]">{npc.name}</DialogTitle>
            <DialogDescription className="truncate">{npc.hint || "PNJ"}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 scrollbar-thin">
          {npc.playerNotes !== undefined && <section aria-labelledby="pnj-notes-joueurs">
            <h3 id="pnj-notes-joueurs" className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Notes visibles par les joueurs</h3>
            {npc.playerNotes ? <RichTextView html={npc.playerNotes} className="rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-sm leading-6" />
              : <p className="text-sm text-muted-foreground">Aucune note pour les joueurs.</p>}
          </section>}
          <section aria-labelledby="pnj-sessions">
            <h3 id="pnj-sessions" className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Au fil des sessions</h3>
            {rows.length ? <ol className="space-y-0">{rows.map((row, position) => {
              const current = row.session.id === journal.currentId
              const last = position === rows.length - 1
              return <li key={row.session.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
                <div className="flex flex-col items-center" aria-hidden>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border-[1.5px] font-display text-[13px] font-semibold tabular-nums", current ? "border-journal bg-journal/10 text-journal-ink" : "border-border bg-card text-muted-foreground")}>S{row.number}</span>
                  {!last && <span className="my-1 w-[1.5px] flex-1 rounded-full bg-border" />}
                </div>
                <div className={cn("min-w-0 pt-1.5", !last && "pb-4")}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button type="button" onClick={() => { onClose(); onGoSession(row.session.id) }} disabled={current} title={current ? undefined : "Aller à cette session"}
                      className="min-w-0 rounded-sm text-left font-display text-[15px] font-semibold leading-snug outline-none [overflow-wrap:anywhere] enabled:hover:underline enabled:hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default">
                      <span className="sr-only">Session {row.number} : </span>{row.session.name}
                    </button>
                    {current && <Tag fresh>Cette session</Tag>}
                  </div>
                  {row.notes.length ? <ul className="mt-1.5 space-y-1">{row.notes.map((note) => {
                    const type = sessionNoteType(note.type)
                    const TypeIcon = noteTypeIcons[note.type]
                    return <li key={note.id}>
                      <button type="button" onClick={() => pick(note.id)} style={tone(type.color)}
                        className="grid w-full grid-cols-[1rem_minmax(0,1fr)] gap-x-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-left outline-none transition-colors hover:border-tone/45 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40">
                        <TypeIcon className="row-span-2 mt-0.5 size-3.5 text-tone" aria-hidden />
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-tone">{type.label}{journal.authorLabel(note) && <span className="font-medium normal-case tracking-normal text-muted-foreground"> · {journal.authorLabel(note)}</span>}</span>
                        <span className={cn("line-clamp-3 text-[13px] leading-snug", note.type === "citation" && "font-display italic")}>{note.type === "citation" ? `« ${note.text} »` : note.title && note.text ? `${note.title} — ${note.text}` : note.title || note.text}</span>
                      </button>
                    </li>
                  })}</ul> : <p className="mt-0.5 text-[13px] italic text-muted-foreground">Apparu dans cette session, sans note.</p>}
                </div>
              </li>
            })}</ol> : <p className="text-sm text-muted-foreground">Aucune apparition ni note pour l’instant.</p>}
          </section>
        </div>
      </>}
    </DialogContent>
  </Dialog>
}

/* ---------- Bannière ---------- */

/** Le décor de la bannière : écailles, crêtes lointaines et rose des vents, très discrets. */
function BannerOrnament() {
  const id = useId().replace(/:/g, "")
  return <svg className="absolute inset-0 size-full" viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice" aria-hidden>
    <defs>
      <pattern id={`${id}-scales`} width="44" height="22" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="#fffaee" strokeOpacity=".07" strokeWidth="1">
          <circle cx="22" cy="22" r="20" /><circle cx="22" cy="22" r="13" />
          <circle cx="0" cy="11" r="20" /><circle cx="0" cy="11" r="13" />
          <circle cx="44" cy="11" r="20" /><circle cx="44" cy="11" r="13" />
        </g>
      </pattern>
      <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset=".85" stopColor="#fff" stopOpacity=".2" /></linearGradient>
      <mask id={`${id}-mask`}><rect width="1200" height="240" fill={`url(#${id}-fade)`} /></mask>
      <radialGradient id={`${id}-glow`} cx="50%" cy="38%" r="55%"><stop offset="0" stopColor="#f3d9a6" stopOpacity=".18" /><stop offset="1" stopColor="#f3d9a6" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="1200" height="240" fill={`url(#${id}-scales)`} mask={`url(#${id}-mask)`} />
    <rect width="1200" height="240" fill={`url(#${id}-glow)`} />
    <path d="M0 200 L70 168 L120 182 L190 140 L250 170 L300 150 L360 176 L430 132 L500 172 L560 158 L620 186 L700 146 L760 170 L830 128 L900 166 L960 150 L1020 178 L1090 138 L1150 164 L1200 150 V240 H0Z" fill="#0b0805" fillOpacity=".2" />
    <path d="M0 222 L90 196 L150 210 L240 182 L320 206 L400 190 L470 214 L560 186 L640 210 L720 192 L800 216 L880 188 L960 208 L1040 194 L1120 214 L1200 196 V240 H0Z" fill="#0b0805" fillOpacity=".26" />
    <g transform="translate(1085 62)" fill="none" stroke="#fffaee" strokeOpacity=".16">
      <circle r="34" /><circle r="27" strokeDasharray="2 4" />
      <path d="M0 -44 L6 -6 L0 0 L-6 -6Z M0 44 L6 6 L0 0 L-6 6Z M-44 0 L-6 6 L0 0 L-6 -6Z M44 0 L6 6 L0 0 L6 -6Z" fill="#fffaee" fillOpacity=".06" />
    </g>
    <g transform="translate(110 70) rotate(18)" fill="none" stroke="#fffaee" strokeOpacity=".1"><circle r="22" /><path d="M0 -30V30M-30 0H30" /></g>
  </svg>
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="flex items-center justify-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-banner-ink/85 sm:gap-3 sm:tracking-[0.22em]">
    <span className="h-px w-5 bg-current opacity-60 sm:w-8" aria-hidden /><BookOpen className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0 truncate">{children}</span><span className="h-px w-5 bg-current opacity-60 sm:w-8" aria-hidden />
  </p>
}

function BannerArrow({ side, session, number, onClick }: { side: "prev" | "next"; session?: JournalSessionDetail; number: number; onClick: () => void }) {
  const Icon = side === "prev" ? ChevronLeft : ChevronRight
  const word = side === "prev" ? "précédente" : "suivante"
  return <button type="button" onClick={onClick} disabled={!session} title={`Session ${word} (${side === "prev" ? "←" : "→"})`}
    aria-label={session ? `Session ${word} : S${number} - ${session.name}` : `Pas de session ${word}`}
    className={cn("group/arrow flex min-w-0 items-center gap-2.5 rounded-full p-0.5 text-banner-ink outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-default", side === "prev" ? "justify-self-end" : "flex-row-reverse justify-self-start")}>
    <span className={cn("hidden min-w-0 max-w-[11rem] text-[12px] leading-tight text-banner-ink/80 md:block", side === "prev" ? "text-right" : "text-left", !session && "opacity-60")}>
      <b className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-80">{session ? `S${number}` : "—"}</b>
      <span className="block truncate">{session ? session.name : side === "prev" ? "Début du journal" : "Pas encore jouée"}</span>
    </span>
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border border-banner-ink/45 bg-banner-ink/10 backdrop-blur-[2px] transition-[background-color,transform] duration-150 group-hover/arrow:bg-banner-ink/22 group-disabled/arrow:opacity-35",
      side === "prev" ? "group-hover/arrow:-translate-x-0.5 group-disabled/arrow:translate-x-0" : "group-hover/arrow:translate-x-0.5 group-disabled/arrow:translate-x-0")}>
      <Icon className="size-5" strokeWidth={2.2} aria-hidden />
    </span>
  </button>
}

/* ---------- Page ---------- */

/**
 * Le journal d'une campagne : une session à la fois, la dernière d'abord. Les flèches (et
 * ← → au clavier) passent à la session voisine ; un clic sur le nom déroule toutes les
 * sessions. À gauche, les notes publiques de la session ; au centre, son récit : bilan,
 * groupe, lieux, PNJs, créatures, objets, magasins, quêtes et frise des événements.
 */
export function CampaignJournal({ campaignId, campaignName, accentColor, sessions, initialSessionId, initialNotes, notesError = false, viewer, members, npcs, shops, events, visuals = {}, authors = {} }: {
  /** Qui a écrit les notes (par compte) : leur étiquette dans le panneau des notes. */
  authors?: Record<string, JournalAuthor>
  campaignId: string
  campaignName: string
  accentColor: string
  /** Dans l'ordre de création : S1 en premier. */
  sessions: JournalSessionDetail[]
  initialSessionId?: string
  initialNotes: SessionNote[]
  notesError?: boolean
  viewer: { uid: string; manager: boolean; characterIds: string[] }
  members: JournalMember[]
  npcs: JournalNpc[]
  shops: JournalShop[]
  events: JournalEvent[]
  /** Images et icônes des lieux, créatures et objets cités par les notes, lues dans leurs index. */
  visuals?: Record<string, JournalVisual>
}) {
  // L'image ou l'icône qu'un index donne à un lieu, une créature, un objet cité par les notes.
  const visualOf = (link: string): JournalVisual | undefined => visuals[link] ?? visuals[link.toLocaleLowerCase("fr")]
  const objectMedia = (link: string, name: string) => {
    const object = visualOf(link)?.object
    return object && (object.icon || object.type) ? <ObjectIcon icon={object.icon} name={name} type={object.type} subtype={object.subtype} className="size-full" emojiClassName="text-xl leading-none" /> : undefined
  }
  // Un butin lié à un objet de l'index (ou titré comme lui) prend l'icône de cet objet.
  const lootMedia = (note: SessionNote) => {
    const link = (note.links ?? []).find((entry) => entry.startsWith("item:")) ?? (note.title ? `item:${note.title}` : "")
    return link ? objectMedia(link, link.slice(5)) : undefined
  }
  const initial = sessions.findIndex((session) => session.id === initialSessionId)
  const [chosen, setIndex] = useState(initial >= 0 ? initial : sessions.length - 1)
  // Une session supprimée ailleurs (le journal se relit en direct) : la dernière qui reste.
  const index = Math.max(0, Math.min(chosen, sessions.length - 1))
  const [listOpen, setListOpen] = useState(false)
  const [notes, setNotes] = useState(initialNotes)
  const [brokenBanner, setBrokenBanner] = useState("")
  const [toast, setToast] = useState("")
  const [openLinks, setOpenLinks] = useState<Set<string>>(new Set())
  const [npcHistory, setNpcHistory] = useState<NpcHistory | null>(null)
  const [openShop, setOpenShop] = useState("")
  // Ce que le MJ vient de révéler ou cacher, par session (la page n'est pas relue pour si peu).
  // Relue (une session modifiée ailleurs), la page repart de ce que dit le serveur.
  const [hiddenState, setHiddenState] = useState<{ sessions: JournalSessionDetail[]; bySession: Record<string, string[]> }>({ sessions, bySession: {} })
  const hiddenBySession = hiddenState.sessions === sessions ? hiddenState.bySession : {}
  const setHiddenBySession = (update: (all: Record<string, string[]>) => Record<string, string[]>) =>
    setHiddenState((state) => ({ sessions, bySession: update(state.sessions === sessions ? state.bySession : {}) }))
  const [openSummaries, setOpenSummaries] = useState<Set<string>>(new Set())
  const [savingReveal, setSavingReveal] = useState<string | null>(null)
  const toastTimer = useRef(0)
  const board = useRef<SessionNotesHandle>(null)
  const menu = useRef<HTMLDivElement>(null)
  const current = sessions[index]
  // La couleur de la campagne, posée une fois : toutes les teintes de la page en dérivent.
  const vars = useMemo(() => ({ "--journal-accent": accentColor }) as CSSProperties, [accentColor])

  function go(next: number) {
    if (next < 0 || next >= sessions.length) return
    setIndex(next)
    setListOpen(false)
    // L'adresse garde la session affichée : un onglet ou un lien rouvre la même.
    const url = new URL(window.location.href)
    url.searchParams.set("session", sessions[next].id)
    replaceAppUrl(url.pathname + url.search)
  }

  function say(text: string) {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(""), 2600)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // En direct : les notes des autres arrivent telles quelles ; une session modifiée par le MJ
  // (ce qu'il révèle ou cache, un PNJ ajouté…) fait relire la page, avec les droits du lecteur.
  const router = useRouter()
  useEffect(() => {
    let refresh = 0
    const stop = onCampaignChange(campaignId, (message) => {
      if (message.kind === "note") setNotes((current) => upsertSessionNote(current, message.note))
      else if (message.kind === "note-deleted") setNotes((current) => current.filter((note) => note.id !== message.noteId))
      else {
        // Plusieurs yeux cliqués d'affilée : une seule relecture.
        window.clearTimeout(refresh)
        refresh = window.setTimeout(() => router.refresh(), 1_200)
      }
    })
    return () => { stop(); window.clearTimeout(refresh) }
  }, [campaignId, router])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "") || target?.closest("[role=dialog]")) return
      if (event.key === "ArrowLeft") go(index - 1)
      if (event.key === "ArrowRight") go(index + 1)
    }
    // Une note liée d'une autre session : la page passe à sa session.
    const onGo = (event: Event) => {
      const position = sessions.findIndex((session) => session.id === (event as CustomEvent<string>).detail)
      if (position < 0 || position === index) return
      go(position)
      say(`Passage à S${position + 1} - ${sessions[position].name}`)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("eraser-journal-go", onGo)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("eraser-journal-go", onGo) }
  })

  const entities: SessionNoteEntities = useMemo(() => ({ characters: members, npcs, shops, events: events.map((event) => ({ id: event.id, name: event.name, hint: event.tag })) }), [members, npcs, shops, events])
  const linkLabel = useLinkLabel(entities, notes)
  // L'étiquette d'une note : « MJ - pseudo », ou le personnage de son joueur présent à cette
  // session (s'il en a plusieurs, le dernier modifié) ; sinon le nom du compte.
  const authorLabel = (note: SessionNote) => {
    const author = authors[note.authorUid]
    if (!author) return note.authorName
    if (author.mj) return note.authorName ? `MJ - ${note.authorName}` : "MJ"
    const present = new Set(sessions.find((session) => session.id === note.sessionId)?.characterIds ?? [])
    const candidates = author.characters.filter((character) => present.has(character.id))
    const latest = [...(candidates.length ? candidates : author.characters)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    return latest?.name ?? note.authorName
  }
  const refs = useMemo(() => sessions.map((session) => ({ id: session.id, name: session.name, createdAt: session.createdAt })), [sessions])
  const rank = useMemo(() => new Map(sessions.map((session, position) => [session.id, position])), [sessions])
  // Où chaque élément apparaît pour la première fois : « Nouveau » ou « Depuis S3 ».
  const firstSeen = useMemo(() => {
    const first = new Map<string, number>()
    const mark = (key: string, position: number) => { if ((first.get(key) ?? Infinity) > position) first.set(key, position) }
    sessions.forEach((session, position) => {
      session.npcIds.forEach((id) => mark(`npc:${id}`, position))
      session.shopIds.forEach((id) => mark(`shop:${id}`, position))
      session.eventIds.forEach((id) => mark(`event:${id}`, position))
      session.placeLinks?.forEach((place) => mark(`place:${place.name}`, position))
    })
    for (const note of notes) {
      const position = rank.get(note.sessionId)
      if (position === undefined) continue
      for (const link of note.links) if (/^(place|creature|item):/.test(link)) mark(link, position)
    }
    return first
  }, [sessions, notes, rank])

  if (!current) return <div className="journal w-full flex-1 px-4 py-9 sm:px-8 md:py-12" style={vars}>
    <div className="mx-auto max-w-xl overflow-hidden rounded-[1.6rem] border border-border/70 bg-card text-center shadow-sm">
      <div className="journal-banner-bg relative px-6 py-8 text-banner-ink"><BannerOrnament /><div className="relative"><Eyebrow>Journal de {campaignName}</Eyebrow></div></div>
      <div className="px-6 py-10">
        <Feather className="mx-auto size-8 text-journal-ink/60" aria-hidden />
        <p className="mt-4 font-display text-2xl font-semibold">Aucune session pour l’instant</p>
        <p className="mt-2 text-sm text-muted-foreground">Le journal s’ouvrira à la première session créée dans le Créateur de session.</p>
      </div>
    </div>
  </div>

  const journal: JournalContext = {
    // Les notes qui citent un élément : celles de la session d'abord, puis les autres dans l'ordre.
    notesFor: (links: string[]) => notes.filter((note) => links.some((link) => note.links.includes(link)))
      .sort((left, right) => Number(right.sessionId === current.id) - Number(left.sessionId === current.id) || (rank.get(left.sessionId) ?? 0) - (rank.get(right.sessionId) ?? 0)),
    sessionNumber: (sessionId: string) => (rank.get(sessionId) ?? 0) + 1,
    currentId: current.id,
    openNote: (noteId: string) => board.current?.focusNote(noteId),
    authorLabel,
    vars,
  }
  const here = notes.filter((note) => note.sessionId === current.id)
  const byId = <T extends { id: string }>(list: T[], ids: string[]) => ids.flatMap((id) => list.find((item) => item.id === id) ?? [])
  const group = byId(members, current.characterIds)
  // Les membres de la campagne qui n'ont pas été ajoutés à cette session (si elle a un groupe).
  const veiled = new Set(current.veiledCharacterIds ?? [])
  const absents = current.characterIds.length ? members.filter((member) => !current.characterIds.includes(member.id) && !veiled.has(member.id)) : []
  const sessionNpcs = byId(npcs, current.npcIds)
  const sessionEvents = byId(events, current.eventIds)
  const npcEvents = sessionEvents.filter((event) => event.kind === "npc" || event.kind === "generic-npc")
  const creatureEvents = sessionEvents.filter((event) => event.kind === "creature")
  const otherEvents = sessionEvents.filter((event) => event.kind === "other")
  const sessionShops = byId(shops, current.shopIds)
  const namesIn = (kind: "place" | "creature" | "item") => [...new Set(here.flatMap((note) => note.links.filter((link) => link.startsWith(`${kind}:`)).map((link) => link.slice(kind.length + 1))))]
  // Les lieux liés à la session d'abord, puis ceux que les notes citent (une seule carte par nom).
  const placeKey = (name: string) => name.trim().toLocaleLowerCase("fr")
  const linkedPlaces = current.placeLinks ?? []
  const linkedNames = new Set(linkedPlaces.map((place) => placeKey(place.name)))
  const places = [...linkedPlaces.map((place) => place.name), ...namesIn("place").filter((name) => !linkedNames.has(placeKey(name)))]
  const loot = here.filter((note) => note.type === "butin")
  // Un objet déjà raconté par un butin, une créature déjà présente comme événement : une seule carte.
  const same = (name: string) => name.trim().toLocaleLowerCase("fr")
  const lootNames = new Set(loot.map((note) => same(note.title)))
  const creatureNames = new Set(creatureEvents.map((event) => same(event.name)))
  const creatures = namesIn("creature").filter((name) => !creatureNames.has(same(name)))
  const items = namesIn("item").filter((name) => !lootNames.has(same(name)))
  const timeline = here.filter((note) => note.type === "evenement")
  const summaries = here.filter((note) => note.type === "resume")
  const isNew = (key: string) => firstSeen.get(key) === index
  // La fenêtre « Notes » d'un PNJ : chaque session où il apparaît ou qu'une note lui lie, dans l'ordre.
  const npcHistoryRows: NpcHistoryRow[] = npcHistory ? sessions.flatMap((session, position) => {
    const linked = notes.filter((note) => note.sessionId === session.id && note.links.includes(npcHistory.link))
    const appeared = npcHistory.link.startsWith("npc:") ? session.npcIds.includes(npcHistory.link.slice(4)) : session.eventIds.includes(npcHistory.link.slice(6))
    return linked.length || appeared ? [{ session, number: position + 1, notes: linked, appeared }] : []
  }) : []
  // Le MJ voit ce que les joueurs ne voient pas encore (caché dans le Créateur de session).
  // L'œil du MJ sur chaque chose de la session, comme dans le Créateur de session. Un marché
  // ambulant (rangé parmi les événements) se cache sous « event:shop:ID ».
  const hiddenKeys = hiddenBySession[current.id] ?? current.hidden ?? []
  const markets = new Set(current.marketIds ?? [])
  const isHidden = (kind: SessionRevealKind, id: string) => kind === "shop" ? hiddenKeys.includes(`shop:${id}`) || hiddenKeys.includes(`event:shop:${id}`) : hiddenKeys.includes(`${kind}:${id}`)
  const reveal = viewer.manager ? {
    isHidden,
    toggle: (kind: SessionRevealKind, id: string) => {
      const key = kind === "shop" && markets.has(id) ? `event:shop:${id}` : `${kind}:${id}`
      const hide = !isHidden(kind, id)
      const sessionId = current.id
      const before = hiddenKeys
      setHiddenBySession((all) => ({ ...all, [sessionId]: hide ? [...before, key] : before.filter((entry) => entry !== key && !(kind === "shop" && (entry === `shop:${id}` || entry === `event:shop:${id}`))) }))
      setSavingReveal(`${kind}:${id}`)
      patchSession(campaignId, sessionId, { visibility: hide ? { hide: [key] } : { reveal: [key] } })
        .then((session) => setHiddenBySession((all) => ({ ...all, [sessionId]: session.hidden ?? [] })))
        .catch(() => { setHiddenBySession((all) => ({ ...all, [sessionId]: before })); say("La visibilité n’a pas pu être enregistrée.") })
        .finally(() => setSavingReveal(null))
    },
    saving: savingReveal,
  } : null
  const seenTag = (key: string) => {
    const first = firstSeen.get(key)
    return first === undefined || first > index ? null : first === index ? <Tag fresh>Nouveau</Tag> : <Tag>Depuis S{first + 1}</Tag>
  }
  const countNew = (keys: string[]) => keys.filter(isNew).length
  const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`
  // Une nuit ou une ellipse pour tous les présents : le MJ, ou un joueur présent à la session.
  const canRest = group.length > 0 && (viewer.manager || viewer.characterIds.some((characterId) => current.characterIds.includes(characterId)))
  const restAction = canRest ? <RestButton label="Nuit ou ellipse" title="Tous les présents" subtitle={`${plural(group.length, "personnage présent", "personnages présents")} · les jours comptent dans ${campaignName}`} onRest={async (rest) => {
    try {
      const reply = await sendSatiety({ characterIds: group.map((member) => member.id), action: { kind: "rest", ...rest, campaignId }, campaignId, sessionId: current.id })
      const done = Object.keys(reply.records).length
      say(reply.failed.length
        ? `Pas enregistré pour ${reply.failed.map((id) => members.find((member) => member.id === id)?.name ?? id).join(", ")}.`
        : `${rest.mode === "ellipse" ? "Ellipse faite" : "Nuit passée"} pour ${plural(done, "personnage", "personnages")}.`)
    } catch (error) {
      say(error instanceof Error ? error.message : "La barre de rassasiement n’a pas pu être enregistrée.")
      throw error
    }
  }} /> : undefined

  const npcCount = sessionNpcs.length + npcEvents.length
  const newNpcs = countNew([...sessionNpcs.map((npc) => `npc:${npc.id}`), ...npcEvents.map((event) => `event:${event.id}`)])
  const newPlaces = countNew(places.map((name) => `place:${name}`))
  const tiles: Array<{ to: string; label: string; value: number; sub?: string; kind: SessionLinkKind; icon?: LucideIcon }> = [
    { to: "journal-groupe", label: "Groupe", value: group.length, sub: absents.length ? plural(absents.length, "absent", "absents") : undefined, kind: "character" },
    { to: "journal-lieux", label: "Lieux", value: places.length, sub: newPlaces ? plural(newPlaces, "nouveau", "nouveaux") : undefined, kind: "place" },
    { to: "journal-pnjs", label: "PNJs", value: npcCount, sub: newNpcs ? plural(newNpcs, "nouveau", "nouveaux") : undefined, kind: "npc" },
    { to: "journal-creatures", label: "Créatures", value: creatureEvents.length + creatures.length, kind: "creature" },
    { to: "journal-objets", label: "Objets", value: loot.length + items.length, sub: loot.length ? plural(loot.length, "butin", "butins") : undefined, kind: "item" },
    { to: "journal-magasins", label: "Magasins", value: sessionShops.length, kind: "shop" },
    { to: "journal-evenements", label: "Événements", value: otherEvents.length + timeline.length, sub: timeline.length ? `${timeline.length} dans la frise` : undefined, kind: "event" },
  ]
  function scrollTo(id: string, focus?: () => void) {
    const target = document.getElementById(id)
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })
    if (focus) focus(); else target?.focus({ preventScroll: true })
  }
  const showNotes = () => scrollTo("journal-notes", () => board.current?.focusSearch())
  const newNote = (type: SessionNoteType) => board.current?.newNote(type)

  const prev = sessions[index - 1]
  const next = sessions[index + 1]
  const date = sessionDate(current.createdAt)
  // La date en jeu : « 12 Brumaire 1023 » ou « 12 → 14 Brumaire 1023 » (le calendrier en bulle).
  const worldDate = current.startDate ? (current.endDate ? `${current.startDate} → ${current.endDate}` : current.startDate) : ""
  const banner = current.bannerUrl && brokenBanner !== current.bannerUrl ? current.bannerUrl : ""
  const eventColor = sessionNoteType("evenement").color

  // Le menu des sessions : ↑ ↓ passent d'une session à l'autre, Début et Fin vont aux bouts.
  function onMenuKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button[data-session]") ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number) => { event.preventDefault(); items[(to + items.length) % items.length]?.focus() }
    if (event.key === "ArrowDown") move(at + 1)
    else if (event.key === "ArrowUp") move(at - 1)
    else if (event.key === "Home") move(0)
    else if (event.key === "End") move(items.length - 1)
  }

  return <JournalCtx.Provider value={journal}><SessionRevealProvider value={reveal}>
    <div className="journal w-full flex-1 px-4 pb-12 pt-6 sm:px-6 md:pt-8 lg:px-8" style={vars}>
      <div className="mx-auto max-w-[76rem]">
        {/* Bannière : l'image de la session, ou à défaut (ou si elle ne charge pas) les couleurs de la campagne. */}
        <header className="relative isolate z-[1] overflow-hidden rounded-[1.4rem] text-banner-ink shadow-[0_10px_30px_rgb(33_30_26/0.18)] sm:rounded-[1.6rem]">
          <div className="journal-banner-bg absolute inset-0 -z-10" aria-hidden><BannerOrnament /></div>
          {banner && <>
            {/* eslint-disable-next-line @next/next/no-img-element -- bannière servie par l'app */}
            <img src={banner} alt="" onError={() => setBrokenBanner(banner)} ref={(node) => { if (node?.complete && !node.naturalWidth) setBrokenBanner(banner) }} className="absolute inset-0 -z-10 size-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/30 to-black/65" aria-hidden />
          </>}
          <div className="pointer-events-none absolute inset-2 rounded-[1rem] border border-banner-ink/20 sm:inset-2.5 sm:rounded-[1.15rem]" aria-hidden />
          <div className="grid gap-3 px-3 pb-6 pt-6 text-center sm:px-6 sm:pb-7 sm:pt-7 md:min-h-[14rem] md:content-center">
            <Eyebrow>Journal de {campaignName}</Eyebrow>
            <nav className="mx-auto grid w-full max-w-4xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1.5 sm:gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)_minmax(0,1fr)]" aria-label="Navigation entre les sessions">
              <BannerArrow side="prev" session={prev} number={index} onClick={() => go(index - 1)} />
              <Popover open={listOpen} onOpenChange={setListOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className="group/title min-w-0 rounded-2xl px-2 py-1.5 outline-none transition-colors hover:bg-banner-ink/8 focus-visible:ring-2 focus-visible:ring-white/80 sm:px-4" aria-label={`S${index + 1} - ${current.name}. Ouvrir la liste des sessions`}>
                    <span className="block text-[10.5px] font-semibold uppercase tracking-[0.2em] text-banner-ink/75">{index === sessions.length - 1 ? "Dernière session" : `Session ${index + 1} sur ${sessions.length}`}</span>
                    <span className="mt-1 block text-balance font-display text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.01em] [text-shadow:0_2px_14px_rgb(0_0_0/0.3)] sm:text-[2.1rem] lg:text-[2.6rem]">
                      <span className="text-banner-gold">S{index + 1}</span> — {current.name}
                    </span>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-banner-ink/80">
                      {worldDate && <><Hourglass className="size-3.5" aria-hidden /><span title={current.calendar}>{worldDate}</span><span aria-hidden>·</span></>}
                      {date && <><CalendarDays className="size-3.5" aria-hidden />{date}<span className="hidden sm:inline" aria-hidden>·</span></>}
                      <span className="hidden sm:inline">toutes les sessions</span>
                      <ChevronDown className={cn("size-3.5 transition-transform", listOpen && "rotate-180")} aria-hidden />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" sideOffset={10} style={vars} ref={menu} onKeyDown={onMenuKey}
                  onOpenAutoFocus={(event) => { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>("button[aria-current=true]")?.focus() }}
                  className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-border/80 p-1.5 shadow-[0_18px_44px_rgb(33_30_26/0.2)]">
                  <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Aller à la session</p>
                  <div className="max-h-[min(26rem,65svh)] space-y-px overflow-y-auto overscroll-contain scrollbar-thin">
                    {/* La plus récente en haut, comme la page s'ouvre. */}
                    {sessions.map((session, position) => ({ session, position })).reverse().map(({ session, position }) => <button
                      key={session.id}
                      type="button"
                      data-session
                      aria-current={position === index}
                      onClick={() => go(position)}
                      className={cn("grid w-full grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-center gap-1.5 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40", position === index && "bg-journal/10 hover:bg-journal/15")}
                    >
                      <span className="font-display font-semibold tabular-nums text-journal-ink">S{position + 1}</span>
                      <span className="min-w-0"><span className="block truncate font-display text-[15px]">{session.name}</span>{sessionDate(session.createdAt) && <span className="block text-[11.5px] text-muted-foreground">{sessionDate(session.createdAt)}</span>}</span>
                      {position === index && <Check className="size-4 text-journal-ink" aria-hidden />}
                    </button>)}
                  </div>
                </PopoverContent>
              </Popover>
              <BannerArrow side="next" session={next} number={index + 2} onClick={() => go(index + 1)} />
            </nav>
            <div className="flex items-center justify-center gap-2.5 text-banner-ink/50" aria-hidden>
              <span className="h-px w-14 bg-current" />
              <svg viewBox="0 0 12 12" className="size-3 fill-current"><path d="M6 0l1.6 4.4L12 6 7.6 7.6 6 12 4.4 7.6 0 6l4.4-1.6z" /></svg>
              <span className="h-px w-14 bg-current" />
            </div>
            <p className="hidden text-[11.5px] text-banner-ink/70 md:block">Touches <kbd className="rounded border border-b-2 border-banner-ink/40 px-1.5 font-sans text-[10.5px]">←</kbd> <kbd className="rounded border border-b-2 border-banner-ink/40 px-1.5 font-sans text-[10.5px]">→</kbd> pour changer de session</p>
          </div>
        </header>
        <p className="sr-only" aria-live="polite">Session affichée : S{index + 1} - {current.name}</p>

        {/* Téléphone : bilan, notes, puis le récit ; ordinateur : les notes à gauche, collées en défilant. */}
        <div className="mt-6 grid items-start gap-6 lg:mt-7 lg:grid-cols-[21.25rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-7 lg:gap-y-7">
          <section key={`bilan-${current.id}`} aria-labelledby="journal-bilan" className="journal-rise relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 pl-5 shadow-[0_1px_2px_rgb(67_50_31/0.06)] sm:p-5 sm:pl-6 lg:col-start-2 lg:row-start-1">
            <span className="absolute inset-y-0 left-0 w-1 bg-journal" aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="journal-bilan" className="font-display text-[1.35rem] font-semibold">Bilan de la session</h2>
              {worldDate && <span className="inline-flex items-center gap-1 text-xs font-medium text-journal-ink" title={current.calendar ? `Date en jeu · ${current.calendar}` : "Date en jeu"}><Hourglass className="size-3.5" aria-hidden />{worldDate}</span>}
              {date && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5 text-journal-ink" aria-hidden />{date}</span>}
            </div>
            {/* Le résumé en petit, replié au-delà de quelques lignes : le bilan reste lisible d'un coup d'œil. */}
            {summaries.length ? <div className="mt-2 space-y-2.5">{summaries.map((note) => {
              const body = note.text || note.title
              const open = openSummaries.has(note.id)
              const long = body.length > 320 || body.split("\n").length > 4
              const author = authorLabel(note)
              return <figure key={note.id} className="max-w-[72ch]">
                <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85", long && !open && "line-clamp-4")}>{body}</p>
                <figcaption className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
                  <button type="button" onClick={() => journal.openNote(note.id)} className="rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">{author ? `— ${author}` : "Voir la note"}</button>
                  {long && <button type="button" aria-expanded={open} onClick={() => setOpenSummaries((current) => { const next = new Set(current); if (open) next.delete(note.id); else next.add(note.id); return next })} className="rounded-sm font-medium text-journal-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">{open ? "Réduire" : "Lire la suite"}</button>}
                </figcaption>
              </figure>
            })}</div>
              : <EmptyHint icon={BookOpen} className="mt-3" action={<Button type="button" size="xs" variant="outline" onClick={() => newNote("resume")}><Feather />Écrire le résumé</Button>}>Pas encore de résumé pour cette session.</EmptyHint>}
            <div className="mt-4 grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
              {tiles.map((tile) => {
                const meta = linkKindLabels[tile.kind]
                const Icon = tile.icon ?? meta.icon
                return <button key={tile.to} type="button" onClick={() => scrollTo(tile.to)} style={tone(meta.color)} aria-label={`${tile.label} : ${tile.value}${tile.sub ? `, ${tile.sub}` : ""}. Aller à la section`}
                  className={cn("flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-left outline-none transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-tone/50 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/50", !tile.value && "opacity-65")}>
                  <span className="flex items-center gap-1.5 font-display text-2xl font-semibold leading-none tabular-nums"><Icon className="size-4 text-tone" aria-hidden />{tile.value}</span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{tile.label}</span>
                  {tile.sub && <span className="max-w-full truncate text-[11px] text-muted-foreground/85">{tile.sub}</span>}
                </button>
              })}
              <button type="button" onClick={showNotes} aria-label={`Notes : ${here.length}. Aller aux notes de session`}
                className="flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-journal/30 bg-journal/5 px-3 py-2.5 text-left outline-none transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-journal/60 hover:bg-journal/10 focus-visible:ring-2 focus-visible:ring-ring/50">
                <span className="flex items-center gap-1.5 font-display text-2xl font-semibold leading-none tabular-nums"><NotebookPen className="size-4 text-journal-ink" aria-hidden />{here.length}</span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Notes</span>
                <span className="max-w-full truncate text-[11px] text-journal-ink">Voir le panneau</span>
              </button>
            </div>
          </section>

          <aside className="min-w-0 lg:sticky lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:scrollbar-thin">
            {notesError && <p className="mb-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">Les notes n’ont pas pu être lues dans Google Sheets. Actualise dans un instant.</p>}
            <SessionNotesBoard id="journal-notes" handle={board} authorLabel={authorLabel} campaignId={campaignId} sessions={refs} sessionId={current.id} notes={notes} onNotesChange={setNotes} entities={entities} viewer={viewer} />
          </aside>

          <div key={`recit-${current.id}`} className="journal-rise min-w-0 space-y-10 lg:col-start-2 lg:row-start-2">
            <Section id="journal-groupe" icon={linkKindLabels.character.icon} title="Le groupe" count={absents.length ? `${group.length} · ${plural(absents.length, "absent", "absents")}` : group.length} action={restAction}>
              {group.length + absents.length ? <div className={groupGrid}>
                {group.map((member) => <CharacterCard key={member.id} member={member} reveal />)}
                {absents.map((member) => <CharacterCard key={member.id} member={member} absent tags={<Tag>absent</Tag>} />)}
              </div> : <EmptyHint icon={linkKindLabels.character.icon}>Personne n’a été ajouté à cette session.</EmptyHint>}
            </Section>

            <Section id="journal-lieux" icon={linkKindLabels.place.icon} title="Lieux" count={places.length}>
              {current.places && <div className="mb-3 rounded-xl border border-border/70 bg-card/60 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground"><Lock className="size-3" aria-hidden />Préparation du MJ · visible par toi seul</p>
                <RichTextView html={current.places} className="text-sm" />
              </div>}
              {places.length ? <div className={cardGrid}>{places.map((name) => { const linked = linkedPlaces.find((place) => placeKey(place.name) === placeKey(name)); return <EntityCard key={name} kind="place" name={name} hint={visualOf(`place:${name}`)?.type ?? linked?.tab} image={visualOf(`place:${name}`)?.image} icon={linkKindLabels.place.icon} square link={`place:${name}`} tags={seenTag(`place:${name}`)} reveal={linked ? { kind: "place", id: linked.id } : undefined} /> })}</div>
                : !current.places && <EmptyHint icon={linkKindLabels.place.icon}>Aucun lieu pour l’instant : le MJ les lie dans le Créateur de session, et les notes qui citent un lieu de l’index s’y ajoutent.</EmptyHint>}
            </Section>

            <Section id="journal-pnjs" icon={linkKindLabels.npc.icon} title="PNJs" count={npcCount}>
              {npcCount ? <div className={cardGrid}>
                {sessionNpcs.map((npc) => <EntityCard key={npc.id} kind="npc" name={npc.name} hint={npc.hint} image={npc.image} color={avatarColor(npc.name)} square link={`npc:${npc.id}`} tags={seenTag(`npc:${npc.id}`)} reveal={{ kind: "npc", id: npc.id }}
                  action={<CornerButton icon={NotebookText} label={`Notes de ${npc.name}`} onClick={() => setNpcHistory({ name: npc.name, hint: npc.hint, image: npc.image, color: avatarColor(npc.name), playerNotes: npc.playerNotes ?? "", link: `npc:${npc.id}` })} />} />)}
                {npcEvents.map((event) => <EntityCard key={event.id} kind="npc" name={event.name} hint={event.tag ? undefined : "PNJ"} image={event.image} color={avatarColor(event.name)} square link={`event:${event.id}`} reveal={{ kind: "event", id: event.id }}
                  tags={<>{event.tag && <Tag dot={event.tagColor || linkKindLabels.npc.color}>{event.tag}</Tag>}{seenTag(`event:${event.id}`)}</>}
                  action={<CornerButton icon={NotebookText} label={`Notes de ${event.name}`} onClick={() => setNpcHistory({ name: event.name, hint: event.tag || "PNJ", image: event.image, color: avatarColor(event.name), link: `event:${event.id}` })} />} />)}
              </div> : <EmptyHint icon={linkKindLabels.npc.icon}>Aucun PNJ dans cette session.</EmptyHint>}
            </Section>

            <Section id="journal-creatures" icon={linkKindLabels.creature.icon} title="Créatures" count={creatureEvents.length + creatures.length}>
              {creatureEvents.length + creatures.length ? <div className={cardGrid}>
                {creatureEvents.map((event) => <EntityCard key={event.id} kind="creature" name={event.name} image={event.image || visualOf(`creature:${event.name}`)?.image} icon={linkKindLabels.creature.icon} square link={[`event:${event.id}`, `creature:${event.name}`]} reveal={{ kind: "event", id: event.id }}
                  tags={<>{event.tag && <Tag dot={event.tagColor || linkKindLabels.creature.color}>{event.tag}</Tag>}{seenTag(`event:${event.id}`)}</>} />)}
                {creatures.map((name) => <EntityCard key={name} kind="creature" name={name} hint={visualOf(`creature:${name}`)?.type} image={visualOf(`creature:${name}`)?.image} icon={linkKindLabels.creature.icon} square link={`creature:${name}`} tags={seenTag(`creature:${name}`)} />)}
              </div> : <EmptyHint icon={linkKindLabels.creature.icon}>Aucune créature dans cette session.</EmptyHint>}
            </Section>

            <Section id="journal-objets" icon={linkKindLabels.item.icon} title="Objets" count={loot.length + items.length}>
              {loot.length + items.length ? <div className={cardGrid}>
                {loot.map((note) => <EntityCard key={note.id} kind="item" name={note.title || sessionNoteLabel(note, 80)} media={lootMedia(note)} icon={LootIcon} color={sessionNoteType("butin").color} square
                  link={[`note:${note.id}`, ...(note.title ? [`item:${note.title}`] : [])]} tags={<><Tag dot={sessionNoteType("butin").color}>Butin</Tag>{authorLabel(note) && <Tag>noté par {authorLabel(note)}</Tag>}</>}>
                  {note.title && note.text && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{note.text}</p>}
                  <button type="button" onClick={() => journal.openNote(note.id)} className="mt-1.5 rounded-sm text-[11.5px] font-medium text-journal-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">Ouvrir la note</button>
                </EntityCard>)}
                {items.map((name) => <EntityCard key={name} kind="item" name={name} hint={[visualOf(`item:${name}`)?.object?.type, visualOf(`item:${name}`)?.object?.subtype].filter(Boolean).join(" · ") || undefined} media={objectMedia(`item:${name}`, name)} image={visualOf(`item:${name}`)?.image} icon={linkKindLabels.item.icon} square link={`item:${name}`} tags={seenTag(`item:${name}`)} />)}
              </div> : <EmptyHint icon={linkKindLabels.item.icon}>Aucun objet noté. Ajoute une note « Butin » ou lie un objet à une note.</EmptyHint>}
            </Section>

            <Section id="journal-magasins" icon={linkKindLabels.shop.icon} title="Magasins" count={sessionShops.length}>
              {sessionShops.length ? <div className={cardGrid}>{sessionShops.map((shop) => <EntityCard key={shop.id} kind="shop" name={shop.name} hint={shop.hint} media={shop.items?.[0] ? <ObjectIcon icon={shop.items[0].icon} name={shop.items[0].name} type={shop.items[0].type} subtype={shop.items[0].subtype} className="size-full" emojiClassName="text-xl leading-none" /> : undefined} icon={linkKindLabels.shop.icon} square link={`shop:${shop.id}`} tags={seenTag(`shop:${shop.id}`)} reveal={{ kind: "shop", id: shop.id }}
                action={<CornerButton icon={Store} label={`Ouvrir le magasin ${shop.name}`} onClick={() => setOpenShop(shop.id)} />}>
                {(shop.items?.length ?? 0) > 1 && <ul aria-label="En vitrine" className="mt-2 flex flex-wrap gap-1">{shop.items!.slice(0, 6).map((item, position) => <li key={`${item.name}:${position}`} title={item.name} className="flex size-7 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background/60 p-0.5"><ObjectIcon icon={item.icon} name={item.name} type={item.type} subtype={item.subtype} className="size-full" emojiClassName="text-sm leading-none" fallback={<span className="text-[10px] font-semibold text-muted-foreground">{item.name.slice(0, 1)}</span>} /></li>)}</ul>}
              </EntityCard>)}</div>
                : <EmptyHint icon={linkKindLabels.shop.icon}>Aucun magasin dans cette session.</EmptyHint>}
            </Section>

            <Section id="journal-quetes" icon={noteTypeIcons.quete} title="Quêtes" action={<HeadAction color={sessionNoteType("quete").color} onClick={() => newNote("quete")}>Quête</HeadAction>}>
              <SessionQuestChains campaignId={campaignId} sessions={refs} sessionId={current.id} notes={notes} onNotesChange={setNotes} entities={entities} viewer={viewer} onOpenNote={journal.openNote} />
            </Section>

            <Section id="journal-evenements" icon={linkKindLabels.event.icon} title="Événements" count={otherEvents.length + timeline.length} action={<HeadAction color={eventColor} onClick={() => newNote("evenement")}>Événement</HeadAction>}>
              {otherEvents.length + timeline.length ? <div className="space-y-5">
                {otherEvents.length > 0 && <div className={cardGrid}>{otherEvents.map((event) => <EntityCard key={event.id} kind="event" name={event.name} image={event.image} icon={linkKindLabels.event.icon} square link={`event:${event.id}`} reveal={{ kind: "event", id: event.id }}
                  tags={<>{event.tag && <Tag dot={event.tagColor || eventColor}>{event.tag}</Tag>}{seenTag(`event:${event.id}`)}</>}>
                  {event.description && <RichTextView html={event.description} className="mt-1.5 text-[13px] text-muted-foreground" />}
                </EntityCard>)}</div>}
                {timeline.length > 0 && <div>
                  {otherEvents.length > 0 && <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Frise de la session</p>}
                  <ol aria-label="Frise de la session" style={tone(eventColor)}>
                    {timeline.map((note, position) => {
                      const last = position === timeline.length - 1
                      const links = note.links.flatMap((link) => { const found = linkLabel(link); return found?.label ? [{ link, kind: found.kind, label: found.label }] : [] })
                      const all = openLinks.has(note.id)
                      return <li key={note.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[6.5rem_2rem_minmax(0,1fr)]">
                        <p className={cn("col-start-2 row-start-1 pb-1 text-[11.5px] font-semibold leading-tight text-tone [overflow-wrap:anywhere] sm:col-start-1 sm:pb-0 sm:pt-2 sm:text-right", !note.moment && "hidden sm:block")}>{note.moment || <span className="font-normal text-muted-foreground/60">—</span>}</p>
                        <div className="col-start-1 row-span-2 row-start-1 flex flex-col items-center sm:col-start-2 sm:row-span-1" aria-hidden>
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-tone bg-card font-display text-sm font-semibold tabular-nums text-tone shadow-[0_0_0_4px_var(--background)]">{position + 1}</span>
                          {!last && <span className="my-1 w-[1.5px] flex-1 rounded-full bg-gradient-to-b from-tone/55 to-border" />}
                        </div>
                        <div className={cn("col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1", !last && "pb-4")}>
                          <div className="rounded-xl border border-border/70 bg-card px-3 py-2 shadow-[0_1px_2px_rgb(67_50_31/0.05)] transition-colors hover:border-tone/45">
                            <h3 className="font-display text-[15.5px] font-semibold leading-snug">
                              <button type="button" onClick={() => journal.openNote(note.id)} className="rounded-sm text-left outline-none hover:underline hover:decoration-border hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/50">
                                <span className="sr-only">Événement {position + 1}{note.moment ? `, ${note.moment}` : ""} : </span>{note.title || sessionNoteLabel(note, 70)}
                              </button>
                            </h3>
                            {note.title && note.text && <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{note.text}</p>}
                            {links.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">
                              {(all ? links : links.slice(0, 3)).map((link) => <LinkChip key={link.link} kind={link.kind} label={link.label} onClick={link.kind === "note" ? () => journal.openNote(link.link.slice(5)) : undefined} />)}
                              {links.length > 3 && <button type="button" onClick={() => setOpenLinks((open) => { const nextOpen = new Set(open); if (all) nextOpen.delete(note.id); else nextOpen.add(note.id); return nextOpen })}
                                className="rounded-md border border-border/80 bg-background px-1.5 text-[11.5px] font-semibold leading-[1.35rem] tabular-nums text-muted-foreground outline-none hover:border-journal/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                                aria-label={all ? "Montrer moins de liens" : `Voir les ${links.length} liens`}>{all ? "moins" : `+${links.length - 3}`}</button>}
                            </div>}
                          </div>
                        </div>
                      </li>
                    })}
                  </ol>
                </div>}
              </div> : <EmptyHint icon={linkKindLabels.event.icon} action={<Button type="button" size="xs" variant="outline" onClick={() => newNote("evenement")}><Plus />Ajouter un événement</Button>}>Aucun événement. Une note « Événement » remplit la frise.</EmptyHint>}
            </Section>
          </div>
        </div>

        {/* Pied de page : la session d'avant et celle d'après, pour lire le journal d'un trait. */}
        <nav className="mt-10 grid grid-cols-2 gap-2.5 lg:ml-[calc(21.25rem+1.75rem)]" aria-label="Session précédente et suivante">
          {([["prev", prev, index], ["next", next, index + 2]] as const).map(([side, session, number]) => <button key={side} type="button" disabled={!session}
            onClick={() => { go(side === "prev" ? index - 1 : index + 1); window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }) }}
            className={cn("group/foot grid min-w-0 gap-0.5 rounded-xl border border-border/80 bg-card px-4 py-2.5 outline-none transition-[border-color,transform] duration-150 hover:border-journal/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:border-dashed disabled:bg-transparent disabled:opacity-60 disabled:hover:border-border/80", side === "next" ? "text-right" : "text-left")}>
            <small className={cn("flex items-center gap-1 text-[11.5px] text-muted-foreground", side === "next" && "justify-end")}>
              {side === "prev" && <ChevronLeft className="size-3.5 transition-transform group-hover/foot:-translate-x-0.5" aria-hidden />}
              {side === "prev" ? "Session précédente" : "Session suivante"}
              {side === "next" && <ChevronRight className="size-3.5 transition-transform group-hover/foot:translate-x-0.5" aria-hidden />}
            </small>
            <span className="truncate font-display text-[15px]">{session ? <><span className="text-journal-ink">S{number}</span> — {session.name}</> : side === "prev" ? "Début du journal" : "Pas encore jouée"}</span>
          </button>)}
        </nav>
      </div>

      {openShop && <JournalShopWindow key={`${current.id}:${openShop}`} campaignId={campaignId} sessionId={current.id} sessionLabel={`S${index + 1} - ${current.name}`} shopId={openShop}
        inEvents={Boolean(current.marketIds?.includes(openShop))} style={vars} onClose={() => setOpenShop("")} />}
      <NpcHistoryDialog npc={npcHistory} rows={npcHistoryRows} onClose={() => setNpcHistory(null)} onGoSession={(sessionId) => {
        const position = sessions.findIndex((session) => session.id === sessionId)
        if (position < 0) return
        go(position)
        scrollTo("journal-pnjs")
      }} />

      <div role="status" aria-live="polite" className={cn("pointer-events-none fixed bottom-5 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-foreground px-3.5 py-2 text-[13px] text-background shadow-[0_18px_44px_rgb(33_30_26/0.25)] transition-[opacity,transform] duration-200", toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>{toast}</div>
    </div>
  </SessionRevealProvider></JournalCtx.Provider>
}
