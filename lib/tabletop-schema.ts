export type TabletopMapRecord = {
  id: string
  pageLinked: string
  name: string
  backgroundUrl: string
  width: number
  height: number
  gridSize: number
  distancePerGrid: number
  distanceUnit: string
  folder: string
  roomKey: string
  createdByUid: string
  createdAt: string
  updatedAt: string
}

export type TabletopFolderRecord = {
  id: string
  pageLinked: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type TabletopTokenRecord = {
  id: string
  mapId: string
  entityKind: "npc" | "character" | "shop" | "marker"
  entityId: string
  x: number
  y: number
  createdAt: string
  updatedAt: string
  label: string
  icon: string
  scale: number
  iconScale: number
  color: string
}

export type TabletopActivityKind = "chat" | "dice"

export type TabletopActivityRecord = {
  id: string
  mapId: string
  kind: TabletopActivityKind
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

export type TabletopEntityRecord = {
  id: string
  kind: "npc" | "character" | "shop" | "marker"
  name: string
  subtitle: string
  portrait: string
  currentHp: number
  totalHp: number
  speed: number
  ownerUid: string
  controllable?: boolean
  shopKey?: "market" | "bookshop" | "antique" | "armory" | "black-market" | "alchemist" | "tavern"
  shopSize?: string
  shopCity?: string
  linkedNpcId?: string
  linkedNpcName?: string
}

export type TabletopShopDetail = {
  id: string
  key: NonNullable<TabletopEntityRecord["shopKey"]>
  name: string
  size: string
  cityName: string
  linkedNpcName: string
  portrait: string
  items: Array<{
    id: string
    name: string
    description: string
    effect: string
    type: string
    subtype: string
    price: string
    icon: string
    rarity: "very-common" | "common" | "rare" | "very-rare" | "ultimate"
  }>
}

export type TabletopNpcDetail = {
  id: string
  name: string
  classOrJob: string
  portrait: string
  currentHp: number
  totalHp: number
  speed: number
  people: string
  gender: string
  age: string
  height: string
  weight: string
  description: string
  other: string
  stats: Array<{ label: string; short: string; value: number }>
  inventory: Array<{ id: string; name: string; quantity: number; notes: string }>
  canViewPrivate: boolean
}

export type TabletopSnapshot = {
  map: TabletopMapRecord
  tokens: TabletopTokenRecord[]
  activities: TabletopActivityRecord[]
  entities: TabletopEntityRecord[]
}

export type TabletopSourcePage = { id: string; name: string }
