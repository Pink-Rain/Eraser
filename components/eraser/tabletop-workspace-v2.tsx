"use client"

/* eslint-disable @next/next/no-img-element -- portraits use authenticated, dynamic API URLs */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import type * as Leaflet from "leaflet"
import type { JsonValue, Room } from "trystero"
import "leaflet/dist/leaflet.css"
import {
  Beaker,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Dices,
  Download,
  FolderTree,
  Gem,
  ImagePlus,
  Landmark,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Plus,
  Ruler,
  Search,
  Send,
  Settings2,
  Shield,
  Store,
  Trash2,
  UserRound,
  Users,
  UtensilsCrossed,
  Wifi,
  WifiOff,
  X,
} from "lucide-react"

import { TabletopDetailWindows, type TabletopDetailWindow } from "@/components/eraser/tabletop-detail-windows"
import { TabletopMapOrganizer } from "@/components/eraser/tabletop-map-organizer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { evaluateRelativeExpression, rollDiceExpression } from "@/lib/math-expression"
import type {
  TabletopActivityRecord,
  TabletopEntityRecord,
  TabletopFolderRecord,
  TabletopMapRecord,
  TabletopNpcDetail,
  TabletopShopDetail,
  TabletopSnapshot,
  TabletopSourcePage,
  TabletopTokenRecord,
} from "@/lib/tabletop-schema"
import { cn } from "@/lib/utils"

type TabletopUser = { uid: string; role: "admin" | "mj" | "joueur" }
type ConnectionState = "connecting" | "ready" | "error"
type TokenSaveState = "saved" | "pending" | "saving" | "error"
type SyncMap = Pick<TabletopMapRecord, "id" | "name" | "backgroundUrl" | "width" | "height" | "gridSize" | "distancePerGrid" | "distanceUnit" | "folder" | "updatedAt">
type Presence = { role: TabletopUser["role"]; uid: string }
type Notice = { message: string; error?: boolean } | null
type LibraryTab = "npc" | "character" | "shop"
type TokenPatch = { tokenId: string } & Partial<Pick<TabletopTokenRecord, "x" | "y" | "scale" | "iconScale" | "label" | "icon" | "color">>
type MarkerDraft = { tokenId: string; label: string; icon: string; iconScale: number; color: string }
type RealtimeBridge = {
  move: (payload: { tokenId: string; x: number; y: number; final: boolean }) => void
  appearance: (payload: TokenPatch) => void
  hp: (payload: { kind: "npc" | "character"; id: string; currentHp: number; totalHp: number }) => void
  activity: (payload: TabletopActivityRecord) => void
  token: (payload: { type: "upsert"; token: TabletopTokenRecord; entity: TabletopEntityRecord } | { type: "remove"; tokenId: string }) => void
  map: (payload: SyncMap) => void
}

const markerColors = ["#7f3430", "#315f8f", "#3f7652", "#8b6b2f", "#6c4c8c", "#b65076", "#32383f", "#d47732"]
const shopSymbols: Record<NonNullable<TabletopEntityRecord["shopKey"]>, string> = { market: "⌂", bookshop: "▤", antique: "◈", armory: "⚔", "black-market": "◐", alchemist: "⚗", tavern: "♨" }
const shopIcons = { market: Store, bookshop: BookOpen, antique: Gem, armory: Shield, "black-market": Landmark, alchemist: Beaker, tavern: UtensilsCrossed }

function dataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof ArrayBuffer) ? value as Record<string, unknown> : null
}

function entityKey(entity: Pick<TabletopEntityRecord, "kind" | "id">) {
  return `${entity.kind}:${entity.id}`
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function sameFolder(left: string, right: string) {
  return left.trim().toLocaleLowerCase("fr") === right.trim().toLocaleLowerCase("fr")
}

function syncMap(map: TabletopMapRecord): SyncMap {
  return {
    id: map.id,
    name: map.name,
    backgroundUrl: map.backgroundUrl,
    width: map.width,
    height: map.height,
    gridSize: map.gridSize,
    distancePerGrid: map.distancePerGrid,
    distanceUnit: map.distanceUnit,
    folder: map.folder,
    updatedAt: map.updatedAt,
  }
}

function formatActivityTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date)
}

async function responseJson<T>(response: Response) {
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || "La modification a échoué.")
  return payload
}

async function imageDimensions(file: File) {
  const bitmap = await createImageBitmap(file)
  const dimensions = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dimensions
}

function mapImageUrl(map: TabletopMapRecord, roomKey: string) {
  if (!map.backgroundUrl || !map.backgroundUrl.startsWith("/api/tabletop/background/")) return map.backgroundUrl
  const parameters = new URLSearchParams({ v: map.updatedAt })
  if (roomKey) parameters.set("roomKey", roomKey)
  return `${map.backgroundUrl}?${parameters}`
}

function tokenPortraitUrl(entity: TabletopEntityRecord, map: TabletopMapRecord, roomKey: string) {
  if (!entity.portrait) return ""
  const parameters = new URLSearchParams({ mapId: map.id, v: map.updatedAt })
  if (roomKey) parameters.set("roomKey", roomKey)
  if (entity.kind === "shop") {
    if (!entity.linkedNpcId || !entity.portrait.startsWith("/api/npcs/portrait/")) return entity.portrait
    return `/api/tabletop/portrait/npc/${encodeURIComponent(entity.linkedNpcId)}?${parameters}`
  }
  if (!entity.portrait.startsWith("/api/npcs/portrait/") && !entity.portrait.startsWith("/api/characters/portrait/")) return entity.portrait
  return `/api/tabletop/portrait/${entity.kind}/${encodeURIComponent(entity.id)}?${parameters}`
}

function renderedMapScale(map: Leaflet.Map, tabletopMap: TabletopMapRecord) {
  return Math.max(0.025, Math.min(32, 2 ** map.getZoom() * tabletopMap.gridSize / 70))
}

