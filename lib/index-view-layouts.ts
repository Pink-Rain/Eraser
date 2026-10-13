/**
 * La présentation d'un onglet-fenêtre : ses lignes en tableau, en cartes, en liste compacte
 * ou repliable, rangées en sections, en kanban, en maître-détail, en calendrier ou en
 * tableau de bord. Elle s'enregistre avec la vue (classeur « Eraser · Réglages des index »),
 * dans « Modifier » de l'index ; le créateur de pages ne fait que l'afficher et la régler.
 * Règles pures : la page, le serveur et les tests s'en servent.
 *
 * L'onglet stat (« stats ») est une vue comme les autres : ses statistiques tiennent dans
 * la même case « Présentation (JSON) », sans nouvelle colonne ni nouvelle feuille.
 */
import { cellNumber, cellParts, cleanStats, type StatDefinition } from "@/lib/index-stats"

export { cellNumber }

export type ViewLayoutKind = "table" | "cards" | "list" | "kanban" | "master-detail" | "calendar" | "dashboard" | "gallery" | "timeline" | "tree" | "codex" | "stats"

/**
 * Les tuiles d'un tableau de bord : un chiffre (nombre de lignes, somme, moyenne… d'une colonne),
 * une répartition, une jauge (une formule ou une ligne précise contre une cible), une statistique
 * de « Modifier › Stats », une autre vue de l'onglet (limitée à N lignes), une ligne dessinée avec
 * une carte ou un formulaire, un texte à formules incrustées, ou une tuile par ligne d'un onglet
 * lié (une colonne liée, des formules sur les lignes qui lui sont liées). Tout se mélange.
 */
export type DashboardTileKind = "count" | "sum" | "average" | "min" | "max" | "filled" | "breakdown" | "gauge" | "stat" | "view" | "card" | "text" | "linked"
export type TileFormula = { op: GroupFormulaOp; column?: string; label?: string; unit?: string }
export type DashboardTile = {
  kind: DashboardTileKind
  column?: string
  label?: string
  /** Couleur de la tuile (#hex). */
  color?: string
  /** Tuile large (deux places), ou sur toute la rangée. */
  wide?: boolean
  full?: boolean
  /** Une icône (nom d'icône ou émoji) dans la tuile. */
  icon?: string
  /** Une unité écrite après le nombre (« PO », « % »). */
  unit?: string
  /** La taille du nombre. */
  size?: "sm" | "md" | "lg"
  /** Une ligne sous le nombre (« sur l'ensemble des lieux »). */
  note?: string
  /** La section de la tuile (« Groupe », « Monde ») : les tuiles d'une même section vont ensemble, repliables si la vue le veut. */
  section?: string
  /** Jauge : la formule (compte d'office) sur la colonne, ou la case d'une ligne précise (`row` : son nom) ; la cible (nombre, ou colonne de la ligne) ; anneau, barre ou charges. */
  measure?: "count" | "sum" | "average" | "min" | "max"
  row?: string
  target?: number
  maxColumn?: string
  style?: "ring" | "bar" | "charges"
  /** Stat : l'identifiant d'une statistique de l'index. */
  stat?: string
  /** Vue : une autre vue de l'onglet (ses réglages de « Modifier › Vues »), tant de lignes au plus. */
  view?: PresentationKind
  limit?: number
  /** Carte : la ligne (`row`) dessinée avec une carte (identifiant, ou « * ») ou un formulaire en lecture. */
  card?: string
  form?: string
  /** Texte : un texte libre où « {nombre} », « {somme Or} », « {moyenne Niveau} », « {Or de Aldric} »… s'incrustent et se recalculent. */
  text?: string
  /** Lié : une tuile par valeur de la colonne liée, chacune avec ses formules sur les lignes qui la citent. */
  formulas?: TileFormula[]
}

/** Une colonne du kanban réglée à la main : son libellé, sa couleur, son icône, cachée, une limite. */
export type KanbanLane = { value: string; label?: string; color?: string; icon?: string; hidden?: boolean; limit?: number }

/**
 * L'apparence des éléments d'une vue (Modifier › Liste, Kanban…) : comme l'atelier des
 * cartes, mais pour la vue elle-même. Tout est facultatif : absent, la vue garde son
 * apparence d'avant.
 */
export type ViewLook = {
  /** Espacement des éléments. */
  density?: "compact" | "normal" | "airy"
  /** Éléments encadrés un par un, ou lignes séparées d'un trait. */
  surface?: "boxed" | "plain" | "zebra"
  /** Comment la couleur (« Couleur des lignes selon ») marque un élément. */
  accent?: "border" | "tint" | "dot" | "title" | "none"
  /** Le nom : police et taille. */
  titleFont?: "display" | "sans"
  titleSize?: "sm" | "md" | "lg"
  /** Les colonnes montrées sous le nom. */
  fieldStyle?: "inline" | "labels" | "pills" | "stacked"
  /** Les colonnes montrées sous le nom sans leur nom (« Charges : ») devant la valeur. */
  hideFieldLabels?: boolean
  /** L'image à côté du nom : sa forme ; sa largeur et sa hauteur en pixels (liées ou non ; `imageSize` : ancien réglage). */
  imageShape?: "square" | "rounded" | "circle"
  imageSize?: "sm" | "md" | "lg"
  imageWidth?: number
  imageHeight?: number
  imageLinked?: boolean
  /** L'image ou l'icône à côté du nom sans fond ni cadre (image détourée). */
  imageBare?: boolean
  /** Kanban : colonnes sobres, teintées, ou à en-tête coloré. */
  laneStyle?: "plain" | "tinted" | "header"
  /** Calendrier : grille du mois ou agenda (liste par date) ; style des entrées. */
  calendarMode?: "month" | "agenda"
  entryStyle?: "pill" | "dot" | "bar"
  /** Tableau de bord : tuiles sobres, à liseré de couleur, ou teintées. */
  tileStyle?: "plain" | "accent" | "tinted"
  /** Galerie : le nom posé sur l'image ou dessous. */
  caption?: "overlay" | "below"
  /** Codex : image à côté ou en bannière ; lettrine au premier paragraphe. */
  codexImage?: "side" | "banner"
  dropCap?: boolean
  /** Maître-détail : largeur de la liste. */
  masterWidth?: "narrow" | "normal" | "wide"
  /** Sections : un trait discret (d'office), un grand titre centré (les familles de classes), ou la lettre en marge (le glossaire). */
  sectionStyle?: "bar" | "heading" | "letter"
  /** Une couleur d'accent propre à la vue (#hex) : titres de sections, pastilles, ligne du temps, tuiles sans couleur… */
  color?: string
  /** Une icône (nom d'icône ou émoji) devant les titres de sections (et les colonnes du kanban sans icône propre). */
  sectionIcon?: string
  /** Les coins des éléments encadrés, et une ombre. */
  radius?: "sm" | "md" | "lg"
  shadow?: boolean
  /** Le nom en capitales espacées. */
  titleCaps?: boolean
  /** Les libellés des colonnes montrées : discrets, ou à la couleur d'accent. */
  fieldColor?: "muted" | "accent"
  /** Liste : l'image change de côté une ligne sur deux. */
  zigzag?: boolean
}

