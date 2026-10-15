/**
 * Les mises en page qu'Eraser propose d'office pour un onglet, tant qu'aucune n'a été réglée
 * dans « Modifier » (comme ses cartes) : la fiche d'une créature, celle d'un PNJ (la même que
 * « Modifier un PNJ » des campagnes), le survol d'un état (ses niveaux), celui d'un
 * modificateur d'arme… Ce qu'Eraser dessinait à la main, exprimé avec le moteur pour qu'on
 * le voie dans l'éditeur, qu'on parte de lui, et qu'on réutilise ses blocs ailleurs.
 *
 * Sans mise en page d'Eraser, l'affichage automatique est lui aussi exprimé en mise en page
 * (`automaticLayoutFor`) : l'éditeur montre toujours le formulaire et le survol réellement
 * utilisés. Une mise en page enregistrée remplace tout cela ; « Automatique » y revient.
 */
import { foldName, isNameColumnSpec, normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { automaticFormLayout, automaticHoverLayout, formOf, layoutId, tabLayout, type IndexLayout, type LayoutField, type LayoutKind, type TabLayouts } from "@/lib/index-layouts"
import { creatureCharacteristics, creatureNoteHeader, isLongColumn, STATES_TAB, WEAPON_MODIFIERS_TAB } from "@/lib/world-index-definitions"

// Des identifiants fixes : la fiche ne se redessine pas (ni ne perd le champ en cours) à chaque affichage.
const row = (id: string, ...fields: LayoutField[]) => ({ id, fields })
const block = (id: string, blockValue: NonNullable<LayoutField["block"]>, extra: Omit<LayoutField, "column" | "block"> = {}): LayoutField => ({ column: `bloc:${id}`, block: blockValue, ...extra })

const creatureForm: IndexLayout = {
  aside: [{ column: "Portrait", hideLabel: true }],
  asideWidth: "md",
  sections: [
    {
      id: "identite",
      rows: [
        row("nom", { column: "Nom", span: 12, large: true }),
        row("type", { column: "Type", span: 4 }, { column: "Sous-type", span: 4 }, { column: "Rang", span: 4 }),
        row("gabarit", { column: "Taille", span: 3 }, { column: "Poids", span: 3 }, { column: "Dressable", span: 3 }, { column: "Organisation", span: 3 }),
        row("caractere", { column: "Comportement", span: 4 }, { column: "Langue", span: 4 }, { column: "Extension", span: 4 }),
      ],
    },
    {
      id: "lieux",
      title: "Où la trouver",
      rows: [
        row("lieu-1", { column: "Emplacement principal", span: 6 }, { column: "Rareté", span: 6 }),
        row("lieu-2", { column: "Emplacement secondaire", span: 6 }, { column: "Rareté secondaire", span: 6 }),
      ],
    },
    {
      id: "caracteristiques",
      title: "Caractéristiques",
      framed: true,
      // Sept caractéristiques : quatre puis trois par ligne.
      rows: [
        row("carac-1", ...creatureCharacteristics.slice(0, 4).map((column): LayoutField => ({ column, span: 3 }))),
        row("carac-2", ...creatureCharacteristics.slice(4).map((column): LayoutField => ({ column, span: 4 }))),
      ],
    },
    { id: "description", rows: [row("description", { column: creatureNoteHeader, span: 12, label: "Description, Histoire, Lore, Autre" })] },
    {
      id: "sorts",
      title: "Sorts",
      rows: [row("sorts-actifs", { column: "Sorts actifs", span: 12, label: "Actifs" }), row("sorts-passifs", { column: "Sorts passifs", span: 12, label: "Passifs" })],
    },
  ],
  rest: "show",
}

/** Les couleurs des tuiles de caractéristiques (celles de la fiche de personnage). */
const characteristicTileColors: Record<string, string> = { Force: "#397f88", Dextérité: "#397f88", Intelligence: "#397f88", Sagesse: "#397f88", Charisme: "#397f88", Rapidité: "#e8aa62", "Vie totale": "#e8aa62" }

/**
 * La fiche d'un PNJ, telle que « Modifier un PNJ » des campagnes la dessine : le portrait à
 * gauche, l'identité, les notes, puis les caractéristiques en tuiles, les sorts et le sac à
 * dos. Les champs propres à la campagne (vie actuelle, notes MJ) y sont aussi : dans
 * l'index, ils restent ceux de la bibliothèque.
 */
const npcForm: IndexLayout = {
  aside: [{ column: "Portrait", hideLabel: true }],
  asideWidth: "md",
  sections: [
    {
      id: "identite",
      rows: [
        row("nom", { column: "Nom du PNJ", span: 6, large: true }, { column: "Titre", span: 6 }),
        row("role", { column: "Classe / métier", span: 6, label: "Fonction / classe / métier" }, { column: "Peuple", span: 6 }),
        row("vie", { column: "Vie actuelle", span: 3 }, { column: "Vie totale", span: 3 }, { column: "Genre", span: 3 }, { column: "Âge", span: 3 }),
        row("notes", { column: "Notes joueurs", span: 12, label: "Notes · visibles pour les joueurs" }),
        row("notes-mj", { column: "Notes MJ", span: 12, label: "Notes MJ · visibles uniquement par le MJ" }),
        row("lore", { column: "Histoire / Lore", span: 12, label: "Description, Histoire, Lore, Autre" }),
      ],
    },
    {
      id: "caracteristiques",
      title: "Caractéristiques",
      icon: "shield",
      rows: [row("tuiles", block("carac-pnj", { kind: "tiles", columns: ["Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Rapidité", "Vie totale"], colors: characteristicTileColors, perRow: 7 }, { span: 12 }))],
    },
    {
      id: "sorts",
      title: "Sorts",
      icon: "wand-sparkles",
      rows: [row("sorts-actifs", { column: "Sorts actifs", span: 12, label: "Actifs" }), row("sorts-passifs", { column: "Sorts passifs", span: 12, label: "Passifs" })],
    },
    {
      id: "sac",
      title: "Sac à dos",
      icon: "backpack",
      look: "framed",
      rows: [row("inventaire", block("sac-pnj", { kind: "inventory", accept: "all", title: "Sac à dos" }, { span: 12, hideLabel: true }))],
    },
  ],
  rest: "show",
}

/** Le survol d'un état : son icône sur un médaillon, son type, ses niveaux (le niveau en cours mis en avant), les règles liées. */
const stateHover: IndexLayout = {
  aside: [],
  sections: [{
    id: "niveaux",
    rows: [row("paliers", block("niveaux-etat", { kind: "levels", levels: [{ label: "Niveau 1", column: "Description niveau 1" }, { label: "Niveau 2", column: "Description niveau 2" }], rules: "Règles liées aux états", rulesLabel: "Règles liées" }, { span: 12, hideLabel: true }))],
  }],
  rest: "hide",
  subtitle: "Type",
  medallion: { size: 40, tint: true },
  nameInAccent: true,
}

/** Le survol d'un attribut, d'un matériau ou d'une rune : son icône devant son nom (à sa couleur), sa description. */
const modifierHover: IndexLayout = {
  aside: [],
  sections: [{ id: "detail", rows: [row("description", { column: "Description", span: 12, hideLabel: true })] }],
  rest: "hide",
  icon: "Icône",
  accent: "{Couleur}",
  nameInAccent: true,
  width: "sm",
}

/** La mise en page d'office d'un onglet ; `null` : l'affichage automatique. */
export function builtinLayoutFor(index: string, tab: string, kind: LayoutKind): IndexLayout | null {
  if (index === "creatures" && tab === "Créatures" && kind === "form") return creatureForm
  if (index === "npcs" && kind === "form") return npcForm
  if (index === "states" && foldName(tab) === foldName(STATES_TAB) && kind === "hover") return stateHover
  if (index === "weapon-modifiers" && foldName(tab) === foldName(WEAPON_MODIFIERS_TAB) && kind === "hover") return modifierHover
  return null
}

/** La mise en page d'un onglet : celle réglée dans « Modifier », sinon celle d'Eraser. */
export function tabLayoutOrBuiltin(layouts: Record<string, TabLayouts> | null | undefined, index: string, tab: string, kind: LayoutKind) {
  return tabLayout(layouts, tab, kind) ?? builtinLayoutFor(index, tab, kind)
}

/** Les mises en page d'un onglet parmi celles d'un index (nom sans accents ni casse). */
export function tabLayoutsOf(layouts: Record<string, TabLayouts> | null | undefined, tab: string): TabLayouts | null {
  if (!layouts) return null
  return Object.entries(layouts).find(([name]) => foldName(name) === foldName(tab))?.[1] ?? null
}

/** Un formulaire d'un onglet par son identifiant (« principal » : l'étoilé), sinon celui d'Eraser. */
export function tabFormOrBuiltin(layouts: Record<string, TabLayouts> | null | undefined, index: string, tab: string, formId?: string | null) {
  return formOf(tabLayoutsOf(layouts, tab), formId) ?? builtinLayoutFor(index, tab, "form")
}

export type LayoutColumnInfo = { header: string; spec: IndexColumnSpec }

const descriptionWords = /description|effet|contenu|r[ée]sum[ée]|histoire|lore|biographie|d[ée]finition|note/i
const imageWords = /^(image|portrait|illustration|banni[eè]re)$/i

/**
 * L'affichage automatique d'un onglet, exprimé en mise en page à partir de ses colonnes :
 * la fiche deux champs par ligne (textes longs, sorts et galeries sur toute la ligne, les
 * images à droite) ; le survol avec l'image, le type et la description.
 */
export function automaticLayoutFor(kind: LayoutKind, columns: LayoutColumnInfo[]): IndexLayout {
  const infos = columns.map((column) => ({ header: column.header, spec: normalizeSpec(column.spec) }))
  const usable = infos.filter(({ spec }) => !["id", "auto-links", "ranked-links", "tab", "archived"].includes(spec.kind))
  if (kind === "form") {
    return automaticFormLayout(usable.map(({ header, spec }) => ({
      header,
      picture: spec.kind === "file" && spec.file?.accept === "image" && !spec.file.multiple,
      wide: isLongColumn(header) || spec.kind === "spells" || spec.kind === "actions" || (spec.kind === "file" && Boolean(spec.file?.multiple)),
    })))
  }
  const shown = usable.filter(({ spec }) => !["actions", "formula", "lookup", "rollup", "name", "name-form"].includes(spec.kind))
  const picture = shown.find(({ header, spec }) => (spec.kind === "file" && spec.file?.accept === "image") || imageWords.test(header))
  const description = shown.find(({ header }) => /^(description|d[ée]scription)$/i.test(header)) ?? shown.find(({ header }) => /^(effet|effets)$/i.test(header)) ?? shown.find(({ header, spec }) => descriptionWords.test(header) && spec.kind === "rich")
  const type = shown.find(({ header }) => /^(type|cat[ée]gorie)$/i.test(header))
  const color = shown.find(({ header, spec }) => spec.kind === "color" || foldName(header) === "couleur")
  const glyph = shown.find(({ spec }) => spec.kind === "glyph")
  return automaticHoverLayout(shown.map(({ header }) => ({ header, picture: picture?.header === header, description: description?.header === header, type: type?.header === header, color: color?.header === header, glyph: glyph?.header === header })))
}

/**
 * La mise en page réellement utilisée par un onglet : celle réglée, sinon celle d'Eraser,
 * sinon l'automatique écrite d'après ses colonnes. `builtin` dit qu'elle vient d'Eraser ou de
 * l'automatique (elle n'est pas enregistrée).
 */
export function effectiveLayoutFor(layouts: Record<string, TabLayouts> | null | undefined, index: string, tab: string, kind: LayoutKind, columns: LayoutColumnInfo[]): { layout: IndexLayout; source: "saved" | "eraser" | "automatic" } {
  const saved = tabLayout(layouts, tab, kind)
  if (saved) return { layout: saved, source: "saved" }
  const builtin = builtinLayoutFor(index, tab, kind)
  if (builtin) return { layout: builtin, source: "eraser" }
  return { layout: automaticLayoutFor(kind, columns), source: "automatic" }
}

/* ---------- Les formes de base de la fiche et du survol ---------- */

/** Ce que chaque colonne d'un onglet peut être dans une mise en page (le nom, l'image, la description…). */
export function layoutRoles(columns: LayoutColumnInfo[]) {
  const infos = columns.map((column) => ({ header: column.header, spec: normalizeSpec(column.spec) }))
  const usable = infos.filter(({ spec }) => !["id", "auto-links", "ranked-links", "tab", "archived", "actions"].includes(spec.kind))
  const name = usable.find(({ spec }) => isNameColumnSpec(spec))?.header ?? usable.find(({ header }) => /^nom\b/i.test(header))?.header ?? usable[0]?.header
  const images = usable.filter(({ header, spec }) => (spec.kind === "file" && spec.file?.accept === "image" && !spec.file.multiple) || imageWords.test(header))
  const image = images.find(({ header }) => !/ic[oô]ne|icon/i.test(header))?.header ?? images[0]?.header
  const glyph = usable.find(({ spec }) => spec.kind === "glyph")?.header ?? usable.find(({ header }) => /ic[oô]ne|icon/i.test(header))?.header
  const color = usable.find(({ header, spec }) => spec.kind === "color" || foldName(header) === "couleur")?.header
  const long = usable.filter(({ header, spec }) => header !== name && (isLongColumn(header) || descriptionWords.test(header)) && ["rich", "fixed", "linked"].includes(spec.kind)).map(({ header }) => header)
  const description = long.find((header) => /^(description|d[ée]scription)$/i.test(header)) ?? long[0]
  const choices = usable.filter(({ spec }) => ["choice", "linked-choice", "tab-sort"].includes(spec.kind)).map(({ header }) => header)
  const numbers = usable.filter(({ spec }) => ["number", "gauge", "formula", "rollup"].includes(spec.kind)).map(({ header }) => header)
  const wide = new Set([...images.map(({ header }) => header), ...long, ...usable.filter(({ spec }) => spec.kind === "spells" || spec.kind === "actions" || (spec.kind === "file" && Boolean(spec.file?.multiple))).map(({ header }) => header)])
  const short = usable.filter(({ header }) => header !== name && !wide.has(header) && !/ic[oô]ne|icon/i.test(header)).map(({ header }) => header)
  return { name, image, glyph, color, description, long, choices, numbers, short, all: usable.map(({ header }) => header) }
}

export type LayoutStarter = { key: string; label: string; hint: string; kind: LayoutKind; build: (columns: LayoutColumnInfo[]) => IndexLayout }

const starterRow = (...fields: LayoutField[]) => ({ id: layoutId(), fields })
const spanFor = (count: number): LayoutField["span"] => count >= 4 ? 3 : count === 3 ? 4 : count === 2 ? 6 : 12
/** Des champs côte à côte, par lignes de `perRow`. */
function packRows(headers: string[], perRow: number, extra: Partial<LayoutField> = {}) {
  const rows = []
  for (let at = 0; at < headers.length; at += perRow) {
    const slice = headers.slice(at, at + perRow)
    rows.push(starterRow(...slice.map((column): LayoutField => ({ column, span: spanFor(Math.min(perRow, slice.length)), ...extra }))))
  }
  return rows
}

/**
 * Les formes de base de la fiche et du survol, remplies d'office avec les colonnes de
 * l'onglet : des points de départ, à mélanger et à modifier ensuite. Celles d'Eraser pour un
 * onglet précis (créature, PNJ, état, modificateur) s'y ajoutent dans l'éditeur.
 */
export const layoutStarters: LayoutStarter[] = [
  { key: "auto", kind: "form", label: "Automatique", hint: "Deux champs par ligne, les textes longs sur toute la ligne, les images à droite.", build: (columns) => automaticLayoutFor("form", columns) },
  {
    key: "short", kind: "form", label: "Fiche courte", hint: "Le nom en grand, trois champs, la description ; rien d’autre.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const rows = [...(roles.name ? [starterRow({ column: roles.name, span: 12, large: true })] : []), ...packRows(roles.short.slice(0, 3), 3), ...(roles.description ? [starterRow({ column: roles.description, span: 12 })] : [])]
      return { aside: roles.image ? [{ column: roles.image, hideLabel: true }] : [], asideWidth: "sm", sections: [{ id: layoutId(), rows }], rest: "hide" }
    },
  },
  {
    key: "tabs", kind: "form", label: "Fiche à onglets", hint: "Identité, Description, Valeurs : chaque section en onglet ; le portrait reste à côté.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const identity = [...(roles.name ? [starterRow({ column: roles.name, span: 12, large: true })] : []), ...packRows(roles.short, 2)]
      const texts = roles.long.map((column) => starterRow({ column, span: 12 }))
      const values = roles.numbers.length ? [starterRow({ column: `bloc:${layoutId()}`, span: 12, hideLabel: true, block: { kind: "tiles", columns: roles.numbers.slice(0, 12), perRow: Math.min(6, roles.numbers.length) } })] : []
      const sections = [
        { id: layoutId(), title: "Identité", icon: "user", rows: identity },
        ...(texts.length ? [{ id: layoutId(), title: "Description", icon: "scroll-text", rows: texts }] : []),
        ...(values.length ? [{ id: layoutId(), title: "Valeurs", icon: "gauge", rows: values }] : []),
      ]
      return { aside: roles.image ? [{ column: roles.image, hideLabel: true }] : [], asideWidth: "md", sections, rest: "show", tabs: true }
    },
  },
  {
    key: "portrait", kind: "form", label: "Portrait à gauche", hint: "Le portrait dans la colonne latérale, l’identité en deux colonnes, les textes en dessous.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const rows = [...(roles.name ? [starterRow({ column: roles.name, span: 12, large: true })] : []), ...packRows(roles.short, 2)]
      return { aside: [...(roles.image ? [{ column: roles.image, hideLabel: true }] : []), ...(roles.glyph ? [{ column: roles.glyph }] : [])], asideWidth: "md", sections: [{ id: layoutId(), rows }, ...(roles.long.length ? [{ id: layoutId(), title: "Description", rows: roles.long.map((column) => starterRow({ column, span: 12 })) }] : [])], rest: "show" }
    },
  },
  {
    key: "columns", kind: "form", label: "Deux colonnes", hint: "Les champs se suivent sur deux colonnes égales ; les textes longs à la fin.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const fields = [...(roles.name ? [roles.name] : []), ...roles.short]
      return { aside: roles.image ? [{ column: roles.image, hideLabel: true }] : [], asideWidth: "sm", sections: [{ id: layoutId(), columns: 2, rows: fields.map((column) => starterRow({ column, span: 12, ...(column === roles.name ? { large: true } : {}) })) }, ...(roles.long.length ? [{ id: layoutId(), rows: roles.long.map((column) => starterRow({ column, span: 12 })) }] : [])], rest: "show" }
    },
  },
  {
    key: "framed", kind: "form", label: "Sections encadrées", hint: "Identité et Description dans un cadre titré, les Valeurs (nombres en tuiles) sur fond teinté.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const sections = [
        { id: layoutId(), title: "Identité", icon: "user", look: "framed" as const, rows: [...(roles.name ? [starterRow({ column: roles.name, span: 12, large: true })] : []), ...packRows(roles.short, 3)] },
        ...(roles.numbers.length ? [{ id: layoutId(), title: "Valeurs", icon: "gauge", look: "tinted" as const, rows: [starterRow({ column: `bloc:${layoutId()}`, span: 12, hideLabel: true, block: { kind: "tiles" as const, columns: roles.numbers.slice(0, 12), perRow: Math.min(6, roles.numbers.length) } })] }] : []),
        ...(roles.long.length ? [{ id: layoutId(), title: "Description", icon: "scroll-text", look: "framed" as const, rows: roles.long.map((column) => starterRow({ column, span: 12 })) }] : []),
      ]
      return { aside: roles.image ? [{ column: roles.image, hideLabel: true }] : [], asideWidth: "md", sections, rest: "show" }
    },
  },
  { key: "hover-auto", kind: "hover", label: "Automatique", hint: "Un médaillon si l’onglet a une image ou une icône, le type en sous-titre, la description.", build: (columns) => automaticLayoutFor("hover", columns) },
  {
    key: "hover-tiles", kind: "hover", label: "Survol à tuiles", hint: "Le nom, les choix en pastilles, les nombres en tuiles, une ligne de texte.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const rows = [
        ...(roles.choices.length ? packRows(roles.choices.slice(0, 3), 3) : []),
        ...(roles.numbers.length ? [starterRow({ column: `bloc:${layoutId()}`, span: 12, hideLabel: true, block: { kind: "tiles", columns: roles.numbers.slice(0, 8), perRow: Math.min(4, roles.numbers.length), short: true } })] : []),
        ...(roles.description ? [starterRow({ column: roles.description, span: 12, hideLabel: true })] : []),
      ]
      return { aside: [], sections: [{ id: layoutId(), rows }], rest: "hide", ...(roles.image || roles.glyph ? { medallion: { column: roles.image ?? roles.glyph, size: 44, round: true } } : {}), ...(roles.choices[0] ? { subtitle: roles.choices[0] } : {}), ...(roles.color ? { accent: `{${roles.color}}` } : {}), nameInAccent: true }
    },
  },
  {
    key: "hover-banner", kind: "hover", label: "Survol illustré", hint: "L’image en bannière au-dessus du nom, deux champs, la description.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      const rows = [...packRows(roles.short.slice(0, 2), 2), ...(roles.description ? [starterRow({ column: roles.description, span: 12, hideLabel: true })] : [])]
      return { aside: [], sections: [{ id: layoutId(), rows }], rest: "hide", ...(roles.image ? { banner: { column: roles.image, height: 110 } } : {}), ...(roles.choices[0] ? { subtitle: roles.choices[0] } : {}), ...(roles.color ? { accent: `{${roles.color}}` } : {}) }
    },
  },
  {
    key: "hover-medallion", kind: "hover", label: "Médaillon teinté", hint: "L’icône ou l’image sur un médaillon à la couleur de l’accent, le nom coloré, la description.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      return { aside: [], sections: [{ id: layoutId(), rows: roles.description ? [starterRow({ column: roles.description, span: 12, hideLabel: true })] : [] }], rest: "hide", medallion: { ...(roles.glyph || roles.image ? { column: roles.glyph ?? roles.image } : {}), size: 40, tint: true }, ...(roles.choices[0] ? { subtitle: roles.choices[0] } : {}), ...(roles.color ? { accent: `{${roles.color}}` } : {}), nameInAccent: true }
    },
  },
  {
    key: "hover-compact", kind: "hover", label: "Survol compact", hint: "Étroit : le nom, le type, une ligne de description. Rien d’autre.",
    build: (columns) => {
      const roles = layoutRoles(columns)
      return { aside: [], sections: [{ id: layoutId(), rows: roles.description ? [starterRow({ column: roles.description, span: 12, hideLabel: true })] : [] }], rest: "hide", ...(roles.choices[0] ? { subtitle: roles.choices[0] } : {}), width: "sm" }
    },
  },
]

/** Les formes d'Eraser pour un onglet (créature, PNJ, état, modificateur), si l'onglet en a une. */
export function eraserLayoutStarters(index: string, tab: string, kind: LayoutKind): Array<{ key: string; label: string; hint: string; layout: IndexLayout }> {
  const builtin = builtinLayoutFor(index, tab, kind)
  if (!builtin) return []
  const label = index === "creatures" ? "Fiche de créature" : index === "npcs" ? "Fiche de PNJ" : index === "states" ? "Survol d’un état" : index === "weapon-modifiers" ? "Survol d’un modificateur" : kind === "form" ? "Fiche d’Eraser" : "Survol d’Eraser"
  return [{ key: `eraser:${index}:${kind}`, label, hint: "Celle qu’Eraser dessine déjà pour ces lignes, exprimée avec le moteur.", layout: builtin }]
}
