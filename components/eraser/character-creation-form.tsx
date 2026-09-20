"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Save, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { characterCharacteristics, characterCriticalValueIndex, characterValueHeaders } from "@/lib/character-sheet-schema"

type Field = { index: number; label: string; type?: "number" | "textarea" }

const groups: Array<{ title: string; description: string; fields: Field[] }> = [
  {
    title: "Identité",
    description: "Les informations générales de la fiche.",
    fields: [
      { index: 0, label: "Nom du personnage" }, { index: 1, label: "Peuple" },
      { index: 3, label: "Niveau", type: "number" }, { index: 4, label: "Taille" },
      { index: 5, label: "Poids" }, { index: 6, label: "Âge" },
      { index: 7, label: "Autre" }, { index: 8, label: "Notes", type: "textarea" },
    ],
  },
  {
    title: "Profil",
    description: "Place du personnage dans le monde et repères narratifs.",
    fields: [
      { index: 11, label: "Classe sociale" }, { index: 12, label: "Notoriété" },
      { index: 13, label: "Alignement" }, { index: 14, label: "Moralité" },
      { index: 15, label: "Folie" }, { index: 16, label: "Destin" },
      { index: 24, label: "Langue parlée" },
    ],
  },
  {
    title: "Combat",
    description: "Vie, protections, rapidité et seuils critiques.",
    fields: [
      { index: 9, label: "Vie actuelle", type: "number" }, { index: 10, label: "Vie totale", type: "number" },
      { index: 17, label: "Bonus de dégâts physiques", type: "number" }, { index: 18, label: "Bonus de dégâts magiques", type: "number" },
      { index: 19, label: "Armure physique", type: "number" }, { index: 20, label: "Armure magique", type: "number" },
      { index: 21, label: "Rapidité", type: "number" }, { index: 22, label: "Échec critique", type: "number" },
      { index: 23, label: "Réussite critique", type: "number" }, { index: 25, label: "Capacité de combat", type: "number" },
      { index: 26, label: "Capacité de tir", type: "number" }, { index: 27, label: "Capacité magique", type: "number" },
    ],
  },
  {
    title: "Caractéristiques",
    description: "Les valeurs principales utilisées par les règles.",
    fields: [
      { index: 28, label: "Constitution", type: "number" }, { index: 29, label: "Force mentale", type: "number" },
      { index: 30, label: "Force", type: "number" }, { index: 31, label: "Dextérité", type: "number" },
      { index: 32, label: "Intelligence", type: "number" }, { index: 33, label: "Sagesse", type: "number" },
      { index: 34, label: "Charisme", type: "number" },
    ],
  },
  {
    title: "Récit",
    description: "Identité, objectifs et histoire du personnage.",
    fields: [
      { index: 35, label: "Titre honorifique" }, { index: 36, label: "Portrait (URL)" },
      { index: 37, label: "Religion" }, { index: 38, label: "But", type: "textarea" },
      { index: 39, label: "Personnalité", type: "textarea" }, { index: 40, label: "Histoire", type: "textarea" },
    ],
  },
  {
    title: "Critiques des caractéristiques",
    description: "Seuils ajoutés aux réussites et échecs critiques des compétences liées.",
    fields: characterCharacteristics.flatMap((item, characteristicIndex) => [
      { index: characterCriticalValueIndex(characteristicIndex, "success"), label: `${item.characteristic} — Réussite critique`, type: "number" as const },
      { index: characterCriticalValueIndex(characteristicIndex, "failure"), label: `${item.characteristic} — Échec critique`, type: "number" as const },
    ]),
  },
]

export function CharacterCreationForm({ classes }: { classes: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const [values, setValues] = useState(() => Array<string>(characterValueHeaders.length).fill(""))
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  function update(index: number, value: string) {
    setValues((current) => current.map((cell, cellIndex) => cellIndex === index ? value : cell))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    const response = await fetch("/api/characters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    })
    const payload = (await response.json()) as { error?: string; character?: { id: string } }
    setPending(false)
    if (!response.ok || !payload.character) return setError(payload.error || "Le personnage n’a pas pu être créé.")
    router.push(`/personnage/${encodeURIComponent(payload.character.id)}`)
    router.refresh()
  }

  return (
    <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
        <span className="h-px w-7 bg-primary/50" />Personnage
      </div>
      <div className="flex items-start gap-4">
        <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary"><WandSparkles className="size-5" /></div>
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Créer un personnage</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Les champs correspondent aux colonnes de la feuille de personnage. Ton ID de compte et l’ID de la fiche sont ajoutés automatiquement.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-10 space-y-6">
        <section className="rounded-2xl border bg-card/90 p-5 sm:p-7">
          <h2 className="font-display text-2xl font-semibold">Classe</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choisis une classe déjà disponible dans le Sheet Classes.</p>
          <div className="mt-5 grid gap-2">
            <Label htmlFor="character-class">Classe</Label>
            <NativeSelect id="character-class" className="w-full" value={values[2]} onChange={(event) => update(2, event.target.value)}>
              <NativeSelectOption value="">À choisir plus tard</NativeSelectOption>
              {classes.map((item) => <NativeSelectOption key={item.id} value={item.name}>{item.name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
        </section>

        {groups.map((group) => (
          <section key={group.title} className="rounded-2xl border bg-card/90 p-5 sm:p-7">
            <h2 className="font-display text-2xl font-semibold">{group.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {group.fields.map((field) => (
                <div key={field.index} className={field.type === "textarea" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}>
                  <Label htmlFor={`field-${field.index}`}>{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea id={`field-${field.index}`} value={values[field.index]} onChange={(event) => update(field.index, event.target.value)} />
                  ) : (
                    <Input id={`field-${field.index}`} type={field.type || "text"} value={values[field.index]} onChange={(event) => update(field.index, event.target.value)} required={field.index === 0} />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>}
        <div className="sticky bottom-4 flex justify-end rounded-2xl border bg-background/90 p-3 shadow-lg backdrop-blur">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
            Enregistrer le personnage
          </Button>
        </div>
      </form>
    </div>
  )
}
