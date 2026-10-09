/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, session } = require("electron")
const { spawn } = require("node:child_process")
const { request } = require("node:http")
const { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs")
const { dirname, join } = require("node:path")
const { randomBytes } = require("node:crypto")
const hotUpdate = require("./hot-update.cjs")
const discordPresence = require("./discord-presence.cjs")

const LOCAL_PORT = 32147
const PERSISTENT_PARTITION = "persist:eraser"
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000
const NORMAL_MIN_WIDTH = 1024
const NORMAL_MIN_HEIGHT = 700
const TITLEBAR_HEIGHT = 40
// Kept in sync by hand with TITLEBAR_HEIGHT_PX/COLLAPSED_WIDTH_PX in
// components/eraser/desktop-titlebar.tsx (the two can't share a literal
// constant across the IPC boundary). The collapsed mini bar only needs to
// fit the icon + "Eraser - JDR", not the window's previous full width.
const COLLAPSED_WIDTH = 220
// The internal Electron app name: it determines the userData directory
// (%APPDATA%/Eraser/...), so it must NEVER change independently of a
// deliberate, tested data-migration — changing it would silently point
// existing installs at an empty new folder, "losing" all local data. The
// user-visible product name (window title, shortcuts, Programs listing) is
// controlled separately, below and in electron-builder.yml.
app.setName("Eraser")

// Generated at CI build time from the ERASER_ACCOUNTS_API_URL/ERASER_ACCOUNTS_API_KEY
// repository secrets (see .github/workflows/windows-release.yml). It never exists in
// source control and is absent during local development, in which case this desktop
// build falls back to its own local, per-machine account database as before.
function accountsConfig() {
  try {
    return require("./accounts-config.generated.cjs")
  } catch {
    return {}
  }
}
// La première fenêtre ouverte (ou celle qui a pris sa place) : celle du test
// d'installation et du « second lancement ». Toutes les fenêtres sont dans `windows`.
let mainWindow = null
const windows = new Set()
let serverUrl = ""
let serverProcess = null
let startupLogPath = ""
let updaterInitialized = false
let updateCheckInProgress = false
// Version réellement servie : celle de l'installation, ou celle d'un serveur mis à
// jour sans réinstallation (desktop/hot-update.cjs).
let runningVersion = app.getVersion()
let runningHotBundle = false
let restartingServer = false
// La mise à jour téléchargée qui attend la réponse de l'utilisateur.
let pendingUpdate = null
let fullUpdateInProgress = false
// Épinglée / réduite : propre à chaque fenêtre.
const windowStates = new WeakMap()
// L'onglet en cours de glisser-déposer entre fenêtres (un seul à la fois).
let tabDrag = null
let cookieFlushInstalled = false

function stateOf(win) {
  let state = windowStates.get(win)
  if (!state) {
    state = { isPinned: false, isCollapsed: false, savedBounds: null, savedWasMaximized: false }
    windowStates.set(win, state)
  }
  return state
}

function liveWindows() {
  return [...windows].filter((win) => !win.isDestroyed())
}

function senderWindow(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win && !win.isDestroyed() ? win : null
}

function resolveIconPath() {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.ico")
    : join(__dirname, "..", "build-resources", "icon.ico")
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
  const bundle = app.isPackaged ? hotUpdate.activeBundle() : null
  if (bundle) {
    const bundledMigrations = join(bundle.path, "migrations")
    return {
      directory: bundle.path,
      migrations: existsSync(bundledMigrations) ? bundledMigrations : join(process.resourcesPath, "migrations"),
      workingDirectory: process.resourcesPath,
      version: bundle.version,
      hot: true,
    }
  }
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
  // Un redémarrage du serveur (mise à jour appliquée) garde le journal du démarrage.
  if (!restartingServer) writeFileSync(startupLogPath, "", "utf8")
  const readyPath = process.env.ERASER_READY_FILE || join(userDataDirectory, "startup-ready.json")
  mkdirSync(dirname(readyPath), { recursive: true })
  rmSync(readyPath, { force: true })
  const paths = serverPaths()
  runningVersion = paths.version || app.getVersion()
  runningHotBundle = Boolean(paths.hot)
  const serverScript = join(paths.directory, "server.js")
  logLine(`Démarrage d’Eraser ${runningVersion} sur 127.0.0.1:${port}${runningHotBundle ? ` (mise à jour sans réinstallation, enveloppe ${app.getVersion()})` : ""}.`)
  logLine(`Serveur : ${serverScript}`)
  const accounts = accountsConfig()
  logLine(
    accounts.url
      ? "Comptes et rôles : annuaire partagé (eraser-accounts) configuré."
      : "Comptes et rôles : aucun annuaire partagé configuré, base locale à cette machine.",
  )
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
      ...(accounts.url ? { ERASER_ACCOUNTS_API_URL: accounts.url } : {}),
      ...(accounts.apiKey ? { ERASER_ACCOUNTS_API_KEY: accounts.apiKey } : {}),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  serverProcess.once("error", (error) => logLine(`[service:error] ${error.stack || error}`))
  serverProcess.stdout.on("data", (chunk) => logLine(`[service] ${String(chunk).trimEnd()}`))
  serverProcess.stderr.on("data", (chunk) => logLine(`[service:error] ${String(chunk).trimEnd()}`))
  const child = serverProcess
  serverProcess.once("exit", (code) => {
    logLine(`Le service local s’est arrêté avec le code ${code ?? "inconnu"}.`)
    // Un service remplacé entre-temps (mise à jour, redémarrage) n'est pas une panne.
    if (code && windows.size && !restartingServer && !quitting && serverProcess === child) void recoverFromCrash(code)
  })
  const url = `http://127.0.0.1:${port}`
  const status = await waitForServer(url)
  writeFileSync(readyPath, JSON.stringify({ version: runningVersion, url, status, readyAt: new Date().toISOString() }, null, 2), "utf8")
  logLine(`Eraser est prêt (HTTP ${status}).`)
  return url
}

function stopServer() {
  const child = serverProcess
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000)
    child.once("exit", () => { clearTimeout(timer); resolve() })
    child.kill()
  })
}

