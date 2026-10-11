/**
 * Les mises en page qu'Eraser propose d'office pour un onglet, tant qu'aucune n'a été réglée
 * dans « Modifier » (comme ses cartes) : la fiche d'une créature, rangée comme l'ancienne
 * fiche dédiée. Une mise en page enregistrée la remplace ; « Automatique » y revient.
 */
import { tabLayout, type IndexLayout, type LayoutField, type LayoutKind, type TabLayouts } from "@/lib/index-layouts"
import { creatureCharacteristics, creatureNoteHeader } from "@/lib/world-index-definitions"

// Des identifiants fixes : la fiche ne se redessine pas (ni ne perd le champ en cours) à chaque affichage.
const row = (id: string, ...fields: LayoutField[]) => ({ id, fields })

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

/** La mise en page d'office d'un onglet ; `null` : l'affichage automatique. */
export function builtinLayoutFor(index: string, tab: string, kind: LayoutKind): IndexLayout | null {
  if (index === "creatures" && tab === "Créatures" && kind === "form") return creatureForm
  return null
}

/** La mise en page d'un onglet : celle réglée dans « Modifier », sinon celle d'Eraser. */
export function tabLayoutOrBuiltin(layouts: Record<string, TabLayouts> | null | undefined, index: string, tab: string, kind: LayoutKind) {
  return tabLayout(layouts, tab, kind) ?? builtinLayoutFor(index, tab, kind)
}
