import { env } from "cloudflare:workers"

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ")

let tokenCache: { value: string; expiresAt: number } | null = null
let tokenPromise: Promise<string> | null = null

export function runtimeEnv() {
  return env as unknown as Record<string, string | undefined>
}

export function googleServiceAccountEmail() {
  return runtimeEnv().GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || null
}

export function googleServiceConfigured() {
  const runtime = runtimeEnv()
  return Boolean(
    runtime.GOOGLE_SERVICE_ACCOUNT_EMAIL && runtime.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  )
}

function requireGoogleConfig() {
  const runtime = runtimeEnv()
  const clientEmail = runtime.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKey = runtime.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!clientEmail || !privateKey) throw new Error("GOOGLE_SERVICE_NOT_CONFIGURED")
  return { clientEmail, privateKey }
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function privateKeyBytes(pem: string) {
  const body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "")
  const decoded = atob(body)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer
}

async function loadAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value

  const { clientEmail, privateKey } = requireGoogleConfig()
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: GOOGLE_SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signed = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  )
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signed))}`
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  })
  const payload = (await response.json()) as {
    access_token?: string
    expires_in?: number
    error_description?: string
  }
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? "GOOGLE_AUTH_ERROR")
  }
  tokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  }
  return tokenCache.value
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value
  if (!tokenPromise) {
    tokenPromise = loadAccessToken().finally(() => {
      tokenPromise = null
    })
  }
  return tokenPromise
}

export async function googleServiceAuthorizedFetch(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set("authorization", `Bearer ${await accessToken()}`)
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  return fetch(url, { ...init, headers })
}
