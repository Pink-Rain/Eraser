/**
 * Le créateur de pages : des pages faites de blocs (titres, textes, encadrés, images,
 * secrets à révéler, carnets, vues d'index…), créées par les administrateurs et les MJ,
 * rangées sous une section du menu (/regles/…, /ressources/…), dans une campagne, ou hors
 * menu (/pages/…). Elles vivent sur le serveur partagé d'Eraser (lib/custom-pages-store.ts),
 * jamais dans Google Sheets.
 *
 * Règles pures : le serveur, l'atelier et les tests s'en servent. Le serveur ne laisse
 * partir vers un navigateur que ce que son lecteur a le droit de voir (`pageForViewer`) :
 * un bloc masqué ou un secret pas encore révélé ne quitte jamais le serveur.
 *
 * Une page peut aussi remplacer ou compléter une page d'Eraser (`replaces`, `replaceMode` :
 * lib/page-replacements.ts), ou servir de modèle à la page de chaque ligne d'un index
 * (`rowOf` : lib/custom-pages-rows.ts). Le menu modifiable a son propre enregistrement
 * (lib/app-menu.ts).
 */
import type { SiteRole } from "@/lib/auth-types"
import { internalAppPath } from "@/lib/app-links"
import { sanitizeRichText } from "@/lib/rich-text-sanitize"
import { cleanReplaceMode, isReplaceablePath, type ReplaceMode } from "@/lib/page-replacements"
import { cleanPresentation, isPresentationKind, type Presentation } from "@/lib/index-presentations"
import { parseFilterConditions, filterOperators, type Filter } from "@/lib/index-windows"
import { eraserModuleKeys, moduleSections, type EraserModuleKey } from "@/lib/eraser-modules"

/* ---------- Les types ---------- */

export type PageRole = SiteRole
/** Qui voit un bloc. « joueurs » : seulement les joueurs (un mot d'accueil, une consigne). */
export type BlockVisibility = "tous" | "joueurs" | "mj" | "mj-seul" | "admin"
/** Qui voit une page. */
export type PageVisibility = "tous" | "mj" | "admin"
/** Les sections du menu qui accueillent des pages, et leur adresse. */
export type PageSection = "regles" | "ressources" | "bac-a-sable" | "administration"
/** Où vit la page : une section du menu, une campagne, ou nulle part (lien direct). */
export type PagePlace = PageSection | "campagne" | "hors-menu"
export type PageStatus = "brouillon" | "publiee"
export type SectionLayout = "1" | "2" | "3" | "4" | "side-r" | "side-l"

export type BlockType = "title" | "text" | "callout" | "quote" | "image" | "separator" | "link" | "secret" | "notes" | "view" | "stat" | "rowfields" | "backlinks" | "search" | "module"
export type CalloutTone = "info" | "mj" | "secret" | "alerte"
export type ImageRatio = "auto" | "21/9" | "16/9" | "4/3" | "1/1" | "3/4"
export type SeparatorGlyph = "ornement" | "etoile" | "points" | "trait"
/** Les vues d'un index qu'un bloc Vue peut montrer (leur forme reste réglée dans l'index). */
export type ViewBlockKind = "table" | "cards" | "list" | "kanban" | "master-detail" | "calendar" | "dashboard" | "gallery" | "timeline" | "tree" | "codex"
export type ViewHeight = "auto" | "sm" | "md" | "lg"

/** `showIf` (page de ligne) : le bloc ne s'affiche que si la ligne de la page remplit ces conditions. */
type Common = { id: string; vis: BlockVisibility; showIf?: ViewWhere }
export type TitleBlock = Common & { type: "title"; eyebrow: string; text: string; level: "h2" | "h3"; align: "left" | "center" }
export type TextBlock = Common & { type: "text"; html: string }
export type CalloutBlock = Common & { type: "callout"; tone: CalloutTone; title: string; html: string }
export type QuoteBlock = Common & { type: "quote"; text: string; cite: string }
/**
 * L'allure d'une image ; chaque réglage absent vaut son défaut : toute la largeur, centrée, dans
 * un cadre (bordure, fond, ombre), arrondie de 16 px, sans dégradé, cadrée au centre.
 * `fade` : le bord (ou les bords) qui s'efface vers le transparent ; `fadeAmount` : la part de
 * l'image qu'il couvre (en %).
 */
export type ImageLook = {
  width?: number
  align?: "left" | "right"
  frame?: "tint" | "none"
  radius?: number
  fade?: ImageFade
  fadeAmount?: number
  focus?: "top" | "bottom" | "left" | "right"
}
export type ImageFade = "bottom" | "top" | "left" | "right" | "sides" | "ends" | "edges"
export const IMAGE_LOOK_DEFAULTS = { width: 100, radius: 16, fadeAmount: 40 } as const
export type ImageBlock = Common & { type: "image"; src: string; caption: string; ratio: ImageRatio; fit: "cover" | "contain"; look?: ImageLook }
export type SeparatorBlock = Common & { type: "separator"; glyph: SeparatorGlyph }
/** Un lien vers une page créée ici (`pageId`) ou une adresse d'Eraser (`href`). */
export type LinkBlock = Common & { type: "link"; pageId: string; href: string; title: string; description: string; style: "card" | "compact" }
/** Un secret que les joueurs ne reçoivent qu'une fois révélé (l'état de la révélation vit dans `live`). */
export type SecretBlock = Common & { type: "secret"; title: string; html: string }
/** Un carnet qu'on continue d'écrire sur la page publiée ; `html` : son texte de départ. */
export type NotesBlock = Common & { type: "notes"; title: string; html: string; editors: PageRole[] }
/** `rowMatch` (page de ligne) : seulement les lignes dont cette colonne cite la ligne de la page. */
export type ViewBlock = Common & {
  type: "view"; index: string; tab: string; kind: ViewBlockKind; limit: number; height: ViewHeight; heading: string; rowMatch: string
  /**
   * Ancien réglage (alpha 206) : un onglet-fenêtre de l'index. Gardé tel quel, mais plus lu :
   * un onglet-fenêtre n'est que le tableau filtré de l'index. Les conditions du bloc le remplacent.
   */
  viewId?: string
  /**
   * Une vue enregistrée de l'index (roadmap « Vues des index », D4) : le bloc la montre telle
   * qu'elle est réglée dans l'index (onglet, présentation, forme, carte, filtre, tri, clic) et ne
   * garde à lui que son titre, sa hauteur, son nombre de lignes, sa page de ligne et la recherche.
   * Ses autres champs sont la copie de la vue au dernier enregistrement : ce que la page montre si
   * la vue disparaît, et ce qu'elle garde quand on la détache (lib/index-saved-views.ts).
   */
  savedViewId?: string
  /** La forme réglée pour cette page seulement (sinon : le preset choisi, ou celle de l'onglet). */
  layout?: Presentation
  /** Un preset de vue (« Kanban serré », un des tiens…) : sa forme, appliquée aux colonnes de l'onglet. */
  presetId?: string
  /** Les cartes : laquelle des cartes de l'onglet (sinon celle à l'étoile). */
  cardId?: string
  /** Seulement les lignes qui remplissent ces conditions (« Type est Boss »). */
  where?: ViewWhere
  /** L'ordre des lignes (avant « Au plus ») ; une présentation peut avoir son propre tri. */
  sort?: { column: string; desc: boolean }
  /** Ne suit pas le bloc Recherche de la page. */
  ignoreSearch?: boolean
  /**
   * Au clic sur une ligne : sa fiche (d'office), une adresse d'Eraser où « {ID} » et
   * « {Colonne} » prennent les valeurs de la ligne (« /campagne/{ID} »), ou rien (« - »).
   */
  click?: string
}
/** Les conditions d'un bloc : « toutes » doivent être vraies, ou « une » suffit. */
export type ViewWhere = Filter
export type StatBlock = Common & { type: "stat"; index: string; statId: string; heading: string }
/** Page de ligne : les valeurs de la ligne (toutes, ou les colonnes choisies). */
/** « form » : disposées comme la fiche de l'index (Modifier › Formulaire). */
/** `formId` : lequel des formulaires de l'onglet (Modifier › Formulaire) ; vide : le formulaire étoilé. */
export type RowFieldsBlock = Common & { type: "rowfields"; columns: string[]; heading: string; style: "list" | "grid" | "form"; formId?: string }
/** Page de ligne : les lignes des autres index qui citent celle-ci (« Cité dans »). */
export type BacklinksBlock = Common & { type: "backlinks"; heading: string }
/** Un champ de recherche : il filtre les lignes des blocs Vue de la page (ceux qui le suivent). */
export type SearchBlock = Common & { type: "search"; placeholder: string; heading: string }
/** Un module d'Eraser (lib/eraser-modules.ts) ; `place` : la section d'un module « Pages d'une section ». */
export type ModuleBlock = Common & { type: "module"; module: EraserModuleKey; place: PageSection; heading: string }
export type PageBlock = TitleBlock | TextBlock | CalloutBlock | QuoteBlock | ImageBlock | SeparatorBlock | LinkBlock | SecretBlock | NotesBlock | ViewBlock | StatBlock | RowFieldsBlock | BacklinksBlock | SearchBlock | ModuleBlock

