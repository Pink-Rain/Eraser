/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell, session } = require("electron")
const { spawn } = require("node:child_process")
const { request } = require("node:http")
const { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs")
const { dirname, join } = require("node:path")
const { randomBytes } = require("node:crypto")

const LOCAL_PORT = 32147
const PERSISTENT_PARTITION = "persist:eraser"
app.setName("Eraser")
let mainWindow = null
let serverProcess = null
let startupLogPath = ""

function persistentSecret(dataDirectory) {
  const path = join(dataDirectory, "desktop-secret.txt")
  try {
    const value = readFileSync(path, "utf8").trim()
    if (value) return value
  } catch {
    // Created below on first launch.
  }
  const value = randomBytes(32).toString("base64url")
  writeFileSync(path, value, { encoding: "utf8", mode: 0o600 })
  return value
}

function localRequest(url) {
  return new Promise((resolve, reject) => {
    const pending = request(url, { method: "GET", timeout: 2_000 }, (response) => {
      response.resume()
      resolve(response.statusCode || 0)
    })
    pending.once("timeout", () => pending.destroy(new Error("Délai dépassé")))
    pending.once("error", reject)
    pending.end()
  })
}

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  if (startupLogPath) {
    try {
      appendFileSync(startupLogPath, line, "utf8")
    } catch {
      // The dialog below still reports failures if the log cannot be written.
    }
  }
  console.log(message)
}

function recentLog() {
  try {
    const content = readFileSync(startupLogPath, "utf8")
    return content.slice(-4_000).trim()
  } catch {
    return ""
  }
}

async function waitForServer(url, attempts = 480) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(`Le service local s’est arrêté (code ${serverProcess?.exitCode ?? "inconnu"}).`)
    }
    try {
      const status = await localRequest(`${url}/connexion`)
      if (status > 0 && status < 500) return status
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError || new Error("Le serveur local Eraser ne répond pas.")
}

function serverPaths() {
  if (app.isPackaged) {
    return {
      directory: join(process.resourcesPath, "eraser-server.asar"),
      migrations: join(process.resourcesPath, "migrations"),
      workingDirectory: process.resourcesPath,
    }
  }
  return {
    directory: join(app.getAppPath(), "dist", "standalone"),
    migrations: join(app.getAppPath(), "drizzle"),
    workingDirectory: join(app.getAppPath(), "dist", "standalone"),
  }
}

async function startServer() {
  const port = LOCAL_PORT
  const userDataDirectory = app.getPath("userData")
  const dataDirectory = join(app.getPath("userData"), "data")
  mkdirSync(dataDirectory, { recursive: true })
  const logsDirectory = join(userDataDirectory, "logs")
  startupLogPath = process.env.ERASER_STARTUP_LOG || join(logsDirectory, "eraser-startup.log")
  mkdirSync(dirname(startupLogPath), { recursive: true })
  writeFileSync(startupLogPath, "", "utf8")
  const readyPath = process.env.ERASER_READY_FILE || join(userDataDirectory, "startup-ready.json")
  mkdirSync(dirname(readyPath), { recursive: true })
  rmSync(readyPath, { force: true })
  const paths = serverPaths()
  const serverScript = join(paths.directory, "server.js")
  logLine(`Démarrage d’Eraser ${app.getVersion()} sur 127.0.0.1:${port}.`)
  logLine(`Serveur : ${serverScript}`)
  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: paths.workingDirectory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ERASER_DESKTOP: "1",
      ERASER_DESKTOP_DATA_DIR: dataDirectory,
      ERASER_MIGRATIONS_DIR: paths.migrations,
      GOOGLE_TOKEN_ENCRYPTION_KEY: persistentSecret(dataDirectory),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  serverProcess.once("error", (error) => logLine(`[service:error] ${error.stack || error}`))
  serverProcess.stdout.on("data", (chunk) => logLine(`[service] ${String(chunk).trimEnd()}`))
  serverProcess.stderr.on("data", (chunk) => logLine(`[service:error] ${String(chunk).trimEnd()}`))
  serverProcess.once("exit", (code) => {
    logLine(`Le service local s’est arrêté avec le code ${code ?? "inconnu"}.`)
    if (code && mainWindow) {
      void dialog.showErrorBox(
        "Eraser s’est arrêté",
        `Le service local s’est fermé (code ${code}).\n\nJournal : ${startupLogPath}`,
      )
    }
  })
  const url = `http://127.0.0.1:${port}`
  const status = await waitForServer(url)
  writeFileSync(readyPath, JSON.stringify({ version: app.getVersion(), url, status, readyAt: new Date().toISOString() }, null, 2), "utf8")
  logLine(`Eraser est prêt (HTTP ${status}).`)
  return url
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    title: "Eraser",
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f4ead6",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PERSISTENT_PARTITION,
    },
  })
  const persistentSession = session.fromPartition(PERSISTENT_PARTITION)
  persistentSession.cookies.on("changed", () => {
    void persistentSession.cookies.flushStore()
  })
  let closeAfterCookieFlush = false
  mainWindow.on("close", (event) => {
    if (closeAfterCookieFlush) return
    event.preventDefault()
    void persistentSession.cookies.flushStore().finally(() => {
      closeAfterCookieFlush = true
      mainWindow?.close()
    })
  })
  mainWindow.once("ready-to-show", () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) return { action: "allow" }
    void shell.openExternal(target)
    return { action: "deny" }
  })
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault()
      void shell.openExternal(target)
    }
  })
  void mainWindow.loadURL(url)
}

async function prepareUpdates() {
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = require("electron-updater")
    autoUpdater.autoDownload = false
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) return
    const answer = await dialog.showMessageBox({
      type: "info",
      buttons: ["Télécharger", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      title: "Mise à jour Eraser",
      message: `Eraser ${result.updateInfo.version} est disponible.`,
    })
    if (answer.response !== 0) return
    await autoUpdater.downloadUpdate()
    const install = await dialog.showMessageBox({
      type: "info",
      buttons: ["Redémarrer et installer", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      title: "Mise à jour prête",
      message: "La mise à jour est prête à être installée.",
    })
    if (install.response === 0) autoUpdater.quitAndInstall()
  } catch (error) {
    console.warn("Mise à jour automatique indisponible :", error)
  }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

app.on("second-instance", () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  try {
    createWindow(await startServer())
    setTimeout(() => void prepareUpdates(), 10_000)
  } catch (error) {
    const details = recentLog()
    dialog.showErrorBox(
      "Impossible d’ouvrir Eraser",
      `${error instanceof Error ? error.message : String(error)}\n\n` +
        `${details ? `Dernières informations :\n${details}\n\n` : ""}` +
        `Journal complet : ${startupLogPath || app.getPath("logs")}`,
    )
    app.quit()
  }
})

app.on("window-all-closed", () => app.quit())
app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
})
