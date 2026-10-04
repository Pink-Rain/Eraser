"use client"

import { useEffect, useState } from "react"
import { Combine, ExternalLink, LoaderCircle, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MERGED_OBJECT_INDEX_NAME, OBJECT_INDEX_BACKUP_FOLDER, regroupedTabNames } from "@/lib/object-index-regroup"

type Status = { state: "séparé" | "regroupé"; files: string[]; merged: { id: string; url: string; regroupedAt: string } | null }
type RegroupResult = { url: string; tabs: Array<{ name: string; from: string; rows: number; idsWritten: number }>; views: number; warnings?: string[] }

async function post(action: string) {
  const response = await fetch("/api/resources/object-indexes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
  const payload = (await response.json().catch(() => ({}))) as { status?: Status | null; result?: RegroupResult & { restored?: string[] }; error?: string; details?: string[] }
  if (!response.ok) throw Object.assign(new Error(payload.error || "L’opération n’a pas pu se faire."), { details: payload.details ?? [] })
  return payload
}

/**
 * Vue administrateur : regrouper les classeurs du dossier « Objets » en un seul
 * classeur à onglets, ou annuler ce regroupement. Les anciens classeurs ne sont
 * jamais modifiés ni supprimés : ils sont rangés dans un sous-dossier.
 */
export function ObjectIndexRegroup({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [dialog, setDialog] = useState<"regroup" | "revert" | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)
  const [done, setDone] = useState<RegroupResult | null>(null)
  // Ce qui n'a pas suivi l'annulation (onglets-fenêtres, nom du classeur) : dit avant de recharger la page.
  const [revertWarnings, setRevertWarnings] = useState<string[]>([])

  useEffect(() => {
    let active = true
    post("regroup-status").then((payload) => { if (active && payload.status) setStatus(payload.status) }).catch(() => { /* rien à proposer */ })
    return () => { active = false }
  }, [])

  async function run(action: "regroup" | "regroup-revert") {
    setPending(true); setError(null)
    try {
      const payload = await post(action)
      if (payload.status) setStatus(payload.status)
      if (action === "regroup" && payload.result) { setDone(payload.result); onChanged() }
      else if (payload.result?.warnings?.length) setRevertWarnings(payload.result.warnings)
      else window.location.reload()
    } catch (caught) {
      setError({ message: caught instanceof Error ? caught.message : "L’opération n’a pas pu se faire.", details: (caught as { details?: string[] }).details ?? [] })
    }
    setPending(false)
  }

  if (!status || (status.state === "séparé" && status.files.length < 2)) return null
  const planned = status.state === "séparé" ? regroupedTabNames(status.files.map((name) => ({ key: name, fileName: name, tabName: name }))) : null

  return <>
    {status.state === "séparé"
      ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
        <Combine className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">{status.files.length} classeurs d’objets dans le dossier « Objets ». Ils peuvent devenir un seul classeur « {MERGED_OBJECT_INDEX_NAME} », un onglet par index.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setDone(null); setDialog("regroup") }}><Combine />Regrouper…</Button>
      </div>
      : <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-4 py-2 text-xs text-muted-foreground">
        <Combine className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">Index regroupés dans « {MERGED_OBJECT_INDEX_NAME} »{status.merged?.regroupedAt ? ` le ${new Date(status.merged.regroupedAt).toLocaleDateString("fr-FR")}` : ""}. Les anciens classeurs sont dans « {OBJECT_INDEX_BACKUP_FOLDER} ».</span>
        {status.merged && <a href={status.merged.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Ouvrir dans Sheets<ExternalLink className="size-3" /></a>}
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setError(null); setDialog("revert") }}><Undo2 />Annuler le regroupement…</Button>
      </div>}

    <Dialog open={dialog === "regroup"} onOpenChange={(open) => { if (!open && !pending) { if (done) window.location.reload(); else setDialog(null) } }}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Combine className="size-4 text-primary" />Regrouper les index d’objets</DialogTitle>
          <DialogDescription>Un seul classeur « {MERGED_OBJECT_INDEX_NAME} », un onglet par index. Rien n’est supprimé : c’est une copie, vérifiée avant de remplacer les anciens classeurs.</DialogDescription>
        </DialogHeader>
        {done
          ? <div className="grid gap-3 text-sm">
            <p className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-3 py-2 text-emerald-950">Regroupement fait. L’index, les inventaires et les boutiques lisent maintenant « {MERGED_OBJECT_INDEX_NAME} ».</p>
            <ul className="grid gap-1 text-xs">
              {done.tabs.map((tab) => <li key={tab.name}><span className="font-semibold">{tab.name}</span> ← {tab.from} · {tab.rows} ligne{tab.rows > 1 ? "s" : ""}{tab.idsWritten ? ` · ${tab.idsWritten} ID gardé${tab.idsWritten > 1 ? "s" : ""}` : ""}</li>)}
            </ul>
            {done.views > 0 && <p className="text-xs text-muted-foreground">{done.views} onglet{done.views > 1 ? "s" : ""}-fenêtre{done.views > 1 ? "s" : ""} renvoyé{done.views > 1 ? "s" : ""} vers les nouveaux onglets.</p>}
            {done.warnings?.map((warning) => <p key={warning} className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">{warning}</p>)}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" asChild><a href={done.url} target="_blank" rel="noreferrer"><ExternalLink />Ouvrir dans Sheets</a></Button>
              {/* Les onglets-fenêtres ont été renvoyés côté serveur : la page est relue en entier. */}
              <Button type="button" onClick={() => window.location.reload()}>Fermer</Button>
            </div>
          </div>
          : <>
            <div className="grid gap-2 text-sm leading-6">
              <p className="font-medium">Ce qui va se passer :</p>
              <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
                <li>Chaque tableau est copié tel quel (valeurs, couleurs, images) dans un onglet :
                  <span className="mt-1 flex flex-wrap gap-1">{planned && planned.order.map((key) => <span key={key} className="rounded-full border bg-background px-2 py-0.5 text-xs text-foreground">{planned.names.get(key)}</span>)}</span>
                </li>
                <li>Les objets sans identifiant gardent celui que connaissent les inventaires, boutiques et fouilles (écrit dans une colonne ID).</li>
                <li>Les types de colonnes (« Modifier ») et les onglets-fenêtres suivent.</li>
                <li>La copie est relue et comparée ligne par ligne. À la moindre différence, rien ne change.</li>
                <li>Les anciens classeurs, intacts, sont rangés dans le sous-dossier « {OBJECT_INDEX_BACKUP_FOLDER} ».</li>
              </ol>
              <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">Évite de modifier les index d’objets pendant l’opération (une minute environ). « Annuler le regroupement » remet les anciens classeurs en place ; ce qui aura été changé entre-temps dans le classeur regroupé y restera.</p>
            </div>
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {error.message}
              {error.details.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{error.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
            </div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={pending}>Annuler</Button>
              <Button type="button" onClick={() => void run("regroup")} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Combine />}{pending ? "Copie et vérification…" : "Regrouper"}</Button>
            </div>
          </>}
      </DialogContent>
    </Dialog>

    <Dialog open={dialog === "revert"} onOpenChange={(open) => { if (!open && !pending) { if (revertWarnings.length) window.location.reload(); else setDialog(null) } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="size-4 text-primary" />Annuler le regroupement</DialogTitle>
          <DialogDescription>Les anciens classeurs reviennent dans « Objets », tels qu’ils étaient avant le regroupement. « {MERGED_OBJECT_INDEX_NAME} » est rangé dans la sauvegarde (renommé, pas supprimé).</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">Ce qui a été ajouté ou modifié dans « {MERGED_OBJECT_INDEX_NAME} » depuis le regroupement n’est pas recopié dans les anciens classeurs : il reste dans le classeur regroupé.</p>
        {error && <div className="text-sm text-destructive" role="alert">
          {error.message}
          {error.details.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{error.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
        </div>}
        {revertWarnings.length > 0
          ? <div className="grid gap-2">
            <p className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">Les anciens classeurs sont revenus dans « Objets ».</p>
            {revertWarnings.map((warning) => <p key={warning} className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-950">{warning}</p>)}
            <div className="flex justify-end"><Button type="button" onClick={() => window.location.reload()}>Fermer</Button></div>
          </div>
          : <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={pending}>Garder le regroupement</Button>
            <Button type="button" variant="destructive" onClick={() => void run("regroup-revert")} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Undo2 />}Annuler le regroupement</Button>
          </div>}
      </DialogContent>
    </Dialog>
  </>
}