export type ViewLayout = {
  kind: ViewLayoutKind
  /** Liste, cartes, maître-détail : les lignes rangées en sections, une par valeur de cette colonne. */
  groupBy?: string
  /** Les sections (ou les lignes d'une liste) se replient ; `collapsed` : repliées à l'ouverture. */
  collapsible?: boolean
  collapsed?: boolean
  /** Liste : une ligne par élément, sans retour à la ligne. */
  compact?: boolean
  /** Les colonnes montrées sous le nom (liste, kanban, maître-détail) : quatre au plus. */
  fields?: string[]
  /** Kanban : la colonne dont chaque valeur fait une colonne du tableau ; glisser une carte change la case. */
  kanbanColumn?: string
  /** Calendrier : la colonne de la date et le calendrier (Index des calendriers, ou « Calendrier réel »). */
  dateColumn?: string
  calendar?: string
  /** Tableau de bord : ses tuiles. */
  tiles?: DashboardTile[]
  /** Onglet stat : ses statistiques (phrase à trous), 24 au plus. */
  stats?: StatDefinition[]
  /** Toutes : l'ordre des lignes (une colonne, croissant ou décroissant). */
  sortBy?: string
  sortDesc?: boolean
  /** Une colonne liste dont la couleur du choix marque chaque ligne (liseré). */
  colorBy?: string
  /** Une colonne d'image (portrait, icône) montrée à côté du nom. */
  imageColumn?: string
  /** Sections et kanban : sans la section (ou colonne) « Sans valeur ». */
  hideEmpty?: boolean
  /** Sections : sans le nombre de lignes. */
  hideCounts?: boolean
  /** Liste : sur une à cinq colonnes (sur un écran assez large). */
  listColumns?: 1 | 2 | 3 | 4 | 5
  /** Kanban : largeur des colonnes. */
  laneWidth?: "narrow" | "normal" | "wide"
  /** Maître-détail : les colonnes du détail (toutes si vide), douze au plus. */
  detailFields?: string[]
  /** Calendrier : la liste des lignes sans date sous le calendrier. */
  showUndated?: boolean
  /** Tableau de bord : nombre de tuiles par rangée. */
  tileColumns?: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * Liste, kanban, maître-détail, chronologie : chaque élément dessiné avec une carte de
   * « Modifier › Cartes » (son identifiant, ou « * » pour la carte par défaut de l'onglet) ;
   * absent : le nom et les colonnes choisies, comme avant.
   */
  itemCard?: string
  /** Arborescence : la colonne qui nomme la ligne parente (« Pays » d'une ville, « Région »…). */
  parentColumn?: string
  /** Galerie : forme et taille des images, légende au survol seulement. */
  galleryShape?: "square" | "portrait" | "landscape"
  gallerySize?: "sm" | "md" | "lg"
  captionOnHover?: boolean
  /** Chronologie : éléments des deux côtés de la ligne du temps, tous à droite, ou un côté par groupe (« groups », avec `groupBy`). */
  timelineSide?: "alternate" | "right" | "groups"
  /** Codex : le sommaire à côté des fiches. */
  showToc?: boolean
  /** Une colonne icône (ou émoji) montrée devant le nom ; `itemIcon` : une icône fixe quand aucune colonne ne la donne. */
  iconColumn?: string
  itemIcon?: string
  /** Une colonne montrée en pastille à droite du nom (liste, kanban, arborescence) ou en ruban sur l'image (galerie). */
  badgeColumn?: string
  /** Liste : les lignes numérotées ; rangées par première lettre (sans autre section). */
  numbered?: boolean
  alphabet?: boolean
  /** Un menu relié aux sections (lettres ou noms des sections) : en haut ou sur le côté (un clic y descend), ou en onglets (une section à la fois). */
  menu?: "top" | "side" | "tabs"
  /**
   * Élément : chaque ligne dessinée avec un formulaire de l'onglet, en lecture (« principal » :
   * le formulaire étoilé). Prend le pas sur `itemCard`.
   */
  itemForm?: string
  /** Au clic sur un élément : ouvrir la fiche (d'office), ouvrir la page de la ligne, afficher à côté, afficher dessous, rien. */
  click?: ViewClick
  /** Le panneau de détail (à côté, dessous, et le maître-détail) : les colonnes, un formulaire en lecture, ou une carte ; sa largeur ; précédent / suivant. */
  detail?: ViewDetail
  /** Une formule dans l'en-tête de chaque groupe (section, colonne du kanban) : compte, somme, moyenne, min, max d'une colonne, contre une cible. */
  groupFormula?: GroupFormula
  /** Une jauge sous chaque élément : une colonne nombre en barre ou en charges, sur un maximum (nombre ou colonne). */
  gauge?: RowGaugeSetting
  /** Kanban : ses colonnes réglées une à une ; repliables d'un clic sur leur en-tête. */
  lanes?: KanbanLane[]
  laneCollapse?: boolean
  /** Maître-détail : la liste à gauche ou à droite ; le détail sur une, deux ou trois colonnes ; son image. */
  masterSide?: "left" | "right"
  detailColumns?: 1 | 2 | 3
  detailImage?: "side" | "banner" | "none"
  /** Calendrier : sans la saison ; l'en-tête du mois à la couleur de la saison ; tant d'entrées au plus par jour (0 : toutes). */
  hideSeasons?: boolean
  monthStyle?: "plain" | "season"
  maxPerDay?: number
  /**
   * Calendrier : l'échelle montrée (mois d'office ; « agenda » reprend l'ancien `look.calendarMode`),
   * la forme de chaque échelle, la barre des échelles au-dessus, et le clic sur un mois ou un jour
   * qui n'ouvre pas son échelle (`calendarStay`). Les échelles s'emboîtent : un mois de l'année
   * ouvre le mois, un jour du mois ouvre le jour.
   */
  calendarScale?: CalendarScale
  calendarForms?: CalendarForms
  calendarSwitcher?: boolean
  calendarStay?: boolean
  /** Calendrier : une bannière au-dessus (l'image du mois ou de la saison lue dans l'Index des calendriers, ou une image fixe), sa hauteur en pixels. */
  calendarBanner?: "month" | "season" | "fixed"
  bannerImage?: string
  bannerHeight?: number
  /** Calendrier (mois en lignes, semaine en lignes) : les jours sans ligne ne s'affichent pas. */
  hideEmptyDays?: boolean
  /** Galerie : la largeur et la hauteur des vignettes (rem, liées ou non ; `galleryRatio` : ancien réglage), l'arrondi (px), le recadrage, sans zoom au survol. */
  galleryWidthRem?: number
  galleryHeightRem?: number
  galleryLinked?: boolean
  galleryRatio?: number
  galleryRadiusPx?: number
  galleryFit?: "cover" | "contain"
  galleryStill?: boolean
  /** Chronologie : des points, des icônes en médaillon, des chapitres, des barres de durée (`endColumn`) ou des fils (`laneColumn`) ; un jalon par an, décennie, siècle ou millénaire ; la date écrite. */
  timelineStyle?: "dots" | "icons" | "chapters" | "bars" | "lanes"
  milestoneEvery?: 1 | 10 | 100 | 1000
  milestoneIcon?: string
  dateStyle?: "label" | "badge" | "hidden"
  /** Arborescence : son dessin (lignes, retrait, cartes emboîtées, organigramme, carte mentale) ; les icônes des branches et des feuilles ; une couleur par profondeur ; les racines en grandes sections ; `numbered` : 1., 1.1, 1.1.1. */
  treeStyle?: "lines" | "indent" | "boxed" | "org" | "mindmap"
  branchIcon?: string
  leafIcon?: string
  depthColors?: boolean
  rootsAsSections?: boolean
  /** Codex : son style (livre, parchemin, nu, journal de bord daté, croquis) ; le texte sur deux colonnes ; les fiches numérotées ; le sommaire à côté ou au-dessus. */
  codexStyle?: "book" | "scroll" | "plain" | "board" | "sketch"
  proseColumns?: 1 | 2
  chapterNumbers?: boolean
  tocPosition?: "side" | "top"
  /** Codex : deux fiches face à face, feuilletées ; des colonnes nombre en tuiles sous le titre ; des colonnes de relation en renvois (« voir aussi », un clic ouvre la fiche liée) ; recto et verso (deux cartes, retournées au clic). */
  codexPages?: boolean
  codexTiles?: string[]
  codexLinks?: string[]
  codexRecto?: string
  codexVerso?: string
  /** Galerie : mur sans marge, cabinet (fond sombre, cadre, plaque), planche (vignettes larges + texte), carrousel (une image à la fois) ; la largeur de chaque vignette selon une colonne nombre. */
  galleryStyle?: "plain" | "wall" | "cabinet" | "strip" | "carousel"
  gallerySizeColumn?: string
  /** Chronologie : l'axe horizontal (frise) ; les groupes de part et d'autre (« groups ») ; les périodes (les groupes) en bandes ou en échelle (une bande en haut, un clic déplie la période) ; la colonne de fin (durées en barres) ; un fil par valeur d'une colonne (« lanes »). */
  timelineAxis?: "vertical" | "horizontal"
  timelinePeriods?: "bands" | "scale"
  endColumn?: string
  laneColumn?: string
  /** Arborescence : une colonne grisant la ligne quand elle est vide ou « non » (lignée) ; les dates de début (`dateColumn`) et de fin (`endColumn`) sous le nom. */
  dimColumn?: string
  /** L'apparence des éléments (Modifier › la vue › Apparence). */
  look?: ViewLook
}

export type CalendarScale = "year" | "month" | "week" | "day" | "agenda" | "seasons"
export const calendarScales: Array<{ value: CalendarScale; label: string; hint: string }> = [
  { value: "year", label: "Année", hint: "Douze mini-grilles, une bande par saison, ou un mois par ligne." },
  { value: "month", label: "Mois", hint: "La grille du mois, ou un jour par ligne." },
  { value: "week", label: "Semaine", hint: "Sept colonnes, une ligne par jour, ou un tableau." },
  { value: "day", label: "Jour", hint: "Une page par jour : ses lignes en fiches ou en paragraphes." },
  { value: "agenda", label: "Agenda", hint: "Toutes les dates à la suite : liste, fil, ou groupées par semaine." },
  { value: "seasons", label: "Saisons", hint: "L’année en bande, ou un panneau par saison." },
]
export type CalendarForms = { year?: "grids" | "band" | "lines"; month?: "grid" | "lines"; week?: "columns" | "lines" | "table"; day?: "sheets" | "paragraphs"; agenda?: "list" | "thread" | "weeks"; seasons?: "band" | "panels" }
export const calendarFormChoices: { [K in CalendarScale]: ReadonlyArray<{ value: NonNullable<CalendarForms[K]>; label: string }> } = {
  year: [{ value: "grids", label: "Douze mini-grilles" }, { value: "band", label: "Bande par saison" }, { value: "lines", label: "Un mois par ligne" }],
  month: [{ value: "grid", label: "Grille" }, { value: "lines", label: "Un jour par ligne" }],
  week: [{ value: "columns", label: "Sept colonnes" }, { value: "lines", label: "Une ligne par jour" }, { value: "table", label: "Tableau" }],
  day: [{ value: "sheets", label: "Fiches" }, { value: "paragraphs", label: "Paragraphes" }],
  agenda: [{ value: "list", label: "Par date" }, { value: "thread", label: "Fil" }, { value: "weeks", label: "Par semaine" }],
  seasons: [{ value: "band", label: "Bande" }, { value: "panels", label: "Un panneau par saison" }],
}
/** L'échelle d'un calendrier : celle réglée, sinon l'ancien « Agenda », sinon le mois. */
export const calendarScaleOf = (layout: Pick<ViewLayout, "calendarScale" | "look">): CalendarScale => layout.calendarScale ?? (layout.look?.calendarMode === "agenda" ? "agenda" : "month")

export type ViewClick = "sheet" | "page" | "side" | "below" | "none"
export const viewClicks: Array<{ value: ViewClick; label: string; hint: string }> = [
  { value: "sheet", label: "Ouvrir la fiche", hint: "Le formulaire étoilé de la ligne (d’office)." },
  { value: "page", label: "Ouvrir la page", hint: "La page de la ligne, si l’index en a une." },
  { value: "side", label: "Afficher à côté", hint: "La ligne choisie dans un panneau à côté : la vue devient un maître-détail." },
  { value: "below", label: "Afficher dessous", hint: "La ligne choisie se déplie sous l’élément (ou sous la vue)." },
  { value: "none", label: "Rien", hint: "Les éléments ne réagissent pas au clic." },
]
export type ViewDetail = { kind?: "fields" | "form" | "card" | "children"; form?: string; card?: string; width?: "narrow" | "normal" | "wide"; nav?: boolean }
export type GroupFormulaOp = "count" | "sum" | "avg" | "min" | "max"
export const groupFormulaOps: Array<{ value: GroupFormulaOp; label: string }> = [
  { value: "count", label: "Nombre de lignes" }, { value: "sum", label: "Somme" }, { value: "avg", label: "Moyenne" }, { value: "min", label: "Plus petite valeur" }, { value: "max", label: "Plus grande valeur" },
]
export type GroupFormula = { op: GroupFormulaOp; column?: string; target?: number; label?: string; style?: "text" | "bar" }
export type RowGaugeSetting = { column: string; style?: "bar" | "charges"; max?: number; maxColumn?: string; label?: string }

/** Les icônes et couleurs proposées dans les éditeurs de vues (les mêmes que les cartes). */
export const viewPalette = ["#927640", "#682522", "#b3261e", "#c2410c", "#b7791f", "#4d7c0f", "#315b55", "#397f88", "#285f8f", "#1e3a8a", "#6b4c9a", "#9d174d", "#78716c"]
/** Les couleurs d'une arborescence « une couleur par profondeur ». */
export const depthPalette = ["#927640", "#397f88", "#6b4c9a", "#4d7c0f", "#c2410c", "#285f8f"]

/** La valeur d'`itemCard` qui veut dire « la carte par défaut de l'onglet ». */
export const DEFAULT_ITEM_CARD = "*"

/** Une case de Google Sheets en tient 50 000 : la présentation d'une vue reste bien en deçà. */
export const MAX_VIEW_LAYOUT_JSON = 40_000

export function viewLayoutTooLarge(layout: ViewLayout | undefined) {
  return Boolean(layout) && JSON.stringify(layout).length > MAX_VIEW_LAYOUT_JSON
}

export const viewLayoutKinds: Array<{ value: ViewLayoutKind; label: string; hint: string }> = [
  { value: "table", label: "Tableau", hint: "Les lignes et toutes leurs colonnes." },
  { value: "cards", label: "Cartes", hint: "Les cartes réglées dans « Modifier › Cartes »." },
  { value: "list", label: "Liste", hint: "Compacte ou repliable, rangée en sections si tu veux." },
  { value: "kanban", label: "Kanban", hint: "Une colonne par valeur ; glisser une carte change sa case." },
  { value: "master-detail", label: "Maître-détail", hint: "La liste d’un côté, la ligne choisie de l’autre." },
  { value: "calendar", label: "Calendrier", hint: "Les lignes placées à leur date, dans un calendrier du monde." },
  { value: "dashboard", label: "Tableau de bord", hint: "Des chiffres et des répartitions." },
  { value: "gallery", label: "Galerie", hint: "Les images en mosaïque, le nom en légende : portraits, cartes, illustrations." },
  { value: "timeline", label: "Chronologie", hint: "Les lignes le long d’une ligne du temps, rangées par date ou par année." },
  { value: "tree", label: "Arborescence", hint: "Les lignes rangées sous leur parent : Continent › Pays › Ville, Panthéon › Dieu…" },
  { value: "codex", label: "Codex", hint: "Les fiches l’une après l’autre, à lire comme un livre, avec un sommaire." },
]

export const dashboardTileKinds: Array<{ value: DashboardTileKind; label: string; needsColumn: boolean; group: "number" | "other" }> = [
  { value: "count", label: "Nombre de lignes", needsColumn: false, group: "number" },
  { value: "sum", label: "Somme d’une colonne", needsColumn: true, group: "number" },
  { value: "average", label: "Moyenne d’une colonne", needsColumn: true, group: "number" },
  { value: "min", label: "Plus petite valeur", needsColumn: true, group: "number" },
  { value: "max", label: "Plus grande valeur", needsColumn: true, group: "number" },
  { value: "filled", label: "Lignes remplies dans une colonne", needsColumn: true, group: "number" },
  { value: "breakdown", label: "Répartition par valeur", needsColumn: true, group: "number" },
  { value: "gauge", label: "Jauge ou charges (contre une cible)", needsColumn: false, group: "other" },
  { value: "stat", label: "Statistique de l’index", needsColumn: false, group: "other" },
  { value: "view", label: "Une autre vue de l’onglet", needsColumn: false, group: "other" },
  { value: "card", label: "Une ligne (carte ou formulaire)", needsColumn: false, group: "other" },
  { value: "text", label: "Texte à formules", needsColumn: false, group: "other" },
  { value: "linked", label: "Une tuile par ligne d’un onglet lié", needsColumn: true, group: "other" },
]

// « stats » n'est pas proposée parmi les présentations d'un onglet-fenêtre : c'est l'onglet stat.
const kinds = new Set<string>([...viewLayoutKinds.map((kind) => kind.value), "stats"])
const tileKinds = new Set<string>(dashboardTileKinds.map((kind) => kind.value))
const text = (value: unknown, max = 120) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""

const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => allowed.includes(value as T) ? value as T : undefined
const bounded = (value: unknown, min: number, max: number, step = 1) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value / step) * step)) : undefined

