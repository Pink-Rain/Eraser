import type { ObjectCombatFields, ObjectTraitLook } from "@/lib/inventory-schema"
import { IndexRichText, ModifierPills } from "@/components/eraser/index-references"
import { columnStyleCss } from "@/components/eraser/index-style"
import { matchChoice } from "@/lib/index-columns"
import { cn } from "@/lib/utils"
import { escapeRichText } from "@/components/eraser/rich-text"
import { fillObjectTemplateHtml, objectDistanceText, objectModes } from "@/lib/object-combat"

const splitList = (value?: string) => (value ?? "").split(/\s*[,;\n|]\s*/).map((part) => part.trim()).filter(Boolean)

const plainValue = "whitespace-normal break-words [overflow-wrap:anywhere]"
const separator = <span aria-hidden className="text-muted-foreground/50">·</span>

/**
 * Des valeurs d'une colonne en texte, sans étiquette, dans le style imposé de la colonne.
 * Une option de liste colorée (une action) prend sa couleur, si la colonne n'en impose pas.
 */
function StyledValues({ values, look }: { values: string[]; look?: ObjectTraitLook }) {
  const css = columnStyleCss(look?.style)
  return <span className="text-xs">{values.map((value, index) => {
    const color = !look?.style?.color && look?.options ? matchChoice(value, look.options)?.color : undefined
    return <span key={`${value}:${index}`}>{index > 0 && ", "}<span className={cn(plainValue, color && "font-medium", css.className)} style={{ ...(color ? { color } : {}), ...css.style }}>{value}</span></span>
  })}</span>
}

/**
 * Ce qui s'affiche sous l'effet d'un objet, sans titres ni étiquettes. D'abord ses
 * attributs (dans le style de leur colonne de l'Index des objets), ses matériaux et ses
 * runes (à leur couleur), avec leur nom et leur description au survol. Puis, si elle est
 * remplie, son action de rechargement, son action, sa distance et sa compétence, chacune
 * dans le style de sa colonne. La Valeur n'y est pas : elle s'écrit dans l'effet ({Valeur}).
 */
export function ObjectTraits({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const attributes = splitList(item.attributes)
  const colored = [...splitList(item.materials), ...splitList(item.runes)]
  // Une arme à plusieurs modes (« 60 | 1 ») : une valeur par mode.
  const reloads = objectModes(item.reload).filter(Boolean)
  const actions = objectModes(item.action).filter(Boolean)
  const distances = objectModes(item.distance).filter(Boolean).map(objectDistanceText)
  const skills = splitList(item.skill)
  const looks = item.looks ?? {}
  const attributeLook = columnStyleCss(looks.attributes?.style)
  const usage = [
    reloads.length ? <StyledValues key="reload" values={reloads} look={looks.reload} /> : null,
    actions.length ? <StyledValues key="action" values={actions} look={looks.action} /> : null,
    distances.length ? <StyledValues key="distance" values={distances} look={looks.distance} /> : null,
    skills.length ? <StyledValues key="skill" values={skills} look={looks.skill} /> : null,
  ].filter(Boolean)
  if (!attributes.length && !colored.length && !usage.length) return null
  return <div className={`grid gap-1 ${className}`}>
    {(attributes.length > 0 || colored.length > 0) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {attributes.length > 0 && <span className="text-xs"><ModifierPills names={attributes} look={attributeLook} /></span>}
      {colored.length > 0 && <ModifierPills names={colored} />}
    </div>}
    {usage.length > 0 && <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {usage.map((part, index) => <span key={index} className="contents">{index > 0 && separator}{part}</span>)}
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
