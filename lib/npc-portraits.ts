import { copySharedMedia, getSharedMedia, putSharedMedia } from "@/lib/shared-media"

function portraitKey(npcId: string) {
  return `npcs/${npcId}/portrait`
}

export async function saveNpcPortrait(npcId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_PORTRAIT")
  await putSharedMedia(portraitKey(npcId), await file.arrayBuffer(), file.type)
  return `/api/npcs/portrait/${encodeURIComponent(npcId)}`
}

export async function readNpcPortrait(npcId: string) {
  return getSharedMedia(portraitKey(npcId))
}

export async function copyNpcPortrait(sourceNpcId: string, targetNpcId: string) {
  return copySharedMedia(portraitKey(sourceNpcId), portraitKey(targetNpcId))
}
