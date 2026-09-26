import { and, asc, count, eq, gt, ne } from "drizzle-orm"
import { env } from "cloudflare:workers"

import { getDb } from "@/db"
import { sessions, users } from "@/db/schema"
import type { AccountRecord, AccountStatus, SiteRole } from "@/lib/auth-types"
import { remoteAccountsConfig, remoteAccountsFetch } from "@/lib/accounts-remote"

// Cloudflare Workers caps PBKDF2 at 100,000 iterations per derivation.
const PASSWORD_ITERATIONS = 100_000
const SESSION_DAYS = 365

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

async function derivePassword(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
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
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expectedBytes[index]
  }
  return difference === 0
}

function accountRecord(user: typeof users.$inferSelect): AccountRecord {
  return {
    uid: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

async function createSession(userId: string) {
  const token = randomToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await getDb().insert(sessions).values({ tokenHash, userId, expiresAt })
  return { token, expiresAt }
}

export async function registerAccount(input: {
  email: string
  password: string
  displayName: string
  adminCode?: string
}) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = await remoteAccountsFetch(remote, "/register", { method: "POST", body: input })
    return response as { account: AccountRecord; session: { token: string; expiresAt: string } }
  }

  const db = getDb()
  const email = input.email.trim().toLowerCase()
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length) throw new Error("EMAIL_EXISTS")

  const runtimeEnv = env as unknown as Record<string, string | undefined>
  const [{ value: accountCount }] = await db.select({ value: count() }).from(users)
  const firstDesktopAccount = runtimeEnv.ERASER_DESKTOP === "1" && accountCount === 0
  const adminEmail = runtimeEnv.ADMIN_EMAIL?.trim().toLowerCase()
  const adminSetupCode = runtimeEnv.ADMIN_SETUP_CODE
  const bootstrapAdmin =
    Boolean(adminEmail) &&
    email === adminEmail &&
    Boolean(adminSetupCode) &&
    input.adminCode === adminSetupCode
  const passwordData = await hashPassword(input.password)
  const id = crypto.randomUUID()
  await db.insert(users).values({
    id,
    email,
    displayName: input.displayName.trim(),
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    role: bootstrapAdmin || firstDesktopAccount ? "admin" : null,
    status: bootstrapAdmin || firstDesktopAccount ? "actif" : "en_attente",
  })
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return { account: accountRecord(user), session: await createSession(id) }
}

export async function loginAccount(email: string, password: string) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = await remoteAccountsFetch(remote, "/login", { method: "POST", body: { email, password } })
    return response as { account: AccountRecord; session: { token: string; expiresAt: string } }
  }

  const db = getDb()
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1)
  if (!user || !(await passwordMatches(password, user.passwordSalt, user.passwordHash))) {
    throw new Error("INVALID_LOGIN_CREDENTIALS")
  }
  return { account: accountRecord(user), session: await createSession(user.id) }
}

// With the shared accounts Worker, resolving "who is this?" is a network
// round-trip — and it happens before anything renders, on every single page.
// The session token is stable and accounts change rarely, so a short cache
// removes that latency from navigation. A role or status change takes at most
// this long to apply, and the paths that change one clear the cache directly.
const SESSION_CACHE_MS = 30_000
const sessionAccountCache = new Map<string, { expiresAt: number; account: Promise<AccountRecord | null> }>()

function forgetCachedSessions() {
  sessionAccountCache.clear()
}

export async function accountFromSession(token: string) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const cached = sessionAccountCache.get(token)
    if (cached && cached.expiresAt > Date.now()) return cached.account
    const account = remoteAccountsFetch(remote, "/session", { method: "GET", token })
      .then((response) => (response as { account: AccountRecord } | null)?.account ?? null)
      .catch(() => {
        sessionAccountCache.delete(token)
        return null
      })
    if (sessionAccountCache.size >= 200) forgetCachedSessions()
    sessionAccountCache.set(token, { expiresAt: Date.now() + SESSION_CACHE_MS, account })
    return account
  }

  const tokenHash = await sha256(token)
  const db = getDb()
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1)
  if (!session) return null
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
  return user ? accountRecord(user) : null
}

