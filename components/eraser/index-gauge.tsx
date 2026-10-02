"use client"

import { memo, useEffect, useState, type ComponentType, type ReactNode } from "react"
import {
  Anchor, Apple, Atom, Award, Axe, Baby, Banana, Bandage, Banknote, Battery, BatteryFull, Bean, Beef, Beer, Bell, Biohazard, Bird, Bomb, Bone, BookOpen, Brain, Bug, Candy, Carrot, Castle, Cat, Cherry, Church, Circle, Clock, Cloud, CloudLightning, Clover, Coins, Compass, Cookie, Cross, Crosshair, Crown, Diamond, Dices, Dna, Dog, Droplet, Droplets, Drumstick, Egg, Eye, EyeOff, Feather, Fingerprint, Fish, Flag, FlaskConical, Flame, Flower, Flower2, Footprints, Frown, Gavel, Gem, Ghost, Gift, Glasses, Grape, Hammer, Hand, HandHeart, Heart, HeartCrack, HeartPulse, Hexagon, Hourglass, Key, Landmark, Laugh, Leaf, Lock, Map as MapIcon, Medal, Minus, Moon, Mountain, MountainSnow, Music, Octagon, Orbit, PawPrint, Pentagon, Pickaxe, PiggyBank, Pill, Plus, Rabbit, Radiation, Rainbow, Rat, Rocket, Scale, Scroll, Shell, Shield, ShieldHalf, Ship, Shovel, Skull, Smile, Snail, Snowflake, Sparkle, Sparkles, Sprout, Square, Squirrel, Star, StarHalf, Sun, Sunrise, Sunset, Sword, Swords, Syringe, Target, Tent, Tornado, TreePine, Trees, Triangle, Trophy, Turtle, Umbrella, User, Users, WandSparkles, Waves, Wheat, Wind, Wine, Worm, Wrench, X, Zap,
  Palette,
  Activity, AlarmClock, Angry, Annoyed, ArrowBigDown, ArrowBigUp, Ban, Bed, BedDouble, BellOff, BellRing, BicepsFlexed, Bot, BrainCircuit, BrainCog, BugOff, ChevronsDown, ChevronsUp, Cigarette, CircleAlert, CircleOff, CloudFog, CloudRain, CloudSnow, Cloudy, Coffee, Dice6, Drama, Dumbbell, Ear, EarOff, Eclipse, EyeClosed, FlagOff, FlameKindling, FlaskRound, Gauge, GlassWater, Grab, Ham, HandHelping, Handshake, Haze, HeartHandshake, HeartOff, Infinity, KeyRound, Lightbulb, LightbulbOff, Link, Link2, LockOpen, Magnet, Megaphone, Meh, MessageCircleOff, MicOff, Microscope, MoonStar, OctagonAlert, PersonStanding, Puzzle, Repeat, Rose, RotateCw, ScanEye, ScrollText, ShieldAlert, ShieldCheck, ShieldOff, ShieldPlus, ShieldX, Siren, SmilePlus, Soup, Speech, Stars, Stethoscope, SunDim, Tablets, TestTube, TestTubes, Thermometer, ThermometerSnowflake, ThermometerSun, Timer, TriangleAlert, Unlink, Unplug, UserCheck, UserMinus, UserX, UtensilsCrossed, VenetianMask, VolumeX, Weight, ZapOff,
  type LucideProps,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { foldName, formatGaugeCell, gaugeScaleOf, parseGaugeCell, type GaugeRowStyle, type GaugeSettings } from "@/lib/index-columns"

/** Les couleurs proposées pour une ligne d'une jauge « par ligne ». */
const rowColors = ["#b9504e", "#c2410c", "#b8872a", "#4d7c0f", "#397f88", "#285f8f", "#6b21a8", "#78716c"]

type IconEntry = { name: string; label: string; Icon: ComponentType<LucideProps>; keywords?: string }

/**
 * Les icônes proposées pour les jauges et les boutons, avec leur nom français pour la
 * recherche. On peut aussi mettre un émoji ou n'importe quel caractère à la place.
 */
export const indexIcons: IconEntry[] = [
  { name: "sparkle", label: "Étincelle", Icon: Sparkle, keywords: "charge magie" },
  { name: "sparkles", label: "Étincelles", Icon: Sparkles },
  { name: "star", label: "Étoile", Icon: Star, keywords: "note" },
  { name: "star-half", label: "Demi-étoile", Icon: StarHalf },
  { name: "heart", label: "Cœur", Icon: Heart, keywords: "coeur vie pv" },
  { name: "heart-crack", label: "Cœur brisé", Icon: HeartCrack, keywords: "coeur" },
  { name: "heart-pulse", label: "Pouls", Icon: HeartPulse, keywords: "vie santé" },
  { name: "flag", label: "Drapeau", Icon: Flag },
  { name: "skull", label: "Tête de mort", Icon: Skull, keywords: "mort crane danger" },
  { name: "cross", label: "Croix", Icon: Cross, keywords: "église soin" },
  { name: "x", label: "Croix (×)", Icon: X, keywords: "échec" },
  { name: "sprout", label: "Pousse", Icon: Sprout, keywords: "graine plante" },
  { name: "bean", label: "Graine", Icon: Bean, keywords: "haricot semence" },
  { name: "wheat", label: "Blé", Icon: Wheat, keywords: "récolte graine" },
  { name: "leaf", label: "Feuille", Icon: Leaf },
  { name: "clover", label: "Trèfle", Icon: Clover, keywords: "chance" },
  { name: "flower", label: "Fleur", Icon: Flower },
  { name: "flower-2", label: "Fleur (2)", Icon: Flower2 },
  { name: "tree", label: "Sapin", Icon: TreePine, keywords: "arbre forêt" },
  { name: "trees", label: "Forêt", Icon: Trees, keywords: "arbres" },
  { name: "droplet", label: "Goutte", Icon: Droplet, keywords: "eau sang mana" },
  { name: "droplets", label: "Gouttes", Icon: Droplets },
  { name: "flame", label: "Flamme", Icon: Flame, keywords: "feu" },
  { name: "zap", label: "Éclair", Icon: Zap, keywords: "énergie" },
  { name: "snowflake", label: "Flocon", Icon: Snowflake, keywords: "froid glace" },
  { name: "sun", label: "Soleil", Icon: Sun },
  { name: "moon", label: "Lune", Icon: Moon, keywords: "nuit" },
  { name: "cloud", label: "Nuage", Icon: Cloud },
  { name: "storm", label: "Orage", Icon: CloudLightning },
  { name: "wind", label: "Vent", Icon: Wind },
  { name: "tornado", label: "Tornade", Icon: Tornado },
  { name: "waves", label: "Vagues", Icon: Waves, keywords: "mer eau" },
  { name: "rainbow", label: "Arc-en-ciel", Icon: Rainbow },
  { name: "sunrise", label: "Aube", Icon: Sunrise },
  { name: "sunset", label: "Crépuscule", Icon: Sunset },
  { name: "mountain", label: "Montagne", Icon: Mountain },
  { name: "mountain-snow", label: "Pic enneigé", Icon: MountainSnow },
  { name: "shield", label: "Bouclier", Icon: Shield, keywords: "armure défense" },
  { name: "shield-half", label: "Demi-bouclier", Icon: ShieldHalf },
  { name: "sword", label: "Épée", Icon: Sword, keywords: "arme attaque" },
  { name: "swords", label: "Épées croisées", Icon: Swords, keywords: "combat" },
  { name: "axe", label: "Hache", Icon: Axe },
  { name: "hammer", label: "Marteau", Icon: Hammer },
  { name: "pickaxe", label: "Pioche", Icon: Pickaxe },
  { name: "shovel", label: "Pelle", Icon: Shovel },
  { name: "wrench", label: "Clé à molette", Icon: Wrench },
  { name: "bomb", label: "Bombe", Icon: Bomb },
  { name: "target", label: "Cible", Icon: Target },
  { name: "crosshair", label: "Viseur", Icon: Crosshair },
  { name: "wand", label: "Baguette", Icon: WandSparkles, keywords: "magie sort" },
  { name: "potion", label: "Potion", Icon: FlaskConical, keywords: "fiole alchimie" },
  { name: "pill", label: "Pilule", Icon: Pill },
  { name: "syringe", label: "Seringue", Icon: Syringe },
  { name: "bandage", label: "Bandage", Icon: Bandage, keywords: "soin" },
  { name: "biohazard", label: "Danger biologique", Icon: Biohazard, keywords: "poison maladie" },
  { name: "radiation", label: "Radiation", Icon: Radiation },
  { name: "crown", label: "Couronne", Icon: Crown, keywords: "roi noblesse" },
  { name: "gem", label: "Gemme", Icon: Gem, keywords: "joyau" },
  { name: "diamond", label: "Losange", Icon: Diamond },
  { name: "coins", label: "Pièces", Icon: Coins, keywords: "argent or" },
  { name: "banknote", label: "Billet", Icon: Banknote },
  { name: "piggy-bank", label: "Tirelire", Icon: PiggyBank },
  { name: "trophy", label: "Trophée", Icon: Trophy },
  { name: "medal", label: "Médaille", Icon: Medal },
  { name: "award", label: "Récompense", Icon: Award },
  { name: "gift", label: "Cadeau", Icon: Gift },
  { name: "key", label: "Clé", Icon: Key },
  { name: "lock", label: "Cadenas", Icon: Lock },
  { name: "scroll", label: "Parchemin", Icon: Scroll },
  { name: "book", label: "Livre", Icon: BookOpen },
  { name: "map", label: "Carte", Icon: MapIcon },
  { name: "compass", label: "Boussole", Icon: Compass },
  { name: "anchor", label: "Ancre", Icon: Anchor },
  { name: "ship", label: "Navire", Icon: Ship },
  { name: "rocket", label: "Fusée", Icon: Rocket },
  { name: "tent", label: "Tente", Icon: Tent, keywords: "camp repos" },
  { name: "castle", label: "Château", Icon: Castle },
  { name: "church", label: "Temple", Icon: Church, keywords: "église religion" },
  { name: "landmark", label: "Monument", Icon: Landmark },
  { name: "scale", label: "Balance", Icon: Scale, keywords: "justice" },
  { name: "gavel", label: "Marteau de juge", Icon: Gavel },
  { name: "bell", label: "Cloche", Icon: Bell },
  { name: "clock", label: "Horloge", Icon: Clock, keywords: "temps tour" },
  { name: "hourglass", label: "Sablier", Icon: Hourglass, keywords: "temps durée" },
  { name: "music", label: "Note de musique", Icon: Music },
  { name: "dice", label: "Dés", Icon: Dices, keywords: "hasard jet" },
  { name: "eye", label: "Œil", Icon: Eye, keywords: "oeil perception" },
  { name: "eye-off", label: "Œil barré", Icon: EyeOff, keywords: "caché invisible" },
  { name: "glasses", label: "Lunettes", Icon: Glasses },
  { name: "brain", label: "Cerveau", Icon: Brain, keywords: "esprit folie intelligence" },
  { name: "ghost", label: "Fantôme", Icon: Ghost, keywords: "esprit mort-vivant" },
  { name: "bone", label: "Os", Icon: Bone },
  { name: "footprints", label: "Empreintes", Icon: Footprints, keywords: "pas déplacement" },
  { name: "paw", label: "Patte", Icon: PawPrint, keywords: "animal bête" },
  { name: "hand", label: "Main", Icon: Hand },
  { name: "hand-heart", label: "Main et cœur", Icon: HandHeart, keywords: "soin aide" },
  { name: "fingerprint", label: "Empreinte", Icon: Fingerprint },
  { name: "feather", label: "Plume", Icon: Feather },
  { name: "bird", label: "Oiseau", Icon: Bird },
  { name: "fish", label: "Poisson", Icon: Fish },
  { name: "shell", label: "Coquillage", Icon: Shell },
  { name: "bug", label: "Insecte", Icon: Bug },
  { name: "worm", label: "Ver", Icon: Worm },
  { name: "snail", label: "Escargot", Icon: Snail },
  { name: "rat", label: "Rat", Icon: Rat },
  { name: "rabbit", label: "Lapin", Icon: Rabbit },
  { name: "squirrel", label: "Écureuil", Icon: Squirrel },
  { name: "turtle", label: "Tortue", Icon: Turtle },
  { name: "cat", label: "Chat", Icon: Cat },
  { name: "dog", label: "Chien", Icon: Dog },
  { name: "egg", label: "Œuf", Icon: Egg, keywords: "oeuf" },
  { name: "apple", label: "Pomme", Icon: Apple, keywords: "nourriture ration" },
  { name: "carrot", label: "Carotte", Icon: Carrot },
  { name: "cherry", label: "Cerise", Icon: Cherry },
  { name: "grape", label: "Raisin", Icon: Grape },
  { name: "banana", label: "Banane", Icon: Banana },
  { name: "beef", label: "Viande", Icon: Beef },
  { name: "drumstick", label: "Cuisse", Icon: Drumstick },
  { name: "cookie", label: "Biscuit", Icon: Cookie },
  { name: "candy", label: "Bonbon", Icon: Candy },
  { name: "beer", label: "Bière", Icon: Beer, keywords: "taverne" },
  { name: "wine", label: "Vin", Icon: Wine },
  { name: "umbrella", label: "Parapluie", Icon: Umbrella },
  { name: "user", label: "Personne", Icon: User },
  { name: "users", label: "Groupe", Icon: Users },
  { name: "baby", label: "Enfant", Icon: Baby },
  { name: "smile", label: "Sourire", Icon: Smile, keywords: "moral humeur" },
  { name: "laugh", label: "Rire", Icon: Laugh },
  { name: "frown", label: "Tristesse", Icon: Frown },
  // Pour les états : émotions, sommeil, corps, sens, entraves, protections, bonus et malus…
  { name: "angry", label: "Colère", Icon: Angry, keywords: "rage fureur énervé" },
  { name: "annoyed", label: "Agacé", Icon: Annoyed, keywords: "irrité contrarié" },
  { name: "meh", label: "Indifférent", Icon: Meh, keywords: "apathie démotivé ennui" },
  { name: "smile-plus", label: "Joie", Icon: SmilePlus, keywords: "heureux bonheur sérénité" },
  { name: "drama", label: "Masques de théâtre", Icon: Drama, keywords: "émotion comédie tragédie" },
  { name: "mask", label: "Masque", Icon: VenetianMask, keywords: "déguisement illusion charme tromperie" },
  { name: "brain-circuit", label: "Esprit vif", Icon: BrainCircuit, keywords: "intelligence concentration" },
  { name: "brain-cog", label: "Esprit troublé", Icon: BrainCog, keywords: "confus folie manipulation" },
  { name: "lightbulb", label: "Idée", Icon: Lightbulb, keywords: "inspiration lucidité" },
  { name: "lightbulb-off", label: "Esprit éteint", Icon: LightbulbOff, keywords: "confus stupeur hébété" },
  { name: "heart-off", label: "Cœur barré", Icon: HeartOff, keywords: "coeur insensible froid" },
  { name: "heart-handshake", label: "Cœur allié", Icon: HeartHandshake, keywords: "coeur amitié charme lien" },
  { name: "handshake", label: "Pacte", Icon: Handshake, keywords: "alliance accord" },
  { name: "hand-helping", label: "Main tendue", Icon: HandHelping, keywords: "aide soutien soin" },
  { name: "bed", label: "Lit", Icon: Bed, keywords: "sommeil endormi repos fatigue" },
  { name: "bed-double", label: "Grand lit", Icon: BedDouble, keywords: "sommeil repos" },
  { name: "moon-star", label: "Nuit étoilée", Icon: MoonStar, keywords: "sommeil rêve nuit" },
  { name: "eye-closed", label: "Yeux fermés", Icon: EyeClosed, keywords: "sommeil aveugle endormi" },
  { name: "timer", label: "Minuteur", Icon: Timer, keywords: "durée tour temps" },
  { name: "alarm", label: "Réveil", Icon: AlarmClock, keywords: "temps réveil alerte" },
  { name: "infinity", label: "Infini", Icon: Infinity, keywords: "permanent éternel" },
  { name: "repeat", label: "Répétition", Icon: Repeat, keywords: "chaque tour cumul récurrent" },
  { name: "rotate", label: "Tourbillon", Icon: RotateCw, keywords: "étourdi vertige confus" },
  { name: "thermometer", label: "Thermomètre", Icon: Thermometer, keywords: "fièvre température maladie" },
  { name: "thermometer-cold", label: "Froid", Icon: ThermometerSnowflake, keywords: "gel frigorifié glace" },
  { name: "thermometer-hot", label: "Chaleur", Icon: ThermometerSun, keywords: "brûlure fièvre canicule" },
  { name: "stethoscope", label: "Stéthoscope", Icon: Stethoscope, keywords: "soin médecin santé" },
  { name: "test-tube", label: "Éprouvette", Icon: TestTube, keywords: "poison alchimie venin" },
  { name: "test-tubes", label: "Éprouvettes", Icon: TestTubes, keywords: "alchimie mélange" },
  { name: "flask-round", label: "Fiole ronde", Icon: FlaskRound, keywords: "potion élixir" },
  { name: "microscope", label: "Microscope", Icon: Microscope, keywords: "maladie infection germe" },
  { name: "tablets", label: "Comprimés", Icon: Tablets, keywords: "médicament remède" },
  { name: "bug-off", label: "Insecte barré", Icon: BugOff, keywords: "remède antidote immunité" },
  { name: "biceps", label: "Biceps", Icon: BicepsFlexed, keywords: "force muscle puissance" },
  { name: "dumbbell", label: "Haltère", Icon: Dumbbell, keywords: "force entraînement" },
  { name: "person", label: "Silhouette", Icon: PersonStanding, keywords: "corps personnage debout" },
  { name: "activity", label: "Activité", Icon: Activity, keywords: "pouls rythme vie" },
  { name: "scan-eye", label: "Regard", Icon: ScanEye, keywords: "perception vision repéré" },
  { name: "ear", label: "Oreille", Icon: Ear, keywords: "ouïe écoute" },
  { name: "ear-off", label: "Sourd", Icon: EarOff, keywords: "surdité assourdi" },
  { name: "mic-off", label: "Muet", Icon: MicOff, keywords: "silence mutisme" },
  { name: "volume-x", label: "Silence", Icon: VolumeX, keywords: "muet assourdi" },
  { name: "message-off", label: "Bulle barrée", Icon: MessageCircleOff, keywords: "muet silence bâillon" },
  { name: "speech", label: "Parole", Icon: Speech, keywords: "parler voix charme" },
  { name: "megaphone", label: "Porte-voix", Icon: Megaphone, keywords: "cri provocation intimidation" },
  { name: "link", label: "Chaîne", Icon: Link, keywords: "lien entrave enchaîné attaché" },
  { name: "link-2", label: "Maillon", Icon: Link2, keywords: "lien chaîne" },
  { name: "unlink", label: "Chaîne brisée", Icon: Unlink, keywords: "libéré délivré" },
  { name: "weight", label: "Poids", Icon: Weight, keywords: "lourd ralenti encombré" },
  { name: "grab", label: "Saisie", Icon: Grab, keywords: "agrippé empoigné immobilisé" },
  { name: "magnet", label: "Aimant", Icon: Magnet, keywords: "attraction charme attiré" },
  { name: "ban", label: "Interdit", Icon: Ban, keywords: "bloqué interdiction impossible" },
  { name: "circle-off", label: "Rond barré", Icon: CircleOff, keywords: "annulé nul" },
  { name: "lock-open", label: "Cadenas ouvert", Icon: LockOpen, keywords: "libre déverrouillé" },
  { name: "key-round", label: "Clé ronde", Icon: KeyRound, keywords: "ouverture" },
  { name: "bot", label: "Automate", Icon: Bot, keywords: "possédé contrôlé golem marionnette" },
  { name: "puzzle", label: "Puzzle", Icon: Puzzle, keywords: "énigme confus" },
  { name: "unplug", label: "Débranché", Icon: Unplug, keywords: "coupé déconnecté" },
  { name: "zap-off", label: "Éclair barré", Icon: ZapOff, keywords: "épuisé paralysie sans énergie" },
  { name: "flag-off", label: "Drapeau barré", Icon: FlagOff, keywords: "abandon reddition" },
  { name: "shield-plus", label: "Bouclier renforcé", Icon: ShieldPlus, keywords: "protection bonus armure" },
  { name: "shield-check", label: "Bouclier validé", Icon: ShieldCheck, keywords: "immunité protégé" },
  { name: "shield-alert", label: "Bouclier en alerte", Icon: ShieldAlert, keywords: "menace danger" },
  { name: "shield-off", label: "Bouclier barré", Icon: ShieldOff, keywords: "vulnérable sans défense" },
  { name: "shield-x", label: "Bouclier brisé", Icon: ShieldX, keywords: "vulnérable brisé" },
  { name: "siren", label: "Sirène", Icon: Siren, keywords: "alerte urgence danger" },
  { name: "alert", label: "Attention", Icon: TriangleAlert, keywords: "danger alerte avertissement" },
  { name: "octagon-alert", label: "Arrêt", Icon: OctagonAlert, keywords: "danger stop" },
  { name: "circle-alert", label: "Alerte", Icon: CircleAlert, keywords: "attention" },
  { name: "bell-ring", label: "Cloche qui sonne", Icon: BellRing, keywords: "alerte appel" },
  { name: "bell-off", label: "Cloche muette", Icon: BellOff, keywords: "silence" },
  { name: "chevrons-up", label: "Double flèche haute", Icon: ChevronsUp, keywords: "bonus renfort" },
  { name: "chevrons-down", label: "Double flèche basse", Icon: ChevronsDown, keywords: "malus affaibli" },
  { name: "arrow-up", label: "Grosse flèche haute", Icon: ArrowBigUp, keywords: "bonus hausse" },
  { name: "arrow-down", label: "Grosse flèche basse", Icon: ArrowBigDown, keywords: "malus baisse" },
  { name: "gauge", label: "Cadran", Icon: Gauge, keywords: "niveau jauge intensité" },
  { name: "flame-kindling", label: "Braises", Icon: FlameKindling, keywords: "feu brûlure foyer" },
  { name: "cloud-rain", label: "Pluie", Icon: CloudRain, keywords: "eau mouillé" },
  { name: "cloud-snow", label: "Neige", Icon: CloudSnow, keywords: "froid gel" },
  { name: "cloud-fog", label: "Brouillard", Icon: CloudFog, keywords: "brume aveuglé" },
  { name: "haze", label: "Brume", Icon: Haze, keywords: "brouillard flou" },
  { name: "cloudy", label: "Nuageux", Icon: Cloudy, keywords: "nuages" },
  { name: "eclipse", label: "Éclipse", Icon: Eclipse, keywords: "ombre ténèbres obscurité" },
  { name: "sun-dim", label: "Soleil voilé", Icon: SunDim, keywords: "faible lumière" },
  { name: "stars", label: "Constellation", Icon: Stars, keywords: "étoiles destin astral" },
  { name: "rose", label: "Rose", Icon: Rose, keywords: "charme amour fleur" },
  { name: "scroll-text", label: "Parchemin écrit", Icon: ScrollText, keywords: "malédiction sort contrat" },
  { name: "utensils", label: "Couverts", Icon: UtensilsCrossed, keywords: "faim repas nourriture" },
  { name: "glass-water", label: "Verre d'eau", Icon: GlassWater, keywords: "soif boire" },
  { name: "coffee", label: "Café", Icon: Coffee, keywords: "fatigue réveil" },
  { name: "soup", label: "Soupe", Icon: Soup, keywords: "repas chaud" },
  { name: "ham", label: "Jambon", Icon: Ham, keywords: "nourriture viande" },
  { name: "cigarette", label: "Cigarette", Icon: Cigarette, keywords: "fumée tabac" },
  { name: "user-check", label: "Personne validée", Icon: UserCheck, keywords: "guéri sauvé" },
  { name: "user-minus", label: "Personne affaiblie", Icon: UserMinus, keywords: "affaibli malus" },
  { name: "user-x", label: "Personne barrée", Icon: UserX, keywords: "mort exclu éliminé" },
  { name: "dice-6", label: "Dé", Icon: Dice6, keywords: "jet hasard six" },
  { name: "atom", label: "Atome", Icon: Atom },
  { name: "dna", label: "ADN", Icon: Dna },
  { name: "orbit", label: "Orbite", Icon: Orbit },
  { name: "battery", label: "Batterie", Icon: Battery },
  { name: "battery-full", label: "Batterie pleine", Icon: BatteryFull, keywords: "énergie" },
  { name: "circle", label: "Rond", Icon: Circle },
  { name: "square", label: "Carré", Icon: Square },
  { name: "triangle", label: "Triangle", Icon: Triangle },
  { name: "pentagon", label: "Pentagone", Icon: Pentagon },
  { name: "hexagon", label: "Hexagone", Icon: Hexagon },
  { name: "octagon", label: "Octogone", Icon: Octagon },
]

const iconByName = new Map(indexIcons.map((entry) => [entry.name, entry]))

export function indexIcon(name: string | undefined) {
  return iconByName.get(name ?? "") ?? iconByName.get("sparkle")!
}

/** Une icône d'index : une icône de la liste, ou un émoji / caractère tel quel. */
/** Les traits d'une icône pleine, par défaut : clairs, comme découpés dans la forme. */
export const DEFAULT_GLYPH_STROKE = "#fffaf0"

/**
 * La silhouette pleine d'une icône, en masque (adresse d'image). Certaines icônes (le
 * cerveau) sont faites d'arcs ouverts : remplis un à un, ils laissent un grand vide au
 * milieu. On dessine l'icône, on remplit depuis les bords tout ce qui est dehors, et tout
 * ce que ce remplissage n'atteint pas est l'intérieur. Calculée une fois par icône.
 */
const silhouettes = new Map<string, Promise<string>>()
const SILHOUETTE_SIZE = 96

function silhouetteOf(name: string, svg: SVGSVGElement) {
  let promise = silhouettes.get(name)
  if (promise) return promise
  promise = new Promise<string>((resolve) => {
    const copy = svg.cloneNode(true) as SVGSVGElement
    copy.setAttribute("width", String(SILHOUETTE_SIZE))
    copy.setAttribute("height", String(SILHOUETTE_SIZE))
    copy.setAttribute("stroke", "#000")
    copy.setAttribute("stroke-width", "2")
    copy.setAttribute("fill", "none")
    copy.removeAttribute("class")
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = SILHOUETTE_SIZE
      const context = canvas.getContext("2d")
      if (!context) return resolve("")
      context.drawImage(image, 0, 0, SILHOUETTE_SIZE, SILHOUETTE_SIZE)
      const pixels = context.getImageData(0, 0, SILHOUETTE_SIZE, SILHOUETTE_SIZE)
      const size = SILHOUETTE_SIZE
      const outside = new Uint8Array(size * size)
      const stack: number[] = []
      for (let i = 0; i < size; i += 1) stack.push(i, (size - 1) * size + i, i * size, i * size + size - 1)
      while (stack.length) {
        const at = stack.pop() as number
        if (outside[at] || pixels.data[at * 4 + 3] > 40) continue
        outside[at] = 1
        const x = at % size
        if (x > 0) stack.push(at - 1)
        if (x < size - 1) stack.push(at + 1)
        if (at >= size) stack.push(at - size)
        if (at < size * (size - 1)) stack.push(at + size)
      }
      for (let at = 0; at < size * size; at += 1) {
        pixels.data[at * 4] = pixels.data[at * 4 + 1] = pixels.data[at * 4 + 2] = 0
        pixels.data[at * 4 + 3] = outside[at] ? 0 : 255
      }
      context.putImageData(pixels, 0, 0)
      resolve(canvas.toDataURL())
    }
    image.onerror = () => resolve("")
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
  })
  silhouettes.set(name, promise)
  return promise
}

