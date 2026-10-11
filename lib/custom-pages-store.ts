/**
 * Où vivent les pages du créateur de pages : sur le serveur partagé d'Eraser (le Worker,
 * `shared_records`), comme les cartes et les vues des index. Ce sont des réglages d'Eraser,
 * pas des données JDR : rien n'est écrit dans Google Sheets, et toutes les installations
 * voient les mêmes pages.
 *
 * Portée « custom-pages », une page par clé (son identifiant). Le serveur partagé refuse
 * une valeur de plus de 20 000 caractères : une grande page s'écrit en morceaux. L'entrée
 * « <id> » dit alors combien (`parts`) et de quelle écriture (`gen`) ; les morceaux sont
 * « <id>#<gen>#1 » à « <id>#<gen>#n ». Les nouveaux morceaux sont écrits avant l'entrée
 * qui les désigne, puis les anciens sont effacés : un lecteur ne voit jamais un mélange.
 *
 * Deux personnes dans l'atelier : chaque enregistrement part de la version qu'il a ouverte
 * (`updatedAt`) ; si la page a changé entre-temps, il est refusé (CUSTOM_PAGE_CHANGED).
 * Les révélations et les carnets (`live`) ne touchent pas à `updatedAt` : un joueur qui
 * écrit dans un carnet ne bloque pas l'atelier.
 *
 * Les modèles : portée « custom-page-templates », même découpage.
 */
import { withAsyncLock } from "@/lib/async-lock"
import {
  cleanCustomPage,
  cleanTemplateName,
  contentOf,
  findBlock,
  newId,
  PAGE_LIMITS,
  pageHref,
  parseCustomPage,
  parseTemplate,
  reIdContent,
  samePlace,
  slugProblem,
  templateContent,
  type CustomPage,
  type LiveBlockState,
  type PageAuthor,
  type PageTemplate,
} from "@/lib/custom-pages"
import { replacementLabel } from "@/lib/page-replacements"
import { deleteSharedRecord, listSharedRecords, readSharedRecord, sharedStoreAvailable, writeSharedRecord, type SharedRecord } from "@/lib/shared-store"

export const PAGES_SCOPE = "custom-pages"
export const TEMPLATES_SCOPE = "custom-page-templates"
/** Une valeur du serveur partagé : 20 000 caractères au plus ; on garde de la marge. */
export const CHUNK_SIZE = 18_000
const PART = "#"

/** Une erreur dont le message est montré tel quel ; `status` : le code HTTP. */
export class PageStoreError extends Error {
  constructor(public code: string, public userMessage: string, public status = 400) {
    super(code)
  }
}

const unavailable = () => new PageStoreError("CUSTOM_PAGES_UNAVAILABLE", "Les pages se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.", 503)
const notFound = () => new PageStoreError("CUSTOM_PAGE_NOT_FOUND", "Cette page n’existe plus (supprimée entre-temps ?).", 404)
const changed = (by: string) => new PageStoreError("CUSTOM_PAGE_CHANGED", `La page a été modifiée entre-temps${by ? ` par ${by}` : ""}. Recharge-la pour voir sa dernière version, puis refais ta modification.`, 409)

/* ---------- Découpage en morceaux ---------- */

/** Coupe un texte en morceaux sans séparer les deux moitiés d'un caractère (émojis). */
export function splitChunks(value: string, size = CHUNK_SIZE) {
  const parts: string[] = []
  let start = 0
  while (start < value.length) {
    let end = Math.min(value.length, start + size)
    const code = value.charCodeAt(end - 1)
    if (end < value.length && code >= 0xd800 && code <= 0xdbff) end -= 1
    parts.push(value.slice(start, end))
    start = end
  }
  return parts
}

type Head = { v: 1; parts: number; gen?: string; value?: string }

function headOf(raw: string): Head | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Head>
    if (parsed?.v !== 1 || typeof parsed.parts !== "number") return null
    return { v: 1, parts: parsed.parts, gen: typeof parsed.gen === "string" ? parsed.gen : undefined, value: typeof parsed.value === "string" ? parsed.value : undefined }
  } catch { return null }
}

