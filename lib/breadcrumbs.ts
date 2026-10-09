/**
 * Le fil d'Ariane de la barre du haut : les pages au-dessus de celle affichée, de la plus
 * générale à la plus proche (« Campagne - Les Cendres » › « PNJs »). La page affichée
 * elle-même et « Eraser » (l'accueil) sont ajoutées par la barre. Une étape sans page à
 * ouvrir (« Règles », « Personnages ») ouvre la liste de ce qu'elle contient ; une adresse
 * inconnue (identifiant brut) n'est jamais affichée.
 *
 * Comme dans l'explorateur de Windows, chaque étape a son contenu (`childrenOf`) : les pages
 * accessibles juste en dessous, tirées de la liste des pages autorisées du compte.
 */
import { indexPages } from "@/lib/index-pages"

/** `path` : l'adresse de l'étape, qu'elle soit une page (`href`) ou seulement un dossier. */
export type Crumb = { label: string; href?: string; path: string }
export type NavTarget = { label: string; href: string }

const fixed: Record<string, Omit<Crumb, "path">> = {
  "/regles": { label: "Règles" },
  "/regles/classes": { label: "Classes", href: "/regles/classes" },
  "/ressources": { label: "Index", href: "/ressources" },
  // « /campagne » renvoie à l’accueil : c’est un dossier, qui liste les campagnes.
  "/campagne": { label: "Campagnes" },
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
    if (known) { crumbs.push("href" in known && known.href ? { label: known.label, href: known.href, path: href } : { label: known.label, path: href }); continue }
    if (segments[0] === "campagne" && length === 2) {
      const id = decodeURIComponent(segments[1])
      crumbs.push({ label: `Campagne - ${campaignName(id) ?? "…"}`, href, path: href })
      continue
    }
    if (segments[0] === "campagne" && length === 3 && campaignPages[segments[2]]) crumbs.push({ label: campaignPages[segments[2]], href, path: href })
  }
  return crumbs
}

const pathOf = (href: string) => {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "")
  return path || "/"
}
const depthOf = (path: string) => path.split("/").filter(Boolean).length

/**
 * Le contenu d'une étape : les pages autorisées juste en dessous d'elle (« /personnage » :
 * les personnages ; « /campagne/X » : ses pages). Dans l'ordre de la liste, sans doublon.
 */
export function childrenOf(path: string, targets: NavTarget[]): NavTarget[] {
  const base = pathOf(path)
  const depth = depthOf(base)
  const seen = new Set<string>()
  return targets.flatMap((target) => {
    const own = pathOf(target.href)
    if (own === base || depthOf(own) !== depth + 1 || (base !== "/" && !own.startsWith(`${base}/`)) || seen.has(own)) return []
    seen.add(own)
    // Sous « Campagnes », le nom suffit.
    return [{ label: base === "/campagne" ? target.label.replace(/^Campagne - /, "") : target.label, href: target.href }]
  })
}

/**
 * Les grandes sections d'Eraser accessibles au compte (« Règles », « Index », « Campagnes »…),
 * chacune avec sa page quand elle en a une et son contenu : le menu de « Eraser ».
 */
export function sectionsOf(targets: NavTarget[]): Array<{ label: string; path: string; href?: string; children: NavTarget[] }> {
  const sections = new Map<string, { label: string; path: string; href?: string; children: NavTarget[] }>()
  for (const target of targets) {
    const own = pathOf(target.href)
    const first = own.split("/").filter(Boolean)[0]
    if (!first) continue
    const path = `/${first}`
    if (sections.has(path)) continue
    const known = fixed[path]
    const page = targets.find((candidate) => pathOf(candidate.href) === path)
    const label = known?.label ?? page?.label ?? first
    const href = known ? known.href : page?.href
    sections.set(path, { label, path, ...(href ? { href } : {}), children: [] })
  }
  for (const section of sections.values()) section.children = childrenOf(section.path, targets)
  return [...sections.values()]
}