/**
 * Démarre le serveur local. Si un serveur mis à jour sans réinstallation ne démarre
 * pas, il est écarté et la version installée prend le relais : une mise à jour ratée
 * ne doit jamais empêcher d'ouvrir Eraser.
 */
async function startServerSafely() {
  try {
    return await startServer()
  } catch (error) {
    if (!runningHotBundle) throw error
    logLine(`[mise-à-jour:error] La version ${runningVersion} ne démarre pas (${error instanceof Error ? error.message : error}) : retour à la version installée.`)
    hotUpdate.markFailed(runningVersion)
    restartingServer = true
    try {
      await stopServer()
      return await startServer()
    } finally {
      restartingServer = false
    }
  }
}

// Redémarrages automatiques récents : au-delà de trois en cinq minutes, on prévient au lieu de boucler.
let crashRestarts = []
// Eraser se ferme : l'arrêt du service est voulu, il n'est pas relancé.
let quitting = false

/**
 * Le service local s'est arrêté tout seul : il est relancé et chaque fenêtre recharge sa
 * page, sans rien demander. La fenêtre d'erreur n'apparaît que si la relance échoue, ou
 * si les arrêts se répètent.
 */
async function recoverFromCrash(code) {
  const now = Date.now()
  crashRestarts = crashRestarts.filter((at) => now - at < 5 * 60_000)
  if (crashRestarts.length >= 3) {
    dialog.showErrorBox("Eraser s’est arrêté", `Le service local s’est fermé plusieurs fois (code ${code}).\n\nJournal : ${startupLogPath}`)
    return
  }
  crashRestarts.push(now)
  logLine(`Redémarrage automatique du service local (code ${code}).`)
  const open = liveWindows()
  const current = new Map(open.map((win) => [win, win.webContents.getURL()]))
  restartingServer = true
  try {
    const url = await startServerSafely()
    serverUrl = url
    await Promise.all(liveWindows().map((win) => {
      const address = current.get(win) || url
      return win.loadURL(address.startsWith(url) ? address : url).catch(() => undefined)
    }))
    logLine("Le service local a redémarré.")
  } catch (error) {
    logLine(`[service:error] Le redémarrage a échoué : ${error instanceof Error ? error.message : error}`)
    dialog.showErrorBox("Eraser s’est arrêté", `Le service local s’est fermé (code ${code}) et n’a pas pu redémarrer.\n\nJournal : ${startupLogPath}`)
  } finally {
    restartingServer = false
  }
}

