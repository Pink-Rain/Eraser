"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { CircleDotDashed, Crosshair, ExternalLink, Gauge, LibraryBig, LoaderCircle, Search, Zap } from "lucide-react"

import { ClassImage } from "@/components/eraser/class-image"
import { RichTextField, RichTextInlineEditor } from "@/components/eraser/rich-text"
import { SpellChargeStars } from "@/components/eraser/spell-charges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ClassContent, ClassSpell, ClassSpellDraft, EditableClassList } from "@/lib/class-content"
import { classSpellActionKind, classSpellCategory, classSpellTypeSuggestions, MAX_CLASS_SPELLS_PER_RANK, splitClassSpellSkills } from "@/lib/class-spell-utils"

const categoryDefaults = {
  actif: { background: "#7f1d1d", foreground: "#fff7ed" },
  passif: { background: "#315b55", foreground: "#f0fdfa" },
  bonus: { background: "#795a12", foreground: "#fffbeb" },
}

function plainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim()
}

function spellIcon(spell: ClassSpell) {
  if (spell.category === "bonus") return <Gauge className="size-4" />
  if (spell.category === "passif") return <CircleDotDashed className="size-4" />
  return <Zap className="size-4" />
}

function spellDraft(spell: ClassSpell): ClassSpellDraft {
  return { id: spell.id, name: spell.name, effect: spell.effect, effectHtml: spell.effectHtml, description: spell.description, descriptionHtml: spell.descriptionHtml, type: spell.type, skillsRaw: spell.skillsRaw, distance: spell.distance, charges: spell.charges, classRanks: { ...spell.classRanks } }
}

function SpellCard({ spell, rank, accentDark, accentLight, canEdit, onEdit }: { spell: ClassSpell; rank: number; accentDark: string; accentLight: string; canEdit: boolean; onEdit: (spell: ClassSpell) => void }) {
  const tone = spell.tone.background ? spell.tone : categoryDefaults[spell.category]
  return <article onDoubleClick={canEdit ? () => onEdit(spell) : undefined} className="relative overflow-hidden rounded-xl border bg-card/80 p-4 shadow-sm" style={{ borderColor: `${accentDark}45` }}>
    <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: tone.background }} />
    <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background || `${accentLight}35`, color: tone.foreground || accentDark }}>{spellIcon(spell)}</div><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-semibold leading-tight">{spell.name}</h3><Badge className="text-[10px]" style={{ backgroundColor: tone.background, color: tone.foreground }}>{spell.type || "Type non renseigné"}</Badge></div>
      {(spell.effect || spell.description) && <blockquote className="mt-3 border-l-2 pl-3 text-sm leading-6" style={{ borderColor: tone.background || accentDark }}>{spell.effect && <div className="font-medium [&_a]:underline" dangerouslySetInnerHTML={{ __html: spell.effectHtml || spell.effect }} />}{spell.description && <div className="mt-1 text-muted-foreground [&_a]:underline" dangerouslySetInnerHTML={{ __html: spell.descriptionHtml || spell.description }} />}</blockquote>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">{spell.skills.length > 0 && <span className="font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}{spell.distance && <span className="flex items-center gap-1.5"><Crosshair className="size-3.5" />Distance : {spell.distance}</span>}{spell.category === "actif" && <SpellChargeStars total={spell.charges} accent={accentDark} />}</div>
    </div></div><span className="sr-only">Rang {rank}</span>
  </article>
}

function OverviewList({ label, field, canEdit, save }: { label: string; field: EditableClassList; canEdit: boolean; save: (column: number, value: string) => Promise<void> }) {
  const entries = field.entries.filter((entry) => entry.value)
  if (!entries.length) return null
  return <section className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{label}</p><div className="mt-2 flex flex-wrap gap-2">{entries.map((entry, index) => <RichTextInlineEditor key={`${entry.column}:${index}`} html={entry.html} fallback={entry.value} canEdit={canEdit} onSave={(html) => save(entry.column, html)} className="rounded-full border bg-background/55 px-3 py-1.5 text-sm" />)}</div></section>
}

