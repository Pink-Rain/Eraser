import { copySharedMedia, getSharedMedia, putSharedMedia } from "@/lib/shared-media"

function backgroundKey(mapId: string) {
  return `tabletop/${mapId}/background`
}

export async function saveTabletopBackground(mapId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("INVALID_TABLETOP_BACKGROUND")
  await putSharedMedia(backgroundKey(mapId), await file.arrayBuffer(), file.type)
  return `/api/tabletop/background/${encodeURIComponent(mapId)}`
}

export async function readTabletopBackground(mapId: string) {
  return getSharedMedia(backgroundKey(mapId))
}

export async function copyTabletopBackground(sourceMapId: string, targetMapId: string) {
  return copySharedMedia(backgroundKey(sourceMapId), backgroundKey(targetMapId))
}
