"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { parseClassChoices, selectedCharacterClasses } from "@/components/eraser/class-progression"
import type { ClassSpell } from "@/lib/class-content"
import {
  ACTIVE_KIND_COLORS, ACTIVE_KIND_LABELS, ACTIVE_KINDS, activeKind, average, CHARGE_BUCKETS, CHARGE_LABELS, chargeBucket,
  countBy, RANGE_BUCKETS, rangeBucket, sharedSpellCount, spellsOfClass, tallySkills,
} from "@/lib/class-stats"
import type { ClassRecord } from "@/lib/google-sheets"

const INK = "#211e1a"
const INK_2 = "#4a433b"
const GRID = "#e6ddcc"
const PRIMARY = "#682522"
const HEAT = ["#f3ece0", "#e8c9b8", "#cf8f77", "#a8503f", "#682522"]

const fmt = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",")
const pct = (part: number, total: number) => total ? Math.round((part / total) * 100) : 0
const shorten = (value: string, size: number) => value.length > size ? `${value.slice(0, size - 1)}…` : value

// ---------- éléments de graphique ----------

function Card({ title, question, wide = false, children }: { title: string; question?: string; wide?: boolean; children: ReactNode }) {
  return <article className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-card/80 p-3 ${wide ? "lg:col-span-2" : ""}`}>
    <div><h4 className="font-display text-base font-semibold leading-tight">{title}</h4>{question && <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{question}</p>}</div>
    {children}
  </article>
}

function Legend({ items }: { items: Array<{ label: string; color?: string; marker?: "dot" | "dash" }> }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
    {items.map((item) => <span key={item.label} className="inline-flex items-center gap-1.5">
      {item.marker === "dot" ? <span className="size-2.5 rounded-full border-2 bg-card" style={{ borderColor: INK }} />
        : item.marker === "dash" ? <span className="w-4 border-t-2 border-dashed" style={{ borderColor: INK }} />
          : <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />}
      {item.label}
    </span>)}
  </div>
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return <div className="rounded-lg border bg-background/50 px-2.5 py-1.5">
    <p className="font-display text-xl font-semibold tabular-nums">{value}</p>
    <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
  </div>
}

/** Barres horizontales ; `marker` = valeur de comparaison (moyenne des autres). */
function BarList({ rows, color, labelWidth = 170, unit = "" }: { rows: Array<{ label: string; value: number; marker?: number; color?: string; tip?: string }>; color: string; labelWidth?: number; unit?: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Aucune donnée.</p>
  const W = 520, R = 40, rowH = 21, H = rows.length * rowH + 4
  const max = Math.max(1, ...rows.map((row) => Math.max(row.value, row.marker ?? 0)))
  const x = (value: number) => labelWidth + (value / max) * (W - labelWidth - R)
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img">
    {rows.map((row, index) => {
      const y = index * rowH + 4
      const end = x(row.value)
      return <g key={`${row.label}:${index}`} className="transition-opacity hover:opacity-80">
        <title>{row.tip ?? `${row.label} : ${fmt(row.value)}${unit}${row.marker !== undefined ? ` · moyenne des autres : ${fmt(row.marker)}${unit}` : ""}`}</title>
        <text x={labelWidth - 8} y={y + 12} textAnchor="end" fontSize={11.5} fill={INK_2}>{shorten(row.label, 26)}</text>
        {row.value > 0 && <rect x={labelWidth} y={y + 2} width={Math.max(2, end - labelWidth)} height={13} rx={3} fill={row.color ?? color} />}
        <text x={end + 6} y={y + 12.5} fontSize={11.5} fontWeight={600} fill={INK}>{fmt(row.value)}{unit}</text>
        {row.marker !== undefined && <circle cx={x(row.marker)} cy={y + 8.5} r={4.5} fill="#faf7ef" stroke={INK} strokeWidth={2} />}
      </g>
    })}
  </svg>
}

/** Colonnes verticales ; `marker` en pointillés = moyenne des autres classes. */
function Columns({ columns, color }: { columns: Array<{ label: string; value: number; marker?: number }>; color: string }) {
  const W = 520, B = 118, T = 16, H = 144
  const max = Math.max(1, ...columns.map((column) => Math.max(column.value, column.marker ?? 0)))
  const step = (W - 16) / columns.length
  const y = (value: number) => B - (value / max) * (B - T)
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img">
    <line x1={8} x2={W - 8} y1={B} y2={B} stroke={GRID} />
    {columns.map((column, index) => {
      const cx = 8 + step * index + step / 2
      const width = Math.min(34, step - 10)
      return <g key={column.label} className="transition-opacity hover:opacity-80">
        <title>{`${column.label} : ${fmt(column.value)}${column.marker !== undefined ? ` · moyenne des autres : ${fmt(column.marker)}` : ""}`}</title>
        {column.value > 0 && <rect x={cx - width / 2} y={y(column.value)} width={width} height={B - y(column.value)} rx={3} fill={color} />}
        {column.value > 0 && <text x={cx} y={y(column.value) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK}>{fmt(column.value)}</text>}
        {column.marker !== undefined && <line x1={cx - width / 2 - 5} x2={cx + width / 2 + 5} y1={y(column.marker)} y2={y(column.marker)} stroke={INK} strokeWidth={2} strokeDasharray="3 3" />}
        <text x={cx} y={B + 16} textAnchor="middle" fontSize={10.5} fill={INK_2}>{shorten(column.label, 12)}</text>
      </g>
    })}
  </svg>
}

/** Barre empilée à 100 % des types d'actifs. */
function KindStack({ label, counts, labelWidth = 150 }: { label: string; counts: Record<string, number>; labelWidth?: number }) {
  const total = ACTIVE_KINDS.reduce((sum, kind) => sum + (counts[kind] || 0), 0)
  const W = 520
  const kinds = ACTIVE_KINDS.filter((kind) => total && counts[kind])
  const widths = kinds.map((kind) => ((counts[kind] || 0) / total) * (W - labelWidth - 4))
  const starts = widths.map((_, index) => labelWidth + widths.slice(0, index).reduce((sum, width) => sum + width, 0))
  return <g>
    <text x={labelWidth - 8} y={15} textAnchor="end" fontSize={11.5} fill={INK_2}>{shorten(label, 22)}</text>
    {kinds.map((kind, index) => {
      const value = counts[kind] || 0
      const x = starts[index]
      const width = widths[index]
      return <g key={kind}>
        <title>{`${label} · ${ACTIVE_KIND_LABELS[kind]} : ${fmt(value)} (${pct(value, total)} %)`}</title>
        <rect x={x + 1} y={2} width={Math.max(1, width - 2)} height={20} rx={3} fill={ACTIVE_KIND_COLORS[kind]} />
        {width > 34 && <text x={x + width / 2} y={16} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">{pct(value, total)} %</text>}
      </g>
    })}
  </g>
}

// ---------- données des fiches ----------

type PlayData = { characters: Array<{ id: string; name: string; classes: string; level: number; choices: string; campaignIds: string[] }>; campaigns: Array<{ id: string; name: string; accentColor: string }> }

async function fetchPlayData() {
  const response = await fetch("/api/classes/play-stats", { cache: "no-store" })
  const payload = await response.json() as PlayData & { error?: string }
  if (!response.ok) throw new Error(payload.error || "Fiches illisibles.")
  return payload
}

/** Les fiches de personnage, lues une seule fois pour tout l'onglet. */
export function useClassPlayData(enabled = true) {
  const [play, setPlay] = useState<PlayData | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!enabled) return
    let active = true
    fetchPlayData().then((data) => { if (active) setPlay(data) }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Fiches illisibles.") })
    return () => { active = false }
  }, [enabled])
  return { play, error }
}
export type ClassPlayState = ReturnType<typeof useClassPlayData>

function startedClasses(classes: ClassRecord[], spells: ClassSpell[]) {
  return classes.filter((item) => spellsOfClass(spells, item.id).length > 0).sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

/** Toutes les classes : vue d'ensemble, puis ce que disent les fiches, toutes classes confondues. */
export function GlobalClassStatistics({ classes, spells, playData }: { classes: ClassRecord[]; spells: ClassSpell[]; playData: ClassPlayState }) {
  const started = useMemo(() => startedClasses(classes, spells), [classes, spells])
  if (!started.length) return null
  return <section className="space-y-6">
    <WholeGame classes={started} spells={spells} />
    <PlayersOverview classes={classes} spells={spells} playData={playData} />
  </section>
}

/** Une classe : comparée aux autres, puis les sorts que les joueurs y choisissent. */
export function ClassStatisticsFor({ characterClass, classes, spells, playData }: { characterClass: ClassRecord; classes: ClassRecord[]; spells: ClassSpell[]; playData: ClassPlayState }) {
  const started = useMemo(() => startedClasses(classes, spells), [classes, spells])
  if (!spellsOfClass(spells, characterClass.id).length) return <p className="rounded-2xl border border-dashed px-5 py-6 text-center text-sm text-muted-foreground">Pas encore de statistiques : cette classe n’a aucun sort.</p>
  const others = started.filter((item) => item.id !== characterClass.id)
  const accent = characterClass.accentDark || PRIMARY
  return <section className="space-y-3">
    <p className="text-xs text-muted-foreground">Comparée à la moyenne des {others.length} autres classes qui ont des sorts. Survole une barre pour le détail.</p>
    <ClassVersusOthers characterClass={characterClass} others={others} spells={spells} accent={accent} />
    <ClassPicks characterClass={characterClass} classes={classes} spells={spells} playData={playData} accent={accent} />
  </section>
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary/75">{eyebrow}</p><h3 className="font-display text-2xl font-semibold">{title}</h3></div>
}

function ClassVersusOthers({ characterClass, others, spells, accent }: { characterClass: ClassRecord; others: ClassRecord[]; spells: ClassSpell[]; accent: string }) {
  const own = spellsOfClass(spells, characterClass.id)
  const actives = own.filter((spell) => spell.category === "actif")
  const otherActives = others.map((item) => spellsOfClass(spells, item.id).filter((spell) => spell.category === "actif"))

  const skills = tallySkills(own).slice(0, 10)
  const otherSkillCounts = others.map((item) => new Map(tallySkills(spellsOfClass(spells, item.id)).map((tally) => [tally.key, tally.count])))
  const kindCounts = countBy(actives, ACTIVE_KINDS, activeKind)
  const kindMean = Object.fromEntries(ACTIVE_KINDS.map((kind) => [kind, average(otherActives.map((items) => countBy(items, ACTIVE_KINDS, activeKind)[kind]))]))
  const charges = countBy(actives, CHARGE_BUCKETS, chargeBucket)
  const chargeMean = Object.fromEntries(CHARGE_BUCKETS.map((bucket) => [bucket, average(otherActives.map((items) => countBy(items, CHARGE_BUCKETS, chargeBucket)[bucket]))]))
  const numericAverage = (items: ClassSpell[]) => average(items.flatMap((spell) => spell.charges !== null && spell.charges > 0 ? [spell.charges] : []))
  const ranges = countBy(actives, RANGE_BUCKETS, rangeBucket)
  const rangeMean = Object.fromEntries(RANGE_BUCKETS.map((bucket) => [bucket, average(otherActives.map((items) => countBy(items, RANGE_BUCKETS, rangeBucket)[bucket]))]))
  const shared = own.filter((spell) => Object.keys(spell.classRanks).length > 1).length
  const partners = others.map((item) => ({ item, count: sharedSpellCount(spells, characterClass.id, item.id) })).filter((row) => row.count > 0).sort((left, right) => right.count - left.count)

  return <div className="space-y-3">
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      <Card title="Compétences utilisées" question="Les compétences que la classe fait lancer, comparées aux autres classes.">
        <Legend items={[{ label: characterClass.name, color: accent }, { label: "Moyenne des autres classes", marker: "dot" }]} />
        <BarList color={accent} rows={skills.map((tally) => ({ label: tally.label, value: tally.count, marker: average(otherSkillCounts.map((counts) => counts.get(tally.key) ?? 0)) }))} />
      </Card>
      <Card title="Types d’actifs" question="Instantanés, actions majeures et mineures : la répartition des actifs.">
        <Legend items={ACTIVE_KINDS.filter((kind) => kindCounts[kind] || kindMean[kind]).map((kind) => ({ label: ACTIVE_KIND_LABELS[kind], color: ACTIVE_KIND_COLORS[kind] }))} />
        <svg viewBox="0 0 520 56" className="w-full" role="img"><KindStack label={characterClass.name} counts={kindCounts} /><g transform="translate(0,30)"><KindStack label="Moyenne des autres" counts={kindMean} /></g></svg>
        <p className="text-xs text-muted-foreground">{actives.length} actifs · {ACTIVE_KINDS.filter((kind) => kindCounts[kind]).map((kind) => `${kindCounts[kind]} ${ACTIVE_KIND_LABELS[kind].toLocaleLowerCase("fr")}`).join(" · ")}</p>
      </Card>
      <Card title="Charges des actifs" question="Combien de fois par combat la classe peut utiliser ses actifs.">
        <div className="grid grid-cols-3 gap-2">
          <Tile value={actives.length} label="actifs" />
          <Tile value={fmt(numericAverage(actives))} label={`charges en moyenne (autres : ${fmt(average(otherActives.map(numericAverage)))})`} />
          <Tile value={charges["✦"]} label="actifs illimités ✦" />
        </div>
        <Legend items={[{ label: characterClass.name, color: accent }, { label: "Moyenne des autres", marker: "dash" }]} />
        <Columns color={accent} columns={CHARGE_BUCKETS.filter((bucket) => charges[bucket] || chargeMean[bucket] >= 0.5).map((bucket) => ({ label: CHARGE_LABELS[bucket], value: charges[bucket], marker: chargeMean[bucket] }))} />
      </Card>
      <Card title="Portée des actifs" question="La classe agit-elle de près ou de loin ?">
        <Legend items={[{ label: characterClass.name, color: accent }, { label: "Moyenne des autres", marker: "dash" }]} />
        <Columns color={accent} columns={RANGE_BUCKETS.filter((bucket) => ranges[bucket] || rangeMean[bucket] >= 0.5).map((bucket) => ({ label: bucket, value: ranges[bucket], marker: rangeMean[bucket] }))} />
      </Card>
      <Card title="Sorts en commun" question="Les sorts que la classe partage, et avec quelles classes." wide>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile value={own.length - shared} label="sorts propres à la classe" />
          <Tile value={`${pct(shared, own.length)} %`} label="de sorts partagés avec une autre classe" />
          <Tile value={partners[0] ? partners[0].item.name : "—"} label="classe la plus proche" />
        </div>
        <BarList color={accent} rows={partners.map(({ item, count }) => ({ label: item.name, value: count, color: item.accentDark, tip: `${count} sort${count > 1 ? "s" : ""} en commun avec ${item.name}` }))} />
      </Card>
    </div>
  </div>
}

function WholeGame({ classes, spells }: { classes: ClassRecord[]; spells: ClassSpell[] }) {
  const linked = spells.filter((spell) => Object.keys(spell.classRanks).length > 0)
  const skills = tallySkills(linked)
  const topSkill = skills[0]
  const matrix = classes.map((row) => classes.map((column) => row.id === column.id ? null : sharedSpellCount(spells, row.id, column.id)))
  const maxShared = Math.max(1, ...matrix.flat().map((value) => value ?? 0))
  const cell = 42, left = 160, top = 118, width = left + classes.length * cell + 80, height = top + classes.length * cell + 4

  return <div className="space-y-3">
    <SectionTitle eyebrow="Toutes les classes" title="Vue d’ensemble" />
    <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Compétences les plus utilisées" question="Toutes classes confondues, sur les sorts liés à une classe.">
        <p className="text-xs text-muted-foreground">{skills.length} compétences différentes{topSkill ? ` · « ${topSkill.label} » couvre ${pct(topSkill.count, linked.length)} % des sorts liés` : ""}.</p>
        <BarList color={PRIMARY} rows={skills.slice(0, 15).map((tally) => ({ label: tally.label, value: tally.count }))} />
      </Card>
      <Card title="Types d’actifs, classe par classe" question="Toutes les classes ont-elles le même mélange d’actifs ?">
        <Legend items={ACTIVE_KINDS.map((kind) => ({ label: ACTIVE_KIND_LABELS[kind], color: ACTIVE_KIND_COLORS[kind] }))} />
        <svg viewBox={`0 0 520 ${classes.length * 28 + 4}`} className="w-full" role="img">
          {classes.map((item, index) => <g key={item.id} transform={`translate(0,${index * 28})`}><KindStack label={item.name} counts={countBy(spellsOfClass(spells, item.id).filter((spell) => spell.category === "actif"), ACTIVE_KINDS, activeKind)} /></g>)}
        </svg>
      </Card>
      <Card title="Carte des sorts partagés" question="Plus la case est foncée, plus les deux classes partagent de sorts." wide>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-3xl" role="img">
            {classes.map((row, rowIndex) => <g key={row.id}>
              <text x={left - 8} y={top + rowIndex * cell + cell / 2 + 4} textAnchor="end" fontSize={11.5} fill={INK_2}>{shorten(row.name, 22)}</text>
              <text transform={`translate(${left + rowIndex * cell + cell / 2},${top - 8}) rotate(-45)`} fontSize={11} fill={INK_2}>{shorten(row.name, 20)}</text>
              {matrix[rowIndex].map((value, columnIndex) => {
                const level = value === null ? 0 : Math.min(4, Math.ceil((value / maxShared) * 4))
                return <g key={classes[columnIndex].id}>
                  <title>{value === null ? row.name : `${row.name} et ${classes[columnIndex].name} : ${value} sort${value > 1 ? "s" : ""} en commun`}</title>
                  <rect x={left + columnIndex * cell + 1} y={top + rowIndex * cell + 1} width={cell - 2} height={cell - 2} rx={4} fill={value === null ? "none" : HEAT[level]} stroke={value === null ? GRID : "none"} />
                  {value ? <text x={left + columnIndex * cell + cell / 2} y={top + rowIndex * cell + cell / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={level >= 3 ? "#fff9ef" : INK}>{value}</text> : null}
                </g>
              })}
            </g>)}
          </svg>
        </div>
      </Card>
    </div>
  </div>
}

function useParsedPlay(play: PlayData | null, classes: ClassRecord[]) {
  return useMemo(() => (play?.characters ?? []).map((character) => ({
    ...character,
    classList: selectedCharacterClasses(character.classes, classes),
    state: parseClassChoices(character.choices),
  })), [classes, play])
}

function PlayStatus({ playData }: { playData: ClassPlayState }) {
  if (playData.error) return <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{playData.error}</p>
  return <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Lecture des fiches de personnage…</p>
}

/** Sorts choisis à chaque rang par les personnages de cette classe. */
function ClassPicks({ characterClass, classes, spells, playData, accent }: { characterClass: ClassRecord; classes: ClassRecord[]; spells: ClassSpell[]; playData: ClassPlayState; accent: string }) {
  const parsed = useParsedPlay(playData.play, classes)
  const withClass = parsed.filter((character) => character.classList.some((item) => item.id === characterClass.id))
  const ownSpells = spellsOfClass(spells, characterClass.id)
  const rankRows = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((rank) => {
    const eligible = withClass.filter((character) => character.level >= rank)
    const options = ownSpells.filter((spell) => spell.classRanks[characterClass.id] === rank)
    if (!eligible.length || !options.length) return []
    const picks = eligible.map((character) => character.state.choices[characterClass.id]?.[String(rank)] ?? "")
    return [{ rank, eligible: eligible.length, options: options.map((spell) => ({ spell, count: picks.filter((id) => id === spell.id).length })), pending: picks.filter((id) => !id).length }]
  })
  return <Card title="Sorts choisis à chaque rang" question={`D’après les fiches : ${withClass.length} personnage${withClass.length > 1 ? "s" : ""} de la classe. Un sort jamais choisi est en rouge.`}>
    {!playData.play ? <PlayStatus playData={playData} /> : rankRows.length ? <div className="grid gap-x-6 lg:grid-cols-2">
      {rankRows.map((row) => <div key={row.rank} className="grid gap-1.5 border-t py-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
        <div><p className="text-sm font-semibold">Rang {row.rank}</p><p className="text-[10px] text-muted-foreground">{row.eligible} perso.{row.pending ? ` · ${row.pending} sans choix` : ""}</p></div>
        <div className="grid gap-1">{row.options.map(({ spell, count }) => <div key={spell.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.75rem] items-center gap-2 text-xs" title={`${spell.name} : ${count} sur ${row.eligible}`}>
          <span className="truncate">{spell.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${pct(count, row.eligible)}%`, backgroundColor: accent }} /></span>
          <span className={`text-right tabular-nums ${count === 0 ? "text-destructive" : "text-muted-foreground"}`}>{pct(count, row.eligible)} %</span>
        </div>)}</div>
      </div>)}
    </div> : <p className="text-sm text-muted-foreground">Aucun personnage n’a encore la classe {characterClass.name}.</p>}
  </Card>
}

