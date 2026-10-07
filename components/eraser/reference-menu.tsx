"use client"

/**
 * Le menu « { » de l'éditeur de texte. On tape « { » (ou on clique sur le bouton {} de la
 * barre) et Eraser propose les colonnes de la ligne en cours, puis les index : « État »,
 * « Lieu », « Attribut »… Un index choisi, il propose ses lignes ; une ligne choisie, son
 * nom (avec son détail au survol) ou l'une de ses cases (sa valeur, sans survol).
 *
 * La référence est enregistrée comme un lien vers l'identifiant de la ligne : renommer la
 * ligne renomme toutes ses citations. Dans l'éditeur, elle forme un bloc qu'on efface
 * d'un coup ; son libellé est remis au nom actuel à l'ouverture.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { ChevronRight, LoaderCircle, Rows3, TableProperties, Tag } from "lucide-react"

import { loadReferenceCatalog, referenceCatalogDenied, resolveReference } from "@/components/eraser/reference-store"
import {
  entryColumns,
  entryRows,
  findEntry,
  foldReferenceText,
  matchesQuery,
  parseReferenceHref,
  rankByQuery,
  referenceHref,
  referenceLabel,
  referenceNameFromLabel,
  type ReferenceCatalog,
  type ReferenceEntry,
  type ReferenceRow,
} from "@/lib/index-references"

// ---------------------------------------------------------------------------
// La ligne en cours : « {Prix} » y lit sa propre case
// ---------------------------------------------------------------------------

/** L'index (et l'onglet) dont le texte édité fait partie. */
export type ReferenceScope = { index: string; tab?: string }

const ReferenceScopeContext = createContext<ReferenceScope | null>(null)

export function ReferenceScopeProvider({ scope, children }: { scope: ReferenceScope | null; children: ReactNode }) {
  return <ReferenceScopeContext.Provider value={scope}>{children}</ReferenceScopeContext.Provider>
}

// ---------------------------------------------------------------------------
// Les références déjà écrites
// ---------------------------------------------------------------------------

const ANCHORS = 'a[href^="/reference/"]'

// ---------------------------------------------------------------------------
// Ce qui flotte au-dessus de la zone (le menu, le champ d'une étiquette)
// ---------------------------------------------------------------------------

/**
 * Où poser ce qui flotte au-dessus d'une zone éditable. Dans une fenêtre (la fiche d'une
 * ligne, celle d'un PNJ…), il doit être dedans : une fenêtre garde pour elle le focus et
 * les clics. Posés hors d'elle, le menu « { » se refermait au premier clic sur une
 * proposition et le champ d'une étiquette ne recevait jamais le focus (il restait affiché).
 *
 * Une fenêtre centrée par `transform` devient le repère des positions `fixed` de ce qu'elle
 * contient : `place` convertit un point de l'écran dans ce repère.
 */
export function floatingLayer(node: Element | null) {
  const host = (node?.closest?.('[role="dialog"], [role="alertdialog"]') as HTMLElement | null) ?? document.body
  let origin = { left: 0, top: 0, bottom: window.innerHeight }
  let bounds = { right: window.innerWidth, bottom: window.innerHeight }
  if (host !== document.body) {
    const probe = document.createElement("div")
    probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none"
    host.append(probe)
    const start = probe.getBoundingClientRect()
    probe.style.top = "auto"
    probe.style.bottom = "0"
    const end = probe.getBoundingClientRect()
    probe.remove()
    origin = { left: start.left, top: start.top, bottom: end.top }
    // Une fenêtre qui défile coupe ce qui la dépasse : le menu reste dans ses bords.
    const style = window.getComputedStyle(host)
    if (style.overflowY !== "visible" || style.overflowX !== "visible") {
      const box = host.getBoundingClientRect()
      bounds = { right: Math.min(bounds.right, box.right), bottom: Math.min(bounds.bottom, box.bottom) }
    }
  }
  return {
    host,
    bounds,
    /** Un point de l'écran, en coordonnées `fixed` dans `host`. */
    left: (x: number) => x - origin.left,
    top: (y: number) => y - origin.top,
    /** La distance d'un point de l'écran au bas du repère (pour `bottom`). */
    bottom: (y: number) => origin.bottom - y,
  }
}

