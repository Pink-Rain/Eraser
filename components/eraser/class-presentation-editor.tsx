"use client"

import { useEffect, useState } from "react"
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react"

import { RichTextInlineEditor } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import type { ClassPresentation, EditableClassList } from "@/lib/class-content"

type Loaded = { presentation: ClassPresentation | null; sheetUrl: string }

function plainText(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").trim()
}

function OverviewList({ label, field, save }: { label: string; field: EditableClassList; save: (column: number, value: string) => Promise<void> }) {
  const entries = field.entries.filter((entry) => entry.value)
  if (!entries.length) return null
  return <section className="min-w-0">
    <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{label}</p>
    <div className="mt-2 flex flex-wrap gap-2">{entries.map((entry, index) => <RichTextInlineEditor key={`${entry.column}:${index}`} html={entry.html} fallback={entry.value} canEdit onSave={(html) => save(entry.column, html)} className="rounded-full border bg-background/55 px-3 py-1.5 text-sm" />)}</div>
  </section>
}

/**
 * La présentation d'une classe (caractéristiques et spécialités), modifiable ici au
 * double-clic. C'est le seul endroit d'Eraser où elle se modifie : Règles › Classes la
 * montre seulement. Elle vit dans la feuille « Présentation des classes ».
 */
export function ClassPresentationEditor({ classId, accent }: { classId: string; accent: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let alive = true
    fetch(`/api/classes/content?classId=${encodeURIComponent(classId)}${refreshTick ? "&refresh=1" : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as Partial<Loaded> & { error?: string }
        if (!response.ok) throw new Error(payload.error || "La présentation n’a pas pu être lue.")
        if (alive) { setLoaded({ presentation: payload.presentation ?? null, sheetUrl: payload.sheetUrl ?? "" }); setError("") }
      })
      .catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "La présentation n’a pas pu être lue.") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [classId, refreshTick])

  const presentation = loaded?.presentation ?? null

  async function save(column: number, html: string) {
    if (!presentation) return
    // La colonne est désignée par son en-tête (et son rang parmi les en-têtes identiques) :
    // une colonne insérée ou déplacée entre-temps ne fait pas écrire dans un autre champ.
    const header = presentation.headers[column] ?? ""
    const occurrence = presentation.headers.slice(0, column).filter((item) => item.trim() === header.trim()).length
    setError("")
    const response = await fetch("/api/classes/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-presentation", classId, header, occurrence, value: html }) }).catch(() => null)
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null) as { error?: string } | null | undefined
      const message = payload?.error || "Cette modification n’a pas pu être enregistrée dans Google Sheets."
      setError(message)
      // L'éditeur reste ouvert : le texte saisi n'est pas perdu.
      throw new Error(message)
    }
    const text = plainText(html)
    setLoaded((current) => {
      if (!current?.presentation) return current
      const next = structuredClone(current.presentation)
      next.specialties.forEach((item) => {
        if (item.titleColumn === column) { item.title = text; item.titleHtml = html }
        if (item.textColumn === column) { item.text = text; item.textHtml = html }
      })
      for (const group of [next.primaryCharacteristics, next.secondaryCharacteristics]) group.entries.forEach((item) => { if (item.column === column) { item.value = text; item.html = html } })
      return { ...current, presentation: next }
    })
  }

  return <div className="rounded-2xl border bg-card/60 p-4" style={{ borderColor: `${accent}32` }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Double-clique sur un texte pour le modifier. C’est ce que montre la page de la classe dans Règles.</p>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => { setLoading(true); setRefreshTick((tick) => tick + 1) }}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualiser</Button>
        {loaded?.sheetUrl && <Button asChild size="sm" variant="ghost"><a href={loaded.sheetUrl} target="_blank" rel="noreferrer">Ouvrir dans Sheets<ExternalLink /></a></Button>}
      </div>
    </div>
    {error && <p className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
    {loading && !loaded ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Lecture de la présentation…</p>
      : loaded && !presentation ? <p className="mt-3 rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Cette classe n’a pas encore de ligne dans la feuille « Présentation des classes ».</p>
        : presentation && <>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <OverviewList label="Caractéristiques principales" field={presentation.primaryCharacteristics} save={save} />
            <OverviewList label="Caractéristiques secondaires" field={presentation.secondaryCharacteristics} save={save} />
          </div>
          {presentation.specialties.length > 0 && <div className="mt-5 border-t pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Spécialités</p>
            <div className="mt-2 divide-y">{presentation.specialties.map((specialty) => <div key={specialty.index} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
              <RichTextInlineEditor html={specialty.titleHtml} fallback={specialty.title} canEdit={specialty.titleColumn !== null} onSave={(html) => save(specialty.titleColumn!, html)} className="font-display font-semibold" />
              <RichTextInlineEditor html={specialty.textHtml} fallback={specialty.text} canEdit={specialty.textColumn !== null} onSave={(html) => save(specialty.textColumn!, html)} className="text-sm leading-6 text-muted-foreground" />
            </div>)}</div>
          </div>}
        </>}
  </div>
}
