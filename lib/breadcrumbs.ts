/**
 * Le fil d'Ariane de la barre du haut : les pages au-dessus de celle affichée, de la plus
 * générale à la plus proche (« Campagne - Les Cendres » › « PNJs »). La page affichée
 * elle-même et « Eraser » (l'accueil) sont ajoutées par la barre. Une étape sans page à
 * ouvrir (« Règles », « Bac à sable ») est un simple libellé ; une adresse inconnue
 * (identifiant brut) n'est jamais affichée.
 */
import { indexPages } from "@/lib/index-pages"

export type Crumb = { label: string; href?: string }

const fixed: Record<string, Crumb> = {
  "/regles": { label: "Règles" },
  "/regles/classes": { label: "Classes", href: "/regles/classes" },
  "/ressources": { label: "Index", href: "/ressources" },
  "/campagne": { label: "Campagnes", href: "/campagne" },
  "/personnage": { label: "Personnages" },
  "/administration": { label: "Administration", href: "/administration" },
  "/bac-a-sable": { label: "Bac à sable" },
  "/profil": { label: "Profil", href: "/profil" },
  "/reference": { label: "Référence" },
}

const campaignPages: Record<string, string> = {
  "roll20": "Roll20",
  "lieux-et-rencontres": "Créateur de session",
  "evenements": "Événements",
  "magasin-et-fouille": "Magasins",
  "fouilles": "Fouilles",
  "pnjs": "PNJs",
  "tabletop": "Tabletop",
}

/** `campaignName` : le nom d'une campagne d'après son identifiant, s'il est connu. */
export function breadcrumbsFor(pathname: string, campaignName: (id: string) => string | undefined = () => undefined): Crumb[] {
  const segments = pathname.split(/[?#]/)[0].split("/").filter(Boolean)
  const crumbs: Crumb[] = []
  // La dernière étape est la page affichée : seules celles au-dessus forment le fil.
  for (let length = 1; length < segments.length; length += 1) {
    const href = `/${segments.slice(0, length).join("/")}`
    const known = fixed[href] ?? indexPages.find((page) => page.href === href)
    if (known) { crumbs.push("href" in known && known.href ? { label: known.label, href: known.href } : { label: known.label }); continue }
    if (segments[0] === "campagne" && length === 2) {
      const id = decodeURIComponent(segments[1])
      crumbs.push({ label: `Campagne - ${campaignName(id) ?? "…"}`, href })
      continue
    }
    if (segments[0] === "campagne" && length === 3 && campaignPages[segments[2]]) crumbs.push({ label: campaignPages[segments[2]], href })
  }
  return crumbs
}
