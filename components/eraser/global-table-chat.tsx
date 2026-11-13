"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { usePathname } from "next/navigation"
import { Dices, MessageCircle, Send, UserRound, X } from "lucide-react"
import type { JsonValue, Room } from "trystero"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { CAMPAIGN_LIVE_OUT_EVENT, campaignLiveFromPayload, receiveCampaignChange, type CampaignLiveEnvelope } from "@/lib/campaign-live"
import { rollDiceExpression } from "@/lib/math-expression"
import type { ChatActivityRecord } from "@/lib/chat-activity"
import { chatMessageTime } from "@/lib/chat-time"
import { cn } from "@/lib/utils"
import { ownedBy } from "@/lib/ownership"

type ChatUser = { uid: string; role: "admin" | "mj" | "joueur" }
type ChatCampaign = { id: string; name: string }
type ChatMember = { id: string; name: string; ownerUid: string }
type ChatAccount = { uid: string; name: string }
type ConnectionState = "connecting" | "ready" | "error"
type Presence = { role: ChatUser["role"]; uid: string; name: string }

// Voir lib/campaign-chat.ts : un message à un compte ou un jet privé garde
// l'audience « character » et préfixe son destinataire.
const ACCOUNT_PREFIX = "account:"
const PRIVATE_PREFIX = "self:"
const PRIVATE_ROLL = /^\/rpriv[ée]\s+/i

function foldName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
}

/** Le destinataire écrit au début de `tail` : le nom le plus long gagne (« Léa » contre « Léa Morn »). */
function targetAtStart<T extends { name: string }>(targets: T[], tail: string) {
  const folded = foldName(tail)
  return [...targets].sort((left, right) => right.name.length - left.name.length).find((candidate) => folded.startsWith(`${foldName(candidate.name)} `))
}

function audienceLabel(activity: ChatActivityRecord) {
  if (activity.audience === "gm") return "MJ seulement"
  if (activity.recipientId.startsWith(PRIVATE_PREFIX)) return "Privé"
  return `À ${activity.recipientName}`
}

const LAST_CAMPAIGN_KEY = "eraser:chat-campaign"
/** Le canal sans campagne, ouvert à tous : celui du chat à l'ouverture d'Eraser. */
const GENERAL_CHANNEL = "general"
// Dernier message vu, par salon : au-delà, le bouton du chat porte une pastille.
const SEEN_KEY = "eraser:chat-seen:"
// Le salon en direct se rejoint après ce temps sans souris ni clavier (voir `live`).
const QUIET_CAMPAIGN_MS = 4_000
const QUIET_ELSEWHERE_MS = 20_000
const QUIET_INPUTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const

function readSeen(campaignId: string) {
  try { return window.localStorage.getItem(SEEN_KEY + campaignId) || "" } catch { return "" }
}

function latestActivityAt(activities: ChatActivityRecord[]) {
  return activities.reduce((latest, activity) => activity.createdAt > latest ? activity.createdAt : latest, "")
}

/**
 * La première connexion pair à pair d'une fenêtre met WebRTC en route : c'est elle, le gel de 1 à
 * 2 s. Elle est payée ici, quand le salon se rejoint (au repos, voir `live`), et non quand trystero
 * prépare ses connexions : il attend pour cela un temps mort du navigateur, qui peut tarder (jusqu'à
 * TRYSTERO_IDLE_TIMEOUT_MS de vite.config.ts) et tomber alors sous les doigts.
 */
let webRtcStarted = false
function startWebRtc() {
  if (webRtcStarted || typeof RTCPeerConnection !== "function") return
  webRtcStarted = true
  try { new RTCPeerConnection().close() } catch { /* sans WebRTC, le salon le dira (« Hors ligne ») */ }
}

function dataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof ArrayBuffer) ? value as Record<string, unknown> : null
}

function activityFromPayload(value: unknown): ChatActivityRecord | null {
  const record = dataRecord(value)
  if (!record || (record.kind !== "chat" && record.kind !== "dice") || ![record.id, record.mapId, record.authorUid, record.authorName, record.text, record.diceExpression, record.diceResult, record.createdAt].every((entry) => typeof entry === "string")) return null
  return {
    ...(record as unknown as ChatActivityRecord),
    audience: record.audience === "gm" || record.audience === "character" ? record.audience : "public",
    recipientId: typeof record.recipientId === "string" ? record.recipientId : "",
    recipientName: typeof record.recipientName === "string" ? record.recipientName : "",
  }
}

