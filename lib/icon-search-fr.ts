/**
 * Chercher une icône en français. Les icônes (Lucide) ont un nom et des mots-clés en
 * anglais ; ce dictionnaire relie les mots français à ces mots anglais. Chaque ligne :
 * des mots français (synonymes, pluriels) | les mots anglais qu'ils désignent.
 *
 * La recherche ignore les accents, les majuscules et le « œ » (oeil = œil), et un début
 * de mot suffit (« pers » trouve personne). Un mot anglais tapé tel quel marche aussi.
 *
 * Ce fichier ne dépend de rien.
 */
const lines = `
oeil yeux regard regarder vue voir vision visible|eye eyes view vision visible
aveugle cache cacher invisible masque masquer|hidden hide invisible eye-off blind conceal mask
oreille oreilles entendre ouie ecouter|ear hearing listen
sourd surdite|ear-off deaf
bouche levres|mouth lips
nez odeur sentir|nose smell
main mains doigt doigts|hand hands finger fingers palm
poing frapper coup|fist punch hit
pied pieds pas empreinte empreintes trace|foot feet footprints step track
bras muscle force fort puissance biceps|arm muscle strength strong power biceps
jambe jambes marcher marche courir course|leg walk walking run running
tete visage figure|head face
cerveau esprit pensee intelligence mental|brain mind intellect thought idea
coeur amour vie|heart love life
os squelette|bone skeleton skull
dent dents|tooth teeth dental
sang saigner saignement|blood droplet bleed
corps silhouette|body person standing figure
personne personnes humain gens utilisateur joueur profil compte|person user people human users account profile contact
groupe equipe foule communaute famille|group team users people community family crowd
enfant bebe|baby child kid
homme masculin|man male
femme feminin|woman female
ami amis amitie allie|friend friends handshake
famille|family home
roi reine couronne noblesse noble royal|crown king queen royal
soldat armee militaire garde|soldier army military guard knight trooper
chevalier|knight chess horse
joie heureux content sourire rire|happy smile laugh joy emoji
triste tristesse pleurer larme larmes|sad frown cry tear
colere enerve furieux rage fureur|angry mad rage
peur effraye effroi terreur|fear scared ghost
surpris surprise etonne|surprised shocked
dormir sommeil endormi fatigue repos lit|sleep bed tired rest moon zzz
reve rever|dream cloud moon
emotion emotions humeur sentiment|emotion emoji mood feeling face
malade maladie infection virus germe|sick illness virus bug infection biohazard
poison venin toxique empoisonne|poison toxic venom skull biohazard flask
soin soigner guerir guerison sante medecin|health heal medical care doctor hospital aid cross
remede medicament pilule potion|medicine pill drug potion flask
blessure blesse bandage pansement|injured wound bandage band-aid
mort mourir tombe cadavre|death dead skull grave tomb
fantome esprit spectre|ghost spirit
temperature chaud chaleur|temperature hot heat thermometer sun flame
froid gel glace gele givre|cold freeze frozen ice snow snowflake
feu flamme flammes bruler brulure incendie|fire flame flames burn hot
eau liquide goutte gouttes|water liquid drop droplet
mer ocean vague vagues|sea ocean wave waves
pluie pleuvoir|rain cloud umbrella
neige|snow snowflake winter
vent tempete|wind storm tornado
orage eclair foudre tonnerre|storm lightning thunder zap bolt
nuage nuages ciel|cloud clouds sky weather
soleil jour lumiere|sun day light sunny bright
lune nuit|moon night
etoile etoiles|star stars sparkle
meteo temps climat|weather climate
terre monde planete globe|earth world planet globe
montagne montagnes|mountain mountains
foret arbre arbres bois|forest tree trees wood
plante plantes feuille feuilles fleur fleurs nature jardin|plant leaf flower nature garden sprout
graine semence pousse germe|seed sprout bean
fruit fruits pomme|fruit apple cherry grape
legume legumes carotte|vegetable carrot
animal animaux bete betes|animal pet paw
chien|dog
chat|cat
oiseau oiseaux|bird
poisson poissons|fish
insecte insectes araignee|bug insect spider
serpent|snake worm
rat souris|rat mouse
lapin|rabbit
cheval|horse
dragon|dragon fire
nourriture manger repas faim|food eat meal restaurant hunger utensils
boire boisson soif|drink beverage thirst cup glass
alcool vin biere taverne|alcohol wine beer
cuisine cuisiner|cooking kitchen chef
pain|bread wheat
viande|meat beef ham drumstick
gateau dessert sucre bonbon|cake dessert sweet candy cookie
cafe the tasse|coffee tea cup mug
arme armes|weapon sword axe gun
epee lame|sword blade
hache|axe
arc fleche fleches|bow arrow target
bouclier armure defense proteger protection|shield armor protection defense guard
cible viser visee|target aim crosshair
combat bataille guerre|battle war swords combat fight
bombe explosion exploser|bomb explosion
magie magique sort sorts sortilege enchantement|magic spell wand sparkles wizard
baguette|wand magic
cristal gemme joyau pierre precieuse|crystal gem diamond jewel stone
or argent piece pieces monnaie tresor richesse|gold coins money currency treasure coin
argent billet billets|money cash banknote bill
banque|bank landmark
prix cout acheter achat vendre vente boutique magasin|price cost buy purchase sale shop store cart
sac sacoche|bag backpack
coffre boite caisse|box chest package container
cle cles|key keys
cadenas verrou ferme verrouille|lock locked padlock
ouvert ouvrir deverrouille|open unlock unlocked
porte entree sortie|door entrance exit
maison foyer|home house
chateau forteresse|castle fortress tower
eglise temple religion priere|church temple religion pray
ville batiment|city building
tente camp camping|tent camping campsite
route chemin voyage|road path travel journey route
carte plan|map plan
boussole direction|compass direction navigation
bateau navire|boat ship sail anchor
ancre|anchor
voiture vehicule|car vehicle
train|train railway
avion vol voler|plane airplane flight fly
fusee espace|rocket space
livre livres lire lecture grimoire|book books read reading library
parchemin rouleau|scroll paper
lettre courrier message|letter mail email message
parler parole dire discuter conversation|speech talk chat conversation message
crier cri hurler|shout megaphone loud
silence muet taire|silence mute quiet off
musique chanson chant|music song sing note
son bruit volume|sound noise volume audio speaker
instrument guitare tambour|instrument guitar drum
danse danser|dance
art peinture dessin dessiner pinceau|art paint draw brush palette
couleur couleurs|color colour palette
plume ecrire ecriture stylo crayon|feather write pen pencil writing
papier document feuille page|paper document file page sheet
dossier|folder
note notes noter|note notes notepad
liste listes|list
calendrier date jour|calendar date day
horloge heure montre temps|clock time watch hour
minuteur chrono duree|timer stopwatch duration
sablier|hourglass time
alarme reveil|alarm clock bell
cloche|bell
etoile favori favoris|star favorite bookmark
drapeau|flag
trophee victoire gagner vainqueur|trophy winner victory award prize
medaille recompense|medal award badge
cadeau|gift present
fete anniversaire|party birthday celebration cake
jeu jeux jouer|game play gamepad dice
de des hasard chance jet lancer|dice random chance luck
carte cartes|card cards
puzzle enigme|puzzle
echecs|chess
pion|pawn chess
outil outils reparer|tool tools wrench hammer repair
marteau|hammer
pioche miner mine|pickaxe mine
pelle creuser|shovel dig
scie couper ciseaux|saw cut scissors
corde lien chaine chaines entrave|rope link chain chains
aimant|magnet
lampe lumiere ampoule idee|lamp light bulb lightbulb idea
bougie|candle flame
miroir|mirror
lunettes|glasses
chapeau|hat
vetement vetements habit|clothes shirt
chaussure|shoe footprints
bijou bague anneau|jewel ring
alerte attention danger avertissement|alert warning danger attention caution
interdit interdiction bloque stop arret|ban forbidden blocked stop prohibited no
erreur echec rate|error fail failure wrong x
valider valide ok correct reussi succes|check ok correct success done valid verified
ajouter ajout plus bonus|add plus new increase
enlever retirer moins malus|remove minus decrease subtract delete
supprimer effacer poubelle|delete trash erase remove bin
modifier editer|edit pencil change
chercher recherche trouver loupe|search find magnifier zoom
reglage reglages parametre parametres option|settings options preferences gear cog
haut monter hausse augmenter|up increase rising ascending
bas descendre baisse diminuer|down decrease falling descending
gauche|left
droite|right
fleche fleches|arrow arrows
cercle rond|circle round
carre|square
triangle|triangle
losange|diamond
forme formes|shape shapes geometry
vitesse rapide vite|speed fast quick
lent lenteur ralenti|slow snail turtle
lourd poids|heavy weight
leger|light feather
grand agrandir|big large enlarge maximize
petit reduire|small minimize reduce
energie pouvoir|energy power zap battery
batterie|battery
electricite electrique|electricity electric plug
science laboratoire chimie|science lab chemistry flask
atome|atom
adn genetique|dna genetics
ecran ordinateur|screen computer monitor desktop
telephone appel|phone call mobile
photo appareil image|photo camera image picture
video film cinema|video film movie
lien|link url
partager|share
telecharger|download
envoyer|send
recevoir|receive inbox
utilisateur utilisateurs|user users
connexion|login connection
securite secure|security secure
confidentiel prive secret|private secret confidential
repeter repetition boucle|repeat loop cycle
infini eternel|infinity infinite
tourner rotation|rotate rotation turn spin
melanger aleatoire|shuffle random
pause|pause
jouer lecture|play
retour annuler|back undo return
suivant|next forward
precedent|previous back
debut commencer|start begin
fin terminer|end finish
nombre numero chiffre|number numeric digit hash
pourcentage|percent
calcul calculer|calculate calculator math
statistique graphique|statistics chart graph analytics
travail bureau|work office briefcase
ecole etudier etude|school study education
diplome universite|graduation university college
justice loi balance|justice law scale balance gavel
contrat pacte accord|contract agreement handshake pact
masque deguisement|mask disguise theater drama
theatre|theater drama
robot automate golem|robot bot automaton
alien extraterrestre|alien
vaisseau|ship rocket
couronne|crown
tour donjon|tower castle
pont|bridge
mur|wall brick
pierre roche|stone rock
sable desert|sand desert
volcan|volcano mountain fire
ile plage|island beach
fleuve riviere lac|river lake water
glace|ice snow
bulle bulles|bubble bubbles
fumee|smoke
brume brouillard|fog mist haze
eclipse ombre tenebres obscurite|eclipse shadow dark darkness
lumineux brillant briller|bright shine sparkle glow
etincelle etincelles|sparkle sparkles spark
explosion|explosion boom bomb
vol voler|fly flight wing
aile ailes|wing wings feather
plume plumes|feather
griffe griffes|claw paw
patte pattes|paw
oeuf oeufs|egg
`

