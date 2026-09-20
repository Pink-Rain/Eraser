/**
 * Eraser accounts Worker.
 *
 * Every installed copy of the Eraser Windows app runs its own local server
 * with its own local SQLite file. That is fine for game content (which
 * already lives in shared Google Sheets), but accounts, roles and the
 * Google Drive connection must be the same for every player and every
 * admin, wherever they run the app from. This small standalone Worker is
 * that shared source of truth. It is intentionally separate from the
 * historical Sites Cloudflare Worker (see AGENTS.md: never touch that
 * deployment from the Windows branch).
 *
 * All routes require the `x-eraser-client-key` header (a build-time secret
 * shared by every legitimate Eraser client) in addition to any per-account
 * session bearer token.
 */

export interface Env {
  DB: D1Database
  ERASER_API_KEY: string
  TOKEN_ENCRYPTION_KEY: string
  ADMIN_EMAIL?: string
  ADMIN_SETUP_CODE?: string
}

type Role = "admin" | "mj" | "joueur"
type Status = "en_attente" | "actif" | "suspendu"

type UserRow = {
  id: string
  email: string
  display_name: string
  password_hash: string
  password_salt: string
  role: Role | null
  status: Status
  created_at: string
  updated_at: string
}

const PASSWORD_ITERATIONS = 100_000
const SESSION_DAYS = 365
const AUTHORIZATION_ID = "primary"
const SETTINGS_ID = "primary"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.deployments",
].join(" ")

// ---------- encoding helpers ----------

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function randomToken(length = 32) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return bytesToBase64Url(new Uint8Array(digest))
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

// ---------- passwords ----------

async function derivePassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  )
  return new Uint8Array(bits)
}

async function hashPassword(password: string) {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const hash = await derivePassword(password, salt)
  return { salt: bytesToBase64Url(salt), hash: bytesToBase64Url(hash) }
}

async function passwordMatches(password: string, salt: string, expected: string) {
  const actual = await derivePassword(password, base64UrlToBytes(salt))
  const expectedBytes = base64UrlToBytes(expected)
  if (actual.length !== expectedBytes.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expectedBytes[index]
  return difference === 0
}

// ---------- secret encryption (Google client secret + refresh/access tokens) ----------

async function encryptionKey(env: Env) {
  const bytes = base64UrlToBytes(env.TOKEN_ENCRYPTION_KEY)
  if (bytes.byteLength !== 32) throw new HttpError(500, "INVALID_ENCRYPTION_KEY")
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

async function encryptSecret(env: Env, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), new TextEncoder().encode(value))
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) }
}

async function decryptSecret(env: Env, ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    await encryptionKey(env),
    base64UrlToBytes(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

// ---------- request helpers ----------

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
}

function requireClientKey(request: Request, env: Env) {
  const key = request.headers.get("x-eraser-client-key") || ""
  if (!env.ERASER_API_KEY || !timingSafeEqual(key, env.ERASER_API_KEY)) {
    throw new HttpError(401, "INVALID_CLIENT_KEY")
  }
}

function accountRecord(row: UserRow) {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function bearerAccount(request: Request, env: Env): Promise<UserRow | null> {
  const header = request.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token) return null
  const tokenHash = await sha256(token)
  const now = new Date().toISOString()
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(tokenHash, now)
    .first<UserRow>()
  return row ?? null
}

async function requireAccount(request: Request, env: Env, roles?: Role[]) {
  const account = await bearerAccount(request, env)
  if (!account) throw new HttpError(401, "NOT_AUTHENTICATED")
  if (roles && (!account.role || !roles.includes(account.role))) throw new HttpError(403, "FORBIDDEN")
  return account
}

async function createSession(env: Env, userId: string) {
  const token = randomToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)")
    .bind(tokenHash, userId, expiresAt)
    .run()
  return { token, expiresAt }
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, "INVALID_JSON_BODY")
  }
}

// ---------- accounts ----------

async function handleRegister(request: Request, env: Env) {
  const body = await readJson<{ email?: string; password?: string; displayName?: string; adminCode?: string }>(request)
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  const displayName = body.displayName?.trim() ?? ""
  if (!email || password.length < 8 || displayName.length < 2) throw new HttpError(400, "INVALID_INPUT")

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first()
  if (existing) throw new HttpError(409, "EMAIL_EXISTS")

  const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase()
  const bootstrapAdmin = Boolean(adminEmail) && email === adminEmail && Boolean(env.ADMIN_SETUP_CODE) && body.adminCode === env.ADMIN_SETUP_CODE

  const passwordData = await hashPassword(password)
  const id = crypto.randomUUID()
  const role: Role | null = bootstrapAdmin ? "admin" : null
  const status: Status = bootstrapAdmin ? "actif" : "en_attente"
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, password_salt, role, status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(id, email, displayName, passwordData.hash, passwordData.salt, role, status)
    .run()

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>()
  const session = await createSession(env, id)
  return json({ account: accountRecord(user!), session })
}

