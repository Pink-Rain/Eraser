/**
 * Les index du monde rangés dans Ressources : créatures, lieux, religions, peuples, langues.
 * Ce fichier ne dépend de rien côté serveur : l'interface s'en sert aussi pour savoir
 * quelles colonnes sont des listes de noms reliées à un autre index.
 */
import { foldName, isIdHeader, matchChoice, type ChoiceOption, type IndexColumnSpec } from "@/lib/index-columns"
import type { ColumnPolicy } from "@/lib/index-schema-shared"
import { stateFxList } from "@/lib/state-fx"
import {
  CATALOG_CHARACTERISTIC_HEADER,
  CATALOG_COLOR_HEADER,
  CATALOG_DEFAULT_HEADER,
  CATALOG_KEY_HEADER,
  CATALOG_TYPE_HEADER,
  CHARACTERISTICS_TAB,
  PRINCIPAL_LABEL,
  SECONDARY_LABEL,
  SKILLS_TAB,
  builtinCharacteristicColor,
  catalogSeedRows,
} from "@/lib/character-catalog"
import {
  ACHIEVEMENT_COLOR_HEADER,
  ACHIEVEMENT_DESCRIPTION_HEADER,
  ACHIEVEMENT_ICON_HEADER,
  ACHIEVEMENT_SUBTYPE_HEADER,
  ACHIEVEMENT_TYPE_HEADER,
  ACHIEVEMENTS_TAB,
  OBTAINED_ACCOUNT_HEADER,
  OBTAINED_ACHIEVEMENT_HEADER,
  OBTAINED_BY_HEADER,
  OBTAINED_DATE_HEADER,
  OBTAINED_NOTE_HEADER,
  OBTAINED_PLAYER_HEADER,
  OBTAINED_TAB,
  achievementSubtypes,
  achievementTypeColors,
} from "@/lib/achievements-shared"
import { classSpellCategory, classSpellCategoryTones, classSpellTypeSuggestions } from "@/lib/class-spell-utils"
import { campaignSheetHeaders, classDifficultyValues, classSheetHeaders, classTypeValues, npcSheetHeaders, spellSheetHeaders } from "@/lib/entity-sheets"

export { foldName }

/** L'Index des états : ses deux onglets et les colonnes que la fiche de personnage lit. */
export const STATES_TAB = "États"
export const EFFECTS_TAB = "Effets"
export const STATE_LEVEL_HEADERS = ["Niveau 1", "Niveau 2"] as const
export const EFFECT_TARGET_HEADER = "Cible"
export const EFFECT_COLOR_HEADER = "Couleur"
export const EFFECT_CHANGE_HEADER = "Changement de valeur"
/** Le jet de dés qui déclenche l'effet depuis la fiche (« 1d20 16-20 »). */
/** Armes - Modificateurs : runes, matériaux et attributs, rangés par Type. */
export const WEAPON_MODIFIERS_SHEET = "Armes - Modificateurs"
export const WEAPON_MODIFIERS_TAB = "Tout"
export const WEAPON_MODIFIER_TYPE_HEADER = "Type"
export const WEAPON_MODIFIER_NUMBER_HEADER = "Nombre"
export const WEAPON_MODIFIER_CHARGES_HEADER = "Charges"
export const WEAPON_MODIFIER_COLOR_HEADER = "Couleur"
export const WEAPON_MODIFIER_ICON_HEADER = "Icône"
export const EFFECT_ROLL_HEADER = "Jet"
/** Case à cocher : l'effet s'écrit pour de bon à chaque fois qu'il est déclenché. */
export const EFFECT_RETRIGGER_HEADER = "Redéclencher l'effet"
export const EFFECT_RETRIGGER_DESCRIPTION = "Cochée : l'effet n'est plus temporaire. Il s'écrit pour de bon dans la fiche (des dégâts, un soin), comme un dé : quand l'état est posé ou monte à ce niveau, puis à chaque nouveau clic sur le niveau en cours. Avec des dés ou un Jet, ils sont lancés à ces moments-là."

/** Comment écrire ces deux colonnes : la description proposée d'office (modifiable dans « Modifier »). */
export const EFFECT_CHANGE_DESCRIPTION = "Tant que l’état est posé : +10 ou 10 ajoute, -30 retire, =100 remplace, ≥1 (ou >=1) plancher, ≤50 (ou <=50) plafond ; tout revient quand l’état part. Des dés se lancent depuis la fiche et s’écrivent dans la fiche (dégâts, soins). Le signe tout devant vaut pour le total : -1d20+20 retire le total de 1d20+20, +2d6 ou 2d6 ajoute ; 1d20-20 ajoute (1d20-20), donc retire si le dé fait moins de 20."
export const EFFECT_ROLL_DESCRIPTION = "La condition, lancée depuis la fiche avant le changement de valeur : les dés puis la plage qui réussit. 1d20 16-20, 1d20 : 16 & 20, 1d10 ≤3 (ou 3 ou moins), 1d10 ≥8 (ou 8 ou plus), 1d6 6. Réussi : le changement de valeur s’applique ; raté : rien. Sans plage, il réussit toujours. Les dégâts eux-mêmes (-1d20+20) vont dans « Changement de valeur »."
/** Une cible de la fiche qui n'est pas dans l'Index des caractéristiques : la vie actuelle. */
export const CURRENT_LIFE_TARGET = "Points de vie actuels"
export const EFFECT_IMAGE_HEADER = "Image"
/**
 * Où la couleur de l'effet s'applique, un ou plusieurs choix : toute la fiche (comme à
 * 0 PV), les caractéristiques et compétences visées, le portrait. Rien de choisi : la
 * couleur ne s'applique nulle part.
 */
export const EFFECT_PAGE_HEADER = "Couleur appliquée à"
export const EFFECT_APPLY_OPTIONS = ["Page entière", "Compétence liée", "Portrait"] as const
/** L'ancien nom de cette colonne : l'en-tête est renommé sur place dans la feuille. */
export const EFFECT_PAGE_LEGACY_HEADERS = ["Appliqué à la page", "Non lié aux caractéristiques"]
export const EFFECT_FX_HEADER = "FX"
/** Où les FX de l'effet se dessinent : mêmes choix que la couleur ; nulle part si rien n'est choisi. */
export const EFFECT_FX_APPLY_HEADER = "FX appliqué à"

/**
 * Les index d'entités : PNJs, campagnes, personnages, classes et sorts. Leurs lignes sont
 * lues et écrites ailleurs par le code d'Eraser (par le nom de leurs colonnes) ; le moteur
 * leur donne tout le reste : tableau, fiche, « Modifier », onglets-fenêtres, formules…
 */
export type EntityWorldIndexKey = "npcs" | "campaigns" | "characters" | "classes" | "class-spells" | "creature-spells"