/** Remplace le serveur local par la version téléchargée et recharge la page affichée. */
async function applyHotUpdate() {
  const open = liveWindows()
  if (!open.length) return
  const current = new Map(open.map((win) => [win, win.webContents.getURL()]))
  await session.fromPartition(PERSISTENT_PARTITION).cookies.flushStore()
  restartingServer = true
  let url
  try {
    await stopServer()
    url = await startServerSafely()
  } finally {
    restartingServer = false
  }
  serverUrl = url
  // Chaque fenêtre recharge sa page : ses onglets, gardés par la fenêtre, restent.
  await Promise.all(liveWindows().map((win) => {
    const address = current.get(win) || url
    return win.loadURL(address.startsWith(url) ? address : url).catch(() => undefined)
  }))
  logLine(`Eraser ${runningVersion} est appliqué sans réinstallation.`)
}

/**
 * Une mise à jour est téléchargée : l'interface l'annonce elle-même (logo qui tourne,
 * « Eraser est en changement. Souhaitez-vous rester dans le passé ? »). La réponse
 * revient par « eraser:update-apply » ou « eraser:update-dismiss ». Elle reste en
 * attente pour une page qui s'ouvrirait après l'annonce.
 */
function announceUpdate(update) {
  pendingUpdate = update
  for (const win of liveWindows()) win.webContents.send("eraser:update-ready", update)
}

function offerHotUpdate(version) {
  if (hotUpdate.compareVersions(version, runningVersion) <= 0) return
  announceUpdate({ kind: "hot", version })
}

async function applyPendingUpdate() {
  const update = pendingUpdate
  if (!update) return
  pendingUpdate = null
  try {
    if (update.kind === "full") {
      await session.fromPartition(PERSISTENT_PARTITION).cookies.flushStore()
      // Installation silencieuse (pas d'assistant), puis relance d'Eraser.
      ensureUpdaterConfigured().quitAndInstall(true, true)
      return
    }
    await applyHotUpdate()
  } catch (error) {
    logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
  }
}

function windowStateFor(win) {
  const state = stateOf(win)
  return { isMaximized: win.isMaximized(), isPinned: state.isPinned, isCollapsed: state.isCollapsed }
}

function broadcastWindowState(win) {
  if (!win || win.isDestroyed()) return
  win.webContents.send("eraser:window-state", windowStateFor(win))
}

// Shrinks the window to just its titlebar strip, remembering the exact
// bounds (and maximized state) to restore later. The caller pins the window
// first if it wasn't already — a floating mini bar only makes sense on top
// of everything, so collapsing implies pinning rather than requiring it.
function collapseWindow(win) {
  const state = stateOf(win)
  if (state.isCollapsed) return
  state.savedWasMaximized = win.isMaximized()
  if (state.savedWasMaximized) win.unmaximize()
  state.savedBounds = win.getBounds()
  win.setMinimumSize(COLLAPSED_WIDTH, TITLEBAR_HEIGHT)
  win.setResizable(false)
  win.setBounds({ x: state.savedBounds.x, y: state.savedBounds.y, width: COLLAPSED_WIDTH, height: TITLEBAR_HEIGHT })
  win.setOpacity(0.88)
  state.isCollapsed = true
}

function restoreFromCollapse(win) {
  const state = stateOf(win)
  if (!state.isCollapsed) return
  win.setOpacity(1)
  if (state.savedBounds) win.setBounds(state.savedBounds)
  win.setMinimumSize(NORMAL_MIN_WIDTH, NORMAL_MIN_HEIGHT)
  win.setResizable(true)
  if (state.savedWasMaximized) win.maximize()
  state.savedBounds = null
  state.savedWasMaximized = false
  state.isCollapsed = false
}

/**
 * Ouvre une fenêtre d'Eraser sur `address` (une page du serveur local). `bounds`
 * place la fenêtre, par exemple là où un onglet a été lâché.
 */
