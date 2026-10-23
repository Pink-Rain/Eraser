"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react"
import { CircleDot, Crosshair, LoaderCircle, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { TokenKind } from "@/lib/tokens"
import { cleanPortraitFraming, framingFromPlacement, type PortraitFraming } from "@/lib/portrait-framing-shared"
import { defaultTokenFrameId, resolveTokenFrame, shopInterior, tokenFrameFamilyLabels, tokenFramesFor, type TokenFrame, type TokenFrameFamily, type TokenSubject } from "@/lib/token-frames"
import { announcePortraitFraming } from "@/components/eraser/portrait-framing"

/* ---------- dessin ---------- */

// Un token, ce sont trois images superposées : le calque derrière le cadre (s'il y en a
// un), le portrait dans le cercle, puis le cadre. Les cadres sont des images toutes faites
// (`lib/token-frames.ts`) : rien n'est calculé ici, l'éditeur reste instantané.
type Placement = { x: number; y: number; width: number }
type Layers = { key: string; front: HTMLImageElement; back: HTMLImageElement | null; interior: HTMLImageElement | null }

/** Ce que le token représente (joueur, PNJ du groupe, créature, magasin…). */
export type TokenStyle = TokenSubject

const SIZE = 512
const CENTER = SIZE / 2
// Le portrait tel que les planches validées l'ont montré : un peu patiné, sur un fond sombre.
const PORTRAIT_FILTER = "sepia(0.16) saturate(0.88) contrast(1.05)"
const INTERIOR_FILTER = "saturate(0.95)"
const PORTRAIT_BACKGROUND = "#1a1714"

const loadedImages = new Map<string, Promise<HTMLImageElement>>()

/** Une image des cadres, chargée une seule fois par page. */
function frameImage(src: string) {
  let pending = loadedImages.get(src)
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.decoding = "async"
      image.onload = () => resolve(image)
      image.onerror = () => { loadedImages.delete(src); reject(new Error("Le cadre n’a pas pu être chargé.")) }
      image.src = src
    })
    loadedImages.set(src, pending)
  }
  return pending
}

async function loadLayers(frame: TokenFrame, interior: string): Promise<Layers> {
  const [front, back, background] = await Promise.all([frameImage(frame.front), frame.back ? frameImage(frame.back) : null, interior ? frameImage(interior) : null])
  return { key: `${frame.id}|${interior}`, front, back, interior: background }
}

const imageHeight = (image: HTMLImageElement, width: number) => width * ((image.naturalHeight || image.height) / (image.naturalWidth || image.width))

function corners(placement: Placement, height: number) {
  const halfWidth = placement.width / 2
  const halfHeight = height / 2
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [placement.x + dx * halfWidth, placement.y + dy * halfHeight] as const)
}

/** L'image centrée, juste assez grande pour couvrir le cercle du portrait. */
function coverPlacement(image: HTMLImageElement, radius: number): Placement {
  const ratio = (image.naturalWidth || image.width) / (image.naturalHeight || image.height)
  return { x: CENTER, y: CENTER, width: ratio >= 1 ? radius * 2 * ratio : radius * 2 }
}

/** L'image là où le cadrage enregistré l'avait mise (l'inverse de `framingFromPlacement`). */
function placementFromFraming(framing: PortraitFraming, image: HTMLImageElement, radius: number): Placement {
  const width = (2 * radius) / framing.span
  return { x: CENTER - (framing.x - 0.5) * width, y: CENTER - (framing.y - 0.5) * imageHeight(image, width), width }
}

/** Un autre cadre a un cercle d'une autre taille : l'image garde le même cadrage. */
function scalePlacement(placement: Placement, factor: number): Placement {
  return { x: CENTER + (placement.x - CENTER) * factor, y: CENTER + (placement.y - CENTER) * factor, width: placement.width * factor }
}

