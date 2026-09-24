"use client"

import { useState } from "react"
import { ChevronDown, LoaderCircle, Pencil, Plus, Search, UserRound, UserRoundMinus, X } from "lucide-react"

import { NpcBackpack, NpcForm, persistNpcs, uploadNpcPortrait } from "@/components/eraser/npc-manager"
import { RichTextView } from "@/components/eraser/rich-text"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { foldNpcName } from "@/lib/npc-pages"
import type { CampaignNpcRecord } from "@/lib/shop-schema"

function GroupNpcCard({ npc, canManage, pending, onEdit, onRemove }: { npc: CampaignNpcRecord; canManage: boolean; pending: boolean; onEdit: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const hp = npc.totalHp > 0 ? Math.max(0, Math.min(100, (npc.currentHp / npc.totalHp) * 100)) : 0
  const details = [npc.title, npc.occupation, npc.people].filter(Boolean).join(" · ")
  return <Collapsible open={open} onOpenChange={setOpen} asChild>
    <article className="min-w-0 self-start overflow-hidden rounded-2xl border bg-card/75 shadow-sm">
      <div className="relative grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)]">
        <div className="relative min-h-28 bg-muted">{npc.portrait
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={npc.portrait} alt={`Portrait de ${npc.name}`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
          : <div className="grid size-full place-items-center"><UserRound className="size-9 text-primary/20" /></div>}</div>
        <div className="min-w-0 p-4 pr-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold leading-tight">{npc.name}</h3>
              {details && <p className="mt-1 truncate text-xs text-muted-foreground">{details}</p>}
            </div>
            {canManage && <div className="-mr-1 -mt-1 flex shrink-0 gap-0.5">
              <Button type="button" variant="ghost" size="icon-xs" onClick={onEdit} disabled={pending} title="Modifier la fiche" aria-label={`Modifier ${npc.name}`}><Pencil /></Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} disabled={pending} title="Retirer du groupe" aria-label={`Retirer ${npc.name} du groupe`}><UserRoundMinus /></Button>
            </div>}
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Points de vie</span><span className="tabular-nums text-foreground">{npc.currentHp} / {npc.totalHp}</span></div>
            <Progress value={hp} className="h-1.5" />
          </div>
        </div>
      </div>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between border-t px-4 py-2.5 text-sm font-medium hover:bg-muted/35" aria-expanded={open}>
          <span>{open ? "Replier" : "Notes et sac à dos"}</span>
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <div className="space-y-4 p-4">
          <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h4>{npc.playerNotes ? <RichTextView html={npc.playerNotes} className="text-sm leading-6" /> : <p className="text-sm text-muted-foreground">Aucune note.</p>}</section>
          {canManage && npc.gmNotes && <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes MJ</h4><RichTextView html={npc.gmNotes} className="text-sm leading-6" /></section>}
        </div>
        {open && <NpcBackpack npc={npc} defaultOpen className="border-t" />}
      </CollapsibleContent>
    </article>
  </Collapsible>
}

/**
 * Les PNJs qui voyagent avec le groupe (« Dans le groupe joueur » dans la feuille).
 * Les joueurs les déplient pour lire leurs notes publiques, suivre leur vie et gérer
 * leur sac à dos : c'est le seul inventaire de PNJ qu'ils voient et modifient.
 * Le MJ y modifie aussi la fiche, et choisit qui fait partie du groupe.
 */
export function GroupNpcs({ campaignId, initialNpcs, canManage }: { campaignId: string; initialNpcs: CampaignNpcRecord[]; canManage: boolean }) {
  const [npcs, setNpcs] = useState(initialNpcs)
  const [editing, setEditing] = useState<CampaignNpcRecord | null>(null)
  const [picking, setPicking] = useState(false)
  const [candidates, setCandidates] = useState<CampaignNpcRecord[] | null>(null)
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function run(task: () => Promise<void>) {
    setPending(true); setError("")
    try { await task() } catch (caught) { setError(caught instanceof Error ? caught.message : "Modification impossible.") }
    setPending(false)
  }

  function replace(saved: CampaignNpcRecord) {
    setNpcs((current) => saved.inPlayerGroup
      ? current.some((npc) => npc.id === saved.id) ? current.map((npc) => npc.id === saved.id ? saved : npc) : [...current, saved]
      : current.filter((npc) => npc.id !== saved.id))
    setCandidates((current) => current?.map((npc) => npc.id === saved.id ? saved : npc) ?? null)
  }

  async function openPicker() {
    if (picking) { setPicking(false); return }
    setPicking(true)
    if (candidates) return
    await run(async () => {
      const response = await fetch(`/api/npcs?pageLinked=${encodeURIComponent(campaignId)}`)
      const payload = (await response.json()) as { npcs?: CampaignNpcRecord[]; error?: string }
      if (!response.ok) throw new Error(payload.error || "Les PNJ n’ont pas pu être chargés.")
      setCandidates(payload.npcs || [])
    })
  }

  const folded = foldNpcName(query)
  const available = (candidates ?? []).filter((npc) => !npc.inPlayerGroup && !npcs.some((member) => member.id === npc.id) && (!folded || foldNpcName(`${npc.name} ${npc.title} ${npc.occupation}`).includes(folded)))

  return <div>
    <div className="flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><UserRound className="size-5" />PNJs du groupe</h2>
      {canManage && <Button type="button" onClick={() => void openPicker()} disabled={pending && !picking}>{picking ? <X /> : <Plus />}{picking ? "Fermer" : "Ajouter"}</Button>}
    </div>
    {canManage && picking && <div className="mt-5 rounded-xl border bg-background/60 p-3">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher un PNJ de la campagne…" /></div>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {candidates === null ? <div className="grid min-h-20 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>
          : available.length ? available.map((npc) => <button key={npc.id} type="button" disabled={pending} onClick={() => void run(async () => { const [saved] = await persistNpcs("add-to-group", campaignId, [npc]); replace(saved) })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">{npc.portrait
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={npc.portrait} alt="" className="size-full object-cover" />
              : <UserRound className="size-4" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{npc.name}</span><span className="block truncate text-xs text-muted-foreground">{[npc.title, npc.occupation, `PV ${npc.currentHp} / ${npc.totalHp}`].filter(Boolean).join(" · ")}</span></span>
            <Plus className="size-4 text-muted-foreground" />
          </button>)
            : <p className="px-3 py-6 text-center text-xs text-muted-foreground">{candidates.length ? "Aucun autre PNJ à ajouter." : "Cette campagne n’a encore aucun PNJ. Crée-les depuis la page PNJs."}</p>}
      </div>
    </div>}
    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    {npcs.length
      ? <div className="mt-6 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{npcs.map((npc) => <GroupNpcCard key={npc.id} npc={npc} canManage={canManage} pending={pending} onEdit={() => setEditing(npc)} onRemove={() => void run(async () => { const [saved] = await persistNpcs("remove-from-group", campaignId, [npc]); replace(saved) })} />)}</div>
      : <p className="mt-4 text-sm text-muted-foreground">Aucun PNJ ne voyage avec le groupe pour l’instant.</p>}
    {canManage && <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null) }}>
      {editing && <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle className="font-display text-3xl">{editing.name}</DialogTitle></DialogHeader>
        <NpcForm key={editing.id} npc={editing} pending={pending} onClose={() => setEditing(null)} onSave={(npc, portrait) => void run(async () => {
          const [saved] = await persistNpcs("save", campaignId, [npc])
          replace(portrait ? await uploadNpcPortrait(saved.id, portrait) : saved)
          setEditing(null)
        })} />
      </DialogContent>}
    </Dialog>}
  </div>
}