/** Écrit une valeur, en morceaux si elle est trop longue ; efface les morceaux d'avant. */
export async function writeChunked(scope: string, key: string, value: string, known?: SharedRecord[]) {
  const head: Head = { v: 1, parts: 0, value }
  const single = JSON.stringify(head)
  const previous = (known ?? await listSharedRecords(scope)).filter((record) => record.key.startsWith(`${key}${PART}`)).map((record) => record.key)
  if (single.length <= CHUNK_SIZE) {
    await writeSharedRecord(scope, key, single)
  } else {
    const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const parts = splitChunks(value)
    for (const [index, part] of parts.entries()) await writeSharedRecord(scope, `${key}${PART}${gen}${PART}${index + 1}`, part)
    await writeSharedRecord(scope, key, JSON.stringify({ v: 1, parts: parts.length, gen } satisfies Head))
    for (const stale of previous) if (!stale.startsWith(`${key}${PART}${gen}${PART}`)) await deleteSharedRecord(scope, stale)
    return
  }
  for (const stale of previous) await deleteSharedRecord(scope, stale)
}

/** Recolle les valeurs d'une portée (une liste du serveur partagé) : `[clé, valeur]`. */
export function assembleChunks(records: Array<Pick<SharedRecord, "key" | "value">>) {
  const byKey = new Map(records.map((record) => [record.key, record.value]))
  const out: Array<[string, string]> = []
  for (const record of records) {
    if (record.key.includes(PART)) continue
    const head = headOf(record.value)
    if (!head) continue
    if (!head.parts) { if (head.value !== undefined) out.push([record.key, head.value]); continue }
    const parts: string[] = []
    for (let index = 1; index <= head.parts; index += 1) {
      const part = byKey.get(`${record.key}${PART}${head.gen}${PART}${index}`)
      if (part === undefined) break
      parts.push(part)
    }
    // Un morceau manquant (écriture interrompue) : la valeur n'est pas lisible, elle est ignorée.
    if (parts.length === head.parts) out.push([record.key, parts.join("")])
  }
  return out
}

/** Une seule valeur, relue à l'instant (avant une écriture). */
export async function readChunked(scope: string, key: string) {
  const record = await readSharedRecord(scope, key)
  if (!record) return null
  const head = headOf(record.value)
  if (!head) return null
  if (!head.parts) return head.value ?? null
  const parts = await Promise.all(Array.from({ length: head.parts }, (_, index) => readSharedRecord(scope, `${key}${PART}${head.gen}${PART}${index + 1}`)))
  return parts.every(Boolean) ? parts.map((part) => part!.value).join("") : null
}

export async function deleteChunked(scope: string, key: string) {
  const stale = (await listSharedRecords(scope)).filter((record) => record.key.startsWith(`${key}${PART}`))
  await deleteSharedRecord(scope, key)
  for (const record of stale) await deleteSharedRecord(scope, record.key)
}

/* ---------- Les pages ---------- */

let cache: { expiresAt: number; promise: Promise<CustomPage[]> } | null = null

async function readAll() {
  if (!sharedStoreAvailable()) return []
  return assembleChunks(await listSharedRecords(PAGES_SCOPE)).flatMap(([, value]) => { const page = parseCustomPage(value); return page ? [page] : [] })
}

/** Toutes les pages (corbeille comprise), gardées quinze secondes en mémoire. */
export function listCustomPages(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return cache.promise
  const promise = readAll()
  cache = { expiresAt: Date.now() + 15_000, promise }
  promise.catch(() => { if (cache?.promise === promise) cache = null })
  return promise
}

export function forgetCustomPages() {
  cache = null
}

export async function readCustomPage(id: string, options: { fresh?: boolean } = {}) {
  if (options.fresh) {
    if (!sharedStoreAvailable()) return null
    const value = await readChunked(PAGES_SCOPE, id)
    return value ? parseCustomPage(value) : null
  }
  return (await listCustomPages()).find((page) => page.id === id) ?? null
}

