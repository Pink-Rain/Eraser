import { createHash } from "node:crypto"
import { gunzipSync, gzipSync } from "node:zlib"

import { freshAfter } from "@/lib/request-freshness"
import { listSharedRecords, readSharedRecord, sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"

/**
 * Les lectures de Google Sheets partagées entre les installations, par le serveur partagé
 * d'Eraser.
 *
 * Toutes les installations lisent Google avec le même compte : un seul quota de requêtes
 * par minute pour toute la table. En début de séance, les cinq joueurs ouvrent la même
 * campagne au même moment, et chaque installation lisait les mêmes feuilles (index,
 * personnages, PNJ, objets…) : cinq fois chaque lecture, le quota épuisé dès la première
 * page, et un seul joueur servi par minute.
 *
 * Désormais, pour une lecture simple (GET) :
 * - une copie déposée par une autre installation il y a moins de COPY_MS est reprise telle
 *   quelle, sans toucher à Google ;
 * - sinon, une seule installation lit Google (un « bail » sur le serveur partagé) ; les
 *   autres attendent sa copie quelques secondes au plus, puis lisent Google elles-mêmes ;
 * - toute écriture d'Eraser dans un classeur, depuis n'importe quelle installation, en
 *   change la version : ses copies ne servent plus ;
 * - après « Actualiser », seule une lecture commencée après le clic est reprise ou attendue :
 *   cinq joueurs qui cliquent au même instant se partagent une lecture, des clics espacés
 *   en font plusieurs, et chacun voit Google tel qu'il était à son clic.
 *
 * Les lectures qui décident d'une écriture (positions de lignes, colonnes) restent lues
 * directement dans Google (lectures fraîches, en POST) : elles ne passent jamais par ici.
 * Google Sheets reste la source ; le serveur partagé ne garde qu'une copie de passage.
 */
const COPY_MS = 45_000
/**
 * L'installation qui lit Google pour les autres renouvelle son bail toutes les LEASE_BEAT_MS
 * (Google peut la faire patienter pendant une pause de quota). Un bail qui n'a pas été
 * renouvelé depuis LEASE_MS est abandonné : elle a échoué ou s'est arrêtée.
 */
const LEASE_BEAT_MS = 3_000
const LEASE_MS = 8_000
/** Le temps de laisser arriver les baux posés au même instant par d'autres installations. */
const LEASE_SETTLE_MS = 200
/** Au plus, le temps d'attendre la copie d'une installation qui lit encore (la patience de la porte du quota). */
const WAIT_MS = 80_000
/** Le serveur partagé est interrogé souvent au début de l'attente, puis plus calmement. */
const POLL_MS = [300, 400, 600, 900, 1_300, 2_000]
/** Le serveur partagé lent ou injoignable ne retarde jamais une lecture de plus que cela. */
const LOOKUP_TIMEOUT_MS = 2_500
/** Le serveur partagé refuse une valeur de plus de 20 000 caractères : la copie est découpée. */
const PART_SIZE = 18_000
/** Une copie plus grosse (compressée) n'est pas partagée : chacun lit Google. */
const MAX_PARTS = 40
/** La version d'un classeur, gardée un instant : une page lit souvent plusieurs plages du même. */
const VERSION_MEMORY_MS = 2_000

const VERSION_SCOPE = "sheet-versions"
const INSTALLATION = crypto.randomUUID()

let enabled = true

/** Pour les tests : partage coupé, chaque lecture va dans Google. */
export function setSharedReadsEnabled(value: boolean) {
  enabled = value
}

export function sharedReadsActive() {
  return enabled && sharedStoreAvailable()
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex")
/** La portée d'une lecture : sans le `quotaUser`, propre à chaque installation. */
const scopeOf = (path: string) => `sheet-read:${sha(path.replace(/[?&]quotaUser=[^&]*/, "")).slice(0, 40)}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("SHARED_READ_TIMEOUT")), ms) }),
  ])
}

const versions = new Map<string, { value: string; at: number }>()

async function versionOf(spreadsheetId: string) {
  const known = versions.get(spreadsheetId)
  if (known && Date.now() - known.at < VERSION_MEMORY_MS) return known.value
  const value = (await readSharedRecord(VERSION_SCOPE, spreadsheetId))?.value ?? "0"
  versions.set(spreadsheetId, { value, at: Date.now() })
  return value
}

/** Eraser vient d'écrire dans ce classeur : ses copies partagées ne servent plus, pour personne. */
export async function markSpreadsheetChanged(spreadsheetId: string) {
  if (!sharedReadsActive()) return
  const value = `${Date.now()}-${INSTALLATION.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`
  versions.set(spreadsheetId, { value, at: Date.now() })
  await writeSharedRecord(VERSION_SCOPE, spreadsheetId, value).catch((error) => {
    console.error("SHARED_READ_VERSION_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  })
}

type Manifest = { v: string; at: number; parts: number; sum: string }
/** `at` : dernier renouvellement ; `since` : début de la lecture, qui dit pour qui sa copie vaudra. */
type Lease = { by: string; at: number; since: number }

function parseJson<T>(value: string | undefined): T | null {
  try {
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

/** La copie de la portée si elle vaut pour cette version, assez récente, et lue après `after`. */
function copyFrom(records: Array<{ key: string; value: string }>, version: string, after: number) {
  const byKey = new Map(records.map((record) => [record.key, record.value]))
  const manifest = parseJson<Manifest>(byKey.get("manifest"))
  if (!manifest || manifest.v !== version || Date.now() - manifest.at > COPY_MS || (after > 0 && manifest.at < after)) return null
  if (!Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > MAX_PARTS) return null
  const parts: string[] = []
  for (let index = 0; index < manifest.parts; index += 1) {
    const part = byKey.get(`part:${index}`)
    if (part === undefined) return null
    parts.push(part)
  }
  const packed = parts.join("")
  // Une copie en cours de remplacement (morceaux de deux lectures) : on ne la prend pas.
  if (sha(packed).slice(0, 24) !== manifest.sum) return null
  try {
    return gunzipSync(Buffer.from(packed, "base64")).toString("utf8")
  } catch {
    return null
  }
}

/** Dépose la copie ; faux si elle est trop grosse pour être partagée. */
async function publish(scope: string, text: string, version: string, readAt: number) {
  const packed = gzipSync(Buffer.from(text, "utf8")).toString("base64")
  const parts = Array.from({ length: Math.ceil(packed.length / PART_SIZE) }, (_, index) => packed.slice(index * PART_SIZE, (index + 1) * PART_SIZE))
  if (!parts.length || parts.length > MAX_PARTS) return false
  await Promise.all(parts.map((part, index) => writeSharedRecord(scope, `part:${index}`, part)))
  const manifest: Manifest = { v: version, at: readAt, parts: parts.length, sum: sha(packed).slice(0, 24) }
  await writeSharedRecord(scope, "manifest", JSON.stringify(manifest))
  return true
}

/**
 * Une lecture simple de Google Sheets (`readGoogle` rend le texte de la réponse), partagée
 * avec les autres installations. Sans serveur partagé, ou s'il ne répond pas assez vite,
 * c'est exactement la lecture d'avant.
 */
export async function sharedSheetRead(spreadsheetId: string, path: string, readGoogle: () => Promise<string>) {
  if (!sharedReadsActive()) return readGoogle()
  const scope = scopeOf(path)
  const after = await freshAfter()
  let version = ""
  // Une autre installation lit Google, son bail est encore renouvelé, et sa lecture a commencé
  // après « Actualiser » : sa copie conviendra. Commencée avant le clic, elle ne conviendrait
  // pas : inutile de l'attendre.
  const worthWaiting = (lease: Lease | null) => Boolean(lease && lease.by !== INSTALLATION && Date.now() - lease.at < LEASE_MS && (lease.since ?? 0) >= after)
  let ownLease: Lease | null = null
  try {
    const [currentVersion, records] = await withTimeout(Promise.all([versionOf(spreadsheetId), listSharedRecords(scope)]), LOOKUP_TIMEOUT_MS)
    version = currentVersion
    const copy = copyFrom(records, version, after)
    if (copy !== null) return copy
    let holder = parseJson<Lease>(records.find((record) => record.key === "lease")?.value)
    if (!worthWaiting(holder)) {
      // Plusieurs installations peuvent poser leur bail au même instant : la dernière écrite
      // l'emporte, et chacune relit pour savoir si c'est elle.
      const since = Date.now()
      const mine: Lease = { by: INSTALLATION, at: since, since }
      await withTimeout(writeSharedRecord(scope, "lease", JSON.stringify(mine)), LOOKUP_TIMEOUT_MS)
      await sleep(LEASE_SETTLE_MS)
      holder = parseJson<Lease>((await withTimeout(readSharedRecord(scope, "lease"), LOOKUP_TIMEOUT_MS))?.value)
      if (!holder || holder.by === INSTALLATION) ownLease = mine
    }
    // Une autre installation lit Google : sa copie arrive dès qu'elle a sa réponse. On
    // l'attend tant que son bail est renouvelé ; rendu ou abandonné, on lit soi-même.
    const deadline = Date.now() + WAIT_MS
    for (let round = 0; !ownLease && worthWaiting(holder) && Date.now() < deadline; round += 1) {
      await sleep(POLL_MS[Math.min(round, POLL_MS.length - 1)])
      const records = await withTimeout(listSharedRecords(scope), LOOKUP_TIMEOUT_MS)
      const waited = copyFrom(records, version, after)
      if (waited !== null) return waited
      holder = parseJson<Lease>(records.find((record) => record.key === "lease")?.value)
    }
  } catch (error) {
    // Le serveur partagé ne répond pas (ou trop lentement) : Google directement, comme avant.
    if (!(error instanceof Error && error.message === "SHARED_READ_TIMEOUT")) console.error("SHARED_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  }
  // Google n'est lu qu'ici, une seule fois : son refus remonte tel quel à la porte du quota.
  return readAndPublish(scope, version, ownLease, readGoogle)
}

/**
 * Lit Google, puis dépose la copie pour les autres installations. Avec un bail (`lease`), il
 * est renouvelé pendant que Google répond (ou fait patienter) et rendu si personne ne doit
 * attendre la copie : échec, copie trop grosse, version inconnue.
 */
async function readAndPublish(scope: string, version: string, lease: Lease | null, readGoogle: () => Promise<string>) {
  const write = (value: Lease) => { void writeSharedRecord(scope, "lease", JSON.stringify(value)).catch(() => undefined) }
  const release = () => { if (lease) write({ by: INSTALLATION, at: 0, since: 0 }) }
  const startedAt = Date.now()
  const beat = lease ? setInterval(() => write({ ...lease, at: Date.now() }), LEASE_BEAT_MS) : undefined
  let text: string
  try {
    text = await readGoogle()
  } catch (error) {
    release()
    throw error
  } finally {
    clearInterval(beat)
  }
  // La version relevée avant de lire Google : une écriture faite entre-temps en change la
  // version, et cette copie (peut-être d'avant l'écriture) ne servira à personne.
  if (version) void publish(scope, text, version, startedAt).then((published) => {
    if (!published) release()
  }, (error) => {
    console.error("SHARED_READ_PUBLISH_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    release()
  })
  else release()
  return text
}
