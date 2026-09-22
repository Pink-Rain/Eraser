export const characterBaseHeaders = [
  "Nom personnage", "Peuple", "Classe", "Level", "Taille", "Poids", "Âge", "Autre", "Note",
  "Vie actuelle", "Vie totale", "Classe sociale", "Notoriété", "Alignement", "Moralité", "Folie", "Destin",
  "Bonus de dégâts physiques", "Bonus de dégâts magiques", "Armure physique", "Armure magique", "Rapidité",
  "Échec critique", "Réussite critique", "Langue parlée", "Capacité de combat", "Capacité de tir",
  "Capacité magique", "Constitution", "Force mentale", "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme",
] as const
export const characterNarrativeHeaders = ["Titre honorifique", "Portrait", "Religion", "But", "Personnalité", "Histoire"] as const

export const characterSkillGroups = [
  { characteristic: "Capacité de combat", characteristicIndex: 25, skills: ["Mains nues", "Maîtrise des armes lourdes", "Maîtrise des armes d’assaut", "Maîtrise des armes d’escrime", "Maîtrise des armes de contact"] },
  { characteristic: "Capacité de tir", characteristicIndex: 26, skills: ["Lancer / Précision", "Maîtrise des armes à poudre", "Maîtrise des armes paralysantes", "Maîtrise des arcs", "Maîtrise des arbalètes"] },
  { characteristic: "Capacité magique", characteristicIndex: 27, skills: ["Art de la magie", "Forge magie", "Utilisation d’artefacts", "Maîtrise des sceptres", "Maîtrise des tridents", "Maîtrise des bâtons magiques", "Maîtrise des baguettes magiques"] },
  { characteristic: "Constitution", characteristicIndex: 28, skills: ["Résistance aux blessures physiques", "Résistance aux blessures magiques", "Résistance au froid", "Résistance à la chaleur", "Résistance à la faim", "Résistance à la fatigue", "Résistance à la maladie", "Résistance aux chutes et collisions"] },
  { characteristic: "Force mentale", characteristicIndex: 29, skills: ["Volonté mentale", "Volonté physique", "Mémoire", "Intuition", "Courage", "Résistance au traumatisme"] },
  { characteristic: "Force", characteristicIndex: 30, skills: ["Parade", "Natation", "Poussage / Levage", "Escalade", "Athlétisme", "Ferronnerie"] },
  { characteristic: "Dextérité", characteristicIndex: 31, skills: ["Esquive / Réflexe", "Acrobatie", "Déplacement silencieux", "Dissimulation", "Dépeçage", "Adresse", "Conduite / Monture", "Couture"] },
  { characteristic: "Intelligence", characteristicIndex: 32, skills: ["Premiers secours", "Artisanat", "Estimation", "Enquête / Analyse", "Navigation", "Canotage", "Alchimie", "Connaissance de la flore", "Connaissance de la faune", "Connaissances historiques / géographiques", "Connaissance des sciences occultes", "Connaissances des sciences"] },
  { characteristic: "Sagesse", characteristicIndex: 33, skills: ["Perception", "Psychologie", "Fouille", "Sens de l’orientation", "Pistage / Filature", "Pêche", "Cuisine"] },
  { characteristic: "Charisme", characteristicIndex: 34, skills: ["Diplomatie", "Intimidation", "Bluff / Mensonge", "Commérage", "Interrogation", "Séduction", "Dressage", "Marchandage", "Persuasion", "Autorité", "Maîtrise des instruments de musique", "Arts du spectacle", "Enseignement", "Maquillage"] },
] as const

export const characterCharacteristics = characterSkillGroups.map(({ characteristic, characteristicIndex }) => ({ characteristic, characteristicIndex }))
export const characterSkills = characterSkillGroups.flatMap((group) => group.skills.map((name) => ({ name, characteristic: group.characteristic, characteristicIndex: group.characteristicIndex })))
export const innateCharacterSkills = new Set([
  "Mains nues", "Lancer / Précision", "Art de la magie", "Forge magie", "Utilisation d’artefacts",
  "Résistance aux blessures physiques", "Résistance aux blessures magiques", "Volonté mentale", "Volonté physique", "Mémoire",
  "Parade", "Natation", "Poussage / Levage", "Esquive / Réflexe", "Acrobatie", "Déplacement silencieux",
  "Premiers secours", "Artisanat", "Estimation", "Enquête / Analyse", "Perception", "Psychologie", "Fouille",
  "Sens de l’orientation", "Diplomatie", "Intimidation", "Bluff / Mensonge", "Commérage", "Interrogation",
])
export const characterSkillMetrics = [
  "Bonus/Malus de stats", "Modificateur de stats", "Total de stats",
  "Bonus/Malus de réussite critique", "Modificateur de réussite critique", "Total de réussite critique",
  "Bonus/Malus d’échec critique", "Modificateur d’échec critique", "Total d’échec critique",
] as const
export const characterCharacteristicCriticalHeaders = characterCharacteristics.flatMap(({ characteristic }) => [`${characteristic} — Réussite critique`, `${characteristic} — Échec critique`])
export const characterSecondaryCalculatedFields = [
  { valueIndex: 17, label: "Bonus de dégâts physiques" },
  { valueIndex: 18, label: "Bonus de dégâts magiques" },
  { valueIndex: 19, label: "Armure physique" },
  { valueIndex: 20, label: "Armure magique" },
  { valueIndex: 21, label: "Rapidité" },
  { valueIndex: 22, label: "Échec critique" },
  { valueIndex: 23, label: "Réussite critique" },
] as const
export const characterSecondaryCalculationHeaders = characterSecondaryCalculatedFields.flatMap(({ label }) => [`${label} — Bonus/Malus`, `${label} — Modificateur`])
export const characterValueHeaders = [...characterBaseHeaders, ...characterNarrativeHeaders, ...characterCharacteristicCriticalHeaders, ...characterSecondaryCalculationHeaders, ...characterSkills.flatMap((skill) => characterSkillMetrics.map((metric) => `${skill.name} — ${metric}`)), "Onglets personnalisés", "Sorts de classe choisis JSON"]
export const characterCustomTabsIndex = characterValueHeaders.length - 2
export const characterClassChoicesIndex = characterValueHeaders.length - 1
export const characterSheetHeaders = ["ID", "Joueur", ...characterValueHeaders]
export const characterNarrativeStart = characterBaseHeaders.length
export const characterCriticalStart = characterNarrativeStart + characterNarrativeHeaders.length
export const characterSecondaryCalculationStart = characterCriticalStart + characterCharacteristicCriticalHeaders.length
export const characterSkillsStart = characterSecondaryCalculationStart + characterSecondaryCalculationHeaders.length
export function characterSkillValueIndex(skillIndex: number, metricIndex: number) { return characterSkillsStart + skillIndex * characterSkillMetrics.length + metricIndex }
export function characterCriticalValueIndex(characteristicIndex: number, kind: "success" | "failure") { return characterCriticalStart + characteristicIndex * 2 + (kind === "failure" ? 1 : 0) }
export function characterSecondaryCalculationValueIndex(fieldIndex: number, kind: "bonus" | "modifier") { return characterSecondaryCalculationStart + fieldIndex * 2 + (kind === "modifier" ? 1 : 0) }
export function isEditableSkillMetric(metricIndex: number) { return metricIndex === 0 || metricIndex === 3 || metricIndex === 6 }
