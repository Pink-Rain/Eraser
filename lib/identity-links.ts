import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { userIdentityLinks } from "@/db/schema"

export async function identityUidsForUser(localUserId: string) {
  const [link] = await getDb()
    .select({ legacyUid: userIdentityLinks.legacyUid })
    .from(userIdentityLinks)
    .where(eq(userIdentityLinks.localUserId, localUserId))
    .limit(1)
  return link?.legacyUid && link.legacyUid !== localUserId
    ? [localUserId, link.legacyUid]
    : [localUserId]
}

export async function preferredIdentityUid(localUserId: string) {
  const identities = await identityUidsForUser(localUserId)
  return identities[1] ?? identities[0]
}

export async function identityMatches(localUserId: string, candidateUid: string) {
  return (await identityUidsForUser(localUserId)).includes(candidateUid)
}

export async function getIdentityLink(localUserId: string) {
  const [link] = await getDb()
    .select()
    .from(userIdentityLinks)
    .where(eq(userIdentityLinks.localUserId, localUserId))
    .limit(1)
  return link ?? null
}

export async function linkLegacyIdentity(localUserId: string, legacyUid: string) {
  const normalized = legacyUid.trim()
  if (!normalized || normalized.length > 200 || normalized === localUserId) throw new Error("INVALID_LEGACY_IDENTITY")
  const now = new Date().toISOString()
  await getDb().insert(userIdentityLinks).values({
    localUserId,
    legacyUid: normalized,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userIdentityLinks.localUserId,
    set: { legacyUid: normalized, updatedAt: now },
  })
  return getIdentityLink(localUserId)
}
