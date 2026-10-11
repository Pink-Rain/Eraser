/**
 * Le cadrage d'un avatar : le point qui est au centre du token (x, y, de 0 à 1 dans l'image)
 * et la largeur de l'image que le cercle du token montre (`span`, 1 : toute la largeur).
 */
export type PortraitFraming = { x: number; y: number; span: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function cleanPortraitFraming(value: unknown): PortraitFraming | null {
  if (!value || typeof value !== "object") return null
  const { x, y, span } = value as Record<string, unknown>
  if (![x, y, span].every((item) => typeof item === "number" && Number.isFinite(item))) return null
  return { x: clamp(x as number, 0, 1), y: clamp(y as number, 0, 1), span: clamp(span as number, 0.05, 4) }
}

/** Le cadrage d'un token : l'image est placée (centre x, y ; largeur) dans un token de `size` pixels dont le cercle a ce rayon. */
export function framingFromPlacement(placement: { x: number; y: number; width: number }, imageRatio: number, size: number, radius: number): PortraitFraming | null {
  const height = placement.width * imageRatio
  if (!(placement.width > 0) || !(height > 0)) return null
  const center = size / 2
  return cleanPortraitFraming({ x: 0.5 + (center - placement.x) / placement.width, y: 0.5 + (center - placement.y) / height, span: (2 * radius) / placement.width })
}

/**
 * Le style d'une image recadrée (`object-fit: cover`) dans une boîte de cette taille. Une
 * grande boîte garde le point du visage à sa place (en %, elle peut changer de taille) ;
 * une petite vignette (72 px au plus, de taille fixe) se resserre sur le visage et le
 * centre, comme le token, sans jamais laisser de bord vide.
 */
export function framedImageStyle(framing: PortraitFraming, box: { width: number; height: number }, image: { width: number; height: number }) {
  const position = `${(framing.x * 100).toFixed(1)}% ${(framing.y * 100).toFixed(1)}%`
  const wide = { objectPosition: position, transformOrigin: "", transform: "" }
  if (!(box.width > 0 && box.height > 0 && box.width <= 72 && box.height <= 72 && image.width > 0 && image.height > 0)) return wide
  // L'image couvre la boîte : sa taille affichée, puis le resserrement sur la largeur du token.
  const cover = Math.max(box.width / image.width, box.height / image.height)
  const width = image.width * cover, height = image.height * cover
  const scale = clamp((box.width / width) / framing.span, 1, 3)
  const offset = (size: number, shown: number, focus: number) => clamp(size / 2 - focus * shown * scale, size - shown * scale, 0)
  const left = offset(box.width, width, framing.x), top = offset(box.height, height, framing.y)
  return { objectPosition: "0px 0px", transformOrigin: "0 0", transform: `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${scale.toFixed(3)})` }
}
