import type { CampaignRecord, CharacterRecord } from "@/lib/google-sheets"

/**
 * Le menu (AppShell) vit dans le layout : il ne se recharge pas quand une page crée
 * une campagne ou un personnage. La page l'annonce, le menu l'ajoute à sa liste et le
 * sélectionne aussitôt.
 */
export const campaignCreatedEvent = "eraser:campaign-created"
export const characterCreatedEvent = "eraser:character-created"

export function announceCreatedCampaign(campaign: CampaignRecord) {
  window.dispatchEvent(new CustomEvent(campaignCreatedEvent, { detail: campaign }))
}

export function announceCreatedCharacter(character: CharacterRecord) {
  window.dispatchEvent(new CustomEvent(characterCreatedEvent, { detail: character }))
}
