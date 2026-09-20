"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { usePathname } from "next/navigation"
import { Dices, MessageCircle, Send, UserRound, X } from "lucide-react"
import type { JsonValue, Room } from "trystero"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { rollDiceExpression } from "@/lib/math-expression"
import type { TabletopActivityRecord } from "@/lib/tabletop-schema"
import { cn } from "@/lib/utils"

type ChatUser = { uid: string; role: "admin" | "mj" | "joueur" }
type ChatCampaign = { id: string; name: string }
type ChatMember = { id: string; name: string; ownerUid: string }
type ConnectionState = "connecting" | "ready" | "error"
type Presence = { role: ChatUser["role"]; uid: string }

const LAST_CAMPAIGN_KEY = "eraser:chat-campaign"

function dataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof ArrayBuffer) ? value as Record<string, unknown> : null
}

function activityFromPayload(value: unknown): TabletopActivityRecord | null {
  const record = dataRecord(value)
  if (!record || (record.kind !== "chat" && record.kind !== "dice") || ![record.id, record.mapId, record.authorUid, record.authorName, record.text, record.diceExpression, record.diceResult, record.createdAt].every((entry) => typeof entry === "string")) return null
  return {
    ...(record as unknown as TabletopActivityRecord),
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

function formatActivityTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date)
}

