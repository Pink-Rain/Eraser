/**
 * Icônes d'objets d'Eraser (style « croquis à l'encre »).
 *
 * Une icône se range dans la colonne « Icône » des index sous la forme
 * `eraser:<famille>/<nom>` et s'affiche depuis `public/icones/objets`.
 * Les anciennes icônes générées (émojis) et les cases vides sont recalculées
 * à la lecture ; une icône saisie à la main (un autre émoji, une image) est
 * toujours respectée.
 *
 * Règles de choix :
 * - arme ou bouclier : d'après le nom de l'arme ;
 * - autre objet : d'après le sous-type ; si le sous-type est vide, « Autre » ou
 *   « / », d'après le nom ; à défaut, l'icône la plus proche.
 */

export const OBJECT_ICON_PREFIX = "eraser:"

const WEAPONS: Array<[string, string[]]> = [
  ["arbalete", ["Arbalète"]],
  ["arbalete-a-repetition", ["Arbalète à répétition"]],
  ["arbalete-desclavagiste", ["Arbalète d'esclavagiste"]],
  ["arbalete-de-poing", ["Arbalète de poing"]],
  ["arbalete-marine", ["Arbalète marine"]],
  ["arc-classique", ["Arc classique", "Arc"]],
  ["arc-de-chasse", ["Arc de chasse"]],
  ["arc-long", ["Arc long"]],
  ["arc-lourd", ["Arc lourd"]],
  ["arc-triple", ["Arc triple"]],
  ["arcsay", ["Arc'Sây", "Arc'Säy", "Arc Say"]],
  ["sarbacane", ["Sarbacane"]],
  ["arquebuse", ["Arquebuse"]],
  ["mousquet", ["Mousquet"]],
  ["fusil-de-chasse", ["Fusil de chasse"]],
  ["pistolet-a-silex", ["Pistolet à silex", "Pistolet"]],
  ["tromblon", ["Tromblon"]],
  ["tromblon-superieur", ["Tromblon supérieur"]],
  ["canon", ["Canon"]],
  ["epee-batarde", ["Épée bâtarde", "Épée batarde"]],
  ["claymore", ["Claymore"]],
  ["flamberge", ["Flamberge"]],
  ["rapiere", ["Rapière"]],
  ["fleuret", ["Fleuret"]],
  ["cimeterre", ["Cimeterre"]],
  ["katana", ["Katana"]],
  ["wakizashi", ["Wakizashi"]],
  ["dague", ["Dague"]],
  ["dague-brise-epee", ["Dague brise-épée", "Dague briseépée", "Dague brisépée"]],
  ["poignard", ["Poignard"]],
  ["misericorde", ["Miséricorde"]],
  ["baionnette", ["Baïonnette"]],
  ["crochet-de-pirate", ["Crochet de pirate"]],
  ["hache-de-guerre", ["Hache de guerre"]],
  ["hachette", ["Hachette"]],
  ["marteau-de-guerre", ["Marteau de guerre"]],
  ["marteau-norhoi", ["Marteau Nor'Hoi", "Marteau Nor'Hois"]],
  ["morgenstern", ["Morgenstern"]],
  ["goupillon", ["Goupillon", "Goupillou"]],
  ["fleau", ["Fléau"]],
  ["lance", ["Lance"]],
  ["double-lance", ["Double lance"]],
  ["hallebarde", ["Hallebarde"]],
  ["naginata", ["Naginata"]],
  ["faux-de-guerre", ["Faux de guerre"]],
  ["harpon", ["Harpon"]],
  ["trident", ["Trident"]],
  ["trident-de-chasse", ["Trident de chasse"]],
  ["trident-electrique", ["Trident électrique"]],
  ["trident-rapide", ["Trident rapide"]],
  ["baton-de-combat", ["Bâton de combat"]],
  ["baton-de-chance", ["Bâton de chance"]],
  ["baton-de-deplacement", ["Bâton de déplacement"]],
  ["baton-de-guerison", ["Bâton de guérison"]],
  ["baton-redoutable", ["Bâton redoutable"]],
  ["bo-shurikens", ["Bo Shurikens", "Bo Shuriken"]],
  ["baguette-magique", ["Baguette magique"]],
  ["sceptre-de-canaliseur", ["Sceptre de canaliseur"]],
  ["sceptre-de-feu", ["Sceptre de feu"]],
  ["sceptre-de-lumiere", ["Sceptre de lumière"]],
  ["sceptre-du-mage", ["Sceptre du mage"]],
  ["sceptre-du-vent", ["Sceptre du vent"]],
  ["bouclier-a-pique", ["Bouclier à pique"]],
  ["bouclier-de-lumiere-ou-dombre", ["Bouclier de lumière ou d'ombre"]],
  ["bouclier-desarmant", ["Bouclier désarmant"]],
  ["bouclier-redempteur", ["Bouclier rédempteur"]],
  ["scutum", ["Scutum"]],
  ["shurikens", ["Shurikens", "Shuriken"]],
  ["bolas", ["Bolas"]],
  ["bolas-du-chasseur", ["Bolas du chasseur"]],
  ["boomerang", ["Boomerang"]],
  ["boomerang-a-lame", ["Boomerang à lame"]],
  ["lance-pierre", ["Lance-pierre", "Lance pierre"]],
  ["gant-fronde", ["Gant-Fronde", "Fronde"]],
  ["lasso", ["Lasso"]],
  ["fouet", ["Fouet"]],
  ["bague-cloutee", ["Bague cloutée", "Bague clouté"]],
  ["poing-de-metal", ["Poing de métal"]],
  ["gant-en-mousse", ["Gant en mousse"]],
  ["griffe-de-sang", ["Griffe de sang"]],
  ["griffe-du-tigre", ["Griffe du tigre"]],
  ["griffe-maudite", ["Griffe maudite"]],
]