function SpellEditor({ spell, accentDark, accentLight, pending, onClose, onSave }: { spell: ClassSpell; accentDark: string; accentLight: string; pending: boolean; onClose: () => void; onSave: (draft: ClassSpellDraft) => void }) {
  const [draft, setDraft] = useState(() => spellDraft(spell))
  const tone = spell.tone.background ? spell.tone : categoryDefaults[spell.category]
  const field = <K extends keyof ClassSpellDraft>(key: K, value: ClassSpellDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  return <article className="relative overflow-hidden rounded-xl border bg-card/90 p-4 shadow-sm" style={{ borderColor: `${accentDark}65` }}>
    <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: tone.background }} />
    <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: tone.background || `${accentLight}35`, color: tone.foreground || accentDark }}>{spellIcon({ ...spell, category: classSpellCategory(draft.type) })}</div><div className="grid min-w-0 flex-1 gap-2">
      <label><span className="sr-only">Nom</span><Input autoFocus value={draft.name} onChange={(event) => field("name", event.target.value)} className="font-display text-lg font-semibold" /></label>
      <label><span className="sr-only">Type exact</span><Input list="class-detail-spell-types" value={draft.type} onChange={(event) => field("type", event.target.value)} placeholder="Actif -Action mineur" className="text-xs" /><datalist id="class-detail-spell-types">{classSpellTypeSuggestions.map((type) => <option key={type} value={type} />)}</datalist></label>
    </div></div>
    <blockquote className="mt-3 grid gap-3 border-l-2 pl-3" style={{ borderColor: tone.background || accentDark }}><div className="grid gap-1 text-xs font-medium">Effet<RichTextField ariaLabel="Effet" value={draft.effectHtml || draft.effect} onCommit={(html) => { field("effect", plainText(html)); field("effectHtml", html) }} className="text-sm" /></div><div className="grid gap-1 text-xs font-medium">Description<RichTextField ariaLabel="Description" value={draft.descriptionHtml || draft.description} onCommit={(html) => { field("description", plainText(html)); field("descriptionHtml", html) }} className="text-sm" /></div></blockquote>
    <div className="mt-3 grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium">Compétences<Input value={draft.skillsRaw} onChange={(event) => field("skillsRaw", event.target.value)} className="text-xs font-semibold text-[#b3261e]" /></label><label className="grid gap-1 text-xs font-medium">Distance<Input value={draft.distance} onChange={(event) => field("distance", event.target.value)} className="text-xs" /></label><label className="grid gap-1 text-xs font-medium">Charges{classSpellCategory(draft.type) === "actif" ? <Input type="number" min={0} max={5} value={draft.charges ?? ""} onChange={(event) => field("charges", event.target.value === "" ? null : Math.max(0, Math.min(5, Number(event.target.value))))} className="text-xs" /> : <span className="flex min-h-9 items-center text-muted-foreground">—</span>}</label></div>
    <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>Annuler</Button><Button size="sm" onClick={() => onSave(draft)} disabled={pending || !draft.name.trim()}>{pending && <LoaderCircle className="animate-spin" />}Enregistrer</Button></div>
  </article>
}

