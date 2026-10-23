"use client"

import { useState } from "react"
import { BookOpen, CircleMinus, LoaderCircle, PenLine, Plus, ScrollText } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { DocumentViewerDialog, GiveDocumentButton, type ViewedDocument } from "@/components/eraser/document-viewer"
import { documentImageUrl, type CampaignDocumentRecord } from "@/lib/document-model"
import { cn } from "@/lib/utils"

/**
 * Les documents d'une session (Créateur de session) : les lettres et parchemins préparés
 * dans la page Document, à lire, à modifier et à donner aux joueurs pendant la partie. Un
 * document donné arrive dans l'inventaire du joueur, qui l'ouvre d'un clic.
 */
export function SessionDocuments({ campaignId, sessionId, initialDocuments, players }: {
  campaignId: string
  sessionId: string
  initialDocuments: CampaignDocumentRecord[]
  players: Array<{ id: string; name: string }>
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [pending, setPending] = useState("")
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [viewing, setViewing] = useState<ViewedDocument | null>(null)
  const inSession = documents.filter((document) => document.sessionId === sessionId)
  const others = documents.filter((document) => document.sessionId !== sessionId)
  const base = `/campagne/${encodeURIComponent(campaignId)}/document`

  // Ranger ou sortir un document : affiché tout de suite, remis comme avant si le serveur refuse.
  async function move(document: CampaignDocumentRecord, target: string) {
    const before = document.sessionId
    setPending(document.id); setMessage(null)
    setDocuments((current) => current.map((candidate) => candidate.id === document.id ? { ...candidate, sessionId: target } : candidate))
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(document.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: target }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Le document n’a pas pu être rangé.")
    } catch (error) {
      setDocuments((current) => current.map((candidate) => candidate.id === document.id ? { ...candidate, sessionId: before } : candidate))
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Le document n’a pas pu être rangé." })
    } finally {
      setPending("")
    }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {others.length > 0 && <NativeSelect value="" aria-label="Ajouter un document à la session" disabled={Boolean(pending)} onChange={(event) => { const found = others.find((document) => document.id === event.target.value); if (found) void move(found, sessionId) }}>
        <NativeSelectOption value="">+ Ajouter un document…</NativeSelectOption>
        {others.map((document) => <NativeSelectOption key={document.id} value={document.id}>{document.title}</NativeSelectOption>)}
      </NativeSelect>}
      <Button asChild variant="outline" size="sm"><Link href={`${base}?nouveau=1&session=${encodeURIComponent(sessionId)}`}><Plus />Écrire un document</Link></Button>
    </div>
    {message && <p className={cn("rounded-xl border px-4 py-2 text-sm", message.tone === "ok" ? "border-emerald-600/25 bg-emerald-600/8 text-emerald-800 dark:text-emerald-300" : "border-destructive/25 bg-destructive/5 text-destructive")}>{message.text}</p>}
    {inSession.length
      ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{inSession.map((document) => <article key={document.id} className="overflow-hidden rounded-2xl border bg-card/70 shadow-sm">
        <button type="button" disabled={!document.renderVersion} onClick={() => setViewing({ campaignId, documentId: document.id, title: document.title, version: document.renderVersion })} className="group relative grid aspect-[4/3] w-full place-items-center bg-[radial-gradient(circle_at_center,rgb(120_90_50/0.16),transparent_72%)] p-3" title={document.renderVersion ? "Lire le document" : "Ce document n’a pas encore été enregistré"}>
          {document.renderVersion
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={documentImageUrl(campaignId, document.id, document.renderVersion)} alt="" loading="lazy" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_14px_rgb(40_25_10/0.3)] transition group-hover:scale-[1.03]" />
            : <ScrollText className="size-10 text-primary/35" />}
        </button>
        <div className="space-y-2 border-t p-3">
          <p className="truncate font-display text-lg font-semibold" title={document.title}>{document.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <GiveDocumentButton campaignId={campaignId} documentId={document.id} title={document.title} players={players} disabledReason={document.renderVersion ? "" : "Enregistre d’abord le document"} onGiven={(text) => setMessage({ tone: "ok", text })} />
            <Button type="button" variant="ghost" size="sm" disabled={!document.renderVersion} onClick={() => setViewing({ campaignId, documentId: document.id, title: document.title, version: document.renderVersion })}><BookOpen />Lire</Button>
            <Button asChild variant="ghost" size="sm"><Link href={`${base}?document=${encodeURIComponent(document.id)}`}><PenLine />Modifier</Link></Button>
            <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" title="Retirer de la session (le document reste dans la campagne)" aria-label={`Retirer ${document.title} de la session`} disabled={Boolean(pending)} onClick={() => void move(document, "")}>{pending === document.id ? <LoaderCircle className="animate-spin" /> : <CircleMinus />}</Button>
          </div>
        </div>
      </article>)}</div>
      : <p className="flex items-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-sm text-muted-foreground"><ScrollText className="size-4" />Aucun document dans cette session. Écris-en un (lettre, parchemin, page de livre) pour le donner aux joueurs.</p>}
    <DocumentViewerDialog document={viewing} onClose={() => setViewing(null)} />
  </div>
}
