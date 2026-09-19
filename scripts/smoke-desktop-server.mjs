import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { extractAll } from "@electron/asar"

const root = process.cwd()
const dataDirectory = await mkdtemp(join(tmpdir(), "eraser-desktop-test-"))
const serverDirectory = join(dataDirectory, "server")
extractAll(join(root, "dist", "eraser-server.asar"), serverDirectory)
let child
let logs = ""

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      probe.close(() => resolve(address.port))
    })
  })
}

async function waitFor(url) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child?.exitCode !== null) throw new Error(`Le serveur local s’est arrêté avec le code ${child?.exitCode}.`)
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status < 500) return response.status
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError || new Error("Le serveur local n’a pas répondu.")
}

try {
  const port = await freePort()
  child = spawn(process.execPath, [join(serverDirectory, "server.js")], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ERASER_DESKTOP: "1",
      ERASER_DESKTOP_DATA_DIR: dataDirectory,
      ERASER_MIGRATIONS_DIR: join(root, "drizzle"),
      GOOGLE_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", (chunk) => { logs += String(chunk) })
  child.stderr.on("data", (chunk) => { logs += String(chunk) })
  const origin = `http://127.0.0.1:${port}`
  const status = await waitFor(`${origin}/connexion`)
  const registration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "test-installation@eraser.local",
      password: "mot-de-passe-de-test",
      displayName: "Test installation",
    }),
  })
  if (!registration.ok) throw new Error(`La création du premier compte a échoué (${registration.status}).`)
  const setCookies = registration.headers.getSetCookie?.() ?? [registration.headers.get("set-cookie") || ""]
  const sessionCookie = setCookies.find((value) => value.startsWith("eraser_session="))
  if (!sessionCookie) throw new Error("Le cookie de session local est absent.")
  if (/;\s*Secure/i.test(sessionCookie)) throw new Error("Le cookie local ne doit pas exiger HTTPS.")
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "test-installation@eraser.local",
      password: "mot-de-passe-de-test",
    }),
  })
  if (!login.ok) throw new Error(`La connexion avec mot de passe a échoué (${login.status}).`)
  const loginCookies = login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie") || ""]
  const loginSession = loginCookies.find((value) => value.startsWith("eraser_session="))
  if (!loginSession) throw new Error("La reconnexion n’a pas créé de session persistante.")
  const loginCookie = loginSession.split(";", 1)[0]

  const nativeForm = new FormData()
  nativeForm.set("email", "second-profil@eraser.local")
  nativeForm.set("password", "mot-de-passe-second-profil")
  nativeForm.set("displayName", "Second profil")
  const nativeRegistration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    body: nativeForm,
    redirect: "manual",
  })
  if (nativeRegistration.status !== 303) {
    throw new Error(`Le formulaire HTML de création ne redirige pas correctement (${nativeRegistration.status}).`)
  }

  const oauthStatus = await fetch(`${origin}/api/admin/google-drive/oauth/status`, {
    headers: { cookie: loginCookie },
  })
  if (!oauthStatus.ok) throw new Error(`La session administrateur locale ne fonctionne pas (${oauthStatus.status}).`)
  const oauthStart = await fetch(`${origin}/api/admin/google-drive/oauth/start?email=eraser.jdr@gmail.com`, {
    method: "POST",
    headers: { cookie: loginCookie },
  })
  if (oauthStart.status !== 400) throw new Error("Le test OAuth sans identifiants aurait dû être refusé proprement.")
  console.log(`Serveur local Eraser vérifié (HTTP ${status}), formulaires, mot de passe, compte administrateur et flux OAuth opérationnels.`)
} catch (error) {
  if (logs.trim()) console.error(logs.trim())
  console.error(error)
  throw error
} finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise((resolve) => child.once("exit", resolve))
    child.kill()
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }
  await rm(dataDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
}
