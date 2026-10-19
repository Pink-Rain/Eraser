/**
 * Les pages d'Eraser rendues modifiables : « Modifier » (Index des pages › Pages d'Eraser) crée
 * une page du créateur de pages qui remplace celle d'Eraser, en brouillon, avec ces blocs.
 * Rien ne change pour les lecteurs tant qu'elle n'est pas publiée, et la mettre à la corbeille
 * rend la page d'origine.
 *
 * Les pages faites de textes, de liens et de vues d'un index (Règles, Classes, Combat…) sont
 * redessinées en blocs : les cartes des classes deviennent un bloc Vue d'index (preset
 * « Classes par famille », carte « Carte de classe » de l'index des classes). Ce qui est de
 * la mécanique d'Eraser (glossaire modifiable, répertoire des index, accueil) devient un bloc
 * Module d'Eraser. Les autres pages (fiche de personnage, tabletop, campagne…) gardent tout
 * leur contenu dans le module « Contenu de la page d'origine », autour duquel on ajoute ce
 * qu'on veut.
 *
 * Règles pures : la route /api/pages et les tests s'en servent.
 */
import { hasUnpublishedChanges, newId, slugify, type CustomPage, type PageRole, type PageVisibility, type ModuleBlock, type PageBlock, type PageContent, type PageSection, type PageSectionBlock, type SectionLayout } from "@/lib/custom-pages"
import type { EraserModuleKey } from "@/lib/eraser-modules"
import { matchesReplacement, replaceableRoutes, replacementLabel, type ReplaceMode } from "@/lib/page-replacements"

type Blueprint = Omit<PageContent, "sections"> & { sections: PageSectionBlock[] }

const section = (layout: SectionLayout, ...cols: PageBlock[][]): PageSectionBlock => ({ id: newId("s"), layout, framed: false, cols })
const text = (html: string): PageBlock => ({ id: newId("b"), vis: "tous", type: "text", html })
const link = (href: string, title: string, description: string, options: { compact?: boolean; vis?: PageBlock["vis"] } = {}): PageBlock => ({ id: newId("b"), vis: options.vis ?? "tous", type: "link", pageId: "", href, title, description, style: options.compact ? "compact" : "card" })
const eraserModule = (key: EraserModuleKey, place: PageSection = "regles"): ModuleBlock => ({ id: newId("b"), vis: "tous", type: "module", module: key, place, heading: "" })

/** Une page de menu : son texte, ses liens deux par deux, puis les pages créées dans sa section. */
function menuPage(title: string, icon: string, description: string, links: Array<[string, string, string]>, place: PageSection, intro = ""): Blueprint {
  const left = links.filter((_, index) => index % 2 === 0).map(([href, label, hint]) => link(href, label, hint))
  const right = links.filter((_, index) => index % 2 === 1).map(([href, label, hint]) => link(href, label, hint))
  return { title, icon, emoji: "", description, sections: [...(intro ? [section("1", [text(intro)])] : []), section("2", left, right), section("1", [eraserModule("pages-section", place)])] }
}

const lorem = "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua : tout ce qu’il faut savoir pour jouer à Eraser.</p><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>"