async function createWindow(address, bounds = null) {
  const url = serverUrl
  const win = new BrowserWindow({
    title: "Eraser - JDR",
    icon: resolveIconPath(),
    width: bounds?.width || 1440,
    height: bounds?.height || 940,
    ...(bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y) ? { x: Math.round(bounds.x), y: Math.round(bounds.y) } : {}),
    minWidth: NORMAL_MIN_WIDTH,
    minHeight: NORMAL_MIN_HEIGHT,
    show: false,
    frame: false,
    backgroundColor: "#f4ead6",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PERSISTENT_PARTITION,
    },
  })
  windows.add(win)
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = win
  win.on("closed", () => {
    windows.delete(win)
    if (mainWindow === win) mainWindow = liveWindows()[0] || null
  })
  win.on("maximize", () => broadcastWindowState(win))
  win.on("unmaximize", () => broadcastWindowState(win))
  const persistentSession = session.fromPartition(PERSISTENT_PARTITION)
  if (!cookieFlushInstalled) {
    cookieFlushInstalled = true
    persistentSession.cookies.on("changed", () => {
      void persistentSession.cookies.flushStore()
    })
  }
  // Correcteur orthographique : Electron souligne les fautes mais n'affiche aucun
  // menu contextuel par défaut. On construit donc le nôtre plus bas.
  //
  // La langue choisie par défaut est celle du système et son dictionnaire est déjà
  // en place : on ne la remplace jamais, car imposer une langue dont le
  // dictionnaire n'est pas encore téléchargé désactive le soulignement entièrement.
  // On se contente d'ajouter le français quand il manque, et on revient en arrière
  // si son téléchargement échoue.
  try {
    const current = persistentSession.getSpellCheckerLanguages() || []
    if (!current.some((language) => language.toLowerCase().startsWith("fr"))) {
      const available = persistentSession.availableSpellCheckerLanguages || []
      const french = ["fr-FR", "fr"].find((language) => available.includes(language))
      if (french) {
        persistentSession.once("spellcheck-dictionary-download-failure", () => {
          logLine("[interface] Dictionnaire français indisponible : retour à la langue du système.")
          try { persistentSession.setSpellCheckerLanguages(current) } catch { /* langue système conservée */ }
        })
        persistentSession.setSpellCheckerLanguages([french, ...current])
      }
    }
  } catch (error) {
    logLine(`[interface] Correcteur orthographique inchangé : ${error && error.message ? error.message : error}`)
  }
  win.webContents.on("context-menu", (_event, params) => {
    // Sur un lien, c'est la page qui propose son menu (« ouvrir dans un nouvel
    // onglet ») : le menu du système ferait double emploi par-dessus.
    if (params.linkURL && !params.isEditable) return
    const items = []
    for (const suggestion of params.dictionarySuggestions || []) {
      items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
    }
    if (items.length) items.push({ type: "separator" })
    if (params.misspelledWord) {
      items.push({
        label: "Ajouter au dictionnaire",
        click: () => persistentSession.addWordToSpellCheckerDictionary(params.misspelledWord),
      })
      items.push({ type: "separator" })
    }
    if (params.isEditable || params.selectionText) {
      items.push(
        { label: "Annuler", role: "undo", enabled: params.isEditable && params.editFlags.canUndo },
        { label: "Rétablir", role: "redo", enabled: params.isEditable && params.editFlags.canRedo },
        { type: "separator" },
        { label: "Couper", role: "cut", enabled: params.editFlags.canCut },
        { label: "Copier", role: "copy", enabled: params.editFlags.canCopy },
        { label: "Coller", role: "paste", enabled: params.editFlags.canPaste },
        { label: "Tout sélectionner", role: "selectAll", enabled: params.editFlags.canSelectAll },
      )
    }
    if (!items.length) return
    Menu.buildFromTemplate(items).popup({ window: win })
  })
  let closeAfterCookieFlush = false
  win.on("close", (event) => {
    if (closeAfterCookieFlush) return
    event.preventDefault()
    void persistentSession.cookies.flushStore().finally(() => {
      closeAfterCookieFlush = true
      win.close()
    })
  })
  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    // Une page d'Eraser ouverte « ailleurs » devient une vraie fenêtre d'Eraser.
    if (target.startsWith(url)) {
      void createWindow(target, nextWindowBounds(win))
      return { action: "deny" }
    }
    void shell.openExternal(target)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault()
      void shell.openExternal(target)
    }
  })
  win.webContents.on("console-message", (_event, ...args) => {
    const details = args[0]
    const message = details && typeof details === "object" ? details.message : args[1]
    if (message) logLine(`[interface] ${message}`)
  })
  win.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame) logLine(`[interface:error] ${code} ${description} (${validatedURL})`)
  })
  win.webContents.on("render-process-gone", (_event, details) => {
    logLine(`[interface:error] Le moteur d’affichage s’est arrêté : ${details.reason}.`)
  })
  await win.loadURL(address.startsWith(url) ? address : url)
  return win
}