async function responseJson<T>(response: Response) {
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || "La demande a échoué.")
  return payload
}

/** L'heure du message, et sa date en petit (JJ/MM/AA) : une partie peut s'étaler sur des jours. */
function ActivityTime({ value }: { value: string }) {
  const { time, date, title } = chatMessageTime(value)
  return <time dateTime={value} title={title} className="ml-auto shrink-0 font-normal tabular-nums text-muted-foreground">{date && <span className="mr-1 text-[9.5px] opacity-75">{date}</span>}{time}</time>
}

export function GlobalTableChat({ user }: { user: ChatUser }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<ChatCampaign[]>([])
  // « Général » d'emblée : le chat est utilisable dès l'ouverture, sans choisir de campagne.
  const [campaignId, setCampaignId] = useState(GENERAL_CHANNEL)
  const [members, setMembers] = useState<ChatMember[]>([])
  const [accounts, setAccounts] = useState<ChatAccount[]>([])
  const [online, setOnline] = useState<ChatAccount[]>([])
  const [me, setMe] = useState<ChatAccount | null>(null)
  const [activities, setActivities] = useState<ChatActivityRecord[]>([])
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [chatText, setChatText] = useState("")
  const [notice, setNotice] = useState("")
  const [seen, setSeen] = useState<{ campaignId: string; at: string }>({ campaignId: "", at: "" })
  const openRef = useRef(false)

  const presenceRef = useRef<Map<string, Presence>>(new Map())
  const myNameRef = useRef("")
  const membersRef = useRef<ChatMember[]>([])
  const realtimeRef = useRef<{ activity: (payload: ChatActivityRecord) => void } | null>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)

  useEffect(() => { openRef.current = open }, [open])

  const markSeen = useCallback((forCampaign: string, at: string) => {
    if (!forCampaign || !at) return
    setSeen((current) => current.campaignId === forCampaign && current.at >= at ? current : { campaignId: forCampaign, at })
    try { if (readSeen(forCampaign) < at) window.localStorage.setItem(SEEN_KEY + forCampaign, at) } catch { /* navigation privée */ }
  }, [])

  const roomId = campaignId ? `chat:${campaignId}` : ""
  // L'historique et la liste des canaux (des lectures) attendent que la page affichée soit
  // chargée, ou qu'on ouvre le chat.
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    if (warm) return
    if (open) { queueMicrotask(() => setWarm(true)); return }
    const idle = typeof window.requestIdleCallback === "function"
      ? { id: window.requestIdleCallback(() => setWarm(true), { timeout: 10_000 }), cancel: (id: number) => window.cancelIdleCallback(id) }
      : { id: window.setTimeout(() => setWarm(true), 6_000), cancel: (id: number) => window.clearTimeout(id) }
    return () => idle.cancel(idle.id)
  }, [open, warm])

  // Le salon en direct, lui, gèle la fenêtre : sa première connexion pair à pair initialise
  // WebRTC, 1,2 à 2,1 s sous Windows (relevés de novembre 2026), et un temps mort de la page
  // ne suffit pas, l'écran se figeait sous les doigts. Il attend qu'on ouvre le chat, qu'Eraser
  // passe à l'arrière-plan, ou que personne n'y touche (souris, clavier, molette) un moment :
  // QUIET_CAMPAIGN_MS sur une page de campagne, dont le journal se met à jour en direct,
  // QUIET_ELSEWHERE_MS ailleurs.
  const [live, setLive] = useState(false)
  const lastInputRef = useRef(0)
  const onCampaignPage = /^\/campagne\/[^/]+/.test(pathname) || pathname.startsWith("/bac-a-sable")
  useEffect(() => {
    if (live) return
    if (open || document.visibilityState === "hidden") { queueMicrotask(() => setLive(true)); return }
    const quietMs = onCampaignPage ? QUIET_CAMPAIGN_MS : QUIET_ELSEWHERE_MS
    if (!lastInputRef.current) lastInputRef.current = performance.now()
    let timer = 0
    // Un seul minuteur, réarmé à son échéance pour le temps qui manque : pas un par mouvement de souris.
    function schedule() { timer = window.setTimeout(check, Math.max(0, quietMs - (performance.now() - lastInputRef.current))) }
    function check() {
      if (performance.now() - lastInputRef.current >= quietMs) setLive(true)
      else schedule()
    }
    const touched = () => { lastInputRef.current = performance.now() }
    const away = () => { if (document.visibilityState === "hidden" || !document.hasFocus()) setLive(true) }
    for (const type of QUIET_INPUTS) window.addEventListener(type, touched, { capture: true, passive: true })
    window.addEventListener("blur", away)
    document.addEventListener("visibilitychange", away)
    schedule()
    return () => {
      window.clearTimeout(timer)
      for (const type of QUIET_INPUTS) window.removeEventListener(type, touched, { capture: true })
      window.removeEventListener("blur", away)
      document.removeEventListener("visibilitychange", away)
    }
  }, [live, open, onCampaignPage])

  useEffect(() => { membersRef.current = members }, [members])
  useEffect(() => { activityEndRef.current?.scrollIntoView({ block: "nearest" }) }, [activities.length, open])
  useEffect(() => () => { if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current) }, [])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 4200)
  }, [])

  // À l'ouverture d'Eraser, le chat est sur « Général ». Ensuite, aller sur la page d'une
  // campagne (ou le bac à sable) passe sur son canal ; on revient à « Général » d'un choix.
  // Une fenêtre qui s'ouvre (ou se recharge : « Actualiser », mise à jour) sur une page de
  // campagne prend aussitôt son canal : le journal s'y met à jour en direct.
  const firstPath = useRef(true)
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false
      if (!/^\/campagne\/[^/]+/.test(pathname)) return
    }
    const fromPath = pathname.match(/^\/campagne\/([^/]+)/)?.[1] || (pathname.startsWith("/bac-a-sable") ? "bac-a-sable" : "")
    if (!fromPath) return
    try { window.localStorage.setItem(LAST_CAMPAIGN_KEY, fromPath) } catch { /* private browsing */ }
    queueMicrotask(() => setCampaignId(fromPath))
  }, [pathname])

  useEffect(() => {
    if (!warm) return
    let cancelled = false
    void fetch("/api/campaign-chat?campaigns=1")
      .then((response) => responseJson<{ campaigns: ChatCampaign[] }>(response))
      .then((payload) => {
        if (cancelled) return
        setCampaigns(payload.campaigns)
        // Un canal qui n'est plus proposé (campagne quittée, serveur d'avant « Général ») : retour au premier.
        setCampaignId((current) => current && payload.campaigns.some((campaign) => campaign.id === current) ? current : payload.campaigns[0]?.id ?? "")
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [warm])

  useEffect(() => {
    if (!campaignId) {
      queueMicrotask(() => { setActivities([]); setMembers([]); setAccounts([]) })
      return
    }
    // L'historique se lit dans Google Sheets (tout l'onglet Journal) : comme le salon en
    // direct, il attend que la page affichée soit chargée, ou qu'on ouvre le chat.
    if (!warm) return
    let cancelled = false
    void fetch(`/api/campaign-chat?pageLinked=${encodeURIComponent(campaignId)}`)
      .then((response) => responseJson<{ activities: ChatActivityRecord[]; members: ChatMember[]; accounts?: ChatAccount[]; me?: ChatAccount }>(response))
      .then((payload) => {
        if (cancelled) return
        // Premier passage dans ce salon : l'historique compte comme déjà lu.
        const latest = latestActivityAt(payload.activities)
        const stored = readSeen(campaignId)
        if (!stored || openRef.current) markSeen(campaignId, latest || new Date().toISOString())
        else setSeen({ campaignId, at: stored })
        setActivities(payload.activities)
        setMembers(payload.members)
        setAccounts(payload.accounts || [])
        if (payload.me) setMe(payload.me)
      })
      .catch(() => { if (!cancelled) showNotice("Ce salon n’a pas pu être chargé.") })
    return () => { cancelled = true }
  }, [campaignId, markSeen, showNotice, warm])

  useEffect(() => {
    if (!roomId || !live) return
    let cancelled = false
    let room: Room | null = null
    let onLiveOut: ((event: Event) => void) | null = null
    const presence = presenceRef.current
    presence.clear()
    queueMicrotask(() => { if (!cancelled) { setConnection("connecting"); setOnline([]) } })
    const refreshOnline = () => setOnline([...new Map([...presence.values()].filter((peer) => peer.name).map((peer) => [peer.uid, { uid: peer.uid, name: peer.name }])).values()])
    void import("trystero").then(async ({ joinRoom }) => {
      if (cancelled) return
      // WebRTC mis en route, puis le salon rejoint dans une tâche suivante : deux gels courts au
      // lieu d'un seul de plus d'une seconde (relevés de novembre 2026), un clic entre les deux
      // passe aussitôt.
      startWebRtc()
      await new Promise((resolve) => window.setTimeout(resolve, 60))
      if (cancelled) return
      room = joinRoom({ appId: "com-eraser-jdr-chat-v1", password: campaignId }, roomId, { onJoinError: () => setConnection("error") })
      const activityAction = room.makeAction("activity")
      const presenceAction = room.makeAction("presence")
      // Les notes de session et les sessions modifiées (lib/campaign-live.ts) : le même salon,
      // sans connexion de plus, pour que le journal se mette à jour chez tout le monde.
      const liveAction = room.makeAction("live")
      liveAction.onMessage = (value) => {
        const envelope = campaignLiveFromPayload(value)
        if (envelope && envelope.campaignId === campaignId) receiveCampaignChange(envelope)
      }
      onLiveOut = (event: Event) => {
        const detail = (event as CustomEvent<CampaignLiveEnvelope>).detail
        if (detail?.campaignId !== campaignId) return
        void liveAction.send(detail as unknown as JsonValue).catch(() => undefined)
      }
      window.addEventListener(CAMPAIGN_LIVE_OUT_EVENT, onLiveOut)
      activityAction.onMessage = (value) => {
        const activity = activityFromPayload(value)
        if (!activity || activity.mapId !== roomId) return
        setActivities((current) => current.some((item) => item.id === activity.id) ? current : [...current, activity].slice(-200))
        if (openRef.current) markSeen(campaignId, activity.createdAt)
      }
      presenceAction.onMessage = (value, context) => {
        const record = dataRecord(value)
        if (!record || (record.role !== "admin" && record.role !== "mj" && record.role !== "joueur") || typeof record.uid !== "string") return
        presence.set(context.peerId, { role: record.role, uid: record.uid, name: typeof record.name === "string" ? record.name.slice(0, 120) : "" })
        refreshOnline()
      }
      room.onPeerJoin = (peerId) => { void presenceAction.send({ role: user.role, uid: user.uid, name: myNameRef.current } as JsonValue, { target: peerId }).catch(() => undefined) }
      room.onPeerLeave = (peerId) => { presence.delete(peerId); refreshOnline() }
      realtimeRef.current = {
        activity: (payload) => {
          if (payload.audience === "character" && payload.recipientId.startsWith(PRIVATE_PREFIX)) return
          const recipientUid = payload.recipientId.startsWith(ACCOUNT_PREFIX)
            ? payload.recipientId.slice(ACCOUNT_PREFIX.length)
            : membersRef.current.find((member) => member.id === payload.recipientId)?.ownerUid
          const targets = payload.audience === "public" ? undefined : [...presence]
            .filter(([, peer]) => payload.audience === "gm" ? peer.role === "admin" || peer.role === "mj" : Boolean(recipientUid && ownedBy(recipientUid, [peer.uid])))
            .map(([peerId]) => peerId)
          if (targets && !targets.length) return
          void activityAction.send(payload as unknown as JsonValue, targets ? { target: targets } : undefined).catch(() => setConnection("error"))
        },
      }
      setConnection("ready")
    }).catch(() => setConnection("error"))
    return () => {
      cancelled = true
      realtimeRef.current = null
      presence.clear()
      if (onLiveOut) window.removeEventListener(CAMPAIGN_LIVE_OUT_EVENT, onLiveOut)
      if (room) void room.leave()
    }
  }, [roomId, campaignId, markSeen, user.role, user.uid, live])

  // Le nom du compte, partout : plus de « MJ » ni de nom de personnage.
  const speakerName = me?.name || "Joueur"
  useEffect(() => { myNameRef.current = speakerName }, [speakerName])
  // Les comptes de la campagne, plus ceux connectés en ce moment.
  const directTargets = useMemo(() => {
    const byUid = new Map<string, ChatAccount>()
    for (const candidate of [...accounts, ...online]) if (candidate.uid !== user.uid && !byUid.has(candidate.uid)) byUid.set(candidate.uid, candidate)
    return [...byUid.values()].sort((left, right) => left.name.localeCompare(right.name, "fr"))
  }, [accounts, online, user.uid])

  const directCommandMatch = chatText.match(/^\/(r?joueur)\s+(.*)$/i)
  const directPrefix = directCommandMatch?.[1].toLocaleLowerCase("fr") === "rjoueur" ? "/rjoueur" : "/joueur"
  const directTail = directCommandMatch?.[2] ?? null
  const directSelection = directTail === null ? null : targetAtStart(directTargets, directTail)
  const directSuggestions = directTail === null || directSelection ? [] : directTargets.filter((target) => !directTail.trim() || foldName(target.name).includes(foldName(directTail.trim()))).slice(0, 8)

  async function publishActivity(activity: ChatActivityRecord) {
    setActivities((current) => [...current.filter((item) => item.id !== activity.id), activity].slice(-200))
    realtimeRef.current?.activity(activity)
    try {
      const payload = await responseJson<{ activity: ChatActivityRecord }>(await fetch("/api/campaign-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageLinked: campaignId, ...activity }),
      }))
      setActivities((current) => current.map((item) => item.id === activity.id ? payload.activity : item))
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Message non envoyé.")
    }
  }

  function sendChat(event: FormEvent) {
    event.preventDefault()
    if (!campaignId || !chatText.trim()) return
    const raw = chatText.trim()
    let kind: "chat" | "dice" = "chat"
    let audience: "public" | "gm" | "character" = "public"
    let recipientId = ""
    let recipientName = ""
    let content = raw
    let diceExpression = ""
    let diceResult = ""
    try {
      if (/^\/rmj\s+/i.test(raw)) {
        kind = "dice"
        audience = "gm"
        diceExpression = raw.replace(/^\/rmj\s+/i, "")
      } else if (PRIVATE_ROLL.test(raw)) {
        kind = "dice"
        audience = "character"
        recipientId = `${PRIVATE_PREFIX}${user.uid}`
        recipientName = "Privé"
        diceExpression = raw.replace(PRIVATE_ROLL, "")
      } else if (/^\/rjoueur\s+/i.test(raw)) {
        const tail = raw.replace(/^\/rjoueur\s+/i, "")
        const target = targetAtStart(directTargets, tail)
        if (!target) throw new Error("TARGET")
        kind = "dice"
        audience = "character"
        recipientId = `${ACCOUNT_PREFIX}${target.uid}`
        recipientName = target.name
        diceExpression = tail.slice(target.name.length).trim()
      } else if (/^\/r\s+/i.test(raw)) {
        kind = "dice"
        diceExpression = raw.replace(/^\/r\s+/i, "")
      } else if (/^\/mj\s+/i.test(raw)) {
        audience = "gm"
        content = raw.replace(/^\/mj\s+/i, "")
      } else if (/^\/joueur\s+/i.test(raw)) {
        const tail = raw.replace(/^\/joueur\s+/i, "")
        const target = targetAtStart(directTargets, tail)
        if (!target) throw new Error("TARGET")
        audience = "character"
        recipientId = `${ACCOUNT_PREFIX}${target.uid}`
        recipientName = target.name
        content = tail.slice(target.name.length).trim()
      }
      if (kind === "dice") {
        const rolled = rollDiceExpression(diceExpression)
        diceResult = `${rolled.detail} → ${rolled.total}`
        content = ""
      }
      if (!content && kind === "chat") throw new Error("EMPTY")
      setChatText("")
      void publishActivity({ id: crypto.randomUUID(), mapId: roomId, kind, authorUid: user.uid, authorName: speakerName, text: content, diceExpression, diceResult, createdAt: new Date().toISOString(), audience, recipientId, recipientName })
    } catch {
      showNotice("Commande invalide. Exemples : /r 1d20 + 5, /rmj 2d6, /rprivé 1d100, /joueur ou /rjoueur puis choisis un compte.")
    }
  }

  const unread = !open && seen.campaignId === campaignId && activities.some((activity) => activity.authorUid !== user.uid && activity.createdAt > seen.at)

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Button size="icon" className="relative rounded-full shadow-2xl" onClick={() => { if (!open) markSeen(campaignId, latestActivityAt(activities)); setOpen((value) => !value) }} aria-label={open ? "Fermer le chat" : unread ? "Ouvrir le chat (nouveaux messages)" : "Ouvrir le chat"}>
        <MessageCircle />
        {unread && <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-[#d33b2c] ring-2 ring-primary" aria-hidden="true" />}
      </Button>
      {open && (
        <section className="fixed bottom-16 right-4 flex h-[min(34rem,calc(100svh-5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b p-3">
            <MessageCircle className="size-4 text-primary" />
            <div>
              <h2 className="font-display font-semibold">Table</h2>
              <p className="text-[10px] text-muted-foreground">{campaignId ? `${campaigns.find((campaign) => campaign.id === campaignId)?.name ?? (campaignId === GENERAL_CHANNEL ? "Général" : "Campagne")} · tu écris en tant que ${speakerName}` : "Choisis un canal"}</p>
            </div>
            <Badge variant={connection === "ready" ? "secondary" : "outline"} className="ml-auto">{connection === "ready" ? "En direct" : connection === "error" ? "Hors ligne" : "…"}</Badge>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}><X /></Button>
          </div>
          {campaigns.length > 1 && (
            <div className="border-b px-3 py-2">
              <NativeSelect value={campaignId} onChange={(event) => setCampaignId(event.target.value)} aria-label="Canal">
                {!campaignId && <NativeSelectOption value="">Choisir un canal</NativeSelectOption>}
                {campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.id === GENERAL_CHANNEL ? `${campaign.name} · sans campagne` : campaign.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {activities.map((activity) => (
              <div key={activity.id} className={cn("rounded-xl border p-2.5", activity.kind === "dice" ? "border-primary/20 bg-primary/6" : "bg-background/60")}>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {activity.kind === "dice" && <Dices className="size-3.5 text-primary" />}
                  {activity.authorName}
                  {activity.audience !== "public" && <Badge variant="outline" className="h-5 text-[9px]">{audienceLabel(activity)}</Badge>}
                  <ActivityTime value={activity.createdAt} />
                </div>
                {activity.kind === "dice"
                  ? <p className="mt-1 text-sm"><span className="font-mono font-semibold">{activity.diceExpression}</span><br /><span>{activity.diceResult}</span></p>
                  : <p className="mt-1 whitespace-pre-wrap break-words text-sm">{activity.text}</p>}
              </div>
            ))}
            {!activities.length && <p className="py-10 text-center text-xs text-muted-foreground">{campaignId ? "Le chat et les dés apparaîtront ici." : "Choisis un canal pour discuter."}</p>}
            <div ref={activityEndRef} />
          </div>
          {notice && <p className="border-t px-3 py-1.5 text-[10px] text-destructive">{notice}</p>}
          <form className="relative border-t p-3" onSubmit={sendChat}>
            {directSuggestions.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-1 max-h-48 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
                {directSuggestions.map((target) => (
                  <button type="button" key={target.uid} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent" onClick={() => setChatText(`${directPrefix} ${target.name} `)}>
                    <UserRound className="size-4 text-primary" /><span>{target.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={1200} placeholder="Message ou /r 1d20 + 5" disabled={!campaignId} />
              <Button type="submit" size="icon" disabled={!campaignId || !chatText.trim()}><Send /></Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">/r · /rmj · /rprivé · /mj · /joueur · /rjoueur puis choisir un compte</p>
          </form>
        </section>
      )}
    </div>
  )
}
