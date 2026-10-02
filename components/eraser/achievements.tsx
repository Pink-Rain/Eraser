"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronDown, Crown, LoaderCircle, Lock, Trophy } from "lucide-react"

import { IndexImage } from "@/components/eraser/index-image"
import { sanitizeRichText } from "@/components/eraser/rich-text"
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

/** Les succès de la personne connectée (ou d'un autre compte : `uid`), gardés en mémoire d'un affichage à l'autre. */
export function useAchievementBoard(uid = "") {
  const key = uid || "me"
  const [board, setBoard] = useState<AchievementBoard | null>(() => boards.get(key) ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch(uid ? `/api/achievements?uid=${encodeURIComponent(uid)}` : "/api/achievements", { cache: "no-store" })
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
  }, [key, uid])
  return { board, loading, error }
}

// ---------- Carte d'un succès ----------

/** Obtenu il y a moins de deux semaines : la carte porte un ruban « Nouveau ». */
function isRecent(date: string) {
  const time = Date.parse(date.slice(0, 10))
  return Number.isFinite(time) && Date.now() - time < 14 * 86_400_000
}

/** Le contenu de la colonne Icône (Fichier image), ou un trophée / une couronne à défaut. */
function AchievementIcon({ achievement, className }: { achievement: Achievement; className: string }) {
  const Fallback = achievement.type === "MJ" ? Crown : Trophy
  return <IndexImage value={achievement.icon} alt="" className={className} fallback={<Fallback className={className} />} />
}

export function AchievementCard({ achievement, obtained, className }: { achievement: Achievement; obtained?: ObtainedAchievement; className?: string }) {
  const locked = !obtained
  const color = achievement.color
  return <article
    className={cn("group relative flex min-h-44 flex-col overflow-hidden rounded-2xl border p-4 transition duration-300", locked ? "bg-muted/25 opacity-70 grayscale hover:opacity-90 hover:grayscale-0" : "bg-card hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-14px_var(--achievement-glow)]", className)}
    style={{ borderColor: locked ? undefined : `${color}66`, backgroundImage: locked ? undefined : `linear-gradient(150deg, ${color}26, ${color}08 45%, transparent 75%)`, ["--achievement-glow" as string]: `${color}aa` }}
  >
    {!locked && isRecent(obtained.date) && <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-white shadow-sm" style={{ backgroundColor: color }}>Nouveau</span>}
    <div className="relative flex items-start gap-3">
      <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-white" style={{ borderColor: locked ? "var(--border)" : color, background: locked ? "var(--muted)" : `radial-gradient(circle at 35% 30%, ${color}, ${color}cc 55%, #1d140c 120%)`, boxShadow: locked ? undefined : `0 0 0 4px ${color}1f, 0 8px 18px -6px ${color}` }}>
        <AchievementIcon achievement={achievement} className={cn("size-full text-2xl [&:is(svg)]:size-6", locked && "text-muted-foreground")} />
      </span>
      {locked && <span className="absolute left-10 top-10 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground"><Lock className="size-3" /></span>}
      <div className="min-w-0 flex-1 pr-10">
        <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.14em]">
          <span style={{ color: achievementTypeColors[achievement.type] }}>{achievement.type}</span>
          {achievement.subtype && <><span className="text-muted-foreground/50">·</span><span className="text-muted-foreground">{achievement.subtype}</span></>}
        </p>
        <h3 className="font-display text-lg font-semibold leading-tight" style={{ color: locked ? undefined : color }}>{achievement.name}</h3>
      </div>
    </div>
    {achievement.description && <div className="relative mt-2.5 line-clamp-3 text-xs leading-5 text-muted-foreground [&_p]:m-0" dangerouslySetInnerHTML={{ __html: sanitizeRichText(achievement.description) }} />}
    <div className="relative mt-auto pt-3 text-[10px] text-muted-foreground">
      {locked
        ? <span className="uppercase tracking-wider">À débloquer</span>
        : <span className="block font-semibold uppercase tracking-wider" style={{ color }}>Obtenu{obtained.date ? ` le ${achievementDateLabel(obtained.date)}` : ""}</span>}
    </div>
  </article>
}

// ---------- Une vitrine de succès : obtenus, puis à débloquer ----------

export function AchievementShowcase({ board, types, lockedOpen = false }: { board: AchievementBoard; types: AchievementType[]; lockedOpen?: boolean }) {
  const [showLocked, setShowLocked] = useState(lockedOpen)
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
    {owned.length > 0
      ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {owned.map(({ entry, achievement }) => <AchievementCard key={entry.id} achievement={achievement} obtained={entry} />)}
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
  const { board, loading, error } = useAchievementBoard()
  const types: AchievementType[] = viewRole === "joueur" ? ["Joueur"] : viewRole === "mj" ? ["MJ"] : ["Joueur", "MJ"]
  return <section className="mt-5 rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5" aria-busy={loading}>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><Trophy className="size-4.5" /></div>
      <h2 className="font-display flex-1 text-2xl font-semibold tracking-[-0.01em]">{homeTitles[viewRole]}</h2>
      {loading && board && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Actualisation" />}
      <Link href="/profil" prefetch={false} className="text-xs font-medium text-primary hover:underline">Mon profil</Link>
    </div>
    {board
      ? <AchievementShowcase board={board} types={types} />
      : error
        ? <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{error}</p>
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl border bg-muted/30" />)}</div>}
  </section>
}