export function GlobalTableChat({ user }: { user: ChatUser }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<ChatCampaign[]>([])
  const [campaignId, setCampaignId] = useState("")
  const [members, setMembers] = useState<ChatMember[]>([])
  const [activities, setActivities] = useState<TabletopActivityRecord[]>([])
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [speakerId, setSpeakerId] = useState("")
  const [chatText, setChatText] = useState("")
  const [notice, setNotice] = useState("")

  const presenceRef = useRef<Map<string, Presence>>(new Map())
  const membersRef = useRef<ChatMember[]>([])
  const realtimeRef = useRef<{ activity: (payload: TabletopActivityRecord) => void } | null>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)

  const hideOnThisPage = /\/tabletop(\/|$)/.test(pathname)
  const roomId = campaignId ? `chat:${campaignId}` : ""

  useEffect(() => { membersRef.current = members }, [members])
  useEffect(() => { activityEndRef.current?.scrollIntoView({ block: "nearest" }) }, [activities.length, open])
  useEffect(() => () => { if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current) }, [])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 4200)
  }, [])

  // Resolve the active campaign: the one in the URL wins, else the last one used.
  useEffect(() => {
    const fromPath = pathname.match(/^\/campagne\/([^/]+)/)?.[1] || (pathname.startsWith("/bac-a-sable") ? "bac-a-sable" : "")
    if (!fromPath) return
    try { window.localStorage.setItem(LAST_CAMPAIGN_KEY, fromPath) } catch { /* private browsing */ }
    queueMicrotask(() => setCampaignId(fromPath))
  }, [pathname])

  useEffect(() => {
    let cancelled = false
    void fetch("/api/campaign-chat?campaigns=1")
      .then((response) => responseJson<{ campaigns: ChatCampaign[] }>(response))
      .then((payload) => {
        if (cancelled) return
        setCampaigns(payload.campaigns)
        setCampaignId((current) => {
          if (current) return current
          let stored = ""
          try { stored = window.localStorage.getItem(LAST_CAMPAIGN_KEY) || "" } catch { /* private browsing */ }
          if (stored && payload.campaigns.some((campaign) => campaign.id === stored)) return stored
          return payload.campaigns.length === 1 ? payload.campaigns[0].id : ""
        })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!campaignId) {
      queueMicrotask(() => { setActivities([]); setMembers([]) })
      return
    }
    let cancelled = false
    void fetch(`/api/campaign-chat?pageLinked=${encodeURIComponent(campaignId)}`)
      .then((response) => responseJson<{ activities: TabletopActivityRecord[]; members: ChatMember[] }>(response))
      .then((payload) => {
        if (cancelled) return
        setActivities(payload.activities)
        setMembers(payload.members)
      })
      .catch(() => { if (!cancelled) showNotice("Ce salon n’a pas pu être chargé.") })
    return () => { cancelled = true }
  }, [campaignId, showNotice])

  useEffect(() => {
    if (!roomId) return
    let cancelled = false
    let room: Room | null = null
    const presence = presenceRef.current
    presence.clear()
    queueMicrotask(() => { if (!cancelled) setConnection("connecting") })
    void import("trystero").then(({ joinRoom }) => {
      if (cancelled) return
      room = joinRoom({ appId: "com-eraser-jdr-chat-v1", password: campaignId }, roomId, { onJoinError: () => setConnection("error") })
      const activityAction = room.makeAction("activity")
      const presenceAction = room.makeAction("presence")
      activityAction.onMessage = (value) => {
        const activity = activityFromPayload(value)
        if (!activity || activity.mapId !== roomId) return
        setActivities((current) => current.some((item) => item.id === activity.id) ? current : [...current, activity].slice(-200))
      }
      presenceAction.onMessage = (value, context) => {
        const record = dataRecord(value)
        if (!record || (record.role !== "admin" && record.role !== "mj" && record.role !== "joueur") || typeof record.uid !== "string") return
        presence.set(context.peerId, { role: record.role, uid: record.uid })
      }
      room.onPeerJoin = (peerId) => { void presenceAction.send({ role: user.role, uid: user.uid } as JsonValue, { target: peerId }).catch(() => undefined) }
      room.onPeerLeave = (peerId) => presence.delete(peerId)
      realtimeRef.current = {
        activity: (payload) => {
          const recipientUid = membersRef.current.find((member) => member.id === payload.recipientId)?.ownerUid
          const targets = payload.audience === "public" ? undefined : [...presence]
            .filter(([, peer]) => payload.audience === "gm" ? peer.role === "admin" || peer.role === "mj" : Boolean(recipientUid && peer.uid === recipientUid))
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
      if (room) void room.leave()
    }
  }, [roomId, campaignId, user.role, user.uid])

  const canManage = user.role === "admin" || user.role === "mj"
  const ownedSpeakers = useMemo(() => members.filter((member) => member.ownerUid === user.uid), [members, user.uid])
  const directTargets = useMemo(() => members.filter((member) => member.ownerUid !== user.uid), [members, user.uid])
  const speaker = ownedSpeakers.find((member) => member.id === speakerId) || ownedSpeakers[0]
  const speakerName = canManage ? "MJ" : speaker?.name || "Joueur"

  const directCommandMatch = chatText.match(/^\/(r?joueur)\s+(.*)$/i)
  const directPrefix = directCommandMatch?.[1].toLocaleLowerCase("fr") === "rjoueur" ? "/rjoueur" : "/joueur"
  const directTail = directCommandMatch?.[2] ?? null
  const directSelection = directTail === null ? null : directTargets.find((target) => directTail.toLocaleLowerCase("fr").startsWith(`${target.name.toLocaleLowerCase("fr")} `))
  const directSuggestions = directTail === null || directSelection ? [] : directTargets.filter((target) => !directTail.trim() || target.name.toLocaleLowerCase("fr").includes(directTail.trim().toLocaleLowerCase("fr"))).slice(0, 8)

  async function publishActivity(activity: TabletopActivityRecord) {
    setActivities((current) => [...current.filter((item) => item.id !== activity.id), activity].slice(-200))
    realtimeRef.current?.activity(activity)
    try {
      const payload = await responseJson<{ activity: TabletopActivityRecord }>(await fetch("/api/campaign-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageLinked: campaignId, speakerId: speaker?.id || "", ...activity }),
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
      } else if (/^\/rjoueur\s+/i.test(raw)) {
        const tail = raw.replace(/^\/rjoueur\s+/i, "")
        const target = [...directTargets].sort((left, right) => right.name.length - left.name.length).find((candidate) => tail.toLocaleLowerCase("fr").startsWith(`${candidate.name.toLocaleLowerCase("fr")} `))
        if (!target) throw new Error("TARGET")
        kind = "dice"
        audience = "character"
        recipientId = target.id
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
        const target = [...directTargets].sort((left, right) => right.name.length - left.name.length).find((candidate) => tail.toLocaleLowerCase("fr").startsWith(`${candidate.name.toLocaleLowerCase("fr")} `))
        if (!target) throw new Error("TARGET")
        audience = "character"
        recipientId = target.id
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
      showNotice("Commande invalide. Exemples : /r 1d20 + 5, /rmj 2d6, /joueur ou /rjoueur puis choisis un personnage.")
    }
  }

  if (hideOnThisPage) return null

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Button size="icon" className="rounded-full shadow-2xl" onClick={() => setOpen((value) => !value)} aria-label={open ? "Fermer le chat" : "Ouvrir le chat"}>
        <MessageCircle />
      </Button>
      {open && (
        <section className="fixed bottom-16 right-4 flex h-[min(34rem,calc(100svh-5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 border-b p-3">
            <MessageCircle className="size-4 text-primary" />
            <div>
              <h2 className="font-display font-semibold">Table</h2>
              <p className="text-[10px] text-muted-foreground">{campaignId ? `Tu écris en tant que ${speakerName}` : "Choisis une campagne"}</p>
            </div>
            <Badge variant={connection === "ready" ? "secondary" : "outline"} className="ml-auto">{connection === "ready" ? "En direct" : connection === "error" ? "Hors ligne" : "…"}</Badge>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}><X /></Button>
          </div>
          {campaigns.length > 1 && (
            <div className="border-b px-3 py-2">
              <NativeSelect value={campaignId} onChange={(event) => setCampaignId(event.target.value)} aria-label="Campagne">
                <NativeSelectOption value="">Choisir une campagne</NativeSelectOption>
                {campaigns.map((campaign) => <NativeSelectOption key={campaign.id} value={campaign.id}>{campaign.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          )}
          {!canManage && ownedSpeakers.length > 1 && (
            <div className="border-b px-3 py-2">
              <NativeSelect value={speaker?.id || ""} onChange={(event) => setSpeakerId(event.target.value)} aria-label="Personnage qui parle">
                {ownedSpeakers.map((member) => <NativeSelectOption key={member.id} value={member.id}>{member.name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {activities.map((activity) => (
              <div key={activity.id} className={cn("rounded-xl border p-2.5", activity.kind === "dice" ? "border-primary/20 bg-primary/6" : "bg-background/60")}>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {activity.kind === "dice" && <Dices className="size-3.5 text-primary" />}
                  {activity.authorName}
                  {activity.audience !== "public" && <Badge variant="outline" className="h-5 text-[9px]">{activity.audience === "gm" ? "MJ seulement" : `À ${activity.recipientName}`}</Badge>}
                  <span className="ml-auto font-normal text-muted-foreground">{formatActivityTime(activity.createdAt)}</span>
                </div>
                {activity.kind === "dice"
                  ? <p className="mt-1 text-sm"><span className="font-mono font-semibold">{activity.diceExpression}</span><br /><span>{activity.diceResult}</span></p>
                  : <p className="mt-1 whitespace-pre-wrap break-words text-sm">{activity.text}</p>}
              </div>
            ))}
            {!activities.length && <p className="py-10 text-center text-xs text-muted-foreground">{campaignId ? "Le chat et les dés apparaîtront ici." : "Choisis une campagne pour discuter."}</p>}
            <div ref={activityEndRef} />
          </div>
          {notice && <p className="border-t px-3 py-1.5 text-[10px] text-destructive">{notice}</p>}
          <form className="relative border-t p-3" onSubmit={sendChat}>
            {directSuggestions.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-1 max-h-48 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
                {directSuggestions.map((target) => (
                  <button type="button" key={target.id} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent" onClick={() => setChatText(`${directPrefix} ${target.name} `)}>
                    <UserRound className="size-4 text-primary" /><span>{target.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={1200} placeholder="Message ou /r 1d20 + 5" disabled={!campaignId} />
              <Button type="submit" size="icon" disabled={!campaignId || !chatText.trim()}><Send /></Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">/r · /rmj · /mj · /joueur · /rjoueur puis choisir</p>
          </form>
        </section>
      )}
    </div>
  )
}