/** Ce que disent les fiches, toutes classes confondues : classes jouées, rangs, charges. */
function PlayersOverview({ classes, spells, playData }: { classes: ClassRecord[]; spells: ClassSpell[]; playData: ClassPlayState }) {
  const parsed = useParsedPlay(playData.play, classes)
  const play = playData.play
  if (!play) return <div className="space-y-3"><SectionTitle eyebrow="Les joueurs" title="Ce que disent les fiches" /><PlayStatus playData={playData} /></div>
  // Classes et rangs joués.
  const playedCounts = classes.map((item) => ({ item, count: parsed.filter((character) => character.classList.some((entry) => entry.id === item.id)).length })).filter((row) => row.count > 0).sort((left, right) => right.count - left.count)
  const neverPlayed = classes.filter((item) => !playedCounts.some((row) => row.item.id === item.id) && spellsOfClass(spells, item.id).length > 0)
  const levels = Array.from({ length: 21 }, (_, level) => ({ label: level ? String(level) : "0", value: parsed.filter((character) => character.level === level).length }))
  const campaigns = play.campaigns.map((campaign) => {
    const members = parsed.filter((character) => character.campaignIds.includes(campaign.id))
    return { campaign, members: members.length, average: average(members.map((character) => character.level)) }
  }).filter((row) => row.members > 0).sort((left, right) => right.members - left.members)

  // Charges entamées : charges maximales du sort (ou de sa version personnelle) moins charges restantes.
  const spellById = new Map(spells.map((spell) => [spell.id, spell]))
  const spent = new Map<string, { spell: ClassSpell; spent: number; characters: number; empty: number }>()
  let charactersUsing = 0
  for (const character of parsed) {
    let used = false
    for (const [spellId, remaining] of Object.entries(character.state.charges)) {
      const spell = spellById.get(spellId)
      const max = character.state.edits[spellId]?.charges ?? spell?.charges ?? null
      if (!spell || max === null || !Number.isFinite(remaining)) continue
      const gone = Math.max(0, max - remaining)
      if (!gone) continue
      used = true
      const entry = spent.get(spellId) ?? { spell, spent: 0, characters: 0, empty: 0 }
      entry.spent += gone
      entry.characters += 1
      if (remaining <= 0) entry.empty += 1
      spent.set(spellId, entry)
    }
    if (used) charactersUsing += 1
  }
  const spentRows = [...spent.values()].sort((left, right) => right.spent - left.spent)

  return <div className="space-y-3">
    <SectionTitle eyebrow="Les joueurs" title="Ce que disent les fiches" />
    <p className="text-xs text-muted-foreground">{parsed.length} personnage{parsed.length > 1 ? "s" : ""} lus dans Google Sheets (hors corbeille).</p>
    <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Classes jouées" question="Combien de personnages par classe (un personnage multiclasse compte pour chaque classe).">
        <BarList color={PRIMARY} rows={playedCounts.map(({ item, count }) => ({ label: item.name, value: count, color: item.accentDark }))} />
        {neverPlayed.length > 0 && <p className="text-xs text-muted-foreground">Jamais choisies : {neverPlayed.map((item) => item.name).join(", ")}.</p>}
      </Card>
      <Card title="Rangs des personnages" question="À quel rang en sont les personnages, et par campagne.">
        <Columns color={PRIMARY} columns={levels} />
        {campaigns.length > 0 && <table className="w-full text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1 font-semibold">Campagne</th><th className="py-1 text-right font-semibold">Personnages</th><th className="py-1 text-right font-semibold">Rang moyen</th></tr></thead>
          <tbody className="divide-y">{campaigns.map((row) => <tr key={row.campaign.id}><td className="py-1.5"><span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: row.campaign.accentColor }} />{row.campaign.name}</td><td className="py-1.5 text-right tabular-nums">{row.members}</td><td className="py-1.5 text-right tabular-nums">{fmt(row.average)}</td></tr>)}</tbody></table>}
      </Card>
      <Card title="Charges dépensées en jeu" question="D’après les charges cochées en ce moment sur les fiches (un instantané, pas un historique)." wide>
        <div className="grid grid-cols-3 gap-2">
          <Tile value={charactersUsing} label="personnages avec des charges entamées" />
          <Tile value={spentRows.reduce((total, row) => total + row.spent, 0)} label="charges dépensées au total" />
          <Tile value={spentRows.reduce((total, row) => total + row.empty, 0)} label="sorts à court de charges" />
        </div>
        {spentRows.length ? <BarList color={PRIMARY} rows={spentRows.slice(0, 12).map((row) => ({ label: row.spell.name, value: row.spent, tip: `${row.spell.name} : ${row.spent} charge${row.spent > 1 ? "s" : ""} dépensée${row.spent > 1 ? "s" : ""} par ${row.characters} personnage${row.characters > 1 ? "s" : ""}` }))} /> : <p className="text-sm text-muted-foreground">Aucune charge n’est entamée sur les fiches pour l’instant.</p>}
      </Card>
    </div>
  </div>
}