/** `widths` : la part de chaque colonne (en %, leur somme fait 100), quand on l'a réglée ; absente : celle de la disposition. */
export type PageSectionBlock = { id: string; layout: SectionLayout; framed: boolean; widths?: number[]; cols: PageBlock[][] }

/** Ce qui se publie (et se restaure avec « Revenir à la version publiée »). */
/** `hideHeader` : sans l'en-tête de la page (titre, icône, description), quand un bloc en tient lieu. */
export type PageContent = { title: string; icon: string; emoji: string; description: string; sections: PageSectionBlock[]; hideHeader?: boolean }

/** Ce qui change sur la page publiée sans passer par l'atelier : révélations et carnets. */
export type LiveBlockState = { revealedAt?: string; revealedBy?: string; html?: string; editedAt?: string; editedBy?: string }

export type PageAuthor = { uid: string; name: string }

export type CustomPage = PageContent & {
  id: string
  slug: string
  place: PagePlace
  /** La campagne d'une page de campagne. */
  campaignId: string
  vis: PageVisibility
  status: PageStatus
  /** L'adresse d'une page d'Eraser que celle-ci remplace ou complète (« /regles/combat »). */
  replaces?: string
  replaceMode?: ReplaceMode
  /** Un modèle de page pour chaque ligne d'un index (ou d'un de ses onglets). */
  rowOf?: { index: string; tab?: string }
  createdAt: string
  createdBy: PageAuthor
  updatedAt: string
  updatedBy: PageAuthor
  /** La dernière version publiée ; `null` : jamais publiée. */
  published: PageContent | null
  publishedAt: string
  publishedBy: PageAuthor | null
  trashedAt: string
  trashedBy: PageAuthor | null
  live: Record<string, LiveBlockState>
}

/** Un modèle fait par l'utilisateur : le contenu d'une page, sans son adresse ni sa place. */
export type PageTemplate = { id: string; name: string; content: PageContent; createdAt: string; createdBy: PageAuthor }

/** Ce que l'atelier envoie quand il enregistre : le brouillon et les réglages de la page. */
export type PageDraft = PageContent & { slug: string; place: PagePlace; campaignId: string; vis: PageVisibility; replaces?: string; replaceMode?: ReplaceMode; rowOf?: { index: string; tab?: string } }

/* ---------- Les libellés ---------- */

export const pageSections: Array<{ value: PageSection; label: string; path: string; roles: PageRole[] }> = [
  { value: "regles", label: "Règles", path: "/regles", roles: ["joueur", "mj", "admin"] },
  { value: "ressources", label: "Index", path: "/ressources", roles: ["mj", "admin"] },
  { value: "bac-a-sable", label: "Bac à sable", path: "/bac-a-sable", roles: ["mj", "admin"] },
  { value: "administration", label: "Administration", path: "/administration", roles: ["admin"] },
]

export const pagePlaces: Array<{ value: PagePlace; label: string }> = [
  ...pageSections.map((section) => ({ value: section.value as PagePlace, label: section.label })),
  { value: "campagne", label: "Une campagne" },
  { value: "hors-menu", label: "Hors menu (lien direct)" },
]

export const blockVisibilities: Array<{ value: BlockVisibility; label: string; short: string; hint: string }> = [
  { value: "tous", label: "Tout le monde", short: "Tout le monde", hint: "Joueurs, MJ et admin" },
  { value: "joueurs", label: "Joueurs seulement", short: "Joueurs", hint: "Masqué au MJ et à l’admin : un mot d’accueil, une consigne" },
  { value: "mj", label: "MJ et admin", short: "MJ et admin", hint: "Les joueurs ne le reçoivent jamais" },
  { value: "mj-seul", label: "MJ seulement", short: "MJ", hint: "Ni les joueurs ni l’admin (sauf en « Vue MJ ») : ses campagnes, ses outils" },
  { value: "admin", label: "Admin seulement", short: "Admin", hint: "Notes de construction, réglages" },
]

export const pageVisibilities: Array<{ value: PageVisibility; label: string; hint: string }> = [
  { value: "tous", label: "Tout le monde", hint: "Joueurs, MJ et admin (selon la section ou la campagne)" },
  { value: "mj", label: "MJ et admin", hint: "Les joueurs ne la trouvent ni ne l’ouvrent" },
  { value: "admin", label: "Admin seulement", hint: "Pages d’administration, brouillons privés" },
]

export const roleLabels: Record<PageRole, string> = { admin: "Admin", mj: "MJ", joueur: "Joueur" }

