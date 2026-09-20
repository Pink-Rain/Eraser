import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"

function portraitKey(characterId: string) {
  return `characters/${characterId}/portrait`
}

export async function saveCharacterPortrait(characterId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_PORTRAIT")
  await putSharedMedia(portraitKey(characterId), await file.arrayBuffer(), file.type)
  return `/api/characters/portrait/${encodeURIComponent(characterId)}`
}

export async function readCharacterPortrait(characterId: string) {
  return getSharedMedia(portraitKey(characterId))
}
