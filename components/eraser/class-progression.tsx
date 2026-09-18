"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, ChevronUp, CircleDotDashed, Crosshair, Gauge, Plus, RotateCcw, Search, X, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ClassSpell } from "@/lib/class-content"
import { normalizeClassLabel } from "@/lib/class-utils"
import type { ClassRecord } from "@/lib/google-sheets"

const categoryTone = { actif: { background: "#7f1d1d", foreground: "#fff7ed" }, passif: { background: "#315b55", foreground: "#f0fdfa" }, bonus: { background: "#795a12", foreground: "#fffbeb" } }

function spellTone(spell: ClassSpell) {
  return spell.tone.background ? { background: spell.tone.background, foreground: spell.tone.foreground || "#fff" } : categoryTone[spell.category]
}

export type CharacterClassChoices = {
  choices: Record<string, Record<string, string>>
  charges: Record<string, number>
  extras: string[]
  order: string[]
}

export function parseClassChoices(value: string): CharacterClassChoices {
  try {
    const parsed = JSON.parse(value) as Partial<CharacterClassChoices>
    return {
      choices: parsed && typeof parsed.choices === "object" && parsed.choices ? parsed.choices as CharacterClassChoices["choices"] : {},
      charges: parsed && typeof parsed.charges === "object" && parsed.charges ? parsed.charges as CharacterClassChoices["charges"] : {},
      extras: parsed && Array.isArray(parsed.extras) ? parsed.extras.filter((item): item is string => typeof item === "string") : [],
      order: parsed && Array.isArray(parsed.order) ? parsed.order.filter((item): item is string => typeof item === "string") : [],
    }
  } catch {
    return { choices: {}, charges: {}, extras: [], order: [] }
  }
}

export function selectedCharacterClasses(value: string, classes: ClassRecord[]) {
  let names: string[] = []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) names = parsed.filter((item): item is string => typeof item === "string")
    else if (parsed && Array.isArray(parsed.values)) names = parsed.values.filter((item: unknown): item is string => typeof item === "string")
  } catch { names = value ? [value] : [] }
  return classes.filter((item) => names.some((name) => normalizeClassLabel(name) === normalizeClassLabel(item.name) || name === item.id))
}

export function knownSpellsForCharacter(classes: ClassRecord[], spells: ClassSpell[], level: number, value: string) {
  const state = parseClassChoices(value)
  const classIds = new Set(classes.map((item) => item.id))
  const extras = new Set(state.extras)
  return spells.filter((spell) => extras.has(spell.id) || Object.entries(spell.classRanks).some(([classId, rank]) => classIds.has(classId) && rank <= level && (rank === 0 || state.choices[classId]?.[String(rank)] === spell.id)))
}

function SpellGlyph({ category }: { category: ClassSpell["category"] }) {
  if (category === "bonus") return <Gauge />
  if (category === "passif") return <CircleDotDashed />
  return <Zap />
}

function KnownSpell({ spell, rank, accent, currentCharges, onCharges, manual, canMoveUp, canMoveDown, onMove }: { spell: ClassSpell; rank: number | null; accent: string; currentCharges: number; onCharges: (value: number) => void; manual?: boolean; canMoveUp?: boolean; canMoveDown?: boolean; onMove?: (direction: -1 | 1) => void }) {
  const tone = spellTone(spell)
  return <details className="group rounded-xl border bg-background/45" style={{ borderColor: `${tone.background}66` }}>
    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background, color: tone.foreground }}><span className="flex size-4 items-center justify-center [&>svg]:size-4"><SpellGlyph category={spell.category} /></span></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{spell.name}</span><span className="block text-[11px] text-muted-foreground">{rank === null ? "Hors classe" : rank === 0 ? "Commun" : `Rang ${rank}`} · {spell.type}</span></span>
      {spell.category === "actif" && <SpellChargeStars total={spell.charges} current={currentCharges} interactive onChange={onCharges} accent={accent} />}
      {manual && <span className="flex shrink-0 flex-col gap-0.5" onClick={(event) => event.preventDefault()}>
        <button type="button" disabled={!canMoveUp} aria-label={`Monter ${spell.name}`} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMove?.(-1) }}><ChevronUp className="size-3.5" /></button>
        <button type="button" disabled={!canMoveDown} aria-label={`Descendre ${spell.name}`} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMove?.(1) }}><ChevronDown className="size-3.5" /></button>
      </span>}
      <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
    </summary>
    <div className="border-t px-3 py-3 text-sm leading-6" style={{ borderColor: `${accent}28` }}>
      {(spell.effect || spell.description) && <blockquote className="border-l-2 pl-3" style={{ borderColor: accent }}>{spell.effect && <div className="font-medium" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />}{spell.description && <div className="mt-1 text-muted-foreground" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}</blockquote>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}{spell.distance && <span className="flex items-center gap-1"><Crosshair className="size-3" />Distance : {spell.distance}</span>}</div>
    </div>
  </details>
}