export const sectionLayouts: Array<{ value: SectionLayout; label: string; columns: number[] }> = [
  { value: "1", label: "Une colonne", columns: [1] },
  { value: "2", label: "Deux colonnes", columns: [1, 1] },
  { value: "3", label: "Trois colonnes", columns: [1, 1, 1] },
  { value: "4", label: "Quatre colonnes", columns: [1, 1, 1, 1] },
  { value: "side-r", label: "Contenu et colonne à droite", columns: [2, 1] },
  { value: "side-l", label: "Colonne à gauche et contenu", columns: [1, 2] },
]

export const viewBlockKinds: Array<{ value: ViewBlockKind; label: string }> = [
  { value: "table", label: "Tableau" },
  { value: "cards", label: "Cartes" },
  { value: "list", label: "Liste" },
  { value: "kanban", label: "Kanban" },
  { value: "master-detail", label: "Maître-détail" },
  { value: "calendar", label: "Calendrier" },
  { value: "dashboard", label: "Tableau de bord" },
  { value: "gallery", label: "Galerie" },
  { value: "timeline", label: "Chronologie" },
  { value: "tree", label: "Arborescence" },
  { value: "codex", label: "Codex" },
]

export const viewHeights: Array<{ value: ViewHeight; label: string; rem: number | null }> = [
  { value: "auto", label: "Toute la hauteur", rem: null },
  { value: "sm", label: "Petite", rem: 18 },
  { value: "md", label: "Moyenne", rem: 30 },
  { value: "lg", label: "Grande", rem: 44 },
]

/* ---------- Limites ---------- */

export const PAGE_LIMITS = { title: 120, description: 400, slug: 60, sections: 40, blocks: 200, columns: 3, html: 20_000, text: 400, src: 2_000, templates: 60, templateName: 60, json: 400_000 } as const

/* ---------- Petits outils ---------- */

const text = (value: unknown, max: number = PAGE_LIMITS.text) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback
const html = (value: unknown) => typeof value === "string" ? sanitizeRichText(value).slice(0, PAGE_LIMITS.html) : ""
const isId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{2,48}$/.test(value)

export const pageRoles: PageRole[] = ["joueur", "mj", "admin"]
const blockVisValues = blockVisibilities.map((item) => item.value)
const pageVisValues = pageVisibilities.map((item) => item.value)
const placeValues = pagePlaces.map((item) => item.value)
const layoutValues = sectionLayouts.map((item) => item.value)
const viewKindValues = viewBlockKinds.map((item) => item.value)

/** Un identifiant court, sans dépendance (bloc, section, page). */
export function newId(prefix = "b", random: () => number = Math.random) {
  let out = ""
  for (let index = 0; index < 8; index += 1) out += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]
  return `${prefix}-${out}`
}