const OTHER_ICONS = [
  "ecrits/parchemin-musical", "ecrits/parchemin-encyclopedique", "ecrits/parchemin-de-puissance",
  "ecrits/livre-de-competence", "ecrits/livre-de-talent", "ecrits/livre-de-culture",
  "equipement/amulette", "equipement/anneau", "equipement/armure-legere", "equipement/armure-intermediaire",
  "equipement/armure-lourde", "equipement/armure-pour-creature", "equipement/armure-speciale", "equipement/botte",
  "equipement/bracelet", "equipement/casque", "equipement/stockage", "equipement/autre",
  "ingredients/base", "ingredients/champignon", "ingredients/fleur", "ingredients/nourriture", "ingredients/gisement",
  "ingredients/minerai", "ingredients/plante", "ingredients/racine", "ingredients/reste", "ingredients/rune",
  "ingredients/materiaux", "ingredients/autre",
  "alchimie/elixirs", "alchimie/gaz", "alchimie/nourriture", "alchimie/onguent", "alchimie/physique", "alchimie/venin",
  "divers/munition", "divers/creature", "divers/bombe", "divers/transport", "divers/decoratif", "divers/utilitaire",
  "divers/survit", "divers/survie", "divers/outil", "divers/consommable", "divers/outils", "divers/ressources", "divers/decoration",
] as const

/** Toutes les icônes disponibles, par clé `famille/nom`. */
export const OBJECT_ICON_KEYS: ReadonlySet<string> = new Set([...WEAPONS.map(([slug]) => `armes/${slug}`), ...OTHER_ICONS])

/** Émojis que l'ancienne version d'Eraser posait automatiquement : ils sont remplacés. */
export const LEGACY_GENERATED_OBJECT_ICONS: ReadonlySet<string> = new Set(["💍", "📿", "🍴", "🛡️", "⚔️", "🧪", "📜", "📚", "🔧", "💣", "💎", "🧰", "📦", "🏹", "🗡️", "🔪", "🪓", "🔨", "🪄", "🔫", "🔱", "🪖", "🥋", "🦺", "🥾", "🧤", "🧥", "🪢", "📖", "📕", "⛏️", "🛠️", "🪵", "🌿", "🧵", "🍲", "🗝️", "🎒", "🪨", "👑", "🥽", "🎭", "🏮"])

