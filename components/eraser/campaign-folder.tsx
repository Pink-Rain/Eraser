"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Crown, Drumstick, HeartPulse, PackageOpen, Shield, Skull, Sparkles, Trophy, UsersRound, X, type LucideIcon } from "lucide-react"

import { RestButton, SatietyBar, sendSatiety } from "@/components/eraser/satiety"
import { applySatietyAction, daysLabel, type SatietyAction } from "@/lib/satiety"

/** Un personnage du groupe, tel que le dossier de campagne le montre. `null` : donnée illisible ou pas encore suivie. */
export type FolderMember = {
  id: string
  name: string
  playerName: string
  portrait: string
  classes: string
  level: number | null
  currentHp: number | null
  totalHp: number | null
  life: "alive" | "down" | "dead"
  states: Array<{ name: string; level: 1 | 2 }>
  achievements: number | null
  falls: number | null
  returns: number | null
  items: number | null
  rareItems: number | null
  lastItems: Array<{ name: string; rarity: string }>
  purse: { or: number; cuivre: number; orNoir: number } | null
  /** La barre de rassasiement et les jours passés dans cette campagne ; `null` : pas lue. */
  satiety: FolderSatiety | null
}

export type FolderSatiety = { charges: number; days: number }

export type FolderNpc = { id: string; name: string; portrait: string; subtitle: string; currentHp: number; totalHp: number; attitude: "ami" | "neutre" | "hostile"; relations: NpcRelation[] }
export type MetNpc = { id: string; name: string; portrait: string; subtitle: string; attitude: "ami" | "neutre" | "hostile"; relations: NpcRelation[] }

const number = (value: number, digits = 1) => value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
const known = (values: Array<number | null>) => values.filter((value): value is number => value !== null && Number.isFinite(value))
const average = (values: Array<number | null>) => { const list = known(values); return list.length ? list.reduce((total, value) => total + value, 0) / list.length : null }
const sum = (values: Array<number | null>) => { const list = known(values); return list.length ? list.reduce((total, value) => total + value, 0) : null }
const shown = (value: number | null, digits = 1) => value === null ? "—" : number(value, digits)

type SortKey = "name" | "hp" | "satiety" | "states" | "level" | "achievements" | "falls" | "items" | "or" | "cuivre" | "orNoir"

const sortValue: Record<SortKey, (member: FolderMember) => number | string | null> = {
  name: (member) => member.name,
  hp: (member) => member.currentHp,
  satiety: (member) => member.satiety?.charges ?? null,
  states: (member) => member.states.length,
  level: (member) => member.level,
  achievements: (member) => member.achievements,
  falls: (member) => member.falls,
  items: (member) => member.items,
  or: (member) => member.purse?.or ?? null,
  cuivre: (member) => member.purse?.cuivre ?? null,
  orNoir: (member) => member.purse?.orNoir ?? null,
}