async function handleLogin(request: Request, env: Env) {
  const body = await readJson<{ email?: string; password?: string }>(request)
  const email = body.email?.trim().toLowerCase() ?? ""
  const password = body.password ?? ""
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?1").bind(email).first<UserRow>()
  if (!user || !(await passwordMatches(password, user.password_salt, user.password_hash))) {
    throw new HttpError(401, "INVALID_LOGIN_CREDENTIALS")
  }
  const session = await createSession(env, user.id)
  return json({ account: accountRecord(user), session })
}

async function handleSession(request: Request, env: Env) {
  const account = await bearerAccount(request, env)
  if (!account) throw new HttpError(401, "NOT_AUTHENTICATED")
  return json({ account: accountRecord(account) })
}

async function handleLogout(request: Request, env: Env) {
  const header = request.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run()
  return json({ ok: true })
}

async function handleListAccounts(request: Request, env: Env) {
  await requireAccount(request, env, ["admin"])
  const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY created_at ASC").all<UserRow>()
  return json({ accounts: results.map(accountRecord) })
}

async function handleUpdateAccess(request: Request, env: Env, uid: string) {
  await requireAccount(request, env, ["admin"])
  const body = await readJson<{ role?: Role; status?: Status }>(request)
  const role = body.role ?? null
  const status = body.status
  if (!status || (role && !["admin", "mj", "joueur"].includes(role)) || !["en_attente", "actif", "suspendu"].includes(status)) {
    throw new HttpError(400, "INVALID_INPUT")
  }
  const now = new Date().toISOString()
  await env.DB.prepare("UPDATE users SET role = ?1, status = ?2, updated_at = ?3 WHERE id = ?4").bind(role, status, now, uid).run()
  const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(uid).first<UserRow>()
  if (!updated) throw new HttpError(404, "ACCOUNT_NOT_FOUND")
  return json({ account: accountRecord(updated) })
}

async function handleDeleteAccount(request: Request, env: Env, uid: string) {
  const admin = await requireAccount(request, env, ["admin"])
  if (admin.id === uid) throw new HttpError(400, "CANNOT_DELETE_SELF")
  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?1").bind(uid).first<{ id: string }>()
  if (!user) throw new HttpError(404, "ACCOUNT_NOT_FOUND")
  try {
    // sessions cascades; google_drive_authorizations/google_oauth_settings
    // reference users without cascading, so deleting whoever connected
    // Drive or configured OAuth is rejected by that foreign key instead of
    // silently orphaning the shared Drive connection.
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(uid).run()
  } catch {
    throw new HttpError(409, "ACCOUNT_REFERENCED")
  }
  return json({ ok: true })
}

// ---------- Google Drive connection (shared) ----------

async function oauthSettingsRow(env: Env) {
  return env.DB.prepare("SELECT * FROM google_oauth_settings WHERE id = ?1").bind(SETTINGS_ID).first<{
    client_id: string
    client_secret_ciphertext: string | null
    client_secret_iv: string | null
    updated_at: string
  }>()
}

async function handleGetOAuthSettings(request: Request, env: Env) {
  await requireAccount(request, env, ["admin"])
  const settings = await oauthSettingsRow(env)
  return json({
    settings: settings
      ? { clientId: settings.client_id, hasClientSecret: Boolean(settings.client_secret_ciphertext), updatedAt: settings.updated_at }
      : null,
  })
}