function fold(text: string) {
  return text.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

/** Mot français (replié) → mots anglais. */
const frenchToEnglish = new Map<string, Set<string>>()
for (const line of lines.split("\n")) {
  const [french, english] = line.split("|")
  if (!french || !english) continue
  const targets = english.trim().split(/\s+/)
  for (const word of fold(french).split(" ")) {
    if (!word) continue
    const set = frenchToEnglish.get(word) ?? new Set<string>()
    for (const target of targets) set.add(target)
    frenchToEnglish.set(word, set)
  }
}
const frenchWords = [...frenchToEnglish.keys()]

export type IconSearchEntry = {
  /** Le nom gardé dans la feuille. */
  name: string
  /** Le nom de l'icône chez Lucide (kebab-case). */
  lucide: string
  label: string
  /** Mots français déjà connus (icônes de la liste d'Eraser). */
  french?: string
  /** Mots-clés anglais de Lucide. */
  tags?: readonly string[]
}

/** Les mots d'une icône, repliés : son nom anglais, ses mots-clés, ses mots français. */
export function iconHaystack(entry: IconSearchEntry) {
  const words = new Set<string>()
  for (const text of [entry.lucide, entry.name, entry.label, entry.french ?? "", ...(entry.tags ?? [])]) for (const word of fold(text).split(" ")) if (word) words.add(word)
  return [...words]
}

/**
 * Les mots anglais qu'un mot tapé peut désigner : lui-même, et les traductions des mots
 * français qui commencent par lui (« pers » → personne → person, user, people…).
 */
function expand(word: string) {
  const targets = new Set<string>()
  // Un mot français connu tel quel garde ses traductions (« feu » n'est pas « feuille ») ;
  // sinon, les mots français qui commencent par lui.
  const french = frenchToEnglish.has(word) ? [word] : word.length >= 3 ? frenchWords.filter((candidate) => candidate.startsWith(word)) : []
  for (const key of french) for (const target of frenchToEnglish.get(key)!) for (const part of fold(target).split(" ")) targets.add(part)
  targets.delete(word)
  return targets
}

/** Les petits mots d'une recherche qui ne désignent rien (« tête de mort »). */
const stopWords = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "un", "une", "et", "a", "au", "aux", "en", "the", "of", "a", "an"])