function createTokenIcon(
  leaflet: typeof import("leaflet"),
  entity: TabletopEntityRecord,
  token: TabletopTokenRecord,
  portrait: string,
  selected: boolean,
  mapScale: number,
) {
  const userScale = Math.max(0.35, Math.min(3, token.scale || 1))
  const renderScale = mapScale * userScale
  const root = document.createElement("div")
  root.className = cn("eraser-map-token", selected && "is-selected", !entity.controllable && "is-locked", `is-${entity.kind}`, entity.portrait && "has-portrait")
  root.dataset.tokenId = token.id
  root.style.setProperty("--token-render-scale", String(renderScale))
  root.style.setProperty("--token-accent", token.color || "#7f3430")

  if (entity.kind === "npc" || entity.kind === "character") {
    const track = document.createElement("span")
    track.className = "eraser-map-token__track"
    track.title = entity.controllable ? "Double-cliquer pour modifier les PV" : "Points de vie"
    const fill = document.createElement("span")
    fill.className = "eraser-map-token__fill"
    fill.style.width = `${entity.totalHp > 0 ? Math.max(0, Math.min(100, entity.currentHp / entity.totalHp * 100)) : 0}%`
    const hp = document.createElement("span")
    hp.className = "eraser-map-token__hp"
    hp.textContent = `${entity.currentHp}/${entity.totalHp}`
    track.append(fill, hp)
    root.appendChild(track)
  }

  if (entity.kind === "shop") {
    const card = document.createElement("span")
    card.className = "eraser-map-token__shop-card"
    const visual = document.createElement("span")
    visual.className = "eraser-map-token__shop-visual"
    const symbol = document.createElement("span")
    symbol.className = "eraser-map-token__shop-symbol"
    symbol.textContent = shopSymbols[entity.shopKey || "market"]
    visual.appendChild(symbol)
    if (portrait) {
      const image = document.createElement("img")
      image.src = portrait
      image.alt = ""
      image.decoding = "async"
      image.addEventListener("error", () => image.remove())
      visual.appendChild(image)
    }
    const copy = document.createElement("span")
    copy.className = "eraser-map-token__shop-copy"
    const name = document.createElement("strong")
    name.textContent = entity.name
    const detail = document.createElement("small")
    detail.textContent = entity.linkedNpcName ? `Vendeur · ${entity.linkedNpcName}` : entity.shopSize || "Magasin"
    copy.append(name, detail)
    card.append(visual, copy)
    root.appendChild(card)
    if (entity.controllable) {
      const handle = document.createElement("span")
      handle.className = "eraser-map-token__resize"
      handle.title = "Faire glisser pour redimensionner"
      handle.setAttribute("aria-hidden", "true")
      root.appendChild(handle)
    }
    return leaflet.divIcon({
      html: root,
      className: "eraser-leaflet-token-shell",
      iconSize: [154 * renderScale, 66 * renderScale],
      iconAnchor: [77 * renderScale, 33 * renderScale],
    })
  }

  const portraitWrap = document.createElement("span")
  portraitWrap.className = "eraser-map-token__portrait"
  const fallback = document.createElement("span")
  fallback.className = "eraser-map-token__fallback"
  fallback.textContent = entity.kind === "marker" ? token.icon || "✦" : entity.name.slice(0, 1).toUpperCase() || "?"
  if (entity.kind === "marker") fallback.style.setProperty("--marker-icon-scale", String(token.iconScale || 1))
  portraitWrap.appendChild(fallback)
  if (portrait) {
    const image = document.createElement("img")
    image.src = portrait
    image.alt = ""
    image.decoding = "async"
    image.addEventListener("error", () => image.remove())
    portraitWrap.appendChild(image)
  }
  root.appendChild(portraitWrap)
  if (entity.kind !== "marker" || token.label) {
    const name = document.createElement("span")
    name.className = "eraser-map-token__name"
    name.textContent = entity.name
    root.appendChild(name)
  }
  if (entity.controllable) {
    const handle = document.createElement("span")
    handle.className = "eraser-map-token__resize"
    handle.title = "Faire glisser pour redimensionner"
    handle.setAttribute("aria-hidden", "true")
    root.appendChild(handle)
  }
  return leaflet.divIcon({
    html: root,
    className: "eraser-leaflet-token-shell",
    iconSize: [92 * renderScale, 94 * renderScale],
    iconAnchor: [46 * renderScale, 47 * renderScale],
  })
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

function normalizeTokenPatch(value: unknown): TokenPatch | null {
  const record = dataRecord(value)
  if (!record || typeof record.tokenId !== "string") return null
  const patch: TokenPatch = { tokenId: record.tokenId }
  for (const key of ["x", "y", "scale", "iconScale"] as const) {
    const value = finiteNumber(record[key])
    if (value !== null) patch[key] = value
  }
  if (typeof record.label === "string") patch.label = record.label
  if (typeof record.icon === "string") patch.icon = record.icon
  if (typeof record.color === "string" && /^#[0-9a-f]{6}$/i.test(record.color)) patch.color = record.color
  return patch
}

export function TabletopWorkspace({ canManage, pageLinked, pageName, roomKey, requestedMapId, user }: { canManage: boolean; pageLinked: string; pageName: string; roomKey: string; requestedMapId: string; user: TabletopUser }) {
  const [maps, setMaps] = useState<TabletopMapRecord[]>([])
  const [folders, setFolders] = useState<TabletopFolderRecord[]>([])
  const [activeMap, setActiveMap] = useState<TabletopMapRecord | null>(null)
  const [tokens, setTokens] = useState<TabletopTokenRecord[]>([])
  const [entities, setEntities] = useState<TabletopEntityRecord[]>([])
  const [activities, setActivities] = useState<TabletopActivityRecord[]>([])
  const [currentRoomKey, setCurrentRoomKey] = useState(roomKey)
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [tokenSaveState, setTokenSaveState] = useState<TokenSaveState>("saved")
  const [bootstrapping, setBootstrapping] = useState(true)
  const [peerIds, setPeerIds] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)
  const [newMapOpen, setNewMapOpen] = useState(false)
  const [newMap, setNewMap] = useState({ name: "", folder: "Sans dossier" })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mapSettings, setMapSettings] = useState({ name: "", folder: "Sans dossier", gridSize: "70", distancePerGrid: "1", distanceUnit: "m" })
  const [mapOrganizerOpen, setMapOrganizerOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("npc")
  const [search, setSearch] = useState("")
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [measureMode, setMeasureMode] = useState(false)
  const [measureLabel, setMeasureLabel] = useState("")
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState("")
  const [speakerId, setSpeakerId] = useState("")
  const [markerOpen, setMarkerOpen] = useState(false)
  const [markerDraft, setMarkerDraft] = useState<MarkerDraft>({ tokenId: "", label: "", icon: "✦", iconScale: 1, color: "#7f3430" })
  const [importOpen, setImportOpen] = useState(false)
  const [sourcePages, setSourcePages] = useState<TabletopSourcePage[]>([])
  const [importSource, setImportSource] = useState("")
  const [sourceMaps, setSourceMaps] = useState<TabletopMapRecord[]>([])
  const [sourceMapId, setSourceMapId] = useState("")
  const [detailWindows, setDetailWindows] = useState<TabletopDetailWindow[]>([])
  const [leafletReady, setLeafletReady] = useState(0)
  const [mapScale, setMapScale] = useState(1)

  const mapNodeRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<typeof import("leaflet") | null>(null)
  const leafletMapRef = useRef<Leaflet.Map | null>(null)
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map())
  const measureLayersRef = useRef<Leaflet.Layer[]>([])
  const measureModeRef = useRef(measureMode)
  const realtimeRef = useRef<RealtimeBridge | null>(null)
  const presenceRef = useRef<Map<string, Presence>>(new Map())
  const entityOwnersRef = useRef<Map<string, string>>(new Map())
  const dirtyTokenPatchesRef = useRef<Map<string, TokenPatch>>(new Map())
  const flushPromiseRef = useRef<Promise<boolean> | null>(null)
  const flushTimerRef = useRef<number | null>(null)
  const tokensRef = useRef<TabletopTokenRecord[]>([])
  const entitiesRef = useRef<TabletopEntityRecord[]>([])
  const detailWindowsRef = useRef<TabletopDetailWindow[]>([])
  const selectedTokenIdRef = useRef<string | null>(null)
  const activeMapRef = useRef<TabletopMapRecord | null>(null)
  const roomKeyRef = useRef(currentRoomKey)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activityEndRef = useRef<HTMLDivElement>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const hpVersionsRef = useRef<Map<string, number>>(new Map())

  const selectedToken = tokens.find((token) => token.id === selectedTokenId) ?? null
  const tokenEntityKeys = useMemo(() => new Set(tokens.map((token) => `${token.entityKind}:${token.entityId}`)), [tokens])
  const visibleEntities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr")
    return entities
      .filter((entity) => entity.kind === libraryTab && (!query || `${entity.name} ${entity.subtitle}`.toLocaleLowerCase("fr").includes(query)))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))
  }, [entities, libraryTab, search])
  const ownedSpeakers = useMemo(() => entities.filter((entity) => entity.kind === "character" && entity.ownerUid === user.uid).sort((left, right) => left.name.localeCompare(right.name, "fr")), [entities, user.uid])
  const directTargets = useMemo(() => entities.filter((entity) => entity.kind === "character" && entity.ownerUid !== user.uid).filter((entity, index, all) => all.findIndex((candidate) => candidate.id === entity.id) === index).sort((left, right) => left.name.localeCompare(right.name, "fr")), [entities, user.uid])
  const speaker = ownedSpeakers.find((entity) => entity.id === speakerId) || ownedSpeakers[0]
  const speakerName = canManage ? "MJ" : speaker?.name || "Joueur"
  const directCommandMatch = chatText.match(/^\/(r?joueur)\s+(.*)$/i)
  const directPrefix = directCommandMatch?.[1].toLocaleLowerCase("fr") === "rjoueur" ? "/rjoueur" : "/joueur"
  const directTail = directCommandMatch?.[2] ?? null
  const directSelection = directTail === null ? null : directTargets.find((target) => directTail.toLocaleLowerCase("fr").startsWith(`${target.name.toLocaleLowerCase("fr")} `))
  const directSuggestions = directTail === null || directSelection ? [] : directTargets.filter((target) => !directTail.trim() || target.name.toLocaleLowerCase("fr").includes(directTail.trim().toLocaleLowerCase("fr"))).slice(0, 8)

  const showNotice = useCallback((message: string, error = false) => {
    setNotice({ message, error })
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4200)
  }, [])

  const markTokenDirty = useCallback((patch: TokenPatch) => {
    const current = dirtyTokenPatchesRef.current.get(patch.tokenId) || { tokenId: patch.tokenId }
    dirtyTokenPatchesRef.current.set(patch.tokenId, { ...current, ...patch })
    setTokenSaveState("pending")
  }, [])

  const clearSavedPatch = useCallback((sent: TokenPatch) => {
    const current = dirtyTokenPatchesRef.current.get(sent.tokenId)
    if (!current) return
    const next = { ...current } as TokenPatch
    for (const key of ["x", "y", "scale", "iconScale", "label", "icon", "color"] as const) {
      if (sent[key] !== undefined && current[key] === sent[key]) delete next[key]
    }
    if (Object.keys(next).length === 1) dirtyTokenPatchesRef.current.delete(sent.tokenId)
    else dirtyTokenPatchesRef.current.set(sent.tokenId, next)
  }, [])

  const flushTokenState = useCallback(async (beacon = false): Promise<boolean> => {
    if (!beacon && flushPromiseRef.current) await flushPromiseRef.current
    const map = activeMapRef.current
    const patches = [...dirtyTokenPatchesRef.current.values()]
    if (!map || !patches.length) {
      setTokenSaveState("saved")
      return true
    }
    const body = JSON.stringify({ action: "save-token-state", mapId: map.id, roomKey: roomKeyRef.current, patches })
    if (beacon && navigator.sendBeacon) {
      const queued = navigator.sendBeacon("/api/tabletop", new Blob([body], { type: "text/plain;charset=UTF-8" }))
      if (queued) patches.forEach(clearSavedPatch)
      setTokenSaveState(queued ? "saved" : "error")
      return queued
    }
    setTokenSaveState("saving")
    const operation = (async () => {
      try {
        const response = await fetch("/api/tabletop", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true })
        const payload = await responseJson<{ savedTokenIds: string[] }>(response)
        const savedTokenIds = new Set(payload.savedTokenIds)
        patches.filter((patch) => savedTokenIds.has(patch.tokenId)).forEach(clearSavedPatch)
        return savedTokenIds.size === new Set(patches.map((patch) => patch.tokenId)).size
      } catch {
        setTokenSaveState("error")
        showNotice("Les pions n’ont pas encore été enregistrés. Une nouvelle tentative va être faite.", true)
        return false
      }
    })()
    flushPromiseRef.current = operation
    const saved = await operation
    if (flushPromiseRef.current === operation) flushPromiseRef.current = null
    const clean = saved && dirtyTokenPatchesRef.current.size === 0
    setTokenSaveState(clean ? "saved" : saved ? "pending" : "error")
    return clean
  }, [clearSavedPatch, showNotice])

  const scheduleTokenFlush = useCallback(() => {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current)
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      void flushTokenState(false)
    }, 650)
  }, [flushTokenState])

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current)
  }, [])
  useEffect(() => { activeMapRef.current = activeMap }, [activeMap])
  useEffect(() => { roomKeyRef.current = currentRoomKey }, [currentRoomKey])
  useEffect(() => { tokensRef.current = tokens }, [tokens])
  useEffect(() => { entitiesRef.current = entities }, [entities])
  useEffect(() => { detailWindowsRef.current = detailWindows }, [detailWindows])
  useEffect(() => { selectedTokenIdRef.current = selectedTokenId }, [selectedTokenId])
  useEffect(() => { entityOwnersRef.current = new Map(entities.filter((entity) => entity.kind === "character").map((entity) => [entity.id, entity.ownerUid])) }, [entities])
  useEffect(() => { activityEndRef.current?.scrollIntoView({ block: "nearest" }) }, [activities.length, chatOpen])
  useEffect(() => {
    measureModeRef.current = measureMode
    const map = leafletMapRef.current
    if (measureMode) map?.dragging.disable()
    else {
      map?.dragging.enable()
      measureLayersRef.current.forEach((layer) => layer.remove())
      measureLayersRef.current = []
    }
  }, [measureMode])

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null
    const load = async () => {
      try {
        const parameters = new URLSearchParams({ bootstrap: "1", pageLinked })
        if (requestedMapId) parameters.set("requestedMapId", requestedMapId)
        if (roomKey) parameters.set("roomKey", roomKey)
        if (canManage) parameters.set("prepare", "1")
        const response = await fetch(`/api/tabletop?${parameters}`, { cache: "no-store" })
        if (response.status === 202) {
          timer = window.setTimeout(load, 1400)
          return
        }
        const payload = await responseJson<{ maps: TabletopMapRecord[]; folders: TabletopFolderRecord[]; snapshot: TabletopSnapshot | null; entities: TabletopEntityRecord[] }>(response)
        if (cancelled) return
        setMaps(payload.maps)
        setFolders(payload.folders || [])
        setEntities(payload.snapshot?.entities ?? payload.entities)
        if (payload.snapshot) {
          setActiveMap(payload.snapshot.map)
          setTokens(payload.snapshot.tokens)
          setActivities(payload.snapshot.activities)
          setCurrentRoomKey(payload.snapshot.map.roomKey)
        }
        setBootstrapping(false)
      } catch (error) {
        if (!cancelled) {
          setBootstrapping(false)
          showNotice(error instanceof Error ? error.message : "Tabletop non chargé.", true)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [canManage, pageLinked, requestedMapId, roomKey, showNotice])

  useEffect(() => {
    const save = () => void flushTokenState(true)
    const visibility = () => { if (document.visibilityState === "hidden") save() }
    const online = () => void flushTokenState(false)
    const interval = window.setInterval(() => void flushTokenState(false), 15000)
    window.addEventListener("pagehide", save)
    window.addEventListener("online", online)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      save()
      window.clearInterval(interval)
      window.removeEventListener("pagehide", save)
      window.removeEventListener("online", online)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [flushTokenState])

  const activeMapId = activeMap?.id || ""

  useEffect(() => {
    if (!activeMapId || !currentRoomKey) return
    let cancelled = false
    let room: Room | null = null
    const presence = presenceRef.current
    presence.clear()
    queueMicrotask(() => {
      if (!cancelled) {
        setConnection("connecting")
        setPeerIds([])
      }
    })
    void import("trystero").then(({ joinRoom }) => {
      if (cancelled) return
      room = joinRoom({ appId: "com-eraser-jdr-tabletop-v3", password: currentRoomKey }, activeMapId, { onJoinError: () => setConnection("error") })
      const moveAction = room.makeAction("move")
      const appearanceAction = room.makeAction("appearance")
      const hpAction = room.makeAction("hp")
      const activityAction = room.makeAction("activity")
      const tokenAction = room.makeAction("token")
      const mapAction = room.makeAction("map")
      const presenceAction = room.makeAction("presence")

      moveAction.onMessage = (value) => {
        const record = dataRecord(value)
        const x = finiteNumber(record?.x)
        const y = finiteNumber(record?.y)
        if (!record || typeof record.tokenId !== "string" || x === null || y === null) return
        markersRef.current.get(record.tokenId)?.setLatLng([y, x])
        if (record.final === true) setTokens((current) => current.map((token) => token.id === record.tokenId ? { ...token, x, y } : token))
      }
      appearanceAction.onMessage = (value) => {
        const patch = normalizeTokenPatch(value)
        if (!patch) return
        setTokens((current) => current.map((token) => token.id === patch.tokenId ? { ...token, ...patch, id: token.id } : token))
        const markerEntityId = tokensRef.current.find((token) => token.id === patch.tokenId)?.entityId
        if (patch.label !== undefined && markerEntityId) setEntities((current) => current.map((entity) => entity.kind === "marker" && entity.id === markerEntityId ? { ...entity, name: patch.label || "Repère" } : entity))
      }
      hpAction.onMessage = (value) => {
        const record = dataRecord(value)
        const currentHp = finiteNumber(record?.currentHp)
        const totalHp = finiteNumber(record?.totalHp)
        if (!record || (record.kind !== "npc" && record.kind !== "character") || typeof record.id !== "string" || currentHp === null || totalHp === null) return
        setEntities((current) => current.map((entity) => entity.kind === record.kind && entity.id === record.id ? { ...entity, currentHp, totalHp } : entity))
      }
      activityAction.onMessage = (value) => {
        const activity = activityFromPayload(value)
        if (!activity || activity.mapId !== activeMapId) return
        setActivities((current) => current.some((item) => item.id === activity.id) ? current : [...current, activity].slice(-200))
      }
      tokenAction.onMessage = (value) => {
        const record = dataRecord(value)
        if (!record || (record.type !== "upsert" && record.type !== "remove")) return
        if (record.type === "remove" && typeof record.tokenId === "string") {
          setTokens((current) => current.filter((token) => token.id !== record.tokenId))
          return
        }
        const token = dataRecord(record.token)
        const entity = dataRecord(record.entity)
        if (!token || !entity || typeof token.id !== "string" || token.mapId !== activeMapId || typeof entity.id !== "string") return
        const typedToken = { color: "#7f3430", ...token } as unknown as TabletopTokenRecord
        const typedEntity = entity as unknown as TabletopEntityRecord
        setTokens((current) => current.some((item) => item.id === typedToken.id) ? current.map((item) => item.id === typedToken.id ? { ...item, ...typedToken } : item) : [...current, typedToken])
        setEntities((current) => current.some((item) => entityKey(item) === entityKey(typedEntity)) ? current : [...current, { ...typedEntity, controllable: false }])
      }
      mapAction.onMessage = (value) => {
        const record = dataRecord(value)
        if (!record || record.id !== activeMapId) return
        setActiveMap((current) => current ? { ...current, ...record } as TabletopMapRecord : current)
        setMaps((current) => current.map((map) => map.id === record.id ? { ...map, ...record } as TabletopMapRecord : map))
      }
      presenceAction.onMessage = (value, context) => {
        const record = dataRecord(value)
        if (!record || (record.role !== "admin" && record.role !== "mj" && record.role !== "joueur") || typeof record.uid !== "string") return
        presence.set(context.peerId, { role: record.role, uid: record.uid })
      }
      room.onPeerJoin = (peerId) => {
        setPeerIds((current) => current.includes(peerId) ? current : [...current, peerId])
        void presenceAction.send({ role: user.role, uid: user.uid } as JsonValue, { target: peerId }).catch(() => undefined)
      }
      room.onPeerLeave = (peerId) => {
        presence.delete(peerId)
        setPeerIds((current) => current.filter((id) => id !== peerId))
      }
      const send = (action: typeof moveAction, payload: JsonValue, targets?: string[]) => {
        if (targets && !targets.length) return
        void action.send(payload, targets ? { target: targets } : undefined).catch(() => setConnection("error"))
      }
      realtimeRef.current = {
        move: (payload) => send(moveAction, payload as unknown as JsonValue),
        appearance: (payload) => send(appearanceAction, payload as unknown as JsonValue),
        hp: (payload) => send(hpAction, payload as unknown as JsonValue),
        activity: (payload) => {
          const recipientUid = entityOwnersRef.current.get(payload.recipientId)
          const targets = payload.audience === "public" ? undefined : [...presenceRef.current]
            .filter(([, presence]) => payload.audience === "gm" ? presence.role === "admin" || presence.role === "mj" : Boolean(recipientUid && presence.uid === recipientUid))
            .map(([peerId]) => peerId)
          send(activityAction, payload as unknown as JsonValue, targets)
        },
        token: (payload) => send(tokenAction, payload as unknown as JsonValue),
        map: (payload) => send(mapAction, payload as unknown as JsonValue),
      }
      setConnection("ready")
    }).catch(() => setConnection("error"))
    return () => {
      cancelled = true
      realtimeRef.current = null
      presence.clear()
      setPeerIds([])
      if (room) void room.leave()
    }
  }, [activeMapId, currentRoomKey, user.role, user.uid])

  const drawMeasure = useCallback((start: Leaflet.LatLng) => {
    const leaflet = leafletRef.current
    const map = leafletMapRef.current
    const tabletopMap = activeMapRef.current
    if (!leaflet || !map || !tabletopMap) return
    measureLayersRef.current.forEach((layer) => layer.remove())
    measureLayersRef.current = []
    const point = leaflet.circleMarker(start, { radius: 4, color: "#f6d49b", weight: 2, fillColor: "#682522", fillOpacity: 1 }).addTo(map)
    const line = leaflet.polyline([start, start], { color: "#f6d49b", weight: 3, dashArray: "8 7" }).addTo(map)
    measureLayersRef.current.push(point, line)
    const move = (event: Leaflet.LeafletMouseEvent) => {
      line.setLatLngs([start, event.latlng])
      const distance = Math.hypot(event.latlng.lng - start.lng, event.latlng.lat - start.lat) / tabletopMap.gridSize * tabletopMap.distancePerGrid
      const label = `${(distance >= 10 ? distance.toFixed(1) : distance.toFixed(2)).replace(/\.0$/, "")} ${tabletopMap.distanceUnit}`
      setMeasureLabel(label)
      line.unbindTooltip().bindTooltip(label, { permanent: true, direction: "center", className: "eraser-measure-label" }).openTooltip()
    }
    const end = () => {
      map.off("mousemove", move)
      map.off("mouseup", end)
      document.removeEventListener("pointerup", end)
    }
    map.on("mousemove", move)
    map.on("mouseup", end)
    document.addEventListener("pointerup", end, { once: true })
  }, [])

  useEffect(() => {
    const container = mapNodeRef.current
    if (!container || !activeMap) return
    const markerCollection = markersRef.current
    let cancelled = false
    let localMap: Leaflet.Map | null = null
    let resizeObserver: ResizeObserver | null = null
    container.replaceChildren()
    void import("leaflet").then((leaflet) => {
      if (cancelled) return
      leafletRef.current = leaflet
      const bounds = leaflet.latLngBounds([0, 0], [activeMap.height, activeMap.width])
      localMap = leaflet.map(container, { crs: leaflet.CRS.Simple, minZoom: -5, maxZoom: 5, zoomSnap: 0.25, zoomDelta: 0.5, attributionControl: false, preferCanvas: true })
      leafletMapRef.current = localMap
      const background = mapImageUrl(activeMap, currentRoomKey)
      if (background) leaflet.imageOverlay(background, bounds).addTo(localMap)
      else leaflet.rectangle(bounds, { color: "#7f6a50", weight: 1, fillColor: "#282520", fillOpacity: 1, interactive: false }).addTo(localMap)
      localMap.fitBounds(bounds, { padding: [18, 18], animate: false })
      localMap.setMaxBounds(bounds.pad(0.35))
      const updateScale = () => {
        if (localMap) setMapScale(renderedMapScale(localMap, activeMap))
      }
      localMap.on("zoomend", updateScale)
      localMap.on("click", () => { if (!measureModeRef.current) setSelectedTokenId(null) })
      localMap.on("mousedown", (event: Leaflet.LeafletMouseEvent) => { if (measureModeRef.current) drawMeasure(event.latlng) })
      if (measureModeRef.current) localMap.dragging.disable()
      resizeObserver = new ResizeObserver(() => {
        if (!localMap) return
        localMap.invalidateSize({ pan: false })
        updateScale()
      })
      resizeObserver.observe(container)
      updateScale()
      setLeafletReady((value) => value + 1)
    }).catch(() => showNotice("La carte n’a pas pu s’ouvrir.", true))
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      markerCollection.clear()
      measureLayersRef.current = []
      if (localMap) localMap.remove()
      if (leafletMapRef.current === localMap) leafletMapRef.current = null
    }
  }, [activeMap, currentRoomKey, drawMeasure, showNotice])

  const saveHpValue = useCallback(async (entity: TabletopEntityRecord, expression: string) => {
    const map = activeMapRef.current
    if (!map || !entity.controllable || (entity.kind !== "npc" && entity.kind !== "character")) return
    let currentHp: number
    try {
      currentHp = Math.max(0, Math.min(99999, Math.trunc(evaluateRelativeExpression(expression, entity.currentHp))))
    } catch {
      showNotice("Calcul de PV invalide. Exemples : -10%, +5, *2, /3 ou (10 + 5).", true)
      return
    }
    const key = entityKey(entity)
    const version = (hpVersionsRef.current.get(key) || 0) + 1
    hpVersionsRef.current.set(key, version)
    const previousHp = entity.currentHp
    setEntities((current) => current.map((candidate) => entityKey(candidate) === key ? { ...candidate, currentHp } : candidate))
    realtimeRef.current?.hp({ kind: entity.kind, id: entity.id, currentHp, totalHp: entity.totalHp })
    try {
      const payload = await responseJson<{ entity: TabletopEntityRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-hp", mapId: map.id, roomKey: roomKeyRef.current, entityKind: entity.kind, entityId: entity.id, currentHp, totalHp: entity.totalHp }),
      }))
      if (hpVersionsRef.current.get(key) === version) setEntities((current) => current.map((candidate) => entityKey(candidate) === key ? { ...candidate, currentHp: payload.entity.currentHp, totalHp: payload.entity.totalHp } : candidate))
    } catch (error) {
      if (hpVersionsRef.current.get(key) === version) setEntities((current) => current.map((candidate) => entityKey(candidate) === key && candidate.currentHp === currentHp ? { ...candidate, currentHp: previousHp } : candidate))
      showNotice(error instanceof Error ? error.message : "PV non enregistrés.", true)
    }
  }, [showNotice])

  const openDetail = useCallback((entity: TabletopEntityRecord) => {
    const map = activeMapRef.current
    if (!map || (entity.kind !== "shop" && entity.kind !== "npc")) return
    const id = `${entity.kind}:${entity.id}`
    const existing = detailWindowsRef.current.find((window) => window.id === id)
    if (existing) {
      setDetailWindows((current) => [...current.filter((window) => window.id !== id), { ...existing, collapsed: false }])
      return
    }
    const portraitUrl = tokenPortraitUrl(entity, map, roomKeyRef.current)
    const window: TabletopDetailWindow = { id, entity, kind: entity.kind, portraitUrl, shop: null, npc: null, loading: true, collapsed: false }
    setDetailWindows((current) => [...current, window])
    const parameters = new URLSearchParams({ mapId: map.id })
    if (entity.kind === "shop") parameters.set("shopId", entity.id)
    else parameters.set("npcId", entity.id)
    if (roomKeyRef.current) parameters.set("roomKey", roomKeyRef.current)
    void fetch(`/api/tabletop?${parameters}`, { cache: "no-store" })
      .then((response) => entity.kind === "shop" ? responseJson<{ shop: TabletopShopDetail }>(response) : responseJson<{ npc: TabletopNpcDetail }>(response))
      .then((payload) => setDetailWindows((current) => current.map((candidate) => candidate.id === id ? {
        ...candidate,
        shop: "shop" in payload ? payload.shop : null,
        npc: "npc" in payload ? payload.npc : null,
        loading: false,
      } : candidate)))
      .catch(() => {
        setDetailWindows((current) => current.map((candidate) => candidate.id === id ? { ...candidate, loading: false } : candidate))
        showNotice(entity.kind === "shop" ? "Le magasin n’a pas pu être ouvert." : "La fiche du PNJ n’a pas pu être ouverte.", true)
      })
  }, [showNotice])

  const beginHpEdit = useCallback((marker: Leaflet.Marker, entityId: string, kind: "npc" | "character") => {
    const entity = entitiesRef.current.find((candidate) => candidate.kind === kind && candidate.id === entityId)
    const track = marker.getElement()?.querySelector<HTMLElement>(".eraser-map-token__track")
    if (!entity?.controllable || !track || track.querySelector("input")) return
    marker.dragging?.disable()
    const input = document.createElement("input")
    input.className = "eraser-map-token__hp-input"
    input.value = String(entity.currentHp)
    input.placeholder = "-10%, +5, *2…"
    input.setAttribute("aria-label", `Modifier les PV de ${entity.name}`)
    track.appendChild(input)
    input.focus()
    input.select()
    let done = false
    const stop = (event: Event) => event.stopPropagation()
    const finish = (save: boolean) => {
      if (done) return
      done = true
      const value = input.value
      input.remove()
      if (!measureModeRef.current) marker.dragging?.enable()
      if (save) {
        const latest = entitiesRef.current.find((candidate) => candidate.kind === kind && candidate.id === entityId)
        if (latest) void saveHpValue(latest, value)
      }
    }
    input.addEventListener("pointerdown", stop)
    input.addEventListener("click", stop)
    input.addEventListener("dblclick", stop)
    input.addEventListener("keydown", (event) => {
      event.stopPropagation()
      if (event.key === "Enter") finish(true)
      if (event.key === "Escape") finish(false)
    })
    input.addEventListener("blur", () => finish(true), { once: true })
  }, [saveHpValue])

  useEffect(() => {
    const openFromToken = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest(".eraser-map-token__track, .eraser-map-token__resize, .eraser-map-token__hp-input")) return
      const root = target.closest<HTMLElement>(".eraser-map-token[data-token-id]")
      const shell = target.closest<HTMLElement>(".eraser-leaflet-token-shell[data-token-id]")
      const tokenId = root?.dataset.tokenId || shell?.dataset.tokenId
      const token = tokenId ? tokensRef.current.find((candidate) => candidate.id === tokenId) : null
      const entity = token ? entitiesRef.current.find((candidate) => candidate.kind === token.entityKind && candidate.id === token.entityId) : null
      if (!token || !entity) return
      event.preventDefault()
      event.stopPropagation()
      setSelectedTokenId(token.id)
      if (entity.kind === "shop" || entity.kind === "npc") openDetail(entity)
      else if (entity.kind === "marker" && entity.controllable) setMarkerDraft({ tokenId: token.id, label: token.label, icon: token.icon || "✦", iconScale: token.iconScale || 1, color: token.color || "#7f3430" })
      else if (entity.kind === "character" && entity.controllable) {
        const marker = markersRef.current.get(token.id)
        if (marker) beginHpEdit(marker, entity.id, entity.kind)
      }
    }
    document.addEventListener("dblclick", openFromToken, true)
    return () => document.removeEventListener("dblclick", openFromToken, true)
  }, [beginHpEdit, openDetail])

  const updateTokenAppearance = useCallback((token: TabletopTokenRecord, patch: Omit<TokenPatch, "tokenId">) => {
    const fullPatch: TokenPatch = { tokenId: token.id, ...patch }
    setTokens((current) => current.map((item) => item.id === token.id ? { ...item, ...patch } : item))
    if (patch.label !== undefined && token.entityKind === "marker") setEntities((current) => current.map((entity) => entity.kind === "marker" && entity.id === token.entityId ? { ...entity, name: patch.label || "Repère" } : entity))
    markTokenDirty(fullPatch)
    realtimeRef.current?.appearance(fullPatch)
    scheduleTokenFlush()
  }, [markTokenDirty, scheduleTokenFlush])

  useEffect(() => {
    const leaflet = leafletRef.current
    const map = leafletMapRef.current
    if (!leaflet || !map || !activeMap) return
    const markerCollection = markersRef.current
    markerCollection.forEach((marker) => marker.remove())
    markerCollection.clear()

    for (const token of tokens) {
      const entity = entities.find((candidate) => candidate.kind === token.entityKind && candidate.id === token.entityId)
      if (!entity) continue
      const marker = leaflet.marker([token.y, token.x], {
        icon: createTokenIcon(leaflet, entity, token, tokenPortraitUrl(entity, activeMap, currentRoomKey), selectedTokenIdRef.current === token.id, mapScale),
        draggable: Boolean(entity.controllable && !measureMode),
        autoPan: true,
        title: entity.name,
        alt: `Pion de ${entity.name}`,
        riseOnHover: true,
      }).addTo(map)
      const element = marker.getElement()
      if (element) element.dataset.tokenId = token.id
      const root = element?.querySelector<HTMLElement>(".eraser-map-token")
      const track = element?.querySelector<HTMLElement>(".eraser-map-token__track")
      marker.on("click", () => setSelectedTokenId(token.id))
      marker.on("mousedown", (event) => {
        if (measureModeRef.current) {
          event.originalEvent.stopPropagation()
          drawMeasure(event.latlng)
        }
      })
      if (track && entity.controllable && (entity.kind === "npc" || entity.kind === "character")) {
        leaflet.DomEvent.disableClickPropagation(track)
        track.addEventListener("dblclick", (event) => {
          event.preventDefault()
          event.stopPropagation()
          beginHpEdit(marker, entity.id, entity.kind as "npc" | "character")
        })
      }

      if (entity.controllable && !measureMode) {
        let last = 0
        marker.on("drag", () => {
          const position = marker.getLatLng()
          markTokenDirty({ tokenId: token.id, x: position.lng, y: position.lat })
          const now = performance.now()
          if (now - last < 45) return
          last = now
          realtimeRef.current?.move({ tokenId: token.id, x: position.lng, y: position.lat, final: false })
        })
        marker.on("dragend", () => {
          const position = marker.getLatLng()
          if (Math.abs(position.lng - token.x) < 0.001 && Math.abs(position.lat - token.y) < 0.001) return
          setTokens((current) => current.map((item) => item.id === token.id ? { ...item, x: position.lng, y: position.lat } : item))
          markTokenDirty({ tokenId: token.id, x: position.lng, y: position.lat })
          realtimeRef.current?.move({ tokenId: token.id, x: position.lng, y: position.lat, final: true })
          scheduleTokenFlush()
        })
      }

      const handle = element?.querySelector<HTMLElement>(".eraser-map-token__resize")
      if (handle && root && entity.controllable) {
        leaflet.DomEvent.disableClickPropagation(handle)
        const resize = (event: PointerEvent) => {
          event.preventDefault()
          event.stopPropagation()
          marker.dragging?.disable()
          root.style.transition = "none"
          handle.setPointerCapture(event.pointerId)
          const startX = event.clientX
          const startY = event.clientY
          const startScale = token.scale || 1
          const shell = marker.getElement()
          const baseWidth = entity.kind === "shop" ? 154 : 92
          const baseHeight = entity.kind === "shop" ? 66 : 94
          let nextScale = startScale
          const move = (moveEvent: PointerEvent) => {
            moveEvent.preventDefault()
            moveEvent.stopPropagation()
            const delta = ((moveEvent.clientX - startX) + (moveEvent.clientY - startY)) / 2
            nextScale = Math.max(0.35, Math.min(3, startScale * Math.exp(delta / 110)))
            const renderScale = mapScale * nextScale
            root.style.setProperty("--token-render-scale", String(renderScale))
            if (shell) {
              const width = baseWidth * renderScale
              const height = baseHeight * renderScale
              shell.style.width = `${width}px`
              shell.style.height = `${height}px`
              shell.style.marginLeft = `${-width / 2}px`
              shell.style.marginTop = `${-height / 2}px`
            }
          }
          const end = (endEvent: PointerEvent) => {
            endEvent.preventDefault()
            endEvent.stopPropagation()
            if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
            handle.removeEventListener("pointermove", move)
            handle.removeEventListener("pointerup", end)
            handle.removeEventListener("pointercancel", end)
            if (!measureModeRef.current) marker.dragging?.enable()
            updateTokenAppearance(token, { scale: Math.round(nextScale * 100) / 100 })
          }
          handle.addEventListener("pointermove", move)
          handle.addEventListener("pointerup", end)
          handle.addEventListener("pointercancel", end)
        }
        handle.addEventListener("pointerdown", resize)
      }
      markerCollection.set(token.id, marker)
    }
    return () => markerCollection.forEach((marker) => marker.remove())
  }, [activeMap, beginHpEdit, currentRoomKey, drawMeasure, entities, leafletReady, mapScale, markTokenDirty, measureMode, scheduleTokenFlush, tokens, updateTokenAppearance])

  useEffect(() => {
    markersRef.current.forEach((marker, tokenId) => marker.getElement()?.querySelector(".eraser-map-token")?.classList.toggle("is-selected", tokenId === selectedTokenId))
  }, [selectedTokenId])

  async function loadMap(mapId: string) {
    if (!mapId || mapId === activeMap?.id) return
    setBusy(true)
    try {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      const saved = await flushTokenState(false)
      if (!saved) throw new Error("Enregistrement des pions en attente : la carte n’a pas été changée.")
      const parameters = new URLSearchParams({ mapId })
      if (currentRoomKey) parameters.set("roomKey", currentRoomKey)
      const payload = await responseJson<{ snapshot: TabletopSnapshot }>(await fetch(`/api/tabletop?${parameters}`, { cache: "no-store" }))
      setActiveMap(payload.snapshot.map)
      setTokens(payload.snapshot.tokens)
      setEntities(payload.snapshot.entities)
      setActivities(payload.snapshot.activities)
      setCurrentRoomKey(payload.snapshot.map.roomKey)
      setTokenSaveState("saved")
      setSelectedTokenId(null)
      setDetailWindows([])
      const url = new URL(window.location.href)
      url.searchParams.set("map", payload.snapshot.map.id)
      if (canManage) url.searchParams.delete("room")
      window.history.replaceState(null, "", url)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Carte non chargée.", true)
    } finally {
      setBusy(false)
    }
  }

  async function createMap(event: FormEvent) {
    event.preventDefault()
    if (!newMap.name.trim()) return
    setBusy(true)
    try {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      if (!await flushTokenState(false)) throw new Error("Enregistrement des pions en attente : la carte n’a pas été créée.")
      const payload = await responseJson<{ map: TabletopMapRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-map", pageLinked, ...newMap }),
      }))
      setMaps((current) => [payload.map, ...current])
      setActiveMap(payload.map)
      setTokens([])
      setActivities([])
      setCurrentRoomKey(payload.map.roomKey)
      setNewMap((current) => ({ name: "", folder: current.folder }))
      setNewMapOpen(false)
      showNotice("Carte créée. Ajoute son image de fond.")
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Carte non créée.", true)
    } finally {
      setBusy(false)
    }
  }

  async function uploadBackground(file: File) {
    if (!activeMap) return
    setBusy(true)
    try {
      const dimensions = await imageDimensions(file)
      const form = new FormData()
      form.set("background", file)
      form.set("width", String(dimensions.width))
      form.set("height", String(dimensions.height))
      const payload = await responseJson<{ map: TabletopMapRecord }>(await fetch(`/api/tabletop/background/${encodeURIComponent(activeMap.id)}`, { method: "PATCH", body: form }))
      setActiveMap(payload.map)
      setMaps((current) => current.map((map) => map.id === payload.map.id ? payload.map : map))
      realtimeRef.current?.map(syncMap(payload.map))
      showNotice("Image de fond enregistrée.")
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Image non enregistrée.", true)
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function openSettings() {
    if (!activeMap) return
    setMapSettings({ name: activeMap.name, folder: activeMap.folder, gridSize: String(activeMap.gridSize), distancePerGrid: String(activeMap.distancePerGrid), distanceUnit: activeMap.distanceUnit })
    setSettingsOpen(true)
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    if (!activeMap) return
    setBusy(true)
    try {
      const payload = await responseJson<{ map: TabletopMapRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-map", mapId: activeMap.id, ...mapSettings }),
      }))
      setActiveMap(payload.map)
      setMaps((current) => current.map((map) => map.id === payload.map.id ? payload.map : map))
      realtimeRef.current?.map(syncMap(payload.map))
      setSettingsOpen(false)
      showNotice("Réglages enregistrés dans Sheets.")
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Réglages non enregistrés.", true)
    } finally {
      setBusy(false)
    }
  }

  async function addToken(entity: TabletopEntityRecord) {
    if (!activeMap || !entity.controllable || tokenEntityKeys.has(entityKey(entity))) return
    setBusy(true)
    try {
      const payload = await responseJson<{ token: TabletopTokenRecord; entity: TabletopEntityRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add-token", mapId: activeMap.id, roomKey: currentRoomKey, entityKind: entity.kind, entityId: entity.id, x: activeMap.width / 2, y: activeMap.height / 2 }),
      }))
      setTokens((current) => [...current, payload.token])
      realtimeRef.current?.token({ type: "upsert", ...payload })
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Pion non ajouté.", true)
    } finally {
      setBusy(false)
    }
  }

  async function saveMarker(event: FormEvent) {
    event.preventDefault()
    if (!activeMap) return
    if (markerDraft.tokenId) {
      const token = tokens.find((candidate) => candidate.id === markerDraft.tokenId)
      if (token) updateTokenAppearance(token, { label: markerDraft.label, icon: markerDraft.icon || "✦", iconScale: markerDraft.iconScale, color: markerDraft.color })
      setMarkerDraft({ tokenId: "", label: "", icon: "✦", iconScale: 1, color: "#7f3430" })
      setMarkerOpen(false)
      return
    }
    setBusy(true)
    try {
      const payload = await responseJson<{ token: TabletopTokenRecord; entity: TabletopEntityRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add-marker", mapId: activeMap.id, ...markerDraft, x: activeMap.width / 2, y: activeMap.height / 2 }),
      }))
      setTokens((current) => [...current, payload.token])
      setEntities((current) => [...current, payload.entity])
      realtimeRef.current?.token({ type: "upsert", ...payload })
      setMarkerDraft({ tokenId: "", label: "", icon: "✦", iconScale: 1, color: "#7f3430" })
      setMarkerOpen(false)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Repère non ajouté.", true)
    } finally {
      setBusy(false)
    }
  }

  async function removeToken(token: TabletopTokenRecord) {
    if (!activeMap || !canManage) return
    setBusy(true)
    try {
      if (!await flushTokenState(false)) throw new Error("Enregistrement du pion en attente : réessaie dans un instant.")
      await responseJson(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove-token", mapId: activeMap.id, tokenId: token.id }),
      }))
      dirtyTokenPatchesRef.current.delete(token.id)
      setTokens((current) => current.filter((item) => item.id !== token.id))
      setSelectedTokenId(null)
      realtimeRef.current?.token({ type: "remove", tokenId: token.id })
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Pion non retiré.", true)
    } finally {
      setBusy(false)
    }
  }

  async function publishActivity(activity: TabletopActivityRecord) {
    if (!activeMap) return
    setActivities((current) => [...current.filter((item) => item.id !== activity.id), activity].slice(-200))
    realtimeRef.current?.activity(activity)
    try {
      const payload = await responseJson<{ activity: TabletopActivityRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activity", roomKey: currentRoomKey, speakerId: speaker?.id || "", ...activity, mapId: activeMap.id }),
      }))
      setActivities((current) => current.map((item) => item.id === activity.id ? payload.activity : item))
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Message non conservé dans Sheets.", true)
    }
  }

  function sendChat(event: FormEvent) {
    event.preventDefault()
    if (!activeMap || !chatText.trim()) return
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
      void publishActivity({ id: crypto.randomUUID(), mapId: activeMap.id, kind, authorUid: user.uid, authorName: speakerName, text: content, diceExpression, diceResult, createdAt: new Date().toISOString(), audience, recipientId, recipientName })
    } catch {
      showNotice("Commande invalide. Exemples : /r 1d20 + 5, /rmj 2d6, /joueur ou /rjoueur puis choisis un personnage.", true)
    }
  }

  async function copyInviteLink() {
    if (!activeMap) return
    const url = new URL(window.location.href)
    url.searchParams.set("map", activeMap.id)
    url.searchParams.set("room", activeMap.roomKey)
    try {
      await navigator.clipboard.writeText(url.toString())
      showNotice("Lien joueur copié.")
    } catch {
      showNotice("Copie impossible.", true)
    }
  }

  async function openImportDialog() {
    setImportOpen(true)
    if (sourcePages.length) return
    try {
      const payload = await responseJson<{ sourcePages: TabletopSourcePage[] }>(await fetch("/api/tabletop?sources=1", { cache: "no-store" }))
      setSourcePages(payload.sourcePages)
      const first = payload.sourcePages.find((page) => page.id !== pageLinked) || payload.sourcePages[0]
      setImportSource(first?.id || "")
    } catch {
      showNotice("Sources non chargées.", true)
    }
  }

  useEffect(() => {
    if (!importOpen || !importSource) return
    let active = true
    fetch(`/api/tabletop?${new URLSearchParams({ pageLinked: importSource })}`)
      .then((response) => responseJson<{ maps: TabletopMapRecord[] }>(response))
      .then((payload) => {
        if (active) {
          setSourceMaps(payload.maps)
          setSourceMapId(payload.maps[0]?.id || "")
        }
      })
      .catch(() => showNotice("Cartes sources non chargées.", true))
    return () => { active = false }
  }, [importOpen, importSource, showNotice])

  async function importMap(event: FormEvent) {
    event.preventDefault()
    if (!sourceMapId) return
    setBusy(true)
    try {
      const payload = await responseJson<{ map: TabletopMapRecord; folders: TabletopFolderRecord[] }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import-map", pageLinked, sourceMapId, folder: "Importées" }),
      }))
      setMaps((current) => [payload.map, ...current])
      setFolders(payload.folders)
      setImportOpen(false)
      await loadMap(payload.map.id)
      showNotice("Carte récupérée avec ses repères et les pions compatibles.")
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Import impossible.", true)
    } finally {
      setBusy(false)
    }
  }

  async function createFolder(name: string) {
    setBusy(true)
    try {
      const payload = await responseJson<{ folder: TabletopFolderRecord; folders: TabletopFolderRecord[] }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-folder", pageLinked, name }),
      }))
      setFolders(payload.folders)
      return true
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Dossier non créé.", true)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function renameFolder(folder: TabletopFolderRecord, name: string) {
    setBusy(true)
    try {
      const payload = await responseJson<{ folder: TabletopFolderRecord; maps: TabletopMapRecord[]; folders: TabletopFolderRecord[] }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rename-folder", pageLinked, folderId: folder.id, currentName: folder.name, name }),
      }))
      setMaps(payload.maps)
      setFolders(payload.folders)
      setActiveMap((current) => current ? payload.maps.find((map) => map.id === current.id) || current : current)
      setNewMap((current) => sameFolder(current.folder, folder.name) ? { ...current, folder: payload.folder.name } : current)
      return true
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Dossier non renommé.", true)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function deleteFolder(folder: TabletopFolderRecord) {
    setBusy(true)
    try {
      const payload = await responseJson<{ maps: TabletopMapRecord[]; folders: TabletopFolderRecord[] }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-folder", pageLinked, folderId: folder.id, currentName: folder.name }),
      }))
      setMaps(payload.maps)
      setFolders(payload.folders)
      setActiveMap((current) => current ? payload.maps.find((map) => map.id === current.id) || current : current)
      setNewMap((current) => sameFolder(current.folder, folder.name) ? { ...current, folder: "Sans dossier" } : current)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Dossier non supprimé.", true)
    } finally {
      setBusy(false)
    }
  }

  async function moveMapToFolder(map: TabletopMapRecord, folder: TabletopFolderRecord) {
    setBusy(true)
    try {
      const payload = await responseJson<{ map: TabletopMapRecord }>(await fetch("/api/tabletop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-map", mapId: map.id, folder: folder.name }),
      }))
      setMaps((current) => current.map((candidate) => candidate.id === payload.map.id ? payload.map : candidate))
      setActiveMap((current) => current?.id === payload.map.id ? payload.map : current)
      realtimeRef.current?.map(syncMap(payload.map))
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Carte non déplacée.", true)
    } finally {
      setBusy(false)
    }
  }

  const connectionLabel = connection === "error" ? "Direct indisponible" : connection === "connecting" ? "Connexion…" : `${peerIds.length + 1} en ligne`
  const tabOptions: Array<{ kind: LibraryTab; label: string; icon: typeof UserRound }> = [
    { kind: "npc", label: "PNJs", icon: UserRound },
    { kind: "character", label: "PJ", icon: Users },
    { kind: "shop", label: "Magasins", icon: Store },
  ]
  const collapsedWindows = detailWindows.some((window) => window.collapsed)

  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] min-w-0 flex-col gap-3 p-3 md:p-4">
      <header className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card/90 p-2.5 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-2 px-1.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><MapIcon className="size-4" /></span>
          <div className="min-w-0"><p className="font-display truncate text-lg font-semibold leading-tight">Tabletop</p><p className="truncate text-xs text-muted-foreground">{pageName} · Google Sheets</p></div>
        </div>
        {canManage && maps.length > 0 && (
          <>
            <NativeSelect className="min-w-44 max-w-72" value={activeMap?.id || ""} onChange={(event) => void loadMap(event.target.value)} aria-label="Choisir une carte">
              {folders.map((folder) => {
                const folderMaps = maps.filter((map) => sameFolder(map.folder || "Sans dossier", folder.name)).sort((left, right) => left.name.localeCompare(right.name, "fr"))
                if (!folderMaps.length) return null
                return <optgroup key={folder.id} label={folder.name}>{folderMaps.map((map) => <NativeSelectOption key={map.id} value={map.id}>{map.name}</NativeSelectOption>)}</optgroup>
              })}
            </NativeSelect>
            <Button type="button" variant="outline" size="sm" onClick={() => setMapOrganizerOpen(true)}><FolderTree />Ranger</Button>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("gap-1.5", connection === "error" ? "text-destructive" : "text-emerald-800")}>{connection === "error" ? <WifiOff className="size-3" /> : <Wifi className="size-3" />}{connectionLabel}</Badge>
          {activeMap && <Badge variant="outline" className={cn("gap-1.5", tokenSaveState === "error" ? "text-destructive" : tokenSaveState === "saved" ? "text-emerald-800" : "text-amber-700")} title="Sauvegarde des positions et tailles dans Google Sheets">{tokenSaveState === "saving" ? <LoaderCircle className="size-3 animate-spin" /> : tokenSaveState === "saved" ? <CheckCircle2 className="size-3" /> : tokenSaveState === "error" ? <WifiOff className="size-3" /> : <span className="size-2 rounded-full bg-current" />}{tokenSaveState === "saved" ? "Pions enregistrés" : tokenSaveState === "error" ? "À réessayer" : tokenSaveState === "saving" ? "Enregistrement…" : "Modifications…"}</Badge>}
          {activeMap && <Button type="button" variant={measureMode ? "default" : "outline"} size="sm" onClick={() => { if (measureMode) setMeasureLabel(""); setMeasureMode((value) => !value) }}><Ruler />{measureLabel || "Mesurer"}</Button>}
          {activeMap && <Button type="button" variant="outline" size="icon-sm" onClick={() => void copyInviteLink()} title="Copier le lien"><Copy /></Button>}
          {canManage && activeMap && <Button type="button" variant="outline" size="icon-sm" onClick={() => fileInputRef.current?.click()} title="Image de fond"><ImagePlus /></Button>}
          {canManage && activeMap && <Button type="button" variant="outline" size="icon-sm" onClick={openSettings} title="Réglages"><Settings2 /></Button>}
          {canManage && <Button type="button" variant="outline" size="sm" onClick={() => void openImportDialog()}><Download />Récupérer</Button>}
          {canManage && <Button type="button" size="sm" disabled={bootstrapping} onClick={() => setNewMapOpen(true)}><Plus />Carte</Button>}
          {busy && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBackground(file) }} />
      </header>

      {notice && <div role="status" className={cn("rounded-xl border px-4 py-2 text-sm", notice.error ? "border-destructive/30 bg-destructive/8 text-destructive" : "border-primary/20 bg-primary/8")}>{notice.message}</div>}

      {!activeMap ? (
        <section className="grid flex-1 place-items-center rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <div>
            {bootstrapping ? <LoaderCircle className="mx-auto size-9 animate-spin" /> : <MapIcon className="mx-auto size-9 text-primary/45" />}
            <h1 className="font-display mt-4 text-3xl font-semibold">{bootstrapping ? "Chargement de la table…" : canManage ? "Crée ta première carte" : "Aucune carte publiée"}</h1>
            {bootstrapping && <p className="mt-2 text-sm text-muted-foreground">La page est prête ; les données Sheets arrivent en arrière-plan.</p>}
            {canManage && !bootstrapping && <Button className="mt-5" onClick={() => setNewMapOpen(true)}><Plus />Nouvelle carte</Button>}
          </div>
        </section>
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-3 xl:h-[calc(100svh-8.5rem)]", libraryOpen ? "xl:grid-cols-[17rem_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)]")}>
          {libraryOpen && (
            <aside className="order-2 flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card/90 xl:order-1">
              <div className="border-b p-3">
                <div className="flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="font-display text-lg font-semibold">Pions</h2><Button className="ml-auto" variant="ghost" size="icon-sm" onClick={() => setLibraryOpen(false)} title="Rétracter"><ChevronLeft /></Button></div>
                <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" className="pl-9" /></div>
              </div>
              <Tabs value={libraryTab} onValueChange={(value) => setLibraryTab(value as LibraryTab)} className="min-h-0 flex-1 gap-0">
                <TabsList className="mx-3 mt-3 grid w-auto grid-cols-3">{tabOptions.map(({ kind, label, icon: Icon }) => <TabsTrigger key={kind} value={kind}><Icon />{label}</TabsTrigger>)}</TabsList>
                {tabOptions.map(({ kind }) => (
                  <TabsContent key={kind} value={kind} className="min-h-0 overflow-y-auto p-2.5">
                    <div className="space-y-1.5">
                      {visibleEntities.map((entity) => {
                        const onMap = tokenEntityKeys.has(entityKey(entity))
                        const ShopIcon = entity.kind === "shop" ? shopIcons[entity.shopKey || "market"] : null
                        return (
                          <div key={entityKey(entity)} className="flex items-center gap-2 rounded-xl border bg-background/55 p-2">
                            <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden border bg-muted text-xs font-bold", entity.kind === "shop" ? "rounded-xl border-primary/25 bg-primary/8 text-primary" : "rounded-full")}>
                              {ShopIcon ? <ShopIcon className="size-4" /> : entity.name.slice(0, 1).toUpperCase()}
                              {entity.portrait && <img src={tokenPortraitUrl(entity, activeMap, currentRoomKey)} alt="" className="absolute inset-0 size-full object-cover object-center" />}
                              {ShopIcon && entity.portrait && <span className="absolute bottom-0 right-0 grid size-4 place-items-center rounded bg-background/90"><ShopIcon className="size-2.5" /></span>}
                            </span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{entity.name}</span><span className="block truncate text-xs text-muted-foreground">{entity.subtitle}</span></span>
                            <Button size="icon-sm" variant={onMap ? "secondary" : "outline"} disabled={busy || onMap || !entity.controllable} onClick={() => void addToken(entity)} aria-label={`Ajouter ${entity.name}`}><Plus /></Button>
                          </div>
                        )
                      })}
                      {!visibleEntities.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun élément disponible.</p>}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
              {canManage && <div className="border-t p-3"><Button variant="outline" className="w-full" onClick={() => { setMarkerDraft({ tokenId: "", label: "", icon: "✦", iconScale: 1, color: "#7f3430" }); setMarkerOpen(true) }}><MapPin />Nouveau repère</Button></div>}
            </aside>
          )}
          <section className="order-1 relative min-h-[65svh] overflow-hidden rounded-2xl border bg-[#201e1a] shadow-sm xl:order-2 xl:min-h-0">
            <div ref={mapNodeRef} className="tabletop-leaflet absolute inset-0" aria-label={`Carte ${activeMap.name}`} />
            {!libraryOpen && <Button className="absolute left-14 top-3 z-[600] shadow-lg" size="icon" variant="secondary" onClick={() => setLibraryOpen(true)} title="Afficher les pions"><ChevronRight /></Button>}
            {!activeMap.backgroundUrl && <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center text-[#eadcc4]"><div className="rounded-2xl border border-white/15 bg-black/45 p-5"><ImagePlus className="mx-auto" /><p className="mt-2">Aucune image de fond</p></div></div>}
            <div className={cn("pointer-events-none fixed bottom-4 left-4 z-[1230] max-w-[calc(50vw-2rem)] truncate rounded-lg border border-white/15 bg-black/70 px-2.5 py-1.5 text-xs text-white/80 shadow-xl backdrop-blur transition-[bottom]", collapsedWindows && "bottom-16")}>{activeMap.folder} / {activeMap.name} · 1 case = {activeMap.distancePerGrid} {activeMap.distanceUnit}</div>
          </section>
        </div>
      )}

      {canManage && selectedToken && (
        <div className={cn("fixed left-1/2 z-[1230] flex -translate-x-1/2 gap-2 transition-[bottom]", collapsedWindows ? "bottom-16" : "bottom-4")}>
          {selectedToken.entityKind === "marker" && <Button variant="secondary" size="sm" className="shadow-2xl" onClick={() => { setMarkerDraft({ tokenId: selectedToken.id, label: selectedToken.label, icon: selectedToken.icon || "✦", iconScale: selectedToken.iconScale || 1, color: selectedToken.color || "#7f3430" }); setMarkerOpen(true) }}><Settings2 />Modifier le repère</Button>}
          <Button variant="destructive" size="sm" className="shadow-2xl" onClick={() => void removeToken(selectedToken)}><Trash2 />Retirer le pion</Button>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-[1260]">
        <Button size="icon" className="rounded-full shadow-2xl" onClick={() => setChatOpen((value) => !value)} aria-label={chatOpen ? "Fermer le chat" : "Ouvrir le chat"}><MessageCircle /></Button>
        {chatOpen && (
          <section className="fixed bottom-16 right-4 flex h-[min(34rem,calc(100svh-5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2 border-b p-3"><MessageCircle className="size-4 text-primary" /><div><h2 className="font-display font-semibold">Direct</h2><p className="text-[10px] text-muted-foreground">Tu écris en tant que {speakerName}</p></div><Badge variant="secondary" className="ml-auto">{peerIds.length + 1}</Badge><Button variant="ghost" size="icon-sm" onClick={() => setChatOpen(false)}><X /></Button></div>
            {!canManage && ownedSpeakers.length > 1 && <div className="border-b px-3 py-2"><NativeSelect value={speaker?.id || ""} onChange={(event) => setSpeakerId(event.target.value)} aria-label="Personnage qui parle">{ownedSpeakers.map((character) => <NativeSelectOption key={character.id} value={character.id}>{character.name}</NativeSelectOption>)}</NativeSelect></div>}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {activities.map((activity) => <div key={activity.id} className={cn("rounded-xl border p-2.5", activity.kind === "dice" ? "border-primary/20 bg-primary/6" : "bg-background/60")}><div className="flex items-center gap-1.5 text-xs font-semibold">{activity.kind === "dice" && <Dices className="size-3.5 text-primary" />}{activity.authorName}{activity.audience !== "public" && <Badge variant="outline" className="h-5 text-[9px]">{activity.audience === "gm" ? "MJ seulement" : `À ${activity.recipientName}`}</Badge>}<span className="ml-auto font-normal text-muted-foreground">{formatActivityTime(activity.createdAt)}</span></div>{activity.kind === "dice" ? <p className="mt-1 text-sm"><span className="font-mono font-semibold">{activity.diceExpression}</span><br /><span>{activity.diceResult}</span></p> : <p className="mt-1 whitespace-pre-wrap break-words text-sm">{activity.text}</p>}</div>)}
              {!activities.length && <p className="py-10 text-center text-xs text-muted-foreground">Le chat et les dés apparaîtront ici.</p>}
              <div ref={activityEndRef} />
            </div>
            <form className="relative border-t p-3" onSubmit={sendChat}>
              {directSuggestions.length > 0 && <div className="absolute bottom-full left-3 right-3 mb-1 max-h-48 overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">{directSuggestions.map((target) => <button type="button" key={target.id} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent" onClick={() => setChatText(`${directPrefix} ${target.name} `)}><UserRound className="size-4 text-primary" /><span>{target.name}</span></button>)}</div>}
              <div className="flex gap-2"><Input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={1200} placeholder="Message ou /r 1d20 + 5" /><Button type="submit" size="icon" disabled={!chatText.trim()}><Send /></Button></div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">/r · /rmj · /mj · /joueur · /rjoueur puis choisir</p>
            </form>
          </section>
        )}
      </div>

      <TabletopDetailWindows
        windows={detailWindows}
        onClose={(id) => setDetailWindows((current) => current.filter((window) => window.id !== id))}
        onToggle={(id) => setDetailWindows((current) => current.map((window) => window.id === id ? { ...window, collapsed: !window.collapsed } : window))}
      />

      <TabletopMapOrganizer
        activeMapId={activeMap?.id || ""}
        busy={busy}
        folders={folders}
        maps={maps}
        open={mapOrganizerOpen}
        onOpenChange={setMapOrganizerOpen}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
        onMoveMap={moveMapToFolder}
        onRenameFolder={renameFolder}
        onSelectMap={loadMap}
      />

      <Dialog open={newMapOpen} onOpenChange={setNewMapOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle carte</DialogTitle><DialogDescription>La carte et ses positions seront enregistrées dans Google Sheets.</DialogDescription></DialogHeader>
          <form onSubmit={createMap} className="space-y-4">
            <Label className="grid gap-1.5">Nom<Input autoFocus value={newMap.name} onChange={(event) => setNewMap((current) => ({ ...current, name: event.target.value }))} /></Label>
            <Label className="grid gap-1.5">Dossier<NativeSelect value={newMap.folder} onChange={(event) => setNewMap((current) => ({ ...current, folder: event.target.value }))}>{folders.map((folder) => <NativeSelectOption key={folder.id} value={folder.name}>{folder.name}</NativeSelectOption>)}</NativeSelect></Label>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setNewMapOpen(false)}>Annuler</Button><Button type="submit" disabled={busy || !newMap.name.trim()}><Plus />Créer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Réglages de la carte</DialogTitle><DialogDescription>Distances, classement et dimensions restent liés à cette carte.</DialogDescription></DialogHeader>
          <form onSubmit={saveSettings} className="space-y-4">
            <Label className="grid gap-1.5">Nom<Input value={mapSettings.name} onChange={(event) => setMapSettings((current) => ({ ...current, name: event.target.value }))} /></Label>
            <Label className="grid gap-1.5">Dossier<NativeSelect value={mapSettings.folder} onChange={(event) => setMapSettings((current) => ({ ...current, folder: event.target.value }))}>{folders.map((folder) => <NativeSelectOption key={folder.id} value={folder.name}>{folder.name}</NativeSelectOption>)}</NativeSelect></Label>
            <div className="grid grid-cols-3 gap-3"><Label className="grid gap-1.5">Case (px)<Input type="number" value={mapSettings.gridSize} onChange={(event) => setMapSettings((current) => ({ ...current, gridSize: event.target.value }))} /></Label><Label className="grid gap-1.5">Distance<Input type="number" step="any" value={mapSettings.distancePerGrid} onChange={(event) => setMapSettings((current) => ({ ...current, distancePerGrid: event.target.value }))} /></Label><Label className="grid gap-1.5">Unité<Input value={mapSettings.distanceUnit} onChange={(event) => setMapSettings((current) => ({ ...current, distanceUnit: event.target.value }))} /></Label></div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>Annuler</Button><Button type="submit">Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={markerOpen} onOpenChange={(open) => { setMarkerOpen(open); if (!open) setMarkerDraft({ tokenId: "", label: "", icon: "✦", iconScale: 1, color: "#7f3430" }) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{markerDraft.tokenId ? "Modifier le repère" : "Nouveau point d’intérêt"}</DialogTitle><DialogDescription>Le nom reste facultatif. La taille de l’icône ne change pas la boîte du repère.</DialogDescription></DialogHeader>
          <form onSubmit={saveMarker} className="space-y-4">
            <Label className="grid gap-1.5">Nom facultatif<Input autoFocus value={markerDraft.label} onChange={(event) => setMarkerDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Ex. Passage secret" /></Label>
            <Label className="grid gap-1.5">Icône<Input value={markerDraft.icon} onChange={(event) => setMarkerDraft((current) => ({ ...current, icon: event.target.value.slice(0, 20) }))} placeholder="✦" /></Label>
            <Label className="grid gap-2">Taille de l’icône <span className="text-xs font-normal text-muted-foreground">{Math.round(markerDraft.iconScale * 100)} %</span><input type="range" min="0.45" max="2.25" step="0.05" value={markerDraft.iconScale} onChange={(event) => setMarkerDraft((current) => ({ ...current, iconScale: Number(event.target.value) }))} className="w-full accent-primary" /></Label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Couleur</legend>
              <div className="flex flex-wrap items-center gap-2">{markerColors.map((color) => <button key={color} type="button" onClick={() => setMarkerDraft((current) => ({ ...current, color }))} className={cn("size-8 rounded-full border-2 shadow-sm transition", markerDraft.color === color ? "scale-110 border-foreground" : "border-transparent")} style={{ backgroundColor: color }} aria-label={`Choisir la couleur ${color}`} />)}<label className="relative size-8 overflow-hidden rounded-full border-2" style={{ borderColor: markerColors.includes(markerDraft.color) ? "transparent" : "currentColor", backgroundColor: markerDraft.color }} title="Couleur personnalisée"><input type="color" value={markerDraft.color} onChange={(event) => setMarkerDraft((current) => ({ ...current, color: event.target.value }))} className="absolute inset-[-50%] size-[200%] cursor-pointer opacity-0" /><span className="sr-only">Couleur personnalisée</span></label></div>
            </fieldset>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setMarkerOpen(false)}>Annuler</Button><Button type="submit"><MapPin />{markerDraft.tokenId ? "Enregistrer" : "Ajouter"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Récupérer une carte</DialogTitle><DialogDescription>Copie l’image, les réglages, les repères et les pions également disponibles ici.</DialogDescription></DialogHeader>
          <form onSubmit={importMap} className="space-y-4">
            <Label className="grid gap-1.5">Source<NativeSelect value={importSource} onChange={(event) => setImportSource(event.target.value)}><NativeSelectOption value="">Choisir…</NativeSelectOption>{sourcePages.map((page) => <NativeSelectOption key={page.id} value={page.id}>{page.name}</NativeSelectOption>)}</NativeSelect></Label>
            <Label className="grid gap-1.5">Carte<NativeSelect value={sourceMapId} onChange={(event) => setSourceMapId(event.target.value)}><NativeSelectOption value="">Choisir…</NativeSelectOption>{sourceMaps.map((map) => <NativeSelectOption key={map.id} value={map.id}>{map.folder} / {map.name}</NativeSelectOption>)}</NativeSelect></Label>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setImportOpen(false)}>Annuler</Button><Button type="submit" disabled={!sourceMapId || busy}><Download />Récupérer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
