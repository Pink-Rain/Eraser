"use client"

import { useMemo, useState, type ReactNode } from "react"
import { LoaderCircle, Save } from "lucide-react"

import { IndexField, type IndexFieldProps } from "@/components/eraser/index-cells"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"

export type RowSheetField = { key: string; label: string; spec: IndexColumnSpec; value: string; long?: boolean }

const pictureField = (spec: IndexColumnSpec) => spec.kind === "file" && spec.file?.accept === "image" && !spec.file.multiple

/**
 * La fiche d'une ligne : tous ses champs (ceux du tableau et ceux du formulaire
 * seulement), modifiables ensemble. C'est ce qu'ouvre un Nom formulaire dans un index
 * qui n'a pas de fiche dédiée (les créatures gardent la leur).
 */
export function IndexRowSheet({ open, title, subtitle, fields, rowFor, pending = false, error = "", footer, onSave, onClose }: {
  open: boolean
  title: string
  subtitle?: string
  fields: RowSheetField[]
  /** Les calculs, tirages et boutons propres à chaque champ de la ligne. */
  rowFor?: (key: string) => IndexFieldProps["row"]
  pending?: boolean
  error?: string
  footer?: ReactNode
  onSave: (changes: Record<string, string>) => Promise<void> | void
  onClose: () => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const valueOf = (field: RowSheetField) => drafts[field.key] ?? field.value
  const changes = useMemo(() => Object.fromEntries(fields.flatMap((field) => field.key in drafts && drafts[field.key] !== field.value ? [[field.key, drafts[field.key]]] : [])), [drafts, fields])
  const changed = Object.keys(changes).length
  const pictures = fields.filter((field) => pictureField(normalizeSpec(field.spec)))
  const others = fields.filter((field) => !pictureField(normalizeSpec(field.spec)) && normalizeSpec(field.spec).kind !== "id")
  const id = fields.find((field) => normalizeSpec(field.spec).kind === "id")

  function close() {
    if (changed && !window.confirm("Fermer sans enregistrer les changements de la fiche ?")) return
    setDrafts({})
    onClose()
  }

  async function save() {
    await onSave(changes)
    setDrafts({})
  }

  const field = (item: RowSheetField) => <IndexField
    key={item.key}
    label={item.label}
    // Dans la fiche, le nom se modifie : il n'ouvre pas une autre fiche.
    spec={item.spec.kind === "name-form" ? { ...item.spec, kind: "name" } : item.spec}
    value={valueOf(item)}
    long={item.long}
    disabled={pending}
    row={rowFor?.(item.key)}
    onChange={(value) => setDrafts((current) => ({ ...current, [item.key]: value }))}
  />

  return <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
    <DialogContent className="flex max-h-[92svh] flex-col gap-4 sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="font-display text-3xl">{title || "Sans nom"}</DialogTitle>
        {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className={pictures.length ? "grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]" : ""}>
          <div className="grid content-start gap-3 md:grid-cols-2">{others.map(field)}</div>
          {pictures.length > 0 && <div className="grid content-start gap-3">{pictures.map(field)}</div>}
        </div>
        {!fields.length && <p className="py-8 text-center text-sm text-muted-foreground">Aucun champ dans la fiche : règle l’emplacement des colonnes dans « Modifier ».</p>}
      </div>
      {error && <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">{id?.value ? `ID ${id.value}` : ""}</span>
        <span className="flex flex-wrap items-center gap-2">
          {footer}
          <Button type="button" variant="outline" onClick={close} disabled={pending}>Fermer</Button>
          <Button type="button" onClick={() => void save()} disabled={pending || !changed}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}Enregistrer{changed ? ` (${changed})` : ""}</Button>
        </span>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
