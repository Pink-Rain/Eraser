import { NextResponse } from "next/server"

import type { AppLinkTarget } from "@/lib/app-links"
import { listAllCampaignsForAdmin, listAllCharactersForAdmin, listCampaignsForMj, listCharactersForUser, listClassOptions } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les pages vers lesquelles un texte enrichi peut pointer, pour le sélecteur de lien de
 * l'éditeur : pages fixes selon le rôle, campagnes, personnages et classes accessibles.
 */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const manager = account.role === "admin" || account.role === "mj"
  const [classes, campaigns, characters] = await Promise.all([
    listClassOptions().catch(() => []),
    account.role === "admin" ? listAllCampaignsForAdmin().catch(() => []) : account.role === "mj" ? listCampaignsForMj(account.uid).catch(() => []) : Promise.resolve([]),
    account.role === "admin" ? listAllCharactersForAdmin().catch(() => []) : listCharactersForUser(account.uid).catch(() => []),
  ])
  const targets: AppLinkTarget[] = [
    { label: "Accueil", href: "/", group: "Pages" },
    { label: "Classes", href: "/regles/classes", group: "Règles" },
    { label: "Vocabulaire", href: "/regles/vocabulaire", group: "Règles" },
    { label: "Combat", href: "/regles/combat", group: "Règles" },
    { label: "Hors combat", href: "/regles/hors-combat", group: "Règles" },
  ]
  if (manager) {
    for (const [slug, label] of [
      ["index-des-classes", "Index des classes"], ["index-des-objets", "Index des objets"], ["index-des-creatures", "Index des créatures"],
      ["index-des-langues", "Index des langues"], ["index-des-lieux", "Index des lieux"], ["index-des-peuples", "Index des peuples"],
      ["index-des-religions", "Index des religions"], ["index-des-campagnes", "Index des campagnes"], ["index-des-personnages", "Index des personnages"],
      ["index-des-pnjs", "Index des PNJs"],
    ]) targets.push({ label, href: `/ressources/${slug}`, group: "Ressources" })
    targets.push(
      { label: "Tabletop", href: "/bac-a-sable/tabletop", group: "Bac à sable" },
      { label: "Magasin", href: "/bac-a-sable/magasin", group: "Bac à sable" },
      { label: "PNJs", href: "/bac-a-sable/pnjs", group: "Bac à sable" },
    )
  }
  const seenCampaigns = new Set<string>()
  const campaignLinks = (id: string, name: string) => {
    if (seenCampaigns.has(id)) return
    seenCampaigns.add(id)
    const base = `/campagne/${encodeURIComponent(id)}`
    targets.push({ label: `Campagne - ${name}`, href: base, group: "Campagnes" })
    if (!manager) return
    for (const [slug, label] of [["roll20", "Roll20"], ["lieux-et-rencontres", "Créateur de session"], ["evenements", "Événements"], ["magasin-et-fouille", "Magasins"], ["fouilles", "Fouilles"], ["pnjs", "PNJs"], ["tabletop", "Tabletop"]]) {
      targets.push({ label: `${label}`, href: `${base}/${slug}`, group: "Campagnes", hint: name })
    }
  }
  for (const campaign of campaigns) campaignLinks(campaign.id, campaign.name)
  for (const character of characters) {
    targets.push({ label: character.name, href: `/personnage/${encodeURIComponent(character.id)}`, group: "Personnages", hint: character.campaigns.map((campaign) => campaign.name).join(", ") || undefined })
    // Un joueur voit aussi les campagnes de ses personnages.
    for (const campaign of character.campaigns) if (!manager) campaignLinks(campaign.id, campaign.name)
  }
  for (const item of classes) targets.push({ label: item.name, href: `/regles/classes/${encodeURIComponent(item.id)}`, group: "Classes" })
  return NextResponse.json({ targets })
}