function Portrait({ src, name, round = true, ring = "" }: { src: string; name: string; round?: boolean; ring?: string }) {
  return <span className={`flex size-9 shrink-0 items-center justify-center overflow-hidden bg-muted text-sm font-semibold text-muted-foreground ${round ? "rounded-full" : "rounded-lg"} ${ring}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src ? <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : name.slice(0, 1).toUpperCase()}
  </span>
}

function HpBar({ current, total, life }: { current: number | null; total: number | null; life: FolderMember["life"] }) {
  if (current === null && total === null) return <span className="text-muted-foreground">—</span>
  const ratio = total && total > 0 && current !== null ? Math.max(0, Math.min(1, current / total)) : 0
  const tone = life === "alive" ? (ratio > 0.5 ? "bg-emerald-600" : ratio > 0.25 ? "bg-amber-500" : "bg-red-600") : "bg-red-700"
  return <span className="grid min-w-24 gap-1">
    <span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
    <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">{shown(current, 0)} / {shown(total, 0)}{life !== "alive" && <span className="inline-flex items-center gap-0.5 rounded-full bg-red-600/12 px-1.5 text-[10px] font-semibold text-red-700 dark:text-red-300">{life === "dead" ? <Skull className="size-3" /> : <HeartPulse className="size-3" />}{life === "dead" ? "mort" : "à terre"}</span>}</span>
  </span>
}

/** Les trois pièces de la bourse : leur teinte colore leur colonne. */
const coins = {
  or: { label: "Or", unit: "PO", color: "#c99a1e", face: "radial-gradient(circle at 35% 30%, #fff1b3, #e2b93b 45%, #9c7212)" },
  cuivre: { label: "Cuivre", unit: "PC", color: "#b5652f", face: "radial-gradient(circle at 35% 30%, #ffd2b0, #c9773f 45%, #7c3f17)" },
  orNoir: { label: "Or noir", unit: "PN", color: "#5b4a6b", face: "radial-gradient(circle at 35% 30%, #b9a6c9, #4b3b58 50%, #1f1726)" },
} as const

function Coin({ kind }: { kind: keyof typeof coins }) {
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]" style={{ background: coins[kind].face }} />
}

/** La ligne du personnage colore son portrait : en forme, à terre ou mort. */
const lifeRing = (member: FolderMember) => {
  if (member.life === "dead") return "ring-2 ring-red-700/70 grayscale"
  if (member.life === "down") return "ring-2 ring-red-500/70"
  const ratio = member.totalHp && member.currentHp !== null ? member.currentHp / member.totalHp : 1
  return ratio > 0.5 ? "ring-2 ring-emerald-600/45" : "ring-2 ring-amber-500/60"
}

// Une ligne sur deux 2 % plus foncée ; la colonne du nom, collée à gauche, suit sa ligne.
const rowTone = "even:bg-[color-mix(in_oklab,var(--card)_98%,black)] hover:bg-[color-mix(in_oklab,var(--card)_93%,var(--muted))]"
const stickyTone = "bg-card [tr:nth-child(even)>&]:bg-[color-mix(in_oklab,var(--card)_98%,black)] [tr:hover>&]:bg-[color-mix(in_oklab,var(--card)_93%,var(--muted))]"

/**
 * Le groupe, personnage par personnage : vie, états, classe et rang, succès, chutes et
 * retours, objets reçus et bourse. Chaque colonne se trie ; sous le tableau, la moyenne et
 * la somme du groupe pour chaque colonne.
 */
export function CampaignGroupTable({ members: initialMembers, campaignId }: { members: FolderMember[]; campaignId: string }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  // La barre de chacun, changée d'abord à l'écran puis enregistrée (remise si le serveur refuse).
  const [satiety, setSatiety] = useState<Record<string, FolderSatiety | null>>(() => Object.fromEntries(initialMembers.map((member) => [member.id, member.satiety])))
  const [satietyMessage, setSatietyMessage] = useState("")
  const members = useMemo(() => initialMembers.map((member) => ({ ...member, satiety: satiety[member.id] ?? member.satiety })), [initialMembers, satiety])
  const tracked = members.filter((member) => member.satiety)

  /** Une nuit, une ellipse ou des charges réglées, pour un personnage ou tout le groupe. */
  async function changeSatiety(ids: string[], action: SatietyAction) {
    const before = satiety
    const step = (current: FolderSatiety) => {
      const next = applySatietyAction({ charges: current.charges, days: { [campaignId]: current.days } }, action)
      return { charges: next.charges, days: next.days[campaignId] ?? 0 }
    }
    setSatiety((all) => ({ ...all, ...Object.fromEntries(ids.flatMap((id) => all[id] ? [[id, step(all[id]!)]] : [])) }))
    setSatietyMessage("")
    try {
      const reply = await sendSatiety({ characterIds: ids, action })
      setSatiety((all) => ({
        ...all,
        ...Object.fromEntries(Object.entries(reply.records).map(([id, record]) => [id, { charges: record.charges, days: record.days[campaignId] ?? 0 }])),
        ...Object.fromEntries(reply.failed.map((id) => [id, before[id] ?? null])),
      }))
      if (reply.failed.length) setSatietyMessage(`Pas enregistré pour ${reply.failed.map((id) => members.find((member) => member.id === id)?.name ?? id).join(", ")}.`)
      else if (ids.length > 1 && action.kind === "rest") setSatietyMessage(`${action.mode === "ellipse" ? "Ellipse faite" : "Nuit passée"} pour ${ids.length} personnages.`)
    } catch (error) {
      setSatiety(before)
      setSatietyMessage(error instanceof Error ? error.message : "La barre de rassasiement n’a pas pu être enregistrée.")
      throw error
    }
  }

  const rows = useMemo(() => {
    if (!sort) return members
    const read = sortValue[sort.key]
    return [...members].sort((left, right) => {
      const a = read(left), b = read(right)
      if (a === null || a === "") return 1
      if (b === null || b === "") return -1
      return (typeof a === "string" ? a.localeCompare(String(b), "fr") : a - Number(b)) * sort.direction
    })
  }, [members, sort])
  const opened = members.find((member) => member.id === open)

  // Le meilleur du groupe dans une colonne (s'il se détache) porte une petite couronne.
  const best = (read: (member: FolderMember) => number | null) => {
    const values = members.map(read).filter((value): value is number => value !== null)
    const top = values.length > 1 ? Math.max(...values) : 0
    return (member: FolderMember) => top > 0 && read(member) === top && values.filter((value) => value === top).length === 1
  }
  const bestAchievements = best((member) => member.achievements)
  const bestItems = best((member) => member.items)
  const bestGold = best((member) => member.purse?.or ?? null)
  const crown = (title: string) => <Crown className="inline size-3 -translate-y-px text-amber-500" aria-label={title}><title>{title}</title></Crown>

  const header = (key: SortKey, label: string, align: "left" | "right" = "left", Icon?: LucideIcon, coin?: keyof typeof coins) => {
    const active = sort?.key === key
    const next = () => setSort(!active ? { key, direction: key === "name" ? 1 : -1 } : sort!.direction === (key === "name" ? 1 : -1) ? { key, direction: key === "name" ? -1 : 1 } : null)
    return <th scope="col" aria-sort={active ? (sort!.direction === 1 ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`} style={coin ? { background: `${coins[coin].color}1f`, boxShadow: `inset 0 -2px 0 ${coins[coin].color}` } : undefined}>
      <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{coin ? <Coin kind={coin} /> : Icon ? <Icon className="size-3.5 text-primary/70" /> : null}{label}{active ? (sort!.direction === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button>
    </th>
  }

  const money = (key: "or" | "cuivre" | "orNoir") => members.map((member) => member.purse?.[key] ?? null)
  const footer = [
    { label: "Moyenne du groupe", reduce: average },
    { label: "Somme du groupe", reduce: sum },
  ] as const

  if (!members.length) return <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Aucun personnage dans cette campagne pour l’instant.</p>

  return <div className="grid gap-3">
    {/* Une nuit ou une ellipse pour tout le groupe d'un coup ; les jours comptent dans cette campagne. */}
    {tracked.length > 0 && <div className="flex flex-wrap items-center gap-2">
      <RestButton label="Nuit ou ellipse pour tout le groupe" title="Tout le groupe" subtitle={`${tracked.length} personnage${tracked.length > 1 ? "s" : ""} · les jours comptent dans cette campagne`} onRest={(rest) => changeSatiety(tracked.map((member) => member.id), { kind: "rest", ...rest, campaignId })} />
      {satietyMessage && <p className="text-xs text-muted-foreground" role="status">{satietyMessage}</p>}
    </div>}
    {!tracked.length && satietyMessage && <p className="text-xs text-muted-foreground" role="status">{satietyMessage}</p>}
    <div className="overflow-x-auto rounded-2xl border bg-card/85 shadow-[0_12px_35px_rgb(67_50_31/0.07)]">
      <table className="w-full min-w-[1120px] border-collapse text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            {header("name", "Personnage", "left", UsersRound)}
            {header("hp", "PV", "left", HeartPulse)}
            {header("satiety", "Rassasiement", "left", Drumstick)}
            {header("states", "États", "left", Sparkles)}
            {header("level", "Classe · rang", "left", Shield)}
            {header("achievements", "Succès", "right", Trophy)}
            {header("falls", "Chutes / retours", "left", Skull)}
            {header("items", "Items reçus", "left", PackageOpen)}
            {header("or", "Or", "right", undefined, "or")}
            {header("cuivre", "Cuivre", "right", undefined, "cuivre")}
            {header("orNoir", "Or noir", "right", undefined, "orNoir")}
          </tr>
        </thead>
        <tbody>
          {rows.map((member) => <tr key={member.id} className={`border-b border-border/60 transition-colors last:border-b-0 ${rowTone}`}>
            <th scope="row" className={`sticky left-0 px-3 py-2.5 text-left font-normal ${stickyTone}`}>
              <Link href={`/personnage/${encodeURIComponent(member.id)}`} prefetch={false} className="flex items-center gap-2.5 rounded-lg hover:text-primary">
                <Portrait src={member.portrait} name={member.name} ring={lifeRing(member)} />
                <span className="min-w-0"><span className="block truncate font-display font-semibold">{member.name}</span>{member.playerName && <span className="block truncate text-xs text-muted-foreground">{member.playerName}</span>}</span>
              </Link>
            </th>
            <td className="px-3 py-2.5"><HpBar current={member.currentHp} total={member.totalHp} life={member.life} /></td>
            <td className="px-3 py-2.5">{member.satiety ? <span className="grid gap-0.5">
              <span className="flex items-center gap-1.5">
                <SatietyBar size="sm" charges={member.satiety.charges} onChange={(value) => void changeSatiety([member.id], { kind: "set", charges: value }).catch(() => {})} />
                <RestButton className="size-6" title={`Nuit ou ellipse · ${member.name}`} preview={member.satiety.charges} onRest={(rest) => changeSatiety([member.id], { kind: "rest", ...rest, campaignId })} />
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{daysLabel(member.satiety.days)}</span>
            </span> : <span className="text-muted-foreground">—</span>}</td>
            <td className="px-3 py-2.5">{member.states.length ? <span className="flex flex-wrap gap-1">{member.states.map((state) => <span key={state.name} className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${state.level === 2 ? "border-rose-500/40 bg-rose-500/15 font-semibold text-rose-800 dark:text-rose-200" : "border-rose-400/25 bg-rose-400/8"}`}>{state.name}{state.level === 2 ? " II" : ""}</span>)}</span> : <span className="text-muted-foreground">—</span>}</td>
            <td className="px-3 py-2.5 text-xs"><span className="block">{member.classes || "—"}</span>{member.level !== null && <span className="text-muted-foreground">Rang {member.level}</span>}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{bestAchievements(member) && <>{crown("Le plus de succès du groupe")} </>}{shown(member.achievements, 0)}</td>
            <td className="px-3 py-2.5 text-xs tabular-nums">{member.falls === null ? <span className="text-muted-foreground">—</span> : <><span className="font-semibold">{member.falls} chute{member.falls > 1 ? "s" : ""}</span><span className="block text-muted-foreground">{member.returns} retour{(member.returns ?? 0) > 1 ? "s" : ""}</span></>}</td>
            <td className="px-3 py-2.5 text-xs tabular-nums">{member.items === null ? <span className="text-muted-foreground">—</span> : <button type="button" disabled={!member.items} onClick={() => setOpen(open === member.id ? null : member.id)} aria-expanded={open === member.id} className="inline-flex items-center gap-1.5 rounded-lg border bg-background/60 px-2 py-1 text-left hover:border-primary/40 disabled:cursor-default disabled:opacity-70">
              <span><span className="block font-semibold">{bestItems(member) && <>{crown("Le plus d’items reçus du groupe")} </>}{member.items} item{member.items > 1 ? "s" : ""}</span>{(member.rareItems ?? 0) > 0 && <span className="block text-[10px] text-amber-700 dark:text-amber-300">{member.rareItems} rare{(member.rareItems ?? 0) > 1 ? "s" : ""} ou mieux</span>}</span>
              {member.items > 0 && <ChevronDown className={`size-3.5 transition ${open === member.id ? "rotate-180" : ""}`} />}
            </button>}</td>
            {(["or", "cuivre", "orNoir"] as const).map((kind) => <td key={kind} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ background: `${coins[kind].color}0f` }}>
              {member.purse ? <span className="font-semibold">{kind === "or" && bestGold(member) && <>{crown("Le plus riche en or du groupe")} </>}{number(member.purse[kind], 0)} <span className="text-[10px] font-normal" style={{ color: coins[kind].color }}>{coins[kind].unit}</span></span> : <span className="text-muted-foreground">—</span>}
            </td>)}
          </tr>)}
        </tbody>
        <tfoot className="border-t-2 bg-muted/45">
          {footer.map(({ label, reduce }) => {
            const hp = [reduce(members.map((member) => member.currentHp)), reduce(members.map((member) => member.totalHp))]
            const charges = reduce(members.map((member) => member.satiety?.charges ?? null))
            const states = reduce(members.map((member) => member.states.length))
            const level = reduce(members.map((member) => member.level))
            const achievements = reduce(members.map((member) => member.achievements))
            const falls = reduce(members.map((member) => member.falls))
            const returns = reduce(members.map((member) => member.returns))
            const items = reduce(members.map((member) => member.items))
            const rare = reduce(members.map((member) => member.rareItems))
            return <tr key={label} className="border-b border-border/50 last:border-b-0">
              <th scope="row" className="sticky left-0 bg-muted px-3 py-2 text-left font-display text-sm font-semibold">{label}<span className="block text-[11px] font-normal text-muted-foreground">{members.length} personnage{members.length > 1 ? "s" : ""}</span></th>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{shown(hp[0])} / {shown(hp[1])}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{charges === null ? "—" : `${number(charges)} charge${charges > 1 ? "s" : ""}`}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{states === null ? "—" : `${number(states)} état${states > 1 ? "s" : ""}`}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{level === null ? "—" : `Rang ${number(level)}`}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{shown(achievements)}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{falls === null ? "—" : `${number(falls)} / ${shown(returns)}`}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{items === null ? "—" : <>{number(items)}{rare ? <span className="block text-[10px] font-normal text-muted-foreground">{number(rare)} rare(s) ou mieux</span> : null}</>}</td>
              {(["or", "cuivre", "orNoir"] as const).map((kind) => <td key={kind} className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ background: `${coins[kind].color}1a` }}>{shown(reduce(money(kind)))} <span className="text-[10px] font-normal" style={{ color: coins[kind].color }}>{coins[kind].unit}</span></td>)}
            </tr>
          })}
        </tfoot>
      </table>
    </div>
    {opened && <div className="rounded-2xl border bg-card/85 p-4" role="region" aria-label={`Items reçus par ${opened.name}`}>
      <div className="mb-2 flex items-center gap-2"><PackageOpen className="size-4 text-primary" /><h3 className="flex-1 font-display text-lg font-semibold">Items reçus par {opened.name}</h3><button type="button" onClick={() => setOpen(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fermer"><X className="size-4" /></button></div>
      <ul className="grid gap-1 sm:grid-cols-2">{opened.lastItems.map((item, index) => <li key={`${item.name}:${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm"><span className="truncate">{item.name}</span>{item.rarity && <span className="shrink-0 text-xs text-muted-foreground">{item.rarity}</span>}</li>)}</ul>
      {(opened.items ?? 0) > opened.lastItems.length && <p className="mt-2 text-xs text-muted-foreground">Les {opened.lastItems.length} derniers sur {opened.items}.</p>}
    </div>}
  </div>
}

/** Un personnage du groupe, tel que le survol d'un PNJ le cite. */
export type FolderCharacter = { id: string; name: string; portrait: string }

/** Ce qu'un personnage pense d'un PNJ : de -3 à +3, `null` sans relation notée. */
export type NpcRelation = { characterId: string; level: number | null }

type Attitude = "ami" | "neutre" | "hostile"

const attitudes = [
  { key: "ami", label: "Amis", color: "#2f855a" },
  { key: "neutre", label: "Neutres", color: "#8a8172" },
  { key: "hostile", label: "Hostiles", color: "#b23b35" },
] as const

/** Le niveau d'une relation, comme dans le journal des relations de la fiche. */
function relationBadge(level: number | null) {
  if (level === null) return { text: "–", title: "Aucune relation notée", className: "bg-muted text-muted-foreground" }
  if (level > 0) return { text: `+${level}`, title: `Allié·e (niveau ${level})`, className: "bg-[#648f4e]/15 text-[#4b6f39] dark:text-[#a6cf8f]" }
  if (level < 0) return { text: String(level), title: `Ennemi·e (niveau ${-level})`, className: "bg-[#b9504e]/15 text-[#9a3c3a] dark:text-[#ef9a97]" }
  return { text: "0", title: "Connaissance", className: "bg-[#b48745]/15 text-[#8a6430] dark:text-[#e3bd84]" }
}

/**
 * Un anneau amis / neutres / hostiles. Survoler (ou toucher) une part ou une ligne de la
 * légende montre ses PNJ : portrait, nom, et la relation de chaque personnage du groupe.
 */
function NpcRelationsRing<T extends { id: string; name: string; portrait: string; subtitle: string; attitude: Attitude; relations: NpcRelation[] }>({ npcs, characters, extra }: {
  npcs: T[]
  characters: FolderCharacter[]
  /** Ce que la carte d'un PNJ montre en plus (ses PV pour un PNJ du groupe). */
  extra?: (npc: T) => ReactNode
}) {
  const [hovered, setHovered] = useState<Attitude | null>(null)
  const [pinned, setPinned] = useState<Attitude | null>(null)
  const shown = hovered ?? pinned
  const counts = attitudes.map((attitude) => ({ ...attitude, count: npcs.filter((npc) => npc.attitude === attitude.key).length }))
  const total = npcs.length
  const radius = 34, circumference = 2 * Math.PI * radius
  // Chaque part commence où finit la précédente.
  const arcs = counts.filter((entry) => entry.count).map((entry, index, list) => ({ ...entry, length: (entry.count / total) * circumference, offset: list.slice(0, index).reduce((before, item) => before + (item.count / total) * circumference, 0) }))
  const list = shown ? npcs.filter((npc) => npc.attitude === shown) : []
  const current = attitudes.find((entry) => entry.key === shown)
  const byId = new globalThis.Map(characters.map((character) => [character.id, character]))
  return <div onMouseLeave={() => setHovered(null)}>
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 90 90" className="size-24 shrink-0" role="img" aria-label={counts.map((entry) => `${entry.count} ${entry.label.toLowerCase()}`).join(", ")}>
        <circle cx="45" cy="45" r={radius} fill="none" stroke="currentColor" className="text-muted" strokeWidth="12" />
        {arcs.map((entry) => <circle key={entry.key} cx="45" cy="45" r={radius} fill="none" stroke={entry.color} strokeWidth={shown === entry.key ? 15 : 12} strokeDasharray={`${entry.length} ${circumference - entry.length}`} strokeDashoffset={-entry.offset} transform="rotate(-90 45 45)" className="cursor-pointer transition-[stroke-width]" onMouseEnter={() => setHovered(entry.key)} onClick={() => setPinned(pinned === entry.key ? null : entry.key)}><title>{`${entry.count} ${entry.label.toLowerCase()}`}</title></circle>)}
        <text x="45" y="49" textAnchor="middle" className="pointer-events-none fill-foreground font-display text-[18px] font-semibold">{total}</text>
      </svg>
      <div className="grid flex-1 gap-1">
        {counts.map((entry) => <button key={entry.key} type="button" disabled={!entry.count} onMouseEnter={() => entry.count && setHovered(entry.key)} onFocus={() => entry.count && setHovered(entry.key)} onClick={() => setPinned(pinned === entry.key ? null : entry.key)} aria-pressed={pinned === entry.key} aria-expanded={shown === entry.key} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition hover:bg-muted/60 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${shown === entry.key ? "bg-muted" : ""}`}>
          <span className="size-2.5 rounded-sm" style={{ background: entry.color }} /><span className="flex-1 text-left">{entry.label}</span><span className="font-semibold tabular-nums">{entry.count}</span>
        </button>)}
      </div>
    </div>
    {current && list.length > 0 && <div className="mt-3 rounded-xl border bg-background/80 p-2 shadow-[0_10px_28px_rgb(67_50_31/0.12)]" style={{ borderColor: `${current.color}55` }} role="region" aria-label={`PNJ ${current.label.toLowerCase()}`}>
      <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: current.color }}>{current.label}<span className="font-normal text-muted-foreground normal-case tracking-normal">· relation de chaque personnage</span></p>
      <ul className="grid max-h-80 gap-1 overflow-y-auto">{list.map((npc) => <li key={npc.id} className="grid gap-1.5 rounded-lg px-1.5 py-1.5 odd:bg-muted/30">
        <span className="flex items-center gap-2.5">
          <Portrait src={npc.portrait} name={npc.name} round={false} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{npc.name}</span>{npc.subtitle && <span className="block truncate text-xs text-muted-foreground">{npc.subtitle}</span>}</span>
          {extra?.(npc)}
        </span>
        {npc.relations.length > 0 && <span className="flex flex-wrap gap-1 pl-11">{npc.relations.map((relation) => {
          const character = byId.get(relation.characterId)
          const badge = relationBadge(relation.level)
          return character ? <span key={relation.characterId} title={`${character.name} : ${badge.title}`} className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pl-0.5 pr-1.5 text-[11px]">
            <span className="flex size-4 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {character.portrait ? <img src={character.portrait} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : character.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-24 truncate">{character.name.split(/\s+/)[0]}</span>
            <span className={`rounded-full px-1 font-semibold tabular-nums ${badge.className}`}>{badge.text}</span>
          </span> : null
        })}</span>}
      </li>)}</ul>
    </div>}
  </div>
}

/** Les PNJ qui voyagent avec le groupe (« Dans le groupe joueur »), et ce que le groupe pense d'eux. */
export function GroupNpcsPanel({ npcs, characters }: { npcs: FolderNpc[]; characters: FolderCharacter[] }) {
  return <section aria-labelledby="pnjs-groupe" className="rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5">
    <h2 id="pnjs-groupe" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold"><UsersRound className="size-4.5 text-primary" />PNJs du groupe<span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">{npcs.length}</span></h2>
    {npcs.length
      ? <NpcRelationsRing npcs={npcs} characters={characters} extra={(npc) => npc.totalHp > 0 ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{npc.currentHp} / {npc.totalHp} PV</span> : null} />
      : <p className="text-sm text-muted-foreground">Aucun PNJ ne voyage avec le groupe. Coche « Dans le groupe joueur » sur un PNJ de la campagne.</p>}
  </section>
}

/** Les PNJ croisés par le groupe, et ce que le groupe pense d'eux (ses relations). */
export function MetNpcsPanel({ npcs, characters }: { npcs: MetNpc[]; characters: FolderCharacter[] }) {
  return <section aria-labelledby="pnjs-rencontres" className="rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5">
    <h2 id="pnjs-rencontres" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold"><UsersRound className="size-4.5 text-primary" />PNJ rencontrés<span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">{npcs.length}</span></h2>
    {npcs.length
      ? <NpcRelationsRing npcs={npcs} characters={characters} />
      : <p className="text-sm text-muted-foreground">Aucun PNJ croisé pour l’instant : ceux d’une session ou des relations du groupe apparaîtront ici.</p>}
  </section>
}
