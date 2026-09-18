import { env } from "cloudflare:workers"

function bucket() {
  if (!env.BUCKET) throw new Error("PORTRAIT_STORAGE_UNAVAILABLE")
  return env.BUCKET
}

export async function saveCharacterPortrait(characterId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_PORTRAIT")
  await bucket().put(`characters/${characterId}/portrait`, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
  })
  return `/api/characters/portrait/${encodeURIComponent(characterId)}`
}

export async function readCharacterPortrait(characterId: string) {
  return bucket().get(`characters/${characterId}/portrait`)
}
