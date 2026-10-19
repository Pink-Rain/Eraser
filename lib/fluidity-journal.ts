/**
 * Le relevé de fluidité de cet ordinateur : ce que l'on ressent, mesuré dans la fenêtre.
 *
 * - « clic » : du clic (ou de la touche) à l'image suivante affichée, quand ça dépasse
 *   CLICK_MS (Event Timing du navigateur) ;
 * - « gel » : une image de l'écran qui a mis plus de FREEZE_MS à venir, avec le code qui
 *   l'a retenue (Long Animation Frames) ;
 * - « page » : un changement de page, de son départ à la page affichée, puis à son contenu
 *   complet (plus aucun squelette `aria-busy`), avec l'attente du serveur ;
 * - « appel » : une requête vers le serveur local de plus de CALL_MS.
 *
 * Gardé dans ce navigateur seulement (les dernières entrées), affiché depuis le pied de la barre latérale (chaque compte),
 * copiable pour être envoyé. Rien ne part ailleurs.
 */
export type FluidityKind = "clic" | "gel" | "page" | "appel"
export type FluidityEntry = {
  kind: FluidityKind
  at: string
  /** La page où l'on était. */
  path: string
  /** Ce qui a été cliqué, la page ouverte, la requête, le code qui a gelé l'écran. */
  label: string
  ms: number
  /** Le détail : traitement du clic, attente du serveur, contenu complet… */
  detail?: string
  /**
   * Un gros gel : ce qui tournait pendant ce temps (échantillons toutes les 10 ms). `js` /
   * `other` : échantillons dans le code / hors du code (styles, mise en page, dessin) ;
   * `self` : les fonctions en cours, `stack` : les fonctions d'Eraser qui les ont appelées, React
   * mis à part (« nom · fichier:ligne:colonne »).
   */
  profile?: { js: number; other: number; self: Array<[string, number]>; stack: Array<[string, number]> }
}

const STORAGE_KEY = "eraser:fluidity"
const KEEP = 400
const CLICK_MS = 100
const FREEZE_MS = 150
const CALL_MS = 300
export const FLUIDITY_EVENT = "eraser:fluidity"

let entries: FluidityEntry[] | null = null
let saveTimer = 0

function load(): FluidityEntry[] {
  if (entries) return entries
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown
    entries = Array.isArray(stored) ? (stored as FluidityEntry[]).slice(-KEEP) : []
  } catch { entries = [] }
  return entries
}

function record(entry: Omit<FluidityEntry, "at" | "path"> & { path?: string }) {
  const list = load()
  const recorded: FluidityEntry = { ...entry, ms: Math.round(entry.ms), at: new Date().toISOString(), path: entry.path ?? window.location.pathname }
  list.push(recorded)
  if (list.length > KEEP) list.splice(0, list.length - KEEP)
  // Écrit au repos : le relevé ne doit pas lui-même ralentir la page.
  if (!saveTimer) saveTimer = window.setTimeout(() => {
    saveTimer = 0
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(load())) } catch { /* stockage plein ou indisponible */ }
    window.dispatchEvent(new CustomEvent(FLUIDITY_EVENT))
  }, 1_000)
  return recorded
}

export function fluidityEntries() {
  return [...load()]
}

export function clearFluidity() {
  entries = []
  try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* rien à vider */ }
  window.dispatchEvent(new CustomEvent(FLUIDITY_EVENT))
}

/** Un élément cliqué, en quelques mots lisibles : son libellé, sinon son texte. */
function describe(target: EventTarget | null | undefined) {
  if (!(target instanceof Element)) return ""
  const element = target.closest("button, a, [role=button], [role=tab], [role=menuitem], [role=option], input, select, textarea, label, td, th") ?? target
  const name = element.getAttribute("aria-label") || element.getAttribute("title") || (element instanceof HTMLInputElement ? `${element.type} ${element.name || element.placeholder}` : element.textContent) || ""
  return `${element.tagName.toLowerCase()} « ${name.replace(/\s+/g, " ").trim().slice(0, 60)} »`
}