const blueprints: Record<string, () => Blueprint> = {
  // L'accueil : « Mes campagnes » (MJ) et « Mes personnages » (joueurs) sont des vues de leur
  // index, filtrées sur le lecteur (« {Moi} ») ; les choses à faire (admin), la colonne de côté
  // et les succès restent des modules.
  "/": () => ({
    title: "Accueil", icon: "house", emoji: "", description: "", hideHeader: true,
    sections: [
      section("1", [eraserModule("accueil-salutation")]),
      section("side-r", [
        { id: newId("b"), vis: "tous", type: "search", placeholder: "Chercher une campagne, un personnage", heading: "" },
        { id: newId("b"), vis: "mj-seul", type: "view", index: "campaigns", tab: "Campagnes", kind: "list", limit: 0, height: "auto", heading: "Mes campagnes", rowMatch: "",
          layout: { kind: "list", itemCard: "eraser-campagne-grille", listColumns: 2 }, where: { match: "toutes", conditions: [{ column: "MJ", operator: "est", value: "{Moi}" }] }, sort: { column: "Nom de la campagne", desc: false }, click: "/campagne/{ID}" },
        { id: newId("b"), vis: "joueurs", type: "view", index: "characters", tab: "Personnages", kind: "list", limit: 0, height: "auto", heading: "Mes personnages", rowMatch: "",
          layout: { kind: "list", itemCard: "eraser-personnage-grille", listColumns: 3 }, where: { match: "toutes", conditions: [{ column: "Joueur", operator: "est", value: "{Moi}" }] }, sort: { column: "Nom personnage", desc: false }, click: "/personnage/{ID}" },
        { ...eraserModule("accueil-a-faire"), vis: "admin" },
      ], [eraserModule("accueil-cote")]),
      section("1", [eraserModule("accueil-succes")]),
    ],
  }),
  "/regles": () => menuPage("Règles", "scroll-text", "", [
    ["/regles/classes", "Classes", "Les classes jouables, leurs rangs et leurs sorts."],
    ["/regles/vocabulaire", "Vocabulaire", "Les mots de la table et leur définition."],
    ["/regles/combat", "Combat", "Tours, actions, états et résolution des affrontements."],
    ["/regles/hors-combat", "Hors combat", "Exploration, social, repos et tout ce qui se passe entre deux combats."],
  ], "regles", lorem),
  "/regles/classes": () => ({
    title: "Classe", icon: "library-big", emoji: "", description: "Parcours les classes par grande famille, puis ouvre une carte pour consulter sa fiche.",
    sections: [section("1", [
      link("/creation-de-classe", "Créateur de classe", "Créer une classe, ses rangs et ses sorts.", { compact: true, vis: "mj" }),
      { id: newId("b"), vis: "tous", type: "view", index: "classes", tab: "Classes", kind: "list", limit: 0, height: "auto", heading: "", rowMatch: "", presetId: "eraser:classes-par-famille" },
      { ...eraserModule("classes-accents"), vis: "admin" },
    ])],
  }),
  // La page d'une classe : la page de chaque ligne de l'index des classes. Ses sorts sont une
  // vue de l'index des sorts, rangée par la colonne de la classe (« {ID} » : celle de la page).
  "/regles/classes/[id]": () => ({
    title: "{Nom de la classe}", icon: "library-big", emoji: "", description: "", hideHeader: true,
    sections: [
      section("2", [link("/regles/classes", "Retour aux classes", "Toutes les classes, par famille.", { compact: true })], [link("/creation-de-classe?classe={ID}", "Modifier dans le créateur de classe", "Ses rangs, ses sorts, sa présentation.", { compact: true, vis: "mj" })]),
      section("side-l",
        [{ id: newId("b"), vis: "tous", type: "image", src: "{Image}", caption: "", ratio: "1/1", fit: "contain" }],
        [{ id: newId("b"), vis: "tous", type: "title", eyebrow: "{Type}", text: "{Nom de la classe}", level: "h2", align: "left" }, eraserModule("classe-presentation")]),
      section("1", [
        { id: newId("b"), vis: "tous", type: "title", eyebrow: "Progression", text: "Sorts de classe", level: "h2", align: "left" },
        { id: newId("b"), vis: "tous", type: "view", index: "class-spells", tab: "Sorts", kind: "list", limit: 0, height: "auto", heading: "", rowMatch: "",
          layout: { kind: "list", groupBy: "{ID}", itemCard: "eraser-sort-carte", listColumns: 3, hideEmpty: true, hideCounts: true, look: { sectionStyle: "heading" } },
          where: { match: "toutes", conditions: [{ column: "{ID}", operator: "non-vide", value: "" }] } },
      ]),
      section("1", [
        { id: newId("b"), vis: "tous", type: "title", eyebrow: "Progression", text: "Bonus de rang", level: "h3", align: "left" },
        { id: newId("b"), vis: "tous", type: "view", index: "rank-bonuses", tab: "Bonus de rang", kind: "cards", limit: 0, height: "auto", heading: "", rowMatch: "", cardId: "eraser-bonus-rang" },
      ]),
      section("1", [eraserModule("classe-specificites")]),
    ],
  }),
  // Le glossaire : une vue de l'index du vocabulaire, rangée par première lettre, la lettre en
  // marge, le menu des lettres en haut, chaque mot dessiné avec la carte « Entrée de glossaire ».
  "/regles/vocabulaire": () => ({
    title: "Vocabulaire", icon: "book-text", emoji: "", description: "Le dictionnaire des mots qu’on utilise sans arrêt autour de la table, rangés par ordre alphabétique.",
    sections: [section("1", [
      link("/ressources/index-du-vocabulaire", "Ouvrir l’index du vocabulaire", "Ajouter, renommer, ranger les mots dans l’index.", { compact: true, vis: "mj" }),
      { id: newId("b"), vis: "tous", type: "view", index: "vocabulary", tab: "Vocabulaire", kind: "list", limit: 0, height: "auto", heading: "", rowMatch: "",
        layout: { kind: "list", alphabet: true, menu: "top", itemCard: "eraser-vocabulaire-entree", listColumns: 2, hideCounts: true, look: { sectionStyle: "letter", surface: "plain", density: "compact" } }, sort: { column: "Nom", desc: false } },
    ])],
  }),
  "/regles/combat": () => ({
    title: "Combat", icon: "swords", emoji: "", description: "Les règles de tours, d’actions, d’états et de résolution des affrontements seront réunies ici.",
    sections: [section("1", [text("<p><em>Cette page est prête à recevoir son contenu.</em></p>")])],
  }),
  "/regles/hors-combat": () => ({
    title: "Hors combat", icon: "compass", emoji: "", description: "Exploration, interactions, tests et autres résolutions hors affrontement prendront place ici.",
    sections: [section("1", [text("<p><em>Cette page est prête à recevoir son contenu.</em></p>")])],
  }),
  "/ressources": () => ({
    title: "Index", icon: "library-big", emoji: "", description: "Toutes les bibliothèques d’Eraser, au même endroit. L’étoile d’une carte la met dans la section Index du menu ; l’étoile rouge (clic droit) la met directement dans le menu.",
    sections: [section("1", [eraserModule("pages-section", "ressources"), eraserModule("repertoire-index")])],
  }),
  "/bac-a-sable": () => menuPage("Bac à sable", "flask-conical", "Un terrain d’essai hors campagne : préparer une carte, un magasin ou des PNJ avant de les amener à la table.", [
    ["/bac-a-sable/tabletop", "Tabletop", "Une table de jeu libre pour essayer cartes et jetons."],
    ["/bac-a-sable/magasin", "Magasin", "Générer et régler un magasin sans campagne."],
    ["/bac-a-sable/pnjs", "PNJs", "Les PNJ de la bibliothèque, hors campagne."],
  ], "bac-a-sable"),
}