async function handleSaveOAuthSettings(request: Request, env: Env) {
  const admin = await requireAccount(request, env, ["admin"])
  const body = await readJson<{ clientId?: string; clientSecret?: string }>(request)
  const clientId = body.clientId?.trim() || ""
  if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new HttpError(400, "INVALID_CLIENT_ID")
  const existing = await oauthSettingsRow(env)
  const secret = body.clientSecret?.trim()
  const encrypted = secret ? await encryptSecret(env, secret) : null
  const clientSecretCiphertext = encrypted?.ciphertext ?? existing?.client_secret_ciphertext ?? null
  const clientSecretIv = encrypted?.iv ?? existing?.client_secret_iv ?? null
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO google_oauth_settings (id, client_id, client_secret_ciphertext, client_secret_iv, configured_by, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, client_secret_ciphertext = excluded.client_secret_ciphertext,
       client_secret_iv = excluded.client_secret_iv, configured_by = excluded.configured_by, updated_at = excluded.updated_at`,
  )
    .bind(SETTINGS_ID, clientId, clientSecretCiphertext, clientSecretIv, admin.id, now)
    .run()
  await env.DB.prepare(
    "UPDATE google_drive_authorizations SET access_token_ciphertext = NULL, access_token_iv = NULL, access_token_expires_at = NULL WHERE id = ?1",
  )
    .bind(AUTHORIZATION_ID)
    .run()
  const settings = await oauthSettingsRow(env)
  return json({
    settings: settings
      ? { clientId: settings.client_id, hasClientSecret: Boolean(settings.client_secret_ciphertext), updatedAt: settings.updated_at }
      : null,
  })
}

async function authorizationRow(env: Env) {
  return env.DB.prepare("SELECT * FROM google_drive_authorizations WHERE id = ?1").bind(AUTHORIZATION_ID).first<{
    google_email: string
    refresh_token_ciphertext: string
    refresh_token_iv: string
    access_token_ciphertext: string | null
    access_token_iv: string | null
    access_token_expires_at: number | null
    scopes: string
    connected_at: string
    updated_at: string
  }>()
}

async function handleGetAuthorization(request: Request, env: Env) {
  await requireAccount(request, env, ["admin"])
  const authorization = await authorizationRow(env)
  return json({
    authorization: authorization
      ? {
          googleEmail: authorization.google_email,
          scopes: authorization.scopes,
          connectedAt: authorization.connected_at,
          updatedAt: authorization.updated_at,
        }
      : null,
  })
}

async function handleOAuthComplete(request: Request, env: Env) {
  const body = await readJson<{
    code?: string
    codeVerifier?: string
    redirectUri?: string
    expectedEmail?: string
    connectedBy?: string
  }>(request)
  if (!body.code || !body.codeVerifier || !body.redirectUri || !body.connectedBy) throw new HttpError(400, "INVALID_INPUT")
  // The desktop OAuth flow opens the system browser (no session cookie reaches this
  // callback), so admin-ness is proven by looking up the uid the local app already
  // authenticated when it started the flow, rather than by a bearer session here.
  const actor = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(body.connectedBy).first<UserRow>()
  if (!actor || actor.role !== "admin") throw new HttpError(403, "FORBIDDEN")

  const settings = await oauthSettingsRow(env)
  if (!settings) throw new HttpError(400, "GOOGLE_OAUTH_NOT_CONFIGURED")
  const clientSecret =
    settings.client_secret_ciphertext && settings.client_secret_iv
      ? await decryptSecret(env, settings.client_secret_ciphertext, settings.client_secret_iv)
      : undefined

  const tokenParameters = new URLSearchParams({
    code: body.code,
    client_id: settings.client_id,
    redirect_uri: body.redirectUri,
    grant_type: "authorization_code",
    code_verifier: body.codeVerifier,
  })
  if (clientSecret) tokenParameters.set("client_secret", clientSecret)
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenParameters,
  })
  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string
    refresh_token?: string
    scope?: string
    error?: string
    error_description?: string
  }
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new HttpError(400, tokenPayload.error_description || tokenPayload.error || "GOOGLE_TOKEN_EXCHANGE_FAILED")
  }
  if (!tokenPayload.refresh_token) throw new HttpError(400, "MISSING_REFRESH_TOKEN")

  const userinfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenPayload.access_token}` },
  })
  const userinfo = (await userinfoResponse.json()) as { email?: string; error?: string }
  if (!userinfoResponse.ok || !userinfo.email) throw new HttpError(400, userinfo.error || "GOOGLE_EMAIL_UNAVAILABLE")
  const googleEmail = userinfo.email.trim().toLowerCase()
  if (body.expectedEmail && googleEmail !== body.expectedEmail.trim().toLowerCase()) {
    throw new HttpError(409, "ACCOUNT_MISMATCH")
  }

  const encrypted = await encryptSecret(env, tokenPayload.refresh_token)
  const now = new Date().toISOString()
  const scopes = tokenPayload.scope || GOOGLE_SCOPES
  await env.DB.prepare(
    `INSERT INTO google_drive_authorizations
       (id, google_email, refresh_token_ciphertext, refresh_token_iv, scopes, connected_by, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET google_email = excluded.google_email,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext, refresh_token_iv = excluded.refresh_token_iv,
       scopes = excluded.scopes, connected_by = excluded.connected_by, updated_at = excluded.updated_at,
       access_token_ciphertext = NULL, access_token_iv = NULL, access_token_expires_at = NULL`,
  )
    .bind(AUTHORIZATION_ID, googleEmail, encrypted.ciphertext, encrypted.iv, scopes, actor.id, now)
    .run()

  return json({ authorization: { googleEmail, scopes, connectedAt: now, updatedAt: now } })
}

