import type { ObjectCombatFields, ObjectTraitLook } from "@/lib/inventory-schema"
import { IndexRichText, ModifierPills, pillClass } from "@/components/eraser/index-references"
import { columnStyleCss, pillStyle } from "@/components/eraser/index-style"
import { matchChoice } from "@/lib/index-columns"
import { formatIndexNumber, parseIndexNumber, unitTone } from "@/lib/index-numbers"
import { cn } from "@/lib/utils"
import { escapeRichText } from "@/components/eraser/rich-text"
import { fillObjectTemplateHtml, objectModes } from "@/lib/object-combat"

const splitList = (value?: string) => (value ?? "").split(/\s*[,;\n|]\s*/).map((part) => part.trim()).filter(Boolean)

const plainValue = "inline-block max-w-full whitespace-normal break-words text-xs [overflow-wrap:anywhere]"

/** Une ou plusieurs valeurs d'une liste, comme dans leur colonne : seules, en texte ; à plusieurs, en pastilles. */
function ListValues({ values, look }: { values: string[]; look?: ObjectTraitLook }) {
  const css = columnStyleCss(look?.style)
  const boxed = values.length > 1
  return <>{values.map((value, index) => {
    const color = look?.options ? matchChoice(value, look.options)?.color : undefined
    if (color) return <span key={`${value}:${index}`} className={cn(pillClass, "font-medium", css.className)} style={{ ...pillStyle(color), ...css.style }}>{value}</span>
    return <span key={`${value}:${index}`} className={cn(boxed ? pillClass : plainValue, css.className)} style={css.style}>{value}</span>
  })}</>
}

/** Une distance comme dans sa colonne Nombre : le nombre (dans le style de la colonne) et la pastille de l'unité. */
function DistanceValue({ value, look }: { value: string; look?: ObjectTraitLook }) {
  const css = columnStyleCss(look?.style)
  const format = { unit: "distance" as const, defaultUnit: look?.unit ?? "m" }
  const parsed = parseIndexNumber(value, format)
  if (!parsed || parsed.unknown) return <span className={cn(plainValue, css.className)} style={css.style}>{value}</span>
  const unit = parsed.unit ?? format.defaultUnit
  const amount = formatIndexNumber(parsed, format, unit).replace(new RegExp(`\\s${unit}$`), "")
  return <span className="inline-flex items-center gap-1">
    <span className={cn("text-xs tabular-nums", css.className)} style={css.style}>{amount}</span>
    <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-none", unitTone("distance", unit) ?? "bg-muted")}>{unit}</span>
  </span>
}

/**
 * Ce qui s'affiche sous l'effet d'un objet, sans titres. D'abord ses attributs (dans le
 * rendu de leur colonne de l'Index des objets), ses matériaux et ses runes (à leur
 * couleur), avec leur nom et leur description au survol. Puis son action, sa distance et
 * sa compétence, chacune dans le rendu de sa colonne (style imposé, couleurs des options,
 * pastille d'unité). La Valeur n'y est pas : elle s'écrit dans l'effet ({Valeur}).
 */
export function ObjectTraits({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const attributes = splitList(item.attributes)
  const colored = [...splitList(item.materials), ...splitList(item.runes)]
  // Une arme à plusieurs modes (« 60 | 1 ») : une valeur par mode.
  const actions = objectModes(item.action).filter(Boolean)
  const distances = objectModes(item.distance).filter(Boolean)
  const skills = splitList(item.skill)
  const looks = item.looks ?? {}
  const attributeLook = columnStyleCss(looks.attributes?.style)
  if (!attributes.length && !colored.length && !actions.length && !distances.length && !skills.length) return null
  return <div className={`grid gap-1 ${className}`}>
    {(attributes.length > 0 || colored.length > 0) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {attributes.length > 0 && <ModifierPills names={attributes} look={attributeLook} />}
      {colored.length > 0 && <ModifierPills names={colored} />}
    </div>}
    {(actions.length > 0 || distances.length > 0 || skills.length > 0) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {actions.length > 0 && <ListValues values={actions} look={looks.action} />}
      {distances.map((distance, index) => <DistanceValue key={`${distance}:${index}`} value={distance} look={looks.distance} />)}
      {skills.length > 0 && <ListValues values={skills} look={looks.skill} />}
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
