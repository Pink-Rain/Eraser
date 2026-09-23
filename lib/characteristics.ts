/**
 * Les sept caractéristiques des créatures et des PNJ, avec les couleurs de la fiche de
 * personnage : le bleu de Force, Dextérité, Intelligence, Sagesse et Charisme, l'orange
 * de la Rapidité pour la vitesse et la vie.
 */
export const characteristicOrder = ["Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Vitesse", "Vitalité"] as const

export type CharacteristicName = (typeof characteristicOrder)[number]

export function characteristicColor(name: string) {
  return name === "Vitesse" || name === "Vitalité" ? "#e8aa62" : "#397f88"
}

/** Abréviations pour les petites cases (tabletop, cartes de PNJ). */
export const characteristicShort: Record<CharacteristicName, string> = {
  Force: "FOR", Dextérité: "DEX", Intelligence: "INT", Sagesse: "SAG", Charisme: "CHA", Vitesse: "VIT", Vitalité: "VIE",
}

/** Les caractéristiques d'un PNJ : la Vitalité est sa vie totale, la Vitesse sa rapidité. */
export function npcCharacteristics(npc: { strength: number; dexterity: number; intelligence: number; wisdom: number; charisma: number; speed: number; totalHp: number }): Record<CharacteristicName, number> {
  return {
    Force: npc.strength, Dextérité: npc.dexterity, Intelligence: npc.intelligence, Sagesse: npc.wisdom,
    Charisme: npc.charisma, Vitesse: npc.speed, Vitalité: npc.totalHp,
  }
}

export const npcCharacteristicKeys = {
  Force: "strength", Dextérité: "dexterity", Intelligence: "intelligence", Sagesse: "wisdom",
  Charisme: "charisma", Vitesse: "speed", Vitalité: "totalHp",
} as const satisfies Record<CharacteristicName, string>
