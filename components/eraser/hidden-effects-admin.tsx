"use client"

import { useState } from "react"
import { Check, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cleanEffectNames, HIDDEN_TYPES_MAX } from "@/lib/hidden-effects"

type HiddenEffectsData = { types: string[]; available: boolean }

/**
 * Administration › Effets cachés (lib/hidden-effects.ts) : les types d'items (colonne « Type » de
 * l'Index des items) dont l'effet s'affiche « Effet verrouillé » dans l'inventaire tant que le
 * personnage ne l'a pas débloqué. Vide : rien n'est caché.
 */
export function HiddenEffectsAdmin({ initial }: { initial: HiddenEffectsData }) {
  const [saved, setSaved] = useState(initial.types)
  const [draft, setDraft] = useState(initial.types.join(", "))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const next = cleanEffectNames(draft, HIDDEN_TYPES_MAX)
  const changed = next.join("\u0001") !== saved.join("\u0001")

  async function save() {
    setPending(true)
    setMessage(null)
    const response = await fetch("/api/admin/item-effects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ types: next }) }).catch(() => null)
    const body = await response?.json().catch(() => null) as { types?: string[]; error?: string } | null
    if (response?.ok && body?.types) {
      setSaved(body.types)
      setDraft(body.types.join(", "))
      setMessage({ text: body.types.length ? "Enregistré." : "Enregistré : plus aucun effet n’est caché.", error: false })
    } else setMessage({ text: body?.error || "La liste n’a pas pu être enregistrée.", error: true })
    setPending(false)
  }

  return <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
    <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75"><span className="h-px w-7 bg-primary/50" />Administration</div>
    <h1 className="font-display text-4xl font-semibold sm:text-5xl">Effets cachés</h1>
    <p className="mt-3 max-w-2xl text-muted-foreground">
      L’effet d’un item de ces types s’affiche « Effet verrouillé » dans l’inventaire d’un personnage tant qu’il ne l’a pas débloqué
      (clic droit sur l’item : « Débloquer l’effet »). Les lignes d’effet qu’un item fabriqué tient de l’un d’eux restent « Effet inconnu ».
      Laisser vide : rien n’est caché.
    </p>
    {!initial.available && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Le serveur partagé d’Eraser n’est pas configuré ici : rien ne peut être caché.</p>}
    <section className="mt-8 max-w-2xl rounded-2xl border bg-card/90 p-5 sm:p-7">
      <label className="grid gap-1.5 text-sm font-medium">Types d’items dont l’effet est caché
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && changed && !pending) void save() }} placeholder="Ingrédient, Base, Alchimie, Pigment" disabled={!initial.available} />
      </label>
      <p className="mt-1.5 text-xs text-muted-foreground">Séparés par des virgules ; comparés sans accents ni majuscules au « Type » de chaque item.</p>
      {next.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{next.map((type) => <span key={type} className="rounded-full border px-2.5 py-0.5 text-xs">{type}</span>)}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void save()} disabled={!initial.available || !changed || pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Enregistrer</Button>
        {message && <p className={`text-sm ${message.error ? "text-destructive" : "text-muted-foreground"}`} role="status">{message.text}</p>}
      </div>
    </section>
  </div>
}