/** « Guide du joueur » → « guide-du-joueur ». */
export function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae")
    .replace(/['’]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, PAGE_LIMITS.slug).replace(/-+$/g, "")
}

/** Les adresses déjà prises par les pages d'Eraser, section par section. */
export const reservedSlugs: Record<PagePlace, string[]> = {
  "regles": ["classes", "combat", "hors-combat", "vocabulaire"],
  "ressources": ["index", "armes-modificateurs", "sorts-des-classes", "sorts-des-creatures", "index-des-attributs", "index-des-calendriers", "index-des-campagnes", "index-des-caracteristiques", "index-des-classes", "index-des-creatures", "index-des-etats", "index-des-langues", "index-des-lieux", "index-des-materiaux", "index-des-objets", "index-des-personnages", "index-des-peuples", "index-des-pnjs", "index-des-religions", "index-des-runes", "index-des-succes", "index-du-vocabulaire"],
  "bac-a-sable": ["magasin", "pnjs", "tabletop"],
  "administration": ["campagnes", "comptes-et-roles", "corbeille", "google-drive", "personnages"],
  "campagne": ["document", "dossier", "evenements", "fouilles", "journal", "lieux-et-rencontres", "magasin-et-fouille", "pnjs", "roll20", "tabletop"],
  "hors-menu": [],
}
/** Réservés partout : les pages de l'atelier, et ce qui ressemblerait à une adresse technique. */
const reservedEverywhere = ["atelier", "pages", "nouvelle", "api", "index-des-pages", "modeles", "menu", "fiche"]

/** Le problème d'une adresse, ou "" si elle convient. `taken` : les adresses des autres pages au même endroit. */
export function slugProblem(slug: string, place: PagePlace, taken: string[] = []) {
  if (!slug) return "Donne une adresse à la page (lettres, chiffres et tirets)."
  if (slug !== slugify(slug)) return "L’adresse ne garde que des lettres sans accent, des chiffres et des tirets."
  if (reservedEverywhere.includes(slug) || reservedSlugs[place].includes(slug) || (place === "ressources" && /^index-d(?:es|u)-/.test(slug))) return `« ${slug} » est déjà l’adresse d’une page d’Eraser : choisis-en une autre.`
  if (taken.includes(slug)) return `Une autre page porte déjà l’adresse « ${slug} » à cet endroit.`
  return ""
}

/** L'adresse d'une page, sous sa section, sa campagne, ou /pages. */
export function pageHref(page: Pick<CustomPage, "place" | "slug" | "campaignId">) {
  const slug = encodeURIComponent(page.slug)
  if (page.place === "campagne") return `/campagne/${encodeURIComponent(page.campaignId)}/pages/${slug}`
  if (page.place === "hors-menu") return `/pages/${slug}`
  return `/${page.place}/${slug}`
}

/** L'atelier d'une page : son identifiant dans le chemin (jamais en « ?id= », voir app/pages/atelier). */
export function studioHref(id: string) {
  return `/pages/atelier/${encodeURIComponent(id)}`
}

/** Où se range la page, en mots (« Règles », « Campagne », « Hors menu »). */
export function placeLabel(place: PagePlace) {
  return pagePlaces.find((item) => item.value === place)?.label.replace(" (lien direct)", "") ?? "Hors menu"
}

/** Deux pages au même endroit (même section, même campagne, ou hors menu) se disputent une adresse. */
export function samePlace(left: Pick<CustomPage, "place" | "campaignId">, right: Pick<CustomPage, "place" | "campaignId">) {
  return left.place === right.place && (left.place !== "campagne" || left.campaignId === right.campaignId)
}

/* ---------- Les blocs ---------- */

export const blockCatalog: Array<{ type: BlockType; label: string; hint: string; group: "Texte" | "Révélations et carnets" | "Navigation" | "Données d’index" | "Page de ligne" | "Modules d’Eraser" }> = [
  { type: "title", label: "Titre", hint: "Un titre de partie, avec une petite ligne au-dessus", group: "Texte" },
  { type: "text", label: "Texte riche", hint: "Gras, listes, liens, couleurs et citations « { »", group: "Texte" },
  { type: "callout", label: "Encadré", hint: "Info, conseil du MJ, secret ou alerte", group: "Texte" },
  { type: "quote", label: "Citation", hint: "Une phrase en exergue, avec sa source", group: "Texte" },
  { type: "image", label: "Image", hint: "Une illustration, une carte, avec sa légende", group: "Texte" },
  { type: "separator", label: "Séparateur", hint: "Une respiration entre deux parties", group: "Texte" },
  { type: "secret", label: "Secret à révéler", hint: "Caché aux joueurs jusqu’à ce que le MJ le révèle", group: "Révélations et carnets" },
  { type: "notes", label: "Bloc-notes", hint: "Un carnet qu’on continue d’écrire sur la page publiée", group: "Révélations et carnets" },
  { type: "link", label: "Lien vers une page", hint: "Une carte-lien vers une page d’Eraser", group: "Navigation" },
  { type: "view", label: "Vue d’index", hint: "Tableau, cartes, liste, kanban, maître-détail… filtrée comme tu veux", group: "Données d’index" },
  { type: "search", label: "Recherche", hint: "Un champ qui filtre les vues d’index de la page", group: "Données d’index" },
  { type: "stat", label: "Statistiques", hint: "Une statistique d’un index, ou toutes ses épinglées", group: "Données d’index" },
  { type: "rowfields", label: "Valeurs de la ligne", hint: "Page de ligne : les colonnes de la ligne affichée", group: "Page de ligne" },
  { type: "module", label: "Module d’Eraser", hint: "Un morceau des pages d’Eraser : glossaire, répertoire des index, accueil, page d’origine…", group: "Modules d’Eraser" },
  { type: "backlinks", label: "Cité dans", hint: "Page de ligne : les lignes d’autres index qui la citent", group: "Page de ligne" },
]
export const blockTypes = blockCatalog.map((item) => item.type)
export const blockLabel = (type: BlockType) => blockCatalog.find((item) => item.type === type)?.label ?? type

/** Un bloc neuf, prêt à écrire. */
export function newBlock(type: BlockType, id = newId("b")): PageBlock {
  const common = { id, vis: "tous" as BlockVisibility }
  switch (type) {
    case "title": return { ...common, type, eyebrow: "", text: "Nouveau titre", level: "h2", align: "left" }
    case "text": return { ...common, type, html: "" }
    case "callout": return { ...common, type, tone: "info", title: "À savoir", html: "" }
    case "quote": return { ...common, type, text: "", cite: "" }
    case "image": return { ...common, type, src: "", caption: "", ratio: "16/9", fit: "cover" }
    case "separator": return { ...common, type, glyph: "ornement" }
    case "link": return { ...common, type, pageId: "", href: "", title: "", description: "", style: "card" }
    case "secret": return { ...common, type, title: "Secret", html: "" }
    case "notes": return { ...common, type, title: "Notes", html: "", editors: ["mj", "admin"] }
    case "view": return { ...common, type, index: "", tab: "", kind: "table", limit: 0, height: "auto", heading: "", rowMatch: "" }
    case "stat": return { ...common, type, index: "", statId: "", heading: "" }
    case "rowfields": return { ...common, type, columns: [], heading: "", style: "grid" }
    case "backlinks": return { ...common, type, heading: "Cité dans" }
    case "search": return { ...common, type, placeholder: "", heading: "" }
    case "module": return { ...common, type, module: "origine", place: "regles", heading: "" }
  }
}

/**
 * Une adresse d'image acceptée : https, un fichier servi par Eraser (/api/…), ou (page de
 * ligne) une colonne de la ligne : « {Image} ».
 */
export function cleanImageSource(value: unknown) {
  const source = typeof value === "string" ? value.trim().slice(0, PAGE_LIMITS.src) : ""
  if (/^\{[^{}<>"']{1,80}\}$/.test(source)) return source
  if (/^https:\/\/[^\s"'<>]+$/i.test(source)) return source
  if (/^\/api\/[^\s"'<>]*$/.test(source) && !source.includes("..")) return source
  return ""
}

/**
 * L'adresse que la page affiche pour une image : un lien de partage du Drive
 * (drive.google.com/file/d/…, open?id=…, uc?id=…) passe par Eraser, qui le lit avec son compte
 * Google ; une page web ne sait pas l'afficher telle quelle. Le reste ne change pas.
 */
export function pageImageUrl(source: string) {
  const match = /^https:\/\/(?:drive|docs)\.google\.com\//i.test(source) && (source.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/) ?? source.match(/[?&]id=([A-Za-z0-9_-]{10,})/))
  return match ? `/api/pages/images/${match[1]}` : source
}

/** L'allure d'une image remise en forme : seuls les réglages qui s'écartent du défaut restent. */
export function cleanImageLook(value: unknown): ImageLook | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  const look: ImageLook = {}
  const bounded = (input: unknown, min: number, max: number) => typeof input === "number" && Number.isFinite(input) ? Math.round(Math.min(max, Math.max(min, input))) : undefined
  const width = bounded(raw.width, 15, 100)
  if (width !== undefined && width !== IMAGE_LOOK_DEFAULTS.width) look.width = width
  if (raw.align === "left" || raw.align === "right") look.align = raw.align
  if (raw.frame === "tint" || raw.frame === "none") look.frame = raw.frame
  const radius = bounded(raw.radius, 0, 64)
  if (radius !== undefined && radius !== IMAGE_LOOK_DEFAULTS.radius) look.radius = radius
  if (typeof raw.fade === "string" && (["bottom", "top", "left", "right", "sides", "ends", "edges"] as string[]).includes(raw.fade)) {
    look.fade = raw.fade as ImageFade
    const amount = bounded(raw.fadeAmount, 5, 100)
    if (amount !== undefined && amount !== IMAGE_LOOK_DEFAULTS.fadeAmount) look.fadeAmount = amount
  }
  if (raw.focus === "top" || raw.focus === "bottom" || raw.focus === "left" || raw.focus === "right") look.focus = raw.focus
  return Object.keys(look).length ? look : undefined
}

const withImageLook = (value: unknown) => {
  const look = cleanImageLook(value)
  return look ? { look } : {}
}

/**
 * Le masque d'un dégradé vers le transparent (`mask-image`) : opaque au milieu, transparent au
 * bord choisi, sur `amount` % de l'image.
 */
export function imageFadeMask(fade: ImageFade | undefined, amount: number = IMAGE_LOOK_DEFAULTS.fadeAmount) {
  if (!fade) return undefined
  const part = Math.min(100, Math.max(5, amount))
  const solid = `${100 - part}%`
  switch (fade) {
    case "bottom": return `linear-gradient(to bottom, #000 ${solid}, transparent)`
    case "top": return `linear-gradient(to top, #000 ${solid}, transparent)`
    case "left": return `linear-gradient(to left, #000 ${solid}, transparent)`
    case "right": return `linear-gradient(to right, #000 ${solid}, transparent)`
    case "sides": return `linear-gradient(to right, transparent, #000 ${part / 2}%, #000 ${100 - part / 2}%, transparent)`
    case "ends": return `linear-gradient(to bottom, transparent, #000 ${part / 2}%, #000 ${100 - part / 2}%, transparent)`
    case "edges": return `radial-gradient(closest-side, #000 ${solid}, transparent)`
  }
}

/** Un lien accepté : une page d'Eraser (adresse relative) ou une adresse https. */
export function cleanLinkHref(value: unknown) {
  const raw = typeof value === "string" ? value.trim().slice(0, PAGE_LIMITS.src) : ""
  if (!raw) return ""
  const internal = internalAppPath(raw)
  if (internal) return /^\/api(\/|$)/.test(internal) ? "" : internal.replace(/["'<>\s]/g, "")
  return /^https:\/\/[^\s"'<>]+$/i.test(raw) ? raw : ""
}

/** « Au clic » d'un bloc Vue : « - » (rien), ou une adresse d'Eraser (« /campagne/{ID} »), jamais externe. */
export function cleanClick(value: unknown) {
  const raw = typeof value === "string" ? value.trim().slice(0, 300) : ""
  if (raw === "-") return "-"
  return /^\/(?!\/)[^\s"'<>\\]*$/.test(raw) && !/^\/api(\/|$)/.test(raw) ? raw : ""
}

/** Les conditions d'un bloc Vue ; aucune condition lisible : rien (toutes les lignes). */
export function cleanViewWhere(value: unknown): ViewWhere | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  const conditions = Array.isArray(raw.conditions) ? parseFilterConditions(JSON.stringify(raw.conditions)) : []
  return conditions.length ? { match: raw.match === "une" ? "une" : "toutes", conditions } : undefined
}

/**
 * Les conditions qui comptent : une condition encore incomplète (« Type est … » sans valeur,
 * le temps de l'écrire) n'écarte aucune ligne. « est vide » se choisit explicitement.
 */
export function activeWhere(where: ViewWhere | undefined): ViewWhere | undefined {
  if (!where) return undefined
  const conditions = where.conditions.filter((condition) => condition.column.trim() && (!filterOperators.find((operator) => operator.value === condition.operator)?.needsValue || condition.value.trim()))
  return conditions.length ? { ...where, conditions } : undefined
}

/** Un bloc reçu (atelier, modèle, serveur), remis en forme ; `null` s'il n'est pas lisible. */
export function cleanBlock(input: unknown): PageBlock | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const type = raw.type as BlockType
  if (!blockTypes.includes(type) || !isId(raw.id)) return null
  const base = newBlock(type, raw.id)
  const vis = oneOf(raw.vis, blockVisValues, base.vis)
  const showIf = cleanViewWhere(raw.showIf)
  const common = { id: raw.id, vis, ...(showIf ? { showIf } : {}) }
  switch (type) {
    case "title": return { ...common, type, eyebrow: text(raw.eyebrow, 120), text: text(raw.text, 200), level: oneOf(raw.level, ["h2", "h3"] as const, "h2"), align: oneOf(raw.align, ["left", "center"] as const, "left") }
    case "text": return { ...common, type, html: html(raw.html) }
    case "callout": return { ...common, type, tone: oneOf(raw.tone, ["info", "mj", "secret", "alerte"] as const, "info"), title: text(raw.title, 160), html: html(raw.html) }
    case "quote": return { ...common, type, text: text(raw.text, 600), cite: text(raw.cite, 200) }
    case "image": return { ...common, type, src: cleanImageSource(raw.src), caption: text(raw.caption, 300), ratio: oneOf(raw.ratio, ["auto", "21/9", "16/9", "4/3", "1/1", "3/4"] as const, "16/9"), fit: oneOf(raw.fit, ["cover", "contain"] as const, "cover"), ...withImageLook(raw.look) }
    case "separator": return { ...common, type, glyph: oneOf(raw.glyph, ["ornement", "etoile", "points", "trait"] as const, "ornement") }
    case "link": return { ...common, type, pageId: isId(raw.pageId) ? raw.pageId : "", href: isId(raw.pageId) ? "" : cleanLinkHref(raw.href), title: text(raw.title, 160), description: text(raw.description, 300), style: oneOf(raw.style, ["card", "compact"] as const, "card") }
    case "secret": return { ...common, type, title: text(raw.title, 160), html: html(raw.html) }
    case "notes": {
      const editors = Array.isArray(raw.editors) ? pageRoles.filter((role) => (raw.editors as unknown[]).includes(role)) : ["mj", "admin"] as PageRole[]
      return { ...common, type, title: text(raw.title, 160), html: html(raw.html), editors }
    }
    case "view": {
      const limit = Number(raw.limit)
      // Une forme propre à la page : seulement une présentation (le tableau et les cartes n'en ont pas).
      const layout = cleanPresentation(raw.layout)
      const ownLayout = layout && isPresentationKind(layout.kind) ? layout : undefined
      const viewId = text(raw.viewId, 60)
      const savedViewId = text(raw.savedViewId, 80)
      const presetId = ownLayout ? "" : text(raw.presetId, 80)
      const cardId = text(raw.cardId, 60)
      const where = cleanViewWhere(raw.where)
      const sortRaw = raw.sort && typeof raw.sort === "object" ? raw.sort as Record<string, unknown> : null
      const sortColumn = sortRaw ? text(sortRaw.column, 120) : ""
      return { ...common, type, index: text(raw.index, 90), tab: text(raw.tab, 120), kind: ownLayout ? ownLayout.kind as ViewBlockKind : oneOf(raw.kind, viewKindValues, "table"), limit: Number.isFinite(limit) ? Math.max(0, Math.min(500, Math.round(limit))) : 0, height: oneOf(raw.height, ["auto", "sm", "md", "lg"] as const, "auto"), heading: text(raw.heading, 160), rowMatch: text(raw.rowMatch, 120), ...(viewId ? { viewId } : {}), ...(savedViewId ? { savedViewId } : {}), ...(ownLayout ? { layout: ownLayout } : {}), ...(presetId ? { presetId } : {}), ...(cardId ? { cardId } : {}), ...(where ? { where } : {}), ...(sortColumn ? { sort: { column: sortColumn, desc: sortRaw?.desc === true } } : {}), ...(raw.ignoreSearch === true ? { ignoreSearch: true } : {}), ...(cleanClick(raw.click) ? { click: cleanClick(raw.click) } : {}) }
    }
    case "stat": return { ...common, type, index: text(raw.index, 90), statId: text(raw.statId, 60), heading: text(raw.heading, 160) }
    case "rowfields": return { ...common, type, columns: Array.isArray(raw.columns) ? raw.columns.flatMap((column) => { const clean = text(column, 120); return clean ? [clean] : [] }).slice(0, 40) : [], heading: text(raw.heading, 160), style: oneOf(raw.style, ["list", "grid", "form"] as const, "grid"), ...(text(raw.formId, 40) ? { formId: text(raw.formId, 40) } : {}) }
    case "backlinks": return { ...common, type, heading: text(raw.heading, 160) }
    case "search": return { ...common, type, placeholder: text(raw.placeholder, 120), heading: text(raw.heading, 160) }
    case "module": return { ...common, type, module: oneOf(raw.module, eraserModuleKeys, "origine"), place: oneOf(raw.place, moduleSections.map((item) => item.value), "regles"), heading: text(raw.heading, 160) }
  }
}

/** Une colonne d'une section, au moins (en %). */
export const MIN_COLUMN_WIDTH = 5

/** La part de chaque colonne d'une disposition (en %), telle qu'elle est sans réglage. */
export function defaultSectionWidths(layout: SectionLayout) {
  const weights = sectionLayouts.find((item) => item.value === layout)?.columns ?? [1]
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => weight / total * 100)
}

/**
 * Les largeurs réglées d'une section : une part par colonne, d'au moins `MIN_COLUMN_WIDTH` %,
 * ramenées à 100 en tout ; absentes si elles ne lisent pas ou valent celles de la disposition.
 */
export function cleanSectionWidths(value: unknown, layout: SectionLayout): number[] | undefined {
  const wanted = sectionLayouts.find((item) => item.value === layout)?.columns.length ?? 1
  if (wanted < 2 || !Array.isArray(value) || value.length !== wanted || !value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)) return undefined
  const total = (value as number[]).reduce((sum, item) => sum + item, 0)
  let parts = (value as number[]).map((item) => item / total * 100)
  // Une colonne trop étroite prend le minimum, pris sur les autres (à proportion).
  for (let pass = 0; pass < wanted; pass += 1) {
    const low = parts.map((part) => part < MIN_COLUMN_WIDTH)
    if (!low.some(Boolean)) break
    const free = parts.reduce((sum, part, index) => low[index] ? sum : sum + part, 0)
    const room = 100 - MIN_COLUMN_WIDTH * low.filter(Boolean).length
    parts = parts.map((part, index) => low[index] ? MIN_COLUMN_WIDTH : part / free * room)
  }
  const widths = parts.map((part) => Math.round(part * 10) / 10)
  const defaults = defaultSectionWidths(layout)
  return widths.every((item, index) => Math.abs(item - defaults[index]) < 0.6) ? undefined : widths
}

/** Une section n'a pas plus de colonnes. */
export const MAX_SECTION_COLUMNS = 4

/** La disposition d'une section de `count` colonnes ; à deux colonnes, `current` reste si elle en a deux. */
export function layoutForColumns(count: number, current: SectionLayout = "1"): SectionLayout {
  const wanted = Math.min(MAX_SECTION_COLUMNS, Math.max(1, Math.round(count)))
  if (wanted === 2) return current === "side-r" || current === "side-l" || current === "2" ? current : "2"
  return String(wanted) as SectionLayout
}

/**
 * Les largeurs après l'ajout ou le retrait d'une colonne : une colonne ajoutée prend sa part
 * égale, les autres gardent leurs proportions ; une colonne retirée rend sa place aux autres.
 * Sans largeurs réglées : celles de la disposition (`undefined`).
 */
export function widthsForColumns(widths: number[] | undefined, count: number, layout: SectionLayout): number[] | undefined {
  if (!widths) return undefined
  const next = count > widths.length
    ? [...widths.map((width) => width * widths.length / count), ...Array.from({ length: count - widths.length }, () => 100 / count)]
    : widths.slice(0, count)
  return cleanSectionWidths(next, layout)
}

/** Les sections d'une page : dispositions connues, autant de colonnes que la disposition en veut. */
export function cleanSections(input: unknown): PageSectionBlock[] {
  const seen = new Set<string>()
  let count = 0
  const sections = (Array.isArray(input) ? input : []).slice(0, PAGE_LIMITS.sections).flatMap((value): PageSectionBlock[] => {
    if (!value || typeof value !== "object") return []
    const raw = value as Record<string, unknown>
    const layout = oneOf(raw.layout, layoutValues, "1")
    const wanted = sectionLayouts.find((item) => item.value === layout)!.columns.length
    const columns = Array.isArray(raw.cols) ? raw.cols : []
    const cols: PageBlock[][] = Array.from({ length: wanted }, () => [])
    columns.forEach((column, index) => {
      // Une colonne de trop (disposition changée) rejoint la dernière.
      const target = cols[Math.min(index, wanted - 1)]
      for (const item of Array.isArray(column) ? column : []) {
        const block = cleanBlock(item)
        if (!block || seen.has(block.id) || count >= PAGE_LIMITS.blocks) continue
        seen.add(block.id)
        count += 1
        target.push(block)
      }
    })
    const widths = cleanSectionWidths(raw.widths, layout)
    return [{ id: isId(raw.id) && !seen.has(raw.id) ? raw.id : newId("s"), layout, framed: raw.framed === true, ...(widths ? { widths } : {}), cols }]
  })
  return sections.length ? sections : [{ id: newId("s"), layout: "1", framed: false, cols: [[]] }]
}

/** Le contenu publiable d'une page (titre, icône, description, sections). */
export function cleanContent(input: unknown): PageContent {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  return {
    title: text(raw.title, PAGE_LIMITS.title) || "Nouvelle page",
    icon: typeof raw.icon === "string" && /^[a-z0-9-]{1,60}$/.test(raw.icon) ? raw.icon : "",
    emoji: typeof raw.emoji === "string" ? [...raw.emoji.trim()].slice(0, 4).join("") : "",
    description: text(raw.description, PAGE_LIMITS.description),
    sections: cleanSections(raw.sections),
    ...(raw.hideHeader === true ? { hideHeader: true } : {}),
  }
}

/**
 * Le brouillon et les réglages envoyés par l'atelier, remis en forme. L'adresse vide prend
 * celle du titre ; une page d'Administration n'est jamais montrée qu'aux admins.
 */
export function cleanCustomPage(input: unknown): PageDraft {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const content = cleanContent(raw)
  const place = oneOf(raw.place, placeValues, "hors-menu")
  const campaignId = place === "campagne" && typeof raw.campaignId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(raw.campaignId) ? raw.campaignId : ""
  const slug = slugify(typeof raw.slug === "string" && raw.slug.trim() ? raw.slug : content.title) || "page"
  const vis = place === "administration" ? "admin" : oneOf(raw.vis, pageVisValues, "tous")
  // Seules les adresses d'Eraser prévues (jamais une route technique) se remplacent.
  const replaces = typeof raw.replaces === "string" && isReplaceablePath(raw.replaces.trim()) ? raw.replaces.trim() : ""
  const rowOf = raw.rowOf && typeof raw.rowOf === "object" ? { index: text((raw.rowOf as Record<string, unknown>).index, 90), tab: text((raw.rowOf as Record<string, unknown>).tab, 120) } : null
  // Un modèle de page de ligne (« {Nom} »…) ou une page de campagne (lisible selon ses
  // membres, ce que la coque ne sait pas sans Google) ne remplace jamais une page d'Eraser.
  return {
    ...content, slug, place, campaignId, vis,
    ...(replaces && !rowOf?.index && place !== "campagne" ? { replaces, replaceMode: cleanReplaceMode(raw.replaceMode) } : {}),
    ...(rowOf?.index ? { rowOf: rowOf.tab ? rowOf : { index: rowOf.index } } : {}),
  }
}

const author = (value: unknown): PageAuthor => {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  return { uid: text(raw.uid, 120), name: text(raw.name, 120) }
}

/** Une page lue sur le serveur partagé ; `null` si elle n'a pas la bonne forme. */
export function parseCustomPage(input: unknown): CustomPage | null {
  let value = input
  if (typeof value === "string") { try { value = JSON.parse(value) } catch { return null } }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (!isId(raw.id)) return null
  const draft = cleanCustomPage(raw)
  const live: Record<string, LiveBlockState> = {}
  if (raw.live && typeof raw.live === "object") {
    for (const [id, state] of Object.entries(raw.live as Record<string, unknown>)) {
      if (!isId(id) || !state || typeof state !== "object") continue
      const entry = state as Record<string, unknown>
      const clean: LiveBlockState = {}
      if (typeof entry.revealedAt === "string" && entry.revealedAt) { clean.revealedAt = entry.revealedAt.slice(0, 40); clean.revealedBy = text(entry.revealedBy, 120) }
      if (typeof entry.html === "string") { clean.html = html(entry.html); clean.editedAt = text(entry.editedAt, 40); clean.editedBy = text(entry.editedBy, 120) }
      if (Object.keys(clean).length) live[id] = clean
    }
  }
  return {
    ...draft,
    id: raw.id,
    status: raw.status === "publiee" ? "publiee" : "brouillon",
    createdAt: text(raw.createdAt, 40),
    createdBy: author(raw.createdBy),
    updatedAt: text(raw.updatedAt, 40),
    updatedBy: author(raw.updatedBy),
    published: raw.published && typeof raw.published === "object" ? cleanContent(raw.published) : null,
    publishedAt: text(raw.publishedAt, 40),
    publishedBy: raw.publishedBy ? author(raw.publishedBy) : null,
    trashedAt: text(raw.trashedAt, 40),
    trashedBy: raw.trashedBy ? author(raw.trashedBy) : null,
    live,
  }
}

export function contentOf(page: PageContent): PageContent {
  return { title: page.title, icon: page.icon, emoji: page.emoji, description: page.description, sections: page.sections, ...(page.hideHeader ? { hideHeader: true } : {}) }
}

/** Le brouillon diffère-t-il de la version publiée ? */
export function hasUnpublishedChanges(page: CustomPage) {
  return !page.published || JSON.stringify(contentOf(page)) !== JSON.stringify(contentOf(page.published))
}

export function allBlocks(content: Pick<PageContent, "sections">) {
  return content.sections.flatMap((section) => section.cols.flat())
}

/**
 * Les pages (hors corbeille) dont un bloc Vue montre une vue enregistrée de cet index, version
 * en cours ou version publiée : par identifiant de vue. L'index s'en sert pour avertir avant de
 * modifier ou de supprimer une vue.
 */
export function savedViewUses(pages: CustomPage[], index: string) {
  const uses: Record<string, Array<{ id: string; title: string; href: string }>> = {}
  for (const page of pages) {
    if (page.trashedAt) continue
    const ids = new Set([...allBlocks(page), ...(page.published ? allBlocks(page.published) : [])].flatMap((block) => block.type === "view" && block.savedViewId && block.index === index ? [block.savedViewId] : []))
    for (const id of ids) (uses[id] ??= []).push({ id: page.id, title: page.title, href: pageHref(page) })
  }
  return uses
}

export function findBlock(content: Pick<PageContent, "sections">, id: string) {
  return allBlocks(content).find((block) => block.id === id) ?? null
}

/** Un contenu recopié avec de nouveaux identifiants (modèle, duplication). */
export function reIdContent(content: PageContent, random: () => number = Math.random): PageContent {
  return {
    ...content,
    sections: content.sections.map((section) => ({ ...section, id: newId("s", random), cols: section.cols.map((column) => column.map((block) => ({ ...block, id: newId("b", random) }))) })),
  }
}

/* ---------- Qui voit, qui modifie ---------- */

/**
 * Le lecteur d'une page : son rôle (vue choisie), son compte ; pour une page de campagne,
 * s'il en est (`member` : MJ ou joueur) et s'il en est le MJ (`manager`).
 */
export type PageViewer = { role: PageRole; uid: string; name?: string; member?: boolean; manager?: boolean }

export const canManagePages = (role: PageRole) => role === "admin" || role === "mj"

export function blockVisibleTo(vis: BlockVisibility, role: PageRole) {
  if (vis === "tous") return true
  if (vis === "joueurs") return role === "joueur"
  if (vis === "mj") return role === "mj" || role === "admin"
  if (vis === "mj-seul") return role === "mj"
  return role === "admin"
}

export function pageVisibleTo(vis: PageVisibility, role: PageRole) {
  return vis === "tous" || (vis === "mj" ? role !== "joueur" : role === "admin")
}

/**
 * Peut-il changer la page dans l'atelier ? Un admin, toujours ; un MJ, hors pages réservées
 * aux admins et hors Administration, et pour une page de campagne seulement la sienne.
 */
export function canEditPage(page: Pick<CustomPage, "vis" | "place">, viewer: PageViewer) {
  if (viewer.role === "admin") return true
  if (viewer.role !== "mj") return false
  if (page.vis === "admin" || page.place === "administration") return false
  return page.place !== "campagne" || Boolean(viewer.manager)
}

/** La section accepte-t-elle ce rôle (Administration : admins ; Index, Bac à sable : MJ et admins) ? */
export function placeOpenTo(place: PagePlace, role: PageRole) {
  const section = pageSections.find((item) => item.value === place)
  return section ? section.roles.includes(role) : true
}

/**
 * Peut-il lire la page ? Publiée (ou brouillon pour qui peut la modifier), pas à la
 * corbeille, visible pour son rôle, et pour une page de campagne : membre de la campagne.
 */
export function canReadPage(page: CustomPage, viewer: PageViewer) {
  if (page.trashedAt) return false
  if (!pageVisibleTo(page.vis, viewer.role) || !placeOpenTo(page.place, viewer.role)) return false
  if (page.place === "campagne" && viewer.role !== "admin" && !viewer.member) return false
  return page.status === "publiee" && Boolean(page.published) ? true : canEditPage(page, viewer)
}

export function canEditNotes(block: Pick<NotesBlock, "editors" | "vis">, role: PageRole) {
  return block.editors.includes(role) && blockVisibleTo(block.vis, role)
}

export const canRevealSecrets = (role: PageRole) => role === "admin" || role === "mj"

/** Un bloc tel que le lecteur le reçoit : l'état vivant posé dessus. */
export type ViewedBlock = PageBlock & { revealedAt?: string; revealedBy?: string; editedAt?: string; editedBy?: string; canEdit?: boolean }
export type ViewedSection = Omit<PageSectionBlock, "cols"> & { cols: ViewedBlock[][] }

export type PageView = {
  id: string
  title: string
  icon: string
  emoji: string
  description: string
  hideHeader?: boolean
  href: string
  slug: string
  place: PagePlace
  campaignId: string
  vis: PageVisibility
  status: PageStatus
  sections: ViewedSection[]
  /** Le brouillon est montré (page jamais publiée, ou dépubliée). */
  draft: boolean
  /** Le lecteur peut ouvrir la page dans l'atelier. */
  editable: boolean
  /** Pour qui peut la modifier : des changements attendent d'être publiés. */
  unpublished: boolean
  canReveal: boolean
  updatedAt: string
}

/**
 * Ce que le lecteur reçoit d'une page : la version publiée (le brouillon pour qui peut
 * modifier une page pas encore publiée), sans les blocs qu'il ne voit pas, sans le contenu
 * d'un secret pas encore révélé (joueurs), avec les carnets dans leur dernier état.
 * `null` : la page ne lui est pas ouverte.
 */
export function pageForViewer(page: CustomPage, viewer: PageViewer, options: { draft?: boolean } = {}): PageView | null {
  if (!canReadPage(page, viewer)) return null
  const editable = canEditPage(page, viewer)
  const showDraft = (options.draft && editable) || page.status !== "publiee" || !page.published
  const content = showDraft ? contentOf(page) : page.published!
  const reveal = canRevealSecrets(viewer.role)
  const sections = content.sections.map((section) => ({
    ...section,
    cols: section.cols.map((column) => column.flatMap((block): ViewedBlock[] => {
      if (!blockVisibleTo(block.vis, viewer.role)) return []
      const live = page.live[block.id] ?? {}
      if (block.type === "secret") {
        // Le contenu d'un secret ne part vers un joueur qu'une fois révélé.
        if (!live.revealedAt && !reveal) return []
        return [{ ...block, ...(live.revealedAt ? { revealedAt: live.revealedAt, revealedBy: live.revealedBy ?? "" } : {}) }]
      }
      if (block.type === "notes") {
        return [{ ...block, html: live.html ?? block.html, ...(live.editedAt ? { editedAt: live.editedAt, editedBy: live.editedBy ?? "" } : {}), canEdit: canEditNotes(block, viewer.role) }]
      }
      return [block]
    })),
  }))
  return {
    id: page.id,
    title: content.title,
    icon: content.icon,
    emoji: content.emoji,
    description: content.description,
    ...(content.hideHeader ? { hideHeader: true } : {}),
    href: pageHref(page),
    slug: page.slug,
    place: page.place,
    campaignId: page.campaignId,
    vis: page.vis,
    status: page.status,
    sections,
    draft: showDraft,
    editable,
    unpublished: editable && hasUnpublishedChanges(page),
    canReveal: reveal,
    updatedAt: editable ? page.updatedAt : "",
  }
}

/** Ce que l'Index des pages montre d'une page (sans son contenu). */
export type PageSummary = {
  id: string
  title: string
  icon: string
  emoji: string
  description: string
  href: string
  slug: string
  place: PagePlace
  campaignId: string
  vis: PageVisibility
  status: PageStatus
  unpublished: boolean
  blocks: number
  updatedAt: string
  updatedBy: string
  trashedAt: string
  editable: boolean
  /** La page d'Eraser qu'elle remplace ou complète. */
  replaces?: string
  replaceMode?: ReplaceMode
}

export function pageSummary(page: CustomPage, viewer: PageViewer): PageSummary {
  return {
    id: page.id, title: page.title, icon: page.icon, emoji: page.emoji, description: page.description, href: pageHref(page), slug: page.slug,
    place: page.place, campaignId: page.campaignId, vis: page.vis, status: page.status, unpublished: hasUnpublishedChanges(page),
    blocks: allBlocks(page).length, updatedAt: page.updatedAt, updatedBy: page.updatedBy.name, trashedAt: page.trashedAt, editable: canEditPage(page, viewer),
    ...(page.replaces ? { replaces: page.replaces, replaceMode: page.replaceMode ?? "after" } : {}),
  }
}

/** Le brouillon d'une page tel que l'atelier l'ouvre (états vivants compris, pour les montrer). */
export type StudioPage = PageDraft & {
  id: string
  status: PageStatus
  updatedAt: string
  updatedBy: string
  publishedAt: string
  published: boolean
  unpublished: boolean
  trashedAt: string
  live: Record<string, LiveBlockState>
}

export function studioPage(page: CustomPage): StudioPage {
  return {
    ...contentOf(page), slug: page.slug, place: page.place, campaignId: page.campaignId, vis: page.vis,
    ...(page.replaces ? { replaces: page.replaces, replaceMode: page.replaceMode ?? "after" } : {}), ...(page.rowOf ? { rowOf: page.rowOf } : {}),
    id: page.id, status: page.status, updatedAt: page.updatedAt, updatedBy: page.updatedBy.name, publishedAt: page.publishedAt,
    published: Boolean(page.published), unpublished: hasUnpublishedChanges(page), trashedAt: page.trashedAt, live: page.live,
  }
}

/* ---------- Modèles ---------- */

export function cleanTemplateName(value: unknown) {
  return text(value, PAGE_LIMITS.templateName)
}

export function parseTemplate(input: unknown): PageTemplate | null {
  let value = input
  if (typeof value === "string") { try { value = JSON.parse(value) } catch { return null } }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const name = cleanTemplateName(raw.name)
  if (!isId(raw.id) || !name) return null
  return { id: raw.id, name, content: cleanContent(raw.content), createdAt: text(raw.createdAt, 40), createdBy: author(raw.createdBy) }
}

/**
 * Le contenu d'une page pour un modèle : les carnets gardent leur texte du moment (comme
 * texte de départ), les secrets repartent cachés (une révélation vit dans la page, pas
 * dans le modèle).
 */
export function templateContent(page: CustomPage): PageContent {
  const content = contentOf(page)
  return {
    ...content,
    sections: content.sections.map((section) => ({ ...section, cols: section.cols.map((column) => column.map((block) => block.type === "notes" && page.live[block.id]?.html !== undefined ? { ...block, html: page.live[block.id].html! } : block)) })),
  }
}
