import type { ObjectCombatFields } from "@/lib/inventory-schema"
import { IndexRichText, ModifierPills, pillClass } from "@/components/eraser/index-references"
import { pillStyle } from "@/components/eraser/index-style"
import { classSpellCategory, classSpellCategoryTones } from "@/lib/class-spell-utils"
import { escapeRichText } from "@/components/eraser/rich-text"
import { fillObjectTemplateHtml, objectDistanceText } from "@/lib/object-combat"

const splitList = (value?: string) => (value ?? "").split(/\s*[,;\n]\s*/).map((part) => part.trim()).filter(Boolean)

/**
 * Ce qui s'affiche sous l'effet d'un objet, sans titres, dans la mise en forme de leurs
 * colonnes : d'abord ses attributs, matériaux et runes (survol : nom et description),
 * puis son action, sa distance et sa compétence. La Valeur n'y est pas : elle est écrite
 * dans l'effet ({Valeur}). Rien ne s'affiche pour les cases vides.
 */
export function ObjectTraits({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const modifiers = [...splitList(item.attributes), ...splitList(item.materials), ...splitList(item.runes)]
  const action = item.action?.trim()
  const distance = item.distance?.trim() ? objectDistanceText(item.distance) : ""
  const skills = splitList(item.skill)
  if (!modifiers.length && !action && !distance && !skills.length) return null
  return <div className={`grid gap-1 ${className}`}>
    {modifiers.length > 0 && <div className="flex flex-wrap gap-1"><ModifierPills names={modifiers} /></div>}
    {(action || distance || skills.length > 0) && <div className="flex flex-wrap gap-1">
      {action && <span className={`${pillClass} font-medium`} style={pillStyle(classSpellCategoryTones[classSpellCategory(action)].background)}>{action}</span>}
      {distance && <span className={`${pillClass} tabular-nums`}>{distance}</span>}
      {skills.map((skill, index) => <span key={`${skill}:${index}`} className={pillClass}>{skill}</span>)}
    </div>}
  </div>
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