/** Les pages qu'on redessine en blocs (les autres gardent leur contenu d'origine en un module). */
export const redrawnPaths = Object.keys(blueprints)

/**
 * Les pages d'Eraser dessinées par le moteur des pages sans rien enregistrer : tant qu'aucune
 * page du créateur ne les remplace, elles se rendent depuis leur plan de blocs — leurs vues,
 * leurs cartes et leurs formes sont celles réglées dans leur index. « Modifier la page » les
 * reprend dans l'atelier (une page de remplacement, en brouillon, du même plan).
 */
export const enginePages = ["/", "/regles/classes", "/regles/vocabulaire"]

/** Le modèle d'adresse (« /regles/classes ») d'une adresse demandée, parmi les pages dessinées par le moteur. */
export function enginePageOf(pathname: string) {
  return enginePages.find((path) => matchesReplacement(path, pathname)) ?? null
}

/** L'identifiant de la page virtuelle d'une page d'Eraser : « eraser:/regles/classes ». */
export const VIRTUAL_PAGE_PREFIX = "eraser:"
export const isVirtualPageId = (id: string) => id.startsWith(VIRTUAL_PAGE_PREFIX)
export const virtualPagePath = (id: string) => isVirtualPageId(id) ? id.slice(VIRTUAL_PAGE_PREFIX.length) : null

