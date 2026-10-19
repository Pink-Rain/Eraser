/**
 * `fetch` avec un délai maximal, réponse comprise. Remplace `AbortSignal.timeout`, dont le
 * minuteur continuait de courir une fois la réponse reçue : il se déclenchait parfois bien
 * plus tard sur une réponse jamais lue (un refus de Google rejeté, une image abandonnée) et
 * remontait comme une « Erreur non rattrapée » anonyme dans le journal.
 *
 * Ici, le minuteur s'arrête dès que la réponse a été lue jusqu'au bout (ou abandonnée avec
 * `body.cancel()`), et l'erreur dit quelle requête n'a pas répondu à temps.
 */
export async function timedFetch(url: string, init: RequestInit, ms: number, label: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    // Le même nom que celui d'`AbortSignal.timeout` : ceux qui reconnaissent un délai dépassé le reconnaissent encore.
    const reason = new Error(`${label}_TIMEOUT ${shortUrl(url)} (${Math.round(ms / 1000)} s)`)
    reason.name = "TimeoutError"
    controller.abort(reason)
  }, ms)
  const stop = () => clearTimeout(timer)
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
  let response: Response
  try {
    response = await fetch(url, { ...init, signal })
  } catch (error) {
    stop()
    throw error
  }
  // Sans corps (ou un statut qui n'en a pas), plus rien à attendre.
  if (!response.body || [101, 204, 205, 304].includes(response.status)) {
    stop()
    return response
  }
  const reader = response.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(stream) {
      try {
        const { done, value } = await reader.read()
        if (done) { stop(); stream.close(); return }
        stream.enqueue(value)
      } catch (error) {
        stop()
        stream.error(error)
      }
    },
    cancel(reason) {
      stop()
      return reader.cancel(reason)
    },
  })
  const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  Object.defineProperty(wrapped, "url", { value: response.url })
  return wrapped
}

/** L'adresse sans ses paramètres ni ses identifiants longs : lisible dans le journal. */
function shortUrl(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`.replace(/[A-Za-z0-9_-]{25,}/g, (id) => `${id.slice(0, 6)}…`).slice(0, 120)
  } catch {
    return ""
  }
}

/** Une réponse qu'on ne lira pas (refus rejoué, erreur) : libérée tout de suite, minuteur compris. */
export async function discardResponse(response: Response | null | undefined) {
  await response?.body?.cancel().catch(() => undefined)
}
