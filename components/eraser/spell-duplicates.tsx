"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Check, CheckCircle2, Combine, EyeOff, LoaderCircle, Pencil, Search, Trash2 } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { RichTextView } from "@/components/eraser/rich-text"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ClassSpell, ClassSpellDraft, SpellSimilarity } from "@/lib/class-content"
import { classSpellCategoryTones } from "@/lib/class-spell-utils"
import type { ClassRecord } from "@/lib/google-sheets"

type Kind = SpellSimilarity["kind"]
const kindOrder: Kind[] = ["Doublon exact", "Même description", "Même nom", "Très proche"]

export type SpellGroup = { key: string; spells: ClassSpell[]; pairs: SpellSimilarity[]; kind: Kind; score: number }

/**
 * Les paires deviennent des groupes : si A ressemble à B et B à C, les trois se
 * comparent ensemble. Le type d'un groupe est celui de sa ressemblance la plus forte.
 */
export function groupSimilarities(spells: ClassSpell[], similarities: SpellSimilarity[]): SpellGroup[] {
  const byId = new Map(spells.map((spell) => [spell.id, spell]))
  const parent = new Map<string, string>()
  const find = (id: string): string => { const up = parent.get(id) ?? id; if (up === id) return id; const root = find(up); parent.set(id, root); return root }
  const pairs = similarities.filter((pair) => byId.has(pair.leftId) && byId.has(pair.rightId))
  for (const pair of pairs) parent.set(find(pair.leftId), find(pair.rightId))
  const groups = new Map<string, SpellGroup>()
  for (const pair of pairs) {
    const root = find(pair.leftId)
    const group = groups.get(root) ?? { key: root, spells: [], pairs: [], kind: pair.kind, score: 0 }
    group.pairs.push(pair)
    for (const id of [pair.leftId, pair.rightId]) if (!group.spells.some((spell) => spell.id === id)) group.spells.push(byId.get(id)!)
    if (kindOrder.indexOf(pair.kind) < kindOrder.indexOf(group.kind)) group.kind = pair.kind
    group.score = Math.max(group.score, pair.score)
    groups.set(root, group)
  }
  return [...groups.values()]
    .map((group) => ({ ...group, key: group.spells.map((spell) => spell.id).sort().join("+"), spells: [...group.spells].sort((left, right) => left.rowNumber - right.rowNumber) }))
    .sort((left, right) => kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind) || right.score - left.score)
}

type FieldKey = "name" | "type" | "skillsRaw" | "distance" | "charges" | "effect" | "description"
const fields: Array<{ key: FieldKey; label: string; rich?: boolean }> = [
  { key: "name", label: "Nom" },
  { key: "type", label: "Type" },
  { key: "skillsRaw", label: "Compétences" },
  { key: "distance", label: "Distance" },
  { key: "charges", label: "Charges" },
  { key: "effect", label: "Effet", rich: true },
  { key: "description", label: "Description", rich: true },
]

function fieldText(spell: ClassSpell, key: FieldKey) {
  if (key === "charges") return spell.charges === null ? "" : String(spell.charges)
  return String(spell[key] ?? "")
}

function fieldHtml(spell: ClassSpell, key: FieldKey) {
  if (key === "effect") return spell.effectHtml || spell.effect
  if (key === "description") return spell.descriptionHtml || spell.description
  return fieldText(spell, key)
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()

function differs(spells: ClassSpell[], key: FieldKey) {
  return new Set(spells.map((spell) => normalize(fieldText(spell, key)))).size > 1
}

function rankLabel(rank: number) {
  return rank === 0 ? "commun" : `rang ${rank}`
}

/** D'où vient un sort : ses classes et ses rangs, aux couleurs de chaque classe. */
function Origins({ spell, classes }: { spell: ClassSpell; classes: ClassRecord[] }) {
  const links = Object.entries(spell.classRanks).sort(([, left], [, right]) => left - right)
  if (!links.length) return <p className="text-xs italic text-muted-foreground">Rattaché à aucune classe</p>
  return <div className="flex flex-wrap gap-1.5">{links.map(([classId, rank]) => {
    const characterClass = classes.find((item) => item.id === classId)
    return <span key={classId} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: `${characterClass?.accentDark ?? "#888"}55`, backgroundColor: `${characterClass?.accentLight ?? "#ccc"}33` }}>
      <span className="size-2 rounded-full" style={{ backgroundColor: characterClass?.accentDark ?? "#888" }} />
      {characterClass?.name ?? classId}<span className="font-normal text-muted-foreground">· {rankLabel(rank)}</span>
    </span>
  })}</div>
}

