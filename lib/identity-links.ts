import { eq } from "drizzle-orm"
import { env } from "cloudflare:workers"

import { getDb } from "@/db"
import { userIdentityLinks } from "@/db/schema"
import { remoteAccountsConfig, remoteAccountsFetch } from "@/lib/accounts-remote"
import { currentAuthToken } from "@/lib/server-auth"

// Un lien d'identité dit « ce compte est la même personne que cet identifiant
// historique présent dans Google Sheets ». C'est une information de compte :
// stockée localement, une réattribution faite sur un ordinateur restait
// invisible depuis tous les autres. Elle vit donc sur le serveur de comptes
// partagé, comme les comptes et les rôles.
type IdentityLink = { localUserId: string; legacyUid: string; updatedAt: string }

const REMOTE_LINKS_TTL_MS = 30_000
let remoteLinksCache: { expiresAt: number; links: Promise<IdentityLink[]> } | null = null

function remote() {
  return remoteAccountsConfig(env)
}

async function remoteLinks(): Promise<IdentityLink[]> {
  const config = remote()
  if (!config) return []
  if (remoteLinksCache && remoteLinksCache.expiresAt > Date.now()) return remoteLinksCache.links
  const links = (async () => {
    const token = await currentAuthToken().catch(() => undefined)
    const response = await remoteAccountsFetch(config, "/identity-links", { method: "GET", token })
    return (response as { links: IdentityLink[] }).links
  })().catch((error) => {
    remoteLinksCache = null
    console.error("IDENTITY_LINKS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return [] as IdentityLink[]
  })
  remoteLinksCache = { expiresAt: Date.now() + REMOTE_LINKS_TTL_MS, links }
  return links
}

export async function identityUidsForUser(localUserId: string) {
  const legacyUid = (await getIdentityLink(localUserId))?.legacyUid
  return legacyUid && legacyUid !== localUserId ? [localUserId, legacyUid] : [localUserId]
}

export async function identityMatches(localUserId: string, candidateUid: string) {
  return (await identityUidsForUser(localUserId)).includes(candidateUid)
}

export async function getIdentityLink(localUserId: string) {
  if (remote()) {
    return (await remoteLinks()).find((link) => link.localUserId === localUserId) ?? null
  }
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
  const config = remote()
  if (config) {
    const token = await currentAuthToken().catch(() => undefined)
    const response = await remoteAccountsFetch(config, "/identity-links", {
      method: "POST",
      token,
      body: { localUserId, legacyUid: normalized },
    })
    remoteLinksCache = null
    return (response as { link: IdentityLink }).link
  }
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