function ensureUpdaterConfigured() {
  const { autoUpdater } = require("electron-updater")
  if (!updaterInitialized) {
    autoUpdater.allowPrerelease = true
    // L'installateur ne sert plus que lorsque l'enveloppe a changé : il n'est
    // téléchargé qu'à la demande de runUpdateCheck, jamais d'office.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on("update-downloaded", (info) => {
      logLine(`Mise à jour complète ${info.version} téléchargée et prête.`)
      // Même annonce que pour une mise à jour sans réinstallation ; « Non » (ne pas
      // rester dans le passé) installe en silence et relance Eraser.
      announceUpdate({ kind: "full", version: info.version })
    })
    autoUpdater.on("error", (error) => {
      logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
    })
    updaterInitialized = true
  }
  return autoUpdater
}

/** L'installateur complet, pour les versions qui changent l'enveloppe. */
async function startFullUpdate() {
  if (fullUpdateInProgress) return
  fullUpdateInProgress = true
  try {
    const autoUpdater = ensureUpdaterConfigured()
    const result = await autoUpdater.checkForUpdates()
    if (result?.updateInfo && hotUpdate.compareVersions(result.updateInfo.version, app.getVersion()) > 0) {
      logLine(`Téléchargement de l’installation complète ${result.updateInfo.version}.`)
      await autoUpdater.downloadUpdate()
    }
  } catch (error) {
    logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    fullUpdateInProgress = false
  }
}

/**
 * Une recherche de mise à jour, automatique ou demandée par le bouton : d'abord le
 * serveur seul (quelques secondes, sans réinstaller), sinon l'installateur silencieux.
 */
async function runUpdateCheck() {
  const found = await hotUpdate.check(runningVersion)
  if (found.kind === "ready") {
    logLine(`Mise à jour ${found.version} téléchargée : elle s’applique sans réinstallation.`)
    void offerHotUpdate(found.version)
    return { status: "ready", updateVersion: found.version }
  }
  if (found.kind === "full") {
    void startFullUpdate()
    return { status: "available", updateVersion: found.version }
  }
  return { status: "not-available" }
}

async function prepareUpdates() {
  if (!app.isPackaged || updateCheckInProgress || process.env.ERASER_UI_SMOKE_RESULT) return
  updateCheckInProgress = true
  try {
    await runUpdateCheck()
  } catch (error) {
    logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    updateCheckInProgress = false
  }
}

