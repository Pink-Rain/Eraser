const { app, BrowserWindow, dialog, shell } = require("electron")
const { spawn } = require("node:child_process")
const { createServer } = require("node:net")
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs")
const { join } = require("node:path")
const { randomBytes } = require("node:crypto")

let mainWindow = null
let serverProcess = null

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

async function waitForServer(url, attempts = 120) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status < 500) return
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
      directory: join(process.resourcesPath, "eraser-server"),
      migrations: join(process.resourcesPath, "migrations"),
    }
  }
  return {
    directory: join(app.getAppPath(), "dist", "standalone"),
    migrations: join(app.getAppPath(), "drizzle"),
  }
}

async function startServer() {
  const port = await freePort()
  const dataDirectory = join(app.getPath("userData"), "data")
  mkdirSync(dataDirectory, { recursive: true })
  const paths = serverPaths()
  const serverScript = join(paths.directory, "server.js")
  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: paths.directory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
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
  serverProcess.stdout.on("data", (chunk) => console.log(`[Eraser] ${chunk}`))
  serverProcess.stderr.on("data", (chunk) => console.error(`[Eraser] ${chunk}`))
  serverProcess.once("exit", (code) => {
    if (code && mainWindow) {
      void dialog.showErrorBox("Eraser s’est arrêté", `Le service local s’est fermé (code ${code}).`)
    }
  })
  const url = `http://127.0.0.1:${port}`
  await waitForServer(url)
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
    },
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
    dialog.showErrorBox(
      "Impossible d’ouvrir Eraser",
      error instanceof Error ? error.message : String(error),
    )
    app.quit()
  }
})

app.on("window-all-closed", () => app.quit())
app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
})
