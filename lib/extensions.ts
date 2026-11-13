/**
 * Les extensions d'Eraser : des morceaux de l'application qui vivent dans leur propre dépôt
 * GitHub, publiés à part, téléchargés et mis à jour par chaque installation sans réinstaller
 * Eraser. Règles pures, communes à la page d'administration, au serveur et aux tests ; le
 * téléchargement est dans lib/extensions-install.ts, les réglages dans lib/extensions-store.ts.
 *
 * Une extension est liée à Eraser ici, dans le code, jamais depuis l'application. Toutes les
 * installations reçoivent toutes les extensions liées, et tout compte connecté peut ouvrir leur
 * adresse : les droits se règlent par module, dans chaque extension (selon `eraser.account`), et
 * les API d'Eraser les vérifient toujours. Ne jamais renommer un identifiant déjà lié : il nomme
 * le dossier d'installation, l'adresse de la page et ses données sur le serveur partagé.
 *
 * Format d'une version publiée (Releases GitHub du dépôt de l'extension) :
 * - `eraser-extension.json` : le manifeste (`ExtensionManifest`) ;
 * - le paquet qu'il nomme (`eraser-extension.pack.gz` d'office) : un JSON compressé (gzip)
 *   `{ format: "eraser-extension-pack", files: { "main.js": "<base64>", … } }`, que
 *   `scripts/pack-extension.mjs` fabrique. Son empreinte SHA-256 est dans le manifeste.
 */

/**
 * La version de ce qu'Eraser offre aux extensions (`window.EraserExtensions`, l'objet donné à
 * `mount`, le contexte de leur partie serveur). Une extension qui en demande une plus récente
 * attend qu'Eraser soit à jour. À incrémenter quand on ajoute quelque chose dont une extension
 * aura besoin ; ne jamais retirer ce qu'une version précédente offrait.
 */
export const EXTENSION_API_VERSION = 6

export const EXTENSION_MANIFEST_ASSET = "eraser-extension.json"
export const EXTENSION_PACK_ASSET = "eraser-extension.pack.gz"
export const EXTENSION_PACK_FORMAT = "eraser-extension-pack"

export type ExtensionDefinition = {
  /** Identifiant stable : dossier d'installation, adresse `/extension/<id>`, clé des réglages. */
  id: string
  name: string
  description: string
  /** Le dépôt GitHub public qui publie l'extension (« Propriétaire/Nom »). */
  repository: string
}

/** Les extensions liées à Eraser. Une nouvelle s'ajoute ici, avec son dépôt. */
export const linkedExtensions: ExtensionDefinition[] = [
  { id: "doc", name: "Eraser Doc", description: "Les documents de campagne : lettres, affiches, parchemins à donner aux joueurs.", repository: "Pink-Rain/Eraser_doc" },
  { id: "map", name: "Eraser Map", description: "Le tabletop : cartes, tokens et table partagée en direct.", repository: "Pink-Rain/Eraser_map" },
  { id: "page", name: "Eraser Page", description: "L'atelier des pages : créer et modifier les pages d'Eraser et le menu.", repository: "Pink-Rain/Eraser_page" },
  { id: "craft", name: "Eraser Craft", description: "Les ateliers de fabrication des personnages : cuisine, alchimie et les autres à venir.", repository: "Pink-Rain/Eraser_craft" },
  { id: "note-mj", name: "Eraser Note MJ", description: "Le carnet du MJ de chaque campagne : notes, préparation des sessions et post-its sur tout.", repository: "Pink-Rain/Eraser_note_mj" },
]

export function linkedExtension(id: string): ExtensionDefinition | null {
  return linkedExtensions.find((extension) => extension.id === id) ?? null
}

export type ExtensionManifest = {
  id: string
  version: string
  /** La version d'`EXTENSION_API_VERSION` dont l'extension a besoin. */
  api: number
  /** Le module de ses pages (`/extension/<id>/…`) : il exporte `Page` (ou `mount`). Facultatif depuis l'API 3, si `boot` est là. */
  entry: string | null
  /** Feuilles de style posées avec ses pages. */
  styles: string[]
  /**
   * API 3 : le module lancé au démarrage d'Eraser, sur toutes les pages (`activate(eraser)`,
   * lib/extension-api.ts). Il pose ce que l'extension ajoute à l'application : emplacements,
   * fenêtres, styles, réactions au changement de page. Petit : le reste se charge à la demande.
   */
  boot: string | null
  /** API 3 : feuilles de style posées sur toutes les pages, après celles d'Eraser (servies avant l'affichage). */
  globalStyles: string[]
  /** Partie serveur facultative : un module qui exporte `default.fetch(requête, eraser)` ou `handle`. */
  server: string | null
  /** Le nom du paquet parmi les fichiers de la version publiée. */
  pack: string
  sha256: string
}

