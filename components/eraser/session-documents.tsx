"use client"

import { useState } from "react"
import { BookOpen, CircleMinus, LoaderCircle, PenLine, Plus, ScrollText } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { DocumentViewerDialog, GiveDocumentButton, type ViewedDocument } from "@/components/eraser/document-viewer"
import { RevealToggle, SessionRevealProvider } from "@/components/eraser/session-reveal"
import { documentImageUrl, documentInJournal, documentPageCount, documentPageRolesOf, documentStudioHref, type CampaignDocumentRecord, type DocumentRecipient } from "@/lib/document-model"
import { cn } from "@/lib/utils"
import { thingAttributes } from "@/lib/extensions"

/**
 * Les documents d'une session (Créateur de session) : les lettres et parchemins écrits dans
 * l'extension Eraser Doc, à lire (page par page), à donner aux joueurs ou aux PNJ et à mettre en
 * vente chez les marchands pendant la partie ; « Écrire » et « Modifier » ouvrent l'extension. Un
 * document donné arrive dans l'inventaire du joueur (ou le Sac à dos du PNJ), qui l'ouvre d'un
 * clic. Son œil le montre aux joueurs dans le journal de la session (catégorie Objets) : un
 * document ajouté à la session y est caché.
 */
export function SessionDocuments({ campaignId, sessionId, initialDocuments, players, merchants = [], npcs = [] }: {
  campaignId: string
  sessionId: string
  initialDocuments: CampaignDocumentRecord[]
  players: DocumentRecipient[]
  merchants?: DocumentRecipient[]
  npcs?: DocumentRecipient[]
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [pending, setPending] = useState("")
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [viewing, setViewing] = useState<ViewedDocument | null>(null)
  const [savingReveal, setSavingReveal] = useState<string | null>(null)
  const inSession = documents.filter((document) => document.sessionId === sessionId)

  // L'œil d'un document : il change tout de suite, l'enregistrement suit ; refusé, il revient.
  const reveal = {
    isHidden: (_kind: string, id: string) => !inSession.some((document) => document.id === id && documentInJournal(document)),
    toggle: (_kind: string, id: string) => {
      const document = documents.find((candidate) => candidate.id === id)
      if (!document) return
      const show = !documentInJournal(document)
      const before = document.journal ?? ""
      const set = (journal: string) => setDocuments((current) => current.map((candidate) => candidate.id === id ? { ...candidate, journal } : candidate))
      set(show ? document.sessionId : "")
      setSavingReveal(`document:${id}`); setMessage(null)
      fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ journal: show }) })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as { document?: CampaignDocumentRecord; error?: string }
          if (!response.ok || !payload.document) throw new Error(payload.error || "La visibilité n’a pas pu être enregistrée.")
          set(payload.document.journal ?? "")
        })
        .catch((error) => { set(before); setMessage({ tone: "error", text: error instanceof Error ? error.message : "La visibilité n’a pas pu être enregistrée." }) })
        .finally(() => setSavingReveal(null))
    },
    saving: savingReveal,
  }
  const others = documents.filter((document) => document.sessionId !== sessionId)

  // Ranger ou sortir un document : affiché tout de suite, remis comme avant si le serveur refuse.
  async function move(document: CampaignDocumentRecord, target: string) {
    const before = document.sessionId
    setPending(document.id); setMessage(null)
    // Rangé dans une autre session (ou ajouté à celle-ci), il est caché du journal tant qu'il n'est pas révélé.
    setDocuments((current) => current.map((candidate) => candidate.id === document.id ? { ...candidate, sessionId: target, journal: "" } : candidate))
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(document.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: target }) })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Le document n’a pas pu être rangé.")
    } catch (error) {
      setDocuments((current) => current.map((candidate) => candidate.id === document.id ? { ...candidate, sessionId: before, journal: document.journal } : candidate))
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
      <Button asChild variant="outline" size="sm"><Link href={documentStudioHref(campaignId, { nouveau: true, session: sessionId })}><Plus />Écrire un document</Link></Button>
    </div>
    {message && <p className={cn("rounded-xl border px-4 py-2 text-sm", message.tone === "ok" ? "border-emerald-600/25 bg-emerald-600/8 text-emerald-800 dark:text-emerald-300" : "border-destructive/25 bg-destructive/5 text-destructive")}>{message.text}</p>}
    {inSession.length
      ? <SessionRevealProvider value={reveal}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{inSession.map((document) => <article key={document.id} {...thingAttributes({ kind: "document", id: document.id, label: document.title })} className="overflow-hidden rounded-2xl border bg-card/70 shadow-sm">
        <button type="button" disabled={!document.renderVersion} onClick={() => setViewing({ campaignId, documentId: document.id, title: document.title, version: document.renderVersion, pages: documentPageCount(document), roles: documentPageRolesOf(document) })} className="group relative grid aspect-[4/3] w-full place-items-center bg-[radial-gradient(circle_at_center,rgb(120_90_50/0.16),transparent_72%)] p-3" title={document.renderVersion ? "Lire le document" : "Ce document n’a pas encore été enregistré"}>
          {document.renderVersion
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={documentImageUrl(campaignId, document.id, document.renderVersion)} alt="" loading="lazy" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_14px_rgb(40_25_10/0.3)] transition group-hover:scale-[1.03]" />
            : <ScrollText className="size-10 text-primary/35" />}
          {documentPageCount(document) > 1 && <span className="absolute bottom-2 right-2 rounded-full border bg-background/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm">{documentPageCount(document)} pages</span>}
        </button>
        <div className="space-y-2 border-t p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold" title={document.title}>{document.title}</p>
              <p className="text-[11px] text-muted-foreground">{documentInJournal(document) ? "Dans le journal des joueurs (Objets)" : "Caché aux joueurs"}</p>
            </div>
            <RevealToggle kind="document" id={document.id} name={document.title} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <GiveDocumentButton campaignId={campaignId} documentId={document.id} title={document.title} players={players} merchants={merchants} npcs={npcs} disabledReason={document.renderVersion ? "" : "Enregistre d’abord le document"} onGiven={(text) => setMessage({ tone: "ok", text })} />
            <Button type="button" variant="ghost" size="sm" disabled={!document.renderVersion} onClick={() => setViewing({ campaignId, documentId: document.id, title: document.title, version: document.renderVersion, pages: documentPageCount(document), roles: documentPageRolesOf(document) })}><BookOpen />Lire</Button>
            <Button asChild variant="ghost" size="sm"><Link href={documentStudioHref(campaignId, { document: document.id })}><PenLine />Modifier</Link></Button>
            <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" title="Retirer de la session (le document reste dans la campagne)" aria-label={`Retirer ${document.title} de la session`} disabled={Boolean(pending)} onClick={() => void move(document, "")}>{pending === document.id ? <LoaderCircle className="animate-spin" /> : <CircleMinus />}</Button>
          </div>
        </div>
      </article>)}</div></SessionRevealProvider>
      : <p className="flex items-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-sm text-muted-foreground"><ScrollText className="size-4" />Aucun document dans cette session. Écris-en un (lettre, parchemin, page de livre) pour le donner aux joueurs.</p>}
    <DocumentViewerDialog document={viewing} onClose={() => setViewing(null)} />
  </div>
}