/** Le masque de la silhouette d'une icône, et la référence à poser sur son dessin. */
function useSilhouette(name: string, enabled: boolean) {
  const [node, setNode] = useState<SVGSVGElement | null>(null)
  const [mask, setMask] = useState<{ name: string; url: string } | null>(null)
  useEffect(() => {
    if (!enabled || !node) return
    let alive = true
    void silhouetteOf(name, node).then((url) => { if (alive) setMask({ name, url }) })
    return () => { alive = false }
  }, [enabled, name, node])
  return [setNode, mask?.name === name ? mask.url : ""] as const
}

/**
 * Une icône d'index : une icône de la liste, ou un émoji / caractère tel quel. Pleine,
 * elle est remplie de sa couleur et ses traits (aiguilles d'une horloge, yeux d'un
 * sourire) restent visibles dans la couleur `stroke` ; vide, seul son contour est tracé.
 */
export function IndexIconGlyph({ icon, emoji, className = "size-4", filled = true, stroke }: { icon?: string; emoji?: string; className?: string; filled?: boolean; stroke?: string }) {
  const entry = indexIcon(icon)
  const [silhouetteRef, silhouetteMask] = useSilhouette(entry.name, filled && !emoji?.trim())
  if (emoji?.trim()) return <span aria-hidden="true" className={`inline-flex items-center justify-center leading-none ${className}`} style={{ fontSize: "0.95em", filter: filled ? undefined : "grayscale(1)" }}>{emoji.trim()}</span>
  const { Icon } = entry
  if (!filled) return <Icon aria-hidden="true" className={className} fill="none" strokeWidth={1.8} />
  // Trois dessins superposés : la silhouette (intérieur compris), les formes remplies, puis
  // tous les traits par-dessus. Une icône dont le contour est tracé en dernier (le cercle
  // du sourire) ne cache plus ses yeux, et le cerveau est plein.
  const mask = silhouetteMask ? `url(${silhouetteMask}) center / 100% 100% no-repeat` : undefined
  return <span aria-hidden="true" className={`relative inline-flex shrink-0 ${className}`}>
    {mask && <span className="absolute inset-0 bg-current" style={{ mask, WebkitMask: mask }} />}
    <Icon className="absolute inset-0 size-full" fill="currentColor" stroke="currentColor" strokeWidth={1.8} />
    <Icon ref={silhouetteRef} className="absolute inset-0 size-full" fill="none" stroke={stroke || DEFAULT_GLYPH_STROKE} strokeWidth={1.6} />
  </span>
}

