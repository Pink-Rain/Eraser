/**
 * Le menu latéral d'Eraser, modifiable par les admins et les MJ (réglage commun à toute la
 * table, gardé sur le serveur partagé : lib/app-menu-store.ts). On y réordonne, renomme,
 * masque et regroupe les sections et les liens — ceux d'Eraser compris —, on y place les
 * pages du créateur de pages et des liens.
 *
 * Règles pures (la coque, l'éditeur, le serveur et les tests s'en servent) :
 * - le menu d'Eraser (`menuCatalog`) reste la référence : une entrée enregistrée qui n'y est
 *   plus est ignorée, une entrée d'Eraser absente du réglage (ajoutée par une version plus
 *   récente) apparaît à sa place d'origine ;
 * - masquer n'ouvre rien : les rôles de chaque entrée filtrent toujours ce que chacun voit ;
 * - l'admin garde toujours le Créateur de pages et l'éditeur du menu, même masqués ;
 * - un dossier du créateur de pages (« dossier:… », lib/page-folders.ts) se place comme une
 *   entrée : au premier niveau, c'est une section de ses pages (un groupe par sous-dossier) ;
 *   dans une section, la liste de ses pages. Une page publiée qu'on y range y apparaît d'elle-même.
 */
import type { SiteRole } from "@/lib/auth-types"

export type MenuIconKey = "home" | "map" | "user" | "scroll" | "library" | "flask" | "shield" | "file-plus" | "menu" | "link" | "folder" | "star"

/** Une entrée du menu d'Eraser. `dynamic` : son contenu dépend du compte (campagne choisie, index étoilés…). */
export type MenuCatalogEntry = {
  id: string
  label: string
  icon: MenuIconKey
  /** Les vues (rôles) qui la voient. */
  roles: SiteRole[]
  href?: string
  /** Section (dépliable) ; sinon un lien. */
  section?: boolean
  parent?: string
  /**
   * Contenu propre au compte : la campagne choisie, le personnage, les index étoilés, ou les
   * pages du créateur de pages rangées dans la section (`section-pages`, avec `place`).
   */
  dynamic?: "dossier" | "personnage" | "index-rouges" | "index-etoiles" | "section-pages"
  /** La section du créateur de pages dont `section-pages` montre les pages. */
  place?: string
  /** Un petit bouton à droite de l'entrée (« + » : nouvelle page). */
  action?: { href: string; label: string }
  /** Actif sur toutes les adresses qui commencent par `href`. */
  prefix?: boolean
  /** L'admin la garde toujours (on ne peut pas se fermer l'éditeur du menu). */
  locked?: boolean
}

const all: SiteRole[] = ["joueur", "mj", "admin"]
const managers: SiteRole[] = ["mj", "admin"]

export const MENU_EDITOR_HREF = "/pages/menu"
export const PAGES_HREF = "/pages"

