import { foldName } from "@/lib/index-columns"

/*
 * La recherche des listes (liste, liste liée, colonne liée ↔) : ce qu'on commence à taper
 * propose les noms de l'index, les plus proches d'abord, fautes de frappe comprises
 * (« Epe » trouve « Épée », « Fortresse » trouve « Forteresse »). Rien à voir avec un nom
 * tapé à la main et séparé par des virgules : le bon nom se choisit, il ne se recopie plus.
 */

export type SearchableChoice = { value: string; hint?: string; group?: string; aliases?: string[] }

export type ChoiceHit<T> = {
  option: T
  /** 0 : le nom même ; 1 : il commence ainsi ; 2 : un de ses mots ; 3 : tous les mots tapés ; 4 : contenu ; 5 : indice, groupe ou autre écriture ; 6 : orthographe proche. */
  rank: number
  /** Trouvé malgré une faute de frappe (« proche »). */
  close: boolean
}

const WORD_BREAK = /[\s\-'’(),.:/]+/

function wordsOf(folded: string) {
  return folded.split(WORD_BREAK).filter(Boolean)
}

/** Les fautes tolérées selon la longueur tapée : aucune avant 4 lettres, puis une, puis deux. */
export function typoTolerance(length: number) {
  return length < 4 ? 0 : length < 7 ? 1 : 2
}

/**
 * Distance d'écriture (lettre en trop, en moins, changée ou deux lettres inversées),
 * abandonnée dès qu'elle dépasse `max` : la liste peut compter des milliers de noms.
 */
export function spellingDistance(left: string, right: string, max: number) {
  if (Math.abs(left.length - right.length) > max) return max + 1
  if (left === right) return 0
  let before = new Array<number>(right.length + 1)
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const current = new Array<number>(right.length + 1)
    current[0] = i
    let best = current[0]
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) value = Math.min(value, before[j - 2] + 1)
      current[j] = value
      if (value < best) best = value
    }
    if (best > max) return max + 1
    before = previous
    previous = current
  }
  return previous[right.length]
}

/** Ce qui est tapé est-il une faute de frappe de ce nom (en entier, d'un de ses mots, ou de son début) ? */
function closeness(query: string, value: string) {
  const max = typoTolerance(query.length)
  if (!max) return Infinity
  const candidates = [value, ...wordsOf(value)]
  // Un nom commencé avec une faute (« Fortres » pour « Forteresse ») : son début, à une lettre près.
  for (const length of [query.length - 1, query.length, query.length + 1]) if (length > 0 && length < value.length) candidates.push(value.slice(0, length))
  let best = Infinity
  for (const candidate of candidates) {
    const distance = spellingDistance(query, candidate, max)
    if (distance <= max && distance < best) best = distance
  }
  return best
}

/**
 * Les choix qui répondent à ce qui est tapé, du plus proche au plus lointain ; à rang égal,
 * l'ordre de la liste (alphabétique) est gardé. Sans rien de tapé : toute la liste.
 */
export function searchChoices<T extends SearchableChoice>(options: readonly T[], query: string, limit = 300): Array<ChoiceHit<T>> {
  const folded = foldName(query)
  if (!folded) return options.slice(0, limit).map((option) => ({ option, rank: 0, close: false }))
  const typed = wordsOf(folded)
  const hits: Array<ChoiceHit<T> & { order: number; distance: number }> = []
  options.forEach((option, order) => {
    const value = foldName(option.value)
    const words = wordsOf(value)
    const aliases = (option.aliases ?? []).map(foldName)
    let rank = -1
    let distance = 0
    if (value === folded || aliases.includes(folded)) rank = 0
    else if (value.startsWith(folded)) rank = 1
    else if (words.some((word) => word.startsWith(folded))) rank = 2
    else if (typed.length > 1 && typed.every((part) => words.some((word) => word.startsWith(part)))) rank = 3
    else if (value.includes(folded)) rank = 4
    else if (aliases.some((alias) => alias.includes(folded)) || foldName(`${option.hint ?? ""} ${option.group ?? ""}`).includes(folded)) rank = 5
    else {
      distance = Math.min(closeness(folded, value), ...aliases.map((alias) => closeness(folded, alias)))
      if (Number.isFinite(distance)) rank = 6
    }
    if (rank >= 0) hits.push({ option, rank, close: rank === 6, order, distance })
  })
  hits.sort((left, right) => left.rank - right.rank || left.distance - right.distance || left.order - right.order)
  return hits.slice(0, limit).map(({ option, rank, close }) => ({ option, rank, close }))
}

/** Plusieurs noms collés ou tapés d'un coup (« Fer, Épée ; Bois ») : un par nom, sans doublon. */
export function splitTypedNames(text: string) {
  const seen = new Set<string>()
  return text.split(/\s*[,;\n]\s*/).map((name) => name.replace(/\s+/g, " ").trim()).filter((name) => {
    const key = foldName(name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
