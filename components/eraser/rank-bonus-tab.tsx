"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, FileText, LoaderCircle, Plus, RefreshCw } from "lucide-react"

import { CheckCell, ChoiceCell } from "@/components/eraser/index-cells"
import { IndexRowSheet, type RowSheetField } from "@/components/eraser/index-row-sheet"
import { rankBonusTargetOptions, rememberRankBonuses } from "@/components/eraser/rank-bonus"
import { SheetGrid, type SheetGridColumn } from "@/components/eraser/sheet-grid"
import { useCharacterCatalog } from "@/components/eraser/use-character-catalog"
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import { foldCatalogName } from "@/lib/character-catalog"
import {
  isStandardRankBonusHeader,
  RANK_BONUS_CHOICE_HEADER,
  RANK_BONUS_OTHER_HEADER,
  RANK_BONUS_SLOTS,
  RANK_BONUS_SPELL_HEADER,
  rankBonusAmount,
  rankBonusTargetHeader,
  rankBonusValueHeader,
  type RankBonusTable,
} from "@/lib/rank-bonuses"

type LoadedRankBonuses = RankBonusTable & { canEdit?: boolean }

async function fetchRankBonuses(refresh: boolean) {
  const response = await fetch(`/api/classes/rank-bonuses?create=1${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
  const payload = await response.json() as LoadedRankBonuses & { error?: string }
  if (!response.ok) throw new Error(payload.error || "Chargement impossible.")
  return payload
}

const choiceOptions = ["1", "2", "3", "4"].map((value) => ({ value, hint: `Le joueur choisit ${value} bonus parmi ceux du rang.` }))

/**
 * Onglet « Bonus Rang » : les bonus gagnés à chaque rang, communs à toutes les classes,
 * dans le tableau des index. Ils vivent dans l'onglet « Bonus de rang » du classeur des
 * sorts (créé à la première ouverture) ; une case s'écrit d'ici ou de Google Sheets.
 * Chaque colonne a son rôle, comme dans l'index des états : Cible / Valeur (×4), Choix,
 * Sort sur mesure et Autre. « Ajouter un rang » ajoute le rang suivant, sans limite.
 */
const cellKey = (rank: number, column: string) => `${rank}\u0001${foldCatalogName(column)}`

// Le dernier tableau lu : changer d'onglet puis revenir le montre aussitôt, relu derrière.
let knownTable: LoadedRankBonuses | null = null

export function RankBonusTab() {
  const [table, setShownTable] = useState<LoadedRankBonuses | null>(() => knownTable)
  const setTable = useCallback((next: LoadedRankBonuses) => { knownTable = next; rememberRankBonuses(next.bonuses); setShownTable(next) }, [])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")
  const catalog = useCharacterCatalog()
  const targets = useMemo(() => rankBonusTargetOptions(catalog), [catalog])

  async function load(refresh: boolean) {
    setLoading(true)
    setError("")
    try {
      setTable(await fetchRankBonuses(refresh))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchRankBonuses(false)
      .then((payload) => { knownTable = payload; rememberRankBonuses(payload.bonuses); if (active) setShownTable(payload) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const headers = useMemo(() => table?.headers ?? [], [table])
  const byRank = useMemo(() => new Map((table?.rows ?? []).map((row) => [row.rank, row.values])), [table])
  const extras = useMemo(() => headers.filter((header, index) => index > 0 && header && !isStandardRankBonusHeader(header)), [headers])
  const filled = (table?.bonuses ?? []).filter((bonus) => bonus.bonuses.length || bonus.customSpell || bonus.other || bonus.entries.length).length
  const canEdit = Boolean(table?.canEdit)
  const [version, setVersion] = useState(0)
  // Le rang ouvert dans sa fiche (le formulaire des index), et ce qui l'a fait refuser.
  const [openRank, setOpenRank] = useState<string | null>(null)
  const [sheetError, setSheetError] = useState("")
  /**
   * Ce qui est tapé s'affiche tout de suite et le reste tant que Google ne l'a pas confirmé :
   * une réponse arrivée entre-temps (pour une autre case) ne le fait plus disparaître.
   */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Les cases en attente d'envoi : une rafale de saisies (ou un collage) part en une seule requête.
  const pending = useRef(new Map<string, { change: { rank: number; column: string; value: string }; waiters: Array<(ok: boolean) => void> }>())
  const timer = useRef<number | null>(null)
  const sending = useRef<Promise<void>>(Promise.resolve())
  const lastError = useRef("")

  const valueOf = useCallback((rowKey: string, columnKey: string) => {
    const rank = Number(rowKey)
    if (columnKey === "__rank") return `Rang ${rank}`
    const typed = overrides[cellKey(rank, columnKey)]
    if (typed !== undefined) return typed
    const column = headers.findIndex((header) => foldCatalogName(header) === foldCatalogName(columnKey))
    return column >= 0 ? byRank.get(rank)?.[column] ?? "" : ""
  }, [byRank, headers, overrides])

  const flush = useCallback(() => {
    timer.current = null
    const batch = [...pending.current.entries()]
    pending.current.clear()
    if (!batch.length) return
    setSaving(true)
    sending.current = sending.current.then(async () => {
      let ok = true
      try {
        const response = await fetch("/api/classes/rank-bonuses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changes: batch.map(([, item]) => item.change) }) })
        const payload = await response.json().catch(() => ({})) as LoadedRankBonuses & { error?: string }
        if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.")
        setTable(payload)
        setError("")
      } catch (reason) {
        ok = false
        lastError.current = reason instanceof Error ? reason.message : "Enregistrement impossible."
        setError(lastError.current)
        setVersion((current) => current + 1)
      }
      // Confirmées (ou refusées) : ces cases montrent de nouveau la feuille, sauf celles retapées depuis.
      setOverrides((current) => {
        const next = { ...current }
        for (const [key, item] of batch) if (next[key] === item.change.value && !pending.current.has(key)) delete next[key]
        return next
      })
      for (const [, item] of batch) for (const resolve of item.waiters) resolve(ok)
      if (!pending.current.size && !timer.current) setSaving(false)
    })
  }, [setTable])

  /** Met une case en attente d'envoi ; vrai une fois enregistrée dans Google Sheets. */
  const save = useCallback((rank: number, column: string, value: string) => new Promise<boolean>((resolve) => {
    const key = cellKey(rank, column)
    const previous = pending.current.get(key)
    pending.current.set(key, { change: { rank, column, value }, waiters: [...(previous?.waiters ?? []), resolve] })
    setOverrides((current) => ({ ...current, [key]: value }))
    setSaving(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 350)
  }), [flush])

  // Quitter l'onglet n'abandonne pas une saisie pas encore partie.
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); flush() } }, [flush])

  /** Les bonus d'un rang, enregistrés d'eux-mêmes par sa fiche, en une seule écriture. */
  async function saveSheet(rowKey: string, changes: Record<string, string>) {
    setSheetError("")
    const results = await Promise.all(Object.entries(changes).map(([column, value]) => save(Number(rowKey), column, value)))
    if (results.every(Boolean)) return
    const message = lastError.current || "Ce bonus n’a pas pu être enregistré dans Google Sheets."
    setSheetError(message)
    throw new Error(message)
  }

  // La fiche d'un rang : les mêmes colonnes que le tableau, avec leurs listes et leur case à cocher.
  const sheetFields: RowSheetField[] = openRank === null ? [] : [
    ...Array.from({ length: RANK_BONUS_SLOTS }, (_, index) => index + 1).flatMap((slot): RowSheetField[] => [
      { key: rankBonusTargetHeader(slot), label: rankBonusTargetHeader(slot), spec: { kind: "choice", options: targets.options, groups: targets.groups, readOnly: !canEdit }, value: valueOf(openRank, rankBonusTargetHeader(slot)) },
      { key: rankBonusValueHeader(slot), label: rankBonusValueHeader(slot), spec: { kind: "fixed", readOnly: !canEdit, description: "+5, -2… ajouté au bonus/malus de la cible." }, value: valueOf(openRank, rankBonusValueHeader(slot)) },
    ]),
    { key: RANK_BONUS_CHOICE_HEADER, label: RANK_BONUS_CHOICE_HEADER, spec: { kind: "choice", options: choiceOptions, readOnly: !canEdit, description: "Combien de bonus le joueur choisit. Vide : tous." }, value: valueOf(openRank, RANK_BONUS_CHOICE_HEADER) },
    { key: RANK_BONUS_SPELL_HEADER, label: RANK_BONUS_SPELL_HEADER, spec: { kind: "checkbox", readOnly: !canEdit }, value: valueOf(openRank, RANK_BONUS_SPELL_HEADER) },
    { key: RANK_BONUS_OTHER_HEADER, label: RANK_BONUS_OTHER_HEADER, spec: { kind: "fixed", readOnly: !canEdit }, value: valueOf(openRank, RANK_BONUS_OTHER_HEADER), long: true },
    ...extras.map((column) => ({ key: column, label: column, spec: { kind: "fixed" as const, readOnly: !canEdit }, value: valueOf(openRank, column), long: true })),
  ]

  async function addRank() {
    setAdding(true)
    setError("")
    try {
      const response = await fetch("/api/classes/rank-bonuses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add-rank" }) })
      const payload = await response.json() as LoadedRankBonuses & { error?: string }
      if (!response.ok) throw new Error(payload.error || "Le rang n’a pas pu être ajouté.")
      setTable(payload)
      setVersion((current) => current + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le rang n’a pas pu être ajouté.")
    } finally {
      setAdding(false)
    }
  }

  const gridColumns = useMemo<SheetGridColumn[]>(() => {
    const rankOf = (rowKey: string) => Number(rowKey)
    const slots = Array.from({ length: RANK_BONUS_SLOTS }, (_, index) => index + 1).flatMap((slot): SheetGridColumn[] => [
      {
        key: rankBonusTargetHeader(slot),
        label: rankBonusTargetHeader(slot),
        width: 210,
        plain: true,
        typeLabel: "Liste déroulante",
        description: "Une caractéristique ou une compétence de la fiche. « Caractéristique » : le joueur répartit la valeur entre ses caractéristiques principales ; « Déplacement » : l’action de déplacement gratuite.",
        control: (rowKey) => <ChoiceCell label={`${rankBonusTargetHeader(slot)} du rang ${rowKey}`} value={valueOf(rowKey, rankBonusTargetHeader(slot))} options={targets.options} groups={targets.groups} disabled={!canEdit} onChange={(next) => void save(rankOf(rowKey), rankBonusTargetHeader(slot), next)} />,
      },
      {
        key: rankBonusValueHeader(slot),
        label: rankBonusValueHeader(slot),
        width: 96,
        plain: true,
        typeLabel: "Nombre",
        description: `Ce que gagne la Cible ${slot} : +5, -2… Ajouté au bonus/malus de la fiche (jamais au modificateur, réservé à ce qui est temporaire).`,
        cellClassName: "tabular-nums",
        sortKey: (value) => rankBonusAmount(value),
      },
    ])
    return [
      { key: "__rank", label: "Rang", width: 96, plain: true, computed: true, control: (rowKey: string) => <button type="button" onClick={() => { setSheetError(""); setOpenRank(rowKey) }} className="flex min-h-8 w-full items-center px-2 text-left font-semibold underline-offset-4 hover:text-primary hover:underline" title="Ouvrir la fiche du rang">Rang {rowKey}</button>, typeLabel: "Rang", description: "Le rang gagné par le personnage (son Level). Les rangs peuvent dépasser 20 : « Ajouter un rang ».", sortKey: (value) => Number(value.replace(/\D/g, "")) || 0 },
      ...slots,
      {
        key: RANK_BONUS_CHOICE_HEADER,
        label: RANK_BONUS_CHOICE_HEADER,
        width: 96,
        plain: true,
        typeLabel: "Liste déroulante",
        description: "Combien de ces bonus le joueur choisit (1 à 4). Vide : il les a tous.",
        control: (rowKey) => <ChoiceCell label={`Choix du rang ${rowKey}`} value={valueOf(rowKey, RANK_BONUS_CHOICE_HEADER)} options={choiceOptions} disabled={!canEdit} onChange={(next) => void save(rankOf(rowKey), RANK_BONUS_CHOICE_HEADER, next)} />,
      },
      {
        key: RANK_BONUS_SPELL_HEADER,
        label: RANK_BONUS_SPELL_HEADER,
        width: 120,
        plain: true,
        typeLabel: "Case à cocher",
        description: "Cochée : au passage de rang, le joueur cherche un sort et l’ajoute à sa fiche.",
        control: (rowKey) => <CheckCell label={`Sort sur mesure au rang ${rowKey}`} value={valueOf(rowKey, RANK_BONUS_SPELL_HEADER)} disabled={!canEdit} onChange={(next) => void save(rankOf(rowKey), RANK_BONUS_SPELL_HEADER, next)} />,
      },
      { key: RANK_BONUS_OTHER_HEADER, label: RANK_BONUS_OTHER_HEADER, width: 260, plain: true, typeLabel: "Texte", description: "Un autre avantage, affiché tel quel au passage de rang." },
      ...extras.map((column) => ({ key: column, label: column, width: 220, plain: true, typeLabel: "Texte", description: "Colonne ajoutée dans Google Sheets : affichée telle quelle sous le rang." })),
    ]
  }, [canEdit, extras, save, targets, valueOf])
  const rows = useMemo(() => (table?.rows ?? []).map((row, index) => ({ key: String(row.rank), rowNumber: index + 1 })), [table])

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/75 px-4 py-3">
      <div>
        <p className="font-display text-lg font-semibold">Bonus gagnés à chaque rang</p>
        <p className="text-xs text-muted-foreground">Les mêmes pour toutes les classes. Au passage de rang, la fiche de personnage les propose avec le nouveau sort et les ajoute au bonus/malus de leur cible. {table?.exists ? `${filled} rang${filled > 1 ? "s" : ""} sur ${rows.length} renseigné${filled > 1 ? "s" : ""}.` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canEdit && table?.exists && <Button type="button" variant="outline" size="sm" disabled={adding} onClick={() => void addRank()}>{adding ? <LoaderCircle className="animate-spin" /> : <Plus />}Ajouter un rang</Button>}
        {saving && <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-3.5 animate-spin" />Enregistrement…</span>}
        <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void load(true)}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
        {table?.sheetUrl && <Button asChild variant="outline" size="sm"><a href={table.sheetUrl} target="_blank" rel="noreferrer">Ouvrir dans Sheets<ExternalLink /></a></Button>}
      </div>
    </div>
    {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {table && !table.exists && <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">L’onglet « Bonus de rang » n’existe pas encore dans le classeur des sorts.</p>}
    {table?.exists && <SheetGrid
      layoutKey="eraser:rank-bonus:grid:v2"
      columns={gridColumns}
      rows={rows}
      valueOf={valueOf}
      onCommit={(rowKey, columnKey, value) => { if (columnKey !== "__rank") void save(Number(rowKey), columnKey, value) }}
      readOnly={!canEdit}
      version={version}
      empty="Aucun rang : « Ajouter un rang » crée le premier."
      rowMenuExtras={(rowKey) => <>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => { setSheetError(""); setOpenRank(rowKey) }}><FileText />Ouvrir la fiche</ContextMenuItem>
      </>}
    />}
    {openRank !== null && <IndexRowSheet
      open
      rowKey={openRank}
      title={`Rang ${openRank}`}
      subtitle="Bonus de rang · communs à toutes les classes"
      fields={sheetFields}
      error={sheetError}
      navigation={{ rows: rows.map((row) => row.key), labelOf: (key) => `Rang ${key}`, onGo: (key) => { setSheetError(""); setOpenRank(key) } }}
      onSave={saveSheet}
      onClose={() => { setOpenRank(null); setSheetError("") }}
    />}
  </section>
}