const lookChoices: { [K in keyof ViewLook]-?: readonly unknown[] } = {
  density: ["compact", "normal", "airy"],
  surface: ["boxed", "plain", "zebra"],
  accent: ["border", "tint", "dot", "title", "none"],
  titleFont: ["display", "sans"],
  titleSize: ["sm", "md", "lg"],
  fieldStyle: ["inline", "labels", "pills", "stacked"],
  imageShape: ["square", "rounded", "circle"],
  imageSize: ["sm", "md", "lg"],
  laneStyle: ["plain", "tinted", "header"],
  calendarMode: ["month", "agenda"],
  entryStyle: ["pill", "dot", "bar"],
  tileStyle: ["plain", "accent", "tinted"],
  caption: ["overlay", "below"],
  codexImage: ["side", "banner"],
  dropCap: [true],
  masterWidth: ["narrow", "normal", "wide"],
  sectionStyle: ["bar", "heading", "letter"],
  color: [],
  sectionIcon: [],
  imageWidth: [],
  imageHeight: [],
  imageLinked: [true],
  imageBare: [true],
  zigzag: [true],
  radius: ["sm", "md", "lg"],
  shadow: [true],
  titleCaps: [true],
  fieldColor: ["muted", "accent"],
  hideFieldLabels: [true],
}

