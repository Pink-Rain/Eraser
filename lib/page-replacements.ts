/**
 * Remplacer ou compléter une page d'Eraser par une page du créateur de pages. Une page
 * réglée sur une adresse d'Eraser (`replaces`) prend sa place (« replace »), ou ajoute ses
 * blocs au-dessus (« before ») ou en dessous (« after ») de son contenu. Tout reste
 * réversible : retirer l'adresse rend la page d'origine, et l'atelier garde des versions
 * brouillon auxquelles on revient.
 *
 * Seules les adresses de `replaceableRoutes` peuvent l'être ; les routes techniques
 * (connexion, comptes, corbeille, Google, API, créateur de pages et éditeur du menu) jamais.
 * Règles pures : le layout racine, l'atelier, le serveur et les tests s'en servent.
 */
export type ReplaceMode = "replace" | "before" | "after"

export const replaceModes: Array<{ value: ReplaceMode; label: string; hint: string }> = [
  { value: "before", label: "Au-dessus de la page", hint: "Les blocs s’ajoutent avant le contenu d’origine." },
  { value: "after", label: "En dessous de la page", hint: "Les blocs s’ajoutent après le contenu d’origine." },
  { value: "replace", label: "À la place de la page", hint: "La page d’origine n’est plus montrée (son contenu peut revenir dans un bloc « Contenu de la page d’origine »)." },
]

/** Les pages d'Eraser qu'on peut remplacer ou compléter. `[id]` : n'importe quelle valeur de ce segment. */
/** `icon` : son icône dans l'Index des pages, tant qu'aucune page de l'atelier ne la remplace. */
export const replaceableRoutes: Array<{ path: string; label: string; group: string; icon: string }> = [
  { path: "/", label: "Accueil", group: "Accueil", icon: "house" },
  { path: "/profil", label: "Mon profil", group: "Accueil", icon: "circle-user-round" },
  { path: "/profil/[uid]", label: "Profil d’un joueur", group: "Accueil", icon: "user" },
  { path: "/creation-de-personnage", label: "Création de personnage", group: "Accueil", icon: "user-plus" },
  { path: "/creation-de-campagne", label: "Création de campagne", group: "Accueil", icon: "map-plus" },
  { path: "/creation-de-classe", label: "Création de classe", group: "Accueil", icon: "wand-sparkles" },
  { path: "/regles", label: "Règles (page de la section)", group: "Règles", icon: "scroll-text" },
  { path: "/regles/classes", label: "Classes", group: "Règles", icon: "library-big" },
  { path: "/regles/classes/[id]", label: "Une classe", group: "Règles", icon: "swords" },
  { path: "/regles/vocabulaire", label: "Vocabulaire", group: "Règles", icon: "book-text" },
  { path: "/regles/combat", label: "Combat", group: "Règles", icon: "swords" },
  { path: "/regles/hors-combat", label: "Hors combat", group: "Règles", icon: "compass" },
  // Les pages d'index (/ressources/index-des-…, un index personnalisé, la fiche d'une
  // référence) ne sont pas ici : elles ont leur propre « Modifier » (le moteur des index) et
  // ne se remplacent pas dans l'atelier. Seule la page de la section reste.
  { path: "/ressources", label: "Index (page de la section)", group: "Index", icon: "library-big" },
  { path: "/bac-a-sable", label: "Bac à sable (page de la section)", group: "Bac à sable", icon: "flask-conical" },
  { path: "/bac-a-sable/tabletop", label: "Tabletop", group: "Bac à sable", icon: "map" },
  { path: "/bac-a-sable/magasin", label: "Magasin", group: "Bac à sable", icon: "store" },
  { path: "/bac-a-sable/pnjs", label: "PNJs", group: "Bac à sable", icon: "drama" },
  { path: "/campagne", label: "Campagnes", group: "Campagnes", icon: "map" },
  { path: "/campagne/[id]", label: "Tableau de bord d’une campagne", group: "Campagnes", icon: "layout-dashboard" },
  { path: "/campagne/[id]/dossier", label: "Dossier d’une campagne", group: "Campagnes", icon: "folder-open" },
  { path: "/campagne/[id]/journal", label: "Journal d’une campagne", group: "Campagnes", icon: "notebook-pen" },
  { path: "/campagne/[id]/lieux-et-rencontres", label: "Créateur de session", group: "Campagnes", icon: "map-pinned" },
  { path: "/campagne/[id]/evenements", label: "Événements", group: "Campagnes", icon: "calendar-days" },
  { path: "/campagne/[id]/magasin-et-fouille", label: "Magasins", group: "Campagnes", icon: "store" },
  { path: "/campagne/[id]/fouilles", label: "Fouilles", group: "Campagnes", icon: "search" },
  { path: "/campagne/[id]/pnjs", label: "PNJs d’une campagne", group: "Campagnes", icon: "drama" },
  { path: "/campagne/[id]/document", label: "Document d’une campagne", group: "Campagnes", icon: "file-text" },
  { path: "/campagne/[id]/tabletop", label: "Tabletop d’une campagne", group: "Campagnes", icon: "map" },
  { path: "/personnage/[id]", label: "Fiche de personnage", group: "Personnages", icon: "circle-user-round" },
  { path: "/administration", label: "Administration (page de la section)", group: "Administration", icon: "shield" },
  { path: "/administration/campagnes", label: "Campagnes (administration)", group: "Administration", icon: "map" },
  { path: "/administration/personnages", label: "Personnages (administration)", group: "Administration", icon: "users" },
]

