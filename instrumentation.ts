/**
 * Démarrage du serveur local (chargé par vinext à la première requête).
 *
 * Filet de sécurité : vinext installe un gestionnaire qui relance toute erreur non
 * rattrapée (hors coupure de connexion), ce qui fermait le service local entier (« Le
 * service local s'est fermé (code 7) ») pour une seule promesse rejetée, une requête
 * Google ratée en arrière-plan par exemple. Sur une application de bureau, perdre tout
 * Eraser pour une tâche de fond est pire que l'erreur elle-même : elle est écrite dans le
 * journal (« eraser-startup.log », lignes [service:error]) et le service continue.
 */
const SAFETY_NET = Symbol.for("eraser.processSafetyNet")

function describe(reason: unknown) {
  if (reason instanceof Error) return reason.stack || `${reason.name}: ${reason.message}`
  try { return typeof reason === "string" ? reason : JSON.stringify(reason) } catch { return String(reason) }
}

/**
 * Posé dès le chargement du serveur (ce fichier est importé au démarrage, avant toute
 * requête), puis vérifié de nouveau par `register()` : aucune fenêtre au lancement.
 */
function installSafetyNet() {
  if (typeof process === "undefined" || typeof process.on !== "function") return
  const proc = process as typeof process & { [SAFETY_NET]?: true }
  if (proc[SAFETY_NET]) return
  proc[SAFETY_NET] = true
  // Le gestionnaire de vinext relance l'erreur (et ferme le service) : il est remplacé.
  process.removeAllListeners("uncaughtException")
  process.removeAllListeners("unhandledRejection")
  process.on("uncaughtException", (error) => {
    console.error(`[eraser] Erreur non rattrapée, le service continue : ${describe(error)}`)
  })
  process.on("unhandledRejection", (reason) => {
    console.error(`[eraser] Promesse rejetée sans traitement, le service continue : ${describe(reason)}`)
  })
}

installSafetyNet()

export function register() {
  installSafetyNet()
}