/** Choisir une icône (avec recherche) ou taper un émoji. */
export function IconPicker({ icon, emoji, onChange, disabled = false, allowNone = false }: { icon?: string; emoji?: string; onChange: (value: { icon?: string; emoji?: string }) => void; disabled?: boolean; allowNone?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const folded = foldName(query)
  const shown = indexIcons.filter((entry) => !folded || foldName(`${entry.label} ${entry.name} ${entry.keywords ?? ""}`).includes(folded))
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" disabled={disabled} className="justify-start gap-2">
        {icon || emoji ? <IndexIconGlyph icon={icon} emoji={emoji} filled={false} /> : <span className="text-muted-foreground">—</span>}
        <span className="truncate text-xs">{emoji?.trim() ? `Émoji ${emoji.trim()}` : icon ? indexIcon(icon).label : "Aucune icône"}</span>
      </Button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-80 p-2">
      <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher : cœur, tête de mort, graine…" className="mb-2 h-8 text-xs" />
      <div className="grid max-h-60 grid-cols-8 gap-1 overflow-y-auto">
        {allowNone && <button type="button" onClick={() => { onChange({}); setOpen(false) }} className="grid size-8 place-items-center rounded-md text-xs text-muted-foreground hover:bg-muted" title="Aucune icône">—</button>}
        {shown.map((entry) => <button key={entry.name} type="button" title={entry.label} aria-label={entry.label} onClick={() => { onChange({ icon: entry.name }); setOpen(false) }} className={`grid size-8 place-items-center rounded-md hover:bg-muted ${entry.name === icon && !emoji ? "bg-primary/15 text-primary" : ""}`}><entry.Icon className="size-4" /></button>)}
      </div>
      {!shown.length && <p className="py-3 text-center text-xs text-muted-foreground">Aucune icône de ce nom. Tape plutôt un émoji ci-dessous.</p>}
      <label className="mt-2 grid gap-1 border-t pt-2 text-[11px] font-semibold text-muted-foreground">Ou un émoji / caractère
        <Input value={emoji ?? ""} maxLength={4} onChange={(event) => onChange({ icon, emoji: event.target.value || undefined })} placeholder="🌱 💧 ☠️ ✚ …" className="h-8 text-sm" />
      </label>
    </PopoverContent>}
  </Popover>
}

