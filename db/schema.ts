import { sql } from "drizzle-orm"
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    role: text("role", { enum: ["admin", "mj", "joueur"] }),
    status: text("status", { enum: ["en_attente", "actif", "suspendu"] })
      .notNull()
      .default("en_attente"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("users_status_idx").on(table.status)],
)

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
)

export const driveConnections = sqliteTable("drive_connections", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull(),
  folderName: text("folder_name").notNull(),
  folderUrl: text("folder_url").notNull(),
  connectedBy: text("connected_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  connectedAt: text("connected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const googleDriveAuthorizations = sqliteTable("google_drive_authorizations", {
  id: text("id").primaryKey(),
  googleEmail: text("google_email").notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  refreshTokenIv: text("refresh_token_iv").notNull(),
  accessTokenCiphertext: text("access_token_ciphertext"),
  accessTokenIv: text("access_token_iv"),
  accessTokenExpiresAt: integer("access_token_expires_at"),
  scopes: text("scopes").notNull(),
  connectedBy: text("connected_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  connectedAt: text("connected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const googleOAuthSettings = sqliteTable("google_oauth_settings", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  clientSecretCiphertext: text("client_secret_ciphertext"),
  clientSecretIv: text("client_secret_iv"),
  configuredBy: text("configured_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  configuredAt: text("configured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const googleOAuthFlows = sqliteTable("google_oauth_flows", {
  state: text("state").primaryKey(),
  googleEmail: text("google_email").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  // Not a foreign key to `users`: when accounts live in the shared
  // eraser-accounts Worker (see lib/accounts-remote.ts), this uid comes from
  // that remote table and the local `users` table stays empty, so a local FK
  // reference would always fail to insert.
  connectedBy: text("connected_by").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const userIdentityLinks = sqliteTable(
  "user_identity_links",
  {
    // Not a foreign key to `users`, for the same reason as
    // googleOAuthFlows.connectedBy above.
    localUserId: text("local_user_id").primaryKey(),
    legacyUid: text("legacy_uid").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("user_identity_links_legacy_uid_unique").on(table.legacyUid)],
)

export const jdrGoogleSheets = sqliteTable("jdr_google_sheets", {
  key: text("key", { enum: ["classes", "characters", "campaigns", "campaign_characters", "character_relations", "admin_todos", "inventory", "shops", "npcs", "tabletop", "vocabulary", "creatures", "places", "religions", "peoples", "languages", "sessions"] }).primaryKey(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  name: text("name").notNull(),
  tabName: text("tab_name").notNull(),
  webViewLink: text("web_view_link").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const characterIndex = sqliteTable(
  "character_index",
  {
    id: text("id").primaryKey(),
    ownerUid: text("owner_uid").notNull(),
    name: text("name").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("character_index_owner_uid_idx").on(table.ownerUid)],
)

export const campaignIndex = sqliteTable(
  "campaign_index",
  {
    id: text("id").primaryKey(),
    mjUid: text("mj_uid").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    bannerUrl: text("banner_url").notNull().default(""),
    accentColor: text("accent_color").notNull().default("#927640"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("campaign_index_mj_uid_idx").on(table.mjUid)],
)

export const campaignCharacters = sqliteTable(
  "campaign_characters",
  {
    campaignId: text("campaign_id").notNull(),
    characterId: text("character_id").notNull(),
    addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.characterId] }),
    index("campaign_characters_character_idx").on(table.characterId),
  ],
)

export const roll20CampaignLinks = sqliteTable(
  "roll20_campaign_links",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().unique(),
    mjUid: text("mj_uid").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    imageToken: text("image_token").notNull().unique(),
    roll20GameId: text("roll20_game_id").notNull().default(""),
    roll20GameName: text("roll20_game_name").notNull().default(""),
    lastPullAt: text("last_pull_at"),
    lastPushAt: text("last_push_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("roll20_campaign_links_mj_uid_idx").on(table.mjUid),
  ],
)

export const classIndex = sqliteTable("class_index", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  image: text("image").notNull().default(""),
  keywordsJson: text("keywords_json").notNull().default("[]"),
  difficulty: text("difficulty").notNull().default("X"),
  completion: integer("completion").notNull().default(0),
  accentDark: text("accent_dark").notNull().default(""),
  accentLight: text("accent_light").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const sheetIndexSyncs = sqliteTable("sheet_index_syncs", {
  key: text("key").primaryKey(),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const adminTodos = sqliteTable(
  "admin_todos",
  {
    id: text("id").primaryKey(),
    creatorUid: text("creator_uid").notNull(),
    creatorName: text("creator_name").notNull(),
    name: text("name").notNull().default(""),
    content: text("content").notNull(),
    priority: text("priority", { enum: ["haute", "moyenne", "basse"] }).notNull().default("moyenne"),
    label: text("label").notNull().default(""),
    labelColor: text("label_color").notNull().default("#927640"),
    completed: text("completed").notNull().default("non"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("admin_todos_deleted_at_idx").on(table.deletedAt)],
)

export const googleAppsScriptIntegrations = sqliteTable("google_apps_script_integrations", {
  key: text("key", { enum: ["class_images"] }).primaryKey(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  scriptId: text("script_id").notNull(),
  deploymentId: text("deployment_id"),
  lastError: text("last_error"),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})