/** Le menu d'Eraser, dans son ordre d'origine (une section avant ses liens). */
export const menuCatalog: MenuCatalogEntry[] = [
  { id: "accueil", label: "Accueil", icon: "home", roles: all, href: "/" },
  { id: "dossier", label: "Dossier de la campagne choisie", icon: "map", roles: ["mj"], dynamic: "dossier" },
  { id: "personnage", label: "Personnage choisi", icon: "user", roles: ["joueur"], dynamic: "personnage" },
  { id: "regles", label: "Règles", icon: "scroll", roles: all, href: "/regles", section: true, prefix: true },
  { id: "regles/classes", label: "Classe", icon: "link", roles: all, href: "/regles/classes", parent: "regles", prefix: true },
  { id: "regles/vocabulaire", label: "Vocabulaire", icon: "link", roles: all, href: "/regles/vocabulaire", parent: "regles" },
  { id: "regles/combat", label: "Combat", icon: "link", roles: all, href: "/regles/combat", parent: "regles" },
  { id: "regles/hors-combat", label: "Hors combat", icon: "link", roles: all, href: "/regles/hors-combat", parent: "regles" },
  { id: "regles/pages", label: "Pages créées dans Règles", icon: "file-plus", roles: all, parent: "regles", dynamic: "section-pages", place: "regles" },
  { id: "index-rouges", label: "Index à l’étoile rouge", icon: "star", roles: managers, dynamic: "index-rouges" },
  { id: "index", label: "Index", icon: "library", roles: managers, href: "/ressources", section: true, prefix: true },
  { id: "index/etoiles", label: "Index étoilés", icon: "star", roles: managers, parent: "index", dynamic: "index-etoiles" },
  { id: "index/pages", label: "Pages créées dans Index", icon: "file-plus", roles: managers, parent: "index", dynamic: "section-pages", place: "ressources" },
  { id: "bac-a-sable", label: "Bac à sable", icon: "flask", roles: managers, href: "/bac-a-sable", section: true, prefix: true },
  { id: "bac-a-sable/tabletop", label: "Tabletop", icon: "link", roles: managers, href: "/bac-a-sable/tabletop", parent: "bac-a-sable" },
  { id: "bac-a-sable/magasin", label: "Magasin", icon: "link", roles: managers, href: "/bac-a-sable/magasin", parent: "bac-a-sable" },
  { id: "bac-a-sable/pnjs", label: "PNJs", icon: "link", roles: managers, href: "/bac-a-sable/pnjs", parent: "bac-a-sable" },
  { id: "bac-a-sable/pages", label: "Pages créées dans Bac à sable", icon: "file-plus", roles: managers, parent: "bac-a-sable", dynamic: "section-pages", place: "bac-a-sable" },
  // Le créateur de pages (l'Index des pages, d'où l'on ouvre aussi l'éditeur du menu) : « + » crée une page.
  // Administrateurs seulement : un MJ lit les pages, il ne les construit pas.
  { id: "pages", label: "Pages", icon: "file-plus", roles: ["admin"], href: PAGES_HREF, prefix: true, locked: true, action: { href: "/pages?nouvelle=1", label: "Nouvelle page" } },
  { id: "administration", label: "Administration", icon: "shield", roles: ["admin"], href: "/administration", section: true, prefix: true },
  { id: "administration/comptes", label: "Comptes et rôles", icon: "link", roles: ["admin"], href: "/administration/comptes-et-roles", parent: "administration" },
  { id: "administration/google-drive", label: "Google Drive et Sheets", icon: "link", roles: ["admin"], href: "/administration/google-drive", parent: "administration" },
  { id: "administration/pages", label: "Pages créées dans Administration", icon: "file-plus", roles: ["admin"], parent: "administration", dynamic: "section-pages", place: "administration" },
]

const catalogById = new Map(menuCatalog.map((entry) => [entry.id, entry]))
export const catalogEntry = (id: string) => catalogById.get(id)

/* ---------- Le réglage enregistré ---------- */

/**
 * Une entrée du réglage : une entrée d'Eraser (son identifiant), une page (« page:… »), un
 * lien (« lien:… ») ou une section ajoutée (« groupe:… »). Libellé, icône et masquage
 * remplacent ceux d'origine ; `roles` ne vaut que pour les liens et sections ajoutés.
 */
export type MenuNode = {
  id: string
  label?: string
  icon?: string
  emoji?: string
  hidden?: boolean
  href?: string
  roles?: SiteRole[]
  children?: MenuNode[]
}

export type MenuLayout = { items: MenuNode[]; updatedAt: string; updatedBy: string }

const MAX_NODES = 300
const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""
const isCustomId = (id: string) => /^(page|lien|groupe|dossier):[A-Za-z0-9_-]{2,48}$/.test(id)
export const isFolderNode = (id: string) => id.startsWith("dossier:")

export const isSectionNode = (id: string) => id.startsWith("groupe:") || Boolean(catalogEntry(id)?.section)
/** Les entrées qui ne vivent qu'au premier niveau (sections, entrées du compte). */
const topOnly = (id: string) => isSectionNode(id) || ["dossier", "personnage", "index-rouges"].includes(id)

