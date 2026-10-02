"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, Gift, LoaderCircle, Lock, Plus, Search, Trash2, Trophy } from "lucide-react"

import { IndexIconGlyph, parseIconValue } from "@/components/eraser/index-gauge"
import { sanitizeRichText } from "@/components/eraser/rich-text"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import {
  achievementDateLabel,
  achievementOf,
  achievementTypeColors,
  foldAchievementText,
  type Achievement,
  type AchievementBoard,
  type AchievementType,
  type ObtainedAchievement,
} from "@/lib/achievements-shared"
import { cn } from "@/lib/utils"

// ---------- Données : gardées en mémoire, le contenu reste affiché pendant une relecture ----------

const boards = new Map<string, AchievementBoard>()

/** Les succès d'un compte (le sien sans `uid`) ; `reload` relit après une attribution. */
export function useAchievementBoard(uid?: string) {
  const key = uid || "me"
  const [board, setBoard] = useState<AchievementBoard | null>(() => boards.get(key) ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    fetch(`/api/achievements${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as AchievementBoard & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) { setError(payload.error || "Les succès n’ont pas pu être chargés."); return }
        boards.set(key, payload)
        setBoard(payload)
        setError("")
      })
      .catch(() => { if (active) setError("Les succès n’ont pas pu être chargés.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [key, uid, version])
  const reload = useCallback(() => { setLoading(true); setVersion((value) => value + 1) }, [])
  return { board, loading, error, reload }
}

// ---------- Carte d'un succès ----------

/** Obtenu il y a moins de deux semaines : la carte porte un ruban « Nouveau ». */
function isRecent(date: string) {
  const time = Date.parse(date.slice(0, 10))
  return Number.isFinite(time) && Date.now() - time < 14 * 86_400_000
}

export function AchievementCard({ achievement, obtained, onRevoke, className }: { achievement: Achievement; obtained?: ObtainedAchievement; onRevoke?: () => Promise<void>; className?: string }) {
  const locked = !obtained
  const color = achievement.color
  const icon = parseIconValue(achievement.icon)
  const glyph = icon.icon || icon.emoji ? icon : { icon: achievement.type === "MJ" ? "crown" : "trophy" }
  const [revoking, setRevoking] = useState(false)
  return <article
    className={cn("group relative flex min-h-44 flex-col overflow-hidden rounded-2xl border p-4 transition duration-300", locked ? "bg-muted/25 opacity-70 grayscale hover:opacity-90 hover:grayscale-0" : "bg-card hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-14px_var(--achievement-glow)]", className)}
    style={{ borderColor: locked ? undefined : `${color}66`, backgroundImage: locked ? undefined : `linear-gradient(150deg, ${color}26, ${color}08 45%, transparent 75%)`, ["--achievement-glow" as string]: `${color}aa` }}
  >
    {/* La grande icône du succès, en filigrane. */}
    <span className="pointer-events-none absolute -bottom-6 -right-5 opacity-[.07] transition duration-500 group-hover:-rotate-6 group-hover:opacity-[.12]" style={{ color }}><IndexIconGlyph {...glyph} className="size-32" /></span>
    {!locked && isRecent(obtained.date) && <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-white shadow-sm" style={{ backgroundColor: color }}>Nouveau</span>}
    <div className="relative flex items-start gap-3">
      <span className="relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 text-white" style={{ borderColor: locked ? "var(--border)" : `${color}`, background: locked ? "var(--muted)" : `radial-gradient(circle at 35% 30%, ${color}, ${color}cc 55%, #1d140c 120%)`, boxShadow: locked ? undefined : `0 0 0 4px ${color}1f, 0 8px 18px -6px ${color}` }}>
        <IndexIconGlyph {...glyph} className={cn("size-6", locked && "text-muted-foreground")} />
        {locked && <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground"><Lock className="size-3" /></span>}
      </span>
      <div className="min-w-0 flex-1 pr-10">
        <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em]">
          <span style={{ color: achievementTypeColors[achievement.type] }}>{achievement.type}</span>
          {achievement.subtype && <><span className="text-muted-foreground/50">·</span><span className="text-muted-foreground">{achievement.subtype}</span></>}
        </p>
        <h3 className="font-display text-lg font-semibold leading-tight" style={{ color: locked ? undefined : color }}>{achievement.name}</h3>
      </div>
    </div>
    {achievement.description && <div className="relative mt-2.5 line-clamp-3 text-xs leading-5 text-muted-foreground [&_p]:m-0" dangerouslySetInnerHTML={{ __html: sanitizeRichText(achievement.description) }} />}
    <div className="relative mt-auto flex items-end gap-2 pt-3 text-[10px] text-muted-foreground">
      {locked
        ? <span className="uppercase tracking-wider">À débloquer</span>
        : <span className="min-w-0 flex-1">
          <span className="block font-semibold uppercase tracking-wider" style={{ color }}>Obtenu{obtained.date ? ` le ${achievementDateLabel(obtained.date)}` : ""}</span>
          {obtained.grantedBy && <span className="block truncate">par {obtained.grantedBy}</span>}
          {obtained.note && <span className="mt-0.5 block italic leading-4 text-foreground/70">« {obtained.note} »</span>}
        </span>}
      {onRevoke && obtained && <AlertDialog>
        <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="ml-auto shrink-0 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Retirer le succès ${achievement.name}`} title="Retirer ce succès">{revoking ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer « {achievement.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>La ligne correspondante est effacée de l’onglet « Obtenus » de l’Index des succès. Le succès lui-même reste dans l’index.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setRevoking(true); try { await onRevoke() } finally { setRevoking(false) } }}>Retirer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  </article>
}

// ---------- Attribuer un succès ----------

type GrantAccount = { uid: string; name: string; role: string }
let grantAccounts: Promise<GrantAccount[]> | null = null

function loadGrantAccounts() {
  grantAccounts ??= fetch("/api/achievements?accounts=1")
    .then(async (response) => response.ok ? ((await response.json()) as { accounts?: GrantAccount[] }).accounts ?? [] : [])
    .catch(() => [])
    .then((accounts) => { if (!accounts.length) grantAccounts = null; return accounts })
  return grantAccounts
}

export function GrantAchievementDialog({ open, onOpenChange, achievements, uid, playerName, defaultType, onGranted }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  achievements: Achievement[]
  /** Le compte à qui attribuer (profil) ; sans lui, on le choisit dans la liste. */
  uid?: string
  playerName?: string
  defaultType?: AchievementType
  onGranted: () => void
}) {
  const [accounts, setAccounts] = useState<GrantAccount[]>([])
  const [target, setTarget] = useState(uid ?? "")
  const [query, setQuery] = useState("")
  const [type, setType] = useState<AchievementType | "all">(defaultType ?? "all")
  const [chosen, setChosen] = useState("")
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open || uid) return
    let active = true
    void loadGrantAccounts().then((list) => { if (active) setAccounts(list) })
    return () => { active = false }
  }, [open, uid])
  const shown = useMemo(() => {
    const folded = foldAchievementText(query)
    return achievements.filter((achievement) => (type === "all" || achievement.type === type) && (!folded || foldAchievementText(`${achievement.name} ${achievement.subtype}`).includes(folded)))
  }, [achievements, query, type])

  async function grant() {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/achievements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "grant", achievement: chosen, uid: uid ?? target, note }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string; created?: boolean }
      if (!response.ok) throw new Error(payload.error || "Le succès n’a pas pu être attribué.")
      setChosen(""); setNote("")
      onGranted()
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le succès n’a pas pu être attribué.")
    } finally {
      setPending(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Gift className="size-5 text-primary" />Attribuer un succès{playerName ? ` à ${playerName}` : ""}</DialogTitle>
        <DialogDescription>L’attribution est écrite dans l’onglet « Obtenus » de l’Index des succès, avec la date et ton nom.</DialogDescription>
      </DialogHeader>
      {!uid && <label className="grid gap-1.5 text-sm font-medium">Compte
        <NativeSelect value={target} onChange={(event) => setTarget(event.target.value)}>
          <NativeSelectOption value="">{accounts.length ? "Choisir un compte…" : "Chargement des comptes…"}</NativeSelectOption>
          {accounts.map((account) => <NativeSelectOption key={account.uid} value={account.uid}>{account.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un succès" className="h-9 pl-9" aria-label="Chercher un succès" />
        </div>
        <NativeSelect value={type} onChange={(event) => setType(event.target.value as AchievementType | "all")} className="h-9 text-sm" aria-label="Type de succès">
          <NativeSelectOption value="all">Tous les types</NativeSelectOption>
          <NativeSelectOption value="Joueur">Joueur</NativeSelectOption>
          <NativeSelectOption value="MJ">MJ</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {shown.map((achievement) => {
          const icon = parseIconValue(achievement.icon)
          const selected = chosen === achievement.name
          return <button key={achievement.id} type="button" onClick={() => setChosen(achievement.name)} aria-pressed={selected} className={cn("flex items-center gap-3 rounded-xl border p-2.5 text-left transition hover:bg-accent", selected && "ring-2 ring-offset-1")} style={selected ? { borderColor: achievement.color, ["--tw-ring-color" as string]: achievement.color } : undefined}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: achievement.color }}><IndexIconGlyph {...(icon.icon || icon.emoji ? icon : { icon: achievement.type === "MJ" ? "crown" : "trophy" })} className="size-4" /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{achievement.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{[achievement.type, achievement.subtype].filter(Boolean).join(" · ")}</span>
            </span>
          </button>
        })}
        {!shown.length && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{achievements.length ? "Aucun succès ne correspond." : "L’Index des succès est vide pour l’instant."}</p>}
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Note (facultative)
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Pour quelle scène, quel moment…" className="min-h-16" />
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="button" disabled={pending || !chosen || !(uid ?? target)} onClick={() => void grant()}>{pending ? <LoaderCircle className="animate-spin" /> : <Trophy />}Attribuer</Button>
      </div>
    </DialogContent>
  </Dialog>
}

// ---------- Une vitrine de succès : obtenus, puis à débloquer ----------

async function revoke(id: string) {
  const response = await fetch("/api/achievements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke", id }) })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error || "Le succès n’a pas pu être retiré.")
}