/**
 * Le plan d'une page avec des identifiants stables (s1, b1, b2…, dans l'ordre de lecture) :
 * la page virtuelle et la route qui lit ses blocs le rebâtissent chacune de leur côté et
 * doivent se retrouver sur les mêmes identifiants.
 */
export function stableBlueprint(path: string): PageContent | null {
  const known = blueprints[path]
  if (!known) return null
  const content = known()
  let blocks = 0
  return {
    ...content,
    sections: content.sections.map((section, at) => ({
      ...section,
      id: `s${at + 1}`,
      cols: section.cols.map((column) => column.map((block) => { blocks += 1; return { ...block, id: `b${blocks}` } })),
    })),
  }
}

/** La page virtuelle (jamais enregistrée) qui dessine une page d'Eraser depuis son plan ; `null` hors des pages dessinées par le moteur. */
export function virtualEraserPage(path: string): CustomPage | null {
  if (!enginePages.includes(path)) return null
  const content = stableBlueprint(path)
  if (!content) return null
  const author = { uid: "", name: "Eraser" }
  const stamp = "2000-01-01T00:00:00.000Z"
  return {
    ...content,
    id: `${VIRTUAL_PAGE_PREFIX}${path}`,
    slug: blueprintSlug(path),
    place: "hors-menu",
    campaignId: "",
    vis: blueprintVisibility(path),
    status: "publiee",
    replaces: path,
    replaceMode: "replace",
    createdAt: stamp, createdBy: author, updatedAt: stamp, updatedBy: author,
    published: content, publishedAt: stamp, publishedBy: author,
    trashedAt: "", trashedBy: null,
    live: {},
  }
}

/**
 * Le contenu de départ de la page qui remplace `path` : redessinée en blocs si on sait le
 * faire, sinon tout le contenu d'origine dans un module, sans en-tête (la page a le sien).
 */
export function eraserPageBlueprint(path: string): PageContent {
  const known = blueprints[path]
  if (known) return known()
  return { title: replacementLabel(path), icon: "", emoji: "", description: "", hideHeader: true, sections: [section("1", [eraserModule("origine")])] }
}

/** L'adresse propre (hors menu) de la page qui remplace `path` : « regles-classes », « accueil »… */
export function blueprintSlug(path: string) {
  return slugify(path.replace(/\[[^\]]+\]/g, "une").replace(/\//g, " ").trim()) || "accueil"
}

/**
 * Qui voit la page de remplacement (aussi à son adresse propre) : comme la page d'Eraser —
 * Index et Bac à sable aux MJ et admins, Administration aux admins.
 */
export function blueprintVisibility(path: string): PageVisibility {
  if (path === "/administration" || path.startsWith("/administration/")) return "admin"
  if (path === "/ressources" || path.startsWith("/ressources/") || path === "/bac-a-sable" || path.startsWith("/bac-a-sable/") || path === "/creation-de-classe") return "mj"
  return "tous"
}

/** Les pages d'Eraser qu'on peut modifier, avec leur groupe (l'Index des pages les liste). */
export const eraserPages = replaceableRoutes.map((route) => ({ ...route, redrawn: route.path in blueprints }))

/** Une page d'Eraser dans l'Index des pages : son état, et la page du créateur qui la remplace ou la complète. */
export type EraserPageEntry = {
  path: string
  label: string
  group: string
  redrawn: boolean
  page?: { id: string; title: string; status: CustomPage["status"]; mode: ReplaceMode; unpublished: boolean }
}

/** Les pages d'Eraser qu'un rôle peut modifier (Administration : les admins), avec leur page de remplacement (même en brouillon). */
export function eraserPageEntries(pages: CustomPage[], role: PageRole): EraserPageEntry[] {
  const replacing = new Map(pages.filter((page) => !page.trashedAt && page.replaces).map((page) => [page.replaces!, page]))
  return eraserPages.filter((route) => role === "admin" || blueprintVisibility(route.path) !== "admin").map((route) => {
    const page = replacing.get(route.path)
    return { path: route.path, label: route.label, group: route.group, redrawn: route.redrawn, ...(page ? { page: { id: page.id, title: page.title, status: page.status, mode: page.replaceMode ?? "after", unpublished: page.status === "publiee" && hasUnpublishedChanges(page) } } : {}) }
  })
}
