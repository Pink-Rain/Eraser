"use client"

import { useCallback, useRef, useState } from "react"
import { CircleAlert, Dices, Info, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Notice = { id: number; message: string; tone: "info" | "error" }

/** Les messages des boutons (« Copié. », un jet de dés…), en bas de l'écran. */
export function useIndexNotices() {
  const [notices, setNotices] = useState<Notice[]>([])
  const counter = useRef(0)
  const notify = useCallback((message: string, tone: "info" | "error" = "info") => {
    const id = ++counter.current
    setNotices((current) => [...current.slice(-3), { id, message, tone }])
    window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), tone === "error" ? 9000 : 5000)
  }, [])
  const view = notices.length ? <div className="pointer-events-none fixed bottom-4 right-4 z-[80] grid max-w-sm gap-2" aria-live="polite">
    {notices.map((notice) => <div key={notice.id} className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg ${notice.tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-card"}`}>
      {notice.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1 whitespace-pre-wrap">{notice.message}</span>
      <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} aria-label="Fermer"><X className="size-3.5" /></button>
    </div>)}
  </div> : null
  return { notify, view }
}

type Question = { title: string; description?: string; options: Array<{ value: string; label: string }>; resolve: (value: string | null) => void }

/** Une question à choix, attendue par une étape (« Dans quelle campagne ? »). */
export function useChoiceDialog() {
  const [question, setQuestion] = useState<Question | null>(null)
  const ask = useCallback((title: string, options: Question["options"], description?: string) => new Promise<string | null>((resolve) => {
    setQuestion({ title, description, options, resolve })
  }), [])
  const answer = (value: string | null) => { question?.resolve(value); setQuestion(null) }
  const view = <Dialog open={Boolean(question)} onOpenChange={(open) => { if (!open) answer(null) }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{question?.title}</DialogTitle>
        {question?.description && <DialogDescription>{question.description}</DialogDescription>}
      </DialogHeader>
      <div className="grid max-h-80 gap-1 overflow-y-auto">
        {question?.options.map((option) => <Button key={option.value} type="button" variant="outline" className="justify-start" onClick={() => answer(option.value)}>{option.label}</Button>)}
        {!question?.options.length && <p className="py-4 text-center text-sm text-muted-foreground">Aucun choix possible.</p>}
      </div>
    </DialogContent>
  </Dialog>
  return { ask, view }
}

/** Copie un texte (et sa version mise en forme quand le navigateur le permet). */
export async function copyToClipboard(text: string, html?: string) {
  if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })])
      return
    } catch {
      // Le texte simple suffit.
    }
  }
  await navigator.clipboard.writeText(text)
}

const campaignMemory = "eraser:index-actions:campaign"
let sessionCampaign: string | null = null

/**
 * La campagne visée par un bouton (chat, inventaire). Demandée une fois par visite ;
 * la dernière choisie est proposée en premier.
 */
export async function chooseCampaign(ask: ReturnType<typeof useChoiceDialog>["ask"], purpose: "chat" | "inventory") {
  if (sessionCampaign) return sessionCampaign
  const response = await fetch("/api/campaign-chat?campaigns=1", { cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as { campaigns?: Array<{ id: string; name: string }> }
  let campaigns = payload.campaigns ?? []
  if (purpose === "inventory") campaigns = campaigns.filter((campaign) => campaign.id !== "bac-a-sable")
  let remembered = ""
  try { remembered = window.localStorage.getItem(campaignMemory) ?? "" } catch { /* stockage indisponible */ }
  campaigns = [...campaigns].sort((left, right) => Number(right.id === remembered) - Number(left.id === remembered))
  const chosen = await ask(purpose === "chat" ? "Envoyer dans quelle campagne ?" : "Ajouter à l’inventaire de quelle campagne ?", campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name })), "Ce choix est gardé jusqu’à ce que tu quittes la page.")
  if (!chosen) return null
  sessionCampaign = chosen
  try { window.localStorage.setItem(campaignMemory, chosen) } catch { /* stockage indisponible */ }
  return chosen
}