/** La page à cette adresse (section, campagne ou hors menu), hors corbeille. */
export async function findCustomPage(place: CustomPage["place"], slug: string, campaignId = "") {
  return (await listCustomPages()).find((page) => !page.trashedAt && page.place === place && page.slug === slug && (place !== "campagne" || page.campaignId === campaignId)) ?? null
}

/** Un horodatage toujours plus récent que `previous` (deux écritures dans la même milliseconde). */
function nextStamp(previous = "") {
  const now = Date.now()
  const before = Date.parse(previous)
  return new Date(Number.isFinite(before) && before >= now ? before + 1 : now).toISOString()
}

async function persist(page: CustomPage) {
  const value = JSON.stringify(page)
  if (value.length > PAGE_LIMITS.json) throw new PageStoreError("CUSTOM_PAGE_TOO_LARGE", "Cette page est trop grande pour être enregistrée : retire quelques blocs ou découpe-la en deux pages.", 413)
  await writeChunked(PAGES_SCOPE, page.id, value)
  const list = await (cache?.promise.catch(() => null) ?? Promise.resolve(null))
  // La liste gardée suit tout de suite (sans relire tout le serveur partagé).
  if (list) {
    const next = [...list.filter((item) => item.id !== page.id), page]
    cache = { expiresAt: Date.now() + 15_000, promise: Promise.resolve(next) }
  }
  return page
}

/** Lit la page à l'instant, sous verrou, et applique `change` ; rien n'est écrit si elle a disparu. */
function mutate(id: string, change: (page: CustomPage) => Promise<CustomPage> | CustomPage) {
  if (!sharedStoreAvailable()) return Promise.reject(unavailable())
  return withAsyncLock(`custom-page:${id}`, async () => {
    const current = await readCustomPage(id, { fresh: true })
    if (!current) throw notFound()
    return persist(await change(current))
  })
}

/** Vérifie que l'adresse est libre à cet endroit (pages hors corbeille). */
async function checkSlug(page: Pick<CustomPage, "id" | "slug" | "place" | "campaignId">) {
  const others = (await listCustomPages({ fresh: true })).filter((other) => other.id !== page.id && !other.trashedAt && samePlace(other, page))
  const problem = slugProblem(page.slug, page.place, others.map((other) => other.slug))
  if (problem) throw new PageStoreError("CUSTOM_PAGE_SLUG", problem, 409)
}

/** Une adresse d'Eraser ne se remplace qu'une fois, et un index (ou un onglet) n'a qu'un modèle de page de ligne. */
async function checkUnique(page: Pick<CustomPage, "id" | "replaces" | "rowOf">) {
  const others = (await listCustomPages({ fresh: true })).filter((other) => other.id !== page.id && !other.trashedAt)
  const replacing = page.replaces ? others.find((other) => other.replaces === page.replaces) : undefined
  if (replacing) throw new PageStoreError("CUSTOM_PAGE_REPLACE_TAKEN", `« ${replacementLabel(page.replaces!)} » est déjà remplacée ou complétée par la page « ${replacing.title} ». Retire-la de là d’abord.`, 409)
  const row = page.rowOf ? others.find((other) => other.rowOf?.index === page.rowOf!.index && (other.rowOf.tab ?? "") === (page.rowOf!.tab ?? "")) : undefined
  if (row) throw new PageStoreError("CUSTOM_PAGE_ROW_TAKEN", `La page « ${row.title} » sert déjà de modèle aux lignes de cet index${page.rowOf?.tab ? ` (onglet ${page.rowOf.tab})` : ""}.`, 409)
}