function cleanRoles(value: unknown): SiteRole[] | undefined {
  if (!Array.isArray(value)) return undefined
  const roles = (["joueur", "mj", "admin"] as SiteRole[]).filter((role) => value.includes(role))
  return roles
}

/** Une adresse de lien acceptée : une page d'Eraser (/…) ou un site https. */
export function cleanMenuHref(value: unknown) {
  const href = typeof value === "string" ? value.trim().slice(0, 500) : ""
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(href) && !/^\/api(\/|$)/.test(href)) return href
  return /^https:\/\/[^\s"'<>]+$/i.test(href) ? href : ""
}

function cleanNode(input: unknown, seen: Set<string>, depth: number, count: { n: number }): MenuNode | null {
  if (!input || typeof input !== "object" || count.n >= MAX_NODES) return null
  const raw = input as Record<string, unknown>
  const id = typeof raw.id === "string" ? raw.id : ""
  // Une entrée d'Eraser inconnue (retirée par une version plus récente) ou en double : ignorée.
  if (!id || seen.has(id) || (!catalogEntry(id) && !isCustomId(id))) return null
  if (depth > 0 && topOnly(id)) return null
  const entry = catalogEntry(id)
  if (depth === 0 && entry?.parent && entry.dynamic) return null
  // Les pages d'une section restent dans leur section (leur adresse est sous elle).
  if (entry?.dynamic === "section-pages" && depth === 0) return null
  seen.add(id)
  count.n += 1
  const node: MenuNode = { id }
  const label = text(raw.label, 80)
  if (label) node.label = label
  if (typeof raw.icon === "string" && /^[a-z0-9-]{1,60}$/.test(raw.icon)) node.icon = raw.icon
  const emoji = typeof raw.emoji === "string" ? [...raw.emoji.trim()].slice(0, 4).join("") : ""
  if (emoji) node.emoji = emoji
  if (raw.hidden === true) node.hidden = true
  if (id.startsWith("lien:")) {
    const href = cleanMenuHref(raw.href)
    if (!href || !label) { seen.delete(id); count.n -= 1; return null }
    node.href = href
  }
  if (id.startsWith("lien:") || id.startsWith("groupe:") || isFolderNode(id)) {
    const roles = cleanRoles(raw.roles)
    node.roles = roles ?? ["joueur", "mj", "admin"]
  }
  if (id.startsWith("groupe:") && !label) node.label = "Section"
  if (isSectionNode(id)) node.children = (Array.isArray(raw.children) ? raw.children : []).flatMap((child) => { const clean = cleanNode(child, seen, depth + 1, count); return clean ? [clean] : [] })
  return node
}

/** Un réglage reçu (éditeur, serveur partagé), remis en forme : ce qui n'est pas lisible est écarté. */
export function cleanMenuItems(input: unknown): MenuNode[] {
  const seen = new Set<string>()
  const count = { n: 0 }
  return (Array.isArray(input) ? input : []).flatMap((item) => { const clean = cleanNode(item, seen, 0, count); return clean ? [clean] : [] })
}

export function parseMenuLayout(input: unknown): MenuLayout | null {
  let value = input
  if (typeof value === "string") { try { value = JSON.parse(value) } catch { return null } }
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  return { items: cleanMenuItems(raw.items), updatedAt: text(raw.updatedAt, 40), updatedBy: text(raw.updatedBy, 120) }
}

/** Le menu d'Eraser tel qu'il est livré, sous forme de réglage. */
export function defaultMenuItems(): MenuNode[] {
  const top: MenuNode[] = []
  for (const entry of menuCatalog) {
    if (entry.parent) top.find((node) => node.id === entry.parent)?.children?.push({ id: entry.id })
    else top.push(entry.section ? { id: entry.id, children: [] } : { id: entry.id })
  }
  return top
}

/**
 * Le réglage complété : les entrées d'Eraser qui y manquent (nouvelles versions, réglage
 * ancien) reprennent leur place d'origine — dans leur section si elle est là, après l'entrée
 * qui les précède d'habitude.
 */
