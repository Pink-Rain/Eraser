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
import { foldName, normalizeSpec, type IndexColumnSpec } from "@/lib/index-columns"
import { automaticFormLayout, automaticHoverLayout, formOf, tabLayout, type IndexLayout, type LayoutField, type LayoutKind, type TabLayouts } from "@/lib/index-layouts"
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