/** Une nouvelle page, en brouillon. */
export async function createCustomPage(input: unknown, by: PageAuthor) {
  if (!sharedStoreAvailable()) throw unavailable()
  const draft = cleanCustomPage(input)
  const now = nextStamp()
  const page: CustomPage = { ...draft, id: newId("p"), status: "brouillon", createdAt: now, createdBy: by, updatedAt: now, updatedBy: by, published: null, publishedAt: "", publishedBy: null, trashedAt: "", trashedBy: null, live: {} }
  // Une adresse prise : un numéro s'ajoute (« guide-2 ») plutôt que de refuser la création.
  const taken = new Set((await listCustomPages({ fresh: true })).filter((other) => !other.trashedAt && samePlace(other, page)).map((other) => other.slug))
  let slug = page.slug
  for (let index = 2; slugProblem(slug, page.place, [...taken]) && index < 100; index += 1) slug = `${page.slug.slice(0, PAGE_LIMITS.slug - 4)}-${index}`
  page.slug = slug
  await checkSlug(page)
  // Copiée d'une page qui remplace ou sert de modèle : la copie ne le fait pas (une seule à la fois).
  delete page.replaces
  delete page.replaceMode
  delete page.rowOf
  return withAsyncLock(`custom-page:${page.id}`, () => persist(page))
}

/** Enregistre le brouillon et les réglages ; refusé si la page a changé depuis `base`. */
export function saveCustomPage(id: string, input: unknown, base: string, by: PageAuthor) {
  return mutate(id, async (current) => {
    if (base && current.updatedAt !== base) throw changed(current.updatedBy.name)
    const draft = cleanCustomPage(input)
    const next: CustomPage = { ...current, ...draft, updatedAt: nextStamp(current.updatedAt), updatedBy: by }
    if (!draft.replaces) { delete next.replaces; delete next.replaceMode }
    if (!draft.rowOf) delete next.rowOf
    if (next.slug !== current.slug || next.place !== current.place || next.campaignId !== current.campaignId) await checkSlug(next)
    if ((next.replaces && next.replaces !== current.replaces) || (next.rowOf && JSON.stringify(next.rowOf) !== JSON.stringify(current.rowOf))) await checkUnique(next)
    // Des blocs retirés : leur état vivant (révélation, carnet) part avec eux, sauf s'ils sont encore publiés.
    next.live = Object.fromEntries(Object.entries(current.live).filter(([blockId]) => findBlock(next, blockId) || (next.published && findBlock(next.published, blockId))))
    return next
  })
}

/** Publie le brouillon : il devient la version que lisent les joueurs. */
export function publishCustomPage(id: string, base: string, by: PageAuthor) {
  return mutate(id, (current) => {
    if (base && current.updatedAt !== base) throw changed(current.updatedBy.name)
    const now = nextStamp(current.updatedAt)
    return { ...current, status: "publiee", published: contentOf(current), publishedAt: now, publishedBy: by, updatedAt: now, updatedBy: by }
  })
}

/** Repasse la page en brouillon : seuls ceux qui peuvent la modifier la voient. */
export function unpublishCustomPage(id: string, base: string, by: PageAuthor) {
  return mutate(id, (current) => {
    if (base && current.updatedAt !== base) throw changed(current.updatedBy.name)
    return { ...current, status: "brouillon", updatedAt: nextStamp(current.updatedAt), updatedBy: by }
  })
}

/** « Revenir à la version publiée » : le brouillon reprend le contenu publié. */
export function revertCustomPage(id: string, base: string, by: PageAuthor) {
  return mutate(id, (current) => {
    if (base && current.updatedAt !== base) throw changed(current.updatedBy.name)
    if (!current.published) throw new PageStoreError("CUSTOM_PAGE_NEVER_PUBLISHED", "Cette page n’a jamais été publiée : il n’y a pas de version à reprendre.")
    return { ...current, ...current.published, updatedAt: nextStamp(current.updatedAt), updatedBy: by }
  })
}

export function trashCustomPage(id: string, by: PageAuthor) {
  return mutate(id, (current) => ({ ...current, trashedAt: nextStamp(), trashedBy: by }))
}

