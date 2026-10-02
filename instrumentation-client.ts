/**
 * Appelé par le routeur au moment exact où il part vers une autre adresse (lien, bouton,
 * précédent/suivant). L'application affiche alors tout de suite la page de destination,
 * sans ses données (components/eraser/page-transition.tsx).
 */
export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse") {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("eraser:navigation-start", { detail: { url, navigationType } }))
}