/** L'apparence propre : seulement les choix connus ; `undefined` si rien n'est réglé. */
export function cleanViewLook(value: unknown): ViewLook | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const look: Record<string, unknown> = {}
  for (const [key, allowed] of Object.entries(lookChoices)) if (allowed.includes(raw[key])) look[key] = raw[key]
  if (isHexColor(raw.color)) look.color = raw.color
  if (text(raw.sectionIcon, 40)) look.sectionIcon = text(raw.sectionIcon, 40)
  const imageWidth = bounded(raw.imageWidth, 12, 240)
  if (imageWidth) look.imageWidth = imageWidth
  const imageHeight = bounded(raw.imageHeight, 12, 240)
  if (imageHeight) look.imageHeight = imageHeight
  return Object.keys(look).length ? look as ViewLook : undefined
}


/** Une colonne du kanban réglée à la main, nettoyée ; sans valeur : rien. */
function cleanLane(input: unknown): KanbanLane | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const value = text(raw.value, 80)
  if (!value) return null
  const lane: KanbanLane = { value }
  if (text(raw.label, 60)) lane.label = text(raw.label, 60)
  if (isHexColor(raw.color)) lane.color = raw.color
  if (text(raw.icon, 40)) lane.icon = text(raw.icon, 40)
  if (raw.hidden === true) lane.hidden = true
  const limit = bounded(raw.limit, 1, 999)
  if (limit) lane.limit = limit
  return Object.keys(lane).length > 1 ? lane : null
}

/** Une présentation propre (champs connus, longueurs bornées) ; `undefined` pour le tableau simple. */
export function cleanViewLayout(value: unknown): ViewLayout | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  if (!kinds.has(String(raw.kind))) return undefined
  if (raw.kind === "stats") {
    const stats = cleanStats(raw.stats)
    return stats.length ? { kind: "stats", stats } : { kind: "stats" }
  }
  const layout: ViewLayout = { kind: raw.kind as ViewLayoutKind }
  if (text(raw.groupBy)) layout.groupBy = text(raw.groupBy)
  if (raw.collapsible === true) layout.collapsible = true
  if (raw.collapsed === true) layout.collapsed = true
  if (raw.compact === true) layout.compact = true
  const fields = Array.isArray(raw.fields) ? raw.fields.map((field) => text(field)).filter(Boolean).slice(0, 8) : []
  if (fields.length) layout.fields = fields
  if (text(raw.kanbanColumn)) layout.kanbanColumn = text(raw.kanbanColumn)
  if (text(raw.dateColumn)) layout.dateColumn = text(raw.dateColumn)
  if (text(raw.calendar)) layout.calendar = text(raw.calendar)
  const tiles = Array.isArray(raw.tiles) ? raw.tiles.flatMap((input): DashboardTile[] => {
    if (!input || typeof input !== "object") return []
    const entry = input as Record<string, unknown>
    if (!tileKinds.has(String(entry.kind))) return []
    const tile: DashboardTile = { kind: entry.kind as DashboardTileKind }
    if (text(entry.column)) tile.column = text(entry.column)
    if (text(entry.label, 60)) tile.label = text(entry.label, 60)
    if (isHexColor(entry.color)) tile.color = entry.color
    if (entry.wide === true) tile.wide = true
    if (text(entry.icon, 40)) tile.icon = text(entry.icon, 40)
    if (text(entry.unit, 12)) tile.unit = text(entry.unit, 12)
    const size = oneOf(entry.size, ["sm", "md", "lg"] as const)
    if (size) tile.size = size
    if (text(entry.note, 80)) tile.note = text(entry.note, 80)
    if (entry.full === true) tile.full = true
    if (text(entry.section, 60)) tile.section = text(entry.section, 60)
    const measure = oneOf(entry.measure, ["count", "sum", "average", "min", "max"] as const)
    if (measure && measure !== "count") tile.measure = measure
    if (text(entry.row, 120)) tile.row = text(entry.row, 120)
    const target = typeof entry.target === "number" && Number.isFinite(entry.target) ? Math.round(entry.target * 100) / 100 : undefined
    if (target !== undefined && target > 0) tile.target = target
    if (text(entry.maxColumn)) tile.maxColumn = text(entry.maxColumn)
    const style = oneOf(entry.style, ["ring", "bar", "charges"] as const)
    if (style && style !== "ring") tile.style = style
    if (text(entry.stat, 80)) tile.stat = text(entry.stat, 80)
    const view = oneOf(entry.view, ["list", "kanban", "master-detail", "calendar", "gallery", "timeline", "tree", "codex"] as const)
    if (view) tile.view = view
    const limit = bounded(entry.limit, 1, 100)
    if (limit) tile.limit = limit
    if (text(entry.card, 80)) tile.card = text(entry.card, 80)
    if (text(entry.form, 40)) tile.form = text(entry.form, 40)
    if (typeof entry.text === "string" && entry.text.trim()) tile.text = entry.text.trim().slice(0, 2000)
    const formulas = Array.isArray(entry.formulas) ? entry.formulas.flatMap((input): TileFormula[] => {
      if (!input || typeof input !== "object") return []
      const raw = input as Record<string, unknown>
      const op = oneOf(raw.op, ["count", "sum", "avg", "min", "max"] as const)
      if (!op) return []
      const formula: TileFormula = { op }
      if (text(raw.column)) formula.column = text(raw.column)
      if (text(raw.label, 40)) formula.label = text(raw.label, 40)
      if (text(raw.unit, 12)) formula.unit = text(raw.unit, 12)
      return [formula]
    }).slice(0, 4) : []
    if (formulas.length) tile.formulas = formulas
    return [tile]
  }).slice(0, 24) : []
  if (tiles.length) layout.tiles = tiles
  if (text(raw.sortBy)) layout.sortBy = text(raw.sortBy)
  if (raw.sortDesc === true) layout.sortDesc = true
  if (text(raw.colorBy)) layout.colorBy = text(raw.colorBy)
  if (text(raw.imageColumn)) layout.imageColumn = text(raw.imageColumn)
  if (raw.hideEmpty === true) layout.hideEmpty = true
  if (raw.hideCounts === true) layout.hideCounts = true
  if (raw.listColumns === 2 || raw.listColumns === 3 || raw.listColumns === 4 || raw.listColumns === 5) layout.listColumns = raw.listColumns
  if (raw.laneWidth === "narrow" || raw.laneWidth === "wide") layout.laneWidth = raw.laneWidth
  const detailFields = Array.isArray(raw.detailFields) ? raw.detailFields.map((field) => text(field)).filter(Boolean).slice(0, 12) : []
  if (detailFields.length) layout.detailFields = detailFields
  if (raw.showUndated === true) layout.showUndated = true
  if (raw.tileColumns === 1 || raw.tileColumns === 2 || raw.tileColumns === 4 || raw.tileColumns === 5 || raw.tileColumns === 6) layout.tileColumns = raw.tileColumns
  if (text(raw.itemCard, 80)) layout.itemCard = text(raw.itemCard, 80)
  if (text(raw.parentColumn)) layout.parentColumn = text(raw.parentColumn)
  if (raw.galleryShape === "square" || raw.galleryShape === "portrait" || raw.galleryShape === "landscape") layout.galleryShape = raw.galleryShape
  if (raw.gallerySize === "sm" || raw.gallerySize === "md" || raw.gallerySize === "lg") layout.gallerySize = raw.gallerySize
  if (raw.captionOnHover === true) layout.captionOnHover = true
  if (raw.timelineSide === "alternate" || raw.timelineSide === "right" || raw.timelineSide === "groups") layout.timelineSide = raw.timelineSide
  if (raw.showToc === true) layout.showToc = true
  // Les réglages propres à chaque vue (icônes, couleurs, formes libres).
  if (text(raw.iconColumn)) layout.iconColumn = text(raw.iconColumn)
  if (text(raw.itemIcon, 40)) layout.itemIcon = text(raw.itemIcon, 40)
  if (text(raw.badgeColumn)) layout.badgeColumn = text(raw.badgeColumn)
  if (raw.numbered === true) layout.numbered = true
  if (raw.alphabet === true) layout.alphabet = true
  const menu = oneOf(raw.menu, ["top", "side", "tabs"] as const)
  if (menu) layout.menu = menu
  if (text(raw.itemForm, 40)) layout.itemForm = text(raw.itemForm, 40)
  const click = oneOf(raw.click, ["sheet", "page", "side", "below", "none"] as const)
  if (click && click !== "sheet") layout.click = click
  if (raw.detail && typeof raw.detail === "object") {
    const input = raw.detail as Record<string, unknown>
    const detail: ViewDetail = {}
    const kind = oneOf(input.kind, ["fields", "form", "card", "children"] as const)
    if (kind && kind !== "fields") detail.kind = kind
    if (text(input.form, 40)) detail.form = text(input.form, 40)
    if (text(input.card, 80)) detail.card = text(input.card, 80)
    const width = oneOf(input.width, ["narrow", "normal", "wide"] as const)
    if (width && width !== "normal") detail.width = width
    if (input.nav === true) detail.nav = true
    if (Object.keys(detail).length) layout.detail = detail
  }
  if (raw.groupFormula && typeof raw.groupFormula === "object") {
    const input = raw.groupFormula as Record<string, unknown>
    const op = oneOf(input.op, ["count", "sum", "avg", "min", "max"] as const)
    if (op) {
      const formula: GroupFormula = { op }
      if (text(input.column)) formula.column = text(input.column)
      const target = typeof input.target === "number" && Number.isFinite(input.target) ? Math.round(input.target * 100) / 100 : undefined
      if (target !== undefined && target > 0) formula.target = target
      if (text(input.label, 40)) formula.label = text(input.label, 40)
      if (input.style === "bar") formula.style = "bar"
      layout.groupFormula = formula
    }
  }
  if (raw.gauge && typeof raw.gauge === "object") {
    const input = raw.gauge as Record<string, unknown>
    if (text(input.column)) {
      const gauge: RowGaugeSetting = { column: text(input.column) }
      if (input.style === "charges") gauge.style = "charges"
      const max = typeof input.max === "number" && Number.isFinite(input.max) ? Math.round(input.max * 100) / 100 : undefined
      if (max !== undefined && max > 0) gauge.max = max
      if (text(input.maxColumn)) gauge.maxColumn = text(input.maxColumn)
      if (text(input.label, 40)) gauge.label = text(input.label, 40)
      layout.gauge = gauge
    }
  }
  const lanes = Array.isArray(raw.lanes) ? raw.lanes.map(cleanLane).filter((lane): lane is KanbanLane => Boolean(lane)).slice(0, 24) : []
  if (lanes.length) layout.lanes = lanes
  if (raw.laneCollapse === true) layout.laneCollapse = true
  if (raw.masterSide === "right") layout.masterSide = "right"
  if (raw.detailColumns === 1 || raw.detailColumns === 3) layout.detailColumns = raw.detailColumns
  const detailImage = oneOf(raw.detailImage, ["side", "banner", "none"] as const)
  if (detailImage) layout.detailImage = detailImage
  if (raw.hideSeasons === true) layout.hideSeasons = true
  if (raw.monthStyle === "season") layout.monthStyle = "season"
  const maxPerDay = bounded(raw.maxPerDay, 1, 12)
  if (maxPerDay) layout.maxPerDay = maxPerDay
  const calendarScale = oneOf(raw.calendarScale, ["year", "month", "week", "day", "agenda", "seasons"] as const)
  if (calendarScale) layout.calendarScale = calendarScale
  if (raw.calendarForms && typeof raw.calendarForms === "object") {
    const input = raw.calendarForms as Record<string, unknown>
    const forms: CalendarForms = {}
    for (const scale of Object.keys(calendarFormChoices) as CalendarScale[]) {
      const choice = calendarFormChoices[scale].find((option, index) => index > 0 && option.value === input[scale])
      if (choice) (forms as Record<string, string>)[scale] = choice.value
    }
    if (Object.keys(forms).length) layout.calendarForms = forms
  }
  if (raw.calendarSwitcher === true) layout.calendarSwitcher = true
  if (raw.calendarStay === true) layout.calendarStay = true
  const calendarBanner = oneOf(raw.calendarBanner, ["month", "season", "fixed"] as const)
  if (calendarBanner) layout.calendarBanner = calendarBanner
  if (text(raw.bannerImage, 400)) layout.bannerImage = text(raw.bannerImage, 400)
  const bannerHeight = bounded(raw.bannerHeight, 40, 400)
  if (bannerHeight) layout.bannerHeight = bannerHeight
  if (raw.hideEmptyDays === true) layout.hideEmptyDays = true
  const galleryWidthRem = bounded(raw.galleryWidthRem, 5, 30, 0.5)
  if (galleryWidthRem) layout.galleryWidthRem = galleryWidthRem
  const galleryHeightRem = bounded(raw.galleryHeightRem, 3, 40, 0.5)
  if (galleryHeightRem) layout.galleryHeightRem = galleryHeightRem
  if (raw.galleryLinked === true) layout.galleryLinked = true
  const galleryRatio = bounded(raw.galleryRatio, 0.3, 4, 0.01)
  if (galleryRatio) layout.galleryRatio = galleryRatio
  const galleryRadiusPx = bounded(raw.galleryRadiusPx, 0, 200)
  if (galleryRadiusPx !== undefined) layout.galleryRadiusPx = galleryRadiusPx
  if (raw.galleryFit === "contain") layout.galleryFit = "contain"
  if (raw.galleryStill === true) layout.galleryStill = true
  const timelineStyle = oneOf(raw.timelineStyle, ["dots", "icons", "chapters", "bars", "lanes"] as const)
  if (timelineStyle) layout.timelineStyle = timelineStyle
  if (raw.timelineAxis === "horizontal") layout.timelineAxis = "horizontal"
  const timelinePeriods = oneOf(raw.timelinePeriods, ["bands", "scale"] as const)
  if (timelinePeriods) layout.timelinePeriods = timelinePeriods
  if (text(raw.endColumn)) layout.endColumn = text(raw.endColumn)
  if (text(raw.laneColumn)) layout.laneColumn = text(raw.laneColumn)
  if (text(raw.dimColumn)) layout.dimColumn = text(raw.dimColumn)
  const galleryStyle = oneOf(raw.galleryStyle, ["plain", "wall", "cabinet", "strip", "carousel"] as const)
  if (galleryStyle && galleryStyle !== "plain") layout.galleryStyle = galleryStyle
  if (text(raw.gallerySizeColumn)) layout.gallerySizeColumn = text(raw.gallerySizeColumn)
  if (raw.milestoneEvery === 1 || raw.milestoneEvery === 10 || raw.milestoneEvery === 100 || raw.milestoneEvery === 1000) layout.milestoneEvery = raw.milestoneEvery
  if (text(raw.milestoneIcon, 40)) layout.milestoneIcon = text(raw.milestoneIcon, 40)
  const dateStyle = oneOf(raw.dateStyle, ["label", "badge", "hidden"] as const)
  if (dateStyle) layout.dateStyle = dateStyle
  const treeStyle = oneOf(raw.treeStyle, ["lines", "indent", "boxed", "org", "mindmap"] as const)
  if (treeStyle) layout.treeStyle = treeStyle
  if (text(raw.branchIcon, 40)) layout.branchIcon = text(raw.branchIcon, 40)
  if (text(raw.leafIcon, 40)) layout.leafIcon = text(raw.leafIcon, 40)
  if (raw.depthColors === true) layout.depthColors = true
  if (raw.rootsAsSections === true) layout.rootsAsSections = true
  const codexStyle = oneOf(raw.codexStyle, ["book", "scroll", "plain", "board", "sketch"] as const)
  if (codexStyle) layout.codexStyle = codexStyle
  if (raw.codexPages === true) layout.codexPages = true
  const codexTiles = Array.isArray(raw.codexTiles) ? raw.codexTiles.map((field) => text(field)).filter(Boolean).slice(0, 6) : []
  if (codexTiles.length) layout.codexTiles = codexTiles
  const codexLinks = Array.isArray(raw.codexLinks) ? raw.codexLinks.map((field) => text(field)).filter(Boolean).slice(0, 4) : []
  if (codexLinks.length) layout.codexLinks = codexLinks
  if (text(raw.codexRecto, 80)) layout.codexRecto = text(raw.codexRecto, 80)
  if (text(raw.codexVerso, 80)) layout.codexVerso = text(raw.codexVerso, 80)
  if (raw.proseColumns === 2) layout.proseColumns = 2
  if (raw.chapterNumbers === true) layout.chapterNumbers = true
  if (raw.tocPosition === "top") layout.tocPosition = "top"
  const look = cleanViewLook(raw.look)
  if (look) layout.look = look
  return layout.kind === "table" && !layout.groupBy ? undefined : layout
}