// Le bouton « Chercher les mises à jour » : même procédure que la recherche
// automatique, mais il attend la réponse pour l'afficher.
async function checkForUpdatesWithStatus() {
  if (!app.isPackaged) return { status: "unavailable", version: runningVersion }
  let timeoutId
  const timeout = new Promise((resolve) => { timeoutId = setTimeout(() => resolve({ status: "timeout" }), 180_000) })
  try {
    const result = await Promise.race([runUpdateCheck(), timeout])
    return { version: runningVersion, ...result }
  } catch (error) {
    return { status: "error", version: runningVersion, message: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeoutId)
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
    // A unique email per run: the shared accounts backend (worker-accounts/)
    // persists across CI runs, unlike the old fully-local per-run database,
    // so a hardcoded address would collide with EMAIL_EXISTS on every run
    // after the first successful one.
    const smokeTestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await mainWindow.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('form[action="/api/auth/register"]');
      if (!form) throw new Error('Le formulaire de création est introuvable.');
      const values = {
        displayName: 'Test interface installée',
        email: 'interface-installee-${smokeTestId}@eraser.local',
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
    // A freshly registered account is "en attente" with no role (only the
    // ADMIN_EMAIL + code combination becomes admin), so this can't check an
    // admin-only route. `/` renders for any authenticated account regardless
    // of role/status (redirecting to /connexion only when unauthenticated),
    // so a manual-redirect fetch distinguishes "has a valid session" (200)
    // from "no session" (redirected, reported as status 0) either way.
    const authenticatedStatus = await mainWindow.webContents.executeJavaScript(
      `fetch('/', { redirect: 'manual' }).then((response) => response.status)`,
    )
    if (authenticatedStatus !== 200) {
      throw new Error(`La session créée par l’interface est refusée (${authenticatedStatus}).`)
    }
    result.ok = true
    result.url = mainWindow.webContents.getURL()
    result.authenticatedStatus = authenticatedStatus
    // Le compte de test vit dans l'annuaire partagé : il est supprimé dès la
    // vérification faite, sinon chaque construction en laissait un de plus dans
    // l'administration. Un échec ici ne fait pas échouer le test : le Worker
    // efface de lui-même les comptes de test restés plus d'une heure.
    result.accountDeleted = await mainWindow.webContents.executeJavaScript(
      `fetch('/api/account', { method: 'DELETE' }).then((response) => response.ok).catch(() => false)`,
    )
    if (!result.accountDeleted) logLine("[interface:test-warning] Le compte de test n’a pas pu être supprimé ; le Worker l’effacera dans l’heure.")
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8")
    logLine("Interface installée vérifiée : création de compte et session administrateur opérationnelles.")
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8")
    logLine(`[interface:test-error] ${result.error}`)
  }
}

ipcMain.handle("eraser:check-for-updates", async () => checkForUpdatesWithStatus())
ipcMain.handle("eraser:update-pending", () => pendingUpdate)
ipcMain.handle("eraser:update-apply", () => applyPendingUpdate())
// « Rester dans le passé » : la mise à jour attend la prochaine ouverture d'Eraser.
ipcMain.handle("eraser:update-dismiss", () => { pendingUpdate = null })

ipcMain.handle("eraser:window-get-state", (event) => {
  const win = senderWindow(event)
  return win ? windowStateFor(win) : { isMaximized: false, isPinned: false, isCollapsed: false }
})

ipcMain.handle("eraser:window-minimize", (event) => {
  senderWindow(event)?.minimize()
})

ipcMain.handle("eraser:window-toggle-maximize", (event) => {
  const win = senderWindow(event)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})

ipcMain.handle("eraser:window-close", (event) => {
  senderWindow(event)?.close()
})

ipcMain.handle("eraser:window-toggle-pin", (event) => {
  const win = senderWindow(event)
  if (!win) return { isPinned: false }
  const state = stateOf(win)
  state.isPinned = !state.isPinned
  win.setAlwaysOnTop(state.isPinned)
  if (!state.isPinned && state.isCollapsed) restoreFromCollapse(win)
  broadcastWindowState(win)
  return { isPinned: state.isPinned }
})

ipcMain.handle("eraser:window-toggle-collapse", (event) => {
  const win = senderWindow(event)
  if (!win) return { isCollapsed: false }
  const state = stateOf(win)
  if (state.isCollapsed) {
    restoreFromCollapse(win)
  } else {
    // Collapsing without pinning first would leave a tiny window that other
    // apps can immediately cover, defeating the point of the mini bar — so
    // pin automatically instead of refusing the collapse outright.
    if (!state.isPinned) {
      state.isPinned = true
      win.setAlwaysOnTop(true)
    }
    collapseWindow(win)
  }
  broadcastWindowState(win)
  return { isCollapsed: state.isCollapsed }
})

// ——— Fenêtres et onglets ———

/** Une page de l'application seulement (« /… »), jamais une adresse extérieure. */
function appAddress(href) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null
  return `${serverUrl}${href}`
}

function cleanTab(tab) {
  if (!tab || typeof tab.href !== "string" || !appAddress(tab.href)) return null
  return { href: tab.href, label: String(tab.label || "Page").slice(0, 80) }
}