function shortSource(url: string | undefined) {
  if (!url) return ""
  return url.replace(window.location.origin, "").replace(/^\/assets\//, "").replace(/-[A-Za-z0-9_-]{8}\.js$/, ".js")
}

type LoafScript = { invoker?: string; sourceURL?: string; sourceFunctionName?: string; duration?: number }
type Loaf = PerformanceEntry & { blockingDuration?: number; scripts?: LoafScript[] }
type EventEntry = PerformanceEntry & { processingStart: number; processingEnd: number; target?: EventTarget | null; interactionId?: number }

function observe(type: string, options: PerformanceObserverInit & { durationThreshold?: number }, handle: (entry: PerformanceEntry) => void) {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) handle(entry) }).observe(options)
  } catch { /* type de mesure inconnu de ce navigateur */ }
}

/** Les pages en cours d'ouverture : départ, attente du serveur, affichage. */
let navigation: { to: string; from: string; startedAt: number; serverMs?: number; shownMs?: number; watcher?: MutationObserver; timer?: number } | null = null

function pathOf(url: string) {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.origin === window.location.origin ? parsed.pathname.replace(/\.rsc$/, "") || "/" : null
  } catch { return null }
}

function finishNavigation(complete: boolean) {
  const current = navigation
  if (!current) return
  navigation = null
  current.watcher?.disconnect()
  window.clearTimeout(current.timer)
  const total = performance.now() - current.startedAt
  const parts = [
    current.serverMs !== undefined ? `serveur ${Math.round(current.serverMs)} ms` : "",
    current.shownMs !== undefined ? `affichée à ${Math.round(current.shownMs)} ms` : "",
    complete ? "" : "contenu encore en chargement après 20 s",
  ].filter(Boolean)
  record({ kind: "page", label: current.to, ms: total, path: current.from, detail: parts.join(" · ") })
}

/** Le contenu est complet quand la page n'a plus aucun squelette. */
function watchContent() {
  const current = navigation
  if (!current) return
  const main = document.querySelector("main") ?? document.body
  const done = () => !main.querySelector("[aria-busy='true']")
  const check = () => { if (navigation === current && done()) requestAnimationFrame(() => finishNavigation(true)) }
  current.watcher = new MutationObserver(check)
  current.watcher.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] })
  current.timer = window.setTimeout(() => { if (navigation === current) finishNavigation(false) }, 20_000)
  check()
}

/** Appelé par la coque quand l'adresse affichée change. */
export function notePageShown(pathname: string) {
  if (!navigation || navigation.to !== pathname) return
  requestAnimationFrame(() => {
    if (!navigation || navigation.to !== pathname) return
    navigation.shownMs = performance.now() - navigation.startedAt
    watchContent()
  })
}

let installed = false

