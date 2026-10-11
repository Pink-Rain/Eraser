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
 *   en font plusieurs, et chacun voit Google tel qu'il était à son clic ;
 * - une réponse trop grosse pour être partagée est ensuite lue directement dans Google, sans
 *   bail ni attente, par cette installation comme par celles qui voient le bail rendu.
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
/**
 * Le temps de laisser arriver les baux posés au même instant par d'autres installations.
 *
 * Une autre installation B n'a pu poser son bail par-dessus le nôtre que si elle a vérifié
 * le serveur partagé avant que le nôtre y soit écrit (sinon elle l'aurait vu et attendrait).
 * Son bail arrive alors au plus un aller-retour de B après le nôtre ; notre relecture, elle,
 * arrive un aller-retour à nous plus cette pause après le nôtre. La pause n'a donc à couvrir
 * que l'écart de latence entre deux installations (les joueurs d'une même table ont des
 * latences voisines vers le même Worker), pas une latence entière : 100 ms suffisent là où
 * 200 ms étaient payés par chaque lecture froide. Un bail manqué ne coûte qu'une lecture
 * Google en double (chacun se croit seul et dépose sa copie), jamais une donnée fausse.
 */
const LEASE_SETTLE_MS = 100
/** Au plus, le temps d'attendre la copie d'une installation qui lit encore (la patience de la porte du quota). */
const WAIT_MS = 80_000
/** Le serveur partagé est interrogé souvent au début de l'attente, puis plus calmement. */
const POLL_MS = [300, 400, 600, 900, 1_300, 2_000]
/**
 * Le serveur partagé lent ou injoignable ne retarde jamais une lecture de plus que cela (par
 * question : version, copie, bail). Une question ne demande qu'un aller-retour réseau ; au-delà
 * (Worker qui démarre, réseau saturé), Google est lu directement, comme sans partage : attendre
 * plus longtemps coûtait davantage que la lecture qu'on voulait éviter (2,5 s par question).
 */
const LOOKUP_TIMEOUT_MS = 800
/** Le téléchargement d'une copie qu'on sait bonne (elle remplace une lecture de Google). */
const COPY_FETCH_TIMEOUT_MS = 2_500
/** Le serveur partagé refuse une valeur de plus de 20 000 caractères : la copie est découpée. */
const PART_SIZE = 18_000
/** Une copie plus grosse (compressée) n'est pas partagée : chacun lit Google. */
const MAX_PARTS = 40
/**
 * Une lecture trop grosse pour être partagée (l'index des objets avec ses grilles, une
 * feuille très large) est lue directement dans Google pendant ce temps : ni bail, ni attente,
 * ni copie compressée pour rien. Avant, chaque lecture froide de ces plages prenait le bail,
 * faisait patienter les autres installations, puis tout le monde relisait Google quand même.
 */
const OVERSIZE_MEMORY_MS = 10 * 60_000
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

/** Les portées trop grosses pour être partagées, jusqu'à quand. */
const oversize = new Map<string, number>()

function knownOversize(scope: string) {
  const until = oversize.get(scope)
  if (until === undefined) return false
  if (until > Date.now()) return true
  oversize.delete(scope)
  return false
}

function rememberOversize(scope: string) {
  oversize.set(scope, Date.now() + OVERSIZE_MEMORY_MS)
}

// La lecture en cours est partagée : dix plages du même classeur demandées ensemble par une
// page ne posent qu'une question au serveur partagé, pas dix.
const versions = new Map<string, { value: Promise<string>; at: number }>()

function versionOf(spreadsheetId: string) {
  const known = versions.get(spreadsheetId)
  if (known && Date.now() - known.at < VERSION_MEMORY_MS) return known.value
  const value = readSharedRecord(VERSION_SCOPE, spreadsheetId).then((record) => record?.value ?? "0")
  const entry = { value, at: Date.now() }
  versions.set(spreadsheetId, entry)
  // Une question restée sans réponse n'est pas gardée : la suivante la repose.
  value.catch(() => { if (versions.get(spreadsheetId) === entry) versions.delete(spreadsheetId) })
  return value
}