export type BuiltinWorldIndexKey = "creatures" | "places" | "religions" | "peoples" | "languages" | "states" | "weapon-modifiers" | "skills" | "achievements" | EntityWorldIndexKey

/** Un index du monde : prévu par Eraser, ou créé depuis « Nouvel index » (« perso-… »). */
export type WorldIndexKey = BuiltinWorldIndexKey | `perso-${string}`

export type WorldIndexTabDefinition = {
  name: string
  /** « une créature », « une divinité »… pour « Ajouter une créature ». */
  itemLabel: string
  /** Toutes les colonnes de la feuille, dans l'ordre où elles sont créées. */
  headers: string[]
  widths: number[]
  /** Préfixe des identifiants de l'onglet : « CRE » donne « CRE-3F9A1C2B ». */
  idPrefix: string
  /**
   * Colonnes affichées dans le tableau de l'application, quand elles ne sont pas
   * toutes utiles : les autres restent dans Sheets et se remplissent par la fiche.
   */
  gridHeaders?: string[]
  /**
   * Colonnes renommées par Eraser : `[ancien nom, nouveau nom]`. Trouvé sous l'ancien nom,
   * l'en-tête est réécrit sur place ; la colonne et ses valeurs ne bougent pas.
   */
  renamedHeaders?: Array<[string, string]>
}

/**
 * Ce qui distingue un index d'entités. Le moteur n'y ajoute ni n'y renomme aucun
 * en-tête (le code de chaque feuille s'en charge), n'y réécrit aucun identifiant, et
 * n'y insère ni n'y supprime de lignes : on les crée depuis leurs pages.
 */
export type EntityIndexOptions = {
  /** La colonne du nom de chaque ligne. */
  nameHeader: string
  /** Le nom mène à cette page plutôt qu'à la fiche de la ligne (« {id} » : son identifiant). */
  nameHref?: string
  /** « Ajouter » mène à cette page ; sans elle, le formulaire du moteur ajoute la ligne. */
  addHref?: string
  /** Valeurs données d'office à une ligne ajoutée par le formulaire (la page d'un PNJ…). */
  addDefaults?: Record<string, string>
  /** Ajouter, insérer, dupliquer et supprimer des lignes depuis le tableau (les PNJs, les sorts). */
  rowCommands?: boolean
  /**
   * Personnages et campagnes : le tableau les duplique, et « Supprimer » les met à la
   * corbeille (restaurables depuis Administration) au lieu d'effacer leur ligne.
   */
  trashKind?: "character" | "campaign"
  /** Seules ces colonnes (et celles ajoutées dans « Modifier ») sont lues : la feuille est immense. */
  readHeaders?: string[]
}

export type WorldIndexDefinition = {
  key: WorldIndexKey
  /** Nom du classeur dans Google Drive. */
  sheetName: string
  title: string
  path: string
  /** « un lieu » : ce qu'on ajoute depuis la vue « Tout », quel que soit l'onglet. */
  itemLabel?: string
  tabs: WorldIndexTabDefinition[]
  /** Index créé depuis « Nouvel index ». */
  custom?: boolean
  description?: string
  /** Index d'entités (PNJs, campagnes, personnages, classes, sorts). */
  entity?: EntityIndexOptions
}

/** Colonnes de l'Index des créatures visibles dans le tableau. */
export const creatureGridHeaders = ["Nom", "Type", "Sous-type", "Rang", "Dressable", "Emplacement principal", "Rareté", "Emplacement secondaire", "Rareté secondaire", "Comportement", "Extension"]

/**
 * La colonne d'identifiant de chaque index. Elle est ajoutée à droite des colonnes
 * existantes de la feuille, sans rien déplacer, et remplie par Eraser.
 */
export const ID_HEADER = "ID"

/** Caractéristiques d'une créature, dans l'ordre de la fiche. */
export const creatureCharacteristics = ["Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Vitesse", "Vitalité"]

/** La seule note de la fiche. */
export const creatureNoteHeader = "Description"

/**
 * Colonnes remplies par la fiche d'une créature. Elles vivent dans Sheets, à la suite
 * des colonnes de l'index, mais ne s'affichent pas dans le tableau de l'application.
 * Les anciennes colonnes (Environnement, Climat, Rencontre, Perception…) restent
 * listées : sorties de la fiche, elles gardent leur contenu dans Sheets et restent
 * hors du tableau.
 */
export const creatureSheetOnlyHeaders = [
  "Portrait", "Environnement", "Climat", "Sous-type secondaire", "Organisation", "Rencontre",
  "Langue", "Taille", "Poids", "Force", "Dextérité", "Intelligence", "Perception", "Charisme", "Vitesse", "Vitalité",
  "Sorts actifs", "Sorts passifs", "Sagesse", creatureNoteHeader,
]

/** Un choix d'une liste fermée (conservé sous ce nom pour la fiche des créatures). */
export type CreatureChoice = ChoiceOption

const choices = (values: string[]): ChoiceOption[] => values.map((value) => ({ value }))

export const creatureLocations: ChoiceOption[] = [
  ...choices(["Marais", "Désert", "Savane", "Jungle", "Forêt"]),
  // Orthographe corrigée : les cellules « Forêt noir » sont reconnues et corrigées.
  { value: "Forêt noire", aliases: ["Forêt noir"] },
  ...choices(["Donjon", "Ville", "Caverne", "Montagne", "Aquatique", "Plaine", "Maison"]),
]
export const creatureRarities = choices(["Très commun", "Commun", "Rare", "Très rare", "Ultime", "Légendaire"])

/** Les listes fermées de la fiche, par en-tête de colonne. */
export const creatureChoices: Record<string, ChoiceOption[]> = {
  "Rang": choices(["1", "2", "3", "4", "5"]),
  "Type": choices(["Animal", "Artificiel", "Extérieur", "Humanoïdes monstrueux", "Mort-vivant", "Spectrale", "Végétale", "Vermine"]),
  "Sous-type": choices(["Destrier", "Amphibien", "Aquatique", "Arachnide", "Bois", "Carnivore", "Cervidé", "Crustacé", "Démoniaque", "Divin", "Familier", "Félin", "Fermier", "Feu", "Fixe", "Golem", "Insecte", "Nim'Or", "Nuée", "Ombre", "Parasite", "Reptile", "Rongeur", "Sable", "Toxique", "Vase", "Volatile"]),
  "Emplacement principal": creatureLocations,
  "Rareté": creatureRarities,
  "Emplacement secondaire": creatureLocations,
  "Rareté secondaire": creatureRarities,
  "Organisation": choices(["Solitaire 1", "Groupe 2", "Meute 3", "Nuée 4"]),
  "Comportement": choices(["Agressif", "Défensif", "Pacifiste"]),
  // Les familles qui parlent chaque langue s'affichent au survol.
  "Langue": [
    { value: "Anoumagus", hint: "Destrier, Volatile, Carnivore, Cervidé" },
    { value: "Félinos", hint: "Félin, Rongeur" },
    { value: "Reptaïl", hint: "Reptile, Amphibien" },
    { value: "Shaâil", hint: "Ombre" },
    { value: "Arak", hint: "Arachnide" },
    { value: "Kléovias", hint: "Crustacé, Insecte, Parasite" },
    { value: "Nashilien", hint: "Aquatique" },
    { value: "Hépoien", hint: "Démoniaque" },
  ],
}

