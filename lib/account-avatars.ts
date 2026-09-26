import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"

/**
 * L'avatar d'un compte vit dans le Drive partagé, comme les portraits : il suit la
 * personne d'une installation à l'autre. Une image donnée par lien est copiée une
 * fois pour toutes, pour ne pas dépendre d'un site qui la retirerait.
 */
const MAX_AVATAR_BYTES = 10 * 1024 * 1024

function avatarKey(uid: string) {
  return `accounts/${uid}/avatar`
}

export function accountAvatarUrl(uid: string) {
  return `/api/account/avatar/${encodeURIComponent(uid)}`
}

export async function saveAccountAvatarFile(uid: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new Error("INVALID_AVATAR")
  await putSharedMedia(avatarKey(uid), await file.arrayBuffer(), file.type)
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host.startsWith("127.") || host.startsWith("10.")
    || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("169.254.") || host === "0.0.0.0"
}

export async function saveAccountAvatarFromUrl(uid: string, rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new Error("INVALID_AVATAR_URL")
  }
  if (!["http:", "https:"].includes(url.protocol) || isPrivateHost(url.hostname)) throw new Error("INVALID_AVATAR_URL")
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const contentType = response?.headers.get("content-type")?.split(";")[0]?.trim() || ""
  if (!response?.ok || !contentType.startsWith("image/")) throw new Error("INVALID_AVATAR_URL")
  const bytes = await response.arrayBuffer()
  if (!bytes.byteLength || bytes.byteLength > MAX_AVATAR_BYTES) throw new Error("INVALID_AVATAR")
  await putSharedMedia(avatarKey(uid), bytes, contentType)
}

export function readAccountAvatar(uid: string) {
  return getSharedMedia(avatarKey(uid))
}
