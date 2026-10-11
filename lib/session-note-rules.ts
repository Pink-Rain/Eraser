/**
 * Les notes du journal de session : leurs types, leur nettoyage, qui les lit et qui les
 * modifie, et les chaînes de quêtes. Règles pures : le serveur, les pages et les tests s'en
 * servent (aucun accès à Google ici).
 */

export type SessionNoteType = "resume" | "evenement" | "citation" | "quete" | "pense" | "indice" | "butin" | "rumeur" | "question" | "mj" | "autre"

/** Les types dans l'ordre du journal ; `title` : ce que demande la case de titre, s'il y en a une. */
export const sessionNoteTypes: Array<{ key: SessionNoteType; label: string; many: string; color: string; help: string; title?: string }> = [
  { key: "resume", label: "Résumé", many: "Résumés", color: "#927640", help: "Ce qui s’est passé, en deux ou trois lignes." },
  { key: "evenement", label: "Événement", many: "Événements", color: "#b45309", help: "Un moment de la session, placé dans la frise.", title: "Titre" },
  { key: "citation", label: "Citation", many: "Citations", color: "#7c3aed", help: "Une réplique de la table.", title: "Qui l’a dite" },
  { key: "quete", label: "Quête", many: "Quêtes", color: "#0f766e", help: "Un objectif à suivre. Rattache-le à l’étape d’avant pour faire avancer la quête." },
  { key: "pense", label: "Pense-bête", many: "Pense-bêtes", color: "#2563eb", help: "À ne pas oublier pour la suite." },
  { key: "indice", label: "Indice", many: "Indices", color: "#0891b2", help: "Un élément qui éclaire un mystère." },
  { key: "butin", label: "Butin", many: "Butins", color: "#ca8a04", help: "Ce qui a été trouvé et qui le garde." },
  { key: "rumeur", label: "Rumeur", many: "Rumeurs", color: "#9333ea", help: "Entendu quelque part, pas forcément vrai." },
  { key: "question", label: "Question ouverte", many: "Questions ouvertes", color: "#db2777", help: "Ce que le groupe se demande encore." },
  { key: "mj", label: "Décision du MJ", many: "Décisions du MJ", color: "#b91c1c", help: "Une règle tranchée ou un choix du MJ à retenir." },
  { key: "autre", label: "Autre", many: "Autres", color: "#64748b", help: "Tout ce qui ne rentre dans aucune case." },
]
const typeKeys = new Set<string>(sessionNoteTypes.map((type) => type.key))
export const sessionNoteType = (key: SessionNoteType) => sessionNoteTypes.find((type) => type.key === key) ?? sessionNoteTypes[sessionNoteTypes.length - 1]

/**
 * Un lien d'une note : « character:ID », « npc:ID », « shop:ID », « event:ID » (événement de
 * campagne), « note:ID », ou un nom d'index : « place:Nom », « creature:Nom », « item:Nom ».
 */
export const sessionLinkKinds = ["character", "npc", "place", "creature", "item", "shop", "event", "note"] as const
export type SessionLinkKind = (typeof sessionLinkKinds)[number]
const linkKinds = new Set<string>(sessionLinkKinds)
export function sessionLinkKind(link: string): SessionLinkKind | null {
  const kind = link.slice(0, link.indexOf(":"))
  return linkKinds.has(kind) ? kind as SessionLinkKind : null
}

export type SessionQuest = { done: boolean; doneIn: string; after: string }

export type SessionNote = {
  id: string
  campaignId: string
  sessionId: string
  /** Privée : une note de la fiche d'un personnage, lue par son seul auteur. */
  private: boolean
  characterId: string
  type: SessionNoteType
  title: string
  text: string
  /** Événement : le moment dans la session (« Au crépuscule »), texte libre. */
  moment: string
  links: string[]
  quest: SessionQuest | null
  authorName: string
  authorUid: string
  createdAt: string
  updatedAt: string
}

export type SessionNoteViewer = { uid: string; manager: boolean }

const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : ""
const line = (value: unknown, max: number) => text(value, max * 2).replace(/\s+/g, " ").trim().slice(0, max)

