import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
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

// Une extension comme Eraser la range après l'avoir téléchargée (lib/extensions-install.ts) :
// le serveur construit doit l'ouvrir, servir ses fichiers et charger sa partie serveur ; avec
// l'API 3, poser ses styles sur toutes les pages et servir son module de démarrage.
async function installFakeExtension() {
  const directory = join(dataDirectory, "extensions", "map")
  await mkdir(join(directory, "0.1.0"), { recursive: true })
  await writeFile(join(directory, "0.1.0", "main.js"), "export function mount(element) { element.textContent = 'Eraser Map' }")
  await writeFile(join(directory, "0.1.0", "boot.js"), "export function activate(eraser) { eraser.slots.add('page.en-tete', () => null) }")
  await writeFile(join(directory, "0.1.0", "global.css"), ":root { --eraser-smoke: 1; }")
  await writeFile(join(directory, "0.1.0", "server.mjs"), "export default { async fetch(request, eraser) { return Response.json({ version: eraser.extension.version, path: eraser.path, role: eraser.account.role }) } }")
  const manifest = { id: "map", version: "0.1.0", api: 3, entry: "main.js", styles: [], boot: "boot.js", globalStyles: ["global.css"], server: "server.mjs", pack: "eraser-extension.pack.gz", sha256: "0".repeat(64) }
  await writeFile(join(directory, "current.json"), JSON.stringify({ version: "0.1.0", manifest, installedAt: new Date().toISOString() }))
}