export function normalizedIconText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const compact = (value: string) => normalizedIconText(value).replace(/ /g, "")

const weaponByCompactName = new Map<string, string>()
const weaponNames: Array<{ key: string; words: string }> = []
for (const [slug, names] of WEAPONS) {
  for (const name of names) {
    weaponByCompactName.set(compact(name), `armes/${slug}`)
    weaponNames.push({ key: `armes/${slug}`, words: normalizedIconText(name) })
  }
}
// Le nom le plus long l'emporte : « Arc de chasse » avant « Arc ».
weaponNames.sort((left, right) => right.words.length - left.words.length)

const has = (text: string, pattern: RegExp) => pattern.test(` ${text} `)

/** Arme d'après son nom : nom exact, puis nom d'arme contenu dans le nom. */
function weaponFromName(name: string, loose: boolean) {
  const exact = weaponByCompactName.get(compact(name))
  if (exact) return exact
  if (!loose) return ""
  const words = ` ${normalizedIconText(name)} `
  return weaponNames.find((candidate) => words.includes(` ${candidate.words} `))?.key || ""
}

/** Famille d'arme d'après le sous-type ou quelques mots du nom. */
function weaponFallback(text: string) {
  const rules: Array<[RegExp, string]> = [
    [/ arbalete/, "arbalete"],
    [/ (arc|arcs) /, "arc-classique"],
    [/ (pistolet|revolver) /, "pistolet-a-silex"],
    [/ (fusil|mousquet|carabine|poudre|arme a feu) /, "mousquet"],
    [/ (bouclier|ecu|pavois|secondaire) /, "scutum"],
    [/ (sceptre) /, "sceptre-du-mage"],
    [/ (baguette) /, "baguette-magique"],
    [/ (baton|batons|hast) /, "baton-de-combat"],
    [/ (lance|pique|javelot|epieu) /, "lance"],
    [/ trident /, "trident"],
    [/ (hache|haches) /, "hache-de-guerre"],
    [/ (marteau|masse|massue|maillet) /, "marteau-de-guerre"],
    [/ (fleau) /, "fleau"],
    [/ (dague|couteau|poignard|contact) /, "dague"],
    [/ (katana|sabre) /, "katana"],
    [/ (rapiere|escrime|fleuret) /, "rapiere"],
    [/ (paralysante|bolas) /, "bolas"],
    [/ (shuriken|shurikens|precision|lancer|jet) /, "shurikens"],
    [/ (griffe|griffes) /, "griffe-du-tigre"],
    [/ (mains nues|poing|gantelet) /, "poing-de-metal"],
    [/ (fouet) /, "fouet"],
  ]
  const rule = rules.find(([pattern]) => has(text, pattern))
  return `armes/${rule ? rule[1] : "epee-batarde"}`
}

