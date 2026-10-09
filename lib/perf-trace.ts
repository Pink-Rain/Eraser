/**
 * Relevé des lenteurs du serveur local : chaque appel à Google (Sheets, Drive) ou au
 * serveur partagé est compté, et ceux qui dépassent SLOW_MS sont gardés (les derniers
 * seulement). L'administration les affiche pour savoir ce qui fait attendre les pages.
 * Rien n'est écrit sur le disque ni envoyé ailleurs : le relevé repart de zéro au
 * redémarrage du serveur.
 */
export type TraceKind = "sheets" | "drive" | "partagé"
export type SlowCall = { kind: TraceKind; label: string; ms: number; status: string; at: string }

const SLOW_MS = 700
const KEEP = 150
const slow: SlowCall[] = []
const totals = new Map<TraceKind, { count: number; slow: number; refused: number; totalMs: number; maxMs: number }>()
/** L'heure des appels de la dernière minute : Google compte son quota par minute. */
const recent = new Map<TraceKind, number[]>()
const startedAt = new Date().toISOString()

/** Les identifiants (classeurs, fichiers) raccourcis : le relevé reste lisible. */
function shortLabel(label: string) {
  return label.replace(/[A-Za-z0-9_-]{25,}/g, (id) => `${id.slice(0, 6)}…`).replace(/\?.*$/, "").slice(0, 140)
}

export function recordCall(kind: TraceKind, label: string, ms: number, status: string) {
  const total = totals.get(kind) ?? { count: 0, slow: 0, refused: 0, totalMs: 0, maxMs: 0 }
  total.count += 1
  // 429 : Google a refusé faute de quota (partagé par toutes les installations).
  if (status === "429") total.refused += 1
  const times = recent.get(kind) ?? []
  times.push(Date.now())
  while (times.length && Date.now() - times[0] > 60_000) times.shift()
  recent.set(kind, times)
  total.totalMs += ms
  total.maxMs = Math.max(total.maxMs, ms)
  if (ms >= SLOW_MS) {
    total.slow += 1
    slow.push({ kind, label: shortLabel(label), ms: Math.round(ms), status, at: new Date().toISOString() })
    if (slow.length > KEEP) slow.splice(0, slow.length - KEEP)
  }
  totals.set(kind, total)
}

/** Mesure une promesse (un appel réseau) et la rend telle quelle. */
export async function traced<T>(kind: TraceKind, label: string, run: () => Promise<T>, statusOf?: (value: T) => string) {
  const start = performance.now()
  try {
    const value = await run()
    recordCall(kind, label, performance.now() - start, statusOf ? statusOf(value) : "ok")
    return value
  } catch (error) {
    recordCall(kind, label, performance.now() - start, error instanceof Error ? error.message.slice(0, 60) : "erreur")
    throw error
  }
}

export function performanceReport() {
  return {
    startedAt,
    slowMs: SLOW_MS,
    totals: [...totals.entries()].map(([kind, total]) => ({
      kind, count: total.count, slow: total.slow, refused: total.refused,
      lastMinute: (recent.get(kind) ?? []).filter((at) => Date.now() - at <= 60_000).length,
      averageMs: total.count ? Math.round(total.totalMs / total.count) : 0, maxMs: Math.round(total.maxMs),
    })),
    slow: [...slow].reverse(),
  }
}
