"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CircleUserRound, Crown, Map, Plus, Settings2, Sparkles, Trophy, UsersRound, type LucideIcon } from "lucide-react"

import { AccountAvatar } from "@/components/eraser/account-dialog"
import { AchievementShowcase, useAchievementBoard } from "@/components/eraser/achievements"
import { useShellData } from "@/components/eraser/app-shell"
import { QuietImage } from "@/components/eraser/home-shell"
import { Button } from "@/components/ui/button"
import { achievementOf, type AchievementType } from "@/lib/achievements-shared"
import type { SiteRole } from "@/lib/auth-types"
import type { CampaignRecord, CharacterRecord } from "@/lib/google-sheets"
import { cn } from "@/lib/utils"

export type ProfileAccount = { uid: string; email: string; displayName: string; role: SiteRole | null }

/**
 * Ce que la personne qui regarde peut ouvrir sur le profil d'un autre compte : les fiches
 * (administrateur, ou MJ d'une campagne du personnage) et les campagnes (celles qu'elle
 * mène ou où joue l'un de ses personnages). Absent sur son propre profil : tout s'ouvre.
 */
export type ProfileAccess = { characters: string[]; campaigns: string[] }

const roleLabels: Record<SiteRole, string> = { admin: "Administrateur", mj: "Maître du jeu", joueur: "Joueur" }