function ChoiceCard({ spell, selected, accent, onChoose }: { spell: ClassSpell; selected: boolean; accent: string; onChoose: () => void }) {
  const tone = spellTone(spell)
  return <button type="button" onClick={onChoose} className="min-h-32 rounded-2xl border bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: selected ? accent : `${accent}38`, backgroundColor: selected ? `${accent}12` : undefined }}>
    <div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background, color: tone.foreground }}><span className="flex size-4 items-center justify-center [&>svg]:size-4"><SpellGlyph category={spell.category} /></span></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-display text-lg font-semibold leading-tight">{spell.name}</span>{selected && <Check className="size-4" style={{ color: accent }} />}</span><span className="mt-1 block text-xs text-muted-foreground">{spell.type}</span></span></div>
    {(spell.effect || spell.description) && <span className="mt-3 line-clamp-4 block text-sm leading-5"><span className="block font-medium" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />{spell.description && <span className="mt-1 block text-muted-foreground" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}</span>}
    {spell.category === "actif" && <SpellChargeStars total={spell.charges} accent={accent} className="mt-3" />}
  </button>
}

export function ClassProgression({ classes, spells, level, value, onCommit, loading = false, error = "" }: { classes: ClassRecord[]; spells: ClassSpell[]; level: number; value: string; onCommit: (value: string) => Promise<void>; loading?: boolean; error?: string }) {
  const state = useMemo(() => parseClassChoices(value), [value])
  const [reconsidering, setReconsidering] = useState<Record<string, boolean>>({})
  const [sort, setSort] = useState<"rank" | "name" | "type" | "manual">("rank")
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searchCategory, setSearchCategory] = useState<"all" | ClassSpell["category"]>("all")
  const known = knownSpellsForCharacter(classes, spells, level, value)

  async function update(next: CharacterClassChoices) { await onCommit(JSON.stringify(next)) }
  function choose(classId: string, rank: number, spellId: string) {
    const choices = { ...state.choices, [classId]: { ...(state.choices[classId] || {}), [String(rank)]: spellId } }
    setReconsidering((current) => ({ ...current, [`${classId}:${rank}`]: false }))
    return update({ ...state, choices })
  }
  function setCharges(spell: ClassSpell, count: number) {
    return update({ ...state, charges: { ...state.charges, [spell.id]: Math.max(0, Math.min(spell.charges ?? 0, count)) } })
  }
  function addExtra(spellId: string) {
    if (state.extras.includes(spellId)) return
    return update({ ...state, extras: [...state.extras, spellId], order: [...state.order.filter((id) => id !== spellId), spellId] })
  }
  function moveSpell(spell: ClassSpell, direction: -1 | 1) {
    const categoryIds = sortedKnown.filter((item) => item.category === spell.category).map((item) => item.id)
    const index = categoryIds.indexOf(spell.id)
    const swapWith = categoryIds[index + direction]
    if (!swapWith) return
    const knownIds = new Set(known.map((item) => item.id))
    const baseOrder = [...state.order.filter((id) => knownIds.has(id)), ...known.map((item) => item.id).filter((id) => !state.order.includes(id))]
    const left = baseOrder.indexOf(spell.id)
    const right = baseOrder.indexOf(swapWith)
    ;[baseOrder[left], baseOrder[right]] = [baseOrder[right], baseOrder[left]]
    return update({ ...state, order: baseOrder })
  }
  const manualPosition = new Map(state.order.map((id, index) => [id, index]))
  const naturalPosition = new Map(known.map((spell, index) => [spell.id, index]))
  const sortedKnown = [...known].sort((left, right) => sort === "name"
    ? left.name.localeCompare(right.name, "fr")
    : sort === "type"
      ? left.type.localeCompare(right.type, "fr") || left.name.localeCompare(right.name, "fr")
      : sort === "manual"
        ? (manualPosition.get(left.id) ?? naturalPosition.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (manualPosition.get(right.id) ?? naturalPosition.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      : Math.min(...Object.values(left.classRanks)) - Math.min(...Object.values(right.classRanks)) || left.name.localeCompare(right.name, "fr"))
  const normalizedQuery = query.trim().toLocaleLowerCase("fr")
  const matchingSearchResults = spells.filter((spell) => !known.some((item) => item.id === spell.id) && (searchCategory === "all" || spell.category === searchCategory) && (!normalizedQuery || [spell.name, spell.type, spell.category, spell.skillsRaw, spell.effect, spell.description].join(" ").toLocaleLowerCase("fr").includes(normalizedQuery)))
  const searchResults = matchingSearchResults.slice(0, 60)

  if (loading) return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/55 bg-card/20 p-8 text-center text-sm text-muted-foreground">Chargement des classes et des sorts…</div>
  if (error) return <div className="grid min-h-52 place-items-center rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">{error}<span className="mt-2 block text-muted-foreground">La fiche reste utilisable dans les autres onglets.</span></div>
  if (!classes.length) return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/55 bg-card/20 p-8 text-center text-sm text-muted-foreground">Choisis une classe dans l’identité du personnage pour afficher sa progression.</div>

  return <div className="space-y-9">
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Répertoire</p><h2 className="font-display mt-1 text-2xl font-semibold">Capacités acquises</h2></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs text-muted-foreground">Trier par<NativeSelect value={sort} onChange={(event) => setSort(event.target.value as "rank" | "name" | "type" | "manual")} className="h-10 min-w-40 py-0 pl-3 pr-10 leading-5"><NativeSelectOption value="rank">Rang</NativeSelectOption><NativeSelectOption value="name">Nom</NativeSelectOption><NativeSelectOption value="type">Type</NativeSelectOption><NativeSelectOption value="manual">Manuel</NativeSelectOption></NativeSelect></label><Button type="button" variant={searchOpen ? "secondary" : "outline"} size="icon-sm" aria-label="Ajouter une capacité" title="Ajouter une capacité" onClick={() => setSearchOpen((open) => !open)}>{searchOpen ? <X /> : <Plus />}</Button></div></div>
      {searchOpen && <div className="mt-4 rounded-xl border bg-card/55 p-3"><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, mot-clé, type ou compétence…" className="pl-9" /></div><NativeSelect value={searchCategory} onChange={(event) => setSearchCategory(event.target.value as typeof searchCategory)} className="h-9 min-w-36"><NativeSelectOption value="all">Tout</NativeSelectOption><NativeSelectOption value="actif">Actifs</NativeSelectOption><NativeSelectOption value="passif">Passifs</NativeSelectOption><NativeSelectOption value="bonus">Bonus</NativeSelectOption></NativeSelect></div><div className="mt-3 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">{searchResults.map((spell) => <div key={spell.id} className="flex items-center gap-3 rounded-lg border bg-background/55 p-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4" style={{ backgroundColor: spellTone(spell).background, color: spellTone(spell).foreground }}><SpellGlyph category={spell.category} /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{spell.name}</b><span className="block truncate text-xs text-muted-foreground">{spell.type}{spell.skills.length ? ` · ${spell.skills.join(" · ")}` : ""}</span></span><Button type="button" size="sm" variant="outline" onClick={() => void addExtra(spell.id)}><Plus />Ajouter</Button></div>)}</div>{matchingSearchResults.length > searchResults.length && <p className="pt-3 text-center text-xs text-muted-foreground">Affichage des 60 premiers résultats — précise ta recherche pour voir les autres.</p>}{!searchResults.length && <p className="py-5 text-center text-xs text-muted-foreground">Aucune capacité correspondante.</p>}</div>}
      {sortedKnown.length ? <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
        {(["actif", "passif"] as const).map((category) => { const categorySpells = sortedKnown.filter((spell) => spell.category === category); return <div key={category}><h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">{category === "actif" ? <Zap className="size-4" /> : <CircleDotDashed className="size-4" />}{category === "actif" ? "Actifs" : "Passifs"}</h3><div className="space-y-2">{categorySpells.map((spell, index) => { const linkedRanks = classes.flatMap((item) => item.id in spell.classRanks ? [spell.classRanks[item.id]] : []); const rank = linkedRanks.length ? Math.min(...linkedRanks) : null; return <KnownSpell key={spell.id} spell={spell} rank={rank} accent={classes.find((item) => item.id in spell.classRanks)?.accentDark || "#927640"} currentCharges={state.charges[spell.id] ?? spell.charges ?? 0} onCharges={(count) => void setCharges(spell, count)} manual={sort === "manual"} canMoveUp={index > 0} canMoveDown={index < categorySpells.length - 1} onMove={(direction) => void moveSpell(spell, direction)} /> })}{!categorySpells.length && <p className="rounded-xl border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">Aucun {category === "actif" ? "actif" : "passif"} acquis.</p>}</div></div> })}
        {sortedKnown.some((spell) => spell.category === "bonus") && <details className="lg:col-span-2"><summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Afficher les bonus ({sortedKnown.filter((spell) => spell.category === "bonus").length})</summary><div className="mt-3 grid gap-2 lg:grid-cols-2">{sortedKnown.filter((spell) => spell.category === "bonus").map((spell, index, bonusSpells) => { const linkedRanks = classes.flatMap((item) => item.id in spell.classRanks ? [spell.classRanks[item.id]] : []); const rank = linkedRanks.length ? Math.min(...linkedRanks) : null; return <KnownSpell key={spell.id} spell={spell} rank={rank} accent={classes.find((item) => item.id in spell.classRanks)?.accentDark || "#927640"} currentCharges={0} onCharges={() => undefined} manual={sort === "manual"} canMoveUp={index > 0} canMoveDown={index < bonusSpells.length - 1} onMove={(direction) => void moveSpell(spell, direction)} /> })}</div></details>}
      </div> : <p className="mt-4 rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">Aucune capacité disponible pour ce niveau.</p>}
    </section>

    {classes.map((characterClass) => {
      const classSpells = spells.filter((spell) => characterClass.id in spell.classRanks && spell.classRanks[characterClass.id] <= level)
      const ranks = Array.from({ length: level + 1 }, (_, rank) => rank)
      const hasChoicePending = ranks.some((rank) => rank > 0 && classSpells.some((spell) => spell.classRanks[characterClass.id] === rank) && !state.choices[characterClass.id]?.[String(rank)])
      return <details key={characterClass.id} className="group rounded-2xl border bg-card/40" style={{ borderColor: `${characterClass.accentDark}45` }}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden"><div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em]" style={{ color: characterClass.accentDark }}>Progression de classe{hasChoicePending && <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground" title="Un rang est à choisir">!</span>}</p><h2 className="font-display mt-1 text-2xl font-semibold">{characterClass.name}</h2></div><div className="flex items-center gap-2"><Badge variant="outline" style={{ borderColor: `${characterClass.accentDark}55`, color: characterClass.accentDark }}>Rang actuel : {level}</Badge><ChevronDown className="size-5 text-muted-foreground transition group-open:rotate-180" /></div></summary>
        <div className="border-t px-4 pb-4 sm:px-5 sm:pb-5" style={{ borderColor: `${characterClass.accentDark}28` }}>
        {ranks.length ? <div className="mt-5 space-y-6">{ranks.map((rank) => {
          const available = classSpells.filter((spell) => spell.classRanks[characterClass.id] === rank).slice(0, 3)
          const selectedId = rank === 0 ? "" : state.choices[characterClass.id]?.[String(rank)] || ""
          const key = `${characterClass.id}:${rank}`
          const choosing = rank > 0 && (!selectedId || reconsidering[key])
          return <section key={rank} className="border-t pt-4" style={{ borderColor: `${characterClass.accentDark}28` }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${characterClass.accentLight}42`, color: characterClass.accentDark }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display font-semibold">{rank === 0 ? "Rang commun" : `Rang ${rank}`}</h3><p className="text-[11px] text-muted-foreground">{rank === 0 ? "Acquis automatiquement" : choosing ? "Choisis une capacité" : "Choix enregistré"}</p></div></div>{rank > 0 && selectedId && !choosing && <Button type="button" variant="ghost" size="sm" onClick={() => setReconsidering((current) => ({ ...current, [key]: true }))}><RotateCcw />Rechoisir</Button>}{rank > 0 && selectedId && choosing && <Button type="button" variant="ghost" size="sm" onClick={() => setReconsidering((current) => ({ ...current, [key]: false }))}>Annuler</Button>}</div>
            <div className={`grid gap-3 ${choosing || rank === 0 ? "lg:grid-cols-3" : "grid-cols-1"}`}>{(choosing || rank === 0 ? available : available.filter((spell) => spell.id === selectedId)).map((spell) => <ChoiceCard key={spell.id} spell={spell} selected={rank === 0 || spell.id === selectedId} accent={characterClass.accentDark} onChoose={() => { if (rank > 0) void choose(characterClass.id, rank, spell.id) }} />)}</div>
          </section>
        })}</div> : <p className="mt-5 rounded-xl border border-dashed px-4 py-7 text-center text-sm text-muted-foreground">Aucun sort n’est encore lié à cette classe jusqu’au rang {level}.</p>}
        </div>
      </details>
    })}
  </div>
}