async function handleAccessToken(request: Request, env: Env) {
  const account = await requireAccount(request, env)
  if (account.status !== "actif") throw new HttpError(403, "ACCOUNT_NOT_ACTIVE")

  const authorization = await authorizationRow(env)
  if (!authorization) throw new HttpError(404, "GOOGLE_DRIVE_NOT_AUTHORIZED")

  const now = Date.now()
  if (authorization.access_token_ciphertext && authorization.access_token_iv && authorization.access_token_expires_at && authorization.access_token_expires_at > now + 60_000) {
    const token = await decryptSecret(env, authorization.access_token_ciphertext, authorization.access_token_iv)
    return json({ accessToken: token, expiresAt: authorization.access_token_expires_at })
  }

  const settings = await oauthSettingsRow(env)
  if (!settings) throw new HttpError(400, "GOOGLE_OAUTH_NOT_CONFIGURED")
  const clientSecret =
    settings.client_secret_ciphertext && settings.client_secret_iv
      ? await decryptSecret(env, settings.client_secret_ciphertext, settings.client_secret_iv)
      : undefined
  const refreshToken = await decryptSecret(env, authorization.refresh_token_ciphertext, authorization.refresh_token_iv)
  const parameters = new URLSearchParams({ refresh_token: refreshToken, client_id: settings.client_id, grant_type: "refresh_token" })
  if (clientSecret) parameters.set("client_secret", clientSecret)
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: parameters,
  })
  const payload = (await tokenResponse.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!tokenResponse.ok || !payload.access_token) {
    throw new HttpError(400, payload.error_description || payload.error || "GOOGLE_TOKEN_REFRESH_FAILED")
  }
  const expiresAt = now + (payload.expires_in || 3600) * 1000
  const encryptedAccessToken = await encryptSecret(env, payload.access_token)
  await env.DB.prepare(
    "UPDATE google_drive_authorizations SET access_token_ciphertext = ?1, access_token_iv = ?2, access_token_expires_at = ?3 WHERE id = ?4",
  )
    .bind(encryptedAccessToken.ciphertext, encryptedAccessToken.iv, expiresAt, AUTHORIZATION_ID)
    .run()
  return json({ accessToken: payload.access_token, expiresAt })
}

// ---------- router ----------

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    try {
      if (path === "/health") return json({ ok: true })

      requireClientKey(request, env)

      if (method === "POST" && path === "/register") return await handleRegister(request, env)
      if (method === "POST" && path === "/login") return await handleLogin(request, env)
      if (method === "GET" && path === "/session") return await handleSession(request, env)
      if (method === "POST" && path === "/logout") return await handleLogout(request, env)
      if (method === "GET" && path === "/accounts") return await handleListAccounts(request, env)

      const accessMatch = path.match(/^\/accounts\/([^/]+)\/access$/)
      if (method === "POST" && accessMatch) return await handleUpdateAccess(request, env, decodeURIComponent(accessMatch[1]))

      const accountMatch = path.match(/^\/accounts\/([^/]+)$/)
      if (method === "DELETE" && accountMatch) return await handleDeleteAccount(request, env, decodeURIComponent(accountMatch[1]))

      if (method === "GET" && path === "/google/oauth-settings") return await handleGetOAuthSettings(request, env)
      if (method === "POST" && path === "/google/oauth-settings") return await handleSaveOAuthSettings(request, env)
      if (method === "GET" && path === "/google/authorization") return await handleGetAuthorization(request, env)
      if (method === "POST" && path === "/google/oauth/complete") return await handleOAuthComplete(request, env)
      if (method === "GET" && path === "/google/access-token") return await handleAccessToken(request, env)

      return json({ error: "NOT_FOUND" }, 404)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      console.error("eraser_accounts_worker_error", error instanceof Error ? error.stack : error)
      return json({ error: "INTERNAL_ERROR" }, 500)
    }
  },
}

export default worker
