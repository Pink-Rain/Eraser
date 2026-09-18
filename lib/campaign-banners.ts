import { env } from "cloudflare:workers"

function bucket() {
  if (!env.BUCKET) throw new Error("BANNER_STORAGE_UNAVAILABLE")
  return env.BUCKET
}

export async function saveCampaignBanner(campaignId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_BANNER")
  const key = `campaigns/${campaignId}/banner`
  await bucket().put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=3600" } })
  return `/api/campaigns/banner/${encodeURIComponent(campaignId)}`
}

export async function readCampaignBanner(campaignId: string) {
  return bucket().get(`campaigns/${campaignId}/banner`)
}