/** Le choix de la liste qui correspond à une valeur de la feuille, s'il y en a un. */
export const matchCreatureChoice = matchChoice

/** Les onglets de l'Index des lieux, du plus vaste au plus précis. */
export const placeTabs = [
  ["Zone géographique", "une zone géographique"],
  ["Pays", "un pays"],
  ["Régions", "une région"],
  ["Villes", "une ville"],
  ["Points d'intérêt", "un point d'intérêt"],
  // Ajouté après les autres : le premier onglet reste celui où un lien crée un lieu manquant.
  ["Environnement", "un environnement"],
] as const

const worldBaseDefinitions: Record<Exclude<BuiltinWorldIndexKey, EntityWorldIndexKey>, WorldIndexDefinition> = {
  // Lu par la fiche de personnage : ses caractéristiques, ses compétences et leurs
  // valeurs de départ. Rempli à sa création avec la liste d'origine de la fiche.
  skills: {
    key: "skills",
    sheetName: "Index des caractéristiques et compétences",
    title: "Caractéristiques et compétences",
    path: "/ressources/index-des-caracteristiques",
    tabs: [
      // « Couleur » est venue après : dans un classeur existant, elle s'ajoute à droite.
      { name: CHARACTERISTICS_TAB, itemLabel: "une caractéristique", headers: ["Nom", CATALOG_TYPE_HEADER, CATALOG_DEFAULT_HEADER, CATALOG_KEY_HEADER, ID_HEADER, CATALOG_COLOR_HEADER], widths: [260, 150, 160, 220, 130, 150], idPrefix: "CAR" },
      { name: SKILLS_TAB, itemLabel: "une compétence", headers: ["Nom", CATALOG_CHARACTERISTIC_HEADER, CATALOG_DEFAULT_HEADER, CATALOG_KEY_HEADER, ID_HEADER], widths: [300, 220, 160, 220, 130], idPrefix: "COM" },
    ],
  },
  creatures: {
    key: "creatures",
    sheetName: "Index des créatures",
    title: "Créatures",
    path: "/ressources/index-des-creatures",
    tabs: [{
      name: "Créatures",
      itemLabel: "une créature",
      headers: [...creatureGridHeaders, ...creatureSheetOnlyHeaders, ID_HEADER],
      widths: [240, 170, 160, 90, 100, 190, 140, 190, 150, 140, 120, ...creatureSheetOnlyHeaders.map((header) => /portrait|sorts|description|organisation|rencontre/i.test(header) ? 260 : 130), 130],
      gridHeaders: [...creatureGridHeaders, ID_HEADER],
      idPrefix: "CRE",
    }],
  },
  places: {
    key: "places",
    sheetName: "Index des lieux",
    title: "Lieux",
    path: "/ressources/index-des-lieux",
    itemLabel: "un lieu",
    tabs: placeTabs.map(([name, itemLabel]) => ({
      name,
      itemLabel,
      headers: ["Nom", "Type", "Sous-type", "Peuple", "Description", "Note", "Langues", ID_HEADER],
      widths: [220, 150, 150, 220, 420, 320, 220, 130],
      idPrefix: "LIE",
    })),
  },
  religions: {
    key: "religions",
    sheetName: "Index des religions",
    title: "Religions",
    path: "/ressources/index-des-religions",
    tabs: [
      { name: "Religions", itemLabel: "une religion", headers: ["Nom", "Divinités", "Description", "Note", ID_HEADER], widths: [220, 260, 420, 320, 130], idPrefix: "REL" },
      { name: "Divinités", itemLabel: "une divinité", headers: ["Nom", "Religion", "Histoire", "Description", "Autre", ID_HEADER], widths: [220, 220, 420, 420, 320, 130], idPrefix: "DIV" },
    ],
  },
  peoples: {
    key: "peoples",
    sheetName: "Index des peuples",
    title: "Peuples",
    path: "/ressources/index-des-peuples",
    tabs: [{
      name: "Peuples",
      itemLabel: "un peuple",
      headers: ["Nom", "Ancêtres", "Descendant", "Lieux", "Description", "Note", "Langues", ID_HEADER],
      widths: [220, 220, 220, 220, 420, 320, 220, 130],
      idPrefix: "PEU",
    }],
  },
  languages: {
    key: "languages",
    sheetName: "Index des langues",
    title: "Langues",
    path: "/ressources/index-des-langues",
    tabs: [{
      name: "Langues",
      itemLabel: "une langue",
      headers: ["Nom", "Lieu", "Peuple", "Langue-mère", "Langue-fille", ID_HEADER],
      widths: [220, 240, 240, 220, 220, 130],
      idPrefix: "LAN",
    }],
  },
  // Quatre index préparés, à remplir : chacun a son propre classeur, créé la première
  // fois qu'on ouvre sa page (et relié s'il existe déjà sous ce nom dans Drive).
  // Les états et leurs effets. Un état lie, à chacun de ses deux niveaux, un ou plusieurs
  // effets de l'onglet « Effets » : la fiche de personnage les applique quand l'état est posé.
  // Dans un classeur existant, « Niveau 1 », « Niveau 2 » et l'onglet « Effets » s'ajoutent
  // à droite / à la suite, sans rien déplacer.
  states: {
    key: "states",
    sheetName: "Index des états",
    title: "États",
    path: "/ressources/index-des-etats",
    tabs: [
      {
        name: STATES_TAB,
        itemLabel: "un état",
        headers: ["Nom", "Type", "Effet", "Durée", "Cumul", "Fin de l'état", "Description", "Note", ID_HEADER, STATE_LEVEL_HEADERS[0], STATE_LEVEL_HEADERS[1]],
        widths: [220, 140, 380, 140, 110, 260, 380, 280, 130, 240, 240],
        idPrefix: "ETA",
      },
      {
        name: EFFECTS_TAB,
        itemLabel: "un effet",
        headers: ["Nom", EFFECT_TARGET_HEADER, EFFECT_COLOR_HEADER, EFFECT_CHANGE_HEADER, EFFECT_IMAGE_HEADER, ID_HEADER, EFFECT_PAGE_HEADER, EFFECT_FX_HEADER, EFFECT_FX_APPLY_HEADER, EFFECT_ROLL_HEADER, EFFECT_RETRIGGER_HEADER],
        widths: [240, 320, 130, 190, 160, 130, 220, 220, 220, 170],
        idPrefix: "EFF",
        renamedHeaders: EFFECT_PAGE_LEGACY_HEADERS.map((legacy) => [legacy, EFFECT_PAGE_HEADER] as [string, string]),
      },
    ],
  },
  // Runes, matériaux et attributs des armes, dans un seul classeur : la colonne Type range
  // chaque ligne dans l'onglet qui porte sa valeur, sans la sortir de « Tout ».
  "weapon-modifiers": {
    key: "weapon-modifiers",
    sheetName: WEAPON_MODIFIERS_SHEET,
    title: "Armes - Modificateurs",
    path: "/ressources/armes-modificateurs",
    itemLabel: "un modificateur",
    tabs: [{
      name: WEAPON_MODIFIERS_TAB,
      itemLabel: "un modificateur",
      // « Icône » vient après l'identifiant : ajoutée à droite des feuilles qui existaient déjà.
      headers: ["Nom", WEAPON_MODIFIER_TYPE_HEADER, "Description", WEAPON_MODIFIER_NUMBER_HEADER, WEAPON_MODIFIER_CHARGES_HEADER, WEAPON_MODIFIER_COLOR_HEADER, ID_HEADER, WEAPON_MODIFIER_ICON_HEADER],
      widths: [220, 150, 420, 110, 110, 120, 130, 90],
      idPrefix: "MOD",
    }],
  },
  // Les succès des joueurs et des MJ, et qui les a obtenus : l'accueil et le profil les
  // affichent en cartes. Rien n'y est écrit d'office : le classeur part vide.
  achievements: {
    key: "achievements",
    sheetName: "Index des succès",
    title: "Succès",
    path: "/ressources/index-des-succes",
    tabs: [
      { name: ACHIEVEMENTS_TAB, itemLabel: "un succès", headers: ["Nom", ACHIEVEMENT_TYPE_HEADER, ACHIEVEMENT_SUBTYPE_HEADER, ACHIEVEMENT_DESCRIPTION_HEADER, ACHIEVEMENT_ICON_HEADER, ACHIEVEMENT_COLOR_HEADER, ID_HEADER], widths: [240, 120, 170, 420, 150, 140, 130], idPrefix: "SUC" },
      { name: OBTAINED_TAB, itemLabel: "une attribution", headers: [OBTAINED_ACHIEVEMENT_HEADER, OBTAINED_PLAYER_HEADER, OBTAINED_BY_HEADER, OBTAINED_DATE_HEADER, OBTAINED_NOTE_HEADER, OBTAINED_ACCOUNT_HEADER, ID_HEADER], widths: [240, 200, 200, 130, 320, 220, 130], idPrefix: "OBT" },
    ],
  },
}


