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

// Les liens changent rarement (une réattribution) : la copie lue reste fraîche 5 minutes,
// puis elle est servie tout de suite pendant qu'une relecture se fait en arrière-plan
// (au plus 24 heures). Chaque clic n'attend donc plus le serveur de comptes.
const FRESH_MS = 5 * 60_000
const STALE_MS = 24 * 3_600_000
let remoteLinksCache: { loadedAt: number; links: Promise<IdentityLink[]> } | null = null
let lastGood: { at: number; links: IdentityLink[] } | null = null
let refreshing: Promise<void> | null = null
// Change à chaque écriture : une relecture partie avant ne remplace pas ce qui vient d'être écrit.
let generation = 0

function remote() {
  return remoteAccountsConfig(env)
}

async function fetchRemoteLinks(config: NonNullable<ReturnType<typeof remote>>, token: string | undefined) {
  const response = await remoteAccountsFetch(config, "/identity-links", { method: "GET", token })
  return (response as { links: IdentityLink[] }).links
}

async function remoteLinks(): Promise<IdentityLink[]> {
  const config = remote()
  if (!config) return []
  if (remoteLinksCache && Date.now() - remoteLinksCache.loadedAt < FRESH_MS) return remoteLinksCache.links
  // Le jeton est lu pendant la requête : une relecture en arrière-plan ne peut plus le lire.
  const token = await currentAuthToken().catch(() => undefined)
  const started = generation
  if (lastGood && Date.now() - lastGood.at < STALE_MS) {
    refreshing ??= fetchRemoteLinks(config, token)
      .then((links) => { if (started !== generation) return; lastGood = { at: Date.now(), links }; remoteLinksCache = { loadedAt: Date.now(), links: Promise.resolve(links) } })
      .catch((error) => { console.error("IDENTITY_LINKS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR") })
      .finally(() => { refreshing = null })
    return lastGood.links
  }
  const links: Promise<IdentityLink[]> = fetchRemoteLinks(config, token)
    .then((value) => { if (started === generation) lastGood = { at: Date.now(), links: value }; return value })
    .catch((error) => {
      if (remoteLinksCache?.links === links) remoteLinksCache = null
      console.error("IDENTITY_LINKS_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
      return [] as IdentityLink[]
    })
  remoteLinksCache = { loadedAt: Date.now(), links }
  return links
}

export async function identityUidsForUser(localUserId: string) {
  const legacyUid = (await getIdentityLink(localUserId))?.legacyUid
  return legacyUid && legacyUid !== localUserId ? [localUserId, legacyUid] : [localUserId]
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
    // Le lien écrit est visible aussitôt : la prochaine lecture repart du serveur.
    generation += 1
    remoteLinksCache = null
    lastGood = null
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

/** Tous les liens connus : sert à retrouver le compte derrière un identifiant historique. */
export async function listIdentityLinks(): Promise<Array<{ localUserId: string; legacyUid: string }>> {
  if (remote()) return remoteLinks()
  return getDb().select({ localUserId: userIdentityLinks.localUserId, legacyUid: userIdentityLinks.legacyUid }).from(userIdentityLinks)
}