/** Un manifeste relu, ou null s'il est incomplet ou désigne un chemin hors de l'extension. */
export function parseExtensionManifest(value: unknown): ExtensionManifest | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const version = typeof raw.version === "string" ? raw.version.trim().replace(/^v/i, "") : ""
  const api = typeof raw.api === "number" && Number.isInteger(raw.api) && raw.api >= 1 ? raw.api : 0
  // Absent (null, "") : pas de page ; présent mais hors du dossier : manifeste refusé.
  const optionalPath = (value: unknown) => value === undefined || value === null || value === "" ? null : (typeof value === "string" && safeExtensionPath(value)) || undefined
  const paths = (value: unknown) => Array.isArray(value) ? value.map((item) => (typeof item === "string" ? safeExtensionPath(item) : null)) : []
  const entry = optionalPath(raw.entry)
  const boot = optionalPath(raw.boot)
  const styles = paths(raw.styles)
  const globalStyles = paths(raw.globalStyles)
  // Absente : pas de partie serveur. Présente mais hors du dossier : manifeste refusé.
  const server = raw.server === undefined || raw.server === null || raw.server === "" ? null : (typeof raw.server === "string" && safeExtensionPath(raw.server)) || undefined
  const pack = raw.pack === undefined ? EXTENSION_PACK_ASSET : typeof raw.pack === "string" && /^[\w.-]+$/.test(raw.pack) ? raw.pack : ""
  const sha256 = typeof raw.sha256 === "string" && /^[0-9a-f]{64}$/i.test(raw.sha256) ? raw.sha256.toLowerCase() : ""
  if (!/^[a-z0-9-]+$/.test(id) || !parseVersion(version) || !api || entry === undefined || boot === undefined || (!entry && !boot) || [...styles, ...globalStyles].some((style) => !style) || server === undefined || !pack || !sha256) return null
  return { id, version, api, entry, styles: styles as string[], boot, globalStyles: globalStyles as string[], server, pack, sha256 }
}

/**
 * Un chemin de fichier de l'extension, relatif et sans détour (« .. », chemin absolu, lecteur
 * Windows, barre oblique inverse) : null sinon. Rien d'une extension n'est écrit ni lu hors de
 * son dossier.
 */
/** Les fichiers qu'un paquet doit contenir pour que le manifeste tienne. */
export function manifestFiles(manifest: Pick<ExtensionManifest, "entry" | "styles" | "boot" | "globalStyles" | "server">) {
  return [manifest.entry, manifest.boot, ...manifest.styles, ...manifest.globalStyles, manifest.server].filter((path): path is string => Boolean(path))
}

/**
 * Les emplacements qu'Eraser offre aux extensions (`eraser.slots.add(nom, Composant)`), avec ce
 * que reçoit le composant dans `context`. C'est un contrat, gardé par tests/extensions.test.mjs :
 * on en ajoute, on n'en retire ni n'en renomme jamais, et on n'enlève jamais un champ de leur
 * contexte (on en ajoute). Un nouvel emplacement s'ajoute ici et là où il se rend
 * (`<ExtensionSlot name=… />`, components/eraser/extension-runtime.tsx).
 */
export const extensionSlots = {
  /** Au-dessus du contenu de chaque page. `context` : `{ pathname, viewRole }`. */
  "page.avant": "Au-dessus du contenu de chaque page",
  /** En dessous du contenu de chaque page. `context` : `{ pathname, viewRole }`. */
  "page.apres": "En dessous du contenu de chaque page",
  /** Dans l'en-tête de chaque page, avant la recherche (petits boutons). `context` : `{ pathname, viewRole }`. */
  "page.en-tete": "Dans l'en-tête de chaque page, à droite",
  /** Dans la barre latérale, sous le menu (des `SidebarMenuItem` de `@/components/ui/sidebar`). `context` : `{ pathname, viewRole }`. */
  "barre-laterale": "Dans la barre latérale, sous le menu",
  /** Au pied de la barre latérale, juste au-dessus du profil (des `SidebarMenuItem`). `context` : `{ pathname, viewRole }`. */
  "barre-laterale.pied": "Au pied de la barre latérale, au-dessus du profil",
  /** Au-dessus de tout, sur toutes les pages (fenêtres flottantes, effets). `context` : `{ pathname, viewRole }`. */
  "calque": "Au-dessus de tout, sur toutes les pages",
  /** Dans la fiche d'une ligne de n'importe quel index, sous ses champs. `context` : `{ index, id, tab, values }` (`values` : colonne → valeur). */
  "index.fiche": "Dans la fiche d'une ligne d'index, sous ses champs",
  /** Dans le pied de la fiche d'une ligne de n'importe quel index (petits boutons). `context` : comme `index.fiche`. */
  "index.fiche.actions": "Dans le pied de la fiche d'une ligne d'index",
  /**
   * Dans l'onglet Inventaire d'un personnage, à côté de la bourse et à sa hauteur (des ateliers de
   * fabrication, par exemple). Vide, il ne prend aucune place. `context` :
   * `{ characterId, readOnly }` (`readOnly` : le compte regarde sans pouvoir modifier).
   */
  "inventaire.bourse": "Dans l'inventaire d'un personnage, à côté de la bourse",
  /**
   * Sur la ligne d'une extension, dans Administration › Extensions (sa roue de réglages, par
   * exemple). `context` : `{ id, version }` (`version` : celle installée sur cet ordinateur, ou
   * `null`). Chaque extension vérifie `id` et ne s'affiche que sur sa propre ligne.
   */
  "administration.extension": "Sur la ligne d'une extension, dans Administration › Extensions",
  /**
   * API 6 : dans l'en-tête du tableau de bord d'une campagne, sous son titre (petits boutons).
   * `context` : `{ campaignId, campaignName, canManage }` (`canManage` : MJ de la campagne ou
   * admin ; les API vérifient toujours).
   */
  "campagne.en-tete": "Dans l'en-tête du tableau de bord d'une campagne",
  /**
   * API 6 : dans le Créateur de session, à la fin de la session choisie (MJ de la campagne et
   * admin seulement). `context` : `{ campaignId, sessionId, sessionName }`.
   */
  "session.preparation": "Dans le Créateur de session, à la fin de la session choisie",
} as const