/**
 * Les références d'une zone éditable forment chacune un bloc (effacé d'un coup, jamais
 * modifié lettre à lettre) et reprennent le nom actuel de leur ligne. Le texte n'est pas
 * enregistré pour autant : il le sera avec la prochaine modification.
 */
export function prepareReferenceAnchors(root: HTMLElement, refreshLabels = true) {
  if (refreshLabels) rejoinStrayAnchors(root)
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>(ANCHORS)) {
    anchor.contentEditable = "false"
    if (!refreshLabels) continue
    // Une étiquette enregistrée pendant qu'on modifiait son texte n'est plus en cours de modification.
    delete anchor.dataset.editing
    const reference = parseReferenceHref(anchor.getAttribute("href") ?? "")
    // Un libellé réécrit à la main garde son texte.
    if (!reference || reference.custom) continue
    void resolveReference({ ...reference, name: referenceNameFromLabel(anchor.textContent ?? "") }).then((resolved) => {
      if (!resolved || !anchor.isConnected) return
      const next = referenceLabel(resolved.name, reference.column ? resolved.column ?? reference.column : undefined)
      if (next !== anchor.textContent) anchor.textContent = next
    })
  }
}

/**
 * Une étiquette posée en fin de ligne (de paragraphe) par une version d'avant se
 * retrouvait hors de sa ligne, seule dessous, sans moyen de l'y remonter :
 * `<div>Il est </div><a>Empoisonné</a> `. Elle rejoint sa ligne, avec ce qui la suit
 * jusqu'au prochain retour à la ligne. Rien n'est enregistré pour autant : le texte le
 * sera avec la prochaine modification.
 */
function rejoinStrayAnchors(root: HTMLElement) {
  for (const anchor of [...root.querySelectorAll<HTMLAnchorElement>(ANCHORS)]) {
    if (anchor.parentNode !== root) continue
    let line = anchor.previousSibling
    while (line && line.nodeType === Node.TEXT_NODE && !line.textContent) line = line.previousSibling
    if (!(line instanceof HTMLElement) || !/^(DIV|P)$/.test(line.tagName) || line.lastChild?.nodeName === "BR") continue
    // L'étiquette et la fin de sa ligne : jusqu'au prochain bloc ou retour à la ligne.
    const moved: Node[] = []
    for (let node: Node | null = anchor; node; node = node.nextSibling) {
      if (node.nodeName === "BR" || (node instanceof HTMLElement && /^(DIV|P|UL|OL|H2|H3|HR)$/.test(node.tagName))) break
      moved.push(node)
    }
    line.append(...moved)
  }
}

/**
 * Clic sur une étiquette : son texte se modifie en place (« Arc long » → « Arcs
 * longs », « Arc très long oui »), sans couper le lien vers la ligne ni son survol. Entrée
 * ou un clic ailleurs valide, Échap annule ; vider le texte efface l'étiquette. Réécrire
 * exactement le nom de la ligne lui rend son libellé automatique (il suit les renommages).
 * `changed` : le texte de la zone a changé (à enregistrer).
 */