/** Les adresses des pages d'index prévues par Eraser (hors atelier : le moteur des index les gère). */
export const indexPageSlugs = ["armes-modificateurs", "index-des-attributs", "index-des-calendriers", "index-des-campagnes", "index-des-caracteristiques", "index-des-classes", "index-des-creatures", "index-des-etats", "index-des-langues", "index-des-lieux", "index-des-materiaux", "index-des-objets", "index-des-personnages", "index-des-peuples", "index-des-pnjs", "index-des-religions", "index-des-runes", "index-des-succes", "index-du-vocabulaire", "sorts-des-classes", "sorts-des-creatures"]

/**
 * Jamais remplacées, quoi qu'on enregistre : la connexion, les comptes et la corbeille, la
 * liaison Google, le compagnon Roll20, toute route /api (OAuth compris), et le créateur de
 * pages lui-même avec l'éditeur du menu (on ne doit pas pouvoir s'en fermer l'accès).
 */
export const forbiddenReplacements = ["/api", "/connexion", "/administration/comptes-et-roles", "/administration/corbeille", "/administration/google-drive", "/campagne/[id]/roll20", "/pages", "/fiche", "/reference", "/ressources/index", ...indexPageSlugs.map((slug) => `/ressources/${slug}`)]

const segments = (path: string) => path.split(/[?#]/)[0].split("/").filter(Boolean)

/** L'adresse (ou le modèle d'adresse) est-elle fermée au remplacement ? */
export function isForbiddenReplacement(path: string) {
  const parts = segments(path)
  return forbiddenReplacements.some((forbidden) => {
    const wanted = segments(forbidden)
    return wanted.length <= parts.length && wanted.every((part, index) => part === parts[index] || (part.startsWith("[") && Boolean(parts[index])))
  })
}

/** Une adresse d'Eraser qu'on peut remplacer (une de `replaceableRoutes`, jamais une route technique). */
export function isReplaceablePath(path: string) {
  return !isForbiddenReplacement(path) && replaceableRoutes.some((route) => route.path === path)
}

/** L'adresse demandée correspond-elle au modèle (« /campagne/[id]/journal ») ? */
export function matchesReplacement(pattern: string, pathname: string) {
  if (!pattern || isForbiddenReplacement(pathname)) return false
  const wanted = segments(pattern)
  const parts = segments(pathname).map((part) => { try { return decodeURIComponent(part) } catch { return part } })
  return wanted.length === parts.length && wanted.every((part, index) => part === parts[index] || (part.startsWith("[") && part.endsWith("]") && Boolean(parts[index])))
}

export function cleanReplaceMode(value: unknown): ReplaceMode {
  return value === "replace" || value === "before" ? value : "after"
}

/**
 * Les pages d'Eraser qui montrent une ligne d'un index (« /regles/classes/[id] » : une classe).
 * La page qui en remplace une devient la page de chaque ligne : « {Nom de la classe} »,
 * « Valeurs de la ligne », les vues filtrées sur la ligne… comme une page de ligne.
 */
export const rowRoutes: Record<string, string> = {
  "/regles/classes/[id]": "classes",
}

/** L'index dont la page `pattern` montre une ligne, et l'identifiant de cette ligne dans `pathname`. */
export function rowOfRoute(pattern: string | undefined, pathname?: string): { index: string; id: string } | null {
  const index = pattern ? rowRoutes[pattern] : undefined
  if (!index) return null
  if (!pathname) return { index, id: "" }
  const wanted = segments(pattern!)
  const parts = segments(pathname)
  const at = wanted.findIndex((part) => part === "[id]")
  if (at < 0 || wanted.length !== parts.length) return null
  let id = parts[at]
  try { id = decodeURIComponent(id) } catch { /* l'adresse brute */ }
  return id ? { index, id } : null
}

export const replacementLabel = (path: string) => replaceableRoutes.find((route) => route.path === path)?.label ?? path