export type ExtensionSlotName = keyof typeof extensionSlots

export const extensionSlotNames = Object.keys(extensionSlots) as ExtensionSlotName[]

/**
 * API 6 : les choses d'Eraser qu'une extension peut reconnaître dans la page (clic droit,
 * `eraser.menu.add`). Un élément qui en montre une porte `data-eraser-thing` (sa sorte),
 * `data-eraser-thing-id` et `data-eraser-thing-label` (`thingAttributes`) ; les images et les
 * liens vers une page d'Eraser sont reconnus seuls. C'est un contrat, gardé par
 * tests/extensions.test.mjs : on ajoute des sortes, on n'en retire ni n'en renomme jamais, et le
 * format de leur `id` ne change pas.
 */
export const extensionThingKinds = {
  /** Une ligne d'un index (créature, item, lieu, état…) : `id` « <index>/<identifiant> ». */
  "ligne": "Une ligne d'un index",
  /** Une référence citée dans un texte (« {État:Sérénité} ») : `id` « <index>/<identifiant> ». */
  "reference": "Une référence citée dans un texte",
  /** Un PNJ : `id` son identifiant. */
  "pnj": "Un PNJ",
  /** Un magasin : `id` son identifiant. */
  "magasin": "Un magasin",
  /** Un document de campagne : `id` son identifiant. */
  "document": "Un document de campagne",
  /** Un personnage : `id` son identifiant. */
  "personnage": "Un personnage",
  /** Une session d'une campagne : `id` son identifiant. */
  "session": "Une session",
  /** Un événement de campagne : `id` son identifiant. */
  "evenement": "Un événement de campagne",
  /** Une image (reconnue seule) : `id` son adresse. */
  "image": "Une image",
  /** Un lien vers une page d'Eraser (reconnu seul) : `id` son adresse (« /campagne/… »). */
  "lien": "Un lien vers une page d'Eraser",
} as const

export type ExtensionThingKind = keyof typeof extensionThingKinds

/** Une chose d'Eraser repérée dans la page. `href` : où l'ouvrir, si on le sait. */
export type ExtensionThing = { kind: ExtensionThingKind; id: string; label: string; href: string | null }

/** Les attributs qui font reconnaître une chose (à poser sur l'élément qui la montre). */
export function thingAttributes(thing: { kind: ExtensionThingKind; id: string; label?: string; href?: string | null } | null | undefined): Record<string, string> {
  if (!thing?.id) return {}
  return {
    "data-eraser-thing": thing.kind,
    "data-eraser-thing-id": thing.id,
    ...(thing.label ? { "data-eraser-thing-label": thing.label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 200) } : {}),
    ...(thing.href ? { "data-eraser-thing-href": thing.href } : {}),
  }
}

/**
 * Ce que montre une ligne d'index : un personnage ou un PNJ (leurs index d'entités) se reconnaissent
 * comme tels, toute autre ligne comme `ligne` (« <index>/<identifiant> »).
 */
export function indexRowThing(index: string, id: string, label: string, href: string | null = null): ExtensionThing | null {
  if (!index || !id) return null
  if (index === "characters") return { kind: "personnage", id, label, href }
  if (index === "npcs") return { kind: "pnj", id, label, href }
  return { kind: "ligne", id: `${index}/${id}`, label, href }
}

/** La campagne d'une adresse d'Eraser (« /campagne/<id>/… »), ou null. */
export function campaignOfPath(pathname: string): string | null {
  const match = /^\/campagne\/([^/?#]+)/.exec(pathname)
  return match ? decodeURIComponent(match[1]) : null
}

export function safeExtensionPath(value: string): string | null {
  const path = value.trim()
  if (!path || path.length > 300 || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[a-z]:/i.test(path)) return null
  const parts = path.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) return null
  return parts.join("/")
}

/** « 1.2.3 », « v1.2.3 », « 1.2.3-alpha.4 » → [1, 2, 3, 4] ; une version finale passe après ses préversions. */
export function parseVersion(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z]+\.(\d+))?$/i.exec(String(value || "").trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Infinity : Number(match[4])]
}

export function compareVersions(left: string, right: string) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < 4; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  return 0
}

const contentTypes: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  woff2: "font/woff2",
  woff: "font/woff",
  wasm: "application/wasm",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
}

export function extensionContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return contentTypes[extension] ?? "application/octet-stream"
}
