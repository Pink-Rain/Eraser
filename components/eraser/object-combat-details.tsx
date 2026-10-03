import type { ObjectCombatFields, ObjectTraitLook } from "@/lib/inventory-schema"
import { IndexRichText, ModifierPills } from "@/components/eraser/index-references"
import { columnStyleCss } from "@/components/eraser/index-style"
import { matchChoice, objectColumnSpec } from "@/lib/index-columns"
import { cn } from "@/lib/utils"
import { escapeRichText } from "@/components/eraser/rich-text"
import { OBJECT_REFERENCE_INDEX } from "@/lib/index-references"
import { fillObjectTemplateHtml, objectDistanceText, objectModes } from "@/lib/object-combat"

const splitList = (value?: string) => (value ?? "").split(/\s*[,;\n|]\s*/).map((part) => part.trim()).filter(Boolean)

const plainValue = "whitespace-normal break-words [overflow-wrap:anywhere]"
/** Les couleurs des types d'action (ceux des sorts), pour une action qui n'a pas sa couleur. */
const actionColors = objectColumnSpec("Action", []).options ?? []
const separator = <span aria-hidden className="text-muted-foreground/50">·</span>

/**
 * Des valeurs d'une colonne en texte, sans étiquette, dans le style imposé de la colonne.
 * Une option de liste colorée (une action) prend sa couleur, si la colonne n'en impose pas.
 */
function StyledValues({ values, look, fallback }: { values: string[]; look?: ObjectTraitLook; /** Les couleurs par défaut des choix (actions changées pour un seul exemplaire). */ fallback?: Array<{ value: string; color?: string }> }) {
  const css = columnStyleCss(look?.style)
  return <span className="text-xs">{values.map((value, index) => {
    const color = !look?.style?.color ? (look?.options ? matchChoice(value, look.options)?.color : undefined) ?? (fallback ? matchChoice(value, fallback)?.color : undefined) : undefined
    return <span key={`${value}:${index}`}>{index > 0 && ", "}<span className={cn(plainValue, color && "font-medium", css.className)} style={{ ...(color ? { color } : {}), ...css.style }}>{value}</span></span>
  })}</span>
}

/**
 * Ce qui s'affiche sous l'effet d'un objet, sans titres. D'abord ses attributs (dans le
 * style de leur colonne de l'Index des objets), ses matériaux et ses runes (à leur couleur,
 * leur icône dans celle de leur colonne), avec leur nom et leur description au survol.
 * Puis, si elle est remplie, son action de rechargement (« Rechargement : »), son action,
 * sa distance et sa compétence, chacune dans le style de sa colonne. La Valeur n'y est
 * pas : elle s'écrit dans l'effet ({Valeur}).
 */
export function ObjectTraits({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const attributes = splitList(item.attributes)
  const materials = splitList(item.materials)
  const runes = splitList(item.runes)
  // Une arme à plusieurs modes (« 60 | 1 ») : une valeur par mode.
  const reloads = objectModes(item.reload).filter(Boolean)
  const actions = objectModes(item.action).filter(Boolean)
  const distances = objectModes(item.distance).filter(Boolean).map(objectDistanceText)
  const skills = splitList(item.skill)
  const looks = item.looks ?? {}
  const attributeLook = columnStyleCss(looks.attributes?.style)
  // L'icône d'un matériau ou d'une rune prend la couleur imposée à sa colonne dans l'objet.
  const columnColor = (key: "materials" | "runes") => { const color = looks[key]?.style?.color; return color && color !== "muted" ? color : undefined }
  const usage = [
    // « Rechargement : » distingue l'action de rechargement de l'action classique qui la suit.
    reloads.length ? <span key="reload" className="inline-flex flex-wrap items-baseline gap-1"><span className="text-[11px] text-muted-foreground">Rechargement :</span><StyledValues values={reloads} look={looks.reload} fallback={actionColors} /></span> : null,
    actions.length ? <StyledValues key="action" values={actions} look={looks.action} fallback={actionColors} /> : null,
    distances.length ? <StyledValues key="distance" values={distances} look={looks.distance} /> : null,
    skills.length ? <StyledValues key="skill" values={skills} look={looks.skill} /> : null,
  ].filter(Boolean)
  if (!attributes.length && !materials.length && !runes.length && !usage.length) return null
  return <div className={`grid gap-1 ${className}`}>
    {(attributes.length > 0 || materials.length > 0 || runes.length > 0) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {attributes.length > 0 && <span className="text-xs"><ModifierPills names={attributes} look={attributeLook} /></span>}
      {materials.length > 0 && <ModifierPills names={materials} iconColor={columnColor("materials")} />}
      {runes.length > 0 && <ModifierPills names={runes} iconColor={columnColor("runes")} />}
    </div>}
    {usage.length > 0 && <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {usage.map((part, index) => <span key={index} className="contents">{index > 0 && separator}{part}</span>)}
    </div>}
  </div>
}

/**
 * La description ou l'effet d'un objet hors du tableau : « {Valeur} » et les autres
 * colonnes de la ligne remplacées, puis les lignes d'index citées (menu « { ») affichées
 * avec leur nom actuel et leur détail au survol. Le texte mis en forme prime sur le texte brut.
 */
export function ObjectText({ html, text, item, as = "span", className = "" }: { html?: string; text: string; item: ObjectCombatFields & { id?: string }; as?: "div" | "span"; className?: string }) {
  const source = html?.trim() ? html : escapeRichText(text).replace(/\n/g, "<br>")
  // Les autres colonnes de l'objet (« {Prix} », « {Poids} ») sont lues dans sa ligne de l'index.
  const self = typeof item.id === "string" && item.id && !item.id.startsWith("PERSONNALISE-") ? { index: OBJECT_REFERENCE_INDEX, id: item.id } : undefined
  return <IndexRichText html={source} fill={(safe) => fillObjectTemplateHtml(safe, item)} self={self} as={as} className={className} />
}