function parseCount(value: string) {
  const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

/** Rouge quand c'est bas, ambre au milieu, vert quand c'est plein. */
export function levelColor(ratio: number) {
  if (ratio <= 0.25) return "#b3261e"
  if (ratio <= 0.5) return "#c2410c"
  if (ratio <= 0.75) return "#b7791f"
  return "#4d7c0f"
}

/**
 * Une jauge. Trois échelles, réglées sur la colonne :
 * - « column » : le même maximum pour toute la colonne, la case dit combien est rempli ;
 * - « cell » : chaque case a sa propre jauge, le nombre tapé est le nombre d'icônes
 *   (les charges d'un sort : « 3 » donne trois étincelles) ;
 * - « from-column » : le maximum est lu dans une autre colonne de la ligne (`maxValue`).
 */
export const GaugeCell = memo(function GaugeCell({ label, value, settings, maxValue, disabled = false, onChange }: {
  label: string
  value: string
  settings: GaugeSettings
  /** Échelle « from-column » : le maximum de cette ligne. */
  maxValue?: number | null
  disabled?: boolean
  onChange: (value: string) => void
}) {
  // Réglage « par ligne » : la case porte son icône et sa couleur après son nombre.
  const parsedRow = settings.perRow ? parseGaugeCell(value) : null
  // Pendant le choix (le sélecteur de couleur change à chaque mouvement), l'aperçu suit
  // tout de suite et Google Sheets ne reçoit qu'une écriture, à la fermeture.
  // Gardé tant que la case n'a pas changé : après l'écriture, la nouvelle valeur prend le relais.
  const [styleDraft, setStyleDraft] = useState<{ source: string; style: GaugeRowStyle } | null>(null)
  const draftStyle = styleDraft && styleDraft.source === value ? styleDraft.style : null
  const row = parsedRow && draftStyle ? { ...parsedRow, style: draftStyle } : parsedRow
  const look = row ? { ...settings, icon: row.style.emoji ? undefined : row.style.icon ?? settings.icon, emoji: row.style.emoji ?? (row.style.icon ? undefined : settings.emoji), color: row.style.color ?? settings.color } : settings
  const baseValue = row ? row.count : value
  const [local, setLocal] = useState<{ source: string; value: string } | null>(null)
  const shown = local && local.source === baseValue ? local.value : baseValue
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const scale = gaugeScaleOf(settings)
  const text = shown.trim()
  const number = parseCount(text)
  const columnMax = Math.max(1, Math.trunc(settings.max || 5))
  const max = scale === "from-column" ? Math.max(0, Math.round(maxValue ?? 0)) : scale === "cell" ? Math.max(0, Math.round(number ?? 0)) : columnMax
  const current = scale === "cell" ? max : number === null ? null : Math.max(0, Math.min(max, number))
  const ratio = max > 0 && current !== null ? current / max : 0
  const color = settings.levels && scale !== "cell" && !row?.style.color ? levelColor(ratio) : look.color || "var(--primary)"
  const set = (next: number | string | null) => {
    const textValue = next === null ? "" : String(next)
    setLocal({ source: baseValue, value: textValue })
    onChange(row ? formatGaugeCell(textValue, row.style) : textValue)
  }
  const setStyle = (style: GaugeRowStyle) => setStyleDraft({ source: value, style })
  const sameStyle = (left: GaugeRowStyle, right: GaugeRowStyle) => (left.icon ?? "") === (right.icon ?? "") && (left.emoji ?? "") === (right.emoji ?? "") && (left.color ?? "") === (right.color ?? "")
  const closeStyler = (open: boolean) => {
    if (open || !draftStyle || !parsedRow) return
    if (!sameStyle(draftStyle, parsedRow.style)) onChange(formatGaugeCell(shown.trim(), draftStyle))
  }
  // Choisir l'icône et la couleur de cette ligne seulement.
  const styler = row && <Popover onOpenChange={closeStyler}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60" title="Icône et couleur de cette ligne" aria-label={`${label} : icône et couleur de cette ligne`}><Palette className="size-3" /></button>
    </PopoverTrigger>
    <PopoverContent align="start" className="grid w-64 gap-2 p-2.5">
      <p className="text-[11px] font-semibold text-muted-foreground">Icône et couleur de cette ligne</p>
      <IconPicker icon={row.style.icon} emoji={row.style.emoji} allowNone onChange={(next) => setStyle({ ...row.style, icon: next.icon, emoji: next.emoji })} />
      <div className="flex flex-wrap items-center gap-1">
        {rowColors.map((swatch) => <button key={swatch} type="button" onClick={() => setStyle({ ...row.style, color: swatch })} className={`size-6 rounded-full border ${row.style.color === swatch ? "ring-2 ring-primary ring-offset-1" : ""}`} style={{ backgroundColor: swatch }} aria-label={`Couleur ${swatch}`} />)}
        <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border" title="Autre couleur" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}><input type="color" value={row.style.color ?? "#927640"} onChange={(event) => setStyle({ ...row.style, color: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" /></label>
        <button type="button" onClick={() => setStyle({ ...row.style, color: undefined })} className="ml-1 text-[11px] text-muted-foreground underline">Couleur de la colonne</button>
      </div>
    </PopoverContent>
  </Popover>
  const special = settings.unlimited && text === settings.unlimited
  const iconCap = 20

  // Saisie directe, pour toutes les jauges : un clic sur le nombre ou le crayon.
  const editor = <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(text) }}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} className="shrink-0 rounded px-1 text-[11px] tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60" title="Taper une valeur" aria-label={`${label} : taper une valeur`}>
        {scale === "cell" ? (special ? settings.unlimited : text || "—") : `${current ?? "—"}/${max || "?"}`}
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-auto p-2">
      <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted-foreground">{label}{scale === "cell" ? " (taille de la jauge)" : scale === "from-column" ? ` (sur ${max})` : ` (sur ${max})`}</p>
      {scale === "cell" && <div className="mb-2 flex flex-wrap gap-1">
        {Array.from({ length: Math.min(columnMax, iconCap) + 1 }, (_, index) => <Button key={index} type="button" size="sm" variant={index === number && !special ? "default" : "outline"} className="min-w-8 tabular-nums" onClick={() => { set(index); setOpen(false) }}>{index}</Button>)}
        {settings.unlimited && <Button type="button" size="sm" variant={special ? "default" : "outline"} title="Sans limite" onClick={() => { set(settings.unlimited!); setOpen(false) }}>{settings.unlimited}</Button>}
      </div>}
      <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); const parsed = parseCount(draft); set(draft.trim() === "" ? null : parsed === null ? draft.trim() : parsed); setOpen(false) }}>
        <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} inputMode="decimal" className="h-8 w-24 text-sm" aria-label={`${label} : valeur`} />
        <Button type="submit" size="sm">OK</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { set(null); setOpen(false) }}>Vider</Button>
      </form>
    </PopoverContent>}
  </Popover>

  if (scale === "cell") {
    return <span className="flex min-h-8 items-center gap-0.5 px-1.5" style={{ color }} role="group" aria-label={`${label} : ${text || "vide"}`}>
      {special ? <span className="text-sm font-semibold" title="Sans limite">{settings.unlimited}</span>
        : number === null && text ? <span className="text-sm">{text}</span>
        : Array.from({ length: Math.min(max, iconCap) }, (_, index) => <IndexIconGlyph key={index} icon={look.icon} emoji={look.emoji} stroke={settings.strokeColor} />)}
      {max > iconCap && <span className="text-[11px] font-semibold">+{max - iconCap}</span>}
      {number === 0 && <span className="text-xs text-muted-foreground">0</span>}
      <span className="ml-auto flex items-center">{styler}{editor}</span>
    </span>
  }

  if (settings.style === "icons") {
    const count = Math.min(max, iconCap)
    return <span className="flex min-h-8 items-center gap-0.5 px-1.5" style={{ color }} role="group" aria-label={`${label} : ${current ?? "vide"} sur ${max}`}>
      {Array.from({ length: count }, (_, index) => {
        const filled = current !== null && index < current
        return <button key={index} type="button" disabled={disabled} onClick={() => set(current !== null && index < current ? index : index + 1)} className={`inline-flex rounded-sm p-0.5 transition hover:scale-110 disabled:hover:scale-100 ${filled ? "opacity-100" : "opacity-30 hover:opacity-60"}`} aria-label={`${label} : ${index + 1}`}>
          <IndexIconGlyph icon={look.icon} emoji={look.emoji} filled={filled} stroke={settings.strokeColor} />
        </button>
      })}
      {!count && <span className="text-xs text-muted-foreground">{scale === "from-column" ? "Maximum vide" : "—"}</span>}
      <span className="ml-auto flex items-center">{styler}{editor}</span>
    </span>
  }

  if (settings.style === "ring") {
    const radius = 11
    const length = 2 * Math.PI * radius
    return <span className="flex min-h-8 items-center gap-1 px-1.5">
      <button type="button" disabled={disabled || !current} onClick={() => set(Math.max(0, (current ?? 0) - 1))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Diminuer ${label}`}><Minus className="size-3" /></button>
      <span className="relative grid size-7 place-items-center" aria-label={`${label} : ${current ?? "vide"} sur ${max}`}>
        <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90"><circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" /><circle cx="14" cy="14" r={radius} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${length * ratio} ${length}`} /></svg>
        <span className="relative text-[10px] font-semibold tabular-nums">{current ?? "—"}</span>
      </span>
      <button type="button" disabled={disabled || current === max} onClick={() => set(Math.min(max, (current ?? 0) + 1))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Augmenter ${label}`}><Plus className="size-3" /></button>
      <span className="ml-auto flex items-center">{styler}{editor}</span>
    </span>
  }

  return <GaugeBar label={label} current={current} max={max} color={color} disabled={disabled} editor={<span className="flex items-center">{styler}{editor}</span>} onChange={set} />
})

/** La barre : on la fait glisser, ou on tape la valeur. */
function GaugeBar({ label, current, max, color, disabled, editor, onChange }: { label: string; current: number | null; max: number; color: string; disabled: boolean; editor: ReactNode; onChange: (value: number) => void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const displayed = dragging ?? current ?? 0
  const commit = () => { if (dragging !== null) { onChange(dragging); setDragging(null) } }
  return <span className="flex min-h-8 items-center gap-2 px-2">
    <input
      type="range"
      min={0}
      max={Math.max(1, max)}
      step={1}
      value={displayed}
      disabled={disabled || max <= 0}
      aria-label={label}
      onChange={(event) => setDragging(Number(event.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      className="h-1.5 min-w-0 flex-1 cursor-pointer"
      style={{ accentColor: color }}
    />
    {editor}
  </span>
}
