import { eq, lt } from "drizzle-orm"
import { env } from "cloudflare:workers"

import { getDb } from "@/db"
import { googleDriveAuthorizations, googleOAuthFlows, googleOAuthSettings } from "@/db/schema"
import { remoteAccountsConfig, remoteAccountsFetch } from "@/lib/accounts-remote"
import { currentAuthToken } from "@/lib/server-auth"

const AUTHORIZATION_ID = "primary"
const SETTINGS_ID = "primary"
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.deployments",
]

const APPS_SCRIPT_SCOPES = [
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.deployments",
]

type RuntimeEnv = Record<string, string | undefined>
type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null
let accessTokenPromise: Promise<string> | null = null

function runtimeEnv() {
  return env as unknown as RuntimeEnv
}

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

async function encryptionKey() {
  const encoded = runtimeEnv().GOOGLE_TOKEN_ENCRYPTION_KEY
  if (!encoded) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED")
  const bytes = base64UrlToBytes(encoded)
  if (bytes.byteLength !== 32) throw new Error("GOOGLE_OAUTH_INVALID_ENCRYPTION_KEY")
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  )
  return {
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  }
}

async function decryptSecret(ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    await encryptionKey(),
    base64UrlToBytes(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

async function getGoogleOAuthSettingsWithSecret() {
  const [settings] = await getDb()
    .select()
    .from(googleOAuthSettings)
    .where(eq(googleOAuthSettings.id, SETTINGS_ID))
    .limit(1)
  return settings ?? null
}

async function oauthConfig(redirectUri: string) {
  const values = runtimeEnv()
  const stored = values.GOOGLE_OAUTH_CLIENT_ID ? null : await getGoogleOAuthSettingsWithSecret()
  const clientId = values.GOOGLE_OAUTH_CLIENT_ID || stored?.clientId
  const encryptedSecret = stored?.clientSecretCiphertext && stored.clientSecretIv
    ? await decryptSecret(stored.clientSecretCiphertext, stored.clientSecretIv)
    : undefined
  const clientSecret = values.GOOGLE_OAUTH_CLIENT_SECRET || encryptedSecret
  if (!clientId || !values.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED")
  }
  return {
    clientId,
    clientSecret,
    redirectUri: values.GOOGLE_OAUTH_REDIRECT_URI || redirectUri,
  }
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  const payload = (await response.json()) as GoogleTokenResponse
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "GOOGLE_TOKEN_EXCHANGE_FAILED")
  }
  return payload
}

export async function googleOAuthConfigured(sessionToken?: string | null) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    try {
      return Boolean(await getGoogleOAuthSettings(sessionToken))
    } catch {
      return false
    }
  }
  try {
    await oauthConfig("")
    return true
  } catch {
    return false
  }
}

export function googleDriveAccountEmail() {
  return runtimeEnv().GOOGLE_DRIVE_ACCOUNT_EMAIL?.trim().toLowerCase() || ""
}

