/**
 * Les visuels partagés en mémoire, branchés à la place de lib/shared-media : les tests regardent
 * quelles images un enregistrement a rangées (clé, type, octets) sans Google Drive.
 */
export const media = new Map<string, { bytes: ArrayBuffer; contentType: string }>()

export function reset() {
  media.clear()
}

export async function putSharedMedia(key: string, bytes: ArrayBuffer, contentType: string) {
  media.set(key, { bytes, contentType })
}

export async function getSharedMedia(key: string) {
  const found = media.get(key)
  return found ? { body: found.bytes, httpMetadata: { contentType: found.contentType } } : null
}

export async function sharedMediaVersion(key: string) {
  return media.has(key) ? "v1" : null
}
