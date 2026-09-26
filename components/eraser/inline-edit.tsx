"use client"

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { Check, LoaderCircle, X } from "lucide-react"

import { useCommitOnLeave } from "@/components/eraser/use-commit-on-leave"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type InlineEditProps = {
  label: string
  value: string
  onCommit: (value: string) => Promise<void>
  compact?: boolean
  multiline?: boolean
  numeric?: boolean
  singleClick?: boolean
  /**
   * « span » : déclencheur non interactif, pour un champ posé dans un en-tête repliable
   * (<summary>) — un bouton y empêcherait le clic d'ouvrir ou de fermer la carte.
   */
  trigger?: "button" | "span"
  children?: ReactNode
}

/** Valeur de fiche modifiable au double-clic (ou au clic avec `singleClick`), enregistrée en quittant le champ. */
export function InlineEdit({ label, value, onCommit, compact, multiline, numeric, singleClick, trigger = "button", children }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [pending, setPending] = useState(false)
  // Enregistré dès qu'on clique ailleurs ou que le survol se referme, sans Entrée.
  const leave = useCommitOnLeave(editing, draft, value, onCommit)

  function start() { setDraft(value); setEditing(true) }

  async function save() {
    setPending(true)
    const done = await leave.save()
    setPending(false)
    if (done) setEditing(false)
  }

  function cancel() { leave.cancel(); setDraft(value); setEditing(false) }

  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") cancel()
    if (!multiline && event.key === "Enter") void save()
  }

  // Les boutons gardent le focus dans le champ : cliquer dessus ne déclenche pas d'enregistrement par perte du focus.
  const keepFocus = (event: MouseEvent) => event.preventDefault()
  if (editing) return <div className={compact ? "flex min-w-0 items-center gap-1" : "flex items-start gap-1"}>{multiline ? <Textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} onBlur={() => void save()} className="min-h-24" /> : <Input autoFocus type={numeric ? "number" : "text"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} onBlur={() => void save()} className={compact ? "h-8 min-w-16 px-2" : "h-9"} />}<button type="button" onMouseDown={keepFocus} onClick={() => void save()} disabled={pending} className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10" aria-label={`Enregistrer ${label}`}>{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}</button><button type="button" onMouseDown={keepFocus} onClick={cancel} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Annuler"><X className="size-3.5" /></button></div>

  const content = children ?? <span className={value ? "" : "text-muted-foreground/55"}>{value || "Non renseigné"}</span>
  const title = singleClick ? "Cliquer pour modifier" : "Double-cliquer pour modifier"
  if (trigger === "span") return <span role="button" tabIndex={0} onClick={singleClick ? start : undefined} onDoubleClick={!singleClick ? start : undefined} onKeyDown={(event) => { if (event.key === "F2") { event.preventDefault(); start() } }} className="min-w-0 text-left" title={title}>{content}</span>
  return <button type="button" onClick={singleClick ? start : undefined} onDoubleClick={!singleClick ? start : undefined} className="min-w-0 text-left" title={title}>{content}</button>
}
