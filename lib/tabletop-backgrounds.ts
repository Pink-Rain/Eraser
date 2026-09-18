import { env } from "cloudflare:workers"

function bucket() {
  if (!env.BUCKET) throw new Error("TABLETOP_STORAGE_UNAVAILABLE")
  return env.BUCKET
}

function backgroundKey(mapId: string) {
  return `tabletop/${mapId}/background`
}

export async function saveTabletopBackground(mapId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("INVALID_TABLETOP_BACKGROUND")
  await bucket().put(backgroundKey(mapId), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
  })
  return `/api/tabletop/background/${encodeURIComponent(mapId)}`
}

export async function readTabletopBackground(mapId: string) {
  return bucket().get(backgroundKey(mapId))
}

export async function copyTabletopBackground(sourceMapId: string, targetMapId: string) {
  const source = await readTabletopBackground(sourceMapId)
  if (!source) return false
  await bucket().put(backgroundKey(targetMapId), await source.arrayBuffer(), { httpMetadata: source.httpMetadata })
  return true
}
