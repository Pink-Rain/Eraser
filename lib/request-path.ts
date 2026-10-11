import * as navigation from "next/navigation"

/**
 * L'adresse demandée (chemin et paramètres), lue côté serveur dans le contexte de navigation
 * que vinext pose avant chaque rendu (pages et requêtes RSC). Le layout racine s'en sert
 * pour savoir si une page du créateur de pages remplace ou complète la page demandée.
 * Introuvable (autre environnement) : chemin vide, et rien n'est remplacé.
 */
export function currentRequestPath(): { pathname: string; searchParams: URLSearchParams } {
  try {
    const get = (navigation as unknown as { getNavigationContext?: () => { pathname?: string; searchParams?: URLSearchParams | Record<string, string> } | null }).getNavigationContext
    const context = get?.()
    const pathname = typeof context?.pathname === "string" ? context.pathname : ""
    const raw = context?.searchParams
    const searchParams = raw instanceof URLSearchParams ? raw : new URLSearchParams(raw && typeof raw === "object" ? Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []) : [])
    return { pathname, searchParams }
  } catch {
    return { pathname: "", searchParams: new URLSearchParams() }
  }
}