export function editReferenceAnchor(anchor: HTMLAnchorElement, root: HTMLElement, changed: () => void) {
  const reference = parseReferenceHref(anchor.getAttribute("href") ?? "")
  // La valeur d'une case citée (« Arc long › Prix ») s'affiche telle quelle : rien à réécrire.
  if (!reference || reference.column || anchor.dataset.editing) return false
  const before = anchor.textContent ?? ""
  // Le nom actuel de la ligne : le réécrire rend l'étiquette automatique.
  let rowName = reference.custom ? "" : referenceNameFromLabel(before)
  void resolveReference({ index: reference.index, id: reference.id, name: rowName }).then((resolved) => { if (resolved?.name) rowName = resolved.name })
  anchor.dataset.editing = "1"
  // Un petit champ posé exactement sur l'étiquette : modifier le texte d'un lien directement
  // dans la zone fait glisser la frappe hors du lien (comportement des navigateurs).
  const rect = anchor.getBoundingClientRect()
  const style = window.getComputedStyle(anchor)
  const layer = floatingLayer(root)
  const input = document.createElement("input")
  input.type = "text"
  input.value = before
  input.setAttribute("aria-label", "Texte de l’étiquette")
  input.dataset.richTextPopover = ""
  Object.assign(input.style, {
    position: "fixed", left: `${layer.left(rect.left - 4)}px`, top: `${layer.top(rect.top - 3)}px`, zIndex: "400",
    width: `${Math.max(rect.width + 48, 140)}px`, height: `${rect.height + 6}px`, padding: "0 4px",
    font: style.font, color: style.color, background: "var(--background)",
    border: "1px solid var(--primary)", borderRadius: "6px", outline: "none", boxShadow: "0 4px 14px rgb(0 0 0 / 0.18)",
  } satisfies Partial<CSSStyleDeclaration>)
  let done = false
  const finish = (cancel: boolean) => {
    if (done) return
    done = true
    delete anchor.dataset.editing
    const text = input.value.replace(/\s+/g, " ").trim()
    input.remove()
    if (cancel || text === before.trim()) { root.focus(); return }
    if (!text) {
      // Vidée : l'étiquette est effacée (avec l'espace posé après elle).
      const next = anchor.nextSibling
      if (next?.nodeType === Node.TEXT_NODE && next.textContent?.startsWith("\u00a0")) next.textContent = next.textContent.slice(1)
      const caret = document.createRange()
      caret.setStartBefore(anchor)
      caret.collapse(true)
      anchor.remove()
      root.focus()
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(caret)
    } else {
      anchor.textContent = text
      const automatic = Boolean(rowName) && text === rowName
      anchor.setAttribute("href", referenceHref({ index: reference.index, id: reference.id, ...(automatic ? {} : { custom: true }) }))
      // Le curseur reprend juste après l'étiquette, dans la zone.
      root.focus()
      const after = document.createRange()
      after.setStartAfter(anchor)
      after.collapse(true)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(after)
    }
    changed()
  }
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); finish(false) }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(true) }
  })
  input.addEventListener("blur", () => finish(false))
  layer.host.append(input)
  input.focus()
  input.select()
  return true
}

// ---------------------------------------------------------------------------
// Ce qui est tapé depuis « { »
// ---------------------------------------------------------------------------

/** Le texte entre le dernier « { » et le curseur, dans le même morceau de texte. */
type Token = { node: Text; start: number; end: number; query: string }

function caretToken(root: HTMLElement): Token | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null
  const before = (node.textContent ?? "").slice(0, range.startOffset)
  const start = before.lastIndexOf("{")
  if (start < 0) return null
  const query = before.slice(start + 1).replace(/ /g, " ")
  if (query.includes("}") || query.includes("\n") || query.length > 120) return null
  return { node: node as Text, start, end: range.startOffset, query }
}

type Stage =
  | { kind: "start"; text: string }
  | { kind: "unknown"; text: string }
  | { kind: "rows"; entry: ReferenceEntry; text: string }
  | { kind: "row"; entry: ReferenceEntry; row: ReferenceRow; others: string }
  | { kind: "column"; entry: ReferenceEntry; row: ReferenceRow; text: string }

/**
 * « État » → les index ; « État:sér » → les états ; « État:Sérénité » → la ligne trouvée ;
 * « État:Sérénité:ty » → ses colonnes. Un nom qui contient lui-même « : » est reconnu.
 */
function stageOf(catalog: ReferenceCatalog, query: string): Stage {
  const colon = query.indexOf(":")
  if (colon < 0) return { kind: "start", text: query }
  const entry = findEntry(catalog, query.slice(0, colon))
  if (!entry) return { kind: "unknown", text: query.slice(0, colon) }
  const rest = query.slice(colon + 1)
  let row: ReferenceRow | null = null
  for (const candidate of entryRows(catalog, entry)) {
    const head = rest.slice(0, candidate.name.length)
    const after = rest.charAt(candidate.name.length)
    if ((after === "" || after === ":") && foldReferenceText(head) === foldReferenceText(candidate.name) && (!row || candidate.name.length > row.name.length)) row = candidate
  }
  if (row && rest.length === row.name.length) return { kind: "row", entry, row, others: rest }
  if (row) return { kind: "column", entry, row, text: rest.slice(row.name.length + 1) }
  return { kind: "rows", entry, text: rest }
}