const SUBTYPES: Record<string, string> = {
  "amulette": "equipement/amulette",
  "amulettes": "equipement/amulette",
  "collier": "equipement/amulette",
  "anneau": "equipement/anneau",
  "anneaux": "equipement/anneau",
  "bague": "equipement/anneau",
  "armure intermediaire": "equipement/armure-intermediaire",
  "armure moyenne": "equipement/armure-intermediaire",
  "armure legere": "equipement/armure-legere",
  "armure lourde": "equipement/armure-lourde",
  "armure pour creature": "equipement/armure-pour-creature",
  "armure de creature": "equipement/armure-pour-creature",
  "armure speciale": "equipement/armure-speciale",
  "botte": "equipement/botte",
  "bottes": "equipement/botte",
  "bracelet": "equipement/bracelet",
  "bracelets": "equipement/bracelet",
  "casque": "equipement/casque",
  "casques": "equipement/casque",
  "stockage": "equipement/stockage",
  "base": "ingredients/base",
  "champignon": "ingredients/champignon",
  "champignons": "ingredients/champignon",
  "fleur": "ingredients/fleur",
  "fleurs": "ingredients/fleur",
  "gisement": "ingredients/gisement",
  "gisements": "ingredients/gisement",
  "minerai": "ingredients/minerai",
  "minerais": "ingredients/minerai",
  "plante": "ingredients/plante",
  "plantes": "ingredients/plante",
  "racine": "ingredients/racine",
  "racines": "ingredients/racine",
  "reste": "ingredients/reste",
  "restes": "ingredients/reste",
  "rune": "ingredients/rune",
  "runes": "ingredients/rune",
  "materiau": "ingredients/materiaux",
  "materiaux": "ingredients/materiaux",
  "elexir": "alchimie/elixirs",
  "elexirs": "alchimie/elixirs",
  "elixir": "alchimie/elixirs",
  "elixirs": "alchimie/elixirs",
  "potion": "alchimie/elixirs",
  "potions": "alchimie/elixirs",
  "gaz": "alchimie/gaz",
  "onguent": "alchimie/onguent",
  "onguents": "alchimie/onguent",
  "physique": "alchimie/physique",
  "venin": "alchimie/venin",
  "venins": "alchimie/venin",
  "poison": "alchimie/venin",
  "poisons": "alchimie/venin",
  "munition": "divers/munition",
  "munitions": "divers/munition",
  "creature": "divers/creature",
  "creatures": "divers/creature",
  "bombe": "divers/bombe",
  "bombes": "divers/bombe",
  "transport": "divers/transport",
  "decoratif": "divers/decoratif",
  "decoratifs": "divers/decoratif",
  "utilitaire": "divers/utilitaire",
  "utilitaires": "divers/utilitaire",
  "survit": "divers/survit",
  "survie": "divers/survie",
  "outil": "divers/outil",
  "outils": "divers/outils",
  "consommable": "divers/consommable",
  "consommables": "divers/consommable",
  "ressource": "divers/ressources",
  "ressources": "divers/ressources",
  "decoration": "divers/decoration",
  "decorations": "divers/decoration",
  "musicaux": "ecrits/parchemin-musical",
  "musical": "ecrits/parchemin-musical",
  "musique": "ecrits/parchemin-musical",
  "encyclopedique": "ecrits/parchemin-encyclopedique",
  "encyclopediques": "ecrits/parchemin-encyclopedique",
  "puissance": "ecrits/parchemin-de-puissance",
  "sortilege": "ecrits/parchemin-de-puissance",
  "sortileges": "ecrits/parchemin-de-puissance",
  "competence": "ecrits/livre-de-competence",
  "competences": "ecrits/livre-de-competence",
  "apprentissage": "ecrits/livre-de-competence",
  "talent": "ecrits/livre-de-talent",
  "talents": "ecrits/livre-de-talent",
  "sort": "ecrits/livre-de-talent",
  "sorts": "ecrits/livre-de-talent",
  "culture": "ecrits/livre-de-culture",
  "lore": "ecrits/livre-de-culture",
}