export function mergeMenu(items: MenuNode[] | null | undefined): MenuNode[] {
  const tree: MenuNode[] = JSON.parse(JSON.stringify(cleanMenuItems(items ?? defaultMenuItems()))) as MenuNode[]
  const present = new Set<string>()
  const walk = (nodes: MenuNode[]) => { for (const node of nodes) { present.add(node.id); if (node.children) walk(node.children) } }
  walk(tree)
  for (const [position, entry] of menuCatalog.entries()) {
    if (present.has(entry.id)) continue
    const parent = entry.parent ? tree.find((node) => node.id === entry.parent) : null
    const list = parent ? parent.children ??= [] : tree
    // Après l'entrée d'Eraser qui la précède d'habitude au même endroit, sinon en tête (ou en fin pour une section).
    const before = menuCatalog.slice(0, position).reverse().find((candidate) => (candidate.parent ?? "") === (entry.parent ?? "") && list.some((node) => node.id === candidate.id))
    const at = before ? list.findIndex((node) => node.id === before.id) + 1 : entry.parent ? list.length : 0
    list.splice(at, 0, entry.section ? { id: entry.id, children: [] } : { id: entry.id })
    present.add(entry.id)
  }
  return tree
}

/* ---------- Le menu tel que le voit un compte ---------- */

export type MenuPageEntry = { title: string; href: string; icon: string; emoji: string }

/** Un dossier du créateur de pages vu par un compte : son nom, ses pages lisibles (par titre), ses sous-dossiers. */
export type MenuFolderEntry = { label: string; pages: MenuPageEntry[]; children: string[] }

export type ResolvedMenuItem = {
  key: string
  label: string
  /** Icône d'Eraser (clé), ou icône / émoji choisis dans l'éditeur. */
  builtinIcon?: MenuIconKey
  icon?: string
  emoji?: string
  href?: string
  prefix?: boolean
  /** `dossier-pages` : les pages d'un dossier du créateur de pages, sous son nom (dans une section). */
  dynamic?: MenuCatalogEntry["dynamic"] | "dossier-pages"
  section?: boolean
  action?: { href: string; label: string }
  /** `section-pages`, `dossier-pages` : les pages publiées, lisibles par le compte. */
  pages?: MenuPageEntry[]
  /** `dossier` : les pages de chaque campagne. */
  campaignPages?: Record<string, MenuPageEntry[]>
  children?: ResolvedMenuItem[]
}

/**
 * Ce que voit un compte (`role` : sa vue) : les entrées ouvertes à ce rôle, non masquées,
 * les pages qu'il peut lire (`pages` : déjà filtrées par le serveur). Une section vide
 * disparaît (sauf les sections d'Eraser qui sont aussi des pages). Un admin retrouve
 * toujours le Créateur de pages et l'éditeur du menu.
 */