export async function deleteSession(token: string) {
  sessionAccountCache.delete(token)
  const remote = remoteAccountsConfig(env)
  if (remote) {
    await remoteAccountsFetch(remote, "/logout", { method: "POST", token }).catch(() => null)
    return
  }
  await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)))
}

export async function listAccounts(sessionToken?: string) {
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = await remoteAccountsFetch(remote, "/accounts", { method: "GET", token: sessionToken })
    return (response as { accounts: AccountRecord[] }).accounts
  }
  const rows = await getDb().select().from(users).orderBy(asc(users.createdAt))
  return rows.map(accountRecord)
}

export async function updateAccountAccess(
  uid: string,
  role: SiteRole,
  status: AccountStatus,
  sessionToken?: string,
) {
  forgetCachedSessions()
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = await remoteAccountsFetch(remote, `/accounts/${encodeURIComponent(uid)}/access`, {
      method: "POST",
      body: { role, status },
      token: sessionToken,
    })
    return (response as { account: AccountRecord }).account
  }
  const now = new Date().toISOString()
  await getDb().update(users).set({ role, status, updatedAt: now }).where(eq(users.id, uid))
  const [updated] = await getDb().select().from(users).where(eq(users.id, uid)).limit(1)
  if (!updated) throw new Error("ACCOUNT_NOT_FOUND")
  return accountRecord(updated)
}

export async function deleteAccount(uid: string, adminUid: string, sessionToken?: string) {
  if (uid === adminUid) throw new Error("CANNOT_DELETE_SELF")
  forgetCachedSessions()
  const remote = remoteAccountsConfig(env)
  if (remote) {
    await remoteAccountsFetch(remote, `/accounts/${encodeURIComponent(uid)}`, { method: "DELETE", token: sessionToken })
    return
  }
  const db = getDb()
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, uid)).limit(1)
  if (!user) throw new Error("ACCOUNT_NOT_FOUND")
  try {
    await db.delete(users).where(eq(users.id, uid))
  } catch {
    throw new Error("ACCOUNT_REFERENCED")
  }
}

export type OwnProfileUpdate = { displayName?: string; email?: string; currentPassword?: string; newPassword?: string }

/**
 * Modifie son propre compte. Pseudo libre ; e-mail et mot de passe demandent le mot
 * de passe actuel. Un nouveau mot de passe ferme les autres sessions du compte.
 */
export async function updateOwnProfile(uid: string, sessionToken: string, input: OwnProfileUpdate) {
  forgetCachedSessions()
  const remote = remoteAccountsConfig(env)
  if (remote) {
    const response = await remoteAccountsFetch(remote, "/account/profile", { method: "POST", body: input, token: sessionToken })
    return (response as { account: AccountRecord }).account
  }

  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.id, uid)).limit(1)
  if (!user) throw new Error("ACCOUNT_NOT_FOUND")
  const displayName = input.displayName === undefined ? user.displayName : input.displayName.trim()
  const email = input.email === undefined ? user.email : input.email.trim().toLowerCase()
  const newPassword = input.newPassword ?? ""
  if (displayName.length < 2 || displayName.length > 80) throw new Error("INVALID_DISPLAY_NAME")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error("INVALID_EMAIL")
  if (newPassword && (newPassword.length < 8 || newPassword.length > 200)) throw new Error("INVALID_NEW_PASSWORD")
  const sensitive = email !== user.email || Boolean(newPassword)
  if (sensitive && !(await passwordMatches(input.currentPassword ?? "", user.passwordSalt, user.passwordHash))) {
    throw new Error("INVALID_CURRENT_PASSWORD")
  }
  if (email !== user.email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (taken && taken.id !== uid) throw new Error("EMAIL_EXISTS")
  }
  const now = new Date().toISOString()
  const passwordData = newPassword ? await hashPassword(newPassword) : null
  await db.update(users).set({
    displayName,
    email,
    ...(passwordData ? { passwordHash: passwordData.hash, passwordSalt: passwordData.salt } : {}),
    updatedAt: now,
  }).where(eq(users.id, uid))
  if (passwordData) {
    await db.delete(sessions).where(and(eq(sessions.userId, uid), ne(sessions.tokenHash, await sha256(sessionToken))))
  }
  const [updated] = await db.select().from(users).where(eq(users.id, uid)).limit(1)
  return accountRecord(updated)
}
