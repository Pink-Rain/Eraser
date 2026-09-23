"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react"
import { CircleDot, Crosshair, LoaderCircle, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ShopKey } from "@/lib/shop-schema"
import type { TokenKind } from "@/lib/tokens"

/* ---------- dessin ---------- */

const SIZE = 512
const CENTER = SIZE / 2
const OUTER = 250
const RING = 34
const INNER = OUTER - RING

type Metal = [string, string, string, string]

/** Doré pour les joueurs, cuivré pour les PNJs, argenté pour les créatures. */
const metals: Record<Exclude<TokenKind, "shop">, Metal> = {
  character: ["#fff4b8", "#e8c052", "#a6721b", "#5e3c0c"],
  npc: ["#ffd6b8", "#d98a55", "#98491f", "#52220c"],
  creature: ["#ffffff", "#d8dde3", "#8e97a2", "#464e58"],
}

const wood: Metal = ["#e0ae76", "#a76c37", "#6d401b", "#3a200c"]

/** Une devanture par type de magasin : rayures du auvent, fond sans vendeur, enseigne. */
export const shopFronts: Record<ShopKey, { stripes: [string, string]; background: string; sign: string; label: string }> = {
  market: { stripes: ["#b3261e", "#f4e9d8"], background: "#ead7b4", sign: "🧺", label: "Marché" },
  bookshop: { stripes: ["#1f4e8c", "#f1ead9"], background: "#d9e2ef", sign: "📚", label: "Librairie" },
  antique: { stripes: ["#5b2a6e", "#e8c96a"], background: "#e7dcc9", sign: "🏺", label: "Antiquaire" },
  armory: { stripes: ["#5d6670", "#8e1b1b"], background: "#cfd3d8", sign: "⚔️", label: "Armurerie" },
  "black-market": { stripes: ["#1d1a22", "#4b2a5e"], background: "#3a3340", sign: "🗝️", label: "Marché noir" },
  alchemist: { stripes: ["#2f6b3a", "#efe6cf"], background: "#d5e6cf", sign: "⚗️", label: "Alchimiste" },
  tavern: { stripes: ["#b8621b", "#f2dfb8"], background: "#e9cfa2", sign: "🍺", label: "Taverne" },
}

export type TokenStyle = { kind: Exclude<TokenKind, "shop"> } | { kind: "shop"; shopKey: ShopKey }

type Placement = { x: number; y: number; width: number }

function ringPath(ctx: CanvasRenderingContext2D, outer: number, inner: number) {
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, outer, 0, Math.PI * 2)
  ctx.arc(CENTER, CENTER, inner, 0, Math.PI * 2, true)
}

function metalGradient(ctx: CanvasRenderingContext2D, metal: Metal) {
  const gradient = ctx.createLinearGradient(CENTER - OUTER, CENTER - OUTER, CENTER + OUTER, CENTER + OUTER)
  gradient.addColorStop(0, metal[0])
  gradient.addColorStop(0.25, metal[1])
  gradient.addColorStop(0.5, metal[2])
  gradient.addColorStop(0.72, metal[1])
  gradient.addColorStop(0.9, metal[0])
  gradient.addColorStop(1, metal[2])
  return gradient
}

/** Le cadre ancien : anneau ciselé, perles et quatre losanges aux points cardinaux. */
function drawFrame(ctx: CanvasRenderingContext2D, metal: Metal) {
  // Ombre intérieure sur le bord de l'image.
  const shade = ctx.createRadialGradient(CENTER, CENTER, INNER - 30, CENTER, CENTER, INNER)
  shade.addColorStop(0, "rgba(0,0,0,0)")
  shade.addColorStop(1, "rgba(0,0,0,0.45)")
  ctx.fillStyle = shade
  ctx.beginPath(); ctx.arc(CENTER, CENTER, INNER, 0, Math.PI * 2); ctx.fill()

  ringPath(ctx, OUTER, INNER)
  ctx.fillStyle = metalGradient(ctx, metal)
  ctx.fill("evenodd")

  ctx.lineWidth = 3
  ctx.strokeStyle = metal[3]
  for (const radius of [OUTER - 1.5, INNER + 1.5]) { ctx.beginPath(); ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2); ctx.stroke() }
  ctx.lineWidth = 1.5
  ctx.strokeStyle = metal[0]
  for (const radius of [OUTER - 7, INNER + 7]) { ctx.beginPath(); ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2); ctx.stroke() }

  const middle = OUTER - RING / 2
  for (let index = 0; index < 32; index += 1) {
    if (index % 8 === 0) continue
    const angle = (index / 32) * Math.PI * 2 - Math.PI / 2
    const x = CENTER + Math.cos(angle) * middle
    const y = CENTER + Math.sin(angle) * middle
    const bead = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5)
    bead.addColorStop(0, metal[0]); bead.addColorStop(1, metal[2])
    ctx.fillStyle = bead
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 1; ctx.strokeStyle = metal[3]; ctx.stroke()
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 2 - Math.PI / 2
    ctx.save()
    ctx.translate(CENTER + Math.cos(angle) * middle, CENTER + Math.sin(angle) * middle)
    ctx.rotate(angle)
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(0, -11); ctx.lineTo(15, 0); ctx.lineTo(0, 11); ctx.closePath()
    const gem = ctx.createLinearGradient(-15, -11, 15, 11)
    gem.addColorStop(0, metal[0]); gem.addColorStop(0.5, metal[1]); gem.addColorStop(1, metal[3])
    ctx.fillStyle = gem; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = metal[3]; ctx.stroke()
    ctx.restore()
  }
}