type Option =
  | { kind: "self"; column: string }
  | { kind: "entry"; entry: ReferenceEntry }
  | { kind: "row"; entry: ReferenceEntry; row: ReferenceRow }
  | { kind: "name"; entry: ReferenceEntry; row: ReferenceRow }
  | { kind: "column"; entry: ReferenceEntry; row: ReferenceRow; column: string }

const LIMIT = 60

/** Les colonnes proposées pour une ligne : toutes, sauf l'identifiant. */
function citableColumns(columns: string[]) {
  return columns.filter((column) => !["id", "identifiant"].includes(foldReferenceText(column)))
}

function optionsOf(catalog: ReferenceCatalog, stage: Stage, scope: ReferenceScope | null): Option[] {
  if (stage.kind === "start") {
    const scoped = scope ? catalog.indexes.find((index) => index.key === scope.index) : undefined
    const columns = scoped ? citableColumns(scope?.tab ? entryColumns(catalog, scoped.key, scope.tab) : scoped.tabs[0]?.columns ?? []) : []
    // Les index d'abord, puis les cases de la ligne ; ce qui commence comme la frappe passe devant.
    const all: Option[] = [
      ...catalog.entries.map((entry): Option => ({ kind: "entry", entry })),
      ...columns.map((column): Option => ({ kind: "self", column })),
    ]
    return rankByQuery(all, (option) => option.kind === "entry" ? option.entry.label : option.kind === "self" ? option.column : "", stage.text).slice(0, LIMIT)
  }
  if (stage.kind === "rows") {
    return rankByQuery(entryRows(catalog, stage.entry), (row) => row.name, stage.text).slice(0, LIMIT).map((row): Option => ({ kind: "row", entry: stage.entry, row }))
  }
  if (stage.kind === "row") {
    const columns = citableColumns(entryColumns(catalog, stage.entry.index, stage.row.tab))
    const others = entryRows(catalog, stage.entry).filter((row) => row.id !== stage.row.id && matchesQuery(row.name, stage.others))
    const name: Option = { kind: "name", entry: stage.entry, row: stage.row }
    return [
      name,
      ...columns.map((column): Option => ({ kind: "column", entry: stage.entry, row: stage.row, column })),
      ...others.map((row): Option => ({ kind: "row", entry: stage.entry, row })),
    ].slice(0, LIMIT)
  }
  if (stage.kind === "column") {
    const columns = citableColumns(entryColumns(catalog, stage.entry.index, stage.row.tab))
    return rankByQuery(columns, (column) => column, stage.text).map((column): Option => ({ kind: "column", entry: stage.entry, row: stage.row, column }))
  }
  return []
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Remplace « {… » par `text` (le menu continue) ou par le lien d'une référence (le menu se ferme). */
function replaceToken(token: Token, content: { text: string } | { html: string }) {
  const selection = window.getSelection()
  if (!selection || !token.node.isConnected) return false
  const range = document.createRange()
  range.setStart(token.node, token.start)
  range.setEnd(token.node, Math.min(token.end, token.node.length))
  selection.removeAllRanges()
  selection.addRange(range)
  // execCommand : l'annulation (Ctrl+Z) et l'enregistrement suivent comme pour une frappe.
  if ("text" in content) document.execCommand("insertText", false, content.text)
  else document.execCommand("insertHTML", false, content.html)
  return true
}

function referenceHtml(option: Extract<Option, { kind: "name" | "column" }>) {
  const column = option.kind === "column" ? option.column : undefined
  const href = referenceHref({ index: option.entry.index, id: option.row.id, column })
  // Sans contenteditable="false" dans le HTML inséré : Chrome sortait alors l'étiquette du
  // paragraphe quand elle le terminait (elle passait seule à la ligne). Il est posé juste après.
  return `<a href="${escapeHtml(href)}">${escapeHtml(referenceLabel(option.row.name, column))}</a>&nbsp;`
}

// ---------------------------------------------------------------------------
// Le menu
// ---------------------------------------------------------------------------

type Position = { left: number; top?: number; bottom?: number }

function caretPosition(token: Token, layer: ReturnType<typeof floatingLayer>): Position {
  const range = document.createRange()
  range.setStart(token.node, Math.min(token.end, token.node.length))
  range.collapse(true)
  let rect: DOMRect | undefined = range.getClientRects()[0]
  if (!rect || (!rect.width && !rect.height && !rect.top)) rect = token.node.parentElement?.getBoundingClientRect()
  const left = Math.max(8, Math.min((rect?.left ?? 8) - 8, layer.bounds.right - 336))
  const below = (rect?.bottom ?? 0) + 6
  // Trop bas dans la fenêtre : le menu s'ouvre au-dessus de la ligne.
  return below + 320 > layer.bounds.bottom
    ? { left: layer.left(left), bottom: layer.bottom((rect?.top ?? 0) - 6) }
    : { left: layer.left(left), top: layer.top(below) }
}

/**
 * Le menu d'une zone éditable. Renvoie les gestionnaires à poser sur la zone et le menu à
 * afficher à côté d'elle. `enabled` : faux pour un texte brut ou en lecture seule.
 */
export function useReferenceMenu(editor: RefObject<HTMLDivElement | null>, enabled: boolean, afterInsert?: () => void) {
  const scope = useContext(ReferenceScopeContext)
  const active = useRef(false)
  const [token, setToken] = useState<Token | null>(null)
  const [catalog, setCatalog] = useState<ReferenceCatalog | null>(null)
  const [loading, setLoading] = useState(false)
  // La ligne surlignée, pour ce qui est tapé : une nouvelle frappe repart de la première.
  const [highlighted, setHighlighted] = useState({ query: "", index: 0 })
  const [position, setPosition] = useState<Position | null>(null)
  // Le menu est posé dans la fenêtre qui contient la zone (sinon dans la page).
  const [host, setHost] = useState<HTMLElement | null>(null)
  const list = useRef<HTMLDivElement>(null)
  // Rouvert de lui-même (on reprend un « {État:Empoi » laissé en plan) : il se retire si rien ne correspond.
  const resumed = useRef(false)
  // Le « { » dont le menu a été fermé par Échap : la frappe qui suit ne le rouvre pas.
  const dismissed = useRef<{ node: Text; start: number } | null>(null)

  const close = useCallback(() => {
    active.current = false
    resumed.current = false
    setToken(null)
  }, [])

  const refresh = useCallback(() => {
    const node = editor.current
    if (!active.current || !node) return
    const next = caretToken(node)
    if (!next) { close(); return }
    const layer = floatingLayer(node)
    setToken(next)
    setHost(layer.host)
    setPosition(caretPosition(next, layer))
  }, [close, editor])

  const open = useCallback((resume = false) => {
    if (referenceCatalogDenied()) return
    active.current = true
    resumed.current = resume
    dismissed.current = null
    setLoading(true)
    void loadReferenceCatalog().then((loaded) => {
      setLoading(false)
      // Un compte qui ne peut pas citer d'index (joueur) : « { » reste un simple caractère.
      if (!loaded) { close(); return }
      setCatalog(loaded)
    })
    refresh()
  }, [close, refresh])

  /** Échap : le menu se ferme, et ne revient pas tant qu'on continue d'écrire après ce « { ». */
  const dismiss = useCallback(() => {
    const node = editor.current
    const current = node ? caretToken(node) : null
    dismissed.current = current ? { node: current.node, start: current.start } : null
    close()
  }, [close, editor])

  // Le curseur déplacé (clic, flèches gauche/droite) : le menu suit ou se ferme.
  useEffect(() => {
    if (!token) return
    const onSelection = () => refresh()
    // Échap ferme le menu sans fermer la fenêtre qui contient l'éditeur.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current) return
      event.preventDefault()
      event.stopPropagation()
      dismiss()
    }
    document.addEventListener("selectionchange", onSelection)
    window.addEventListener("keydown", onEscape, true)
    return () => {
      document.removeEventListener("selectionchange", onSelection)
      window.removeEventListener("keydown", onEscape, true)
    }
  }, [close, dismiss, refresh, token])

  const stage = useMemo(() => catalog && token ? stageOf(catalog, token.query) : null, [catalog, token])
  const options = useMemo(() => catalog && stage ? optionsOf(catalog, stage, scope) : [], [catalog, scope, stage])
  const query = token?.query ?? ""
  const highlight = highlighted.query === query ? highlighted.index : 0
  const setHighlight = useCallback((next: number | ((current: number) => number)) => {
    setHighlighted((current) => {
      const from = current.query === query ? current.index : 0
      return { query, index: typeof next === "function" ? next(from) : next }
    })
  }, [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-option="${highlight}"]`)?.scrollIntoView({ block: "nearest" })
  }, [highlight])
  // Rouvert de lui-même sur un texte qui ne cite rien (« {vraiment} » écrit à la main) : il se retire.
  useEffect(() => {
    if (resumed.current && catalog && token && !options.length) close()
  }, [catalog, close, options.length, token])

  const choose = useCallback((option: Option) => {
    const current = editor.current ? caretToken(editor.current) : null
    if (!current) { close(); return }
    if (option.kind === "self") {
      close()
      replaceToken(current, { text: `{${option.column}}` })
      return
    }
    if (option.kind === "entry") { replaceToken(current, { text: `{${option.entry.label}:` }); return }
    if (option.kind === "row") { replaceToken(current, { text: `{${option.entry.label}:${option.row.name}` }); return }
    close()
    if (replaceToken(current, { html: referenceHtml(option) }) && editor.current) {
      prepareReferenceAnchors(editor.current, false)
      afterInsert?.()
    }
  }, [afterInsert, close, editor])

  /** « } » : la référence tapée en entier est terminée (le nom, ou la case nommée). */
  const finishTyped = useCallback(() => {
    if (!stage) return false
    if (stage.kind === "row") { choose({ kind: "name", entry: stage.entry, row: stage.row }); return true }
    if (stage.kind === "column") {
      const column = citableColumns(entryColumns(catalog!, stage.entry.index, stage.row.tab)).find((candidate) => foldReferenceText(candidate) === foldReferenceText(stage.text))
      if (column) { choose({ kind: "column", entry: stage.entry, row: stage.row, column }); return true }
      if (!stage.text.trim()) { choose({ kind: "name", entry: stage.entry, row: stage.row }); return true }
    }
    return false
  }, [catalog, choose, stage])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!token) return
    if (event.key === "}") {
      if (finishTyped()) { event.preventDefault(); event.stopPropagation() }
      else close()
      return
    }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return }
    if (!options.length) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      event.stopPropagation()
      setHighlight((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
      return
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      const option = options[Math.min(highlight, options.length - 1)]
      if (option) choose(option)
    }
  }, [choose, close, dismiss, finishTyped, highlight, options, setHighlight, token])

  /**
   * Clic sur une étiquette dans la zone qu'on écrit : son texte se modifie en place (le
   * lien ne s'ouvre pas). L'ouvrir passe par le clic droit (ici, nouvel onglet, nouvelle
   * fenêtre), le clic du milieu ou Ctrl+clic.
   */
  const onClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const root = editor.current
    // Revenir à la souris sur un « { » fermé par Échap : la frappe peut le rouvrir.
    dismissed.current = null
    const anchor = (event.target as HTMLElement).closest?.(ANCHORS) as HTMLAnchorElement | null
    if (!enabled || !root || !anchor || !root.contains(anchor) || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    // Une case citée (« Arc long › Prix ») montre sa valeur : rien à réécrire.
    editReferenceAnchor(anchor, root, () => root.dispatchEvent(new Event("input", { bubbles: true })))
  }, [editor, enabled])

  const onInput = useCallback((event: FormEvent<HTMLDivElement>) => {
    if (!enabled) return
    const native = event.nativeEvent as InputEvent
    if (native.data?.endsWith("{")) { open(); return }
    if (active.current) { refresh(); return }
    // Une citation laissée en plan (« {État:Empoi », le menu refermé) : continuer de l'écrire
    // rouvre le menu là où on en était.
    const node = editor.current
    const resumable = node && /^insert(Text|CompositionText)$|^delete/.test(native.inputType ?? "") ? caretToken(node) : null
    if (!resumable || (dismissed.current?.node === resumable.node && dismissed.current.start === resumable.start)) return
    open(true)
  }, [editor, enabled, open, refresh])

  /** Le curseur quitte la zone : le menu se ferme, un « { » fermé par Échap pourra être repris. */
  const onBlur = useCallback(() => {
    dismissed.current = null
    close()
  }, [close])

  const element = enabled && token && position && host?.isConnected ? createPortal(<div
    data-rich-text-popover=""
    role="listbox"
    aria-label="Citer une ligne d’index"
    onMouseDown={(event) => event.preventDefault()}
    className="fixed z-[300] w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
    style={position}
  >
    <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">{headerOf(stage)}</div>
    <div ref={list} className="max-h-72 overflow-y-auto p-1">
      {loading && !catalog ? <p className="flex items-center justify-center gap-2 px-2 py-5 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Lecture des index…</p>
        : options.length ? options.map((option, index) => <button
          key={optionKey(option)}
          type="button"
          data-option={index}
          role="option"
          aria-selected={index === highlight}
          onMouseEnter={() => setHighlight(index)}
          onClick={() => choose(option)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${index === highlight ? "bg-accent" : ""}`}
        >
          <OptionIcon option={option} />
          <span className="min-w-0 flex-1"><span className="block truncate">{optionLabel(option)}</span><span className="block truncate text-[11px] text-muted-foreground">{optionHint(option)}</span></span>
          {(option.kind === "entry" || option.kind === "row") && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
        </button>)
          : <p className="px-2 py-5 text-center text-xs text-muted-foreground">{stage?.kind === "unknown" ? `Aucun index ne s’appelle « ${stage.text} ».` : "Rien ne correspond."}</p>}
    </div>
    <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">↑↓ choisir · Entrée valider · <b>{"}"}</b> terminer · Échap fermer · clic sur une étiquette : changer son texte · clic droit : l’ouvrir</div>
  </div>, host) : null

  return { onKeyDown, onInput, onClick, onBlur, close, element, open }
}