/** Objet d'après son nom (ou, à défaut, son sous-type et son type). */
function iconFromWords(text: string) {
  const rules: Array<[RegExp, string]> = [
    [/ (bombe|bombes|grenade|explosif) /, "divers/bombe"],
    [/ (venin|poison|toxine) /, "alchimie/venin"],
    [/ (gaz|fumigene|fumee) /, "alchimie/gaz"],
    [/ (onguent|baume|pommade|cataplasme|pansement|bandage) /, "alchimie/onguent"],
    [/ (elixir|elixirs|elexir|elexirs|potion|potions|fiole|philtre|breuvage|tonique) /, "alchimie/elixirs"],
    [/ (parchemin|parchemins|rouleau|partition) /, "ecrits/parchemin-encyclopedique"],
    [/ (grimoire|grimoires) /, "ecrits/livre-de-talent"],
    [/ (manuel|traite) /, "ecrits/livre-de-competence"],
    [/ (livre|livres|ouvrage|tome|recueil|codex|carnet|journal|chronique) /, "ecrits/livre-de-culture"],
    [/ (amulette|collier|pendentif|medaillon|medailon|talisman|larme|colier) /, "equipement/amulette"],
    [/ (anneau|anneaux|bague|bagues|chevaliere) /, "equipement/anneau"],
    [/ (casque|heaume|capuche|chapeau|masque|masquez|couronne|diademe) /, "equipement/casque"],
    [/ (botte|bottes|chaussure|chaussures|bottine|sandale|sandales|soulier) /, "equipement/botte"],
    [/ (bracelet|bracelets|brassard|brassards|gant|gants|mitaine) /, "equipement/bracelet"],
    [/ (armure lourde|harnois|armure de plaque|plates) /, "equipement/armure-lourde"],
    [/ (armure legere|gambison|cuir) /, "equipement/armure-legere"],
    [/ (armure|plastron|cuirasse|cotte|brigandine) /, "equipement/armure-intermediaire"],
    [/ (sac|sacs|sacoche|besace|coffre|coffret|bourse|carquois|malle|poche) /, "equipement/stockage"],
    [/ (ceinture|baudrier|cape|manteau) /, "equipement/autre"],
    [/ (champignon|champignons|morille|truffe) /, "ingredients/champignon"],
    [/ (fleur|fleurs|petale|petales|rose|lys|nenuphar|pissenlit|lotus) /, "ingredients/fleur"],
    [/ (racine|racines|mandragore|tubercule|ecorce|ecorse) /, "ingredients/racine"],
    [/ (plante|plantes|herbe|herbes|feuille|feuilles|mousse|algue|seve) /, "ingredients/plante"],
    [/ (rune|runes|runique|runiques|glyphe|sceau) /, "ingredients/rune"],
    [/ (os|crane|dent|dents|croc|crocs|griffe|griffes|ecaille|ecailles|peau|plume|plumes|corne|oeil|sang|carcasse|reste|restes|coquillage|corail|graisse|larme|venin) /, "ingredients/reste"],
    [/ (minerai|lingot|lingots|pepite|metal|fer|argent|cuivre|acier) /, "ingredients/minerai"],
    [/ (gisement|filon|cristal|cristaux|gemme|gemmes|pierre|pierres|joyau|diamant|rubis|saphir|emeraude|sable|gravier|caillou|cailloux|galet|argile|ambre) /, "ingredients/gisement"],
    [/ (bois|baton|planche|planches|buche|tissu|etoffe|fil|corde|cordes|chanvre|laine|chaine) /, "ingredients/materiaux"],
    [/ (poudre|sel|farine|cendre|base) /, "ingredients/base"],
    [/ (soupe|ragout|repas|plat|infusion|the) /, "alchimie/nourriture"],
    [/ (pain|viande|fromage|pomme|fruit|fruits|ration|rations|nourriture|biere|vin|hydromel|gateau|poisson|miel) /, "ingredients/nourriture"],
    [/ (fleche|fleches|carreau|carreaux|balle|balles|munition|munitions|projectile) /, "divers/munition"],
    [/ (oeuf|oeufs|familier|creature|larve) /, "divers/creature"],
    [/ (cheval|monture|selle|chariot|charrette|barque|bateau|traineau) /, "divers/transport"],
    [/ (lanterne|lampe|torche|bougie|chandelle|longue vue|boussole|miroir|cle|cles|clef) /, "divers/utilitaire"],
    [/ (feu|briquet|silex|tente|campement) /, "divers/survie"],
    [/ (couverture|sac de couchage|paquetage|kit|trousse) /, "divers/survit"],
    [/ (pioche|pelle|pelles|pioches) /, "divers/outils"],
    [/ (outil|marteau|pince|scie|ciseau|crochet|crochets|aiguille) /, "divers/outil"],
    [/ (banniere|drapeau|tapisserie|etendard) /, "divers/decoration"],
    [/ (vase|statue|statuette|tableau|figurine|relique|bibelot|decor) /, "divers/decoratif"],
  ]
  const rule = rules.find(([pattern]) => has(text, pattern))
  return rule ? rule[1] : ""
}