/** La devanture : cadre de bois, auvent rayé festonné et enseigne du métier. */
function drawShopFront(ctx: CanvasRenderingContext2D, shopKey: ShopKey) {
  const front = shopFronts[shopKey]
  drawFrame(ctx, wood)
  const start = Math.PI * 1.1
  const end = Math.PI * 1.9
  const stripes = 9
  const outer = OUTER + 2
  const inner = INNER - 44
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6
  for (let index = 0; index < stripes; index += 1) {
    const from = start + ((end - start) * index) / stripes
    const to = start + ((end - start) * (index + 1)) / stripes
    const middle = (from + to) / 2
    ctx.beginPath()
    ctx.arc(CENTER, CENTER, outer, from, to)
    ctx.lineTo(CENTER + Math.cos(to) * inner, CENTER + Math.sin(to) * inner)
    ctx.quadraticCurveTo(CENTER + Math.cos(middle) * (inner - 26), CENTER + Math.sin(middle) * (inner - 26), CENTER + Math.cos(from) * inner, CENTER + Math.sin(from) * inner)
    ctx.closePath()
    ctx.fillStyle = front.stripes[index % 2]
    ctx.fill()
  }
  ctx.restore()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(40,20,8,0.75)"
  for (let index = 0; index < stripes; index += 1) {
    const from = start + ((end - start) * index) / stripes
    const to = start + ((end - start) * (index + 1)) / stripes
    const middle = (from + to) / 2
    ctx.beginPath()
    ctx.moveTo(CENTER + Math.cos(from) * inner, CENTER + Math.sin(from) * inner)
    ctx.quadraticCurveTo(CENTER + Math.cos(middle) * (inner - 26), CENTER + Math.sin(middle) * (inner - 26), CENTER + Math.cos(to) * inner, CENTER + Math.sin(to) * inner)
    ctx.stroke()
  }
  // Barre du auvent.
  ctx.lineWidth = 7
  ctx.strokeStyle = wood[3]
  ctx.beginPath(); ctx.arc(CENTER, CENTER, outer - 2, start, end); ctx.stroke()
  // Enseigne en bas.
  const signY = CENTER + OUTER - 22
  ctx.beginPath(); ctx.arc(CENTER, signY, 34, 0, Math.PI * 2)
  const plate = ctx.createRadialGradient(CENTER - 8, signY - 8, 4, CENTER, signY, 34)
  plate.addColorStop(0, wood[0]); plate.addColorStop(1, wood[2])
  ctx.fillStyle = plate; ctx.fill()
  ctx.lineWidth = 3; ctx.strokeStyle = wood[3]; ctx.stroke()
  ctx.font = "34px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
  ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillStyle = "#000"
  ctx.fillText(front.sign, CENTER, signY + 2)
}

