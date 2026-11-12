"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Gift, LoaderCircle, ScrollText, Search, Store, UserRound, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { documentImageUrl, documentPdfUrl, type DocumentRecipient } from "@/lib/document-model"
import { cn } from "@/lib/utils"

/**
 * Un document à lire. `pages` : son nombre de pages, s'il est connu (sinon, le lecteur le demande) ;
 * `roles` : celui de chaque page (« cover » : la couverture, « end » : l'image de fin).
 */
export type ViewedDocument = { campaignId: string; documentId: string; title: string; version?: string; pages?: number; roles?: string[] }

/** Comment s'appelle une page dans le lecteur : « Couverture », « Image de fin », ou son numéro. */
function pageName(role: string | undefined, page: number, pages: number) {
  return role === "cover" ? "Couverture" : role === "end" ? "Image de fin" : `Page ${page} sur ${pages}`
}

/**
 * Lire un document : son image en grand (un clic l'agrandit pour lire les petites lignes), page
 * par page avec les flèches (ou ← et → au clavier), et son PDF à télécharger (toutes les pages).
 * Ouvert depuis l'inventaire d'un joueur ou d'un PNJ, la session ou l'éditeur.
 */
export function DocumentViewerDialog({ document, onClose }: { document: ViewedDocument | null; onClose: () => void }) {
  return <Dialog open={Boolean(document)} onOpenChange={(next) => { if (!next) onClose() }}>
    <DialogContent className="max-h-[94vh] gap-3 overflow-hidden sm:max-w-4xl">
      {/* Un autre document repart de sa première page, sans agrandissement. */}
      {document && <DocumentReader key={`${document.campaignId}/${document.documentId}/${document.version ?? ""}`} document={document} />}
    </DialogContent>
  </Dialog>
}