/** Une note propre : champs connus, longueurs bornées, liens dédoublonnés ; `null` si inutilisable. */
export function cleanSessionNote(value: unknown): SessionNote | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const type = typeKeys.has(String(raw.type)) ? raw.type as SessionNoteType : null
  const campaignId = line(raw.campaignId, 120)
  const sessionId = line(raw.sessionId, 120)
  if (!type || !campaignId || !sessionId) return null
  const links = Array.isArray(raw.links)
    ? [...new Set(raw.links.map((link) => line(link, 200)).filter((link) => sessionLinkKind(link) && link.length > link.indexOf(":") + 1))].slice(0, 40)
    : []
  const questRaw = raw.quest && typeof raw.quest === "object" ? raw.quest as Record<string, unknown> : null
  const id = line(raw.id, 80) || crypto.randomUUID()
  return {
    id,
    campaignId,
    sessionId,
    private: raw.private === true,
    characterId: line(raw.characterId, 120),
    type,
    title: line(raw.title, 140),
    text: text(raw.text, 4000).replace(/\r\n/g, "\n").trim(),
    moment: line(raw.moment, 60),
    links: links.filter((link) => link !== `note:${id}`),
    quest: type === "quete" ? { done: questRaw?.done === true, doneIn: line(questRaw?.doneIn, 120), after: line(questRaw?.after, 80) } : null,
    authorName: line(raw.authorName, 80),
    authorUid: line(raw.authorUid, 160),
    createdAt: line(raw.createdAt, 40),
    updatedAt: line(raw.updatedAt, 40),
  }
}

/** Une note publique se lit par toute la table ; une note privée par son seul auteur. */
export function canReadSessionNote(note: Pick<SessionNote, "private" | "authorUid">, viewer: SessionNoteViewer) {
  return !note.private || note.authorUid === viewer.uid
}

/** Chacun modifie ses notes ; le MJ et l'admin modifient aussi les notes publiques des autres. */
export function canEditSessionNote(note: Pick<SessionNote, "private" | "authorUid">, viewer: SessionNoteViewer) {
  return note.authorUid === viewer.uid || (!note.private && viewer.manager)
}

/** Le texte court d'une note (titre, sinon début du texte). */
export function sessionNoteLabel(note: Pick<SessionNote, "title" | "text">, max = 60) {
  const label = (note.title || note.text).replace(/\s+/g, " ").trim()
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

/**
 * Les quêtes en chaînes : une étape sans « après » (ou dont l'étape d'avant a disparu) ouvre
 * une chaîne ; chaque étape suit celle qu'elle continue. Les étapes d'une chaîne sont rangées
 * dans l'ordre des sessions (`sessionOrder`), puis de création.
 */
export function sessionQuestChains(notes: SessionNote[], sessionOrder: string[]) {
  const quests = notes.filter((note) => note.type === "quete" && note.quest)
  const byId = new Map(quests.map((note) => [note.id, note]))
  const rank = new Map(sessionOrder.map((id, index) => [id, index]))
  const rootOf = (note: SessionNote) => {
    let current = note
    const seen = new Set<string>()
    while (current.quest?.after && byId.has(current.quest.after) && !seen.has(current.id)) {
      seen.add(current.id)
      current = byId.get(current.quest.after)!
    }
    return current
  }
  const chains = new Map<string, SessionNote[]>()
  for (const note of quests) {
    const root = rootOf(note)
    chains.set(root.id, [...chains.get(root.id) ?? [], note])
  }
  const order = (note: SessionNote) => rank.get(note.sessionId) ?? Number.MAX_SAFE_INTEGER
  return [...chains.entries()].map(([rootId, steps]) => {
    const sorted = steps.sort((left, right) => order(left) - order(right) || left.createdAt.localeCompare(right.createdAt))
    return { root: byId.get(rootId)!, steps: sorted, done: sorted.every((step) => step.quest?.done) }
  }).sort((left, right) => order(left.root) - order(right.root) || left.root.createdAt.localeCompare(right.root.createdAt))
}

/** « Mon perso » : les notes écrites par ce compte, ou liées à l'un de ses personnages. */
export function isMySessionNote(note: Pick<SessionNote, "authorUid" | "links" | "characterId">, uid: string, characterIds: string[]) {
  return note.authorUid === uid || characterIds.some((id) => note.characterId === id || note.links.includes(`character:${id}`))
}
