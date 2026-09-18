import { env } from "cloudflare:workers"

function bucket() {
  if (!env.BUCKET) throw new Error("PORTRAIT_STORAGE_UNAVAILABLE")
  return env.BUCKET
}

function portraitKey(npcId: string) {
  return `npcs/${npcId}/portrait`
}

export async function saveNpcPortrait(npcId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_PORTRAIT")
  await bucket().put(portraitKey(npcId), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
  })
  return `/api/npcs/portrait/${encodeURIComponent(npcId)}`
}

export async function readNpcPortrait(npcId: string) {
  return bucket().get(portraitKey(npcId))
}

export async function copyNpcPortrait(sourceNpcId: string, targetNpcId: string) {
  const source = await readNpcPortrait(sourceNpcId)
  if (!source) return false
  await bucket().put(portraitKey(targetNpcId), source.body, { httpMetadata: source.httpMetadata })
  return true
}
