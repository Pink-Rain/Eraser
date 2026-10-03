import { objectCombatColumns, type ObjectCombatFields } from "@/lib/inventory-schema"
import { CitedModifierNames, IndexRichText } from "@/components/eraser/index-references"
import { escapeRichText } from "@/components/eraser/rich-text"
import { fillObjectTemplateHtml, objectDistanceText } from "@/lib/object-combat"

/**
 * Compétence, Distance, Action, Valeur d'un objet, sous sa description : seulement les
 * cases remplies dans l'index des objets. Rien n'est affiché si toutes sont vides. Les
 * attributs s'affichent avec l'effet (`ObjectAttributesLine`).
 */
export function ObjectCombatDetails({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const filled = objectCombatColumns.flatMap((column) => {
    if (column.key === "attributes") return []
    const raw = item[column.key]?.trim()
    if (!raw) return []
    return [{ label: column.header, value: column.key === "distance" ? objectDistanceText(raw) : raw }]
  })
  if (!filled.length) return null
  return <dl className={`flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5 ${className}`}>
    {filled.map((entry) => <div key={entry.label} className="flex min-w-0 max-w-full gap-1">
      <dt className="shrink-0 font-semibold text-foreground/65">{entry.label} :</dt>
      <dd className="min-w-0 break-words text-muted-foreground">{entry.value}</dd>
    </div>)}
  </dl>
}

/** Les attributs d'un objet (« Épuisante, Fatigante »), affichés avec son effet. */
export function ObjectAttributesLine({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const attributes = item.attributes?.trim()
  if (!attributes) return null
  return <p className={`flex min-w-0 gap-1 text-xs leading-5 ${className}`}>
    <span className="shrink-0 font-semibold text-foreground/65">Attributs :</span>
    <span className="min-w-0 break-words text-muted-foreground"><CitedModifierNames names={attributes.split(/\s*[,;\n]\s*/).filter(Boolean)} /></span>
  </p>
}

/**
 * La description ou l'effet d'un objet hors du tableau : « {Valeur} » et les autres
 * colonnes de la ligne remplacées, puis les états, attributs et matériaux cités mis en
 * forme avec leur détail au survol. Le texte mis en forme prime sur le texte brut.
 */
export function ObjectText({ html, text, item, as = "span", className = "" }: { html?: string; text: string; item: ObjectCombatFields; as?: "div" | "span"; className?: string }) {
  const source = html?.trim() ? html : escapeRichText(text).replace(/\n/g, "<br>")
  return <IndexRichText html={source} fill={(safe) => fillObjectTemplateHtml(safe, item)} as={as} className={className} />
}