/** Les colonnes d'un personnage que l'Index des personnages lit : la feuille en a des centaines. */
export const characterIndexHeaders = ["ID", "Joueur", "Nom personnage", "Peuple", "Classe", "Level", "Titre honorifique", "Portrait"]

/** Les index d'entités, branchés sur le moteur : chacun garde sa feuille et ses pages. */
const entityIndexDefinitions: Record<EntityWorldIndexKey, WorldIndexDefinition> = {
  npcs: {
    key: "npcs",
    sheetName: "PNJs",
    title: "PNJs",
    path: "/ressources/index-des-pnjs",
    itemLabel: "un PNJ",
    tabs: [{ name: "PNJs", itemLabel: "un PNJ", headers: npcSheetHeaders, widths: npcSheetHeaders.map((header) => foldName(header) === foldName("Nom du PNJ") ? 240 : isLongColumn(header) ? 360 : 160), idPrefix: "PNJ" }],
    entity: {
      nameHeader: "Nom du PNJ",
      rowCommands: true,
      // Un PNJ ajouté depuis l'index rejoint sa bibliothèque, hors de toute campagne.
      addDefaults: { "Page lié": "index-des-pnjs", "Ajouté au créateur de session": "Non", "Dans le groupe joueur": "Non", "PNJ important": "Non" },
    },
  },
  campaigns: {
    key: "campaigns",
    sheetName: "Campagnes",
    title: "Campagnes",
    path: "/ressources/index-des-campagnes",
    itemLabel: "une campagne",
    tabs: [{ name: "Campagnes", itemLabel: "une campagne", headers: campaignSheetHeaders, widths: [160, 200, 280, 420, 260, 140], idPrefix: "CAM" }],
    entity: { nameHeader: "Nom de la campagne", nameHref: "/campagne/{id}", addHref: "/creation-de-campagne", trashKind: "campaign" },
  },
  characters: {
    key: "characters",
    sheetName: "Feuille de personnage",
    title: "Personnages",
    path: "/ressources/index-des-personnages",
    itemLabel: "un personnage",
    tabs: [{ name: "Personnages", itemLabel: "un personnage", headers: characterIndexHeaders, widths: [150, 190, 260, 180, 200, 90, 220, 200], idPrefix: "PER" }],
    entity: { nameHeader: "Nom personnage", nameHref: "/personnage/{id}", addHref: "/creation-de-personnage", readHeaders: characterIndexHeaders, trashKind: "character" },
  },
  classes: {
    key: "classes",
    sheetName: "Classes",
    title: "Classes",
    path: "/ressources/index-des-classes",
    itemLabel: "une classe",
    tabs: [{ name: "Classes", itemLabel: "une classe", headers: classSheetHeaders, widths: [130, 150, 240, 160, 180, 180, 180, 130, 110, 150, 150], idPrefix: "CLA" }],
    entity: { nameHeader: "Nom de la classe", nameHref: "/regles/classes/{id}", addHref: "/creation-de-classe" },
  },
  "class-spells": {
    key: "class-spells",
    sheetName: "Sorts de classe",
    title: "Sorts des classes",
    path: "/ressources/sorts-des-classes",
    itemLabel: "un sort",
    tabs: [{ name: "Sorts", itemLabel: "un sort", headers: spellSheetHeaders, widths: [130, 240, 380, 320, 190, 200, 160, 120], idPrefix: "SOR" }],
    entity: { nameHeader: "Nom", rowCommands: true },
  },
  "creature-spells": {
    key: "creature-spells",
    sheetName: "Index des créatures",
    title: "Sorts des créatures",
    path: "/ressources/sorts-des-creatures",
    itemLabel: "un sort",
    tabs: [{ name: "Sorts des créatures", itemLabel: "un sort", headers: spellSheetHeaders, widths: [130, 240, 380, 320, 190, 200, 160, 120], idPrefix: "SOR" }],
    entity: { nameHeader: "Nom", rowCommands: true },
  },
}