function headerOf(stage: Stage | null) {
  if (!stage || stage.kind === "start") return "Une colonne de cette ligne, ou un index"
  if (stage.kind === "unknown") return "Index inconnu"
  if (stage.kind === "rows") return `${stage.entry.label} : choisis une ligne`
  return `${stage.row.name} : son nom, ou une de ses cases`
}

function optionKey(option: Option) {
  if (option.kind === "self") return `self:${option.column}`
  if (option.kind === "entry") return `entry:${option.entry.label}`
  if (option.kind === "column") return `column:${option.row.id}:${option.column}`
  return `${option.kind}:${option.row.id}`
}

function optionLabel(option: Option) {
  if (option.kind === "self") return `{${option.column}}`
  if (option.kind === "entry") return option.entry.label
  if (option.kind === "column") return option.column
  return option.row.name
}

function optionHint(option: Option) {
  if (option.kind === "self") return "Une case de cette ligne"
  if (option.kind === "entry") return option.entry.hint
  if (option.kind === "name") return "Le nom, avec son détail au survol"
  if (option.kind === "column") return `La case de ${option.row.name}, sans survol`
  return option.row.tab
}

function OptionIcon({ option }: { option: Option }) {
  const className = "size-3.5 shrink-0 text-muted-foreground"
  if (option.kind === "self" || option.kind === "column") return <TableProperties className={className} />
  if (option.kind === "entry") return <Rows3 className={className} />
  return <Tag className={className} />
}
