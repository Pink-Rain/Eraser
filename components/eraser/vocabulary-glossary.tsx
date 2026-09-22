"use client"

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Check, Plus, Trash2, X } from "lucide-react"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RichTextField, RichTextView } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { VocabularyEntry } from "@/lib/vocabulary"

type Draft = { title: string; content: string }

/** « Écho » se range sous E, « 3e cercle » sous #. */
function initialOf(title: string) {
  const letter = title.normalize("NFD").replace(/\p{M}/gu, "").trim().charAt(0).toUpperCase()
  return /^[A-Z]$/.test(letter) ? letter : "#"
}

function groupByInitial(entries: VocabularyEntry[]) {
  const groups = new Map<string, VocabularyEntry[]>()
  for (const entry of entries) {
    const letter = initialOf(entry.title)
    groups.set(letter, [...(groups.get(letter) ?? []), entry])
  }
  return [...groups.entries()].sort(([left], [right]) => left === "#" ? -1 : right === "#" ? 1 : left.localeCompare(right))
}

async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
  const response = await fetch("/api/vocabulary", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => ({}))) as { entries?: VocabularyEntry[]; error?: string }
  if (!response.ok || !payload.entries) throw new Error(payload.error || "Enregistrement impossible.")
  return payload.entries
}

function EntryForm({ initial, submitLabel, pending, error, onSubmit, onCancel, extra }: {
  initial: Draft
  submitLabel: string
  pending: boolean
  error: string
  onSubmit: (draft: Draft) => void
  onCancel: () => void
  extra?: ReactNode
}) {
  const [title, setTitle] = useState(initial.title)
  // L'éditeur n'est pas contrôlé : on retient seulement la dernière valeur qu'il a remise.
  const content = useRef(initial.content)

  function submit(event: FormEvent) {
    event.preventDefault()
    // L'éditeur remet son contenu au blur, de façon synchrone : on le force avant de lire.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onSubmit({ title, content: content.current })
  }

  return <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card/80 p-4 shadow-[0_8px_25px_rgb(67_50_31/0.08)]">
    <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titre (le mot ou l’expression)" maxLength={160} className="font-display text-lg font-semibold" />
    <RichTextField value={initial.content} onCommit={(html) => { content.current = html }} placeholder="Définition, précisions, exemples…" minHeight="min-h-32" toolbar="always" />
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {extra}
      <Button type="button" variant="ghost" className="ml-auto" onClick={onCancel} disabled={pending}><X />Annuler</Button>
      <Button type="submit" disabled={pending || !title.trim()}><Check />{pending ? "Enregistrement…" : submitLabel}</Button>
    </div>
  </form>
}

export function VocabularyGlossary({ initialEntries, canEdit, loadError }: { initialEntries: VocabularyEntry[]; canEdit: boolean; loadError: string }) {
  const [entries, setEntries] = useState(initialEntries)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<VocabularyEntry | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const groups = useMemo(() => groupByInitial(entries), [entries])

  async function run(action: () => Promise<VocabularyEntry[]>, done: () => void) {
    setPending(true)
    setError("")
    try {
      setEntries(await action())
      done()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.")
    } finally {
      setPending(false)
    }
  }

  function startEditing(entry: VocabularyEntry) {
    if (!canEdit || pending) return
    setAdding(false)
    setError("")
    setEditing(entry)
  }

  return <>
    {canEdit && <div className="-mt-2 flex justify-end md:-mt-16">
      <Button type="button" variant={adding ? "outline" : "default"} onClick={() => { setAdding((open) => !open); setEditing(null); setError("") }}>
        {adding ? <X /> : <Plus />}
        {adding ? "Fermer" : "Ajouter du vocabulaire"}
      </Button>
    </div>}

    {canEdit && adding && <div className="mx-auto mt-6 max-w-3xl">
      <EntryForm
        initial={{ title: "", content: "" }}
        submitLabel="Ajouter"
        pending={pending}
        error={error}
        onCancel={() => { setAdding(false); setError("") }}
        onSubmit={(draft) => void run(() => send("POST", draft), () => setAdding(false))}
      />
    </div>}

    {loadError && <div className="mt-10 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">{loadError}</div>}

    {!loadError && entries.length === 0 && <div className="mt-10 rounded-2xl border border-dashed bg-card/55 px-6 py-12 text-center text-sm text-muted-foreground">
      {canEdit ? "Aucun mot pour l’instant. Commence le dictionnaire avec « Ajouter du vocabulaire »." : "Le dictionnaire est encore vide."}
    </div>}

    {groups.length > 0 && <nav aria-label="Lettres" className="mt-10 flex flex-wrap justify-center gap-1 border-y border-border/60 py-2">
      {groups.map(([letter]) => <a key={letter} href={`#lettre-${letter}`} className="grid size-8 place-items-center rounded-md font-display text-lg font-semibold text-primary/80 hover:bg-primary/10 hover:text-primary">{letter}</a>)}
    </nav>}

    <div className="mt-8 space-y-4">
      {groups.map(([letter, items]) => <section key={letter} id={`lettre-${letter}`} aria-label={`Lettre ${letter}`} className="grid scroll-mt-6 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 border-b border-border/60 pb-8 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-10">
        <div aria-hidden="true" className="sticky top-4 self-start text-center font-display text-6xl font-semibold leading-none text-foreground/90 sm:text-[7.5rem]">{letter}</div>
        <div className="min-w-0 space-y-7 pt-3 sm:pt-6">
          {items.map((entry) => editing?.rowNumber === entry.rowNumber && editing.title === entry.title
            ? <EntryForm
              key={`edit-${entry.rowNumber}`}
              initial={{ title: entry.title, content: entry.content }}
              submitLabel="Enregistrer"
              pending={pending}
              error={error}
              onCancel={() => { setEditing(null); setError("") }}
              onSubmit={(draft) => void run(() => send("PATCH", { rowNumber: entry.rowNumber, expectedTitle: entry.title, ...draft }), () => setEditing(null))}
              extra={<AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}><Trash2 />Supprimer</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer « {entry.title} » ?</AlertDialogTitle>
                    <AlertDialogDescription>La ligne sera retirée de la feuille « Vocabulaire » dans Google Drive.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void run(() => send("DELETE", { rowNumber: entry.rowNumber, expectedTitle: entry.title }), () => setEditing(null))}>Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>}
            />
            : <article key={`${entry.rowNumber}-${entry.title}`} className="min-w-0">
              <h2
                onDoubleClick={canEdit ? () => startEditing(entry) : undefined}
                title={canEdit ? "Double-cliquer pour modifier" : undefined}
                className={`font-display text-2xl font-semibold tracking-[-0.01em] ${canEdit ? "cursor-text select-none rounded-md decoration-primary/40 decoration-dotted underline-offset-4 hover:underline" : ""}`}
              >
                {entry.title} :
              </h2>
              <RichTextView html={entry.content} className="mt-1.5 text-base leading-7 text-foreground/85" />
            </article>)}
        </div>
      </section>)}
    </div>
  </>
}
