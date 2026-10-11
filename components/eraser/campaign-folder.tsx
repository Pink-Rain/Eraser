"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, HeartPulse, PackageOpen, Skull, UsersRound, X } from "lucide-react"

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
}

export type FolderNpc = { id: string; name: string; portrait: string; subtitle: string; currentHp: number; totalHp: number }
export type MetNpc = { id: string; name: string; portrait: string; subtitle: string; attitude: "ami" | "neutre" | "hostile" }

const number = (value: number, digits = 1) => value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
const known = (values: Array<number | null>) => values.filter((value): value is number => value !== null && Number.isFinite(value))
const average = (values: Array<number | null>) => { const list = known(values); return list.length ? list.reduce((total, value) => total + value, 0) / list.length : null }
const sum = (values: Array<number | null>) => { const list = known(values); return list.length ? list.reduce((total, value) => total + value, 0) : null }
const shown = (value: number | null, digits = 1) => value === null ? "—" : number(value, digits)

type SortKey = "name" | "hp" | "states" | "level" | "achievements" | "falls" | "items" | "or" | "cuivre" | "orNoir"

const sortValue: Record<SortKey, (member: FolderMember) => number | string | null> = {
  name: (member) => member.name,
  hp: (member) => member.currentHp,
  states: (member) => member.states.length,
  level: (member) => member.level,
  achievements: (member) => member.achievements,
  falls: (member) => member.falls,
  items: (member) => member.items,
  or: (member) => member.purse?.or ?? null,
  cuivre: (member) => member.purse?.cuivre ?? null,
  orNoir: (member) => member.purse?.orNoir ?? null,
}

