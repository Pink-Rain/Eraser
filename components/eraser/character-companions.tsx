"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Backpack, ChevronDown, Heart, LoaderCircle, PawPrint, Plus, Search, Sparkles, Trash2, UserRound, X, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CharacterInventory } from "@/components/eraser/character-inventory"
import { IndexRichText } from "@/components/eraser/index-references"
import { InlineEdit } from "@/components/eraser/inline-edit"
import { SpellPicker, useSpellOptions, type SpellOption } from "@/components/eraser/spell-picker"
import { characteristicColor, characteristicOrder, npcCharacteristicKeys } from "@/lib/characteristics"
import {
  creatureCompanionFrom,
  type Companion,
  type CompanionStats,
  type CreatureCandidate,
  type CreatureCompanion,
  type NpcCandidate,
  type SpellCharges,
} from "@/lib/companions"
import { isImageSource } from "@/lib/index-columns"
import { evaluateRelativeExpression } from "@/lib/math-expression"
import type { CampaignNpcRecord } from "@/lib/shop-schema"

const creatureColor = "#7f9a5a"
const npcColor = "#8a7bb8"

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()
}

/** « 12 », « +5 », « -3 », « *2 » : une valeur, ou un changement de la valeur actuelle. */
function nextNumber(typed: string, current: number) {
  try { return Math.round(evaluateRelativeExpression(typed, current) * 100) / 100 } catch { return current }
}

/** Les fiches des PNJ compagnons, lues (et enregistrées) dans la feuille « PNJs ». */
function useCompanionNpcs(characterId: string, npcIds: string[]) {
  const [npcs, setNpcs] = useState<Record<string, CampaignNpcRecord>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const key = [...npcIds].sort().join(",")
  useEffect(() => {
    if (!key) return
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetch(`/api/characters/${encodeURIComponent(characterId)}/companions?npcs=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as { npcs?: CampaignNpcRecord[]; error?: string }
          if (!active) return
          if (!response.ok) { setError(payload.error || "Les PNJ compagnons n’ont pas pu être chargés."); return }
          setError("")
          setNpcs((current) => ({ ...current, ...Object.fromEntries((payload.npcs ?? []).map((npc) => [npc.id, npc])) }))
        })
        .catch(() => { if (active) setError("Les PNJ compagnons n’ont pas pu être chargés.") })
        .finally(() => { if (active) setLoading(false) })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [characterId, key])

  async function save(npcId: string, changes: Partial<CampaignNpcRecord>) {
    const before = npcs[npcId]
    if (!before) return
    // La fiche change tout de suite ; un refus la remet comme avant.
    setNpcs((current) => ({ ...current, [npcId]: { ...current[npcId], ...changes } }))
    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/companions`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save-npc", npcId, changes }),
      })
      const payload = (await response.json().catch(() => ({}))) as { npc?: CampaignNpcRecord; error?: string }
      if (!response.ok || !payload.npc) throw new Error(payload.error || "Le PNJ n’a pas pu être enregistré.")
      setNpcs((current) => ({ ...current, [npcId]: payload.npc! }))
      setError("")
    } catch (failure) {
      setNpcs((current) => ({ ...current, [npcId]: before }))
      setError(failure instanceof Error ? failure.message : "Le PNJ n’a pas pu être enregistré.")
    }
  }

  return { npcs, loading, error, save }
}

/** Les PNJ et créatures que l'onglet peut ajouter, lus une fois, à la première recherche. */
function useCompanionCandidates(characterId: string, wanted: boolean) {
  const [candidates, setCandidates] = useState<{ npcs: NpcCandidate[]; creatures: CreatureCandidate[] } | null>(null)
  const [error, setError] = useState("")
  const requested = useRef(false)
  useEffect(() => {
    if (!wanted || requested.current) return
    requested.current = true
    fetch(`/api/characters/${encodeURIComponent(characterId)}/companions?candidates=1`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { npcs?: NpcCandidate[]; creatures?: CreatureCandidate[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "")
        setCandidates({ npcs: payload.npcs ?? [], creatures: payload.creatures ?? [] })
      })
      .catch((failure) => { requested.current = false; setError(failure instanceof Error && failure.message ? failure.message : "La recherche n’a pas pu être chargée.") })
  }, [characterId, wanted])
  return { candidates, error }
}

type Pick = { kind: "npc"; npc: NpcCandidate } | { kind: "creature"; creature: CreatureCandidate }

