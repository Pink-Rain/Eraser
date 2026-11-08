/**
 * Un message ou un jet de dés du chat (`components/eraser/global-table-chat.tsx`). Gardé dans
 * l'onglet « Journal » du classeur Google « Tabletop » (son nom historique, voir
 * `chatJournalTabs` dans lib/google-sheets.ts) et échangé tel quel entre installations par le
 * salon en direct : aucun nom de champ ne se renomme, `mapId` compris (le salon du message,
 * colonne « ID carte »).
 */
export type ChatActivityKind = "chat" | "dice"

export type ChatActivityRecord = {
  id: string
  /** Le salon : `chat:<campagne>`, `chat:bac-a-sable` ou `chat:general` (lib/campaign-chat.ts). */
  mapId: string
  kind: ChatActivityKind
  authorUid: string
  authorName: string
  text: string
  diceExpression: string
  diceResult: string
  createdAt: string
  audience: "public" | "gm" | "character"
  recipientId: string
  recipientName: string
}
