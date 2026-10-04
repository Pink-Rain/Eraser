"use client"

import { useMemo, useState, type ReactNode } from "react"
import { LoaderCircle, Save } from "lucide-react"

import { IndexField, type IndexFieldProps } from "@/components/eraser/index-cells"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IndexLayoutView, largeFieldClass } from "@/components/eraser/index-layout-view"
import { normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { arrangeLayout, type IndexLayout } from "@/lib/index-layouts"

export type RowSheetField = { key: string; label: string; spec: IndexColumnSpec; value: string; long?: boolean }

const pictureField = (spec: IndexColumnSpec) => spec.kind === "file" && spec.file?.accept === "image" && !spec.file.multiple

/**
 * La fiche d'une ligne : tous ses champs (ceux du tableau et ceux du formulaire
 * seulement), modifiables ensemble. C'est ce qu'ouvre un Nom formulaire dans un index
 * qui n'a pas de fiche dédiée (les créatures gardent la leur).
 */
export function IndexRowSheet({ open, title, subtitle, fields, layout, rowFor, pending = false, error = "", footer, onSave, onClose }: {
  open: boolean
  title: string
  subtitle?: string
  fields: RowSheetField[]
  /** La mise en page de la fiche de l'onglet (« Modifier » › Mise en page) ; absente : automatique. */
  layout?: IndexLayout | null
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
    try {
      await onSave(changes)
      setDrafts({})
    } catch {
      // Enregistrement refusé : la page en affiche la raison, et les champs saisis restent pour réessayer.
    }
  }

  const field = (item: RowSheetField, hideLabel = false) => <IndexField
    key={item.key}
    label={item.label}
    // Dans la fiche, le nom se modifie : il n'ouvre pas une autre fiche.
    spec={item.spec.kind === "name-form" ? { ...item.spec, kind: "name" } : item.spec}
    value={valueOf(item)}
    long={item.long}
    hideLabel={hideLabel}
    disabled={pending}
    row={rowFor?.(item.key)}
    onChange={(value) => setDrafts((current) => ({ ...current, [item.key]: value }))}
  />
  // Une mise en page réglée dans « Modifier » : ses sections, ses lignes et sa colonne latérale.
  // Rangés par le nom de leur colonne (l'index des objets désigne ses champs par leur place).
  const arranged = layout ? arrangeLayout(layout, fields.filter((item) => normalizeSpec(item.spec).kind !== "id"), (item) => item.label) : null

  return <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
    <DialogContent className={`flex max-h-[92svh] flex-col gap-4 ${arranged?.aside.length ? "sm:max-w-5xl" : "sm:max-w-4xl"}`}>
      <DialogHeader>
        <DialogTitle className="font-display text-3xl">{title || "Sans nom"}</DialogTitle>
        {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {arranged
          ? <IndexLayoutView
            arranged={arranged}
            render={(item, placed) => <div className={placed.large ? largeFieldClass : undefined}>{field(item, placed.hideLabel)}</div>}
            renderRest={(rest) => <div className="grid content-start gap-3 md:grid-cols-2">{rest.map((item) => field(item))}</div>}
          />
          : <div className={pictures.length ? "grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]" : ""}>
            <div className="grid content-start gap-3 md:grid-cols-2">{others.map((item) => field(item))}</div>
            {pictures.length > 0 && <div className="grid content-start gap-3">{pictures.map((item) => field(item))}</div>}
          </div>}
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