function drawToken(ctx: CanvasRenderingContext2D, frame: TokenFrame, layers: Layers | null, image: HTMLImageElement | null, placement: Placement, editing: boolean) {
  ctx.clearRect(0, 0, SIZE, SIZE)
  const height = image ? imageHeight(image, placement.width) : 0
  const left = placement.x - placement.width / 2
  const top = placement.y - height / 2
  if (editing && image) {
    ctx.globalAlpha = 0.3
    ctx.drawImage(image, left, top, placement.width, height)
    ctx.globalAlpha = 1
  }
  if (layers?.back) ctx.drawImage(layers.back, 0, 0, SIZE, SIZE)
  ctx.save()
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, frame.radius, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = PORTRAIT_BACKGROUND
  ctx.fillRect(0, 0, SIZE, SIZE)
  if (image) {
    ctx.filter = PORTRAIT_FILTER
    ctx.drawImage(image, left, top, placement.width, height)
  } else if (layers?.interior) {
    ctx.filter = INTERIOR_FILTER
    ctx.drawImage(layers.interior, 0, 0, SIZE, SIZE)
  }
  ctx.restore()
  if (layers) ctx.drawImage(layers.front, 0, 0, SIZE, SIZE)
  if (editing && image) {
    ctx.save()
    ctx.setLineDash([8, 6])
    ctx.lineWidth = 2
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.strokeRect(left, top, placement.width, height)
    ctx.setLineDash([])
    for (const [x, y] of corners(placement, height)) {
      ctx.fillStyle = "#fff"
      ctx.strokeStyle = "#7f3430"
      ctx.lineWidth = 3
      ctx.fillRect(x - 9, y - 9, 18, 18)
      ctx.strokeRect(x - 9, y - 9, 18, 18)
    }
    ctx.restore()
  }
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

/**
 * Le cadre et le cadrage enregistrés avec le token, et pour un PNJ s'il est le compagnon d'un
 * personnage (son cadre par défaut change) ; rien si le serveur ne répond pas.
 */
async function loadSavedChoice(kind: TokenKind, ownerId: string) {
  const none = { frame: null, framing: null, companion: false }
  try {
    const response = await fetch(`/api/tokens/${kind}/${encodeURIComponent(ownerId)}/frame`, { cache: "no-store" })
    if (!response.ok) return none
    const payload = (await response.json()) as { frame?: string | null; framing?: unknown; companion?: boolean }
    return { frame: payload.frame ?? null, framing: cleanPortraitFraming(payload.framing), companion: payload.companion === true }
  } catch {
    return none
  }
}

/** Un PNJ compagnon d'un personnage prend le cadre par défaut des compagnons. */
function withCompanion(subject: TokenSubject, companion: boolean): TokenSubject {
  return companion && subject.kind === "npc" && !subject.companion ? { ...subject, companion: true } : subject
}

/* ---------- choix du cadre ---------- */

function frameLabel(frame: TokenFrame) {
  return frame.family === "door" ? frame.name : `${tokenFrameFamilyLabels[frame.family]} n°${frame.number} · ${frame.name}`
}

/** Un cadre proposé, avec le vrai portrait dedans : on voit le token avant de le choisir. */
function FrameChoice({ frame, imageUrl, placement, radius, selected, isDefault, onSelect }: {
  frame: TokenFrame
  imageUrl: string
  placement: Placement | null
  /** Le rayon du cadre affiché dans l'éditeur, auquel `placement` correspond. */
  radius: number
  selected: boolean
  isDefault: boolean
  onSelect: () => void
}) {
  const shown = placement ? scalePlacement(placement, frame.radius / radius) : null
  const percent = (value: number) => `${(value / SIZE) * 100}%`
  return <button type="button" aria-pressed={selected} title={frameLabel(frame) + (isDefault ? " (par défaut)" : "")} onClick={onSelect}
    className={cn("grid content-start justify-items-center gap-1 rounded-xl border p-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60", selected ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/50")}>
    <span className="relative block aspect-square w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {frame.back && <img src={frame.back} alt="" decoding="async" className="absolute inset-0 size-full" />}
      <span className="absolute inset-0 overflow-hidden" style={{ clipPath: `circle(${percent(frame.radius)} at 50% 50%)`, background: PORTRAIT_BACKGROUND }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl && shown && <img src={imageUrl} alt="" decoding="async" className="absolute max-w-none" style={{ left: percent(shown.x - shown.width / 2), width: percent(shown.width), filter: PORTRAIT_FILTER, ...shownTop(shown) }} />}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.front} alt="" decoding="async" className="absolute inset-0 size-full" />
    </span>
    <span className={cn("text-[11px] leading-tight", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>{frame.number} · {frame.name}</span>
    {isDefault && <span className="text-[10px] leading-none text-primary">par défaut</span>}
  </button>
}

/**
 * Le haut de l'image dans la vignette : la vignette est carrée et suit le token de 512 px,
 * mais la hauteur de l'image dépend de ses proportions, inconnues du CSS. Le centre de
 * l'image est placé là où il est dans le token, puis l'image remonte de sa moitié.
 */
function shownTop(shown: Placement) {
  return { top: `${(shown.y / SIZE) * 100}%`, transform: "translateY(-50%)" }
}

function FramePicker({ frames, subject, frameId, imageUrl, placement, radius, onChoose }: {
  frames: TokenFrame[]
  subject: TokenSubject
  frameId: string
  imageUrl: string
  placement: Placement | null
  radius: number
  onChoose: (frame: TokenFrame) => void
}) {
  const defaultId = defaultTokenFrameId(subject)
  const families = [...new Set(frames.map((frame) => frame.family))] as TokenFrameFamily[]
  return <div className="grid content-start gap-3 overflow-y-auto pr-1 md:max-h-[min(34rem,65vh)]">
    {families.map((family) => <section key={family} className="grid gap-1">
      <h3 className="text-xs font-semibold text-foreground">{tokenFrameFamilyLabels[family]}</h3>
      <div className={cn("grid gap-1", family === "special" ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-4")}>
        {frames.filter((frame) => frame.family === family).map((frame) => <FrameChoice key={frame.id} frame={frame} imageUrl={imageUrl} placement={placement} radius={radius} selected={frame.id === frameId} isDefault={frame.id === defaultId} onSelect={() => onChoose(frame)} />)}
      </div>
    </section>)}
  </div>
}

/* ---------- éditeur ---------- */

function subjectDescription(subject: TokenSubject, frame: TokenFrame) {
  if (subject.kind === "shop") return `${frame.name}. Avec un vendeur, son portrait remplit la porte ; sans vendeur, on voit l’intérieur de la boutique.`
  const move = "Glisse l’image pour la recentrer, tire un coin (ou la molette) pour la redimensionner."
  return subject.kind === "character" ? `Choisis ton bleu vif. ${move}` : `Choisis le cadre. ${move}`
}

export function TokenEditorDialog({ open, kind, ownerId, name, source, style, companionOf = "", onClose, onSaved }: {
  open: boolean
  kind: TokenKind
  ownerId: string
  name: string
  /** L'avatar à cadrer. Vide pour un magasin sans vendeur. */
  source: string
  style: TokenStyle
  /** Le personnage dont ce PNJ ou cette créature est le compagnon (son joueur peut en faire le token). */
  companionOf?: string
  onClose: () => void
  onSaved: (url: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [companion, setCompanion] = useState(false)
  const subject = withCompanion(style, companion)
  const frames = tokenFramesFor(subject)
  const [frameId, setFrameId] = useState(() => defaultTokenFrameId(style))
  const frame = resolveTokenFrame(subject, frameId)
  const interior = style.kind === "shop" && !source ? shopInterior(style.shopKey) : ""
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [placement, setPlacement] = useState<Placement>({ x: CENTER, y: CENTER, width: frame.radius * 2 })
  const [layers, setLayers] = useState<Layers | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [currentVisible, setCurrentVisible] = useState(true)
  const [openedAt] = useState(() => Date.now())
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; start: Placement; startDistance: number } | null>(null)
  const shownLayers = layers?.key === `${frame.id}|${interior}` ? layers : null
  // Le token représenté, en texte : un nouvel objet `style` à chaque rendu ne relance rien.
  const subjectKey = JSON.stringify(style)

  // À l'ouverture : l'avatar, puis le cadre et le cadrage enregistrés avec le token. L'image
  // reprend sa place d'avant dans le cadre choisi, ou couvre le cercle.
  useEffect(() => {
    if (!open) return
    let alive = true
    let release = () => {}
    queueMicrotask(() => { if (alive) { setLoading(true); setError("") } })
    const saved = loadSavedChoice(kind, ownerId)
    const avatar = source ? loadEditableImage(source) : Promise.resolve(null)
    Promise.all([saved, avatar])
      .then(([choice, loaded]) => {
        if (loaded) release = loaded.release
        if (!alive) return release()
        const chosen = resolveTokenFrame(withCompanion(JSON.parse(subjectKey) as TokenSubject, choice.companion), choice.frame)
        setCompanion(choice.companion)
        setFrameId(chosen.id)
        setImage(loaded?.image ?? null)
        if (loaded) setPlacement(choice.framing ? placementFromFraming(choice.framing, loaded.image, chosen.radius) : coverPlacement(loaded.image, chosen.radius))
      })
      .catch((caught) => { if (alive) { setImage(null); setError(caught instanceof Error ? caught.message : "L’avatar n’a pas pu être chargé.") } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false; release() }
  }, [open, source, kind, ownerId, subjectKey])

  useEffect(() => {
    let alive = true
    loadLayers(frame, interior)
      .then((loaded) => { if (alive) setLayers(loaded) })
      .catch((caught) => { if (alive) setError(caught instanceof Error ? caught.message : "Le cadre n’a pas pu être chargé.") })
    return () => { alive = false }
  }, [frame, interior])

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d")
    if (context) drawToken(context, frame, shownLayers, image, placement, true)
  }, [frame, shownLayers, image, placement, open])

  function chooseFrame(next: TokenFrame) {
    if (next.id === frame.id) return
    setPlacement((current) => scalePlacement(current, next.radius / frame.radius))
    setFrameId(next.id)
  }

  const point = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: ((event.clientX - rect.left) / rect.width) * SIZE, y: ((event.clientY - rect.top) / rect.height) * SIZE }
  }, [])

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!image) return
    const { x, y } = point(event)
    const onCorner = corners(placement, imageHeight(image, placement.width)).some(([cx, cy]) => Math.abs(cx - x) <= 22 && Math.abs(cy - y) <= 22)
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
    if (!shownLayers) return
    setSaving(true); setError("")
    try {
      const canvas = document.createElement("canvas")
      canvas.width = SIZE; canvas.height = SIZE
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Le navigateur ne peut pas préparer le token.")
      drawToken(context, frame, shownLayers, image, placement, false)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("Le token n’a pas pu être préparé.")
      const form = new FormData()
      form.append("token", new File([blob], "token.png", { type: "image/png" }))
      form.append("frame", frame.id)
      if (companionOf) form.append("character", companionOf)
      // Le cadrage choisi ici recadre aussi l'avatar dans les cartes et les vignettes.
      const framing = image ? framingFromPlacement(placement, image.naturalHeight / image.naturalWidth, SIZE, frame.radius) : null
      if (framing) form.append("framing", JSON.stringify(framing))
      const response = await fetch(`/api/tokens/${kind}/${encodeURIComponent(ownerId)}`, { method: "POST", body: form })
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(payload.error || "Le token n’a pas pu être enregistré.")
      if (framing) announcePortraitFraming(kind, ownerId, framing)
      onSaved(payload.url)
      onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le token n’a pas pu être enregistré.") }
    setSaving(false)
  }

  const picker = frames.length > 1
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
    {/* Pas de focus d'office sur le premier cadre : il aurait l'air choisi. */}
    <DialogContent className={cn("max-h-[calc(100svh-2rem)] overflow-y-auto", picker ? "sm:max-w-3xl" : "sm:max-w-md")} onOpenAutoFocus={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Token de {name || "ce personnage"}</DialogTitle>
        <DialogDescription>{subjectDescription(subject, frame)}</DialogDescription>
      </DialogHeader>
      <div className={cn("grid gap-4", picker && "md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]")}>
        <div className="grid content-start gap-3">
          <div className="relative mx-auto w-full max-w-[19rem]">
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
            {(loading || !shownLayers) && <div className="absolute inset-0 grid place-items-center"><LoaderCircle className="animate-spin text-muted-foreground" /></div>}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            {currentVisible && <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/tokens/${kind}/${encodeURIComponent(ownerId)}?t=${openedAt}`} alt="" className="size-12 object-contain" onError={() => setCurrentVisible(false)} />
              <span className="font-semibold text-foreground">Token actuel</span>
            </div>}
            {image && <Button type="button" variant="outline" size="sm" onClick={() => setPlacement(coverPlacement(image, frame.radius))}><Crosshair />Recentrer</Button>}
          </div>
          {!source && style.kind !== "shop" && <p className="text-xs text-muted-foreground">Ajoute d’abord un avatar pour le cadrer.</p>}
        </div>
        {picker && <FramePicker frames={frames} subject={subject} frameId={frame.id} imageUrl={image?.src ?? ""} placement={image ? placement : null} radius={frame.radius} onChoose={chooseFrame} />}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Annuler</Button>
        <Button type="button" disabled={saving || loading || !shownLayers || (!image && style.kind !== "shop")} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />}Enregistrer le token</Button>
      </div>
    </DialogContent>
  </Dialog>
}

/** Le bouton discret « Token », placé sous un avatar. */
export function TokenButton({ kind, ownerId, name, source, style, companionOf, className, disabledReason = "" }: {
  kind: TokenKind
  ownerId: string
  name: string
  source: string
  style: TokenStyle
  /** Le personnage dont c'est le compagnon (voir `TokenEditorDialog`). */
  companionOf?: string
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
    {open && <TokenEditorDialog open kind={kind} ownerId={ownerId} name={name} source={source} style={style} companionOf={companionOf} onClose={() => setOpen(false)} onSaved={() => { setHasToken(true); setVersion(Date.now()) }} />}
  </>
}