function plainText(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

function Section({ title, icon: Icon, count, action, children }: { title: string; icon: LucideIcon; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><Icon className="size-4.5" /></div>
      <h2 className="font-display flex-1 text-2xl font-semibold tracking-[-0.01em]">{title}{count !== undefined && <span className="ml-2 align-middle text-sm font-normal text-muted-foreground tabular-nums">{count}</span>}</h2>
      {action}
    </div>
    {children}
  </section>
}

function Stat({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string; color: string }) {
  return <div className="flex items-center gap-3 rounded-2xl border bg-background/50 px-4 py-3">
    <span className="flex size-10 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: color }}><Icon className="size-5" /></span>
    <span><span className="block font-display text-2xl font-semibold leading-none tabular-nums">{value}</span><span className="text-xs text-muted-foreground">{label}</span></span>
  </div>
}

/** Une carte qui s'ouvre si la personne qui regarde y a accès ; sinon elle reste affichée, sans lien. */
function CardLink({ href, label, className, style, children }: { href: string | null; label: string; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  if (!href) return <div className={className} style={style}>{children}</div>
  return <Link href={href} prefetch={false} data-tab-href={href} data-tab-label={label} className={cn(className, "transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgb(67_50_31/0.12)]")} style={style}>{children}</Link>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/** Le profil d'un compte : ses personnages, ses campagnes et ses succès, quelle que soit la vue. */
export function ProfileView({ account, characters, campaigns, access }: { account: ProfileAccount; characters: CharacterRecord[]; campaigns: CampaignRecord[]; access?: ProfileAccess }) {
  const shell = useShellData()
  const self = !access
  const { board, loading, error } = useAchievementBoard(self ? "" : account.uid)
  const canOpenCharacter = (id: string) => !access || access.characters.includes(id)
  const canOpenCampaign = (id: string) => !access || access.campaigns.includes(id)
  // Classe et rang, lus dans les fiches après l'affichage : le profil n'attend pas Sheets.
  const [summaries, setSummaries] = useState<Record<string, { classes: string; level: string; title?: string }>>({})
  // Tant que les fiches n'ont pas répondu, la classe reste en attente (pas « à choisir »).
  const [summariesLoaded, setSummariesLoaded] = useState(false)
  useEffect(() => {
    if (!characters.length) return
    let active = true
    fetch(self ? "/api/characters/summaries" : `/api/characters/summaries?uid=${encodeURIComponent(account.uid)}`)
      .then(async (response) => response.ok ? (await response.json()) as { summaries?: Record<string, { classes: string; level: string; title?: string }> } : null)
      .then((payload) => { if (active && payload?.summaries) setSummaries(payload.summaries) })
      .catch(() => { /* les cartes restent lisibles sans la classe */ })
      .finally(() => { if (active) setSummariesLoaded(true) })
    return () => { active = false }
  }, [account.uid, characters.length, self])

  // Les campagnes menées, puis celles où joue l'un de ses personnages.
  const played = useMemo(() => {
    const led = new Set(campaigns.map((campaign) => campaign.id))
    const seen = new globalThis.Map<string, { id: string; name: string; accentColor: string; characters: string[] }>()
    for (const character of characters) for (const campaign of character.campaigns) {
      if (led.has(campaign.id)) continue
      const entry = seen.get(campaign.id) ?? { ...campaign, characters: [] }
      entry.characters.push(character.name)
      seen.set(campaign.id, entry)
    }
    return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name, "fr"))
  }, [campaigns, characters])

  const obtainedCount = board ? board.obtained.filter((entry) => achievementOf(board.achievements, entry)).length : null
  const countOf = (type: AchievementType) => board ? board.obtained.filter((entry) => achievementOf(board.achievements, entry)?.type === type).length : 0
  const name = account.displayName || account.email.split("@")[0]
  // Rôle inconnu (un joueur ne lit pas la liste des comptes) : celui de ce qu'il mène.
  const role: SiteRole = account.role ?? (campaigns.length ? "mj" : "joueur")

  return <div className="flex w-full flex-1 flex-col gap-5 px-5 py-8 sm:px-8 md:py-10">
    {/* En-tête : l'avatar, le pseudo, le rôle. */}
    <header className="relative overflow-hidden rounded-[1.75rem] border bg-card/90 p-5 shadow-[0_12px_35px_rgb(67_50_31/0.08)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_0%_0%,rgb(146_118_64/0.16),transparent_60%)]" />
      <Trophy className="pointer-events-none absolute -right-6 -top-6 size-44 text-primary/[.06]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <AccountAvatar user={account} version={shell.avatarVersion} className="size-24 rounded-[1.4rem] text-2xl shadow-md ring-4 ring-background" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">{self ? "Mon profil" : "Profil"}</p>
          <h1 className="font-display truncate text-4xl font-semibold leading-tight tracking-[-0.02em]">{name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">{role === "joueur" ? <UsersRound className="size-3.5" /> : <Crown className="size-3.5" />}{roleLabels[role]}</span>
            {self && <span className="truncate">{account.email}</span>}
          </p>
        </div>
        {self && <Button type="button" variant="outline" onClick={shell.openAccount} className="self-start sm:self-center"><Settings2 />Réglages du compte</Button>}
      </div>
      <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
        <Stat icon={UsersRound} label={characters.length > 1 ? "personnages" : "personnage"} value={String(characters.length)} color="#927640" />
        <Stat icon={Map} label={campaigns.length + played.length > 1 ? "campagnes" : "campagne"} value={String(campaigns.length + played.length)} color="#397f88" />
        <Stat icon={Trophy} label={obtainedCount !== null && obtainedCount > 1 ? "succès obtenus" : "succès obtenu"} value={obtainedCount === null ? "…" : String(obtainedCount)} color="#b8872a" />
      </div>
    </header>

    <Section title="Personnages" icon={UsersRound} count={characters.length} action={self ? <Button asChild size="sm" variant="outline"><Link href="/creation-de-personnage" prefetch={false}><Plus />Nouveau personnage</Link></Button> : undefined}>
      {characters.length
        ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {characters.map((character) => {
            const accent = character.campaigns[0]?.accentColor || "#927640"
            const summary = summaries[character.id]
            const classLine = summary?.classes ? (summary.level ? `${summary.classes} · rang ${summary.level}` : summary.classes) : character.classes ? (character.level ? `${character.classes} · rang ${character.level}` : character.classes) : ""
            const href = `/personnage/${encodeURIComponent(character.id)}`
            return <CardLink key={character.id} href={canOpenCharacter(character.id) ? href : null} label={character.name} className="group flex flex-col overflow-hidden rounded-2xl border bg-background/40" style={{ borderColor: `${accent}55` }}>
              <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground">
                <CircleUserRound className="size-7 opacity-40" />
                <QuietImage src={`/api/characters/portrait/${encodeURIComponent(character.id)}`} />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="h-1 w-full" style={{ backgroundColor: accent }} />
              <div className="p-3">
                <h3 className="font-display truncate text-base font-semibold">{character.name}</h3>
                <p className="truncate text-xs font-semibold" style={{ color: accent }}>{classLine || (summariesLoaded ? "Classe à choisir" : "…")}</p>
                {/* Le titre honorifique choisi remplace le peuple (jamais la liste brute « ["…"] »). */}
                <p className="min-h-4 truncate text-xs italic text-muted-foreground">{summary?.title || (summariesLoaded ? "" : "…")}</p>
                <div className="mt-1.5 flex min-h-4 flex-wrap gap-x-2 gap-y-0.5">
                  {character.campaigns.length ? character.campaigns.map((campaign) => <span key={campaign.id} className="truncate text-[10px] font-medium" style={{ color: campaign.accentColor }}>{campaign.name}</span>) : <span className="text-[10px] text-muted-foreground/80">Sans campagne</span>}
                </div>
              </div>
            </CardLink>
          })}
        </div>
        : <Empty>{self ? "Aucun personnage pour l’instant." : "Aucun personnage."}</Empty>}
    </Section>

    <Section title="Campagnes" icon={Map} count={campaigns.length + played.length}>
      {campaigns.length + played.length
        ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {campaigns.map((campaign) => <CardLink key={campaign.id} href={canOpenCampaign(campaign.id) ? `/campagne/${encodeURIComponent(campaign.id)}` : null} label={campaign.name} className="group flex flex-col overflow-hidden rounded-2xl border bg-background/40" style={{ borderColor: `${campaign.accentColor}55` }}>
            <div className="relative flex aspect-[16/6] w-full items-center justify-center overflow-hidden bg-muted" style={{ color: campaign.accentColor }}><Map className="size-6 opacity-60" /><QuietImage src={campaign.bannerUrl} /></div>
            <div className="h-1 w-full" style={{ backgroundColor: campaign.accentColor }} />
            <div className="flex flex-1 flex-col p-3.5">
              <div className="flex items-center gap-2"><h3 className="font-display min-w-0 flex-1 truncate text-lg font-semibold" style={{ color: campaign.accentColor }}>{campaign.name}</h3><span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: `${campaign.accentColor}55`, color: campaign.accentColor }}><Crown className="size-3" />MJ</span></div>
              <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{plainText(campaign.description) || "Pas encore de description."}</p>
            </div>
          </CardLink>)}
          {played.map((campaign) => <CardLink key={campaign.id} href={canOpenCampaign(campaign.id) ? `/campagne/${encodeURIComponent(campaign.id)}` : null} label={campaign.name} className="flex flex-col overflow-hidden rounded-2xl border bg-background/40" style={{ borderColor: `${campaign.accentColor}55` }}>
            <div className="flex aspect-[16/6] w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${campaign.accentColor}33, ${campaign.accentColor}0d)`, color: campaign.accentColor }}><Map className="size-6 opacity-60" /></div>
            <div className="h-1 w-full" style={{ backgroundColor: campaign.accentColor }} />
            <div className="flex flex-1 flex-col p-3.5">
              <div className="flex items-center gap-2"><h3 className="font-display min-w-0 flex-1 truncate text-lg font-semibold" style={{ color: campaign.accentColor }}>{campaign.name}</h3><span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: `${campaign.accentColor}55`, color: campaign.accentColor }}><UsersRound className="size-3" />Joueur</span></div>
              <p className="mt-1 truncate text-xs text-muted-foreground">Avec {campaign.characters.join(", ")}</p>
            </div>
          </CardLink>)}
        </div>
        : <Empty>Aucune campagne.</Empty>}
    </Section>

    <Section title="Succès" icon={Trophy} count={obtainedCount ?? undefined} action={<span className="flex items-center gap-2">
      {loading && board && <Sparkles className="size-4 animate-pulse text-muted-foreground" aria-label="Actualisation" />}
    </span>}>
      {board
        ? <div className="grid gap-6">
          {(["Joueur", "MJ"] as AchievementType[]).map((type) => <div key={type}>
            <h3 className={cn("mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[.14em]", type === "MJ" ? "text-[#9a4f2c]" : "text-[#397f88]")}>{type === "MJ" ? <Crown className="size-4" /> : <UsersRound className="size-4" />}Succès {type === "MJ" ? "de MJ" : "de joueur"}<span className="font-normal normal-case tracking-normal text-muted-foreground">· {countOf(type)} obtenu{countOf(type) > 1 ? "s" : ""}</span></h3>
            <AchievementShowcase board={board} types={[type]} />
          </div>)}
        </div>
        : error ? <Empty>{error}</Empty>
          : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl border bg-muted/30" />)}</div>}
    </Section>
  </div>
}