export function resolveMenu(items: MenuNode[] | null | undefined, context: { role: SiteRole; pages: Record<string, MenuPageEntry>; sectionPages?: Record<string, MenuPageEntry[]>; campaignPages?: Record<string, MenuPageEntry[]>; folders?: Record<string, MenuFolderEntry> }): ResolvedMenuItem[] {
  const tree = mergeMenu(items)
  const shown = new Set<string>()
  const folders = context.folders ?? {}
  // Une page placée une à une dans le menu (page, lien, entrée d'Eraser) n'y revient pas par son dossier.
  const explicit = new Set<string>()
  const walkExplicit = (nodes: MenuNode[]) => { for (const node of nodes) { const href = node.id.startsWith("page:") ? context.pages[node.id.slice(5)]?.href : node.href ?? catalogEntry(node.id)?.href; if (href && !node.hidden) explicit.add(href); if (node.children) walkExplicit(node.children) } }
  walkExplicit(tree)
  const folderPages = (id: string) => (folders[id]?.pages ?? []).filter((page) => !explicit.has(page.href))
  /** Les pages d'un dossier et de tous ses sous-dossiers, sans doublon. */
  const pagesUnder = (id: string, seen = new Set<string>()): MenuPageEntry[] => {
    const folder = folders[id]
    if (!folder || seen.has(id)) return []
    seen.add(id)
    const out = [...folderPages(id)]
    for (const child of folder.children) out.push(...pagesUnder(child, seen))
    return out.filter((page, at) => out.findIndex((other) => other.href === page.href) === at)
  }
  const folderShownTo = (node: MenuNode) => !node.hidden && (node.roles ?? []).includes(context.role)
  // Les pages placées une à une dans le menu (« page:… ») ou par leur dossier ne sont pas répétées dans leur section.
  const placed = new Set(menuPageIds(tree).flatMap((id) => context.pages[id] ? [context.pages[id].href] : []))
  const walkFolders = (nodes: MenuNode[]) => { for (const node of nodes) { if (isFolderNode(node.id) && folderShownTo(node)) for (const page of pagesUnder(node.id.slice(8))) placed.add(page.href); if (node.children) walkFolders(node.children) } }
  walkFolders(tree)
  const locked = (id: string) => context.role === "admin" && Boolean(catalogEntry(id)?.locked)
  function one(node: MenuNode, depth = 0): ResolvedMenuItem | null {
    if (node.hidden && !locked(node.id)) return null
    const entry = catalogEntry(node.id)
    let item: ResolvedMenuItem | null = null
    if (entry) {
      if (!entry.roles.includes(context.role)) return null
      item = { key: entry.id, label: node.label || entry.label, builtinIcon: entry.icon, href: entry.href, prefix: entry.prefix, dynamic: entry.dynamic, section: entry.section, ...(entry.action ? { action: entry.action } : {}) }
      if (entry.dynamic === "section-pages") {
        // Les pages placées ailleurs dans le menu n'y reviennent pas en double.
        const pages = (context.sectionPages?.[entry.place ?? ""] ?? []).filter((page) => !placed.has(page.href))
        if (!pages.length) return null
        item.pages = pages
      }
      if (entry.dynamic === "dossier" && context.campaignPages) item.campaignPages = context.campaignPages
    } else if (node.id.startsWith("page:")) {
      const page = context.pages[node.id.slice(5)]
      if (!page) return null
      item = { key: node.id, label: node.label || page.title, href: page.href, icon: node.icon || page.icon, emoji: node.emoji || page.emoji }
    } else if (node.id.startsWith("lien:")) {
      if (!node.href || !(node.roles ?? []).includes(context.role)) return null
      item = { key: node.id, label: node.label || node.href, href: node.href }
    } else if (node.id.startsWith("groupe:")) {
      if (!(node.roles ?? []).includes(context.role)) return null
      item = { key: node.id, label: node.label || "Section", section: true }
    } else if (isFolderNode(node.id)) {
      const id = node.id.slice(8)
      const folder = folders[id]
      if (!folder || !folderShownTo(node)) return null
      const label = node.label || folder.label
      if (depth > 0) {
        // Dans une section : ses pages (sous-dossiers compris), sous son nom.
        const pages = pagesUnder(id)
        if (!pages.length) return null
        item = { key: node.id, label, dynamic: "dossier-pages", pages }
      } else {
        // Au premier niveau : une section, ses pages puis un groupe par sous-dossier.
        const children: ResolvedMenuItem[] = [
          ...folderPages(id).map((page) => ({ key: `${node.id}>${page.href}`, label: page.title, href: page.href })),
          ...folder.children.flatMap((child) => { const pages = pagesUnder(child); return pages.length ? [{ key: `${node.id}>${child}`, label: folders[child]?.label ?? "Dossier", dynamic: "dossier-pages" as const, pages }] : [] }),
        ]
        if (!children.length) return null
        item = { key: node.id, label, builtinIcon: "folder", section: true, children }
        if (node.icon) item.icon = node.icon
        if (node.emoji) item.emoji = node.emoji
        shown.add(item.key)
        return item
      }
    }
    if (!item) return null
    if (node.icon) item.icon = node.icon
    if (node.emoji) item.emoji = node.emoji
    if (item.section) {
      item.children = (node.children ?? []).flatMap((child) => { const resolved = one(child, depth + 1); return resolved ? [resolved] : [] })
      if (!item.children.length && !item.href) return null
    }
    shown.add(item.key)
    return item
  }
  const out = tree.flatMap((node) => { const item = one(node); return item ? [item] : [] })
  if (context.role === "admin") {
    // Le garde-fou : même masqués ou rangés dans une section masquée, ils restent au menu de l'admin.
    for (const entry of menuCatalog.filter((candidate) => candidate.locked)) {
      if (!shown.has(entry.id)) out.push({ key: entry.id, label: entry.label, builtinIcon: entry.icon, href: entry.href, prefix: entry.prefix, ...(entry.action ? { action: entry.action } : {}) })
    }
  }
  return out
}