export function parseViewLayout(raw: string | undefined) {
  if (!raw?.trim()) return undefined
  try { return cleanViewLayout(JSON.parse(raw)) } catch { return undefined }
}

/** Les sections d'une colonne : une par valeur (une case à plusieurs valeurs va dans chacune), « Sans valeur » à la fin. */
export function groupRowsBy<T>(rows: T[], valueOf: (row: T) => string, order: string[] = []): Array<{ name: string; rows: T[] }> {
  const groups = new Map<string, { name: string; rows: T[] }>()
  for (const row of rows) {
    const values = cellParts(valueOf(row))
    for (const value of values.length ? values : [""]) {
      const key = value.toLocaleLowerCase("fr")
      const group = groups.get(key) ?? { name: value, rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
  }
  const rank = new Map(order.map((name, index) => [name.toLocaleLowerCase("fr"), index]))
  return [...groups.values()].sort((left, right) => {
    if (!left.name !== !right.name) return left.name ? -1 : 1
    const leftRank = rank.get(left.name.toLocaleLowerCase("fr")) ?? Number.MAX_SAFE_INTEGER
    const rightRank = rank.get(right.name.toLocaleLowerCase("fr")) ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank || left.name.localeCompare(right.name, "fr", { numeric: true })
  })
}

/** La valeur d'une formule de groupe (en-tête de section ou de colonne) sur des lignes : un nombre. */
export function groupFormulaValue<T>(formula: GroupFormula, rows: T[], valueOf: (row: T, column: string) => string) {
  if (formula.op === "count" || !formula.column) return rows.length
  const numbers = rows.map((row) => cellNumber(valueOf(row, formula.column!))).filter((number): number is number => number !== null)
  if (!numbers.length) return 0
  const sum = numbers.reduce((total, number) => total + number, 0)
  if (formula.op === "sum") return sum
  if (formula.op === "avg") return sum / numbers.length
  return formula.op === "min" ? Math.min(...numbers) : Math.max(...numbers)
}

/** Un nombre de vue écrit court (entier, sinon deux décimales). */
export function formatViewNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

/** La valeur d'une tuile de tableau de bord : un nombre, ou une répartition (les 8 premières valeurs). */
export function dashboardTileValue<T>(tile: DashboardTile, rows: T[], valueOf: (row: T, column: string) => string) {
  if (tile.kind === "count" || !tile.column) return { number: rows.length, breakdown: [] as Array<{ name: string; count: number }> }
  if (tile.kind === "breakdown") {
    const groups = groupRowsBy(rows, (row) => valueOf(row, tile.column!)).map((group) => ({ name: group.name || "Sans valeur", count: group.rows.length }))
    return { number: groups.length, breakdown: groups.sort((left, right) => right.count - left.count).slice(0, 8) }
  }
  if (tile.kind === "filled") return { number: rows.filter((row) => cellParts(valueOf(row, tile.column!)).length > 0).length, breakdown: [] }
  const numbers = rows.map((row) => cellNumber(valueOf(row, tile.column!))).filter((number): number is number => number !== null)
  const sum = numbers.reduce((total, number) => total + number, 0)
  if (tile.kind === "min" || tile.kind === "max") return { number: numbers.length ? (tile.kind === "min" ? Math.min(...numbers) : Math.max(...numbers)) : 0, breakdown: [] }
  return { number: tile.kind === "sum" ? sum : numbers.length ? sum / numbers.length : 0, breakdown: [] }
}

/** La valeur d'une tuile jauge : une formule sur les lignes, ou la case d'une ligne précise ; son maximum (la cible, ou la colonne de la ligne). */
export function tileGaugeValue<T>(tile: DashboardTile, rows: T[], valueOf: (row: T, column: string) => string, nameOf: (row: T) => string): { value: number; max: number | null; row?: T } {
  const fold = (value: string) => value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  if (tile.row) {
    const row = rows.find((candidate) => fold(nameOf(candidate)) === fold(tile.row!))
    const value = row && tile.column ? cellNumber(valueOf(row, tile.column)) ?? 0 : 0
    const max = tile.target ?? (row && tile.maxColumn ? cellNumber(valueOf(row, tile.maxColumn)) : null)
    return { value, max, row }
  }
  const measure = tile.measure ?? "count"
  const value = groupFormulaValue({ op: measure === "average" ? "avg" : measure, column: tile.column }, rows, valueOf)
  return { value, max: tile.target ?? null }
}

/** Les tuiles d'une tuile « liée » : une par valeur de la colonne liée (les lignes qui la citent), chacune avec ses formules. */
export function linkedTiles<T>(tile: DashboardTile, rows: T[], valueOf: (row: T, column: string) => string) {
  if (!tile.column) return []
  const groups = groupRowsBy(rows, (row) => valueOf(row, tile.column!)).filter((group) => group.name)
  const formulas = tile.formulas?.length ? tile.formulas : [{ op: "count" as const }]
  return groups.slice(0, tile.limit ?? 24).map((group) => ({
    name: group.name,
    count: group.rows.length,
    values: formulas.map((formula) => ({ label: formula.label ?? (formula.op === "count" ? "lignes" : `${groupFormulaOps.find((op) => op.value === formula.op)?.label ?? ""} · ${formula.column ?? ""}`), value: groupFormulaValue(formula, group.rows, valueOf), unit: formula.unit })),
  }))
}

export type TextSegment = { text: string } | { formula: string; value: string; at: number }

/**
 * Un texte à formules incrustées : « {nombre} », « {somme Or} », « {moyenne Niveau} », « {min X} »,
 * « {max X} », « {remplies X} », « {Or de Aldric} » (la case d'une ligne nommée), « {Colonne} »
 * (sa somme). Chaque formule devient un morceau à part, recalculé sur les lignes de la vue.
 */
export function textWithFormulas<T>(text: string, rows: T[], valueOf: (row: T, column: string) => string, nameOf: (row: T) => string, columns: string[] = []): TextSegment[] {
  const fold = (value: string) => value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  const column = (name: string) => columns.find((candidate) => fold(candidate) === fold(name)) ?? name
  const ops: Record<string, GroupFormulaOp> = { somme: "sum", moyenne: "avg", min: "min", max: "max" }
  const evaluate = (formula: string): string => {
    const inner = formula.trim()
    if (!inner) return ""
    if (/^nombre$/i.test(inner)) return formatViewNumber(rows.length)
    const rowRef = inner.match(/^(.+?)\s+de\s+(.+)$/i)
    if (rowRef) {
      const target = column(rowRef[1])
      const row = rows.find((candidate) => fold(nameOf(candidate)) === fold(rowRef[2]))
      return row ? valueOf(row, target).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "—"
    }
    const op = inner.match(/^(somme|moyenne|min|max|remplies)\s+(.+)$/i)
    if (op) {
      const target = column(op[2])
      if (/^remplies$/i.test(op[1])) return formatViewNumber(rows.filter((row) => cellParts(valueOf(row, target)).length > 0).length)
      return formatViewNumber(groupFormulaValue({ op: ops[op[1].toLocaleLowerCase("fr")], column: target }, rows, valueOf))
    }
    return formatViewNumber(groupFormulaValue({ op: "sum", column: column(inner) }, rows, valueOf))
  }
  const segments: TextSegment[] = []
  let at = 0
  let index = 0
  const pattern = /\{([^{}]+)\}/g
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) segments.push({ text: text.slice(at, match.index) })
    segments.push({ formula: match[1].trim(), value: evaluate(match[1]), at: index })
    index += 1
    at = match.index + match[0].length
  }
  if (at < text.length) segments.push({ text: text.slice(at) })
  return segments
}