/** Une fois par fenêtre : installe les mesures. */
export function installFluidityJournal() {
  if (installed || typeof window === "undefined") return
  installed = true

  // Un clic, c'est trois évènements (appui, relâché, clic) d'une même interaction : une seule
  // entrée, la plus longue des trois.
  const interactions = new Map<number, FluidityEntry>()
  observe("event", { type: "event", buffered: false, durationThreshold: CLICK_MS }, (raw) => {
    const entry = raw as EventEntry
    if (!entry.interactionId || entry.duration < CLICK_MS) return
    if (!/^(click|pointerup|pointerdown|keydown|keyup)$/.test(entry.name)) return
    const processing = entry.processingEnd - entry.processingStart
    const detail = `${entry.name} · traitement ${Math.round(processing)} ms · attente avant ${Math.round(entry.processingStart - entry.startTime)} ms · dessin ${Math.round(entry.startTime + entry.duration - entry.processingEnd)} ms`
    const known = interactions.get(entry.interactionId)
    if (known) {
      if (entry.duration > known.ms) { known.ms = Math.round(entry.duration); known.detail = detail; if (entry.target) known.label = describe(entry.target) || known.label }
      return
    }
    const recorded = record({ kind: "clic", label: describe(entry.target) || entry.name, ms: entry.duration, detail })
    interactions.set(entry.interactionId, recorded)
    if (interactions.size > 50) interactions.delete(interactions.keys().next().value as number)
  })

  observe("long-animation-frame", { type: "long-animation-frame", buffered: false }, (raw) => {
    const entry = raw as Loaf
    if (entry.duration < FREEZE_MS) return
    const scripts = [...(entry.scripts ?? [])].sort((left, right) => (right.duration ?? 0) - (left.duration ?? 0)).slice(0, 2)
    const label = scripts.map((script) => [script.sourceFunctionName, shortSource(script.sourceURL), script.invoker].filter(Boolean).join(" · ")).join(" | ") || "rendu et mise en page"
    const recorded = record({ kind: "gel", label, ms: entry.duration, detail: `bloqué ${Math.round(entry.blockingDuration ?? 0)} ms${scripts.length ? ` · scripts ${scripts.map((script) => `${Math.round(script.duration ?? 0)} ms`).join(", ")}` : ""}` })
    if (entry.duration >= PROFILE_FREEZE_MS) profiledFreezes.push({ start: entry.startTime, end: entry.startTime + entry.duration, entry: recorded })
  })
  startSampling()

  window.addEventListener("eraser:navigation-start", (event) => {
    const to = pathOf((event as CustomEvent<{ url?: string }>).detail?.url ?? "")
    if (!to || to === window.location.pathname) return
    if (navigation) finishNavigation(false)
    navigation = { to, from: window.location.pathname, startedAt: performance.now() }
  })

  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = performance.now()
    const response = await original(input, init)
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href)
      if (url.origin === window.location.origin) {
        const ms = performance.now() - startedAt
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
        if (url.pathname.endsWith(".rsc")) {
          const to = pathOf(url.href)
          if (navigation && to === navigation.to) navigation.serverMs = ms
          else if (ms >= CALL_MS) record({ kind: "appel", label: `relecture ${to}`, ms, detail: `HTTP ${response.status}` })
        } else if (url.pathname.startsWith("/api/") && ms >= CALL_MS) {
          record({ kind: "appel", label: `${method} ${url.pathname}`, ms, detail: `HTTP ${response.status}` })
        }
      }
    } catch { /* adresse illisible : la réponse passe telle quelle */ }
    return response
  }
}

// ---------------------------------------------------------------------------
// Profil des gros gels (JS Self-Profiling, autorisé par l'en-tête Document-Policy de
// next.config.ts). Un échantillonneur tourne par fenêtres de quelques secondes ; une fenêtre
// sans gros gel est jetée, sinon ses échantillons pendant le gel disent quelles fonctions
// tournaient. Le relevé copié y joint quelques caractères du code de chacune
// (`profiledCode`), pour la retrouver dans les sources malgré la compression.
// ---------------------------------------------------------------------------

const PROFILE_FREEZE_MS = 400
const SAMPLE_MS = 10
const WINDOW_MS = 8_000

type ProfilerFrame = { name?: string; resourceId?: number; line?: number; column?: number }
type ProfilerTrace = { resources: string[]; frames: ProfilerFrame[]; stacks: Array<{ frameId: number; parentId?: number }>; samples: Array<{ timestamp: number; stackId?: number }> }
type SamplingProfiler = EventTarget & { stop(): Promise<ProfilerTrace> }
type ProfilerConstructor = new (options: { sampleInterval: number; maxBufferSize: number }) => SamplingProfiler

const profiledFreezes: Array<{ start: number; end: number; entry: FluidityEntry }> = []
let sampler: SamplingProfiler | null = null

function startSampling() {
  const Sampler = (window as Window & { Profiler?: ProfilerConstructor }).Profiler
  if (!Sampler || sampler) return
  try {
    sampler = new Sampler({ sampleInterval: SAMPLE_MS, maxBufferSize: Math.ceil(WINDOW_MS / SAMPLE_MS) + 200 })
  } catch {
    // Sans l'en-tête Document-Policy (ancienne page, autre navigateur) : pas de profil.
    return
  }
  const current = sampler
  window.setTimeout(() => {
    if (sampler !== current) return
    sampler = null
    // La fenêtre suivante commence avant que celle-ci soit lue : aucun trou entre les deux.
    startSampling()
    void current.stop().then(readFreezes, () => undefined)
  }, WINDOW_MS)
}