/**
 * La barre de recherche de l'onglet : les PNJ des campagnes du personnage et les créatures de
 * l'Index des créatures. Une créature choisie reçoit d'abord un nom.
 */
function CompanionSearch({ characterId, companions, onAdd }: { characterId: string; companions: Companion[]; onAdd: (pick: Pick, name: string) => void }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState<CreatureCandidate | null>(null)
  const [name, setName] = useState("")
  const { candidates, error } = useCompanionCandidates(characterId, open)
  const taken = new Set(companions.flatMap((companion) => companion.kind === "npc" ? [companion.npcId] : []))
  const folded = fold(query)
  const matches = (...texts: string[]) => !folded || texts.some((value) => fold(value).includes(folded))
  const npcs = (candidates?.npcs ?? []).filter((npc) => !taken.has(npc.id) && matches(npc.name, npc.title, npc.occupation, npc.campaignName)).slice(0, 8)
  const creatures = (candidates?.creatures ?? []).filter((creature) => matches(creature.sourceName, creature.creatureType, creature.rank)).slice(0, 12)

  function choose(pick: Pick) {
    setOpen(false)
    setQuery("")
    if (pick.kind === "npc") { onAdd(pick, ""); return }
    setNaming(pick.creature)
    setName("")
  }

  function confirmName() {
    if (!naming) return
    onAdd({ kind: "creature", creature: naming }, name)
    setNaming(null)
  }

  if (naming) return <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/80 p-3 shadow-sm" style={{ borderColor: `${creatureColor}66` }}>
    <PawPrint className="size-4" style={{ color: creatureColor }} />
    <span className="text-sm">Quel nom donner à ton <span className="font-semibold">{naming.sourceName}</span> ?</span>
    <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmName(); if (event.key === "Escape") setNaming(null) }} placeholder={naming.sourceName} maxLength={200} className="h-9 min-w-48 flex-1" />
    <Button type="button" onClick={confirmName}><Plus />Ajouter le compagnon</Button>
    <Button type="button" variant="ghost" onClick={() => setNaming(null)}>Annuler</Button>
  </div>

  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false) }} placeholder="Ajouter un compagnon : un PNJ de la campagne ou une créature…" className="h-11 rounded-xl pl-9" aria-label="Chercher un PNJ ou une créature" />
    </div>
    {open && <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-96 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-2xl">
      {!candidates && !error && <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Recherche des PNJ et des créatures…</div>}
      {error && <p className="px-3 py-3 text-sm text-destructive">{error}</p>}
      {candidates && <>
        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.16em]" style={{ color: npcColor }}>PNJ de tes campagnes</p>
        {npcs.length ? npcs.map((npc) => <button key={npc.id} type="button" onClick={() => choose({ kind: "npc", npc })} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
          <Avatar src={npc.portrait} color={npcColor} fallback={<UserRound className="size-4" />} size="size-8" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{npc.name}</span><span className="block truncate text-xs text-muted-foreground">{[npc.title, npc.occupation, npc.campaignName].filter(Boolean).join(" · ")}</span></span>
        </button>) : <p className="px-2 py-1.5 text-xs text-muted-foreground">{folded ? "Aucun PNJ ne correspond." : "Aucun PNJ disponible dans tes campagnes."}</p>}
        <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.16em]" style={{ color: creatureColor }}>Créatures</p>
        {creatures.length ? creatures.map((creature, index) => <button key={`${creature.sourceId || creature.sourceName}:${index}`} type="button" onClick={() => choose({ kind: "creature", creature })} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
          <Avatar src={creature.portrait} color={creatureColor} fallback={<PawPrint className="size-4" />} size="size-8" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{creature.sourceName}</span><span className="block truncate text-xs text-muted-foreground">{[creature.creatureType, creature.rank && `Rang ${creature.rank}`].filter(Boolean).join(" · ")}</span></span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground"><Heart className="mr-1 inline size-3" />{creature.totalHp}</span>
        </button>) : <p className="px-2 py-1.5 text-xs text-muted-foreground">{folded ? "Aucune créature ne correspond." : "L’Index des créatures est vide."}</p>}
      </>}
    </div>}
  </div>
}

