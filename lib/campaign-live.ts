import { cleanSessionNote, type SessionNote } from "@/lib/session-note-rules"

/**
 * Ce qui change dans une campagne et que la table doit voir tout de suite : une note de
 * session écrite, modifiée ou supprimée, une session que le MJ modifie (ce qu'il révèle ou
 * cache, un PNJ ajouté…). Rien n'est relu dans Google pour le dire : le message part dans le
 * salon en direct du chat de la campagne (components/eraser/global-table-chat.tsx), déjà
 * ouvert sur ses pages, et chaque page ouverte s'en sert.
 *
 * Seule une note publique voyage (les joueurs la lisent de toute façon) ; une session ne
 * voyage que par son identifiant : chaque page relit ce que son lecteur a le droit de voir.
 */
export type CampaignLiveMessage =
  | { kind: "note"; note: SessionNote }
  | { kind: "note-deleted"; noteId: string }
  | { kind: "session"; sessionId: string }

export type CampaignLiveEnvelope = { campaignId: string; message: CampaignLiveMessage }

/** Vers le salon en direct (le chat l'écoute et l'envoie aux autres). */
export const CAMPAIGN_LIVE_OUT_EVENT = "eraser:campaign-live-out"
/** Depuis le salon en direct : un autre compte a changé quelque chose. */
const CAMPAIGN_LIVE_IN_EVENT = "eraser:campaign-live"

const id = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 160 ? value : ""

/** Un message reçu d'un pair, vérifié : `null` s'il n'est pas utilisable. */
export function campaignLiveFromPayload(value: unknown): CampaignLiveEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as { campaignId?: unknown; message?: unknown }
  const campaignId = id(raw.campaignId)
  const message = raw.message && typeof raw.message === "object" ? raw.message as Record<string, unknown> : null
  if (!campaignId || !message) return null
  if (message.kind === "note") {
    const note = cleanSessionNote(message.note)
    // Une note d'une autre campagne, ou privée, n'a rien à faire ici.
    return note && !note.private && note.campaignId === campaignId && note.authorUid ? { campaignId, message: { kind: "note", note } } : null
  }
  if (message.kind === "note-deleted" && id(message.noteId)) return { campaignId, message: { kind: "note-deleted", noteId: id(message.noteId) } }
  if (message.kind === "session" && id(message.sessionId)) return { campaignId, message: { kind: "session", sessionId: id(message.sessionId) } }
  return null
}

/** Prévient la table d'un changement que ce compte vient d'enregistrer. */
export function announceCampaignChange(campaignId: string, message: CampaignLiveMessage) {
  if (typeof window === "undefined" || !campaignId) return
  if (message.kind === "note" && message.note.private) return
  window.dispatchEvent(new CustomEvent<CampaignLiveEnvelope>(CAMPAIGN_LIVE_OUT_EVENT, { detail: { campaignId, message } }))
}

/** Le chat transmet à la page ce qu'un pair a annoncé. */
export function receiveCampaignChange(envelope: CampaignLiveEnvelope) {
  window.dispatchEvent(new CustomEvent<CampaignLiveEnvelope>(CAMPAIGN_LIVE_IN_EVENT, { detail: envelope }))
}

/** Écoute les changements annoncés par les autres pour une campagne ; rend de quoi arrêter. */
export function onCampaignChange(campaignId: string, handler: (message: CampaignLiveMessage) => void) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<CampaignLiveEnvelope>).detail
    if (detail?.campaignId === campaignId) handler(detail.message)
  }
  window.addEventListener(CAMPAIGN_LIVE_IN_EVENT, listener)
  return () => window.removeEventListener(CAMPAIGN_LIVE_IN_EVENT, listener)
}

/** Une note reçue (ou modifiée) dans une liste : remplacée si elle y est, ajoutée sinon. */
export function upsertSessionNote(notes: SessionNote[], note: SessionNote) {
  const at = notes.findIndex((entry) => entry.id === note.id)
  if (at < 0) return [...notes, note].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  // Une copie plus ancienne qui arrive après la nouvelle ne la remplace pas.
  if (notes[at].updatedAt > note.updatedAt) return notes
  return notes.map((entry, position) => position === at ? note : entry)
}
