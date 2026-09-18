import { and, asc, count, eq, gt } from "drizzle-orm"
import { env } from "cloudflare:workers"

import { getDb } from "@/db"
import { sessions, users } from "@/db/schema"
import type { AccountRecord, AccountStatus, SiteRole } from "@/lib/auth-types"

// Cloudflare Workers caps PBKDF2 at 100,000 iterations per derivation.
const PASSWORD_ITERATIONS = 100_000
const SESSION_DAYS = 30

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

export async function accountFromSession(token: string) {
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
  await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)))
}

export async function listAccounts() {
  const rows = await getDb().select().from(users).orderBy(asc(users.createdAt))
  return rows.map(accountRecord)
}

export async function updateAccountAccess(
  uid: string,
  role: SiteRole,
  status: AccountStatus,
) {
  const now = new Date().toISOString()
  await getDb().update(users).set({ role, status, updatedAt: now }).where(eq(users.id, uid))
  const [updated] = await getDb().select().from(users).where(eq(users.id, uid)).limit(1)
  if (!updated) throw new Error("ACCOUNT_NOT_FOUND")
  return accountRecord(updated)
}