function Avatar({ src, color, fallback, size = "size-14" }: { src: string; color: string; fallback: ReactNode; size?: string }) {
  return <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full border-2`} style={{ borderColor: `${color}88`, backgroundColor: `${color}22`, color }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {isImageSource(src) ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : fallback}
  </span>
}

type SheetFields = CompanionStats & { notes: string; activeSpells: string; passiveSpells: string }

/**
 * La mini-fiche d'un compagnon, la même pour un PNJ et une créature : vie, caractéristiques,
 * sorts, notes et sac à dos. Chaque case s'enregistre en la quittant.
 */
function CompanionSheet({ characterId, companionId, color, kindLabel, name, subtitle, portrait, fields, description, spells, onName, onChange, onRemove, nameHint, charges, onCharge }: {
  characterId: string
  /** Les sorts que ce compagnon peut prendre (`options`), et tous ceux dont on sait montrer la fiche (`known`). */
  spells: { options: SpellOption[]; known: SpellOption[]; loading: boolean }
  companionId: string
  color: string
  kindLabel: string
  name: string
  subtitle: string
  portrait: string
  fields: SheetFields
  description?: string
  /** Absent : le nom n'est pas modifiable ici (celui d'un PNJ appartient au MJ). */
  onName?: (name: string) => Promise<void>
  nameHint?: string
  onChange: (changes: Partial<SheetFields>) => Promise<void>
  onRemove: () => void
  /** Les charges restantes de ses sorts actifs, cliquables. */
  charges?: SpellCharges
  onCharge: (spellKey: string, value: number) => void
}) {
  const [backpackOpen, setBackpackOpen] = useState(false)
  const [backpackMounted, setBackpackMounted] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const ratio = fields.totalHp > 0 ? Math.max(0, Math.min(100, (fields.currentHp / fields.totalHp) * 100)) : 0
  const lifeColor = "#6e9ee8"
  const commitNumber = (key: keyof CompanionStats) => (typed: string) => onChange({ [key]: nextNumber(typed, fields[key]) })

  return <article className="overflow-hidden rounded-2xl border bg-card/80 shadow-sm" style={{ borderColor: `${color}55` }}>
    <header className="flex items-start gap-4 px-4 py-4 sm:px-5" style={{ background: `linear-gradient(135deg, ${color}26, transparent 70%)` }}>
      <Avatar src={portrait} color={color} fallback={kindLabel === "PNJ" ? <UserRound className="size-6" /> : <PawPrint className="size-6" />} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color }}>{kindLabel}</p>
        {onName
          ? <InlineEdit label={`Nom de ${name}`} value={name} onCommit={(value) => value.trim() ? onName(value.trim()) : Promise.resolve()}><h3 className="truncate font-display text-2xl font-semibold" title={nameHint}>{name}</h3></InlineEdit>
          : <h3 className="truncate font-display text-2xl font-semibold" title={nameHint}>{name}</h3>}
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {confirmRemove
        ? <div className="flex shrink-0 items-center gap-1 text-xs"><span className="text-muted-foreground">Retirer ?</span><Button type="button" size="sm" variant="destructive" onClick={onRemove}>Retirer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Non</Button></div>
        : <button type="button" onClick={() => setConfirmRemove(true)} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Retirer ${name} des compagnons`} title="Retirer des compagnons"><Trash2 className="size-4" /></button>}
    </header>

    <div className="grid gap-3 px-4 pb-4 sm:px-5">
      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: `${lifeColor}16`, borderTop: `2px solid ${lifeColor}` }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Points de vie</p>
          <div className="flex items-baseline gap-2 text-xl font-semibold tabular-nums" style={{ color: lifeColor }} title="Une valeur, ou +5, -3, *2…">
            <InlineEdit compact singleClick label={`Vie actuelle de ${name}`} value={String(fields.currentHp)} onCommit={commitNumber("currentHp")}><span>{fields.currentHp}</span></InlineEdit>
            <span className="text-sm font-normal text-muted-foreground">sur</span>
            <InlineEdit compact singleClick label={`Vie totale de ${name}`} value={String(fields.totalHp)} onCommit={commitNumber("totalHp")}><span className="opacity-80">{fields.totalHp}</span></InlineEdit>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${lifeColor}26` }}><div className="h-full rounded-full transition-[width]" style={{ width: `${ratio}%`, backgroundColor: lifeColor }} /></div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {characteristicOrder.map((characteristic) => {
          const key = npcCharacteristicKeys[characteristic]
          const tone = characteristicColor(characteristic)
          return <div key={characteristic} className="rounded-xl px-1 py-2 text-center" style={{ backgroundColor: `${tone}14`, borderTop: `2px solid ${tone}` }}>
            <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: tone }}>{characteristic === "Vitalité" ? "Vitalité (vie)" : characteristic}</p>
            <InlineEdit compact singleClick label={`${characteristic} de ${name}`} value={String(fields[key])} onCommit={commitNumber(key)}><span className="block text-lg font-semibold tabular-nums">{fields[key]}</span></InlineEdit>
          </div>
        })}
      </div>

      {/* Les sorts sont choisis dans leurs index : on voit leur fiche (effet, charges, distance). */}
      <div className="grid gap-4 rounded-xl border border-border/55 bg-background/20 p-3">
        <SpellPicker label="Sorts actifs" icon={<Zap className="size-3.5" style={{ color }} />} value={fields.activeSpells} options={spells.options.filter((spell) => spell.category !== "passif")} known={spells.known} loading={spells.loading} onChange={(value) => void onChange({ activeSpells: value })} charges={charges} onCharge={onCharge} />
        <SpellPicker label="Sorts passifs" icon={<Sparkles className="size-3.5" style={{ color }} />} value={fields.passiveSpells} options={spells.options.filter((spell) => spell.category === "passif")} known={spells.known} loading={spells.loading} onChange={(value) => void onChange({ passiveSpells: value })} />
      </div>

      <div className="rounded-xl border border-border/55 bg-background/20 px-3 py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Notes</p>
        <InlineEdit multiline label={`Notes sur ${name}`} value={fields.notes} onCommit={(value) => onChange({ notes: value })}><span className={`block whitespace-pre-wrap text-sm ${fields.notes ? "" : "text-muted-foreground/55"}`}>{fields.notes || "Double-cliquer pour écrire…"}</span></InlineEdit>
      </div>

      {description && <details className="group rounded-xl border border-border/55 bg-background/20 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Description de l’index<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary>
        <IndexRichText html={description} className="mt-2 text-sm leading-6" />
      </details>}

      <div className="overflow-hidden rounded-xl border border-border/55">
        <button type="button" onClick={() => { setBackpackOpen((current) => !current); setBackpackMounted(true) }} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted/35" aria-expanded={backpackOpen}>
          <span className="flex items-center gap-2"><Backpack className="size-4" style={{ color }} />Sac à dos</span>
          <ChevronDown className={`size-4 transition-transform ${backpackOpen ? "rotate-180" : ""}`} />
        </button>
        {/* Une fois ouvert, le sac reste monté (caché quand il est replié) : le rouvrir ne le recharge pas. */}
        {backpackMounted && <div className={`border-t p-3 ${backpackOpen ? "" : "hidden"}`}>
          <CharacterInventory characterId={companionId} endpoint={`/api/characters/${encodeURIComponent(characterId)}/companions/${encodeURIComponent(companionId)}/inventory`} mode="npc" />
        </div>}
      </div>
    </div>
  </article>
}

/**
 * L'onglet Compagnon : des PNJ de la campagne et des créatures que le joueur contrôle comme
 * des personnages secondaires. `onChange` enregistre la liste dans l'onglet de la fiche.
 */
export function CharacterCompanions({ characterId, companions, onChange }: { characterId: string; companions: Companion[]; onChange: (update: (current: Companion[]) => Companion[]) => Promise<void> }) {
  const npcIds = useMemo(() => companions.flatMap((companion) => companion.kind === "npc" ? [companion.npcId] : []), [companions])
  const { npcs, loading, error, save } = useCompanionNpcs(characterId, npcIds)
  // Les deux index de sorts, lus une fois pour l'onglet : une créature n'a accès qu'aux
  // « Sorts des créatures », un PNJ à ceux des créatures et des classes.
  const allSpells = useSpellOptions(["classes", "creatures"], (kind) => `/api/characters/${encodeURIComponent(characterId)}/companions?spells=${kind}`)
  const creatureSpells = useMemo(() => ({ options: allSpells.options.filter((spell) => spell.source === "creatures"), known: allSpells.options, loading: allSpells.loading }), [allSpells.options, allSpells.loading])
  const npcSpells = useMemo(() => ({ options: allSpells.options, known: allSpells.options, loading: allSpells.loading }), [allSpells.options, allSpells.loading])

  function add(pick: Pick, name: string) {
    const id = crypto.randomUUID()
    const companion: Companion = pick.kind === "npc"
      ? { id, kind: "npc", npcId: pick.npc.id, campaignId: pick.npc.campaignId }
      : creatureCompanionFrom(pick.creature, id, name)
    void onChange((current) => [...current, companion])
  }

  // Chaque changement part de la dernière liste enregistrée : deux cases quittées coup sur coup ne s'effacent pas.
  const updateCreature = (companion: CreatureCompanion, changes: Partial<CreatureCompanion>) =>
    onChange((current) => current.map((item) => item.id === companion.id && item.kind === "creature" ? { ...item, ...changes } : item))
  const remove = (id: string) => void onChange((current) => current.filter((item) => item.id !== id))
  // Les charges d'un sort, gardées sur le compagnon dans l'onglet (PNJ compris : sa fiche n'est pas touchée).
  const setCharge = (companionId: string, spellKey: string, value: number) =>
    void onChange((current) => current.map((item) => item.id === companionId ? { ...item, spellCharges: { ...item.spellCharges, [spellKey]: value } } : item))

  return <div className="space-y-4">
    <CompanionSearch characterId={characterId} companions={companions} onAdd={add} />
    {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
    {!companions.length && <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border/55 bg-card/20 px-6 py-8 text-center">
      <div><PawPrint className="mx-auto size-7 text-muted-foreground/60" /><p className="mt-2 font-display text-lg font-semibold">Aucun compagnon pour l’instant</p><p className="mt-1 text-sm text-muted-foreground">Cherche un PNJ de ta campagne ou une créature : il apparaîtra ici avec sa fiche, ses caractéristiques et son sac à dos.</p></div>
    </div>}
    <div className="grid gap-4 xl:grid-cols-2">
      {companions.map((companion) => {
        if (companion.kind === "creature") {
          return <CompanionSheet
            key={companion.id}
            characterId={characterId}
            companionId={companion.id}
            color={creatureColor}
            kindLabel="Créature"
            name={companion.name}
            nameHint={companion.name !== companion.sourceName ? `${companion.sourceName} de l’Index des créatures` : undefined}
            subtitle={[companion.name !== companion.sourceName ? companion.sourceName : "", companion.creatureType, companion.rank && `Rang ${companion.rank}`].filter(Boolean).join(" · ")}
            portrait={companion.portrait}
            fields={companion}
            description={companion.description}
            spells={creatureSpells}
            onName={(name) => updateCreature(companion, { name })}
            onChange={(changes) => updateCreature(companion, changes)}
            onRemove={() => remove(companion.id)}
            charges={companion.spellCharges}
            onCharge={(spellKey, value) => setCharge(companion.id, spellKey, value)}
          />
        }
        const npc = npcs[companion.npcId]
        if (!npc) return <article key={companion.id} className="flex items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground" style={{ borderColor: `${npcColor}55` }}>
          <span className="flex items-center gap-2">{loading ? <><LoaderCircle className="size-4 animate-spin" />Chargement du PNJ…</> : "Ce PNJ n’est plus disponible (supprimé, ou plus visible dans tes campagnes)."}</span>
          {!loading && <button type="button" onClick={() => remove(companion.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" />Retirer</button>}
        </article>
        return <CompanionSheet
          key={companion.id}
          characterId={characterId}
          companionId={companion.id}
          color={npcColor}
          kindLabel="PNJ"
          name={npc.name}
          nameHint="Le nom d’un PNJ se change avec le MJ"
          subtitle={[npc.title, npc.occupation, npc.people].filter(Boolean).join(" · ")}
          portrait={npc.portrait}
          fields={{
            currentHp: npc.currentHp, totalHp: npc.totalHp, speed: npc.speed, strength: npc.strength, dexterity: npc.dexterity,
            intelligence: npc.intelligence, wisdom: npc.wisdom, charisma: npc.charisma,
            notes: npc.playerNotes, activeSpells: npc.activeSpells ?? "", passiveSpells: npc.passiveSpells ?? "",
          }}
          description={npc.lore}
          spells={npcSpells}
          onChange={({ notes, ...changes }) => save(npc.id, { ...changes, ...(notes !== undefined ? { playerNotes: notes } : {}) })}
          onRemove={() => remove(companion.id)}
          charges={companion.spellCharges}
          onCharge={(spellKey, value) => setCharge(companion.id, spellKey, value)}
        />
      })}
    </div>
  </div>
}