export function drawToken(ctx: CanvasRenderingContext2D, style: TokenStyle, image: HTMLImageElement | null, placement: Placement, editing: boolean) {
  ctx.clearRect(0, 0, SIZE, SIZE)
  const height = image ? placement.width * (image.naturalHeight / image.naturalWidth) : 0
  const left = placement.x - placement.width / 2
  const top = placement.y - height / 2
  if (editing && image) {
    // Hors du cercle, l'image reste visible en transparence pour se repérer.
    ctx.globalAlpha = 0.3
    ctx.drawImage(image, left, top, placement.width, height)
    ctx.globalAlpha = 1
  }
  ctx.save()
  ctx.beginPath(); ctx.arc(CENTER, CENTER, INNER + 1, 0, Math.PI * 2); ctx.clip()
  if (style.kind === "shop") {
    ctx.fillStyle = shopFronts[style.shopKey].background
    ctx.fillRect(0, 0, SIZE, SIZE)
    if (!image) {
      ctx.globalAlpha = 0.28
      ctx.font = "170px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
      ctx.textAlign = "center"; ctx.textBaseline = "middle"
      ctx.fillText(shopFronts[style.shopKey].sign, CENTER, CENTER + 20)
      ctx.globalAlpha = 1
    }
  } else if (!image) {
    ctx.fillStyle = "#d9d2c5"
    ctx.fillRect(0, 0, SIZE, SIZE)
  }
  if (image) ctx.drawImage(image, left, top, placement.width, height)
  ctx.restore()
  if (style.kind === "shop") drawShopFront(ctx, style.shopKey)
  else drawFrame(ctx, metals[style.kind])
  if (editing && image) {
    ctx.save()
    ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.strokeRect(left, top, placement.width, height)
    ctx.setLineDash([])
    for (const [x, y] of corners(placement, height)) {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#7f3430"; ctx.lineWidth = 3
      ctx.fillRect(x - 9, y - 9, 18, 18); ctx.strokeRect(x - 9, y - 9, 18, 18)
    }
    ctx.restore()
  }
}

function corners(placement: Placement, height: number) {
  const halfWidth = placement.width / 2
  const halfHeight = height / 2
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [placement.x + dx * halfWidth, placement.y + dy * halfHeight] as const)
}

/** L'image est d'abord posée pour couvrir tout le cercle. */
export function coverPlacement(image: HTMLImageElement): Placement {
  const diameter = INNER * 2
  const ratio = image.naturalWidth / image.naturalHeight
  const width = ratio >= 1 ? diameter * ratio : diameter
  return { x: CENTER, y: CENTER, width }
}

/* ---------- chargement de l'avatar ---------- */

async function loadEditableImage(source: string) {
  let objectUrl = ""
  let url = source
  if (!source.startsWith("data:") && !source.startsWith("blob:")) {
    const absolute = new URL(source, window.location.href)
    const fetchUrl = absolute.origin === window.location.origin ? absolute.href : `/api/tokens/source?url=${encodeURIComponent(absolute.href)}`
    const response = await fetch(fetchUrl, { cache: "no-store" })
    if (!response.ok) throw new Error("L’avatar n’a pas pu être chargé.")
    objectUrl = URL.createObjectURL(await response.blob())
    url = objectUrl
  }
  const image = new Image()
  image.decoding = "async"
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("L’avatar n’est pas une image lisible."))
    image.src = url
  })
  return { image, release: () => { if (objectUrl) URL.revokeObjectURL(objectUrl) } }
}

/* ---------- éditeur ---------- */

const frameLabels: Record<TokenStyle["kind"], string> = { character: "Cadre doré", npc: "Cadre cuivré", creature: "Cadre argenté", shop: "Devanture" }