/** Taille d'une nouvelle fenêtre : celle d'origine, un peu décalée. */
function nextWindowBounds(from) {
  if (!from || from.isDestroyed() || stateOf(from).isCollapsed) return null
  const bounds = from.isMaximized() ? { ...from.getNormalBounds() } : from.getBounds()
  return { x: bounds.x + 32, y: bounds.y + 32, width: bounds.width, height: bounds.height }
}

/** Fenêtre d'Eraser sous le pointeur (la plus haute d'abord : celle qui a le focus). */
function windowAtPoint(point) {
  const open = liveWindows().filter((win) => win.isVisible() && !win.isMinimized())
  open.sort((a, b) => Number(b.isFocused()) - Number(a.isFocused()))
  return open.find((win) => {
    const box = win.getBounds()
    return point.x >= box.x && point.x < box.x + box.width && point.y >= box.y && point.y < box.y + box.height
  }) || null
}

ipcMain.handle("eraser:open-window", (event, href) => {
  const address = appAddress(href)
  if (!address) return
  void createWindow(address, nextWindowBounds(senderWindow(event)))
    .catch((error) => logLine(`[interface:error] Nouvelle fenêtre : ${error instanceof Error ? error.message : error}`))
})

ipcMain.handle("eraser:tab-drag-start", (event, tab) => {
  const clean = cleanTab(tab)
  tabDrag = clean ? { tab: clean, sourceId: event.sender.id, claimed: false } : null
})

// Une autre fenêtre a reçu l'onglet sur sa barre : elle le prend.
ipcMain.handle("eraser:tab-drag-claim", (event) => {
  if (!tabDrag || tabDrag.claimed || tabDrag.sourceId === event.sender.id) return null
  tabDrag.claimed = true
  return tabDrag.tab
})

ipcMain.handle("eraser:tab-drag-cancel", () => {
  tabDrag = null
})

/**
 * L'onglet a été lâché hors de sa bande. Déposé sur la barre d'une autre fenêtre,
 * celle-ci l'a déjà pris ; déposé ailleurs sur une autre fenêtre, il la rejoint ;
 * lâché hors de toute fenêtre, il ouvre une nouvelle fenêtre à cet endroit (ou,
 * s'il était seul, sa fenêtre s'y déplace).
 */
ipcMain.handle("eraser:tab-drag-end", async (event, details) => {
  const drag = tabDrag
  if (!drag || drag.sourceId !== event.sender.id) return { result: "none" }
  // Le dépôt dans l'autre fenêtre peut arriver juste après la fin du glisser.
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (tabDrag === drag) tabDrag = null
  if (drag.claimed) return { result: "moved" }
  const source = senderWindow(event)
  const point = screen.getCursorScreenPoint()
  const target = windowAtPoint(point)
  if (target === source) return { result: "none" }
  if (target) {
    target.webContents.send("eraser:tab-attach", drag.tab)
    target.focus()
    return { result: "moved" }
  }
  const tabCount = Number(details?.tabCount) || 1
  if (source && tabCount <= 1) {
    if (stateOf(source).isCollapsed) return { result: "none" }
    if (source.isMaximized()) source.unmaximize()
    source.setPosition(Math.round(point.x - 120), Math.round(Math.max(0, point.y - 16)))
    return { result: "none" }
  }
  const size = nextWindowBounds(source)
  void createWindow(appAddress(drag.tab.href), {
    x: point.x - 120,
    y: Math.max(0, point.y - 16),
    width: size?.width,
    height: size?.height,
  }).catch((error) => logLine(`[interface:error] Nouvelle fenêtre : ${error instanceof Error ? error.message : error}`))
  return { result: "moved" }
})

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

app.on("second-instance", () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  try {
    hotUpdate.cleanup()
    const url = await startServerSafely()
    serverUrl = url
    await createWindow(url)
    // Le statut Discord « Eraser - JDR » : jamais pendant le test d'installation, et un
    // échec (Discord fermé) ne gêne en rien l'ouverture d'Eraser.
    if (!process.env.ERASER_UI_SMOKE_RESULT) {
      try { discordPresence.startDiscordPresence() } catch (error) { logLine(`[discord] ${error instanceof Error ? error.message : error}`) }
    }
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
  quitting = true
  try { discordPresence.stopDiscordPresence() } catch { /* Discord déjà parti */ }
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
})
