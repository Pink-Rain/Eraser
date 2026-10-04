import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Une file d'attente par clé, dans ce processus : les tâches d'une même clé passent une à
 * une, dans l'ordre d'arrivée. Une tâche lancée par une autre qui tient déjà la clé passe
 * tout de suite (elle s'attendrait sinon elle-même). Rien n'est partagé avec une autre
 * installation : ce qui écrit dans Google Sheets relit toujours la feuille juste avant.
 */
const queues = new Map<string, Promise<void>>()
const held = new AsyncLocalStorage<ReadonlySet<string>>()

export async function withAsyncLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const current = held.getStore()
  if (current?.has(key)) return run()
  const previous = queues.get(key) ?? Promise.resolve()
  let release: () => void = () => undefined
  const turn = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => turn)
  queues.set(key, tail)
  await previous
  try {
    return await held.run(new Set([...(current ?? []), key]), run)
  } finally {
    release()
    if (queues.get(key) === tail) queues.delete(key)
  }
}