/* ---------- Vues d'un onglet (Modifier › Vues, à côté de Cartes) ---------- */

/** Les vues réglées dans « Modifier », que les onglets-fenêtres affichent. */
export type PresentationKind = Exclude<ViewLayoutKind, "table" | "cards" | "stats">
export const presentationKinds = viewLayoutKinds.filter((kind): kind is (typeof viewLayoutKinds)[number] & { value: PresentationKind } => kind.value !== "table" && kind.value !== "cards")
export const isPresentationKind = (value: unknown): value is PresentationKind => presentationKinds.some((kind) => kind.value === value)

/** Une version de plus d'une vue, sous son nom (« Liste courte », « Kanban par lieu ») : son genre est celui de sa forme. */
export type NamedView = { id: string; name: string; layout: ViewLayout & { kind: PresentationKind } }

/**
 * Les réglages de chaque présentation d'un onglet (Modifier › Vues), enregistrés dans Eraser :
 * sous son genre, la version étoilée (celle que montrent les pages et le tableau de bord) ;
 * dans `named`, les autres versions, qu'un bloc de page peut choisir.
 */
export type TabPresentations = Partial<Record<PresentationKind, ViewLayout>> & { named?: NamedView[] }

/** Le choix « une autre version de la vue » d'un bloc de page, rangé avec les presets (`vue:<id>`). */
export const VIEW_VARIANT_PREFIX = "vue:"

function parseNamedView(input: unknown): NamedView | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>
  const id = (typeof raw.id === "string" ? raw.id : "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)
  const layout = cleanViewLayout(raw.layout)
  if (!id || !layout || !isPresentationKind(layout.kind)) return null
  const name = (typeof raw.name === "string" ? raw.name : "").replace(/\s+/g, " ").trim().slice(0, 60)
  return { id, name: name || "Vue", layout: layout as NamedView["layout"] }
}

export function parseTabPresentations(input: unknown): TabPresentations | null {
  let value = input
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch { return null }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const result: TabPresentations = {}
  for (const [key, layout] of Object.entries(value as Record<string, unknown>)) {
    if (!isPresentationKind(key) || !layout || typeof layout !== "object") continue
    const clean = cleanViewLayout({ ...(layout as Record<string, unknown>), kind: key })
    if (clean) result[key] = clean
  }
  const seen = new Set<string>()
  const named = (Array.isArray((value as { named?: unknown }).named) ? (value as { named: unknown[] }).named : []).map(parseNamedView).filter((item): item is NamedView => Boolean(item) && !seen.has(item!.id) && Boolean(seen.add(item!.id))).slice(0, 60)
  if (named.length) result.named = named
  return result
}

