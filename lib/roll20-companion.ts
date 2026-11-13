/**
 * Le compagnon Roll20 rangé sur ce PC : Eraser écrit lui-même ses fichiers dans le dossier où le
 * navigateur le charge (« extension non empaquetée »), au lieu de faire télécharger et décompresser
 * un ZIP. Le dossier choisi est propre à cette installation (`<données>/roll20-companion.json`) :
 * ce n'est pas une donnée de campagne.
 *
 * Tout se passe dans le serveur local, qui tourne sur le PC du MJ : aucune enveloppe Electron à
 * changer. Seuls les fichiers du compagnon sont écrits, jamais rien d'autre ni ailleurs, et rien
 * n'est effacé. Les fichiers viennent d'`integrations/roll20/extension` (la source), inclus au
 * serveur à la construction.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

import manifestText from "@/integrations/roll20/extension/manifest.json?raw"
import backgroundScript from "@/integrations/roll20/extension/background.js?raw"
import contentScript from "@/integrations/roll20/extension/content.js?raw"
import contentStyle from "@/integrations/roll20/extension/content.css?raw"
import pageScript from "@/integrations/roll20/extension/page.js?raw"
import tokenArtScript from "@/integrations/roll20/extension/token-art.js?raw"
import { companionManifest, ROLL20_COMPANION_NAME } from "@/lib/roll20-companion-version"

/** Les fichiers du compagnon, à la racine de son dossier (comme dans le ZIP). */
export const companionFiles: Record<string, string> = {
  "manifest.json": manifestText,
  "background.js": backgroundScript,
  "content.js": contentScript,
  "content.css": contentStyle,
  "page.js": pageScript,
  "token-art.js": tokenArtScript,
}

/** Le sous-dossier créé quand le dossier choisi contient déjà autre chose (Téléchargements…). */
const SUBFOLDER = "Eraser - Compagnon Roll20"

function dataDirectory() {
  return process.env.ERASER_DESKTOP_DATA_DIR || ""
}

/** Seulement dans l'application Windows : le serveur tourne alors sur le PC du MJ. */
export function companionInstallAvailable() {
  return Boolean(dataDirectory()) && (process.platform === "win32" || process.env.ERASER_ROLL20_COMPANION_ANY_OS === "1")
}

function settingsPath() {
  return join(dataDirectory(), "roll20-companion.json")
}

/** Le dossier proposé d'office : Documents\Eraser\Compagnon Roll20. */
export function defaultCompanionFolder() {
  return join(homedir(), "Documents", "Eraser", "Compagnon Roll20")
}

export async function savedCompanionFolder() {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), "utf8")) as { folder?: unknown }
    return typeof parsed.folder === "string" && isAbsolute(parsed.folder) ? parsed.folder : ""
  } catch {
    return ""
  }
}

async function saveCompanionFolder(folder: string) {
  await mkdir(dataDirectory(), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify({ folder, savedAt: new Date().toISOString() }, null, 2))
}

/** La version du compagnon rangé dans ce dossier ; "" si ce n'est pas le compagnon d'Eraser. */
export async function companionVersionIn(folder: string) {
  try {
    const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8")) as { name?: unknown; version?: unknown }
    return manifest.name === ROLL20_COMPANION_NAME && typeof manifest.version === "string" ? manifest.version : ""
  } catch {
    return ""
  }
}

/**
 * Le vrai dossier du compagnon à partir de celui que le MJ a choisi : le compagnon lui-même, le
 * dossier décompressé qu'il contient (« eraser-roll20-companion »…), un dossier vide, sinon un
 * sous-dossier à son nom (on n'écrit jamais au milieu de ses autres fichiers).
 */
export async function companionFolderFrom(chosen: string) {
  const folder = resolve(chosen)
  if (await companionVersionIn(folder)) return folder
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => null)
  if (!entries) return folder
  for (const entry of entries) {
    if (entry.isDirectory() && await companionVersionIn(join(folder, entry.name))) return join(folder, entry.name)
  }
  return entries.length ? join(folder, SUBFOLDER) : folder
}

/**
 * Ce que le compagnon a dit de lui-même (`/api/roll20/bridge/companion`) : la version qui tourne
 * dans le navigateur, et celle du script Mod de la dernière partie où il a synchronisé. Rangé à
 * part du dossier choisi : le compagnon écrit ici, le MJ là.
 */
type CompanionSeen = { browserVersion: string; browserSeenAt: string; modVersion: string; modSeenAt: string }

function seenPath() {
  return join(dataDirectory(), "roll20-companion-seen.json")
}

async function companionSeen(): Promise<CompanionSeen> {
  const empty = { browserVersion: "", browserSeenAt: "", modVersion: "", modSeenAt: "" }
  if (!dataDirectory()) return empty
  try {
    const parsed = JSON.parse(await readFile(seenPath(), "utf8")) as Partial<CompanionSeen>
    const text = (value: unknown) => typeof value === "string" ? value : ""
    return { browserVersion: text(parsed.browserVersion), browserSeenAt: text(parsed.browserSeenAt), modVersion: text(parsed.modVersion), modSeenAt: text(parsed.modSeenAt) }
  } catch {
    return empty
  }
}

const VERSION_PATTERN = /^\d{1,4}(\.\d{1,6}){0,3}$/