function frameLabel(trace: ProfilerTrace, frameId: number) {
  const frame = trace.frames[frameId]
  if (!frame) return "?"
  // L'adresse entière du fichier (empreinte comprise) : le relevé copié y relit le code.
  const file = frame.resourceId !== undefined ? (trace.resources[frame.resourceId] ?? "").replace(window.location.origin, "") : ""
  return `${frame.name || "(anonyme)"} · ${file}:${frame.line ?? 0}:${frame.column ?? 0}`
}

function readFreezes(trace: ProfilerTrace) {
  const first = trace.samples[0]?.timestamp ?? Number.POSITIVE_INFINITY
  const last = trace.samples.at(-1)?.timestamp ?? 0
  for (let index = profiledFreezes.length - 1; index >= 0; index -= 1) {
    const freeze = profiledFreezes[index]
    if (freeze.end < first - 50) { profiledFreezes.splice(index, 1); continue }
    if (freeze.start > last) continue
    const self = new Map<string, number>()
    const stack = new Map<string, number>()
    let js = 0
    let other = 0
    for (const sample of trace.samples) {
      if (sample.timestamp < freeze.start || sample.timestamp > freeze.end) continue
      if (sample.stackId === undefined) { other += 1; continue }
      js += 1
      const seen = new Set<string>()
      for (let id: number | undefined = sample.stackId, depth = 0; id !== undefined && depth < 40; id = trace.stacks[id]?.parentId, depth += 1) {
        const label = frameLabel(trace, trace.stacks[id]?.frameId ?? -1)
        if (depth === 0) self.set(label, (self.get(label) ?? 0) + 1)
        // React lui-même (le fichier « framework ») est partout dans la pile : ce sont les
        // fonctions d'Eraser qui l'ont fait travailler qui disent quoi corriger.
        if (!seen.has(label) && !label.includes("/framework-")) { seen.add(label); stack.set(label, (stack.get(label) ?? 0) + 1) }
      }
    }
    const top = (map: Map<string, number>, count: number) => [...map].sort((left, right) => right[1] - left[1]).slice(0, count).map(([label, samples]): [string, number] => [label, samples * SAMPLE_MS])
    if (js + other) freeze.entry.profile = { js: js * SAMPLE_MS, other: other * SAMPLE_MS, self: top(self, 10), stack: top(stack, 14) }
    // Fini dans cette fenêtre : plus rien à lire pour lui.
    if (freeze.end <= last) profiledFreezes.splice(index, 1)
  }
  if (!saveTimer) saveTimer = window.setTimeout(() => {
    saveTimer = 0
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(load())) } catch { /* stockage plein ou indisponible */ }
  }, 1_000)
}

/**
 * Pour le relevé copié : quelques caractères du code autour de chaque fonction des profils
 * (le code servi est compressé, ses noms raccourcis ; ce morceau permet de la retrouver).
 */
export async function profiledCode(list: FluidityEntry[]) {
  const wanted = new Set(list.flatMap((entry) => [...(entry.profile?.self ?? []), ...(entry.profile?.stack ?? [])].map(([label]) => label)).filter((label) => !label.includes("/framework-")))
  const files = new Map<string, Promise<string[]>>()
  const code: Record<string, string> = {}
  for (const label of wanted) {
    const match = /· (.+):(\d+):(\d+)$/.exec(label)
    if (!match || !/\.m?js$/.test(match[1])) continue
    const [, file, line, column] = match
    if (!file.startsWith("/")) continue
    if (!files.has(file)) files.set(file, fetch(file).then((response) => response.ok ? response.text() : "").then((text) => text.split("\n"), () => []))
    const lines = await files.get(file)!
    const text = lines[Number(line) - 1] ?? ""
    const at = Math.max(0, Number(column) - 1)
    if (text) code[label] = text.slice(at, at + 160)
  }
  return code
}

/** Les chiffres qui résument le relevé : médiane et 9e décile, par sorte. */
export function fluiditySummary(list: FluidityEntry[]) {
  const quantile = (values: number[], q: number) => {
    if (!values.length) return 0
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  }
  const kinds: FluidityKind[] = ["page", "clic", "gel", "appel"]
  return kinds.map((kind) => {
    const values = list.filter((entry) => entry.kind === kind).map((entry) => entry.ms)
    return { kind, count: values.length, median: quantile(values, 0.5), p90: quantile(values, 0.9), worst: values.length ? Math.max(...values) : 0 }
  })
}
