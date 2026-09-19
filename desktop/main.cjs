/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell, session } = require("electron")
const { spawn } = require("node:child_process")
const { request } = require("node:http")
const { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs")
const { dirname, join } = require("node:path")
const { randomBytes } = require("node:crypto")

const LOCAL_PORT = 32147
const PERSISTENT_PARTITION = "persist:eraser"
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000
app.setName("Eraser")
let mainWindow = null
let serverProcess = null
let startupLogPath = ""
let updaterInitialized = false
let updateCheckInProgress = false

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

async function createWindow(url) {
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
  mainWindow.webContents.on("console-message", (_event, ...args) => {
    const details = args[0]
    const message = details && typeof details === "object" ? details.message : args[1]
    if (message) logLine(`[interface] ${message}`)
  })
  mainWindow.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame) logLine(`[interface:error] ${code} ${description} (${validatedURL})`)
  })
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logLine(`[interface:error] Le moteur d’affichage s’est arrêté : ${details.reason}.`)
  })
  await mainWindow.loadURL(url)
}

async function prepareUpdates() {
  if (!app.isPackaged || updateCheckInProgress || process.env.ERASER_UI_SMOKE_RESULT) return
  updateCheckInProgress = true
  try {
    const { autoUpdater } = require("electron-updater")
    if (!updaterInitialized) {
      autoUpdater.allowPrerelease = true
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on("update-available", (info) => {
        logLine(`Téléchargement automatique de la mise à jour ${info.version}.`)
      })
      autoUpdater.on("update-downloaded", async (info) => {
        logLine(`Mise à jour ${info.version} téléchargée et prête.`)
        if (!mainWindow || mainWindow.isDestroyed()) return
        const install = await dialog.showMessageBox(mainWindow, {
          type: "info",
          buttons: ["Redémarrer maintenant", "Installer à la fermeture"],
          defaultId: 0,
          cancelId: 1,
          title: "Mise à jour Eraser prête",
          message: `Eraser ${info.version} a été téléchargé automatiquement.`,
          detail: "Tu n’as rien à réinstaller. Eraser peut redémarrer maintenant, ou installer la mise à jour quand tu le fermeras.",
        })
        if (install.response === 0) {
          await session.fromPartition(PERSISTENT_PARTITION).cookies.flushStore()
          autoUpdater.quitAndInstall(false, true)
        }
      })
      autoUpdater.on("error", (error) => {
        logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
      })
      updaterInitialized = true
    }
    await autoUpdater.checkForUpdates()
  } catch (error) {
    logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    updateCheckInProgress = false
  }
}

async function runInstalledUiSmoke(url) {
  const resultPath = process.env.ERASER_UI_SMOKE_RESULT
  if (!resultPath || !mainWindow) return
  const result = { ok: false, version: app.getVersion(), checkedAt: new Date().toISOString() }
  try {
    await mainWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 30000;
      const check = () => {
        const panel = document.querySelector('[data-eraser-auth-ready="true"]');
        if (panel) return resolve(true);
        if (Date.now() > deadline) return reject(new Error('L’interface de connexion ne devient pas interactive.'));
        setTimeout(check, 100);
      };
      check();
    })`)
    await mainWindow.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('form[action="/api/auth/register"]');
      if (!form) throw new Error('Le formulaire de création est introuvable.');
      const values = {
        displayName: 'Test interface installée',
        email: 'interface-installee@eraser.local',
        password: 'mot-de-passe-interface-installee'
      };
      for (const [name, value] of Object.entries(values)) {
        const input = form.querySelector('[name="' + name + '"]');
        if (!input) throw new Error('Champ introuvable : ' + name);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      form.requestSubmit();
      return true;
    })()`)
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline && mainWindow.webContents.getURL().startsWith(`${url}/connexion`)) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (mainWindow.webContents.getURL().startsWith(`${url}/connexion`)) {
      throw new Error("La création de compte n’a pas quitté la page de connexion.")
    }
    const authenticatedStatus = await mainWindow.webContents.executeJavaScript(
      `fetch('/api/admin/google-drive/oauth/status').then((response) => response.status)`,
    )
    if (authenticatedStatus !== 200) {
      throw new Error(`La session créée par l’interface est refusée (${authenticatedStatus}).`)
    }
    result.ok = true
    result.url = mainWindow.webContents.getURL()
    result.authenticatedStatus = authenticatedStatus
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8")
    logLine("Interface installée vérifiée : création de compte et session administrateur opérationnelles.")
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8")
    logLine(`[interface:test-error] ${result.error}`)
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
    const url = await startServer()
    await createWindow(url)
    await runInstalledUiSmoke(url)
    setTimeout(() => void prepareUpdates(), 10_000)
    setInterval(() => void prepareUpdates(), UPDATE_CHECK_INTERVAL_MS)
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
