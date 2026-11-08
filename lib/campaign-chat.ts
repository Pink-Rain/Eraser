/**
 * Le chat d'Eraser côté serveur : ses canaux (« Général », le bac à sable d'un MJ, les
 * campagnes), qui y lit quoi, et ce qu'une page reçoit en l'ouvrant. Les messages sont gardés
 * dans le journal du chat (`listChatActivities`, `saveChatActivity`, lib/google-sheets.ts) et
 * passent en direct par le salon de la campagne (components/eraser/global-table-chat.tsx).
 */
import type { ChatActivityRecord } from "@/lib/chat-activity"
import { chatAccountsForCampaign, chatAuthorName, listDirectoryAccounts } from "@/lib/chat-accounts"
import { getCampaignDashboard, getCampaignForMj, getCampaignForPlayer, listCampaignMembers, listCharactersForUser, listChatActivities } from "@/lib/google-sheets"
import { identityUidsForUser } from "@/lib/identity-links"
import { listManagedPages, managesCampaigns } from "@/lib/managed-campaigns"
import { ownedBy } from "@/lib/ownership"
import type { AuthorizedUser } from "@/lib/server-auth"

/** Le canal d'une campagne (ou du bac à sable) peut-il être lu par ce compte ? */
async function canReadChannel(account: AuthorizedUser, pageLinked: string) {
  if (pageLinked === "bac-a-sable") return managesCampaigns(account)
  if (account.role === "admin") return Boolean(await getCampaignDashboard(null, pageLinked))
  if (account.role === "mj") return Boolean(await getCampaignForMj(account.uid, pageLinked))
  return Boolean(await getCampaignForPlayer(account.uid, pageLinked))
}

/** Le compte mène-t-il ce canal (il lit alors les messages « MJ seulement ») ? */
async function managesChannel(account: AuthorizedUser, pageLinked: string) {
  if (account.role === "admin") return pageLinked === "bac-a-sable" || Boolean(await getCampaignDashboard(null, pageLinked))
  if (account.role !== "mj") return false
  return pageLinked === "bac-a-sable" || Boolean(await getCampaignForMj(account.uid, pageLinked))
}

/**
 * Destinataires du chat. Pour rester compatibles avec les versions qui ne connaissent que
 * l'audience « character », les messages adressés à un compte et les jets privés gardent cette
 * audience et préfixent l'identifiant : une ancienne version n'y trouve aucun personnage et ne
 * les montre donc qu'à leur auteur.
 */
export const accountRecipientPrefix = "account:"
export const privateRecipientPrefix = "self:"

function canSeeActivity(identities: string[], activity: ChatActivityRecord, ownedCharacterIds: Set<string>, isManager: boolean) {
  if (activity.audience === "public" || identities.includes(activity.authorUid)) return true
  if (activity.audience === "gm") return isManager
  if (activity.recipientId.startsWith(privateRecipientPrefix)) return false
  if (activity.recipientId.startsWith(accountRecipientPrefix)) return identities.includes(activity.recipientId.slice(accountRecipientPrefix.length))
  return ownedCharacterIds.has(activity.recipientId)
}

/** Le salon d'un canal, tel qu'il est écrit dans le journal (colonne « ID carte »). */
export function chatRoomId(pageLinked: string) {
  return `chat:${pageLinked}`
}

/** Le canal sans campagne : ouvert à tous les comptes, choisi d'office à l'ouverture d'Eraser. */
export const GENERAL_CHAT_ID = "general"
export const GENERAL_CHAT_NAME = "Général"

/** Les canaux du chat d'un compte : « Général » d'abord, puis ses campagnes (et le bac à sable d'un MJ). */
export async function listChatCampaignsForAccount(account: AuthorizedUser) {
  const general = { id: GENERAL_CHAT_ID, name: GENERAL_CHAT_NAME }
  if (managesCampaigns(account)) return [general, ...await listManagedPages(account)]
  const characters = await listCharactersForUser(account.uid)
  const seen = new Map<string, string>()
  for (const character of characters) for (const campaign of character.campaigns) seen.set(campaign.id, campaign.name)
  return [general, ...[...seen.entries()].map(([id, name]) => ({ id, name }))]
}

/** Ce que reçoit le chat en ouvrant un canal : ses messages visibles, ses membres et destinataires. */
export async function getChatBootstrapForAccount(account: AuthorizedUser, pageLinked: string) {
  const general = pageLinked === GENERAL_CHAT_ID
  if (!general && !await canReadChannel(account, pageLinked)) return null
  const roomId = chatRoomId(pageLinked)
  const [allActivities, members, isManager, identities] = await Promise.all([
    listChatActivities(roomId),
    general || pageLinked === "bac-a-sable" ? Promise.resolve([]) : listCampaignMembers(pageLinked),
    // Dans « Général », les messages « MJ seulement » vont aux MJ et administrateurs.
    general ? Promise.resolve(managesCampaigns(account)) : managesChannel(account, pageLinked),
    identityUidsForUser(account.uid),
  ])
  const ownedCharacterIds = new Set(members.filter((member) => ownedBy(member.ownerUid, identities)).map((member) => member.id))
  const activities = allActivities.filter((activity) => canSeeActivity(identities, activity, ownedCharacterIds, isManager))
  // « Général » : tous les comptes de l'annuaire peuvent recevoir un message (/joueur).
  const accounts = general
    ? await listDirectoryAccounts(account).then((directory) => [{ uid: account.uid, name: chatAuthorName(account) }, ...directory.map((entry) => ({ uid: entry.uid, name: entry.name }))]).catch(() => [])
    : await chatAccountsForCampaign(account, pageLinked).catch(() => [])
  return {
    roomId,
    activities,
    members: members.map((member) => ({ id: member.id, name: member.name, ownerUid: member.ownerUid })),
    accounts,
    me: { uid: account.uid, name: chatAuthorName(account) },
    canManage: isManager,
  }
}
