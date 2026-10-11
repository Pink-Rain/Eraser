/**
 * Le journal des erreurs du serveur local : les dernières lignes écrites par
 * `console.error` (une lecture Google refusée, une écriture ratée…), gardées en mémoire
 * pour la page Administration. Rien n'est écrit sur le disque ni envoyé ailleurs ; le
 * journal repart à zéro quand Eraser redémarre.
 */
export type ErrorJournalEntry = { at: string; message: string }

const JOURNAL = Symbol.for("eraser.errorJournal")
const MAX_ENTRIES = 300

type JournalHolder = { [JOURNAL]?: { entries: ErrorJournalEntry[]; installed: boolean } }

function journal() {
  const holder = globalThis as JournalHolder
  holder[JOURNAL] ??= { entries: [], installed: false }
  return holder[JOURNAL]
}

function text(value: unknown) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === "string") return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

/**
 * Ce qui passe par `console.error` sans être une erreur d'Eraser : gardé dans la sortie du
 * serveur (le log de démarrage), mais pas dans le journal de la page Administration.
 */
const NOT_ERRORS = [
  // Les avertissements de dépréciation de Node (DEP0180 : lu dans l'archive .asar par Electron).
  /^\(node:\d+\) \[DEP\d+\] DeprecationWarning/,
  // La page a fermé sa connexion (F5, page quittée) avant la fin de la réponse : rien n'a échoué.
  /^\[vinext\] Server error: Error \[ERR_STREAM_(UNABLE_TO_PIPE|PREMATURE_CLOSE)\]/,
]

export function isJournaledError(message: string) {
  return !NOT_ERRORS.some((pattern) => pattern.test(message))
}

/** Branche le journal sur `console.error` (une seule fois par processus). */
export function installErrorJournal() {
  const state = journal()
  if (state.installed || typeof console === "undefined") return
  state.installed = true
  const original = console.error.bind(console)
  console.error = (...values: unknown[]) => {
    try {
      const message = values.map(text).join(" ").slice(0, 2000)
      if (isJournaledError(message)) state.entries.push({ at: new Date().toISOString(), message })
      if (state.entries.length > MAX_ENTRIES) state.entries.splice(0, state.entries.length - MAX_ENTRIES)
    } catch {
      // Le journal ne doit jamais empêcher l'erreur d'être écrite.
    }
    original(...values)
  }
}

/** Les erreurs gardées, de la plus récente à la plus ancienne. */
export function readErrorJournal() {
  return [...journal().entries].reverse()
}

export function clearErrorJournal() {
  journal().entries.length = 0
}