/**
 * L'onglet Doublons : à gauche les groupes de sorts semblables, à droite la comparaison
 * côte à côte et la fusion champ par champ.
 */
export function SpellDuplicates({ spells, classes, similarities, focusSpellId, pending, onMerge, onIgnore, onEdit, onDelete }: {
  spells: ClassSpell[]
  classes: ClassRecord[]
  similarities: SpellSimilarity[]
  /** Sort dont on veut voir le groupe (bouton « Doublons » d'un sort). */
  focusSpellId?: string | null
  pending: boolean
  onMerge: (keep: ClassSpell, removed: ClassSpell[], draft: ClassSpellDraft) => Promise<boolean>
  onIgnore: (group: SpellGroup) => Promise<boolean>
  onEdit: (spell: ClassSpell) => void
  onDelete: (spell: ClassSpell) => Promise<void>
}) {
  const groups = useMemo(() => groupSimilarities(spells, similarities), [similarities, spells])
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all")
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const visible = groups.filter((group) => (kindFilter === "all" || group.kind === kindFilter) && (!query.trim() || group.spells.some((spell) => normalize(`${spell.name} ${spell.effect} ${spell.description}`).includes(normalize(query)))))
  const focused = focusSpellId ? groups.find((group) => group.spells.some((spell) => spell.id === focusSpellId)) : undefined
  const selected = groups.find((group) => group.key === selectedKey) ?? focused ?? visible[0] ?? null

  if (!groups.length) return <div className="rounded-2xl border border-dashed px-5 py-14 text-center text-sm text-muted-foreground">
    <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600" />
    Aucun doublon ni sort très proche. Tout est propre.
  </div>

  return <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className="flex flex-col gap-2 lg:sticky lg:top-0 lg:max-h-[calc(100svh-7rem)]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un sort…" className="pl-9" /></div>
      <NativeSelect value={kindFilter} onChange={(event) => setKindFilter(event.target.value as Kind | "all")} aria-label="Type de ressemblance">
        <NativeSelectOption value="all">Tous les groupes ({groups.length})</NativeSelectOption>
        {kindOrder.map((kind) => <NativeSelectOption key={kind} value={kind}>{kind} ({groups.filter((group) => group.kind === kind).length})</NativeSelectOption>)}
      </NativeSelect>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {visible.map((group) => <button
          key={group.key}
          type="button"
          onClick={() => setSelectedKey(group.key)}
          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${group.key === selected?.key ? "border-primary bg-primary/10" : "bg-card/70 hover:bg-muted/60"}`}
        >
          <span className="flex items-center gap-2">
            <Badge variant={group.kind === "Doublon exact" ? "destructive" : "outline"} className="text-[10px]">{group.kind}</Badge>
            <span className="text-[11px] text-muted-foreground">{group.spells.length} sorts</span>
          </span>
          <span className="mt-1 block truncate text-sm font-semibold">{[...new Set(group.spells.map((spell) => spell.name))].join(" · ")}</span>
        </button>)}
        {!visible.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Aucun groupe ne correspond.</p>}
      </div>
    </aside>

    {selected && <GroupReview key={selected.key + selected.spells.map((spell) => spell.rowNumber).join(",")} group={selected} classes={classes} pending={pending} onMerge={onMerge} onIgnore={onIgnore} onEdit={onEdit} onDelete={onDelete} onDone={() => setSelectedKey(null)} />}
  </div>
}

function GroupReview({ group, classes, pending, onMerge, onIgnore, onEdit, onDelete, onDone }: {
  group: SpellGroup
  classes: ClassRecord[]
  pending: boolean
  onMerge: (keep: ClassSpell, removed: ClassSpell[], draft: ClassSpellDraft) => Promise<boolean>
  onIgnore: (group: SpellGroup) => Promise<boolean>
  onEdit: (spell: ClassSpell) => void
  onDelete: (spell: ClassSpell) => Promise<void>
  onDone: () => void
}) {
  const { spells } = group
  // Par défaut on garde le sort le plus lié aux classes, puis le premier de la feuille.
  const defaultKeep = [...spells].sort((left, right) => Object.keys(right.classRanks).length - Object.keys(left.classRanks).length || left.rowNumber - right.rowNumber)[0]
  const [keepId, setKeepId] = useState(defaultKeep.id)
  const keep = spells.find((spell) => spell.id === keepId) ?? defaultKeep
  // Pour chaque champ, le sort dont on prend la valeur (par défaut : celui qu'on garde).
  const [sources, setSources] = useState<Partial<Record<FieldKey, string>>>({})
  const sourceOf = (key: FieldKey) => spells.find((spell) => spell.id === sources[key]) ?? keep
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState<ClassSpell | null>(null)

  // Classes réunies : chaque classe citée par l'un des sorts. En cas de rangs
  // différents pour une même classe, on choisit.
  const classChoices = useMemo(() => {
    const byClass = new Map<string, number[]>()
    for (const spell of spells) for (const [classId, rank] of Object.entries(spell.classRanks)) byClass.set(classId, [...new Set([...(byClass.get(classId) ?? []), rank])])
    return [...byClass.entries()]
  }, [spells])
  const [rankOverrides, setRankOverrides] = useState<Record<string, number>>({})
  const rankFor = (classId: string, ranks: number[]) => rankOverrides[classId] ?? keep.classRanks[classId] ?? ranks[0]

  const draft: ClassSpellDraft = {
    id: keep.id.startsWith("LIGNE-") ? "" : keep.id,
    name: fieldText(sourceOf("name"), "name"),
    type: fieldText(sourceOf("type"), "type"),
    skillsRaw: fieldText(sourceOf("skillsRaw"), "skillsRaw"),
    distance: fieldText(sourceOf("distance"), "distance"),
    charges: sourceOf("charges").charges,
    effect: sourceOf("effect").effect,
    effectHtml: fieldHtml(sourceOf("effect"), "effect"),
    description: sourceOf("description").description,
    descriptionHtml: fieldHtml(sourceOf("description"), "description"),
    classRanks: Object.fromEntries(classChoices.map(([classId, ranks]) => [classId, rankFor(classId, ranks)])),
  }
  const removed = spells.filter((spell) => spell.id !== keep.id)
  const differing = fields.filter((field) => differs(spells, field.key))
  const tone = (spell: ClassSpell) => spell.tone.background ? spell.tone : classSpellCategoryTones[spell.category]

  return <section className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card/75 px-4 py-3">
      <AlertTriangle className="size-5 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold">{spells.length} sorts semblables</p>
        <p className="text-xs text-muted-foreground">{[...new Set(group.pairs.map((pair) => pair.kind))].join(" · ")} — {differing.length ? `${differing.length} champ${differing.length > 1 ? "s" : ""} différent${differing.length > 1 ? "s" : ""}` : "tous les champs sont identiques"}</p>
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void onIgnore(group).then((ok) => { if (ok) onDone() })}><EyeOff />Ce ne sont pas des doublons</Button>
    </header>

    {/* Comparaison : une colonne par sort, les champs qui diffèrent surlignés. */}
    <div className="overflow-x-auto">
      <div className="grid min-w-full gap-3" style={{ gridTemplateColumns: `repeat(${spells.length}, minmax(16rem, 1fr))` }}>
        {spells.map((spell) => {
          const kept = spell.id === keep.id
          return <article key={spell.id} className={`flex flex-col gap-3 rounded-2xl border bg-card/80 p-4 ${kept ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-start gap-2">
              <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: tone(spell).background }} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-semibold leading-tight">{spell.name}</p>
                <p className="text-[11px] text-muted-foreground">{spell.id.startsWith("LIGNE-") ? "Sans ID" : spell.id} · ligne {spell.rowNumber} de la feuille</p>
              </div>
            </div>
            <Origins spell={spell} classes={classes} />
            <dl className="grid gap-2 text-sm">
              {fields.map((field) => {
                const text = fieldText(spell, field.key)
                const different = differs(spells, field.key)
                return <div key={field.key} className={`rounded-lg px-2 py-1 ${different ? "bg-amber-500/10" : ""}`}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{field.label}{different && <span className="ml-1 text-amber-700">· diffère</span>}</dt>
                  <dd className="mt-0.5">{!text.trim() ? <span className="text-muted-foreground">—</span> : field.rich ? <RichTextView html={fieldHtml(spell, field.key)} className="text-sm leading-6" /> : text}</dd>
                </div>
              })}
            </dl>
            <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
              <Button type="button" size="sm" variant={kept ? "default" : "outline"} onClick={() => { setKeepId(spell.id); setSources({}); setRankOverrides({}) }}>{kept ? <Check /> : null}{kept ? "Sort gardé" : "Garder celui-ci"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(spell)}><Pencil />Modifier</Button>
              <Button type="button" size="icon-sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setDeleting(spell)} aria-label={`Supprimer ${spell.name}`}><Trash2 /></Button>
            </div>
          </article>
        })}
      </div>
    </div>

    {/* Fusion : le sort gardé reçoit, champ par champ, la version choisie. */}
    <section className="rounded-2xl border bg-card/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Combine className="size-5 text-primary" />
        <h3 className="font-display text-xl font-semibold">Fusionner en un seul sort</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">« {keep.name} » (ligne {keep.rowNumber}) est conservé. Pour chaque champ qui diffère, clique la version à garder.</p>

      <div className="mt-4 space-y-3">
        {differing.map((field) => <div key={field.key} className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{field.label}</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(spells.length, 3)}, minmax(0, 1fr))` }}>
            {spells.map((spell) => {
              const active = sourceOf(field.key).id === spell.id
              return <button key={spell.id} type="button" onClick={() => setSources((current) => ({ ...current, [field.key]: spell.id }))} className={`rounded-xl border p-2.5 text-left text-sm transition-colors ${active ? "border-primary bg-primary/10" : "bg-background/50 hover:bg-muted/60"}`}>
                <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{active && <Check className="size-3 text-primary" />}{spell.name}</span>
                {field.rich ? <RichTextView html={fieldHtml(spell, field.key)} className="line-clamp-6 text-sm leading-6" /> : <span>{fieldText(spell, field.key) || "—"}</span>}
              </button>
            })}
          </div>
        </div>)}
        {!differing.length && <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">Tous les champs sont identiques : la fusion garde un seul exemplaire.</p>}

        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Classes et rangs réunis</p>
          {classChoices.length ? <div className="flex flex-wrap gap-2">
            {classChoices.map(([classId, ranks]) => {
              const characterClass = classes.find((item) => item.id === classId)
              return <span key={classId} className="inline-flex items-center gap-2 rounded-full border bg-background/60 py-1 pl-3 pr-1 text-sm font-semibold">
                <span className="size-2 rounded-full" style={{ backgroundColor: characterClass?.accentDark ?? "#888" }} />
                {characterClass?.name ?? classId}
                {ranks.length > 1
                  ? <NativeSelect aria-label={`Rang pour ${characterClass?.name ?? classId}`} value={rankFor(classId, ranks)} onChange={(event) => setRankOverrides((current) => ({ ...current, [classId]: Number(event.target.value) }))} className="h-7 w-28 text-xs">
                      {ranks.map((rank) => <NativeSelectOption key={rank} value={rank}>{rankLabel(rank)}</NativeSelectOption>)}
                    </NativeSelect>
                  : <span className="pr-2 font-normal text-muted-foreground">{rankLabel(ranks[0])}</span>}
              </span>
            })}
          </div> : <p className="text-sm text-muted-foreground">Aucune classe liée.</p>}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">{removed.length === 1 ? `« ${removed[0].name} » sera supprimé.` : `${removed.length} sorts seront supprimés.`} Les créatures qui les utilisaient passeront à « {draft.name} ».</p>
        <Button type="button" disabled={pending || !draft.name.trim()} onClick={() => setConfirming(true)}>{pending ? <LoaderCircle className="animate-spin" /> : <Combine />}Fusionner</Button>
      </div>
    </section>

    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fusionner {spells.length} sorts en « {draft.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>La ligne {keep.rowNumber} est mise à jour, {removed.map((spell) => `« ${spell.name} » (ligne ${spell.rowNumber})`).join(", ")} {removed.length > 1 ? "sont supprimés" : "est supprimé"} de la feuille des sorts. Google Sheets garde l’historique des versions.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onMerge(keep, removed, draft).then((ok) => { if (ok) onDone() })}>Fusionner</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>La ligne {deleting?.rowNumber} est retirée de la feuille des sorts, avec ses liens aux classes.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { if (deleting) void onDelete(deleting); setDeleting(null) }}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}