export function ClassDetail({ initialContent, imageUrl, canEdit }: { initialContent: ClassContent; imageUrl: string | null; canEdit: boolean }) {
  const [content, setContent] = useState(initialContent)
  const [editingSpell, setEditingSpell] = useState<ClassSpell | null>(null)
  const [pending, setPending] = useState(false)
  const [searchRank, setSearchRank] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const { characterClass, presentation } = content
  const style = { "--class-dark": characterClass.accentDark, "--class-light": characterClass.accentLight } as CSSProperties

  async function savePresentation(column: number, html: string) {
    if (!presentation) return
    const response = await fetch("/api/classes/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-presentation", classId: characterClass.id, rowNumber: presentation.rowNumber, column, value: html }) })
    if (!response.ok) return
    const text = plainText(html)
    setContent((current) => { if (!current.presentation) return current; const next = structuredClone(current.presentation); next.specialties.forEach((item) => { if (item.titleColumn === column) { item.title = text; item.titleHtml = html } if (item.textColumn === column) { item.text = text; item.textHtml = html } }); for (const group of [next.primaryCharacteristics, next.secondaryCharacteristics]) group.entries.forEach((item) => { if (item.column === column) { item.value = text; item.html = html } }); return { ...current, presentation: next } })
  }

  async function applyResourceMutation(body: Record<string, unknown>) {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/resources/class-index", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const payload = await response.json() as { result?: { id: string; rowNumber: number; tone: { background: string; foreground: string } } | null; error?: string }
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
      return payload.result ?? null
    } catch (error) {
      setError(error instanceof Error ? error.message : "Enregistrement impossible.")
      return false
    } finally { setPending(false) }
  }

  async function saveSpell(draft: ClassSpellDraft) {
    if (!editingSpell) return
    const result = await applyResourceMutation({ action: "update", rowNumber: editingSpell.rowNumber, draft })
    if (result === false) return
    const category = classSpellCategory(draft.type)
    const updated: ClassSpell = { ...editingSpell, ...draft, id: result?.id || draft.id || editingSpell.id, rowNumber: result?.rowNumber || editingSpell.rowNumber, category, actionKind: classSpellActionKind(draft.type), skills: splitClassSpellSkills(draft.skillsRaw), effectHtml: draft.effectHtml || draft.effect, descriptionHtml: draft.descriptionHtml || draft.description, classRanks: Object.fromEntries(Object.entries(draft.classRanks).filter((entry): entry is [string, number] => typeof entry[1] === "number")), tone: result?.tone || editingSpell.tone }
    setContent((current) => ({ ...current, allSpells: current.allSpells.map((spell) => spell.rowNumber === editingSpell.rowNumber ? updated : spell), spells: current.spells.map((spell) => spell.rowNumber === editingSpell.rowNumber ? updated : spell) }))
    setEditingSpell(null)
  }
  async function linkSpell(spell: ClassSpell, rank: number) {
    if (content.spells.filter((item) => item.classRanks[characterClass.id] === rank).length >= MAX_CLASS_SPELLS_PER_RANK) { setError("Ce rang contient déjà trois sorts."); return }
    const result = await applyResourceMutation({ action: "link", rowNumber: spell.rowNumber, classId: characterClass.id, rank })
    if (result === false) return
    const updated = { ...spell, classRanks: { ...spell.classRanks, [characterClass.id]: rank } }
    setContent((current) => ({ ...current, allSpells: current.allSpells.map((item) => item.rowNumber === spell.rowNumber ? updated : item), spells: [...current.spells.filter((item) => item.rowNumber !== spell.rowNumber), updated].sort((left, right) => left.classRanks[characterClass.id] - right.classRanks[characterClass.id] || left.name.localeCompare(right.name, "fr")) }))
    setSearchRank(null); setQuery("")
  }

  const populatedRanks = [...new Set(content.spells.map((spell) => spell.classRanks[characterClass.id]))].sort((left, right) => left - right)
  const ranks = canEdit ? Array.from({ length: 21 }, (_, index) => index) : populatedRanks
  const searchResults = useMemo(() => { const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); return content.allSpells.filter((spell) => spell.classRanks[characterClass.id] !== searchRank && (!normalized || `${spell.name} ${spell.type} ${spell.skillsRaw} ${spell.effect} ${spell.description}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized))).slice(0, 30) }, [characterClass.id, content.allSpells, query, searchRank])

  return <div className="w-full flex-1 px-5 py-8 sm:px-8 md:py-12" style={style}>
    <article className="overflow-hidden rounded-[1.75rem] border bg-card/90 shadow-[0_18px_55px_rgb(67_50_31/0.1)]" style={{ borderColor: `${characterClass.accentDark}55` }}><div className="grid lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]"><div className="relative min-h-72 p-8 lg:min-h-[31rem] lg:p-11" style={{ background: `radial-gradient(circle at 50% 45%, ${characterClass.accentLight}32, transparent 64%)` }}><ClassImage src={imageUrl} alt={`Illustration de la classe ${characterClass.name}`} className="size-full object-contain" fallbackClassName="min-h-72" eager /></div><div className="flex flex-col justify-center p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[.22em]" style={{ color: characterClass.accentDark }}>{characterClass.type}</p><h1 className="font-display mt-3 text-4xl font-semibold tracking-[-.025em] sm:text-5xl">{characterClass.name}</h1>
      {presentation && <div className="mt-7 grid gap-5 sm:grid-cols-2"><OverviewList label="Caractéristiques principales" field={presentation.primaryCharacteristics} canEdit={canEdit} save={savePresentation} /><OverviewList label="Caractéristiques secondaires" field={presentation.secondaryCharacteristics} canEdit={canEdit} save={savePresentation} /></div>}
      {presentation?.specialties.length ? <div className="mt-7 border-t pt-5"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Spécialités</p><div className="mt-3 divide-y">{presentation.specialties.map((specialty) => <div key={specialty.index} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]"><RichTextInlineEditor html={specialty.titleHtml} fallback={specialty.title} canEdit={canEdit && specialty.titleColumn !== null} onSave={(html) => savePresentation(specialty.titleColumn!, html)} className="font-display font-semibold" /><RichTextInlineEditor html={specialty.textHtml} fallback={specialty.text} canEdit={canEdit && specialty.textColumn !== null} onSave={(html) => savePresentation(specialty.textColumn!, html)} className="text-sm leading-6 text-muted-foreground" /></div>)}</div></div> : null}
    </div></div></article>

    <section className="mt-12"><div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.2em]" style={{ color: characterClass.accentDark }}>Progression</p><h2 className="font-display mt-1 text-3xl font-semibold">Sorts de classe</h2></div>{canEdit && content.spellsSheetUrl && <Button asChild variant="ghost" size="sm"><a href={content.spellsSheetUrl} target="_blank" rel="noreferrer">Ouvrir le tableau <ExternalLink /></a></Button>}</div>
      {error && <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
      {ranks.length ? <div className="mt-7 space-y-8">{ranks.map((rank) => { const spells = content.spells.filter((spell) => spell.classRanks[characterClass.id] === rank); const full = spells.length >= MAX_CLASS_SPELLS_PER_RANK; return <section key={rank}><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full font-display text-sm font-bold" style={{ backgroundColor: `${characterClass.accentLight}45`, color: characterClass.accentDark }}>{rank === 0 ? "C" : rank}</span><div><h3 className="font-display text-xl font-semibold">{rank === 0 ? "Rang commun" : `Rang ${rank}`}</h3><p className={`text-xs ${spells.length > 3 ? "text-destructive" : "text-muted-foreground"}`}>{rank === 0 ? "Kit de démarrage acquis automatiquement" : "Choisis un sort parmi les trois"} · {spells.length} / 3{spells.length > 3 ? " — dépassement à corriger" : ""}</p></div></div>{canEdit && <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => { setSearchRank(searchRank === rank ? null : rank); setQuery("") }}><Search />Chercher un sort</Button>}</div>
        {searchRank === rank && <div className="mb-3 rounded-xl border bg-card/75 p-3"><div className="flex items-center gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, compétence, type, effet ou description…" className="pl-9" /></div><Button type="button" variant="ghost" size="sm" onClick={() => setSearchRank(null)}>Fermer</Button></div><div className="mt-2 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">{searchResults.map((spell) => <button key={spell.id} type="button" onClick={() => void linkSpell(spell, rank)} disabled={pending} className="rounded-lg border p-3 text-left hover:bg-muted/45"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{spell.name}</span><Badge variant="outline">{spell.type}</Badge>{spell.skills.length > 0 && <span className="text-xs font-semibold text-[#b3261e]">{spell.skills.join(" · ")}</span>}</span><blockquote className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">{spell.effect || spell.description || "Aucun effet renseigné"}</blockquote></button>)}</div></div>}
        {spells.length ? <div className="grid gap-3 lg:grid-cols-3">{spells.map((spell) => <div key={spell.id}>{editingSpell?.rowNumber === spell.rowNumber ? <SpellEditor spell={editingSpell} accentDark={characterClass.accentDark} accentLight={characterClass.accentLight} pending={pending} onClose={() => setEditingSpell(null)} onSave={(draft) => void saveSpell(draft)} /> : <SpellCard spell={spell} rank={rank} accentDark={characterClass.accentDark} accentLight={characterClass.accentLight} canEdit={canEdit} onEdit={setEditingSpell} />}</div>)}</div> : <div className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Aucun sort lié à ce rang.</div>}
      </section> })}</div> : <div className="mt-7 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground"><LibraryBig className="mx-auto mb-3 size-7 opacity-50" />Aucun sort n’est encore renseigné pour cette classe.</div>}
    </section>

    {content.supplements.map((table) => <section key={table.title} className="mt-12"><div className="border-b pb-4"><p className="text-[11px] font-semibold uppercase tracking-[.2em]" style={{ color: characterClass.accentDark }}>Spécificité de classe</p><h2 className="font-display mt-1 text-3xl font-semibold">{table.title}</h2></div><div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">{table.rows.map((row) => <article key={row.rowNumber} className="rounded-2xl border bg-card/75 p-4" style={{ borderColor: `${characterClass.accentDark}45` }}>{table.headers.map((header, index) => row.values[index] ? <div key={`${header}:${index}`} className={index ? "mt-3" : ""}><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{header}</p><p className={index === 0 ? "font-display text-lg font-semibold" : "mt-1 whitespace-pre-line text-sm leading-6"}>{row.values[index]}</p></div> : null)}</article>)}</div></section>)}

  </div>
}