/** Les autres versions d'une vue d'un onglet (toutes, sans genre). */
export function namedViewsOf(entry: TabPresentations | null | undefined, kind?: PresentationKind): NamedView[] {
  return (entry?.named ?? []).filter((item) => !kind || item.layout.kind === kind)
}

/** Les genres de vue réglés dans une entrée (la version étoilée), sans la liste des autres versions. */
export function presentationEntries(entry: TabPresentations | null | undefined): Array<[PresentationKind, ViewLayout]> {
  return Object.entries(entry ?? {}).filter((pair): pair is [PresentationKind, ViewLayout] => isPresentationKind(pair[0]) && Boolean(pair[1]))
}

/** Une autre version d'une vue d'un onglet, par son identifiant ; `null` si elle n'existe plus. */
export function presentationVariant(stored: Record<string, TabPresentations> | null | undefined, tab: string, id: string): ViewLayout | null {
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  const entry = stored ? Object.entries(stored).find(([name]) => fold(name) === fold(tab))?.[1] : undefined
  return namedViewsOf(entry).find((item) => item.id === id)?.layout ?? null
}

/** La présentation à montrer : celle réglée pour l'onglet, sinon ses réglages par défaut. */
export function presentationFor(stored: Record<string, TabPresentations> | null | undefined, tab: string, kind: PresentationKind): ViewLayout {
  const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  const entry = stored ? Object.entries(stored).find(([name]) => fold(name) === fold(tab))?.[1] : undefined
  return entry?.[kind] ?? { kind }
}

/** Les lignes dans l'ordre de la vue (nombres comparés comme des nombres, sinon l'ordre alphabétique). */
export function sortLayoutRows<T>(rows: T[], layout: Pick<ViewLayout, "sortBy" | "sortDesc">, valueOf: (row: T, column: string) => string) {
  if (!layout.sortBy) return rows
  const key = (row: T) => valueOf(row, layout.sortBy!).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const sorted = [...rows].sort((left, right) => {
    const a = key(left), b = key(right)
    if (!a !== !b) return a ? -1 : 1
    const na = cellNumber(a), nb = cellNumber(b)
    const order = na !== null && nb !== null && /^-?\d/.test(a) && /^-?\d/.test(b) ? na - nb : a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" })
    return layout.sortDesc ? -order : order
  })
  return sorted
}

/**
 * Une vue réglée appliquée à un autre onglet ou index : ses colonnes absentes de l'onglet
 * sont retirées (le preset garde le reste : sections repliables, densité, tuiles…).
 */
export function fitLayoutToColumns(layout: ViewLayout, columns: string[]): ViewLayout {
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
  const known = new Map(columns.map((column) => [fold(column), column]))
  const one = (value?: string) => value ? known.get(fold(value)) : undefined
  const many = (values?: string[]) => (values ?? []).flatMap((value) => known.get(fold(value)) ?? [])
  const next: ViewLayout = { ...layout, groupBy: one(layout.groupBy), kanbanColumn: one(layout.kanbanColumn), dateColumn: one(layout.dateColumn), sortBy: one(layout.sortBy), parentColumn: one(layout.parentColumn), colorBy: one(layout.colorBy), imageColumn: one(layout.imageColumn), iconColumn: one(layout.iconColumn), badgeColumn: one(layout.badgeColumn), endColumn: one(layout.endColumn), laneColumn: one(layout.laneColumn), dimColumn: one(layout.dimColumn), gallerySizeColumn: one(layout.gallerySizeColumn), fields: many(layout.fields), detailFields: many(layout.detailFields), codexTiles: many(layout.codexTiles), codexLinks: many(layout.codexLinks), tiles: layout.tiles?.flatMap((tile) => tile.column && !known.has(fold(tile.column)) ? [] : [{ ...tile, maxColumn: one(tile.maxColumn), formulas: tile.formulas?.filter((formula) => !formula.column || known.has(fold(formula.column))) }]),
    groupFormula: layout.groupFormula && (!layout.groupFormula.column || known.has(fold(layout.groupFormula.column))) ? layout.groupFormula : undefined,
    gauge: layout.gauge && known.has(fold(layout.gauge.column)) ? { ...layout.gauge, maxColumn: one(layout.gauge.maxColumn) } : undefined }
  return cleanViewLayout(next) ?? { kind: layout.kind }
}

/** Un preset de vue : des réglages nommés, communs à tous les index. */
export type ViewPreset = { id: string; name: string; layout: ViewLayout; builtin?: boolean; updatedAt?: string }