export const worldIndexDefinitions: Record<BuiltinWorldIndexKey, WorldIndexDefinition> = { ...worldBaseDefinitions, ...entityIndexDefinitions }

export function isEntityWorldIndexKey(value: unknown): value is EntityWorldIndexKey {
  return typeof value === "string" && value in entityIndexDefinitions
}

/**
 * Lignes de départ d'un index prévu par Eraser, écrites une seule fois, quand son
 * classeur vient d'être créé et que tous ses onglets sont vides : par onglet, une
 * ligne par objet « en-tête → valeur ». Gardées hors de la définition, qui est envoyée
 * telle quelle à la page (une fonction ne peut pas y voyager).
 */
export const worldIndexSeeds: Partial<Record<BuiltinWorldIndexKey, () => Record<string, Array<Record<string, string>>>>> = {
  skills: catalogSeedRows,
}

/**
 * Une colonne ajoutée après coup à un index déjà rempli, et ce qu'elle reçoit une seule
 * fois dans ses cases vides (la Couleur des caractéristiques d'origine). Comme les lignes
 * de départ, gardé hors de la définition envoyée à la page.
 */
export const worldIndexColumnFills: Partial<Record<BuiltinWorldIndexKey, Array<{ tab: string; column: string; valueFor: (row: Record<string, string>) => string }>>> = {
  skills: [{ tab: CHARACTERISTICS_TAB, column: CATALOG_COLOR_HEADER, valueFor: (row) => builtinCharacteristicColor(row[CATALOG_KEY_HEADER] ?? "") }],
}

/**
 * Un côté d'un lien. `tab: "*"` désigne n'importe quel onglet de l'index : un lieu
 * cité peut être une ville comme un pays. Une entité absente est alors créée dans
 * le premier onglet, d'où elle peut être déplacée.
 */
export type WorldIndexLinkEnd = { index: WorldIndexKey; tab: string; column: string }

/**
 * Colonnes qui se répondent. Écrire un nom d'un côté l'inscrit de l'autre, et crée
 * la ligne manquante au besoin : « x » en Descendant de « y » ajoute « y » aux
 * Ancêtres de « x ».
 */
export const worldIndexLinks: Array<[WorldIndexLinkEnd, WorldIndexLinkEnd]> = [
  [{ index: "religions", tab: "Religions", column: "Divinités" }, { index: "religions", tab: "Divinités", column: "Religion" }],
  [{ index: "peoples", tab: "Peuples", column: "Ancêtres" }, { index: "peoples", tab: "Peuples", column: "Descendant" }],
  [{ index: "peoples", tab: "Peuples", column: "Lieux" }, { index: "places", tab: "*", column: "Peuple" }],
  [{ index: "languages", tab: "Langues", column: "Langue-mère" }, { index: "languages", tab: "Langues", column: "Langue-fille" }],
  [{ index: "languages", tab: "Langues", column: "Lieu" }, { index: "places", tab: "*", column: "Langues" }],
  [{ index: "languages", tab: "Langues", column: "Peuple" }, { index: "peoples", tab: "Peuples", column: "Langues" }],
]

/** Ce côté de lien concerne-t-il cet onglet ? */
export function linkEndCovers(end: WorldIndexLinkEnd, index: WorldIndexKey, tab: string) {
  return end.index === index && (end.tab === "*" || end.tab === tab)
}

/** Les onglets réellement couverts par un côté de lien. */
export function linkEndTabs(end: WorldIndexLinkEnd) {
  return end.tab === "*" && isBuiltinWorldIndexKey(end.index) ? worldIndexDefinitions[end.index].tabs.map((tab) => tab.name) : [end.tab]
}

export function isBuiltinWorldIndexKey(value: unknown): value is BuiltinWorldIndexKey {
  return typeof value === "string" && Object.hasOwn(worldIndexDefinitions, value)
}

/** Deux colonnes qui se répondent. */
export type WorldIndexLink = [WorldIndexLinkEnd, WorldIndexLinkEnd]

