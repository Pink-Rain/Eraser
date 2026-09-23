"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react"
import { CircleDot, Crosshair, LoaderCircle, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ShopKey } from "@/lib/shop-schema"
import type { TokenKind } from "@/lib/tokens"
import "@/integrations/roll20/extension/token-art.js"

/* ---------- dessin ---------- */

// Le dessin des cadres est partagé avec le compagnon Roll20, qui fabrique les tokens
// par défaut : une seule source, integrations/roll20/extension/token-art.js.
type Placement = { x: number; y: number; width: number }
type TokenImage = HTMLImageElement | null

export type TokenStyle = { kind: Exclude<TokenKind, "shop"> } | { kind: "shop"; shopKey: ShopKey }

type TokenArt = {
  SIZE: number
  CENTER: number
  INNER: number
  shopFronts: Record<ShopKey, { stripes: [string, string]; background: string; sign: string; label: string }>
  drawToken: (ctx: CanvasRenderingContext2D, style: TokenStyle, image: TokenImage, placement: Placement, editing: boolean) => void
  corners: (placement: Placement, height: number) => Array<readonly [number, number]>
  coverPlacement: (image: HTMLImageElement) => Placement
}

const art = (globalThis as unknown as { EraserTokenArt: TokenArt }).EraserTokenArt
const { SIZE, CENTER, INNER, drawToken, corners, coverPlacement } = art
export const shopFronts = art.shopFronts

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