/** Certains index rangent la vraie catégorie dans la colonne « Type ». */
const TYPE_CATEGORIES: Record<string, string> = {
  "rune": "ingredients/rune",
  "runes": "ingredients/rune",
  "nature": "ingredients/plante",
  "naturel": "ingredients/plante",
  "naturelle": "ingredients/plante",
  "plante": "ingredients/plante",
  "creature": "ingredients/reste",
  "nourriture": "ingredients/nourriture",
  "mineral": "ingredients/minerai",
  "minerai": "ingredients/minerai",
}

function objectFallback(type: string) {
  const text = normalizedIconText(type)
  if (TYPE_CATEGORIES[text]) return TYPE_CATEGORIES[text]
  if (/equipement|armure/.test(text)) return "equipement/autre"
  if (/consommable|alchimi/.test(text)) return "divers/consommable"
  if (/livre|ouvrage/.test(text)) return "ecrits/livre-de-culture"
  if (/parchemin/.test(text)) return "ecrits/parchemin-encyclopedique"
  if (/ressource|ingredient|materiau/.test(text)) return "ingredients/autre"
  return "ingredients/autre"
}

const isEmptySubtype = (subtype: string) => {
  const value = normalizedIconText(subtype)
  return !value || value === "autre" || value === "autres" || value === "divers"
}

/** Clé d'icône conseillée pour un objet (sans le préfixe `eraser:`). */
export function suggestedObjectIconKey(name: string, type: string, subtype: string) {
  const typeText = normalizedIconText(type)
  const subtypeText = normalizedIconText(subtype)
  const isWeapon = /\barmes?\b|bouclier/.test(typeText)
  // Les armes se reconnaissent à leur nom, même rangées ailleurs.
  const weapon = weaponFromName(name, isWeapon)
  if (weapon) return weapon
  if (isWeapon) return weaponFallback(` ${subtypeText} ${normalizedIconText(name)} `)

  if (!isEmptySubtype(subtype)) {
    if (subtypeText === "nourriture" || subtypeText === "nourritures") return /consommable|alchimi|potion/.test(typeText) ? "alchimie/nourriture" : "ingredients/nourriture"
    const direct = SUBTYPES[subtypeText]
    if (direct) return direct
  }
  const fromName = iconFromWords(` ${normalizedIconText(name)} `)
  if (fromName) return fromName
  const fromSubtype = iconFromWords(` ${subtypeText} `)
  if (fromSubtype) return fromSubtype
  return objectFallback(type)
}

export function suggestedObjectIcon(name: string, type: string, subtype: string) {
  return `${OBJECT_ICON_PREFIX}${suggestedObjectIconKey(name, type, subtype)}`
}

/** Une icône posée par Eraser (ancienne ou nouvelle), donc remplaçable sans perte. */
export function isGeneratedObjectIcon(icon: string) {
  const value = icon.trim()
  return !value || LEGACY_GENERATED_OBJECT_ICONS.has(value) || value.startsWith(OBJECT_ICON_PREFIX)
}

/** Icône à afficher : celle saisie à la main, sinon celle d'Eraser. */
export function resolvedObjectIcon(icon: string | undefined, name: string, type: string, subtype: string) {
  const value = (icon || "").trim()
  if (value.startsWith(OBJECT_ICON_PREFIX) && OBJECT_ICON_KEYS.has(value.slice(OBJECT_ICON_PREFIX.length))) return value
  if (isGeneratedObjectIcon(value)) return suggestedObjectIcon(name, type, subtype)
  return value
}

/** Adresse de l'image d'une icône Eraser, ou chaîne vide pour un émoji. */
export function objectIconSource(icon: string) {
  if (!icon.startsWith(OBJECT_ICON_PREFIX)) return ""
  const key = icon.slice(OBJECT_ICON_PREFIX.length)
  return OBJECT_ICON_KEYS.has(key) ? `/icones/objets/${key}.webp` : ""
}