/** Le compagnon signale sa version (et celle du Mod) ; une valeur qui n'est pas une version est ignorée. */
export async function recordCompanionSeen(report: { running?: string | null; mod?: string | null }) {
  if (!dataDirectory()) return
  const now = new Date().toISOString()
  const running = report.running && VERSION_PATTERN.test(report.running) ? report.running : ""
  const mod = report.mod && VERSION_PATTERN.test(report.mod) ? report.mod : ""
  if (!running && !mod) return
  const seen = await companionSeen()
  const next = { ...seen, ...(running ? { browserVersion: running, browserSeenAt: now } : {}), ...(mod ? { modVersion: mod, modSeenAt: now } : {}) }
  await mkdir(dataDirectory(), { recursive: true })
  await writeFile(seenPath(), JSON.stringify(next, null, 2))
}

export type CompanionState = {
  /** L'application Windows : Eraser peut écrire le compagnon sur ce PC. */
  available: boolean
  /** La version du compagnon livrée avec cette version d'Eraser. */
  version: string
  /** Le dossier enregistré ("" : pas encore choisi). */
  folder: string
  /** La version qui s'y trouve ("" : rien, ou pas le compagnon). */
  folderVersion: string
  defaultFolder: string
} & CompanionSeen

export async function companionState(): Promise<CompanionState> {
  const version = companionManifest.version
  const seen = await companionSeen()
  if (!companionInstallAvailable()) return { available: false, version, folder: "", folderVersion: "", defaultFolder: "", ...seen }
  const folder = await savedCompanionFolder()
  return { available: true, version, folder, folderVersion: folder ? await companionVersionIn(folder) : "", defaultFolder: defaultCompanionFolder(), ...seen }
}

/**
 * Écrit le compagnon dans le dossier enregistré (sinon celui proposé d'office, qui devient le
 * sien) : chaque fichier est écrit à côté puis renommé, un navigateur ne lit jamais un fichier à
 * moitié écrit. Les autres fichiers du dossier ne sont pas touchés.
 */
export async function installCompanion() {
  if (!companionInstallAvailable()) throw new Error("COMPANION_INSTALL_UNAVAILABLE")
  const folder = await savedCompanionFolder() || defaultCompanionFolder()
  await writeCompanionFiles(folder)
  await saveCompanionFolder(folder)
  return companionState()
}

/** Les fichiers du compagnon dans `folder` (créé s'il manque). */
export async function writeCompanionFiles(folder: string) {
  await mkdir(folder, { recursive: true })
  for (const [name, text] of Object.entries(companionFiles)) {
    const target = join(folder, name)
    const temporary = `${target}.eraser-${process.pid}.tmp`
    await writeFile(temporary, text, "utf8")
    await rename(temporary, target)
  }
}

/** Retient un dossier choisi par le MJ (le vrai dossier du compagnon, voir `companionFolderFrom`). */
export async function rememberCompanionFolder(chosen: string) {
  if (!companionInstallAvailable()) throw new Error("COMPANION_INSTALL_UNAVAILABLE")
  if (!isAbsolute(chosen)) throw new Error("COMPANION_FOLDER_INVALID")
  const folder = await companionFolderFrom(chosen)
  await saveCompanionFolder(folder)
  return companionState()
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) {
  return new Promise<{ code: number | null; stdout: string }>((done, fail) => {
    const child = spawn(command, args, { windowsHide: true, env: options.env ?? process.env, stdio: ["ignore", "pipe", "ignore"] })
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 10 * 60_000)
    child.on("error", (error) => { clearTimeout(timer); fail(error) })
    child.on("close", (code) => { clearTimeout(timer); done({ code, stdout: Buffer.concat(chunks).toString("utf8") }) })
  })
}

// La fenêtre « Rechercher un dossier » de Windows, au premier plan (devant Eraser). Le dossier de
// départ arrive par une variable d'environnement : rien n'est collé dans le script.
const PICK_FOLDER_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choisis le dossier du compagnon Roll20 d''Eraser (celui chargé dans Chrome ou Opera)'
$dialog.ShowNewFolderButton = $true
if ($env:ERASER_START_FOLDER -and (Test-Path -LiteralPath $env:ERASER_START_FOLDER)) { $dialog.SelectedPath = $env:ERASER_START_FOLDER }
if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }
$owner.Dispose()
`

/** Ouvre la fenêtre de choix de dossier de Windows ; "" si le MJ annule. */
export async function pickCompanionFolder() {
  if (process.platform !== "win32") throw new Error("COMPANION_INSTALL_UNAVAILABLE")
  const start = await savedCompanionFolder() || join(homedir(), "Documents")
  const encoded = Buffer.from(PICK_FOLDER_SCRIPT, "utf16le").toString("base64")
  const result = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { env: { ...process.env, ERASER_START_FOLDER: start } })
  return result.stdout.trim()
}

/** Ouvre le dossier du compagnon dans l'Explorateur. */
export async function openCompanionFolder() {
  const folder = await savedCompanionFolder()
  if (!folder || !existsSync(folder) || process.platform !== "win32") throw new Error("COMPANION_FOLDER_MISSING")
  spawn("explorer.exe", [folder], { detached: true, stdio: "ignore", windowsHide: false }).unref()
}
