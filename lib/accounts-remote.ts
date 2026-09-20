// Thin HTTP client for the shared "eraser-accounts" Cloudflare Worker
// (see worker-accounts/). Every installed copy of Eraser runs its own local
// server and local database, but accounts/roles and the Google Drive
// connection must be identical everywhere, so when these two variables are
// configured, `lib/site-auth.ts` and `lib/google-oauth.ts` call out to that
// shared Worker instead of touching the local database. When they are not
// configured (the historical Sites Cloudflare deployment), nothing changes.

export type RemoteAccountsConfig = {
  baseUrl: string
  clientKey: string
}

export function remoteAccountsConfig(env: unknown): RemoteAccountsConfig | null {
  const values = env as Record<string, string | undefined>
  const baseUrl = values.ERASER_ACCOUNTS_API_URL?.trim()
  const clientKey = values.ERASER_ACCOUNTS_API_KEY?.trim()
  if (!baseUrl || !clientKey) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ""), clientKey }
}

export async function remoteAccountsFetch(
  config: RemoteAccountsConfig,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown; token?: string | null },
) {
  const headers: Record<string, string> = { "x-eraser-client-key": config.clientKey }
  if (init.token) headers.authorization = `Bearer ${init.token}`
  let requestBody: string | undefined
  if (init.body !== undefined) {
    headers["content-type"] = "application/json"
    requestBody = JSON.stringify(init.body)
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers,
    body: requestBody,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `REMOTE_ACCOUNTS_ERROR_${response.status}`
    throw new Error(message)
  }
  return payload
}