try {
  await installFakeExtension()
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
      // Les migrations embarquées dans le serveur : celles qu'utilise une mise à jour sans réinstallation.
      ERASER_MIGRATIONS_DIR: join(serverDirectory, "migrations"),
      GOOGLE_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      // Jamais le vrai GitHub pendant la vérification : une adresse locale fermée.
      ERASER_EXTENSIONS_RELEASES_URL: "http://127.0.0.1:9/repos/{repo}/releases",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", (chunk) => { logs += String(chunk) })
  child.stderr.on("data", (chunk) => { logs += String(chunk) })
  const origin = `http://127.0.0.1:${port}`
  const status = await waitFor(`${origin}/connexion`)
  const loginPage = await fetch(`${origin}/connexion`)
  const loginHtml = await loginPage.text()
  const assetPaths = [...loginHtml.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path, index, paths) => paths.indexOf(path) === index)
  if (!assetPaths.some((path) => path.endsWith(".js"))) {
    throw new Error("La page de connexion ne référence aucun fichier JavaScript.")
  }
  for (const assetPath of assetPaths) {
    const asset = await fetch(`${origin}${assetPath}`)
    if (!asset.ok) throw new Error(`Le fichier d’interface ${assetPath} est inaccessible (${asset.status}).`)
  }
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

  // Le test d'installation supprime le compte qu'il crée : seul un compte encore
  // en attente peut se supprimer lui-même, jamais un compte actif.
  const secondCookie = (nativeRegistration.headers.getSetCookie?.() ?? [nativeRegistration.headers.get("set-cookie") || ""])
    .find((value) => value.startsWith("eraser_session="))?.split(";", 1)[0]
  if (!secondCookie) throw new Error("Le second profil n’a pas reçu de session.")
  const activeDelete = await fetch(`${origin}/api/account`, { method: "DELETE", headers: { cookie: loginCookie } })
  if (activeDelete.ok) throw new Error("Un compte actif a pu se supprimer lui-même.")
  const pendingDelete = await fetch(`${origin}/api/account`, { method: "DELETE", headers: { cookie: secondCookie } })
  if (!pendingDelete.ok) throw new Error(`Un compte en attente n’a pas pu se supprimer (${pendingDelete.status}).`)
  const deletedLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "second-profil@eraser.local", password: "mot-de-passe-second-profil" }),
  })
  if (deletedLogin.ok) throw new Error("Le compte supprimé peut encore se connecter.")

  const oauthStatus = await fetch(`${origin}/api/admin/google-drive/oauth/status`, {
    headers: { cookie: loginCookie },
  })
  if (!oauthStatus.ok) throw new Error(`La session administrateur locale ne fonctionne pas (${oauthStatus.status}).`)
  const oauthStart = await fetch(`${origin}/api/admin/google-drive/oauth/start?email=eraser.jdr@gmail.com`, {
    method: "POST",
    headers: { cookie: loginCookie },
  })
  if (oauthStart.status !== 400) throw new Error("Le test OAuth sans identifiants aurait dû être refusé proprement.")

  // Extensions : la liste de l'administration, la page, les fichiers et la partie serveur.
  const anonymousExtensions = await fetch(`${origin}/api/extensions`)
  if (anonymousExtensions.status !== 403) throw new Error(`La liste des extensions est ouverte sans compte (${anonymousExtensions.status}).`)
  const extensionsList = await fetch(`${origin}/api/extensions`, { headers: { cookie: loginCookie } })
  const extensionsBody = extensionsList.ok ? await extensionsList.json() : null
  const fakeMap = extensionsBody?.extensions?.find((extension) => extension.id === "map")
  if (!extensionsBody?.installable || !["doc", "map", "page", "craft"].every((id) => extensionsBody.extensions.some((extension) => extension.id === id)) || fakeMap?.installed?.version !== "0.1.0") {
    throw new Error(`Administration › Extensions ne voit pas l'extension installée (${extensionsList.status} ${JSON.stringify(extensionsBody)}).`)
  }
  const extensionPage = await fetch(`${origin}/extension/map/carte`, { headers: { cookie: loginCookie } })
  const extensionHtml = await extensionPage.text()
  if (!extensionPage.ok || !extensionHtml.includes('data-eraser-extension="map"')) throw new Error(`La page de l'extension ne s'ouvre pas (${extensionPage.status}).`)
  const extensionModule = await fetch(`${origin}/api/extensions/map/fichiers/0.1.0/main.js`, { headers: { cookie: loginCookie } })
  if (!extensionModule.ok || !/javascript/.test(extensionModule.headers.get("content-type") || "") || !(await extensionModule.text()).includes("export function mount")) {
    throw new Error(`Le module de l'extension n'est pas servi (${extensionModule.status}).`)
  }
  // API 3 : ses styles sur une page d'Eraser (pas seulement la sienne), avant l'affichage, et son démarrage servi.
  const home = await fetch(`${origin}/`, { headers: { cookie: loginCookie } })
  const homeHtml = await home.text()
  if (!home.ok || !homeHtml.includes("/api/extensions/map/fichiers/0.1.0/global.css")) throw new Error(`Les styles d'une extension ne sont pas posés sur les pages d'Eraser (${home.status}).`)
  const bootModule = await fetch(`${origin}/api/extensions/map/fichiers/0.1.0/boot.js`, { headers: { cookie: loginCookie } })
  if (!bootModule.ok || !(await bootModule.text()).includes("export function activate")) throw new Error(`Le module de démarrage de l'extension n'est pas servi (${bootModule.status}).`)
  const extensionServer = await fetch(`${origin}/api/extensions/map/serveur/carte/2`, { headers: { cookie: loginCookie } })
  const extensionAnswer = extensionServer.ok ? await extensionServer.json() : null
  if (extensionAnswer?.version !== "0.1.0" || extensionAnswer.path?.join("/") !== "carte/2" || extensionAnswer.role !== "admin") {
    throw new Error(`La partie serveur de l'extension ne répond pas (${extensionServer.status} ${JSON.stringify(extensionAnswer)}).`)
  }
  // « Chercher les mises à jour » : ouvert à tout compte connecté, refusé sans compte.
  const anonymousCheck = await fetch(`${origin}/api/extensions/verifier`, { method: "POST" })
  if (anonymousCheck.status !== 403) throw new Error(`La vérification des extensions est ouverte sans compte (${anonymousCheck.status}).`)
  const extensionsCheck = await fetch(`${origin}/api/extensions/verifier`, { method: "POST", headers: { cookie: loginCookie } })
  const extensionsCheckBody = extensionsCheck.ok ? await extensionsCheck.json() : null
  if (!Array.isArray(extensionsCheckBody?.extensions)) throw new Error(`La vérification des extensions ne répond pas (${extensionsCheck.status}).`)
  // Le relevé de fluidité donne les versions des extensions installées.
  const fluidity = await fetch(`${origin}/api/fluidity`, { headers: { cookie: loginCookie } })
  const fluidityBody = fluidity.ok ? await fluidity.json() : null
  const fluidityMap = fluidityBody?.extensions?.find?.((extension) => extension.id === "map")
  if (fluidityMap?.version !== "0.1.0" || !fluidityBody.extensions.some((extension) => extension.id === "craft")) throw new Error(`Le relevé de fluidité ne donne pas les versions des extensions (${fluidity.status} ${JSON.stringify(fluidityBody?.extensions)}).`)
  console.log(`Serveur local Eraser vérifié (HTTP ${status}), formulaires, mot de passe, compte administrateur, flux OAuth et extensions opérationnels.`)
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