function DocumentReader({ document }: { document: ViewedDocument }) {
  const [zoomed, setZoomed] = useState(false)
  const [failed, setFailed] = useState<number[]>([])
  const [page, setPage] = useState(1)
  // Ouvert depuis un inventaire, le lecteur ne sait pas combien le document a de pages : il le demande.
  const [found, setFound] = useState<{ pages: number; version: string; roles: string[] } | null>(null)
  const { campaignId, documentId } = document
  const known = document.pages !== undefined
  useEffect(() => {
    if (known) return
    let alive = true
    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { pages?: number; renderVersion?: string; roles?: unknown } : null)
      .then((info) => { if (alive && info) setFound({ pages: Math.max(1, Math.floor(Number(info.pages) || 1)), version: typeof info.renderVersion === "string" ? info.renderVersion : "", roles: Array.isArray(info.roles) ? info.roles.map(String) : [] }) })
      .catch(() => { /* la première page reste lisible */ })
    return () => { alive = false }
  }, [campaignId, documentId, known])
  const pages = Math.max(1, document.pages ?? found?.pages ?? 1)
  const version = document.version || found?.version || ""
  const roles = document.roles ?? found?.roles ?? []
  const shown = Math.min(page, pages)
  const pageFailed = failed.includes(shown)
  const go = (next: number) => setPage(Math.min(pages, Math.max(1, next)))

  // La page suivante (et la précédente) se chargent d'avance : tourner la page est immédiat.
  useEffect(() => {
    for (const neighbour of [shown + 1, shown - 1]) {
      if (neighbour < 1 || neighbour > pages) continue
      const image = new Image()
      image.src = documentImageUrl(campaignId, documentId, version, neighbour)
    }
  }, [campaignId, documentId, version, shown, pages])

  // ← et → tournent les pages tant que le lecteur est ouvert (où que soit le focus dans la fenêtre).
  useEffect(() => {
    if (pages < 2) return
    const turn = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
      if (!step) return
      event.preventDefault()
      setPage((current) => Math.min(pages, Math.max(1, Math.min(current, pages) + step)))
    }
    window.addEventListener("keydown", turn)
    return () => window.removeEventListener("keydown", turn)
  }, [pages])

  return <div className="grid min-h-0 gap-3">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 font-display text-2xl"><ScrollText className="size-5 text-primary" />{document.title || "Document"}</DialogTitle>
      <DialogDescription>{pages > 1 ? `${pageName(roles[shown - 1], shown, pages)} : les flèches (ou ← et →) tournent les pages, un clic agrandit la page.` : "Clique sur le document pour l’agrandir."}</DialogDescription>
    </DialogHeader>
    <div className="relative min-h-0">
      <div className={cn("relative min-h-0 overflow-auto rounded-xl bg-[radial-gradient(circle_at_center,rgb(120_90_50/0.18),transparent_70%)]", zoomed ? "max-h-[72vh]" : "max-h-[68vh]")}>
        {pageFailed
          ? <p className="grid min-h-60 place-items-center px-6 text-center text-sm text-muted-foreground">{shown > 1 ? "Cette page n’a pas pu être ouverte : le MJ ne l’a peut-être pas encore enregistrée." : "Ce document n’a pas pu être ouvert : le MJ ne l’a peut-être pas encore enregistré, ou il a été supprimé."}</p>
          // eslint-disable-next-line @next/next/no-img-element
          : <img
            key={shown}
            src={documentImageUrl(campaignId, documentId, version, shown)}
            alt={pages > 1 ? `${document.title}, ${pageName(roles[shown - 1], shown, pages).toLocaleLowerCase("fr")}` : document.title}
            onError={() => setFailed((current) => [...new Set([...current, shown])])}
            onClick={() => setZoomed((current) => !current)}
            className={cn("mx-auto block drop-shadow-[0_12px_24px_rgb(40_25_10/0.35)] transition-[width]", zoomed ? "w-[180%] max-w-none cursor-zoom-out" : "max-h-[66vh] w-auto max-w-full cursor-zoom-in object-contain")}
          />}
      </div>
      {pages > 1 && <>
        <PageArrow side="left" disabled={shown <= 1} onClick={() => go(shown - 1)} />
        <PageArrow side="right" disabled={shown >= pages} onClick={() => go(shown + 1)} />
      </>}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      {pages > 1 && <span className="mr-auto flex flex-wrap items-center gap-1" role="group" aria-label={`Page ${shown} sur ${pages}`}>
        {Array.from({ length: pages }, (_, index) => <button key={index} type="button" title={pageName(roles[index], index + 1, pages)} aria-label={pageName(roles[index], index + 1, pages)} aria-current={index + 1 === shown ? "page" : undefined} onClick={() => go(index + 1)} className={cn("h-2 rounded-full transition-all", index + 1 === shown ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60")} />)}
        <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{shown} / {pages}</span>
      </span>}
      <Button type="button" variant="ghost" size="sm" onClick={() => setZoomed((current) => !current)} disabled={pageFailed}>{zoomed ? <ZoomOut /> : <ZoomIn />}{zoomed ? "Taille normale" : "Agrandir"}</Button>
      <Button asChild variant="outline" size="sm" className={cn(failed.includes(1) && "pointer-events-none opacity-50")}><a href={`${documentPdfUrl(campaignId, documentId, version)}${version ? "&" : "?"}download=1`} download><Download />Télécharger le PDF</a></Button>
    </div>
  </div>
}

/** Une petite flèche posée sur le bord de la page, pour passer à la précédente ou à la suivante. */
function PageArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return <button type="button" disabled={disabled} onClick={onClick} title={side === "left" ? "Page précédente (←)" : "Page suivante (→)"} aria-label={side === "left" ? "Page précédente" : "Page suivante"} className={cn("absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border bg-background/85 text-foreground shadow-md backdrop-blur transition hover:bg-background disabled:pointer-events-none disabled:opacity-0", side === "left" ? "left-2" : "right-2")}>
    <Icon className="size-5" />
  </button>
}

type RecipientKind = "player" | "merchant" | "npc"

const searchable = (value: string) => value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "")

/**
 * « Donner à… » : le document part dans l'inventaire d'un personnage joueur (au sol si son sac est
 * plein), en vente chez un marchand (un magasin sauvegardé : le MJ lui donne un prix et des
 * exemplaires, un joueur l'achète comme tout item) ou dans le Sac à dos d'un PNJ. Les joueurs
 * d'abord, les marchands ensuite, les PNJ à la fin. Un joueur ou un PNJ le reçoit d'un clic et
 * en est prévenu comme pour un item reçu.
 */
export function GiveDocumentButton({ campaignId, documentId, title, players, merchants = [], npcs = [], disabledReason = "", size = "sm", onGiven }: {
  campaignId: string
  documentId: string
  title: string
  players: DocumentRecipient[]
  /** Les marchands : les magasins sauvegardés de la campagne (`detail` : leur vendeur, leur ville). */
  merchants?: DocumentRecipient[]
  /** Les PNJ de la campagne. */
  npcs?: DocumentRecipient[]
  disabledReason?: string
  size?: "sm" | "xs"
  onGiven?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState("")
  const [error, setError] = useState("")
  const [given, setGiven] = useState<string[]>([])
  const [query, setQuery] = useState("")
  // Le magasin où le document va être mis en vente : son prix et ses exemplaires, à remplir.
  const [selling, setSelling] = useState<{ shop: DocumentRecipient; price: string; quantity: number } | null>(null)
  const wanted = searchable(query.trim())
  const matches = (recipient: DocumentRecipient) => !wanted || searchable(`${recipient.name} ${recipient.detail ?? ""}`).includes(wanted)
  const groups: Array<{ kind: RecipientKind; label: string; hint?: string; people: DocumentRecipient[]; empty: string }> = [
    { kind: "player", label: "Joueurs", people: players.filter(matches), empty: players.length || wanted ? "" : "Aucun personnage joueur dans la campagne." },
    { kind: "merchant", label: "Marchands", hint: "le mettre en vente", people: merchants.filter(matches), empty: "" },
    { kind: "npc", label: "PNJ", hint: "dans leur Sac à dos", people: npcs.filter(matches), empty: "" },
  ]
  const documentUrl = `/api/campaigns/${encodeURIComponent(campaignId)}/documents/${encodeURIComponent(documentId)}`

  async function give(kind: RecipientKind, recipient: DocumentRecipient) {
    const key = `${kind}:${recipient.id}`
    setSending(key); setError("")
    try {
      const body = kind === "player" ? { characterId: recipient.id } : { npcId: recipient.id }
      const response = await fetch(`${documentUrl}/give`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const payload = (await response.json().catch(() => ({}))) as { landedOnGround?: boolean; error?: string }
      if (!response.ok) { setError(payload.error || "Le document n’a pas pu être donné."); return }
      setGiven((current) => [...current, key])
      onGiven?.(kind !== "player"
        ? `« ${title} » rangé dans le Sac à dos de ${recipient.name}.`
        : payload.landedOnGround ? `« ${title} » donné à ${recipient.name} : son sac est plein, il l’attend au sol.` : `« ${title} » donné à ${recipient.name}.`)
    } catch {
      setError("Eraser n’a pas pu joindre son serveur local : rien n’a été donné.")
    } finally {
      setSending("")
    }
  }

  /** Met le document en vente dans le magasin choisi, au prix et aux exemplaires donnés. */
  async function sell() {
    if (!selling) return
    const { shop, price, quantity } = selling
    const key = `merchant:${shop.id}`
    setSending(key); setError("")
    try {
      const response = await fetch(`${documentUrl}/shop`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shopId: shop.id, price, quantity }) })
      const payload = (await response.json().catch(() => ({}))) as { added?: boolean; price?: string; error?: string }
      if (!response.ok) { setError(payload.error || "Le document n’a pas pu être mis en vente."); return }
      setGiven((current) => [...current, key])
      setSelling(null)
      const cost = payload.price ? ` à ${payload.price}` : " (prix à négocier)"
      onGiven?.(payload.added === false
        ? `« ${title} » : ${quantity} exemplaire${quantity > 1 ? "s" : ""} de plus en vente chez ${shop.name}${cost}.`
        : `« ${title} » est en vente chez ${shop.name}${cost}${quantity > 1 ? `, ${quantity} exemplaires` : ""}. Son prix se change dans le magasin.`)
    } catch {
      setError("Eraser n’a pas pu joindre son serveur local : rien n’a été mis en vente.")
    } finally {
      setSending("")
    }
  }

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setError(""); setGiven([]); setQuery(""); setSelling(null) } }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size={size} disabled={Boolean(disabledReason)} title={disabledReason || "Le donner à un joueur ou à un PNJ, ou le mettre en vente chez un marchand"}><Gift />Donner à…</Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-2">
      <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Donner « {title} »</p>
      {players.length + merchants.length + npcs.length > 8 && <div className="relative mb-1.5 px-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un joueur, un marchand, un PNJ…" aria-label="Chercher un destinataire" className="h-8 pl-8 text-sm" />
      </div>}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {groups.map((group) => (group.people.length > 0 || group.empty) && <section key={group.kind} aria-label={group.label}>
          <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-primary/80">{group.label}{group.hint && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">· {group.hint}</span>}</p>
          {group.people.length
            ? <div className="space-y-0.5">{group.people.map((recipient) => {
              const key = `${group.kind}:${recipient.id}`
              const Icon = group.kind === "player" ? Gift : group.kind === "merchant" ? Store : UserRound
              const choosing = group.kind === "merchant" && selling?.shop.id === recipient.id
              return <div key={key} className={cn("rounded-lg", choosing && "bg-accent/60")}>
                <button type="button" disabled={Boolean(sending)} aria-expanded={group.kind === "merchant" ? choosing : undefined} onClick={() => group.kind === "merchant" ? setSelling(choosing ? null : { shop: recipient, price: "", quantity: 1 }) : void give(group.kind, recipient)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{sending === key ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{recipient.name}</span>
                    {recipient.detail && <span className="block truncate text-[11px] text-muted-foreground">{recipient.detail}</span>}
                  </span>
                  {given.includes(key) && <span className="text-[11px] font-medium text-emerald-700">{group.kind === "merchant" ? "En vente ✓" : "Donné ✓"}</span>}
                </button>
                {choosing && selling && <form className="grid gap-1.5 px-2 pb-2 pt-0.5" onSubmit={(event) => { event.preventDefault(); void sell() }}>
                  <div className="flex items-center gap-1.5">
                    <Input autoFocus value={selling.price} onChange={(event) => setSelling({ ...selling, price: event.target.value.slice(0, 60) })} placeholder="Prix (ex. 5 PO)" aria-label="Prix du document dans ce magasin" className="h-8 min-w-0 flex-1 text-sm" />
                    <Input type="number" min={1} max={99} value={selling.quantity} onChange={(event) => setSelling({ ...selling, quantity: Math.max(1, Math.min(99, Math.floor(Number(event.target.value)) || 1)) })} aria-label="Exemplaires en vente" title="Exemplaires en vente" className="h-8 w-16 text-center text-sm tabular-nums" />
                  </div>
                  <Button type="submit" size="sm" disabled={Boolean(sending)}>{sending === key ? <LoaderCircle className="animate-spin" /> : <Store />}Mettre en vente</Button>
                  <p className="text-[11px] leading-4 text-muted-foreground">Sans prix, il se négocie avec toi. Le prix et les exemplaires se changent ensuite dans le magasin.</p>
                </form>}
              </div>
            })}</div>
            : <p className="px-2 py-2 text-xs text-muted-foreground">{group.empty}</p>}
        </section>)}
        {wanted && groups.every((group) => !group.people.length) && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Personne ne porte ce nom.</p>}
      </div>
      {error && <p className="mt-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
    </PopoverContent>
  </Popover>
}
