"use client"

import { useState } from "react"
import { Download, Gift, LoaderCircle, ScrollText, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { documentImageUrl, documentPdfUrl } from "@/lib/document-model"
import { cn } from "@/lib/utils"

export type ViewedDocument = { campaignId: string; documentId: string; title: string; version?: string }

/**
 * Lire un document : son image en grand (un clic l'agrandit pour lire les petites lignes) et
 * son PDF à télécharger. Ouvert depuis l'inventaire d'un joueur, la session ou l'éditeur.
 */
export function DocumentViewerDialog({ document, onClose }: { document: ViewedDocument | null; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false)
  const [failed, setFailed] = useState(false)
  const open = Boolean(document)
  return <Dialog open={open} onOpenChange={(next) => { if (!next) { onClose(); setZoomed(false); setFailed(false) } }}>
    <DialogContent className="max-h-[94vh] gap-3 overflow-hidden sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display text-2xl"><ScrollText className="size-5 text-primary" />{document?.title || "Document"}</DialogTitle>
        <DialogDescription>Clique sur le document pour l’agrandir.</DialogDescription>
      </DialogHeader>
      {document && <div className={cn("relative min-h-0 overflow-auto rounded-xl bg-[radial-gradient(circle_at_center,rgb(120_90_50/0.18),transparent_70%)]", zoomed ? "max-h-[72vh]" : "max-h-[68vh]")}>
        {failed
          ? <p className="grid min-h-60 place-items-center px-6 text-center text-sm text-muted-foreground">Ce document n’a pas pu être ouvert : le MJ ne l’a peut-être pas encore enregistré, ou il a été supprimé.</p>
          // eslint-disable-next-line @next/next/no-img-element
          : <img
            src={documentImageUrl(document.campaignId, document.documentId, document.version)}
            alt={document.title}
            onError={() => setFailed(true)}
            onClick={() => setZoomed((current) => !current)}
            className={cn("mx-auto block drop-shadow-[0_12px_24px_rgb(40_25_10/0.35)] transition-[width]", zoomed ? "w-[180%] max-w-none cursor-zoom-out" : "max-h-[66vh] w-auto max-w-full cursor-zoom-in object-contain")}
          />}
      </div>}
      {document && <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setZoomed((current) => !current)} disabled={failed}>{zoomed ? <ZoomOut /> : <ZoomIn />}{zoomed ? "Taille normale" : "Agrandir"}</Button>
        <Button asChild variant="outline" size="sm" className={cn(failed && "pointer-events-none opacity-50")}><a href={`${documentPdfUrl(document.campaignId, document.documentId, document.version)}${document.version ? "&" : "?"}download=1`} download><Download />Télécharger le PDF</a></Button>
      </div>}
    </DialogContent>
  </Dialog>
}

/**
 * « Donner à… » : le document part dans l'inventaire d'un personnage joueur (au sol si son
 * sac est plein). Un clic suffit ; le joueur est prévenu comme pour un item reçu.
 */
export function GiveDocumentButton({ campaignId, documentId, title, players, disabledReason = "", size = "sm", onGiven }: {
  campaignId: string
  documentId: string
  title: string
  players: Array<{ id: string; name: string }>
  disabledReason?: string
  size?: "sm" | "xs"
  onGiven?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState("")
  const [error, setError] = useState("")
  const [given, setGiven] = useState<string[]>([])

  async function give(player: { id: string; name: string }) {
    setSending(player.id); setError("")
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}/give`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId: player.id }) })
      const payload = (await response.json().catch(() => ({}))) as { landedOnGround?: boolean; error?: string }
      if (!response.ok) { setError(payload.error || "Le document n’a pas pu être donné."); return }
      setGiven((current) => [...current, player.id])
      onGiven?.(payload.landedOnGround ? `« ${title} » donné à ${player.name} : son sac est plein, il l’attend au sol.` : `« ${title} » donné à ${player.name}.`)
    } catch {
      setError("Eraser n’a pas pu joindre son serveur local : rien n’a été donné.")
    } finally {
      setSending("")
    }
  }

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setError(""); setGiven([]) } }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size={size} disabled={Boolean(disabledReason)} title={disabledReason || "Le mettre dans l’inventaire d’un joueur"}><Gift />Donner à…</Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 p-2">
      <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Donner « {title} »</p>
      {players.length
        ? <div className="max-h-64 space-y-0.5 overflow-y-auto">{players.map((player) => <button key={player.id} type="button" disabled={Boolean(sending)} onClick={() => void give(player)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{sending === player.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Gift className="size-3.5" />}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
          {given.includes(player.id) && <span className="text-[11px] font-medium text-emerald-700">Donné ✓</span>}
        </button>)}</div>
        : <p className="px-2 py-4 text-center text-xs text-muted-foreground">Aucun personnage joueur dans la campagne.</p>}
      {error && <p className="mt-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
    </PopoverContent>
  </Popover>
}
