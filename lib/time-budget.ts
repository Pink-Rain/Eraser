/**
 * Une promesse qui abandonne au bout de `ms` avec l'erreur `code` : une page n'attend jamais
 * indéfiniment une lecture de Google Sheets qui traîne (elle affiche alors la raison et
 * « Réessayer »). Le travail commencé continue derrière et remplit les caches s'il aboutit.
 */
export function withTimeBudget<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