/** Les colonnes d'un onglet que le code d'Eraser lit par leur nom, avec la raison. */
function builtinReaders(index: WorldIndexKey, tab: string, header: string): string[] {
  const folded = foldName(header)
  const reasons: string[] = []
  if (index === "creatures") {
    if (["portrait", "sorts actifs", "sorts passifs", "taille", "poids", "organisation", "langue", foldName(creatureNoteHeader), ...creatureCharacteristics.map(foldName), ...creatureGridHeaders.filter((item) => foldName(item) !== "extension").map(foldName)].includes(folded)) {
      reasons.push("La fiche des créatures lit cette colonne par son nom et l’affiche avec un champ prévu pour elle.")
    }
    if (folded === "sorts actifs" || folded === "sorts passifs") reasons.push("La fusion des sorts (Index des sorts) renomme les sorts cités dans cette colonne.")
    if (folded === "portrait") reasons.push("Le token d’une créature est fabriqué à partir de ce portrait.")
    if (Object.keys(creatureChoices).some((choice) => foldName(choice) === folded)) reasons.push("« Corriger les fautes » compare cette colonne à sa liste de choix.")
  }
  if (index === "achievements") {
    const cards = "L’accueil et le profil affichent les succès en cartes à partir de cette colonne."
    if (tab === ACHIEVEMENTS_TAB && folded === foldName(ACHIEVEMENT_TYPE_HEADER)) reasons.push("L’accueil montre les succès Joueur en vue joueur et les succès MJ en vue MJ ; le profil les range par type.")
    if (tab === ACHIEVEMENTS_TAB && [ACHIEVEMENT_ICON_HEADER, ACHIEVEMENT_COLOR_HEADER, ACHIEVEMENT_DESCRIPTION_HEADER].some((header) => foldName(header) === folded)) reasons.push(cards)
    if (tab === OBTAINED_TAB && folded === foldName(OBTAINED_ACHIEVEMENT_HEADER)) reasons.push("Relie chaque attribution à son succès, par son nom (renommer un succès renomme aussi ses attributions).")
    if (tab === OBTAINED_TAB && folded === foldName(OBTAINED_ACCOUNT_HEADER)) reasons.push("L’identifiant du compte qui a obtenu le succès : écrit par « Attribuer un succès », il retrouve le joueur même s’il change de pseudo.")
    if (tab === OBTAINED_TAB && [OBTAINED_PLAYER_HEADER, OBTAINED_BY_HEADER, OBTAINED_DATE_HEADER].some((header) => foldName(header) === folded)) reasons.push("Écrite par « Attribuer un succès » et affichée sur la carte du succès obtenu.")
  }
  if (index === "states") {
    if (tab === EFFECTS_TAB && [EFFECT_TARGET_HEADER, EFFECT_CHANGE_HEADER].some((name) => foldName(name) === folded)) reasons.push("La fiche de personnage applique l’effet d’un état posé aux cibles : +10 / -30 ajoutent, =100 remplace, ≥1 / ≤50 bornent, tant que l’état est posé. Des dés (-1d20+20 : retire le total de 1d20+20) se lancent depuis la fiche.")
    if (tab === EFFECTS_TAB && folded === foldName(EFFECT_RETRIGGER_HEADER)) reasons.push("La fiche de personnage écrit l’effet coché pour de bon quand l’état est posé, monte à ce niveau ou qu’on reclique sur le niveau en cours.")
    if (tab === EFFECTS_TAB && folded === foldName(EFFECT_ROLL_HEADER)) reasons.push("Le jet lancé depuis la fiche (« 1d20 16-20 ») : dans la plage, le changement de valeur s’applique ; vide, l’effet n’a pas de jet.")
    if (tab === EFFECTS_TAB && [EFFECT_COLOR_HEADER, EFFECT_IMAGE_HEADER].some((name) => foldName(name) === folded)) reasons.push("La fiche de personnage teinte le portrait de cette couleur (ou y pose cette image) tant que l’effet est en vigueur.")
    if (tab === EFFECTS_TAB && [EFFECT_PAGE_HEADER, ...EFFECT_PAGE_LEGACY_HEADERS].some((name) => foldName(name) === folded)) reasons.push("La fiche de personnage applique la couleur de l’effet là où c’est choisi : page entière, compétences liées, portrait.")
    if (tab === EFFECTS_TAB && folded === foldName(EFFECT_FX_HEADER)) reasons.push("La fiche de personnage dessine ces FX (codés dans Eraser) là où « FX appliqué à » le dit.")
    if (tab === EFFECTS_TAB && folded === foldName(EFFECT_FX_APPLY_HEADER)) reasons.push("La fiche de personnage dessine les FX de l’effet là où c’est choisi : page entière, compétences liées, portrait.")
    if (tab === STATES_TAB && STATE_LEVEL_HEADERS.some((name) => foldName(name) === folded)) reasons.push("La fiche de personnage applique les effets liés au niveau atteint par l’état.")
  }
  if (isEntityWorldIndexKey(index)) reasons.push(...entityReaders(index, header))
  if (index === "skills") {
    if (folded === foldName(CATALOG_TYPE_HEADER)) reasons.push("La fiche de personnage range chaque caractéristique d’après cette colonne : Principale (une carte avec ses compétences) ou Secondaire (une case en haut de la fiche).")
    if (folded === foldName(CATALOG_CHARACTERISTIC_HEADER)) reasons.push("La fiche de personnage range chaque compétence sous cette caractéristique et calcule son total à partir d’elle.")
    if (folded === foldName(CATALOG_DEFAULT_HEADER)) reasons.push("La fiche de personnage écrit cette valeur à la création d’un personnage, et dans les fiches existantes quand la ligne est ajoutée.")
    if (folded === foldName(CATALOG_COLOR_HEADER)) reasons.push("La fiche de personnage colore la carte (principale) ou la case (secondaire) de la caractéristique avec cette couleur.")
    if (folded === foldName(CATALOG_KEY_HEADER)) reasons.push("Relie les lignes d’origine aux colonnes déjà remplies de la feuille de personnage. Vide pour une ligne ajoutée : son ID fait ce lien.")
  }
  return reasons
}

/** Pourquoi le code d'Eraser lit une colonne d'un index d'entités (son verrou dans « Modifier »). */
function entityReaders(index: EntityWorldIndexKey, header: string): string[] {
  const among = (headers: readonly string[]) => headers.some((candidate) => foldName(candidate) === foldName(header))
  if (index === "npcs" && among(npcSheetHeaders)) return ["Les PNJ des campagnes, les sessions, le groupe des joueurs, les tokens du tabletop et le pont Roll20 lisent cette colonne par son nom."]
  if (index === "campaigns" && among(campaignSheetHeaders)) return ["Les campagnes (tableau de bord, accès des joueurs, couleur, bannière) lisent cette colonne par son nom."]
  if (index === "characters" && among(characterIndexHeaders)) return ["La fiche de personnage, les campagnes et le tabletop lisent cette colonne par son nom."]
  if (index === "classes" && among(classSheetHeaders)) return ["Les pages de classes, la création de personnage et les statistiques lisent cette colonne par son nom."]
  if ((index === "class-spells" || index === "creature-spells") && (among(spellSheetHeaders) || /^CLA-/i.test(header.trim()))) return ["Les fiches de classe, les créatures, les PNJ et les personnages retrouvent les sorts par cette colonne (rangs des classes compris)."]
  return []
}

/**
 * Ce qu'on peut changer sur une colonne d'un index du monde, et pourquoi pas le reste.
 * `links` : les liens de l'index (prévus par Eraser et créés dans l'éditeur).
 */
export function worldColumnPolicy(index: WorldIndexKey, tab: string, header: string, links: WorldIndexLink[]): ColumnPolicy {
  const all = "Tout : nom, type, réglages, suppression."
  const only = "Seulement la description et l’option « Masquée »."
  if (isIdHeader(header)) return { rename: false, type: false, remove: false, reasons: ["Généré par Eraser pour reconnaître chaque ligne (et masqué d’office)."], allowed: only }
  if (isNameColumn(header)) return { rename: false, type: false, remove: false, reasons: ["Chaque ligne est retrouvée par son nom : colonnes liées, listes liées (le Peuple des PNJ…), Recherche, Agrégat et création de personnage (Peuples) en dépendent."], allowed: only }
  const pair = links.find(([end]) => linkEndCovers(end, index, tab) && foldName(end.column) === foldName(header))
  if (pair) {
    const other = pair[1]
    const where = isBuiltinWorldIndexKey(other.index) ? worldIndexDefinitions[other.index].title : other.index
    return { rename: false, type: false, remove: false, reasons: [`Répond à « ${other.column} » (${where}${other.tab === "*" ? "" : `, onglet ${other.tab}`}) : les deux colonnes se recopient par leur nom. Changer son nom, son type ou la supprimer couperait le lien.`], allowed: only }
  }
  const readers = builtinReaders(index, tab, header)
  if (readers.length) return { rename: false, type: false, remove: false, reasons: readers, allowed: only }
  return { rename: true, type: true, remove: true, reasons: [], allowed: all }
}