/** Les pages placées dans le menu (pour ne lire que celles-là). */
export function menuPageIds(items: MenuNode[] | null | undefined) {
  const ids: string[] = []
  const walk = (nodes: MenuNode[]) => { for (const node of nodes) { if (node.id.startsWith("page:")) ids.push(node.id.slice(5)); if (node.children) walk(node.children) } }
  walk(items ?? [])
  return ids
}

/**
 * L'éditeur du menu montre chaque page d'une section comme une entrée à part entière, qu'on
 * déplace, renomme ou masque comme les autres : les pages qu'une section montrait d'elle-même
 * (`section-pages`) y deviennent des « page:… », juste avant l'entrée automatique, qui ne garde
 * que les pages rangées là plus tard. Le menu montré ne change pas.
 */
export function expandSectionPages(items: MenuNode[], pagesByPlace: Record<string, string[]>): MenuNode[] {
  const tree = JSON.parse(JSON.stringify(items)) as MenuNode[]
  const present = new Set(menuPageIds(tree))
  for (const node of tree) {
    if (!node.children) continue
    const next: MenuNode[] = []
    for (const child of node.children) {
      const entry = catalogEntry(child.id)
      if (entry?.dynamic === "section-pages") {
        for (const id of pagesByPlace[entry.place ?? ""] ?? []) if (!present.has(id)) { present.add(id); next.push({ id: `page:${id}` }) }
      }
      next.push(child)
    }
    node.children = next
  }
  return tree
}

/** Les dossiers du créateur de pages placés dans le menu (pour ne calculer que ceux-là). */
export function menuFolderIds(items: MenuNode[] | null | undefined) {
  const ids: string[] = []
  const walk = (nodes: MenuNode[]) => { for (const node of nodes) { if (isFolderNode(node.id)) ids.push(node.id.slice(8)); if (node.children) walk(node.children) } }
  walk(items ?? [])
  return ids
}

/** L'entrée est-elle active pour cette adresse ? */
export function menuItemActive(item: Pick<ResolvedMenuItem, "href" | "prefix">, pathname: string) {
  if (!item.href || item.href.startsWith("http")) return false
  const href = item.href.split(/[?#]/)[0]
  if (pathname === href) return true
  return Boolean(item.prefix) && href !== "/" && pathname.startsWith(`${href}/`)
}

/**
 * Un MJ ne règle pas les entrées réservées aux admins (Administration et ses pages) : leur
 * libellé, leur icône et leur masquage restent ceux d'avant (`previous`) quand il enregistre.
 */
export function keepAdminEntries(items: MenuNode[], previous: MenuNode[] | null | undefined): MenuNode[] {
  const before = new Map<string, MenuNode>()
  const walk = (nodes: MenuNode[]) => { for (const node of nodes) { before.set(node.id, node); if (node.children) walk(node.children) } }
  walk(previous ?? [])
  const fix = (node: MenuNode): MenuNode => {
    const entry = catalogEntry(node.id)
    const children = node.children?.map(fix)
    if (!entry || entry.roles.includes("mj")) return children ? { ...node, children } : node
    const old = before.get(node.id)
    const kept: MenuNode = { id: node.id }
    if (old?.label) kept.label = old.label
    if (old?.icon) kept.icon = old.icon
    if (old?.emoji) kept.emoji = old.emoji
    if (old?.hidden) kept.hidden = true
    return children ? { ...kept, children } : kept
  }
  return items.map(fix)
}
