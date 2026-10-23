/**
 * Les cadres des tokens : des images rendues une fois pour toutes par le moteur de
 * ClaudeIcones (`scripts/token-frames/export.mjs`), rangées dans `public/token-frames`.
 * Un token se compose en trois couches : le calque derrière (s'il y en a un), le portrait
 * dans le cercle (`radius`, sur un token de 512 px), puis le cadre lui-même, qui porte
 * aussi l'ombre et la vignette posées sur le portrait.
 *
 * Sans dépendance : lu par l'éditeur de token comme par le serveur, qui vérifie le cadre
 * enregistré.
 */

export type TokenFrameFamily = "vivid-blue" | "enamel-blue" | "enamel-red" | "gold" | "special" | "door"

export type TokenFrame = {
  /** L'identifiant enregistré : « vivid-blue-2 », « special-lich », « door-market ». */
  id: string
  family: TokenFrameFamily
  /** Le numéro de la planche : l'état (1 Neuf … 4 Détruit) ou le numéro du cadre spécial. */
  number: number
  /** « Abîmé », « Sceau du Liche », « Porte · Taverne ». */
  name: string
  front: string
  back?: string
  /** Le rayon du cercle du portrait, sur un token de 512 px. */
  radius: number
}

/** Ce que le token représente : il décide des cadres proposés et du cadre par défaut. */
export type TokenSubject =
  | { kind: "character" }
  | { kind: "npc"; group?: boolean; companion?: boolean }
  | { kind: "creature"; companion?: boolean }
  | { kind: "shop"; shopKey: string }

export const tokenFrameFamilyLabels: Record<TokenFrameFamily, string> = {
  "vivid-blue": "Bleu vif",
  "enamel-blue": "Émail bleu clair",
  "enamel-red": "Émail rouge",
  gold: "Or",
  special: "Cadres spéciaux",
  door: "Porte",
}

const states = ["Neuf", "Abîmé", "Très abîmé", "Détruit"]
const folder = "/token-frames"

function stateFrames(family: Exclude<TokenFrameFamily, "special" | "door">): TokenFrame[] {
  return states.map((name, index) => ({ id: `${family}-${index + 1}`, family, number: index + 1, name, front: `${folder}/${family}-${index + 1}.webp`, radius: 216 }))
}

// Les cadres spéciaux retenus, avec leur numéro sur la planche des 20 cadres épiques.
const specials: Array<[number, string, string, number, boolean]> = [
  [1, "wyrms", "Entrelacs des wyrms", 174, false],
  [2, "thorns", "Gloire aux épines", 170, false],
  [3, "lich", "Sceau du Liche", 172, true],
  [4, "forge", "Forge primordiale", 170, true],
  [8, "sylvan", "Roi sylvestre", 170, false],
  [13, "pact", "Pacte infernal", 166, true],
  [14, "tentacles", "Étreinte des profondeurs", 166, true],
  [16, "moon", "Miroir de la Lune elfique", 166, true],
  [19, "witch", "Sabbat", 164, true],
  [20, "spider", "Reine-Araignée", 164, true],
]
const specialFrames: TokenFrame[] = specials.map(([number, key, name, radius, back]) => ({
  id: `special-${key}`, family: "special", number, name, front: `${folder}/special-${key}.webp`, ...(back ? { back: `${folder}/special-${key}-back.webp` } : {}), radius,
}))

// Les portes dessinées, par type de magasin d'Eraser. Un type sans porte (créé dans Lieux ›
// Magasin) prend celle du Marché.
const doors: Record<string, [string, string]> = {
  market: ["market", "Marché"],
  bookshop: ["bookshop", "Librairie"],
  antique: ["antique", "Antiquaire"],
  armory: ["armory", "Armurerie"],
  "black-market": ["black-market", "Marché noir"],
  alchemist: ["alchemist", "Alchimiste"],
  tavern: ["tavern", "Taverne"],
  "travelling-market": ["traveling", "Marché ambulant"],
}

const doorFrames: Record<string, TokenFrame> = Object.fromEntries(Object.entries(doors).map(([shopKey, [file, label]]) => [shopKey, {
  id: `door-${file}`, family: "door", number: 1, name: `Porte · ${label}`, front: `${folder}/door-${file}.webp`, radius: 168,
} satisfies TokenFrame]))

function doorFrame(shopKey: string): TokenFrame {
  return doorFrames[shopKey] ?? doorFrames.market
}

/** Le fond d'un magasin sans vendeur : l'intérieur de la boutique, à la place du portrait. */
export function shopInterior(shopKey: string) {
  return `${folder}/interior-${(doors[shopKey] ?? doors.market)[0]}.webp`
}

const playerFrames = stateFrames("vivid-blue")
const entityFrames = [...stateFrames("enamel-blue"), ...stateFrames("enamel-red"), ...stateFrames("gold"), ...specialFrames]

/** Les cadres qu'on peut choisir pour ce token, dans l'ordre où l'éditeur les montre. */
export function tokenFramesFor(subject: TokenSubject): TokenFrame[] {
  if (subject.kind === "character") return playerFrames
  if (subject.kind === "shop") return [doorFrame(subject.shopKey)]
  return entityFrames
}

/**
 * Le cadre par défaut : bleu vif abîmé pour un joueur ; émail bleu clair très abîmé pour un
 * PNJ du groupe et pour un compagnon ; or très abîmé pour un autre PNJ ; émail rouge très
 * abîmé pour une créature ; sa porte pour un magasin.
 */
export function defaultTokenFrameId(subject: TokenSubject) {
  if (subject.kind === "character") return "vivid-blue-2"
  if (subject.kind === "shop") return doorFrame(subject.shopKey).id
  if (subject.companion || (subject.kind === "npc" && subject.group)) return "enamel-blue-3"
  return subject.kind === "npc" ? "gold-3" : "enamel-red-3"
}

/** Le cadre enregistré s'il est (encore) proposé pour ce token, sinon le cadre par défaut. */
export function resolveTokenFrame(subject: TokenSubject, savedId?: string | null): TokenFrame {
  const frames = tokenFramesFor(subject)
  return frames.find((frame) => frame.id === savedId) ?? frames.find((frame) => frame.id === defaultTokenFrameId(subject)) ?? frames[0]
}

/** Un identifiant de cadre qui existe, quel que soit le token (vérifié à l'enregistrement). */
export function isTokenFrameId(value: unknown): value is string {
  return typeof value === "string" && (playerFrames.some((frame) => frame.id === value) || entityFrames.some((frame) => frame.id === value) || Object.values(doors).some(([file]) => value === `door-${file}`))
}
