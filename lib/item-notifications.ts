import { chatAuthorName } from "@/lib/chat-accounts"
import { getCampaignDashboard, getCharacterById, getNpcById, type InventoryTransferMoved } from "@/lib/google-sheets"
import { listIdentityLinks } from "@/lib/identity-links"
import type { AuthorizedUser } from "@/lib/server-auth"
import { deleteSharedRecord, listSharedRecords, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { ownersOf } from "@/lib/ownership"

/**
 * « X vous a envoyé Y ». Chaque installation a son propre serveur : la notification
 * passe donc par le serveur partagé (une portée par compte destinataire), que l'app du
 * destinataire relève régulièrement puis efface. Sans serveur partagé, rien n'est envoyé :
 * l'objet arrive quand même, seule l'alerte manque.
 */
export type ItemNotification = {
  id: string
  senderName: string
  itemName: string
  quantity: number
  /** Personnage, PNJ ou inventaire de campagne qui a reçu l'objet. */
  targetId: string
  /** « Reçu par Lina », « Rangé dans l’inventaire de La Couronne ». */
  targetLabel: string
  /** Un personnage n'est prévenu qu'à l'ouverture de sa fiche ; PNJ et campagne, tout de suite. */
  targetKind: "character" | "npc" | "campaign" | ""
  /** La case où l'objet est arrivé, pour sa pastille. */
  slotId: string
  createdAt: string
}

const scopeFor = (uid: string) => `notifications:${uid}`
// Une notification jamais relevée (app fermée des semaines) n'a plus d'intérêt.
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

async function accountUid(uid: string) {
  const links = await listIdentityLinks().catch(() => [])
  return links.find((link) => link.legacyUid === uid)?.localUserId ?? uid
}

/** Le compte qui doit être prévenu, et le nom de ce qui a reçu l'objet. */
async function recipientOf(moved: InventoryTransferMoved) {
  const campaignId = moved.targetId.startsWith("CAMPAGNE:") ? moved.targetId.slice("CAMPAGNE:".length) : ""
  if (campaignId) {
    const campaign = await getCampaignDashboard(null, campaignId).catch(() => null)
    return campaign?.mjUid ? { uid: campaign.mjUid, label: `Rangé dans l’inventaire de ${campaign.name}` } : null
  }
  if (moved.targetMode === "npc") {
    const npc = await getNpcById(moved.targetId).catch(() => null)
    if (!npc || npc.pageLinked === "bac-a-sable") return null
    const campaign = await getCampaignDashboard(null, npc.pageLinked).catch(() => null)
    return campaign?.mjUid ? { uid: campaign.mjUid, label: `Reçu par ${npc.name}` } : null
  }
  const character = await getCharacterById(moved.targetId).catch(() => null)
  return character?.ownerUid ? { uid: character.ownerUid, label: `Reçu par ${character.name}` } : null
}

/** Ne fait jamais échouer le transfert : au pire, l'alerte ne part pas. */
export async function notifyItemReceived(sender: AuthorizedUser, moved: InventoryTransferMoved) {
  if (!sharedStoreAvailable() || !moved.name) return
  try {
    const recipient = await recipientOf(moved)
    if (!recipient) return
    const targetKind = moved.targetId.startsWith("CAMPAGNE:") ? "campaign" : moved.targetMode === "npc" ? "npc" : "character"
    // Plusieurs propriétaires (ou MJ) : chacun est prévenu.
    const uids = [...new Set(await Promise.all(ownersOf(recipient.uid).map(accountUid)))]
    for (const uid of uids) {
      // Un objet envoyé à l'un de ses propres personnages est annoncé aussi, à l'ouverture de sa fiche.
      if (!uid || (uid === sender.uid && targetKind !== "character")) continue
      const notification: ItemNotification = {
        id: crypto.randomUUID(),
        senderName: chatAuthorName(sender),
        itemName: moved.name,
        quantity: Math.max(1, moved.quantity),
        targetId: moved.targetId,
        targetLabel: recipient.label,
        targetKind,
        slotId: moved.slotId ?? "",
        createdAt: new Date().toISOString(),
      }
      await writeSharedRecord(scopeFor(uid), notification.id, JSON.stringify(notification))
    }
  } catch {
    // Le serveur partagé est injoignable : l'objet a bien changé de sac.
  }
}

/**
 * Lance un transfert et prévient le destinataire une fois l'objet arrivé. La notification
 * est attendue (le contexte de la requête, et donc la session, doit encore exister) mais
 * ne peut pas faire échouer le transfert.
 */
export async function transferWithNotification<T>(sender: AuthorizedUser, run: (onMoved: (moved: InventoryTransferMoved) => void) => Promise<T>) {
  let moved: InventoryTransferMoved | undefined
  const result = await run((value) => { moved = value })
  if (moved) await notifyItemReceived(sender, moved)
  return result
}

function parse(value: string): ItemNotification | null {
  try {
    const parsed = JSON.parse(value) as Partial<ItemNotification>
    if (typeof parsed.id !== "string" || typeof parsed.itemName !== "string") return null
    return {
      id: parsed.id,
      senderName: typeof parsed.senderName === "string" ? parsed.senderName : "Quelqu’un",
      itemName: parsed.itemName,
      quantity: typeof parsed.quantity === "number" ? parsed.quantity : 1,
      targetId: typeof parsed.targetId === "string" ? parsed.targetId : "",
      targetLabel: typeof parsed.targetLabel === "string" ? parsed.targetLabel : "",
      targetKind: parsed.targetKind === "character" || parsed.targetKind === "npc" || parsed.targetKind === "campaign" ? parsed.targetKind : "",
      slotId: typeof parsed.slotId === "string" ? parsed.slotId : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    }
  } catch {
    return null
  }
}

/**
 * Relève des notifications du compte et efface celles rendues : chacune n'est montrée
 * qu'une fois. Sans `targetId` : tout sauf les objets reçus par un personnage, qui
 * attendent l'ouverture de sa fiche (même reçus hors ligne, en vue MJ ou sur un autre
 * personnage). Avec `targetId` : celles de ce personnage seulement.
 */
export async function takeItemNotifications(uid: string, targetId = "") {
  if (!sharedStoreAvailable()) return []
  const scope = scopeFor(uid)
  const records = await listSharedRecords(scope).catch(() => [])
  if (!records.length) return []
  const now = Date.now()
  const parsed = records.map((record) => ({ record, notification: parse(record.value) }))
  const expired = parsed.filter(({ notification }) => !notification || now - Date.parse(notification.createdAt || "0") >= MAX_AGE_MS)
  const wanted = parsed.filter(({ notification }) => notification && now - Date.parse(notification.createdAt || "0") < MAX_AGE_MS
    && (targetId ? notification.targetKind === "character" && notification.targetId === targetId : notification.targetKind !== "character"))
  await Promise.all([...expired, ...wanted].map(({ record }) => deleteSharedRecord(scope, record.key).catch(() => undefined)))
  return wanted
    .map(({ notification }) => notification as ItemNotification)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}