export function AchievementShowcase({ board, types, revocable, onChanged, lockedOpen = false }: { board: AchievementBoard; types: AchievementType[]; revocable: boolean; onChanged: () => void; lockedOpen?: boolean }) {
  const [showLocked, setShowLocked] = useState(lockedOpen)
  const [error, setError] = useState("")
  const relevant = board.achievements.filter((achievement) => types.includes(achievement.type))
  const owned = board.obtained
    .map((entry) => ({ entry, achievement: achievementOf(board.achievements, entry) }))
    .filter((item): item is { entry: ObtainedAchievement; achievement: Achievement } => Boolean(item.achievement && types.includes(item.achievement.type)))
    .sort((left, right) => right.entry.date.localeCompare(left.entry.date))
  const ownedNames = new Set(owned.map((item) => foldAchievementText(item.achievement.name)))
  const locked = relevant.filter((achievement) => !ownedNames.has(foldAchievementText(achievement.name)))
  const ratio = relevant.length ? owned.length / relevant.length : 0
  return <div>
    {relevant.length > 0 && <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
      <span className="shrink-0 font-semibold tabular-nums text-foreground">{owned.length} / {relevant.length}</span>
    </div>}
    {error && <p className="mb-3 text-sm text-destructive" role="alert">{error}</p>}
    {owned.length > 0
      ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {owned.map(({ entry, achievement }) => <AchievementCard key={entry.id} achievement={achievement} obtained={entry} onRevoke={revocable ? async () => { setError(""); try { await revoke(entry.id); onChanged() } catch (caught) { setError(caught instanceof Error ? caught.message : "Le succès n’a pas pu être retiré.") } } : undefined} />)}
      </div>
      : <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{relevant.length ? "Aucun succès obtenu pour l’instant." : "Aucun succès de ce type dans l’index pour l’instant."}</p>}
    {locked.length > 0 && <div className="mt-4">
      <button type="button" onClick={() => setShowLocked((value) => !value)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" aria-expanded={showLocked}>
        <ChevronDown className={cn("size-4 transition", showLocked && "rotate-180")} />{showLocked ? "Masquer" : "Voir"} {locked.length > 1 ? `les ${locked.length} succès` : "le succès"} à débloquer
      </button>
      {showLocked && <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {locked.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}
      </div>}
    </div>}
  </div>
}

// ---------- Section « Succès » de l'accueil ----------

const homeTitles: Record<string, string> = { joueur: "Mes succès de joueur", mj: "Mes succès de MJ", admin: "Mes succès" }

/** Sous le contenu de l'accueil : les succès qui correspondent à la vue affichée. */
export function HomeAchievements({ viewRole }: { viewRole: "admin" | "mj" | "joueur" }) {
  const { board, loading, error, reload } = useAchievementBoard()
  const [granting, setGranting] = useState(false)
  const types: AchievementType[] = viewRole === "joueur" ? ["Joueur"] : viewRole === "mj" ? ["MJ"] : ["Joueur", "MJ"]
  const canGrant = Boolean(board?.canGrant) && viewRole !== "joueur"
  return <section className="mt-5 rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5" aria-busy={loading}>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><Trophy className="size-4.5" /></div>
      <h2 className="font-display flex-1 text-2xl font-semibold tracking-[-0.01em]">{homeTitles[viewRole]}</h2>
      {loading && board && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Actualisation" />}
      <Link href="/profil" prefetch={false} className="text-xs font-medium text-primary hover:underline">Mon profil</Link>
      {canGrant && <Button type="button" size="sm" variant="outline" onClick={() => setGranting(true)}><Plus />Attribuer un succès</Button>}
    </div>
    {board
      ? <>
        <AchievementShowcase board={board} types={types} revocable={false} onChanged={reload} />
        {!board.achievements.length && canGrant && <p className="mt-3 text-center text-xs text-muted-foreground">Ajoute des succès dans <Link href="/ressources/index-des-succes" prefetch={false} className="font-medium text-primary hover:underline">Index › Succès</Link> : ils apparaîtront ici.</p>}
      </>
      : error
        ? <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{error}</p>
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl border bg-muted/30" />)}</div>}
    {board && granting && <GrantAchievementDialog open onOpenChange={setGranting} achievements={board.achievements} onGranted={reload} />}
  </section>
}
