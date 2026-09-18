import { runtimeEnv } from "@/lib/google-service-account"

const encoder = new TextEncoder()

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

async function imageSigningKey() {
  const secret = runtimeEnv().GOOGLE_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error("CLASS_IMAGE_SIGNING_NOT_CONFIGURED")
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

export async function signClassImageId(fileId: string) {
  const signature = await crypto.subtle.sign("HMAC", await imageSigningKey(), encoder.encode(fileId))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function verifyClassImageSignature(fileId: string, signature: string) {
  try {
    return crypto.subtle.verify(
      "HMAC",
      await imageSigningKey(),
      base64UrlToBytes(signature),
      encoder.encode(fileId),
    )
  } catch {
    return false
  }
}
