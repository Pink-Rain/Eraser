"use client"

import { useEffect, useMemo, useState } from "react"
import { Backpack, Cat, LoaderCircle, Map as MapIcon, Search, Send, UserRound, Users } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { GiveDestination } from "@/lib/inventory-schema"

type Kind = GiveDestination["kind"]

const kinds: Array<{ kind: Kind; label: string; campaignLabel: string; icon: typeof Users }> = [
  { kind: "campaign", label: "Campagnes", campaignLabel: "Inventaire de campagne", icon: MapIcon },
  { kind: "character", label: "Joueurs", campaignLabel: "Joueurs de la campagne", icon: Users },
  { kind: "npc", label: "PNJs", campaignLabel: "PNJs de la campagne", icon: UserRound },
  { kind: "creature", label: "Créatures nommées", campaignLabel: "Créatures nommées de la campagne", icon: Cat },
]

function folded(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()
}

// Les destinations déjà lues : rouvrir la fenêtre les montre aussitôt, relues derrière.
let knownDestinations: GiveDestination[] | null = null
let knownCreatures: GiveDestination[] | null = null

/**
 * Envoyer un item de l'index dans un inventaire : d'une campagne, d'un joueur, d'un PNJ ou
 * d'une créature nommée (compagnon d'un personnage). En vue MJ, la campagne en cours est
 * proposée en premier. Un inventaire plein pose l'objet « Au sol » du personnage.
 */
export function ObjectSendDialog({ open, onOpenChange, itemId, itemName, currentCampaignId, onSent }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemId: string
  itemName: string
  /** La campagne choisie dans le menu (vue MJ) : ses inventaires sont proposés en premier. */
  currentCampaignId?: string | null
  onSent: (message: string) => void
}) {
  const [destinations, setDestinations] = useState<GiveDestination[] | null>(knownDestinations)
  const [creatures, setCreatures] = useState<GiveDestination[] | null>(knownCreatures)
  const [kind, setKind] = useState<Kind>("character")
  const [onlyCampaign, setOnlyCampaign] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [sending, setSending] = useState("")

  useEffect(() => {
    if (!open) return
    let active = true
    fetch("/api/items/give", { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as { destinations?: GiveDestination[]; error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok || !payload.destinations) { setError(payload.error || "Les inventaires n’ont pas pu être chargés."); return }
        knownDestinations = payload.destinations
        setDestinations(payload.destinations)
      })
      .catch(() => { if (active) setError("Eraser n’a pas pu joindre son serveur local.") })
    return () => { active = false }
  }, [open])

  // Les créatures nommées demandent de relire les fiches : seulement quand on les affiche.
  const wantsCreatures = open && kind === "creature"
  useEffect(() => {
    if (!wantsCreatures) return
    let active = true
    fetch("/api/items/give?creatures=1", { cache: "no-store" })
      .then(async (response) => (await response.json().catch(() => ({}))) as { destinations?: GiveDestination[] })
      .then((payload) => {
        if (!active || !payload.destinations) return
        knownCreatures = payload.destinations.filter((destination) => destination.kind === "creature")
        setCreatures(knownCreatures)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [wantsCreatures])

  const all = useMemo(() => [...(destinations ?? []), ...(creatures ?? [])], [creatures, destinations])
  const currentCampaign = currentCampaignId ? all.find((destination) => destination.campaignId === currentCampaignId) : undefined
  const shown = all
    .filter((destination) => destination.kind === kind && (!onlyCampaign || destination.campaignId === onlyCampaign))
    .filter((destination) => !query.trim() || folded(`${destination.name} ${destination.campaignName} ${destination.ownerName ?? ""}`).includes(folded(query)))
  const loading = !destinations || (kind === "creature" && !creatures)

  async function send(destination: GiveDestination) {
    setSending(destination.id); setError("")
    try {
      const response = await fetch("/api/items/give", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId: destination.id, campaignId: destination.campaignId, itemId, itemName }) })
      const payload = (await response.json().catch(() => ({}))) as { landedOnGround?: boolean; error?: string }
      if (!response.ok) { setError(payload.error || "L’item n’a pas pu être envoyé."); return }
      const where = destination.kind === "campaign" ? destination.name : `${destination.name}${destination.ownerName ? ` (${destination.ownerName})` : ""}`
      onSent(payload.landedOnGround ? `« ${itemName} » envoyé à ${where} : plus de place, il l’attend au sol.` : `« ${itemName} » envoyé : ${where}.`)
      onOpenChange(false)
    } catch {
      setError("Eraser n’a pas pu joindre son serveur local : rien n’a été envoyé.")
    } finally {
      setSending("")
    }
  }

  function chooseKind(next: Kind, campaignId: string | null) {
    setKind(next)
    setOnlyCampaign(campaignId)
    setQuery("")
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Send className="size-4 text-primary" />Envoyer « {itemName} »</DialogTitle>
        <DialogDescription>Dans quel inventaire ? S’il est plein, l’item est posé au sol du personnage.</DialogDescription>
      </DialogHeader>
      {currentCampaign && <div className="rounded-xl border bg-muted/25 p-2">
        <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Campagne en cours · {currentCampaign.campaignName}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {kinds.map(({ kind: entry, campaignLabel, icon: Icon }) => {
            const campaignInventory = entry === "campaign" ? all.find((destination) => destination.kind === "campaign" && destination.campaignId === currentCampaign.campaignId) : undefined
            const active = onlyCampaign === currentCampaign.campaignId && kind === entry && entry !== "campaign"
            return <button
              key={entry}
              type="button"
              disabled={Boolean(sending)}
              onClick={() => campaignInventory ? void send(campaignInventory) : chooseKind(entry, currentCampaign.campaignId)}
              className={cn("flex items-center gap-2 rounded-lg border bg-background/70 px-2.5 py-2 text-left text-xs font-medium transition hover:bg-accent", active && "border-primary/50 bg-primary/10 text-primary")}
            >{sending && campaignInventory && sending === campaignInventory.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icon className="size-3.5 shrink-0" />}<span className="min-w-0 flex-1 truncate">{campaignLabel}</span></button>
          })}
        </div>
      </div>}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Type d’inventaire">
        {kinds.map(({ kind: entry, label, icon: Icon }) => <button key={entry} type="button" role="tab" aria-selected={kind === entry && !onlyCampaign} onClick={() => chooseKind(entry, null)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition", kind === entry && !onlyCampaign ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-3.5" />{label}</button>)}
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un nom ou une campagne…" className="pl-9" /></div>
      {error && <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {shown.map((destination) => {
          const Icon = kinds.find((entry) => entry.kind === destination.kind)?.icon ?? Backpack
          return <button key={`${destination.campaignId}:${destination.id}`} type="button" disabled={Boolean(sending)} onClick={() => void send(destination)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{sending === destination.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{destination.name}</span><span className="block truncate text-[11px] text-muted-foreground">{[destination.ownerName && `Compagnon de ${destination.ownerName}`, destination.campaignName].filter(Boolean).join(" · ")}</span></span>
          </button>
        })}
        {loading && !shown.length && <div className="grid min-h-16 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>}
        {!loading && !shown.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun inventaire ici.</p>}
      </div>
    </DialogContent>
  </Dialog>
}