/** Les presets d'Eraser, sans colonne : ils se complètent avec celles de l'onglet. */
export const builtinViewPresets: ViewPreset[] = [
  { id: "eraser:list-compact", name: "Liste compacte", builtin: true, layout: { kind: "list", compact: true } },
  { id: "eraser:list-folding", name: "Liste à lignes dépliables", builtin: true, layout: { kind: "list", collapsible: true } },
  { id: "eraser:list-two", name: "Liste sur deux colonnes", builtin: true, layout: { kind: "list", compact: true, listColumns: 2 } },
  { id: "eraser:list-sections", name: "Sections repliées", builtin: true, layout: { kind: "list", collapsible: true, collapsed: true, hideEmpty: true } },
  { id: "eraser:kanban-narrow", name: "Kanban serré", builtin: true, layout: { kind: "kanban", laneWidth: "narrow", hideEmpty: true } },
  { id: "eraser:kanban-wide", name: "Kanban large", builtin: true, layout: { kind: "kanban", laneWidth: "wide" } },
  { id: "eraser:master-sections", name: "Maître-détail en sections", builtin: true, layout: { kind: "master-detail", collapsible: true } },
  { id: "eraser:calendar-real", name: "Calendrier réel", builtin: true, layout: { kind: "calendar", calendar: "Calendrier réel", showUndated: true } },
  { id: "eraser:dashboard-count", name: "Tableau de bord simple", builtin: true, layout: { kind: "dashboard", tiles: [{ kind: "count" }] } },
  { id: "eraser:list-cards", name: "Liste de cartes", builtin: true, layout: { kind: "list", itemCard: DEFAULT_ITEM_CARD, listColumns: 2 } },
  // La page Règles › Classes : une section par famille (Type), cinq cartes de classe par rangée.
  { id: "eraser:classes-par-famille", name: "Classes par famille", builtin: true, layout: { kind: "list", groupBy: "Type", hideEmpty: true, hideCounts: true, itemCard: "eraser-classe-carte", listColumns: 5, look: { sectionStyle: "heading" } } },
  { id: "eraser:cards-by-section", name: "Cartes rangées en grandes sections", builtin: true, layout: { kind: "list", itemCard: DEFAULT_ITEM_CARD, listColumns: 4, hideEmpty: true, hideCounts: true, look: { sectionStyle: "heading" } } },
  { id: "eraser:kanban-cards", name: "Kanban de cartes", builtin: true, layout: { kind: "kanban", itemCard: DEFAULT_ITEM_CARD, hideEmpty: true } },
  { id: "eraser:master-card", name: "Maître-détail avec carte", builtin: true, layout: { kind: "master-detail", itemCard: DEFAULT_ITEM_CARD } },
  { id: "eraser:gallery-portraits", name: "Trombinoscope", builtin: true, layout: { kind: "gallery", galleryShape: "portrait", gallerySize: "md" } },
  { id: "eraser:gallery-wall", name: "Mur d’images", builtin: true, layout: { kind: "gallery", galleryShape: "square", gallerySize: "sm", captionOnHover: true } },
  { id: "eraser:timeline-alternate", name: "Chronique alternée", builtin: true, layout: { kind: "timeline", timelineSide: "alternate" } },
  { id: "eraser:timeline-cards", name: "Chronologie de cartes", builtin: true, layout: { kind: "timeline", timelineSide: "right", itemCard: DEFAULT_ITEM_CARD } },
  { id: "eraser:tree-folded", name: "Arbre replié", builtin: true, layout: { kind: "tree", collapsed: true } },
  { id: "eraser:codex-toc", name: "Codex avec sommaire", builtin: true, layout: { kind: "codex", showToc: true } },
  { id: "eraser:list-bestiary", name: "Bestiaire (portraits ronds, pastilles)", builtin: true, layout: { kind: "list", look: { surface: "boxed", density: "airy", imageShape: "circle", imageSize: "lg", titleSize: "lg", fieldStyle: "pills", accent: "tint" } } },
  { id: "eraser:list-ledger", name: "Registre (lignes fines, libellés)", builtin: true, layout: { kind: "list", look: { surface: "plain", density: "compact", titleFont: "sans", titleSize: "sm", fieldStyle: "labels", accent: "dot" } } },
  { id: "eraser:kanban-headers", name: "Kanban à en-têtes colorés", builtin: true, layout: { kind: "kanban", hideEmpty: true, look: { laneStyle: "header", fieldStyle: "pills", imageShape: "rounded" } } },
  { id: "eraser:kanban-tinted", name: "Kanban teinté", builtin: true, layout: { kind: "kanban", look: { laneStyle: "tinted", surface: "boxed", accent: "border", density: "compact" } } },
  { id: "eraser:calendar-agenda", name: "Agenda", builtin: true, layout: { kind: "calendar", look: { calendarMode: "agenda", entryStyle: "bar" } } },
  { id: "eraser:calendar-dots", name: "Calendrier à pastilles", builtin: true, layout: { kind: "calendar", look: { entryStyle: "dot" } } },
  { id: "eraser:dashboard-tinted", name: "Tableau de bord teinté", builtin: true, layout: { kind: "dashboard", tiles: [{ kind: "count" }], look: { tileStyle: "tinted" } } },
  { id: "eraser:gallery-captions", name: "Galerie légendée", builtin: true, layout: { kind: "gallery", galleryShape: "square", look: { caption: "below", fieldStyle: "pills" } } },
  { id: "eraser:codex-book", name: "Livre illustré", builtin: true, layout: { kind: "codex", showToc: true, look: { codexImage: "banner", dropCap: true } } },
  { id: "eraser:master-wide", name: "Maître-détail, liste large", builtin: true, layout: { kind: "master-detail", look: { masterWidth: "wide", imageShape: "circle", fieldStyle: "stacked" } } },
  // Les formes qui tirent parti des réglages propres à chaque vue (icônes, couleurs, dessins).
  { id: "eraser:list-numbered", name: "Liste numérotée", builtin: true, layout: { kind: "list", numbered: true, look: { surface: "zebra", density: "compact", titleFont: "sans" } } },
  { id: "eraser:list-alphabet", name: "Annuaire par lettre", builtin: true, layout: { kind: "list", alphabet: true, collapsible: true, hideCounts: true, listColumns: 2, look: { surface: "plain", density: "compact", sectionStyle: "heading" } } },
  { id: "eraser:list-boxed-icons", name: "Liste encadrée à icônes", builtin: true, layout: { kind: "list", itemIcon: "sparkle", look: { surface: "boxed", radius: "lg", shadow: true, accent: "title", fieldStyle: "pills", fieldColor: "accent" } } },
  { id: "eraser:kanban-folding", name: "Kanban repliable, à icônes", builtin: true, layout: { kind: "kanban", laneCollapse: true, hideEmpty: true, look: { laneStyle: "header", sectionIcon: "flag", surface: "boxed", radius: "lg" } } },
  { id: "eraser:master-right", name: "Maître-détail, liste à droite", builtin: true, layout: { kind: "master-detail", masterSide: "right", detailColumns: 1, detailImage: "banner", look: { masterWidth: "narrow" } } },
  { id: "eraser:calendar-seasons", name: "Calendrier des saisons", builtin: true, layout: { kind: "calendar", monthStyle: "season", maxPerDay: 3, look: { entryStyle: "bar", density: "airy" } } },
  { id: "eraser:dashboard-icons", name: "Tableau de bord à icônes", builtin: true, layout: { kind: "dashboard", tiles: [{ kind: "count", icon: "users", size: "lg" }], tileColumns: 4, look: { tileStyle: "accent", radius: "lg", shadow: true } } },
  { id: "eraser:gallery-polaroid", name: "Polaroïds", builtin: true, layout: { kind: "gallery", galleryWidthRem: 11, galleryRatio: 1, galleryRadiusPx: 4, look: { caption: "below", surface: "boxed", titleFont: "sans", density: "airy" } } },
  { id: "eraser:gallery-ribbon", name: "Galerie à rubans", builtin: true, layout: { kind: "gallery", galleryShape: "portrait", galleryRadiusPx: 16, look: { caption: "overlay", accent: "border" } } },
  { id: "eraser:timeline-chapters", name: "Chronique en chapitres", builtin: true, layout: { kind: "timeline", timelineStyle: "chapters", timelineSide: "right", dateStyle: "badge", milestoneEvery: 10, look: { surface: "plain", titleFont: "display", titleSize: "md" } } },
  { id: "eraser:timeline-icons", name: "Frise à médaillons", builtin: true, layout: { kind: "timeline", timelineStyle: "icons", itemIcon: "flag", milestoneIcon: "hourglass", look: { density: "airy", radius: "lg" } } },
  { id: "eraser:tree-boxed", name: "Arbre en cartes", builtin: true, layout: { kind: "tree", treeStyle: "boxed", branchIcon: "trees", leafIcon: "leaf", depthColors: true, look: { density: "airy" } } },
  { id: "eraser:tree-sections", name: "Racines en sections", builtin: true, layout: { kind: "tree", rootsAsSections: true, treeStyle: "indent", look: { sectionStyle: "heading", titleFont: "display" } } },
  { id: "eraser:codex-scroll", name: "Parchemin", builtin: true, layout: { kind: "codex", codexStyle: "scroll", showToc: true, chapterNumbers: true, look: { dropCap: true, titleFont: "display", titleSize: "lg" } } },
  { id: "eraser:codex-columns", name: "Codex sur deux colonnes", builtin: true, layout: { kind: "codex", proseColumns: 2, tocPosition: "top", showToc: true, look: { codexImage: "banner", density: "compact" } } },
]

export function cleanViewPreset(value: unknown): ViewPreset | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const name = text(raw.name, 60)
  const layout = cleanViewLayout(raw.layout)
  if (!name || !layout || !isPresentationKind(layout.kind)) return null
  return { id: text(raw.id, 80) || "", name, layout, ...(text(raw.updatedAt, 40) ? { updatedAt: text(raw.updatedAt, 40) } : {}) }
}


/* ---------- Arborescence et chronologie : règles pures ---------- */

export type RowTreeNode<T> = { row: T; depth: number; children: RowTreeNode<T>[] }

/**
 * Les lignes rangées sous leur parent : la case `parentOf` d'une ligne nomme une autre ligne
 * (premier nom de la case, sans tenir compte des accents ni des majuscules). Une ligne dont
 * le parent est inconnu, vide, elle-même ou pris dans une boucle est une racine.
 */
export function rowTree<T>(rows: T[], nameOf: (row: T) => string, parentOf: (row: T) => string): RowTreeNode<T>[] {
  const fold = (value: string) => value.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
  const byName = new Map<string, T>()
  for (const row of rows) { const name = fold(nameOf(row)); if (name && !byName.has(name)) byName.set(name, row) }
  const parent = new Map<T, T>()
  for (const row of rows) {
    const named = cellParts(parentOf(row)).map(fold).find(Boolean)
    const found = named ? byName.get(named) : undefined
    if (found !== undefined && found !== row) parent.set(row, found)
  }
  // Une boucle (A sous B, B sous A) : la première ligne rencontrée redevient une racine.
  for (const row of rows) {
    const seen = new Set<T>([row])
    let current = parent.get(row)
    while (current !== undefined) {
      if (seen.has(current)) { parent.delete(row); break }
      seen.add(current)
      current = parent.get(current)
    }
  }
  const children = new Map<T, T[]>()
  for (const row of rows) { const up = parent.get(row); if (up !== undefined) children.set(up, [...(children.get(up) ?? []), row]) }
  const build = (row: T, depth: number): RowTreeNode<T> => ({ row, depth, children: (children.get(row) ?? []).map((child) => build(child, depth + 1)) })
  return rows.filter((row) => !parent.has(row)).map((row) => build(row, 0))
}

/** Le nombre de lignes sous un nœud (lui non compris). */
export function treeSize<T>(node: RowTreeNode<T>): number {
  return node.children.reduce((sum, child) => sum + 1 + treeSize(child), 0)
}

export type TimelineDate = { year: number; month: number; day: number; /** Seule l'année est connue (« 1023 », « An 1023 »). */ yearOnly?: boolean }

/**
 * Les lignes dans l'ordre du temps : la date lue par `parse` (un calendrier du monde), sinon
 * un nombre seul dans la case, pris comme une année. Les lignes sans date restent à part.
 */
export function timelineEntries<T>(rows: T[], textOf: (row: T) => string, parse: (text: string) => { year: number; month: number; day: number } | null) {
  const dated: Array<{ row: T; date: TimelineDate }> = []
  const undated: T[] = []
  for (const row of rows) {
    const value = textOf(row).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const date = value ? parse(value) : null
    if (date) { dated.push({ row, date }); continue }
    const year = value ? cellNumber(value) : null
    if (year !== null && Number.isInteger(year)) dated.push({ row, date: { year, month: 0, day: 0, yearOnly: true } })
    else undated.push(row)
  }
  dated.sort((left, right) => left.date.year - right.date.year || left.date.month - right.date.month || left.date.day - right.date.day)
  return { dated, undated }
}
