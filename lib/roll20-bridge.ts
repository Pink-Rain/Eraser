import { and, eq } from "drizzle-orm"

import { getDb } from "@/db"
import { roll20CampaignLinks } from "@/db/schema"
import { getCampaignDashboard, listNpcs, listSavedShops, saveNpcs } from "@/lib/google-sheets"
import { readNpcPortrait } from "@/lib/npc-portraits"
import type { AuthorizedUser } from "@/lib/server-auth"

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function randomToken(length = 32) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

export async function campaignForRoll20Manager(account: AuthorizedUser, campaignId: string) {
  if (account.role !== "admin" && account.role !== "mj") return null
  return getCampaignDashboard(account.role === "admin" ? null : account.uid, campaignId).catch(() => null)
}

export async function getRoll20LinkForManager(account: AuthorizedUser, campaignId: string) {
  if (!await campaignForRoll20Manager(account, campaignId)) return null
  const [link] = await getDb().select({
    id: roll20CampaignLinks.id,
    campaignId: roll20CampaignLinks.campaignId,
    roll20GameId: roll20CampaignLinks.roll20GameId,
    roll20GameName: roll20CampaignLinks.roll20GameName,
    lastPullAt: roll20CampaignLinks.lastPullAt,
    lastPushAt: roll20CampaignLinks.lastPushAt,
    createdAt: roll20CampaignLinks.createdAt,
    updatedAt: roll20CampaignLinks.updatedAt,
  }).from(roll20CampaignLinks).where(eq(roll20CampaignLinks.campaignId, campaignId)).limit(1)
  return link ?? null
}

export async function rotateRoll20Link(account: AuthorizedUser, campaignId: string) {
  const campaign = await campaignForRoll20Manager(account, campaignId)
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND")
  const token = `era_${randomToken(36)}`
  const imageToken = `img_${randomToken(24)}`
  const now = new Date().toISOString()
  const record = {
    id: crypto.randomUUID(), campaignId, mjUid: campaign.mjUid, tokenHash: await sha256(token), imageToken,
    roll20GameId: "", roll20GameName: "", lastPullAt: null, lastPushAt: null, createdAt: now, updatedAt: now,
  }
  await getDb().insert(roll20CampaignLinks).values(record).onConflictDoUpdate({
    target: roll20CampaignLinks.campaignId,
    set: { mjUid: campaign.mjUid, tokenHash: record.tokenHash, imageToken, roll20GameId: "", roll20GameName: "", lastPullAt: null, lastPushAt: null, updatedAt: now },
  })
  return { token, campaign: { id: campaign.id, name: campaign.name } }
}

export async function deleteRoll20Link(account: AuthorizedUser, campaignId: string) {
  if (!await campaignForRoll20Manager(account, campaignId)) throw new Error("CAMPAIGN_NOT_FOUND")
  await getDb().delete(roll20CampaignLinks).where(eq(roll20CampaignLinks.campaignId, campaignId))
}

export async function roll20LinkFromToken(token: string) {
  if (!token.startsWith("era_") || token.length > 120) return null
  const [link] = await getDb().select().from(roll20CampaignLinks).where(eq(roll20CampaignLinks.tokenHash, await sha256(token))).limit(1)
  return link ?? null
}

export async function roll20LinkFromImageToken(campaignId: string, imageToken: string) {
  if (!imageToken.startsWith("img_") || imageToken.length > 100) return null
  const [link] = await getDb().select().from(roll20CampaignLinks).where(and(eq(roll20CampaignLinks.campaignId, campaignId), eq(roll20CampaignLinks.imageToken, imageToken))).limit(1)
  return link ?? null
}

export async function roll20CampaignPayload(link: typeof roll20CampaignLinks.$inferSelect, origin: string, game: { id?: string; name?: string }) {
  const campaign = await getCampaignDashboard(null, link.campaignId)
  const [npcs, shops] = await Promise.all([listNpcs(link.campaignId), listSavedShops(link.campaignId)])
  const npcById = new Map(npcs.map((npc) => [npc.id, npc]))
  const portraitUrl = (npcId: string, portrait: string) => portrait
    ? `${origin}/api/roll20/bridge/portrait/${encodeURIComponent(npcId)}?campaign=${encodeURIComponent(link.campaignId)}&key=${encodeURIComponent(link.imageToken)}`
    : ""
  const now = new Date().toISOString()
  await getDb().update(roll20CampaignLinks).set({
    roll20GameId: (game.id || link.roll20GameId).slice(0, 200),
    roll20GameName: (game.name || link.roll20GameName).slice(0, 200),
    lastPullAt: now, updatedAt: now,
  }).where(eq(roll20CampaignLinks.id, link.id))
  return {
    schema: 1,
    campaign: { id: campaign.id, name: campaign.name, updatedAt: campaign.updatedAt },
    npcs: npcs.map((npc) => ({ ...npc, portraitUrl: portraitUrl(npc.id, npc.portrait) })),
    shops: shops.map((shop) => {
      const seller = npcById.get(shop.npcId)
      return { ...shop, seller: seller ? { id: seller.id, name: seller.name, portraitUrl: portraitUrl(seller.id, seller.portrait) } : null }
    }),
  }
}

export async function updateRoll20HitPoints(link: typeof roll20CampaignLinks.$inferSelect, updates: Array<{ id: string; currentHp: number; totalHp?: number }>) {
  const npcs = await listNpcs(link.campaignId)
  const updateById = new Map(updates.map((item) => [item.id, item]))
  const changed = npcs.flatMap((npc) => {
    const patch = updateById.get(npc.id)
    if (!patch) return []
    return [{ ...npc, currentHp: patch.currentHp, ...(patch.totalHp === undefined ? {} : { totalHp: patch.totalHp }) }]
  })
  if (changed.length) await saveNpcs(link.campaignId, changed)
  const now = new Date().toISOString()
  await getDb().update(roll20CampaignLinks).set({ lastPushAt: now, updatedAt: now }).where(eq(roll20CampaignLinks.id, link.id))
  return changed.length
}

export async function roll20NpcPortrait(campaignId: string, npcId: string, imageToken: string) {
  const link = await roll20LinkFromImageToken(campaignId, imageToken)
  if (!link) return null
  const npc = (await listNpcs(campaignId)).find((candidate) => candidate.id === npcId)
  if (!npc?.portrait) return null
  const object = await readNpcPortrait(npcId)
  if (object) return { body: object.body, contentType: object.httpMetadata?.contentType || "image/jpeg" }
  if (/^https:\/\//i.test(npc.portrait)) return { redirect: npc.portrait }
  return null
}