/** « Aldor, Vesna ; Tharn » → trois noms. Doublons retirés, casse d'origine conservée. */
export function splitNames(value: string) {
  const seen = new Set<string>()
  return value.split(/[,;\n]+/).map((name) => name.replace(/\s+/g, " ").trim()).filter((name) => {
    const folded = foldName(name)
    if (!folded || seen.has(folded)) return false
    seen.add(folded)
    return true
  })
}

/**
 * La colonne du nom d'une ligne : « Nom », ou le nom historique de celle des index
 * d'entités (« Nom du PNJ », « Nom de la campagne »…), que leurs feuilles gardent.
 */
const entityNameHeaders = new Set(["Nom du PNJ", "Nom de la campagne", "Nom personnage", "Nom de la classe", "Nom du sort"].map(foldName))

export function isNameColumn(header: string) {
  const folded = foldName(header)
  return folded === "nom" || entityNameHeaders.has(folded)
}

/** La colonne du nom parmi des en-têtes : « Nom » d'abord, sinon celle d'un index d'entités. */
export function nameColumnIndex(headers: readonly string[]) {
  const exact = headers.findIndex((header) => foldName(header) === "nom")
  return exact >= 0 ? exact : headers.findIndex((header) => isNameColumn(header))
}

/** Colonnes de liste de noms : saisies en texte brut pour que les liens restent lisibles. */
export function linkedColumnsOf(index: WorldIndexKey, tab: string) {
  return worldIndexLinks.flatMap((pair) => pair.filter((end) => linkEndCovers(end, index, tab)).map((end) => end.column))
}

/** Anciennes colonnes des créatures : sorties de la fiche, elles gardent leur contenu dans Sheets. */
export const creatureArchivedHeaders = ["Environnement", "Climat", "Sous-type secondaire", "Rencontre", "Perception"]

/** Les champs de la fiche d'une créature qui ne sont que du texte enrichi. */
const creatureFormTexts = ["Taille", "Poids", creatureNoteHeader]

function isHeader(header: string, candidates: string[]) {
  const folded = foldName(header)
  return candidates.some((candidate) => foldName(candidate) === folded)
}

/**
 * Le type de chaque colonne d'un index du monde, reconnu par son en-tête. Une colonne
 * ajoutée à la main dans Sheets est du texte enrichi, la norme.
 */
export function worldColumnSpec(index: WorldIndexKey, tab: string, header: string): IndexColumnSpec {
  // L'identifiant est utile à Eraser, rarement à l'écran : il est masqué d'office.
  if (isIdHeader(header)) return { kind: "id", hidden: true }
  // Tous les noms ouvrent la fiche de leur ligne (Nom formulaire).
  if (isNameColumn(header)) return { kind: "name-form", also: ["fixed"] }
  if (isEntityWorldIndexKey(index)) return entityColumnSpec(index, header)
  if (linkedColumnsOf(index, tab).some((column) => foldName(column) === foldName(header))) return { kind: "linked", also: ["rich"] }
  if (index === "achievements") {
    if (tab === OBTAINED_TAB) {
      if (isHeader(header, [OBTAINED_ACHIEVEMENT_HEADER])) return { kind: "linked-choice", source: { index: "achievements", tab: ACHIEVEMENTS_TAB, onlyTab: true } }
      if (isHeader(header, [OBTAINED_ACCOUNT_HEADER])) return { kind: "rich", hidden: true }
      return { kind: "rich" }
    }
    if (isHeader(header, [ACHIEVEMENT_TYPE_HEADER])) return { kind: "choice", options: [{ value: "Joueur", color: achievementTypeColors.Joueur }, { value: "MJ", color: achievementTypeColors.MJ }] }
    if (isHeader(header, [ACHIEVEMENT_SUBTYPE_HEADER])) return { kind: "choice", allowCustom: true, options: achievementSubtypes.map((value) => ({ value })) }
    if (isHeader(header, [ACHIEVEMENT_ICON_HEADER])) return { kind: "file", file: { accept: "image" } }
    if (isHeader(header, [ACHIEVEMENT_COLOR_HEADER])) return { kind: "color" }
    return { kind: "rich" }
  }
  if (index === "states") {
    if (tab === EFFECTS_TAB) {
      // Les caractéristiques et compétences visées : les deux onglets de leur index.
      if (isHeader(header, [EFFECT_TARGET_HEADER])) return { kind: "linked-choice", multiple: true, source: { index: "skills", tab: CHARACTERISTICS_TAB, extra: [CURRENT_LIFE_TARGET] } }
      if (isHeader(header, [EFFECT_COLOR_HEADER])) return { kind: "color" }
      // « +10 », « =100 », « ≥1 », « -1d20+20 » : du texte, lu par lib/state-change.
      if (isHeader(header, [EFFECT_CHANGE_HEADER])) return { kind: "rich", description: EFFECT_CHANGE_DESCRIPTION }
      if (isHeader(header, [EFFECT_ROLL_HEADER])) return { kind: "rich", description: EFFECT_ROLL_DESCRIPTION }
      if (isHeader(header, [EFFECT_RETRIGGER_HEADER, "Redéclencher", "Redéclancher l'effet"])) return { kind: "checkbox", description: EFFECT_RETRIGGER_DESCRIPTION }
      if (isHeader(header, [EFFECT_IMAGE_HEADER])) return { kind: "file", file: { accept: "image" } }
      if (isHeader(header, [EFFECT_PAGE_HEADER, ...EFFECT_PAGE_LEGACY_HEADERS])) return { kind: "choice", multiple: true, options: EFFECT_APPLY_OPTIONS.map((value) => ({ value })) }
      if (isHeader(header, [EFFECT_FX_HEADER])) return { kind: "choice", multiple: true, options: stateFxList.map((fx) => ({ value: fx.value })) }
      if (isHeader(header, [EFFECT_FX_APPLY_HEADER])) return { kind: "choice", multiple: true, options: EFFECT_APPLY_OPTIONS.map((value) => ({ value })) }
      return { kind: "rich" }
    }
    if (isHeader(header, [...STATE_LEVEL_HEADERS])) return { kind: "linked-choice", multiple: true, source: { index: "states", tab: EFFECTS_TAB, onlyTab: true } }
    return { kind: "rich" }
  }
  if (index === "weapon-modifiers") {
    if (isHeader(header, [WEAPON_MODIFIER_TYPE_HEADER])) return { kind: "tab-sort", description: "Rune, Matériau, Attribut… Chaque valeur a son onglet, où la ligne apparaît aussi ; elle reste dans « Tout »." }
    if (isHeader(header, [WEAPON_MODIFIER_NUMBER_HEADER])) return { kind: "number", description: "Le % de chance d’un matériau ou d’un attribut (vide : chance normale), le nombre de runes d’un palier." }
    if (isHeader(header, [WEAPON_MODIFIER_CHARGES_HEADER])) return { kind: "number", description: "Les charges ajoutées à l’arme ; vide : pas de charge." }
    if (isHeader(header, [WEAPON_MODIFIER_COLOR_HEADER])) return { kind: "color" }
    if (isHeader(header, [WEAPON_MODIFIER_ICON_HEADER, "Icone"])) return { kind: "glyph", description: "La petite icône affichée devant le nom (inventaires, magasins, survols)." }
    return { kind: "rich" }
  }
  if (index === "skills") {
    if (isHeader(header, [CATALOG_TYPE_HEADER])) return { kind: "choice", options: [{ value: PRINCIPAL_LABEL, color: "#397f88" }, { value: SECONDARY_LABEL, color: "#b48745" }] }
    // Une compétence dépend d'une caractéristique principale : les secondaires ne sont pas proposées.
    if (isHeader(header, [CATALOG_CHARACTERISTIC_HEADER])) return { kind: "linked-choice", source: { index: "skills", tab: CHARACTERISTICS_TAB, onlyTab: true, exclude: { column: CATALOG_TYPE_HEADER, value: SECONDARY_LABEL } } }
    if (isHeader(header, [CATALOG_COLOR_HEADER])) return { kind: "color" }
    if (isHeader(header, [CATALOG_DEFAULT_HEADER])) return tab === SKILLS_TAB ? { kind: "number" } : { kind: "rich" }
    if (isHeader(header, [CATALOG_KEY_HEADER])) return { kind: "rich", hidden: true, placement: "table" }
    return { kind: "rich" }
  }
  if (index === "creatures") {
    const form = !isHeader(header, creatureGridHeaders)
    if (isHeader(header, creatureArchivedHeaders)) return { kind: "archived" }
    const options = Object.entries(creatureChoices).find(([candidate]) => foldName(candidate) === foldName(header))?.[1]
    if (options) return { kind: "choice", options, form }
    if (foldName(header) === "dressable") return { kind: "checkbox" }
    if (foldName(header) === "portrait") return { kind: "file", file: { accept: "image" }, form: true }
    if (isHeader(header, ["Sorts actifs"])) return { kind: "spells", spells: { source: "creature", category: "actif" }, form: true }
    if (isHeader(header, ["Sorts passifs"])) return { kind: "spells", spells: { source: "creature", category: "passif" }, form: true }
    if (isHeader(header, creatureCharacteristics)) return { kind: "number", min: 0, max: 99999, form: true }
    if (isHeader(header, creatureFormTexts)) return { kind: "rich", form: true }
    return { kind: "rich", form }
  }
  return { kind: "rich" }
}