function Portrait({ src, name, round = true }: { src: string; name: string; round?: boolean }) {
  return <span className={`flex size-9 shrink-0 items-center justify-center overflow-hidden bg-muted text-sm font-semibold text-muted-foreground ${round ? "rounded-full" : "rounded-lg"}`}>
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

/**
 * Le groupe, personnage par personnage : vie, états, classe et rang, succès, chutes et
 * retours, objets reçus et bourse. Chaque colonne se trie ; sous le tableau, la moyenne et
 * la somme du groupe pour chaque colonne.
 */
export function CampaignGroupTable({ members }: { members: FolderMember[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
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

  const header = (key: SortKey, label: string, align: "left" | "right" = "left") => {
    const active = sort?.key === key
    const next = () => setSort(!active ? { key, direction: key === "name" ? 1 : -1 } : sort!.direction === (key === "name" ? 1 : -1) ? { key, direction: key === "name" ? -1 : 1 } : null)
    return <th scope="col" aria-sort={active ? (sort!.direction === 1 ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}{active ? (sort!.direction === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button>
    </th>
  }

  const money = (key: "or" | "cuivre" | "orNoir") => members.map((member) => member.purse?.[key] ?? null)
  const footer = [
    { label: "Moyenne du groupe", reduce: average },
    { label: "Somme du groupe", reduce: sum },
  ] as const

  if (!members.length) return <p className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">Aucun personnage dans cette campagne pour l’instant.</p>

  return <div className="grid gap-3">
    <div className="overflow-x-auto rounded-2xl border bg-card/85 shadow-[0_12px_35px_rgb(67_50_31/0.07)]">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            {header("name", "Personnage")}
            {header("hp", "PV")}
            {header("states", "États")}
            {header("level", "Classe · rang")}
            {header("achievements", "Succès", "right")}
            {header("falls", "Chutes / retours")}
            {header("items", "Objets reçus")}
            {header("or", "Or", "right")}
            {header("cuivre", "Cuivre", "right")}
            {header("orNoir", "Or noir", "right")}
          </tr>
        </thead>
        <tbody>
          {rows.map((member) => <tr key={member.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/25">
            <th scope="row" className="sticky left-0 bg-card px-3 py-2.5 text-left font-normal">
              <Link href={`/personnage/${encodeURIComponent(member.id)}`} prefetch={false} className="flex items-center gap-2.5 rounded-lg hover:text-primary">
                <Portrait src={member.portrait} name={member.name} />
                <span className="min-w-0"><span className="block truncate font-display font-semibold">{member.name}</span>{member.playerName && <span className="block truncate text-xs text-muted-foreground">{member.playerName}</span>}</span>
              </Link>
            </th>
            <td className="px-3 py-2.5"><HpBar current={member.currentHp} total={member.totalHp} life={member.life} /></td>
            <td className="px-3 py-2.5">{member.states.length ? <span className="flex flex-wrap gap-1">{member.states.map((state) => <span key={state.name} className="whitespace-nowrap rounded-full border bg-background/60 px-2 py-0.5 text-[11px]">{state.name}{state.level === 2 ? " II" : ""}</span>)}</span> : <span className="text-muted-foreground">—</span>}</td>
            <td className="px-3 py-2.5 text-xs"><span className="block">{member.classes || "—"}</span>{member.level !== null && <span className="text-muted-foreground">Rang {member.level}</span>}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{shown(member.achievements, 0)}</td>
            <td className="px-3 py-2.5 text-xs tabular-nums">{member.falls === null ? <span className="text-muted-foreground">—</span> : <><span className="font-semibold">{member.falls} chute{member.falls > 1 ? "s" : ""}</span><span className="block text-muted-foreground">{member.returns} retour{(member.returns ?? 0) > 1 ? "s" : ""}</span></>}</td>
            <td className="px-3 py-2.5 text-xs tabular-nums">{member.items === null ? <span className="text-muted-foreground">—</span> : <button type="button" disabled={!member.items} onClick={() => setOpen(open === member.id ? null : member.id)} aria-expanded={open === member.id} className="inline-flex items-center gap-1.5 rounded-lg border bg-background/60 px-2 py-1 text-left hover:border-primary/40 disabled:cursor-default disabled:opacity-70">
              <span><span className="block font-semibold">{member.items} objet{member.items > 1 ? "s" : ""}</span>{(member.rareItems ?? 0) > 0 && <span className="block text-[10px] text-amber-700 dark:text-amber-300">{member.rareItems} rare{(member.rareItems ?? 0) > 1 ? "s" : ""} ou mieux</span>}</span>
              {member.items > 0 && <ChevronDown className={`size-3.5 transition ${open === member.id ? "rotate-180" : ""}`} />}
            </button>}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{member.purse ? <>{number(member.purse.or, 0)} <span className="text-[10px] text-muted-foreground">PO</span></> : "—"}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{member.purse ? <>{number(member.purse.cuivre, 0)} <span className="text-[10px] text-muted-foreground">PC</span></> : "—"}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{member.purse ? <>{number(member.purse.orNoir, 0)} <span className="text-[10px] text-muted-foreground">PN</span></> : "—"}</td>
          </tr>)}
        </tbody>
        <tfoot className="border-t-2 bg-muted/45">
          {footer.map(({ label, reduce }) => {
            const hp = [reduce(members.map((member) => member.currentHp)), reduce(members.map((member) => member.totalHp))]
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
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{states === null ? "—" : `${number(states)} état${states > 1 ? "s" : ""}`}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{level === null ? "—" : `Rang ${number(level)}`}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{shown(achievements)}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{falls === null ? "—" : `${number(falls)} / ${shown(returns)}`}</td>
              <td className="px-3 py-2 text-xs font-semibold tabular-nums">{items === null ? "—" : <>{number(items)}{rare ? <span className="block text-[10px] font-normal text-muted-foreground">{number(rare)} rare(s) ou mieux</span> : null}</>}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{shown(reduce(money("or")))} <span className="text-[10px] font-normal text-muted-foreground">PO</span></td>
              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{shown(reduce(money("cuivre")))} <span className="text-[10px] font-normal text-muted-foreground">PC</span></td>
              <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{shown(reduce(money("orNoir")))} <span className="text-[10px] font-normal text-muted-foreground">PN</span></td>
            </tr>
          })}
        </tfoot>
      </table>
    </div>
    {opened && <div className="rounded-2xl border bg-card/85 p-4" role="region" aria-label={`Objets reçus par ${opened.name}`}>
      <div className="mb-2 flex items-center gap-2"><PackageOpen className="size-4 text-primary" /><h3 className="flex-1 font-display text-lg font-semibold">Objets reçus par {opened.name}</h3><button type="button" onClick={() => setOpen(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fermer"><X className="size-4" /></button></div>
      <ul className="grid gap-1 sm:grid-cols-2">{opened.lastItems.map((item, index) => <li key={`${item.name}:${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm"><span className="truncate">{item.name}</span>{item.rarity && <span className="shrink-0 text-xs text-muted-foreground">{item.rarity}</span>}</li>)}</ul>
      {(opened.items ?? 0) > opened.lastItems.length && <p className="mt-2 text-xs text-muted-foreground">Les {opened.lastItems.length} derniers sur {opened.items}.</p>}
    </div>}
    <p className="text-xs leading-5 text-muted-foreground">PV, états, classe et bourse viennent des fiches et des inventaires ; les succès, du compte du joueur (deux personnages d’un même joueur ont les mêmes). Chutes (la vie tombe à 0 ou moins), retours et objets reçus (ajoutés, achetés ou créés, hors échanges entre personnages) sont notés depuis la version 0.1.1-alpha.188.</p>
  </div>
}

/** Les PNJ qui voyagent avec le groupe (« Dans le groupe joueur »). */
export function GroupNpcsPanel({ npcs }: { npcs: FolderNpc[] }) {
  return <section aria-labelledby="pnjs-groupe" className="rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5">
    <h2 id="pnjs-groupe" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold"><UsersRound className="size-4.5 text-primary" />PNJs du groupe<span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">{npcs.length}</span></h2>
    {npcs.length ? <ul className="grid gap-2">{npcs.map((npc) => <li key={npc.id} className="flex items-center gap-3 rounded-xl bg-muted/35 px-3 py-2">
      <Portrait src={npc.portrait} name={npc.name} round={false} />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{npc.name}</span>{npc.subtitle && <span className="block truncate text-xs text-muted-foreground">{npc.subtitle}</span>}</span>
      {npc.totalHp > 0 && <span className="text-xs tabular-nums text-muted-foreground">{npc.currentHp} / {npc.totalHp} PV</span>}
    </li>)}</ul> : <p className="text-sm text-muted-foreground">Aucun PNJ ne voyage avec le groupe. Coche « Dans le groupe joueur » sur un PNJ de la campagne.</p>}
  </section>
}

const attitudes = [
  { key: "ami", label: "Amis", color: "#2f855a" },
  { key: "neutre", label: "Neutres", color: "#8a8172" },
  { key: "hostile", label: "Hostiles", color: "#b23b35" },
] as const

/** Les PNJ croisés par le groupe, et ce que le groupe pense d'eux (ses relations). */
export function MetNpcsPanel({ npcs }: { npcs: MetNpc[] }) {
  const [filter, setFilter] = useState<MetNpc["attitude"] | null>(null)
  const [all, setAll] = useState(false)
  const counts = attitudes.map((attitude) => ({ ...attitude, count: npcs.filter((npc) => npc.attitude === attitude.key).length }))
  const total = npcs.length
  const radius = 34, circumference = 2 * Math.PI * radius
  // Chaque part commence où finit la précédente.
  const arcs = counts.filter((entry) => entry.count).map((entry, index, list) => ({ ...entry, length: (entry.count / total) * circumference, offset: list.slice(0, index).reduce((before, item) => before + (item.count / total) * circumference, 0) }))
  const list = npcs.filter((npc) => !filter || npc.attitude === filter)
  return <section aria-labelledby="pnjs-rencontres" className="rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5">
    <h2 id="pnjs-rencontres" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold"><UsersRound className="size-4.5 text-primary" />PNJ rencontrés<span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">{total}</span></h2>
    {total ? <>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 90 90" className="size-24 shrink-0" role="img" aria-label={counts.map((entry) => `${entry.count} ${entry.label.toLowerCase()}`).join(", ")}>
          <circle cx="45" cy="45" r={radius} fill="none" stroke="currentColor" className="text-muted" strokeWidth="12" />
          {arcs.map((entry) => <circle key={entry.key} cx="45" cy="45" r={radius} fill="none" stroke={entry.color} strokeWidth="12" strokeDasharray={`${entry.length} ${circumference - entry.length}`} strokeDashoffset={-entry.offset} transform="rotate(-90 45 45)"><title>{`${entry.count} ${entry.label.toLowerCase()}`}</title></circle>)}
          <text x="45" y="49" textAnchor="middle" className="fill-foreground font-display text-[18px] font-semibold">{total}</text>
        </svg>
        <div className="grid flex-1 gap-1">
          {counts.map((entry) => <button key={entry.key} type="button" onClick={() => setFilter(filter === entry.key ? null : entry.key)} aria-pressed={filter === entry.key} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/60 ${filter === entry.key ? "bg-muted" : ""}`}>
            <span className="size-2.5 rounded-sm" style={{ background: entry.color }} /><span className="flex-1 text-left">{entry.label}</span><span className="font-semibold tabular-nums">{entry.count}</span>
          </button>)}
        </div>
      </div>
      <ul className="mt-3 grid gap-1">{(all ? list : list.slice(0, 6)).map((npc) => <li key={npc.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40">
        <Portrait src={npc.portrait} name={npc.name} round={false} />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{npc.name}</span>{npc.subtitle && <span className="block truncate text-xs text-muted-foreground">{npc.subtitle}</span>}</span>
        <span className="size-2 shrink-0 rounded-full" style={{ background: attitudes.find((entry) => entry.key === npc.attitude)!.color }} title={attitudes.find((entry) => entry.key === npc.attitude)!.label} />
      </li>)}</ul>
      {list.length > 6 && <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs font-medium text-primary hover:underline">{all ? "Moins" : `Voir les ${list.length}`}</button>}
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Les PNJ de la campagne passés par une session ou notés dans les relations du groupe. Amis, neutres ou hostiles : la moyenne des relations des personnages.</p>
    </> : <p className="text-sm text-muted-foreground">Aucun PNJ croisé pour l’instant : ceux d’une session ou des relations du groupe apparaîtront ici.</p>}
  </section>
}