function matches(candidate: string, target: string) {
  return candidate === target || candidate === `${target}s` || candidate === `${target}es`
}

/**
 * Une note de pertinence (0 : ne correspond pas). Chaque mot tapé doit trouver un mot de
 * l'icône qui commence par lui ou par l'une de ses traductions ; un nom qui correspond
 * passe devant un simple mot-clé.
 */
export function iconSearchScore(query: string, entry: IconSearchEntry, haystack: string[]) {
  const typed = fold(query).split(" ").filter(Boolean)
  const words = typed.filter((word) => !stopWords.has(word))
  if (!words.length) return typed.length ? 0 : 1
  const nameWords = new Set(fold(`${entry.lucide} ${entry.label}`).split(" "))
  let score = 0
  for (const word of words) {
    let best = 0
    // Le mot tapé : un début de mot suffit (« pers », « sku »).
    for (const candidate of haystack) {
      if (!candidate.startsWith(word)) continue
      best = Math.max(best, (nameWords.has(candidate) ? 4 : 1) + (candidate === word ? 3 : 1))
    }
    // Ses traductions : le mot entier (ou son pluriel).
    for (const target of expand(word)) {
      for (const candidate of haystack) {
        if (!matches(candidate, target)) continue
        best = Math.max(best, (nameWords.has(candidate) ? 4 : 1) + 2)
      }
    }
    if (!best) return 0
    score += best
  }
  return score
}

export { fold as foldIconQuery }
