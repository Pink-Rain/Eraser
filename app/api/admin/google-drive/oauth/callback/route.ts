import { completeGoogleOAuth, takeGoogleOAuthFlow } from "@/lib/google-oauth"

function desktopResponse(status: string) {
  const success = status === "connected"
  const title = success ? "Google Drive est connecté" : "Connexion Google incomplète"
  const detail = success
    ? "Tu peux fermer cet onglet et revenir dans Eraser."
    : "Ferme cet onglet, retourne dans Eraser puis relance la connexion."
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f4ead6;color:#2c241a;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;margin:24px;padding:32px;border:1px solid #c7ad7c;border-radius:20px;background:#fffaf0;box-shadow:0 18px 60px #604b2930}h1{margin:0 0 12px;font:700 30px Georgia,serif}p{line-height:1.6;margin:0}</style><main class="card"><h1>${title}</h1><p>${detail}</p></main></html>`, {
    status: success ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const receivedState = requestUrl.searchParams.get("state") || ""
  const desktopFlow = await takeGoogleOAuthFlow(receivedState)
  if (!desktopFlow) return desktopResponse("invalid_state")
  if (requestUrl.searchParams.get("error")) return desktopResponse("access_denied")
  const code = requestUrl.searchParams.get("code")
  if (!code) return desktopResponse("invalid_state")

  try {
    await completeGoogleOAuth({
      code,
      origin: requestUrl.origin,
      codeVerifier: desktopFlow.codeVerifier,
      expectedEmail: desktopFlow.googleEmail,
      connectedBy: desktopFlow.connectedBy,
    })
    return desktopResponse("connected")
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_MISMATCH") return desktopResponse("account_mismatch")
    if (error instanceof Error && error.message === "MISSING_REFRESH_TOKEN") return desktopResponse("missing_refresh_token")
    return desktopResponse("failed")
  }
}
