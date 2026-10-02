import { listIdentityLinks } from "@/lib/identity-links"
import { getCampaignDashboard, listCampaignMembers } from "@/lib/google-sheets"
import { currentAuthToken, type AuthorizedUser } from "@/lib/server-auth"
import { listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import type { SiteRole } from "@/lib/auth-types"
import { listAccounts } from "@/lib/site-auth"

export type ChatAccount = { uid: string; name: string }

// Le serveur de comptes ne donne la liste des comptes qu'aux MJ et administrateurs.
// Pour que les joueurs voient aussi les noms dans /joueur et /rjoueur, chaque compte
// qui ouvre le chat publie son nom dans cet annuaire partagé (et un MJ y complète
// ceux des joueurs de sa campagne).
const NAME_SCOPE = "account-names"

async function knownNames(account: AuthorizedUser) {
  const names = new Map<string, string>()
  const shared = sharedStoreAvailable() ? await listSharedRecords(NAME_SCOPE).catch(() => []) : []
  for (const record of shared) if (record.value.trim()) names.set(record.key, record.value.trim())
  const publishedNames = new Map(names)
  // Sans serveur partagé, la liste locale est lisible par tous ; sinon seulement par un MJ.
  if (!sharedStoreAvailable() || account.accountRole === "admin" || account.accountRole === "mj") {
    const accounts = await listAccounts(await currentAuthToken().catch(() => undefined)).catch(() => [])
    for (const candidate of accounts) if (candidate.status === "actif" && candidate.displayName.trim()) names.set(candidate.uid, candidate.displayName.trim())
  }
  if (account.displayName.trim()) names.set(account.uid, account.displayName.trim())
  return { names, publishedNames }
}

/** Les comptes d'une campagne : son MJ et les propriétaires de ses personnages. */
export async function chatAccountsForCampaign(account: AuthorizedUser, pageLinked: string): Promise<ChatAccount[]> {
  const [{ names, publishedNames }, links, members, campaign] = await Promise.all([
    knownNames(account),
    listIdentityLinks().catch(() => []),
    pageLinked === "bac-a-sable" ? Promise.resolve([]) : listCampaignMembers(pageLinked).catch(() => []),
    pageLinked === "bac-a-sable" ? Promise.resolve(null) : getCampaignDashboard(null, pageLinked).catch(() => null),
  ])
  const localUid = new Map(links.map((link) => [link.legacyUid, link.localUserId]))
  const accountUid = (uid: string) => localUid.get(uid) ?? uid
  const relevant = new Set<string>([account.uid])
  if (campaign?.mjUid) relevant.add(accountUid(campaign.mjUid))
  for (const member of members) if (member.ownerUid) relevant.add(accountUid(member.ownerUid))

  if (sharedStoreAvailable()) {
    const missing = [...relevant].filter((uid) => names.has(uid) && publishedNames.get(uid) !== names.get(uid)).slice(0, 20)
    await Promise.all(missing.map((uid) => writeSharedRecord(NAME_SCOPE, uid, names.get(uid) || "").catch(() => undefined)))
  }
  return [...relevant].flatMap((uid) => names.has(uid) ? [{ uid, name: names.get(uid) as string }] : [])
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

/** Le nom affiché dans le chat : celui du compte, où qu'on écrive. */
export function chatAuthorName(account: AuthorizedUser) {
  return account.displayName.trim() || account.email.split("@")[0] || "Joueur"
}

export type DirectoryAccount = { uid: string; name: string; role: SiteRole | null }

/**
 * Les comptes visibles à l'accueil (les autres que soi). Un MJ ou un administrateur lit
 * la liste du serveur de comptes (comptes actifs, avec leur rôle) et complète l'annuaire
 * partagé ; un joueur lit l'annuaire partagé, où chaque compte publie son nom en ouvrant
 * l'accueil ou le chat. Aucune adresse e-mail n'en sort.
 */
export async function listDirectoryAccounts(account: AuthorizedUser): Promise<DirectoryAccount[]> {
  const shared = sharedStoreAvailable() ? await listSharedRecords(NAME_SCOPE).catch(() => []) : []
  const published = new Map(shared.filter((record) => record.value.trim()).map((record) => [record.key, record.value.trim()]))
  const directory = new Map<string, DirectoryAccount>()
  for (const [uid, name] of published) directory.set(uid, { uid, name, role: null })
  if (!sharedStoreAvailable() || account.accountRole === "admin" || account.accountRole === "mj") {
    const accounts = await listAccounts(await currentAuthToken().catch(() => undefined)).catch(() => null)
    if (accounts) {
      // La liste du serveur fait foi : un compte désactivé ou supprimé disparaît.
      directory.clear()
      for (const candidate of accounts) if (candidate.status === "actif") directory.set(candidate.uid, { uid: candidate.uid, name: candidate.displayName.trim() || candidate.email.split("@")[0] || "Compte", role: candidate.role })
    }
  }
  if (sharedStoreAvailable()) {
    const own = chatAuthorName(account)
    const missing = [...directory.values()].filter((entry) => entry.role && published.get(entry.uid) !== entry.name).slice(0, 30)
    const writes = missing.map((entry) => writeSharedRecord(NAME_SCOPE, entry.uid, entry.name).catch(() => undefined))
    if (published.get(account.uid) !== own) writes.push(writeSharedRecord(NAME_SCOPE, account.uid, own).catch(() => undefined))
    await Promise.all(writes)
  }
  directory.delete(account.uid)
  return [...directory.values()].sort((left, right) => left.name.localeCompare(right.name, "fr"))
}