export async function sendToCampaignChat(campaignId: string, message: string, audience: "public" | "gm") {
  const response = await fetch("/api/campaign-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageLinked: campaignId, kind: "chat", text: message, audience }) })
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Le message n’a pas pu être envoyé.")
}

/**
 * Ajoute un objet à un inventaire d'une campagne : celui de la campagne, d'un de ses
 * personnages ou d'un de ses PNJ (choisis au clic). Renvoie le nom de l'inventaire.
 */
export async function addToInventory(ask: ReturnType<typeof useChoiceDialog>["ask"], itemId: string) {
  const campaign = await chooseCampaign(ask, "inventory")
  if (!campaign) return null
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaign)}/inventory?targets=1`, { cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as { transferTargets?: Array<{ id: string; name: string; kind: "character" | "npc" | "campaign" }> }
  const targets = [{ id: "campaign", name: "Inventaire de la campagne", kind: "campaign" as const }, ...(payload.transferTargets ?? []).filter((target) => target.kind !== "campaign")]
  const chosen = await ask("Dans quel inventaire ?", targets.map((target) => ({ value: `${target.kind}:${target.id}`, label: target.kind === "npc" ? `${target.name} (PNJ)` : target.name })))
  if (!chosen) return null
  const [kind, id] = [chosen.slice(0, chosen.indexOf(":")), chosen.slice(chosen.indexOf(":") + 1)]
  const url = kind === "character" ? `/api/characters/${encodeURIComponent(id)}/inventory` : kind === "npc" ? `/api/npcs/${encodeURIComponent(id)}/inventory` : `/api/campaigns/${encodeURIComponent(campaign)}/inventory`
  const added = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add-item", itemId }) })
  if (!added.ok) throw new Error(((await added.json().catch(() => ({}))) as { error?: string }).error || "L’objet n’a pas pu être ajouté.")
  return targets.find((target) => `${target.kind}:${target.id}` === chosen)?.name ?? "l’inventaire"
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Une ligne en « carte » : le nom en titre, puis chaque champ rempli. */
export function rowCard(title: string, fields: Array<{ label: string; text: string; html?: string }>) {
  const filled = fields.filter((field) => field.text.trim())
  return {
    text: [title, ...filled.map((field) => `${field.label} : ${field.text}`)].join("\n"),
    html: `<h3>${escapeHtml(title)}</h3>${filled.map((field) => `<p><strong>${escapeHtml(field.label)} :</strong> ${field.html ?? escapeHtml(field.text)}</p>`).join("")}`,
  }
}

/**
 * « Tirer une ligne » : une ligne au hasard parmi celles affichées (recherche et filtres
 * compris), pondérée par une colonne si on veut. Un bestiaire devient une table de
 * rencontres : filtre sur la région, pondère par la rareté, tire.
 */
export function DrawRowButton({ rows, weightColumns, weightOf, nameOf, onOpen, disabled = false }: {
  rows: Array<{ key: string }>
  weightColumns: string[]
  weightOf: (rowKey: string, header: string) => number | null
  nameOf: (rowKey: string) => string
  onOpen: (rowKey: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [weight, setWeight] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const draw = () => {
    const pool = rows.map((row) => ({ value: row.key, weight: weight ? Math.max(0, weightOf(row.key, weight) ?? 0) : 1 })).filter((item) => item.weight > 0)
    const total = pool.reduce((sum, item) => sum + item.weight, 0)
    if (!total) { setPicked(""); return }
    const buffer = new Uint32Array(1)
    crypto.getRandomValues(buffer)
    let target = buffer[0] / 4294967296 * total
    let chosen = pool[pool.length - 1].value
    for (const item of pool) { target -= item.weight; if (target < 0) { chosen = item.value; break } }
    setPicked(chosen)
  }
  return <>
    <Button type="button" variant="outline" onClick={() => { setOpen(true); setPicked(null) }} disabled={disabled || !rows.length} title="Tirer une ligne au hasard parmi celles affichées"><Dices />Tirer</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Dices className="size-5 text-primary" />Tirer une ligne</DialogTitle>
          <DialogDescription>Au hasard parmi les {rows.length} ligne{rows.length > 1 ? "s" : ""} affichée{rows.length > 1 ? "s" : ""} : la recherche et les filtres du tableau décident de la table.</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-xs font-semibold">Pondération
          <select value={weight} onChange={(event) => setWeight(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm font-normal">
            <option value="">Aucune : chaque ligne a la même chance</option>
            {weightColumns.map((header) => <option key={header} value={header}>Selon « {header} » (un nombre ; 0 = jamais)</option>)}
          </select>
        </label>
        {picked !== null && <div className="rounded-xl border bg-muted/30 p-4 text-center">
          {picked ? <>
            <p className="font-display text-2xl font-semibold">{nameOf(picked) || "Sans nom"}</p>
            <Button type="button" variant="link" onClick={() => { setOpen(false); onOpen(picked) }}>Ouvrir la fiche</Button>
          </> : <p className="text-sm text-muted-foreground">Aucune ligne n’a de poids : rien à tirer.</p>}
        </div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
          <Button type="button" onClick={draw}><Dices />{picked ? "Relancer" : "Tirer"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
