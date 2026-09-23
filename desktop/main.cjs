/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, shell, session } = require("electron")
const { spawn } = require("node:child_process")
const { request } = require("node:http")
const { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs")
const { dirname, join } = require("node:path")
const { randomBytes } = require("node:crypto")
const hotUpdate = require("./hot-update.cjs")

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
let mainWindow = null
let serverProcess = null
let startupLogPath = ""
let updaterInitialized = false
let updateCheckInProgress = false
// Version réellement servie : celle de l'installation, ou celle d'un serveur mis à
// jour sans réinstallation (desktop/hot-update.cjs).
let runningVersion = app.getVersion()
let runningHotBundle = false
let restartingServer = false
let hotUpdateDialogOpen = false
let fullUpdateInProgress = false
let isPinned = false
let isCollapsed = false
let collapseSavedBounds = null
let collapseSavedWasMaximized = false

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
  serverProcess.once("exit", (code) => {
    logLine(`Le service local s’est arrêté avec le code ${code ?? "inconnu"}.`)
    if (code && mainWindow && !restartingServer) {
      void dialog.showErrorBox(
        "Eraser s’est arrêté",
        `Le service local s’est fermé (code ${code}).\n\nJournal : ${startupLogPath}`,
      )
    }
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

/** Remplace le serveur local par la version téléchargée et recharge la page affichée. */
async function applyHotUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const current = mainWindow.webContents.getURL()
  await session.fromPartition(PERSISTENT_PARTITION).cookies.flushStore()
  restartingServer = true
  let url
  try {
    await stopServer()
    url = await startServerSafely()
  } finally {
    restartingServer = false
  }
  await mainWindow.loadURL(current.startsWith(url) ? current : url)
  logLine(`Eraser ${runningVersion} est appliqué sans réinstallation.`)
}

async function offerHotUpdate(version) {
  if (!mainWindow || mainWindow.isDestroyed() || hotUpdateDialogOpen) return
  if (hotUpdate.compareVersions(version, runningVersion) <= 0) return
  hotUpdateDialogOpen = true
  try {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Appliquer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      title: "Mise à jour Eraser prête",
      message: `Eraser ${version} est prêt.`,
      detail: "Rien à réinstaller : la page se recharge en quelques secondes. Termine d’abord ce que tu es en train d’écrire.\n\n« Plus tard » l’appliquera à la prochaine ouverture d’Eraser.",
    })
    if (choice.response === 0) await applyHotUpdate()
  } catch (error) {
    logLine(`[mise-à-jour:error] ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    hotUpdateDialogOpen = false
  }
}

function broadcastWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send("eraser:window-state", {
    isMaximized: mainWindow.isMaximized(),
    isPinned,
    isCollapsed,
  })
}

// Shrinks the window to just its titlebar strip, remembering the exact
// bounds (and maximized state) to restore later. The caller pins the window
// first if it wasn't already — a floating mini bar only makes sense on top
// of everything, so collapsing implies pinning rather than requiring it.
function collapseWindow() {
  if (!mainWindow || isCollapsed) return
  collapseSavedWasMaximized = mainWindow.isMaximized()
  if (collapseSavedWasMaximized) mainWindow.unmaximize()
  collapseSavedBounds = mainWindow.getBounds()
  mainWindow.setMinimumSize(COLLAPSED_WIDTH, TITLEBAR_HEIGHT)
  mainWindow.setResizable(false)
  mainWindow.setBounds({ x: collapseSavedBounds.x, y: collapseSavedBounds.y, width: COLLAPSED_WIDTH, height: TITLEBAR_HEIGHT })
  mainWindow.setOpacity(0.88)
  isCollapsed = true
}

function restoreFromCollapse() {
  if (!mainWindow || !isCollapsed) return
  mainWindow.setOpacity(1)
  if (collapseSavedBounds) mainWindow.setBounds(collapseSavedBounds)
  mainWindow.setMinimumSize(NORMAL_MIN_WIDTH, NORMAL_MIN_HEIGHT)
  mainWindow.setResizable(true)
  if (collapseSavedWasMaximized) mainWindow.maximize()
  collapseSavedBounds = null
  collapseSavedWasMaximized = false
  isCollapsed = false
}

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    title: "Eraser - JDR",
    icon: resolveIconPath(),
    width: 1440,
    height: 940,
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
  mainWindow.on("maximize", broadcastWindowState)
  mainWindow.on("unmaximize", broadcastWindowState)
  const persistentSession = session.fromPartition(PERSISTENT_PARTITION)
  persistentSession.cookies.on("changed", () => {
    void persistentSession.cookies.flushStore()
  })
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
  mainWindow.webContents.on("context-menu", (_event, params) => {
    // Sur un lien, c'est la page qui propose son menu (« ouvrir dans un nouvel
    // onglet ») : le menu du système ferait double emploi par-dessus.
    if (params.linkURL && !params.isEditable) return
    const items = []
    for (const suggestion of params.dictionarySuggestions || []) {
      items.push({ label: suggestion, click: () => mainWindow?.webContents.replaceMisspelling(suggestion) })
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
    Menu.buildFromTemplate(items).popup({ window: mainWindow })
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

function ensureUpdaterConfigured() {
  const { autoUpdater } = require("electron-updater")
  if (!updaterInitialized) {
    autoUpdater.allowPrerelease = true
    // L'installateur ne sert plus que lorsque l'enveloppe a changé : il n'est
    // téléchargé qu'à la demande de runUpdateCheck, jamais d'office.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on("update-downloaded", async (info) => {
      logLine(`Mise à jour complète ${info.version} téléchargée et prête.`)
      if (!mainWindow || mainWindow.isDestroyed()) return
      const install = await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Redémarrer maintenant", "À la fermeture"],
        defaultId: 0,
        cancelId: 1,
        title: "Mise à jour Eraser prête",
        message: `Eraser ${info.version} a été téléchargé.`,
        detail: "Cette version modifie le cœur de l’application : Eraser se ferme, s’installe tout seul, sans assistant, puis se rouvre.",
      })
      if (install.response === 0) {
        await session.fromPartition(PERSISTENT_PARTITION).cookies.flushStore()
        // Installation silencieuse (pas d'assistant), puis relance d'Eraser.
        autoUpdater.quitAndInstall(true, true)
      }
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
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8")
    logLine("Interface installée vérifiée : création de compte et session administrateur opérationnelles.")
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8")
    logLine(`[interface:test-error] ${result.error}`)
  }
}

ipcMain.handle("eraser:check-for-updates", async () => checkForUpdatesWithStatus())

ipcMain.handle("eraser:window-get-state", () => ({
  isMaximized: mainWindow ? mainWindow.isMaximized() : false,
  isPinned,
  isCollapsed,
}))

ipcMain.handle("eraser:window-minimize", () => {
  mainWindow?.minimize()
})

ipcMain.handle("eraser:window-toggle-maximize", () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})

ipcMain.handle("eraser:window-close", () => {
  mainWindow?.close()
})

ipcMain.handle("eraser:window-toggle-pin", () => {
  if (!mainWindow) return { isPinned }
  isPinned = !isPinned
  mainWindow.setAlwaysOnTop(isPinned)
  if (!isPinned && isCollapsed) restoreFromCollapse()
  broadcastWindowState()
  return { isPinned }
})

ipcMain.handle("eraser:window-toggle-collapse", () => {
  if (!mainWindow) return { isCollapsed }
  if (isCollapsed) {
    restoreFromCollapse()
  } else {
    // Collapsing without pinning first would leave a tiny window that other
    // apps can immediately cover, defeating the point of the mini bar — so
    // pin automatically instead of refusing the collapse outright.
    if (!isPinned) {
      isPinned = true
      mainWindow.setAlwaysOnTop(true)
    }
    collapseWindow()
  }
  broadcastWindowState()
  return { isCollapsed }
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