const spellTypeOptions = classSpellTypeSuggestions.map((value) => ({ value, color: classSpellCategoryTones[classSpellCategory(value)].background }))

/**
 * Le type des colonnes d'un index d'entités, modifiable dans « Modifier » comme pour tout
 * index. Seules les colonnes techniques (page d'un PNJ, compte d'un joueur, dates) sont
 * masquées : la grille les montre d'un clic. Dans le doute, une colonne reste un texte.
 */
function entityColumnSpec(index: EntityWorldIndexKey, header: string): IndexColumnSpec {
  const is = (...candidates: string[]) => isHeader(header, candidates)
  if (index === "npcs") {
    if (is("Page lié", "Inventaire JSON (archive)", "Créé le", "Modifié le", "Créé par", "Dossier")) return { kind: "rich", hidden: true }
    if (is("Ajouté au créateur de session", "Dans le groupe joueur")) return { kind: "checkbox", hidden: true }
    if (is("PNJ important")) return { kind: "checkbox" }
    if (is("Peuple")) return { kind: "linked-choice", source: { index: "peoples", tab: "Peuples" } }
    if (is("Vie actuelle", "Vie totale", "Rapidité", "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Capacité de combat", "Capacité de tir", "Capacité magique", "Force mentale", "Constitution")) return { kind: "number" }
    if (is("Sorts actifs")) return { kind: "spells", spells: { source: "creature", category: "actif" } }
    if (is("Sorts passifs")) return { kind: "spells", spells: { source: "creature", category: "passif" } }
    return { kind: "rich" }
  }
  if (index === "campaigns") {
    if (is("MJ")) return { kind: "rich", hidden: true }
    if (is("Couleur d’accent")) return { kind: "color" }
    return { kind: "rich" }
  }
  if (index === "characters") {
    if (is("Joueur")) return { kind: "rich", hidden: true }
    return { kind: "rich" }
  }
  if (index === "classes") {
    // Une vraie colonne Image : la case montre l'image actuelle de la classe (formule
    // =IMAGE, image dans la cellule ou fichier du Drive) ; en importer une la remplace.
    if (is("Image")) return { kind: "file", file: { accept: "image" }, description: "L’image de la classe. Importer une image (ou coller une adresse) la remplace dans la case." }
    if (is("Type")) return { kind: "choice", options: classTypeValues.map((value) => ({ value })) }
    if (is("Difficulté")) return { kind: "choice", options: classDifficultyValues.map((value) => ({ value })) }
    if (is("Couleur d’accent sombre", "Couleur d’accent clair")) return { kind: "color" }
    return { kind: "rich" }
  }
  // Sorts des classes et des créatures : une colonne par classe donne le rang du sort.
  if (/^CLA-/i.test(header.trim())) return { kind: "number", hidden: true, description: "Le rang du sort dans cette classe (vide : pas dans la classe)." }
  if (is("Type", "Type de sort")) return { kind: "choice", allowCustom: true, options: index === "creature-spells" ? spellTypeOptions.filter((option) => classSpellCategory(option.value) !== "bonus") : spellTypeOptions }
  return { kind: "rich" }
}

/** Les colonnes longues (récits) prennent plus de place dans le tableau et le formulaire. */
export function isLongColumn(header: string) {
  return /description|note|histoire|autre|organisation|rencontre/.test(foldName(header))
}

/**
 * Les colonnes montrées dans le tableau d'un onglet, parmi celles de la feuille. Une
 * colonne en double dans Sheets (deux « Comportement ») n'apparaît qu'une fois : c'est
 * la première qui est lue et écrite.
 */
export function gridHeadersOf(tab: WorldIndexTabDefinition, sheetHeaders: string[]) {
  if (!tab.gridHeaders) return sheetHeaders.map((_, index) => index)
  const visible = new Set(tab.gridHeaders.map(foldName))
  const hidden = new Set(tab.headers.map(foldName).filter((header) => !visible.has(header)))
  const seen = new Set<string>()
  return sheetHeaders.flatMap((header, index) => {
    const folded = foldName(header)
    if (hidden.has(folded) || seen.has(folded)) return []
    seen.add(folded)
    return [index]
  })
}
