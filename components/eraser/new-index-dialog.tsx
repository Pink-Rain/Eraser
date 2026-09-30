"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Plus } from "lucide-react"

import { IndexEditor } from "@/components/eraser/index-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { IndexColumnSpec } from "@/lib/index-columns"
import type { IndexEditorModel, RelationTarget, SchemaOperation } from "@/lib/index-schema-shared"

/** Les colonnes qui dépendent d'un autre index : posées après la création, pour créer leur réponse en face. */
const relational = (spec: IndexColumnSpec) => spec.kind === "linked" || spec.kind === "lookup" || spec.kind === "rollup"

function emptyModel(relationTargets: RelationTarget[]): IndexEditorModel {
  return { family: "world", key: "", title: "Nouvel index", tabs: [], addTabs: true, relationTargets }
}

/**
 * « Nouvel index » : un titre, une description, des onglets et leurs colonnes. Le
 * classeur « Index · titre » est créé dans le Drive (ou relié s'il existe déjà), puis
 * la page de l'index s'ouvre.
 */
export function NewIndexButton() {
  const router = useRouter()
  const [model, setModel] = useState<IndexEditorModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")

  async function open() {
    setLoading(true); setError(""); setTitle(""); setDescription("")
    const payload = await fetch("/api/resources/custom-indexes?targets=1", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ relationTargets?: RelationTarget[] }>)
      .catch(() => ({ relationTargets: [] }))
    setModel(emptyModel(payload.relationTargets ?? []))
    setLoading(false)
  }

  async function create(operations: SchemaOperation[]) {
    const tabs = operations.flatMap((operation) => operation.op === "add-tab" ? [operation] : [])
    setPending(true); setError("")
    try {
      const response = await fetch("/api/resources/custom-indexes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, tabs: tabs.map((tab) => ({ name: tab.name, columns: tab.columns.filter((column) => !relational(column.spec)) })) }),
      })
      const payload = (await response.json().catch(() => ({}))) as { index?: { key: string }; error?: string }
      if (!response.ok || !payload.index) throw new Error(payload.error || "L’index n’a pas pu être créé.")
      const later = tabs.flatMap((tab) => tab.columns.filter((column) => relational(column.spec)).map((column): SchemaOperation => ({ op: "add-column", tab: tab.name, header: column.header, spec: column.spec })))
      if (later.length) {
        const linked = await fetch("/api/resources/index-schema", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ family: "world", key: payload.index.key, operations: later }) })
        // L'index existe déjà : on l'ouvre quand même, les colonnes manquantes s'ajoutent depuis « Modifier ».
        if (!linked.ok) window.alert("L’index est créé, mais ses colonnes liées n’ont pas pu être ajoutées. Ajoute-les depuis « Modifier ».")
      }
      router.push(`/ressources/index/${payload.index.key}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’index n’a pas pu être créé.")
      setPending(false)
    }
  }

  return <>
    <Button type="button" onClick={() => void open()} disabled={loading} className="shrink-0">{loading ? <LoaderCircle className="animate-spin" /> : <Plus />}Nouvel index</Button>
    {model && <IndexEditor
      model={model}
      open
      pending={pending}
      error={error}
      title="Nouvel index"
      intro="Son classeur « Index · titre » est créé dans le Drive d’Eraser (relié s’il existe déjà). Chaque onglet reçoit d’office une colonne « Nom » et une colonne « ID »."
      submitLabel="Créer l’index"
      startTabs={["Général"]}
      canSubmit={Boolean(title.trim())}
      leading={<div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <label className="grid gap-1 text-xs font-semibold">Titre<Input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="Artefacts, Factions, Divinités…" autoFocus /></label>
        <label className="grid gap-1 text-xs font-semibold">Description<Textarea value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder="Ce que rassemble cet index (montré sur sa carte)." className="min-h-9" rows={1} /></label>
      </div>}
      onClose={() => { if (!pending) setModel(null) }}
      onApply={(operations) => void create(operations)}
    />}
  </>
}