/** Sortie de la corbeille ; si son adresse a été reprise entre-temps, un numéro s'y ajoute. */
export function restoreCustomPage(id: string, by: PageAuthor) {
  return mutate(id, async (current) => {
    const taken = (await listCustomPages({ fresh: true })).filter((other) => other.id !== id && !other.trashedAt && samePlace(other, current)).map((other) => other.slug)
    let slug = current.slug
    for (let index = 2; slugProblem(slug, current.place, taken) && index < 100; index += 1) slug = `${current.slug.slice(0, PAGE_LIMITS.slug - 4)}-${index}`
    return { ...current, slug, trashedAt: "", trashedBy: null, updatedAt: nextStamp(current.updatedAt), updatedBy: by }
  })
}

/** Suppression définitive (administrateurs) : la page doit être à la corbeille. */
export async function deleteCustomPage(id: string) {
  if (!sharedStoreAvailable()) throw unavailable()
  await withAsyncLock(`custom-page:${id}`, async () => {
    const current = await readCustomPage(id, { fresh: true })
    if (!current) throw notFound()
    if (!current.trashedAt) throw new PageStoreError("CUSTOM_PAGE_NOT_TRASHED", "Mets d’abord la page à la corbeille.")
    await deleteChunked(PAGES_SCOPE, id)
  })
  const list = await (cache?.promise.catch(() => null) ?? Promise.resolve(null))
  if (list) cache = { expiresAt: Date.now() + 15_000, promise: Promise.resolve(list.filter((page) => page.id !== id)) }
}

/**
 * Change l'état vivant d'un bloc (révélation, carnet) sans toucher au brouillon. `check`
 * vérifie les droits et l'état sur la page relue à l'instant.
 */
export function updateLiveBlock(id: string, blockId: string, change: (page: CustomPage, state: LiveBlockState) => LiveBlockState | null) {
  return mutate(id, (current) => {
    const next = change(current, current.live[blockId] ?? {})
    const live = { ...current.live }
    if (next && Object.keys(next).length) live[blockId] = next
    else delete live[blockId]
    return { ...current, live }
  })
}

/** L'adresse des pages qui mènent à `id` (blocs Lien), pour l'atelier. */
export async function pagesLinkingTo(id: string) {
  return (await listCustomPages()).filter((page) => page.id !== id && !page.trashedAt && JSON.stringify(page.sections).includes(`"pageId":"${id}"`)).map((page) => ({ id: page.id, title: page.title, href: pageHref(page) }))
}

/* ---------- Les modèles ---------- */

export async function listPageTemplates() {
  if (!sharedStoreAvailable()) return []
  return assembleChunks(await listSharedRecords(TEMPLATES_SCOPE))
    .flatMap(([, value]) => { const template = parseTemplate(value); return template ? [template] : [] })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"))
}

/** « Enregistrer comme modèle » : le contenu de la page, sans son adresse ni sa place. */
export async function savePageTemplate(page: CustomPage, name: unknown, by: PageAuthor) {
  if (!sharedStoreAvailable()) throw unavailable()
  const clean = cleanTemplateName(name)
  if (!clean) throw new PageStoreError("CUSTOM_TEMPLATE_NAME", "Donne un nom au modèle (60 caractères au plus).")
  if ((await listPageTemplates()).length >= PAGE_LIMITS.templates) throw new PageStoreError("CUSTOM_TEMPLATE_LIMIT", `Il y a déjà ${PAGE_LIMITS.templates} modèles : supprimes-en un d’abord.`)
  const template: PageTemplate = { id: newId("m"), name: clean, content: reIdContent(templateContent(page)), createdAt: nextStamp(), createdBy: by }
  await writeChunked(TEMPLATES_SCOPE, template.id, JSON.stringify(template))
  return template
}

export async function readPageTemplate(id: string) {
  if (!sharedStoreAvailable()) return null
  const value = await readChunked(TEMPLATES_SCOPE, id)
  return value ? parseTemplate(value) : null
}

export async function deletePageTemplate(id: string) {
  if (!sharedStoreAvailable()) throw unavailable()
  await deleteChunked(TEMPLATES_SCOPE, id)
}