/** Eraser vient d'écrire dans ce classeur : ses copies partagées ne servent plus, pour personne. */
export async function markSpreadsheetChanged(spreadsheetId: string) {
  if (!sharedReadsActive()) return
  const value = `${Date.now()}-${INSTALLATION.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`
  versions.set(spreadsheetId, { value: Promise.resolve(value), at: Date.now() })
  await writeSharedRecord(VERSION_SCOPE, spreadsheetId, value).catch((error) => {
    console.error("SHARED_READ_VERSION_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  })
}

type Manifest = { v: string; at: number; parts: number; sum: string }
/**
 * `at` : dernier renouvellement ; `since` : début de la lecture, qui dit pour qui sa copie vaudra.
 * `big` : le bail rendu parce que la réponse était trop grosse pour être partagée (l'instant) :
 * les autres installations lisent alors Google directement, sans reprendre le bail.
 */
type Lease = { by: string; at: number; since: number; big?: number }

function parseJson<T>(value: string | undefined): T | null {
  try {
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

/** Le manifeste décrit-il une copie valable pour cette version, assez récente, et lue après `after` ? */
function usableManifest(manifest: Manifest | null, version: string, after: number): manifest is Manifest {
  if (!manifest || manifest.v !== version || Date.now() - manifest.at > COPY_MS || (after > 0 && manifest.at < after)) return false
  return Number.isInteger(manifest.parts) && manifest.parts >= 1 && manifest.parts <= MAX_PARTS
}

/** La copie de la portée si elle vaut pour cette version, assez récente, et lue après `after`. */
function copyFrom(records: Array<{ key: string; value: string }>, version: string, after: number) {
  const byKey = new Map(records.map((record) => [record.key, record.value]))
  const manifest = parseJson<Manifest>(byKey.get("manifest"))
  if (!usableManifest(manifest, version, after)) return null
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

/**
 * Le manifeste et le bail seuls (deux petites questions en parallèle) : la portée entière
 * contient aussi les morceaux de la dernière copie, jusqu'à 720 Ko, téléchargés pour rien
 * quand elle est périmée — c'est-à-dire presque toujours pour un joueur seul.
 */
async function lookUp(scope: string) {
  const [manifest, lease] = await withTimeout(Promise.all([readSharedRecord(scope, "manifest"), readSharedRecord(scope, "lease")]), LOOKUP_TIMEOUT_MS)
  return { manifest: parseJson<Manifest>(manifest?.value), lease: parseJson<Lease>(lease?.value) }
}

/**
 * La copie, téléchargée seulement si son manifeste dit qu'elle convient (null sinon). Le
 * manifeste est revérifié avec les morceaux : une copie remplacée entre-temps est écartée.
 */
async function fetchCopy(scope: string, manifest: Manifest | null, version: string, after: number) {
  if (!usableManifest(manifest, version, after)) return null
  return copyFrom(await withTimeout(listSharedRecords(scope), COPY_FETCH_TIMEOUT_MS), version, after)
}

/** Le bail a été rendu récemment parce que la réponse était trop grosse pour être partagée. */
const markedOversize = (lease: Lease | null) => Boolean(lease?.big && Date.now() - lease.big < OVERSIZE_MEMORY_MS)

/** Dépose la copie ; faux si elle est trop grosse pour être partagée (retenu aussitôt). */
async function publish(scope: string, text: string, version: string, readAt: number) {
  const packed = gzipSync(Buffer.from(text, "utf8")).toString("base64")
  const parts = Array.from({ length: Math.ceil(packed.length / PART_SIZE) }, (_, index) => packed.slice(index * PART_SIZE, (index + 1) * PART_SIZE))
  if (parts.length > MAX_PARTS) rememberOversize(scope)
  if (!parts.length || parts.length > MAX_PARTS) return false
  await Promise.all(parts.map((part, index) => writeSharedRecord(scope, `part:${index}`, part)))
  const manifest: Manifest = { v: version, at: readAt, parts: parts.length, sum: sha(packed).slice(0, 24) }
  await writeSharedRecord(scope, "manifest", JSON.stringify(manifest))
  return true
}

/**
 * Une lecture simple de Google Sheets (`readGoogle` rend le texte de la réponse), partagée
 * avec les autres installations. Sans serveur partagé, s'il ne répond pas assez vite, ou
 * pour une réponse trop grosse pour être partagée, c'est exactement la lecture d'avant.
 */
export async function sharedSheetRead(spreadsheetId: string, path: string, readGoogle: () => Promise<string>) {
  if (!sharedReadsActive()) return readGoogle()
  const scope = scopeOf(path)
  // Trop grosse pour être partagée : personne n'aurait de copie à reprendre ni à attendre.
  if (knownOversize(scope)) return readGoogle()
  const after = await freshAfter()
  let version = ""
  // Une autre installation lit Google, son bail est encore renouvelé, et sa lecture a commencé
  // après « Actualiser » : sa copie conviendra. Commencée avant le clic, elle ne conviendrait
  // pas : inutile de l'attendre.
  const worthWaiting = (lease: Lease | null) => Boolean(lease && lease.by !== INSTALLATION && Date.now() - lease.at < LEASE_MS && (lease.since ?? 0) >= after)
  let ownLease: Lease | null = null
  // Le bail posé mais pas encore confirmé : si le serveur partagé cesse de répondre à ce
  // moment, on se comporte en détenteur (bail renouvelé, copie déposée, bail rendu) plutôt
  // que de laisser les autres attendre un bail que personne ne renouvellerait.
  let claimed: Lease | null = null
  try {
    const [currentVersion, found] = await withTimeout(Promise.all([versionOf(spreadsheetId), lookUp(scope)]), LOOKUP_TIMEOUT_MS)
    version = currentVersion
    const copy = await fetchCopy(scope, found.manifest, version, after)
    if (copy !== null) return copy
    let holder = found.lease
    // Google n'est jamais lu dans ce bloc : une erreur de Google y serait prise pour une panne
    // du serveur partagé, et Google relu une seconde fois.
    if (markedOversize(holder)) rememberOversize(scope)
    else if (!worthWaiting(holder)) {
      // Plusieurs installations peuvent poser leur bail au même instant : la dernière écrite
      // l'emporte, et chacune relit pour savoir si c'est elle.
      const since = Date.now()
      const mine: Lease = { by: INSTALLATION, at: since, since }
      claimed = mine
      await withTimeout(writeSharedRecord(scope, "lease", JSON.stringify(mine)), LOOKUP_TIMEOUT_MS)
      await sleep(LEASE_SETTLE_MS)
      holder = parseJson<Lease>((await withTimeout(readSharedRecord(scope, "lease"), LOOKUP_TIMEOUT_MS))?.value)
      claimed = null
      if (!holder || holder.by === INSTALLATION) ownLease = mine
    }
    // Une autre installation lit Google : sa copie arrive dès qu'elle a sa réponse. On
    // l'attend tant que son bail est renouvelé ; rendu, abandonné, ou rendu parce que la
    // réponse était trop grosse pour être partagée, on lit soi-même.
    const deadline = Date.now() + WAIT_MS
    for (let round = 0; !ownLease && !knownOversize(scope) && worthWaiting(holder) && Date.now() < deadline; round += 1) {
      await sleep(POLL_MS[Math.min(round, POLL_MS.length - 1)])
      const polled = await lookUp(scope)
      const waited = await fetchCopy(scope, polled.manifest, version, after)
      if (waited !== null) return waited
      holder = polled.lease
      if (markedOversize(holder)) rememberOversize(scope)
    }
  } catch (error) {
    // Le serveur partagé ne répond pas (ou trop lentement) : Google directement, comme avant.
    if (!(error instanceof Error && error.message === "SHARED_READ_TIMEOUT")) console.error("SHARED_READ_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    if (claimed) ownLease = claimed
  }
  // Trop grosse pour être partagée (une autre installation vient de le signaler) : Google
  // directement, sans bail ni copie.
  if (!ownLease && knownOversize(scope)) return readGoogle()
  // Google n'est lu qu'ici, une seule fois : son refus remonte tel quel à la porte du quota.
  return readAndPublish(scope, version, ownLease, readGoogle)
}

/**
 * Lit Google, puis dépose la copie pour les autres installations. Avec un bail (`lease`), il
 * est renouvelé pendant que Google répond (ou fait patienter) et rendu si personne ne doit
 * attendre la copie : échec, copie trop grosse (signalé dans le bail rendu), version inconnue.
 */
async function readAndPublish(scope: string, version: string, lease: Lease | null, readGoogle: () => Promise<string>) {
  const write = (value: Lease) => { void writeSharedRecord(scope, "lease", JSON.stringify(value)).catch(() => undefined) }
  const release = () => { if (lease) write({ by: INSTALLATION, at: 0, since: 0, ...(knownOversize(scope) ? { big: Date.now() } : {}) }) }
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