export function googleOAuthRedirectUri(origin: string) {
  return runtimeEnv().GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/admin/google-drive/oauth/callback`
}

export async function googleAuthorizationUrl(input: {
  email: string
  state: string
  origin: string
  codeChallenge: string
  sessionToken?: string | null
}) {
  const redirectUri = googleOAuthRedirectUri(input.origin)
  const remote = remoteAccountsConfig(env)
  const clientId = remote
    ? ((await remoteAccountsFetch(remote, "/google/oauth-settings", { method: "GET", token: input.sessionToken })) as {
        settings: { clientId: string } | null
      }).settings?.clientId
    : (await oauthConfig(redirectUri)).clientId
  if (!clientId) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED")
  const parameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    login_hint: input.email,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  })
  return `${GOOGLE_AUTH_URL}?${parameters}`
}

export async function exchangeAuthorizationCode(input: {
  code: string
  origin: string
  codeVerifier: string
}) {
  const config = await oauthConfig(googleOAuthRedirectUri(input.origin))
  const parameters = new URLSearchParams({
    code: input.code,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  })
  if (config.clientSecret) parameters.set("client_secret", config.clientSecret)
  return tokenRequest(parameters)
}

export async function googleEmailForAccessToken(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const payload = (await response.json()) as { email?: string; error?: string }
  if (!response.ok || !payload.email) throw new Error(payload.error || "GOOGLE_EMAIL_UNAVAILABLE")
  return payload.email.trim().toLowerCase()
}

export async function saveGoogleAuthorization(input: {
  googleEmail: string
  refreshToken: string
  scopes?: string
  connectedBy: string
}) {
  const encrypted = await encryptSecret(input.refreshToken)
  const now = new Date().toISOString()
  await getDb()
    .insert(googleDriveAuthorizations)
    .values({
      id: AUTHORIZATION_ID,
      googleEmail: input.googleEmail,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      scopes: input.scopes || GOOGLE_SCOPES.join(" "),
      connectedBy: input.connectedBy,
      accessTokenCiphertext: null,
      accessTokenIv: null,
      accessTokenExpiresAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleDriveAuthorizations.id,
      set: {
        googleEmail: input.googleEmail,
        refreshTokenCiphertext: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
        scopes: input.scopes || GOOGLE_SCOPES.join(" "),
        connectedBy: input.connectedBy,
        accessTokenCiphertext: null,
        accessTokenIv: null,
        accessTokenExpiresAt: null,
        updatedAt: now,
      },
    })
  cachedAccessToken = null
  accessTokenPromise = null
  return getGoogleAuthorization()
}

export async function getGoogleAuthorization(sessionToken?: string | null) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = (await remoteAccountsFetch(remote, "/google/authorization", { method: "GET", token: sessionToken })) as {
      authorization: { googleEmail: string; scopes: string; connectedAt: string; updatedAt: string } | null
    }
    return response.authorization
  }
  const [authorization] = await getDb()
    .select({
      googleEmail: googleDriveAuthorizations.googleEmail,
      scopes: googleDriveAuthorizations.scopes,
      connectedAt: googleDriveAuthorizations.connectedAt,
      updatedAt: googleDriveAuthorizations.updatedAt,
    })
    .from(googleDriveAuthorizations)
    .where(eq(googleDriveAuthorizations.id, AUTHORIZATION_ID))
    .limit(1)
  return authorization ?? null
}

export async function completeGoogleOAuth(input: {
  code: string
  origin: string
  codeVerifier: string
  expectedEmail?: string
  connectedBy: string
}) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const redirectUri = googleOAuthRedirectUri(input.origin)
    const response = (await remoteAccountsFetch(remote, "/google/oauth/complete", {
      method: "POST",
      body: {
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectUri,
        expectedEmail: input.expectedEmail,
        connectedBy: input.connectedBy,
      },
    })) as { authorization: { googleEmail: string; scopes: string; connectedAt: string; updatedAt: string } }
    return response.authorization
  }
  const token = await exchangeAuthorizationCode({ code: input.code, origin: input.origin, codeVerifier: input.codeVerifier })
  const googleEmail = await googleEmailForAccessToken(token.access_token!)
  if (input.expectedEmail && googleEmail !== input.expectedEmail.trim().toLowerCase()) throw new Error("ACCOUNT_MISMATCH")
  if (!token.refresh_token) throw new Error("MISSING_REFRESH_TOKEN")
  return saveGoogleAuthorization({
    googleEmail,
    refreshToken: token.refresh_token,
    scopes: token.scope,
    connectedBy: input.connectedBy,
  })
}

export function googleAuthorizationCanManageAppsScript(
  authorization: { scopes: string } | null,
) {
  if (!authorization) return false
  const grantedScopes = new Set(authorization.scopes.split(/\s+/).filter(Boolean))
  return APPS_SCRIPT_SCOPES.every((scope) => grantedScopes.has(scope))
}

export async function getGoogleOAuthSettings(sessionToken?: string | null) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = (await remoteAccountsFetch(remote, "/google/oauth-settings", { method: "GET", token: sessionToken })) as {
      settings: { clientId: string; hasClientSecret: boolean; updatedAt: string } | null
    }
    return response.settings
  }
  const settings = await getGoogleOAuthSettingsWithSecret()
  return settings
    ? {
        clientId: settings.clientId,
        hasClientSecret: Boolean(settings.clientSecretCiphertext && settings.clientSecretIv),
        updatedAt: settings.updatedAt,
      }
    : null
}

export async function saveGoogleOAuthSettings(input: {
  clientId: string
  clientSecret?: string
  configuredBy: string
  sessionToken?: string | null
}) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = (await remoteAccountsFetch(remote, "/google/oauth-settings", {
      method: "POST",
      token: input.sessionToken,
      body: { clientId: input.clientId, clientSecret: input.clientSecret },
    })) as { settings: { clientId: string; hasClientSecret: boolean; updatedAt: string } | null }
    return response.settings
  }
  const existing = await getGoogleOAuthSettingsWithSecret()
  const secret = input.clientSecret?.trim()
  const encrypted = secret ? await encryptSecret(secret) : null
  const now = new Date().toISOString()
  const clientSecretCiphertext = encrypted?.ciphertext ?? existing?.clientSecretCiphertext ?? null
  const clientSecretIv = encrypted?.iv ?? existing?.clientSecretIv ?? null
  await getDb()
    .insert(googleOAuthSettings)
    .values({
      id: SETTINGS_ID,
      clientId: input.clientId.trim(),
      clientSecretCiphertext,
      clientSecretIv,
      configuredBy: input.configuredBy,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleOAuthSettings.id,
      set: {
        clientId: input.clientId.trim(),
        clientSecretCiphertext,
        clientSecretIv,
        configuredBy: input.configuredBy,
        updatedAt: now,
      },
    })
  cachedAccessToken = null
  accessTokenPromise = null
  await getDb().update(googleDriveAuthorizations).set({
    accessTokenCiphertext: null,
    accessTokenIv: null,
    accessTokenExpiresAt: null,
  }).where(eq(googleDriveAuthorizations.id, AUTHORIZATION_ID))
  return getGoogleOAuthSettings()
}

export async function createGoogleOAuthFlow(input: {
  state: string
  googleEmail: string
  codeVerifier: string
  connectedBy: string
}) {
  const now = new Date().toISOString()
  await getDb().delete(googleOAuthFlows).where(lt(googleOAuthFlows.expiresAt, now))
  await getDb().insert(googleOAuthFlows).values({
    state: input.state,
    googleEmail: input.googleEmail.trim().toLowerCase(),
    codeVerifier: input.codeVerifier,
    connectedBy: input.connectedBy,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
}

export async function takeGoogleOAuthFlow(state: string) {
  if (!state) return null
  const [flow] = await getDb()
    .select()
    .from(googleOAuthFlows)
    .where(eq(googleOAuthFlows.state, state))
    .limit(1)
  if (!flow) return null
  await getDb().delete(googleOAuthFlows).where(eq(googleOAuthFlows.state, state))
  return flow.expiresAt > new Date().toISOString() ? flow : null
}

async function getAuthorizationWithToken() {
  const [authorization] = await getDb()
    .select()
    .from(googleDriveAuthorizations)
    .where(eq(googleDriveAuthorizations.id, AUTHORIZATION_ID))
    .limit(1)
  if (!authorization) throw new Error("GOOGLE_DRIVE_NOT_AUTHORIZED")
  return authorization
}

async function loadGoogleOAuthAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }

  const remote = remoteAccountsConfig(env)
  if (remote) {
    const sessionToken = await currentAuthToken().catch(() => undefined)
    const response = (await remoteAccountsFetch(remote, "/google/access-token", { method: "GET", token: sessionToken })) as {
      accessToken: string
      expiresAt: number
    }
    cachedAccessToken = { token: response.accessToken, expiresAt: response.expiresAt }
    return cachedAccessToken.token
  }

  const authorization = await getAuthorizationWithToken()
  if (
    authorization.accessTokenCiphertext &&
    authorization.accessTokenIv &&
    authorization.accessTokenExpiresAt &&
    authorization.accessTokenExpiresAt > Date.now() + 60_000
  ) {
    try {
      const token = await decryptSecret(authorization.accessTokenCiphertext, authorization.accessTokenIv)
      cachedAccessToken = { token, expiresAt: authorization.accessTokenExpiresAt }
      return token
    } catch {
      // A cached access token is disposable. The encrypted refresh token below
      // remains authoritative and can mint a replacement.
    }
  }
  const config = await oauthConfig("")
  const refreshToken = await decryptSecret(
    authorization.refreshTokenCiphertext,
    authorization.refreshTokenIv,
  )
  const parameters = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    grant_type: "refresh_token",
  })
  if (config.clientSecret) parameters.set("client_secret", config.clientSecret)
  const payload = await tokenRequest(parameters)
  const expiresAt = Date.now() + (payload.expires_in || 3600) * 1000
  const encryptedAccessToken = await encryptSecret(payload.access_token!)
  await getDb().update(googleDriveAuthorizations).set({
    accessTokenCiphertext: encryptedAccessToken.ciphertext,
    accessTokenIv: encryptedAccessToken.iv,
    accessTokenExpiresAt: expiresAt,
  }).where(eq(googleDriveAuthorizations.id, AUTHORIZATION_ID)).catch((error) => {
    console.error("GOOGLE_ACCESS_TOKEN_CACHE_WRITE_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  })
  cachedAccessToken = { token: payload.access_token!, expiresAt }
  return cachedAccessToken.token
}

export async function googleOAuthAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token
  if (!accessTokenPromise) {
    accessTokenPromise = loadGoogleOAuthAccessToken().finally(() => {
      accessTokenPromise = null
    })
  }
  return accessTokenPromise
}

// In remote-accounts mode (see accounts-remote.ts), fetching the shared Drive
// access token needs the caller's session cookie (currentAuthToken()), which
// next/headers only allows reading during the synchronous part of a request.
// Background work started with runInBackground/waitUntil runs after that
// window closes, so a Sheets call made purely in the background would fail
// to authenticate. Call this — and await it — from the foreground before
// handing any Drive/Sheets-touching work to runInBackground, so the token is
// already cached (googleOAuthAccessToken's fast path above) by the time the
// background promise actually needs it.
export async function warmGoogleOAuthAccessToken() {
  try {
    await googleOAuthAccessToken()
  } catch {
    // The caller's own request-scoped Sheets/Drive calls will surface this
    // the same way they always have; this is best-effort priming only.
  }
}

export async function googleOAuthAuthorizedFetch(url: string, init: RequestInit = {}) {
  const token = await googleOAuthAccessToken()
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${token}`)
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  return fetch(url, { ...init, headers })
}

export function randomOAuthState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToBase64Url(bytes)
}

export async function googlePkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return bytesToBase64Url(new Uint8Array(digest))
}
