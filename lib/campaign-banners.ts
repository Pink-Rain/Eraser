import { getSharedMedia, putSharedMedia } from "@/lib/shared-media"

function bannerKey(campaignId: string) {
  return `campaigns/${campaignId}/banner`
}

export async function saveCampaignBanner(campaignId: string, file: File) {
  if (!file.type.startsWith("image/") || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_BANNER")
  await putSharedMedia(bannerKey(campaignId), await file.arrayBuffer(), file.type)
  return `/api/campaigns/banner/${encodeURIComponent(campaignId)}`
}

export async function readCampaignBanner(campaignId: string) {
  return getSharedMedia(bannerKey(campaignId))
}
