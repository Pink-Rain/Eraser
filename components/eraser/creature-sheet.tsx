"use client"

import { useMemo, useState } from "react"
import { Check, LoaderCircle } from "lucide-react"

import { CharacteristicInputs } from "@/components/eraser/characteristic-fields"
import { ImageField, IndexField, SpellsField } from "@/components/eraser/index-cells"
import { TokenButton } from "@/components/eraser/token-editor"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isImageSource, isRichSpec } from "@/lib/index-columns"
import {
  creatureCharacteristics,
  creatureNoteHeader,
  foldName,
  worldColumnSpec,
} from "@/lib/world-index-definitions"

/** Les champs de la fiche, par en-tête de colonne dans la feuille. */
const identityFields = ["Nom", "Rang", "Taille", "Poids", "Type", "Sous-type", "Dressable", "Organisation", "Comportement", "Langue"]
const placeFields = ["Emplacement principal", "Rareté", "Emplacement secondaire", "Rareté secondaire"]
const allFields = ["Portrait", ...identityFields, ...placeFields, ...creatureCharacteristics, creatureNoteHeader, "Sorts actifs", "Sorts passifs"]

const specOf = (header: string) => worldColumnSpec("creatures", "Créatures", header)

/** Le token d'une créature suit l'image importée dans Drive (elle n'a pas d'autre identifiant). */
function creatureTokenId(portrait: string) {
  return portrait.match(/\/api\/resources\/creature-portraits\/([\w-]+)/)?.[1] || ""
}

/** Le portrait d'une créature est rangé avec les autres portraits de créatures : son token en dépend. */
async function uploadCreaturePortrait(file: File, previous: string) {
  const form = new FormData()
  form.set("file", file)
  const id = creatureTokenId(previous)
  if (id) form.set("id", id)
  const response = await fetch("/api/resources/creature-portraits", { method: "POST", body: form })
  const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !payload.url) throw new Error(payload.error || "Le portrait n’a pas pu être importé.")
  return payload.url
}

/**
 * La fiche d'une créature. Elle s'ouvre d'un clic sur le nom (colonne « Nom
 * formulaire ») dans l'Index des créatures, pré-remplie avec ce que la ligne contient
 * déjà, et enregistre toutes les colonnes de la feuille — y compris les colonnes
 * formulaire, que le tableau n'affiche pas. Chaque champ est celui de son type.
 */
export function CreatureSheetDialog({ open, headers, values, html, onClose, onSave }: {
  open: boolean
  headers: string[]
  values: string[]
  /** Les mêmes cellules avec leur mise en forme, pour les champs de texte enrichi. */
  html: string[]
  onClose: () => void
  /** Les champs changés, et ce que la fiche en montrait : le serveur refuse si l'un a changé ailleurs entre-temps. */
  onSave: (fields: Record<string, string>, previous: Record<string, string>) => Promise<void>
}) {
  const initial = useMemo(() => Object.fromEntries(allFields.map((field) => {
    const index = headers.findIndex((header) => foldName(header) === foldName(field))
    const rich = isRichSpec(specOf(field))
    return [field, index >= 0 ? (rich ? html[index] || values[index] : values[index]) ?? "" : ""]
  })), [headers, html, values])
  const [fields, setFields] = useState<Record<string, string>>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const set = (field: string, value: string) => setFields((current) => ({ ...current, [field]: value }))

  async function save() {
    if (!fields.Nom.trim()) return setError("Le nom est obligatoire.")
    setPending(true); setError("")
    try {
      const changed = Object.entries(fields).filter(([field, value]) => value !== initial[field])
      await onSave(Object.fromEntries(changed), Object.fromEntries(changed.map(([field]) => [field, initial[field] ?? ""])))
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La fiche n’a pas pu être enregistrée.")
    }
    setPending(false)
  }

  const field = (name: string) => <IndexField
    key={name}
    label={name}
    // Dans la fiche, le nom se saisit : il n'ouvre pas une autre fiche.
    spec={name === "Nom" ? { kind: "name", also: ["fixed"] } : specOf(name)}
    value={fields[name] ?? ""}
    onChange={(value) => set(name, value)}
  />

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle className="font-display text-3xl">{fields.Nom || "Nouvelle créature"}</DialogTitle>
        <DialogDescription>Fiche complète de la créature, enregistrée dans la feuille « Index des créatures ».</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <ImageField label={`Portrait de ${fields.Nom || "la créature"}`} value={fields.Portrait ?? ""} upload={uploadCreaturePortrait} onChange={(value) => set("Portrait", value)}>
          <TokenButton kind="creature" ownerId={creatureTokenId(fields.Portrait ?? "")} name={fields.Nom} source={isImageSource(fields.Portrait ?? "") ? fields.Portrait : ""} style={{ kind: "creature" }} disabledReason={creatureTokenId(fields.Portrait ?? "") ? "" : "Importe d’abord l’image de la créature"} />
        </ImageField>

        <section className="grid content-start gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_minmax(0,1fr)]">
            {["Nom", "Rang", "Taille", "Poids"].map(field)}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            {["Type", "Sous-type", "Dressable"].map(field)}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Organisation", "Comportement", "Langue"].map(field)}
          </div>
          <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-4">
            {placeFields.map(field)}
          </div>
          <IndexField label="Description, Histoire, Lore, Autre :" spec={specOf(creatureNoteHeader)} value={initial[creatureNoteHeader] ?? ""} long onChange={(value) => set(creatureNoteHeader, value)} />
        </section>
      </div>

      <section className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Caractéristiques</p>
        <CharacteristicInputs values={fields} onChange={set} />
      </section>

      <SpellsField label="Actifs" value={fields["Sorts actifs"]} source={specOf("Sorts actifs").spells?.source ?? "all"} category="actif" onChange={(value) => set("Sorts actifs", value)} />
      <SpellsField label="Passifs" value={fields["Sorts passifs"]} source={specOf("Sorts passifs").spells?.source ?? "all"} category="passif" onChange={(value) => set("Sorts passifs", value)} />

      {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Annuler</Button>
        <Button type="button" onClick={() => void save()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer la fiche</Button>
      </div>
    </DialogContent>
  </Dialog>
}
