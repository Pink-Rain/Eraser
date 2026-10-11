/**
 * Remplacer ou compléter une page d'Eraser par une page du créateur de pages. Une page
 * réglée sur une adresse d'Eraser (`replaces`) prend sa place (« replace »), ou ajoute ses
 * blocs au-dessus (« before ») ou en dessous (« after ») de son contenu. Tout reste
 * réversible : retirer l'adresse rend la page d'origine, et les admins et MJ ont toujours
 * « Voir la page d'origine » (?origine=1).
 *
 * Seules les adresses de `replaceableRoutes` peuvent l'être ; les routes techniques
 * (connexion, comptes, corbeille, Google, API, créateur de pages et éditeur du menu) jamais.
 * Règles pures : le layout racine, l'atelier, le serveur et les tests s'en servent.
 */
export type ReplaceMode = "replace" | "before" | "after"

export const replaceModes: Array<{ value: ReplaceMode; label: string; hint: string }> = [
  { value: "before", label: "Au-dessus de la page", hint: "Les blocs s’ajoutent avant le contenu d’origine." },
  { value: "after", label: "En dessous de la page", hint: "Les blocs s’ajoutent après le contenu d’origine." },
  { value: "replace", label: "À la place de la page", hint: "La page d’origine n’est plus montrée (lien « Voir la page d’origine » pour admins et MJ)." },
]

/** Les pages d'Eraser qu'on peut remplacer ou compléter. `[id]` : n'importe quelle valeur de ce segment. */
export const replaceableRoutes: Array<{ path: string; label: string; group: string }> = [
  { path: "/", label: "Accueil", group: "Accueil" },
  { path: "/profil", label: "Mon profil", group: "Accueil" },
  { path: "/profil/[uid]", label: "Profil d’un joueur", group: "Accueil" },
  { path: "/creation-de-personnage", label: "Création de personnage", group: "Accueil" },
  { path: "/creation-de-campagne", label: "Création de campagne", group: "Accueil" },
  { path: "/creation-de-classe", label: "Création de classe", group: "Accueil" },
  { path: "/regles", label: "Règles (page de la section)", group: "Règles" },
  { path: "/regles/classes", label: "Classes", group: "Règles" },
  { path: "/regles/classes/[id]", label: "Une classe", group: "Règles" },
  { path: "/regles/vocabulaire", label: "Vocabulaire", group: "Règles" },
  { path: "/regles/combat", label: "Combat", group: "Règles" },
  { path: "/regles/hors-combat", label: "Hors combat", group: "Règles" },
  { path: "/ressources", label: "Index (page de la section)", group: "Index" },
  ...["armes-modificateurs", "index-des-attributs", "index-des-calendriers", "index-des-campagnes", "index-des-caracteristiques", "index-des-classes", "index-des-creatures", "index-des-etats", "index-des-langues", "index-des-lieux", "index-des-materiaux", "index-des-objets", "index-des-personnages", "index-des-peuples", "index-des-pnjs", "index-des-religions", "index-des-runes", "index-des-succes", "index-du-vocabulaire", "sorts-des-classes", "sorts-des-creatures"]
    .map((slug) => ({ path: `/ressources/${slug}`, label: slug.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase()), group: "Index" })),
  { path: "/ressources/index/[cle]", label: "Un index personnalisé", group: "Index" },
  { path: "/reference/[index]/[id]", label: "Fiche d’une référence", group: "Index" },
  { path: "/bac-a-sable", label: "Bac à sable (page de la section)", group: "Bac à sable" },
  { path: "/bac-a-sable/tabletop", label: "Tabletop", group: "Bac à sable" },
  { path: "/bac-a-sable/magasin", label: "Magasin", group: "Bac à sable" },
  { path: "/bac-a-sable/pnjs", label: "PNJs", group: "Bac à sable" },
  { path: "/campagne", label: "Campagnes", group: "Campagnes" },
  { path: "/campagne/[id]", label: "Tableau de bord d’une campagne", group: "Campagnes" },
  { path: "/campagne/[id]/dossier", label: "Dossier d’une campagne", group: "Campagnes" },
  { path: "/campagne/[id]/journal", label: "Journal d’une campagne", group: "Campagnes" },
  { path: "/campagne/[id]/lieux-et-rencontres", label: "Créateur de session", group: "Campagnes" },
  { path: "/campagne/[id]/evenements", label: "Événements", group: "Campagnes" },
  { path: "/campagne/[id]/magasin-et-fouille", label: "Magasins", group: "Campagnes" },
  { path: "/campagne/[id]/fouilles", label: "Fouilles", group: "Campagnes" },
  { path: "/campagne/[id]/pnjs", label: "PNJs d’une campagne", group: "Campagnes" },
  { path: "/campagne/[id]/document", label: "Document d’une campagne", group: "Campagnes" },
  { path: "/campagne/[id]/tabletop", label: "Tabletop d’une campagne", group: "Campagnes" },
  { path: "/personnage/[id]", label: "Fiche de personnage", group: "Personnages" },
  { path: "/administration", label: "Administration (page de la section)", group: "Administration" },
  { path: "/administration/campagnes", label: "Campagnes (administration)", group: "Administration" },
  { path: "/administration/personnages", label: "Personnages (administration)", group: "Administration" },
]

/**
 * Jamais remplacées, quoi qu'on enregistre : la connexion, les comptes et la corbeille, la
 * liaison Google, le compagnon Roll20, toute route /api (OAuth compris), et le créateur de
 * pages lui-même avec l'éditeur du menu (on ne doit pas pouvoir s'en fermer l'accès).
 */
export const forbiddenReplacements = ["/api", "/connexion", "/administration/comptes-et-roles", "/administration/corbeille", "/administration/google-drive", "/campagne/[id]/roll20", "/pages", "/fiche"]

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

export const replacementLabel = (path: string) => replaceableRoutes.find((route) => route.path === path)?.label ?? path
