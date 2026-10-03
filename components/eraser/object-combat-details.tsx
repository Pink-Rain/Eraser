import { objectCombatColumns, type ObjectCombatFields } from "@/lib/inventory-schema"

/**
 * Compétence, Distance, Action, Dégâts d'un objet, sous sa description : seulement les
 * cases remplies dans l'index des objets. Rien n'est affiché si toutes sont vides.
 */
export function ObjectCombatDetails({ item, className = "" }: { item: ObjectCombatFields; className?: string }) {
  const filled = objectCombatColumns.flatMap((column) => {
    const value = item[column.key]?.trim()
    return value ? [{ label: column.header, value }] : []
  })
  if (!filled.length) return null
  return <dl className={`flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5 ${className}`}>
    {filled.map((entry) => <div key={entry.label} className="flex min-w-0 max-w-full gap-1">
      <dt className="shrink-0 font-semibold text-foreground/65">{entry.label} :</dt>
      <dd className="min-w-0 break-words text-muted-foreground">{entry.value}</dd>
    </div>)}
  </dl>
}