export function TokenEditorDialog({ open, kind, ownerId, name, source, style, onClose, onSaved }: {
  open: boolean
  kind: TokenKind
  ownerId: string
  name: string
  /** L'avatar à cadrer. Vide pour un magasin sans vendeur. */
  source: string
  style: TokenStyle
  onClose: () => void
  onSaved: (url: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [placement, setPlacement] = useState<Placement>({ x: CENTER, y: CENTER, width: INNER * 2 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [currentVisible, setCurrentVisible] = useState(true)
  const [openedAt] = useState(() => Date.now())
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; start: Placement; startDistance: number } | null>(null)

  useEffect(() => {
    if (!open) return
    if (!source) { queueMicrotask(() => { setImage(null); setError("") }); return }
    let alive = true
    let release = () => {}
    queueMicrotask(() => { if (alive) { setLoading(true); setError("") } })
    loadEditableImage(source)
      .then((loaded) => {
        release = loaded.release
        if (!alive) return release()
        setImage(loaded.image)
        setPlacement(coverPlacement(loaded.image))
      })
      .catch((caught) => { if (alive) { setImage(null); setError(caught instanceof Error ? caught.message : "L’avatar n’a pas pu être chargé.") } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false; release() }
  }, [open, source])

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d")
    if (context) drawToken(context, style, image, placement, true)
  }, [style, image, placement, open])

  const point = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: ((event.clientX - rect.left) / rect.width) * SIZE, y: ((event.clientY - rect.top) / rect.height) * SIZE }
  }, [])

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!image) return
    const { x, y } = point(event)
    const height = placement.width * (image.naturalHeight / image.naturalWidth)
    const onCorner = corners(placement, height).some(([cx, cy]) => Math.abs(cx - x) <= 22 && Math.abs(cy - y) <= 22)
    drag.current = { mode: onCorner ? "resize" : "move", startX: x, startY: y, start: placement, startDistance: Math.max(1, Math.hypot(x - placement.x, y - placement.y)) }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = drag.current
    if (!current) return
    const { x, y } = point(event)
    if (current.mode === "move") setPlacement({ ...current.start, x: current.start.x + x - current.startX, y: current.start.y + y - current.startY })
    else {
      // Redimension par un coin : les proportions de l'image ne changent jamais.
      const distance = Math.hypot(x - current.start.x, y - current.start.y)
      setPlacement({ ...current.start, width: Math.max(60, Math.min(6000, current.start.width * (distance / current.startDistance))) })
    }
  }

  function wheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (!image) return
    const factor = event.deltaY < 0 ? 1.06 : 1 / 1.06
    setPlacement((current) => ({ ...current, width: Math.max(60, Math.min(6000, current.width * factor)) }))
  }

  async function save() {
    setSaving(true); setError("")
    try {
      const canvas = document.createElement("canvas")
      canvas.width = SIZE; canvas.height = SIZE
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Le navigateur ne peut pas préparer le token.")
      drawToken(context, style, image, placement, false)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("Le token n’a pas pu être préparé.")
      const form = new FormData()
      form.append("token", new File([blob], "token.png", { type: "image/png" }))
      const response = await fetch(`/api/tokens/${kind}/${encodeURIComponent(ownerId)}`, { method: "POST", body: form })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(payload.error || "Le token n’a pas pu être enregistré.")
      onSaved(payload.url)
      onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le token n’a pas pu être enregistré.") }
    setSaving(false)
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Token de {name || "ce personnage"}</DialogTitle>
        <DialogDescription>{frameLabels[style.kind]}{style.kind === "shop" ? ` · ${shopFronts[style.shopKey].label}` : ""}. Glisse l’image pour la recentrer, tire un coin (ou la molette) pour la redimensionner.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <div className="relative mx-auto w-full max-w-[20rem]">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className={cn("aspect-square w-full touch-none rounded-2xl bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] bg-[length:24px_24px]", image ? "cursor-move" : "")}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
            onWheel={wheel}
          />
          {loading && <div className="absolute inset-0 grid place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div>}
        </div>
        <div className="flex flex-col gap-3 text-xs text-muted-foreground">
          {currentVisible && <div>
            <p className="mb-1 font-semibold text-foreground">Token actuel</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/tokens/${kind}/${encodeURIComponent(ownerId)}?t=${openedAt}`} alt="" className="size-24 object-contain" onError={() => setCurrentVisible(false)} />
          </div>}
          {image && <Button type="button" variant="outline" size="sm" onClick={() => setPlacement(coverPlacement(image))}><Crosshair />Recentrer</Button>}
          {!source && style.kind === "shop" && <p>Sans vendeur, la devanture garde les couleurs du magasin.</p>}
          {!source && style.kind !== "shop" && <p>Ajoute d’abord un avatar pour le cadrer.</p>}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={saving || loading || (!image && style.kind !== "shop")} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}Enregistrer le token</Button>
      </div>
    </DialogContent>
  </Dialog>
}

/** Le bouton discret « Token », placé sous un avatar. */
export function TokenButton({ kind, ownerId, name, source, style, className, disabledReason = "" }: {
  kind: TokenKind
  ownerId: string
  name: string
  source: string
  style: TokenStyle
  className?: string
  disabledReason?: string
}) {
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [hasToken, setHasToken] = useState(true)
  return <>
    <Button type="button" variant="ghost" size="sm" className={cn("w-full gap-2 text-muted-foreground hover:text-foreground", className)} disabled={Boolean(disabledReason) || !ownerId} title={disabledReason || "Préparer le token rond"} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true) }}>
      {hasToken
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={version} src={`/api/tokens/${kind}/${encodeURIComponent(ownerId)}${version ? `?v=${version}` : ""}`} alt="" className="size-5 rounded-full object-cover" onError={() => setHasToken(false)} />
        : <CircleDot className="size-4" />}
      Token
    </Button>
    {open && <TokenEditorDialog open kind={kind} ownerId={ownerId} name={name} source={source} style={style} onClose={() => setOpen(false)} onSaved={() => { setHasToken(true); setVersion(Date.now()) }} />}
  </>
}
