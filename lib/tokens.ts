import { copySharedMedia, getSharedMedia, putSharedMedia, sharedMediaVersion } from "@/lib/shared-media"

/**
 * Le token d'un personnage, PNJ, créature ou magasin : l'image ronde avec son cadre,
 * préparée dans l'éditeur de token. Elle est rangée avec les autres visuels partagés
 * dans Drive.
 */
export const tokenKinds = ["character", "npc", "creature", "shop"] as const
export type TokenKind = (typeof tokenKinds)[number]

export function isTokenKind(value: string): value is TokenKind {
  return (tokenKinds as readonly string[]).includes(value)
}

export function validTokenOwnerId(value: string) {
  return /^[\w:.-]{1,200}$/.test(value)
}

function tokenKey(kind: TokenKind, id: string) {
  return `tokens/${kind}/${id}`
}

export function tokenUrl(kind: TokenKind, id: string, version: string) {
  return `/api/tokens/${kind}/${encodeURIComponent(id)}?v=${encodeURIComponent(version.replace(/[^0-9A-Za-z]/g, ""))}`
}

export async function saveToken(kind: TokenKind, id: string, file: File) {
  if (file.type !== "image/png" || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("INVALID_TOKEN")
  const pointer = await putSharedMedia(tokenKey(kind, id), await file.arrayBuffer(), "image/png")
  return tokenUrl(kind, id, pointer.modifiedTime)
}

export async function readToken(kind: TokenKind, id: string) {
  return getSharedMedia(tokenKey(kind, id))
}

/** Version du token (change à chaque nouvel enregistrement), ou `null` s'il n'y en a pas. */
export async function tokenVersion(kind: TokenKind, id: string) {
  return sharedMediaVersion(tokenKey(kind, id))
}

export async function copyToken(kind: TokenKind, sourceId: string, targetId: string) {
  return copySharedMedia(tokenKey(kind, sourceId), tokenKey(kind, targetId)).catch(() => false)
}
