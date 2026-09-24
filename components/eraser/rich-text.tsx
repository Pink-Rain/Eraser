"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from "react"
import { Bold, Check, Eraser, ExternalLink, FileText, Heading2, Italic, Link2, List, ListChecks, ListOrdered, LoaderCircle, Minus, Palette, Search, Strikethrough, Underline, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { internalAppPath, type AppLinkTarget } from "@/lib/app-links"
import { normalizeCssColorToHex } from "@/lib/google-sheet-rich-text"

/**
 * Le moteur d'édition de texte d'Eraser. Tout ce qui se saisit en texte enrichi dans
 * l'application passe par ici : cellules des index, notes et récits d'une fiche,
 * descriptions et effets d'objets, fiches de PNJ, relations, campagnes.
 *
 * Deux règles portent tout le reste :
 *
 * 1. Le contenu appartient au navigateur. Il est posé une seule fois au montage et
 *    React n'en a plus connaissance — ni enfants, ni `dangerouslySetInnerHTML`. React
 *    réécrit le contenu d'un élément modifiable à chaque rendu, même quand la valeur
 *    n'a pas changé, ce qui renvoie le curseur au début et efface la frappe en cours.
 * 2. Les commandes passent par `document.execCommand`. L'API est marquée obsolète
 *    mais reste la seule à gérer correctement la bascule (regras, dé-italique…), les
 *    sélections partielles et les imbrications. La réécrire à la main revenait à
 *    empiler les mises en forme sans jamais pouvoir les retirer.
 */

const allowedTags = "strong|b|em|i|u|s|br|p|div|ul|ol|li|a|span|h2|h3|hr|input"

function colorFromTag(tag: string) {
  const style = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] || ""
  const styleColor = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1] || ""
  const attributeColor = tag.match(/\bcolor\s*=\s*["']([^"']+)["']/i)?.[1] || ""
  return normalizeCssColorToHex(styleColor || attributeColor)
}

export function sanitizeRichText(html: string) {
  return String(html ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/☑/g, '<input type="checkbox" checked>')
    .replace(/☐/g, '<input type="checkbox">')
    .replace(/<font\b[^>]*>/gi, (tag) => { const color = colorFromTag(tag); return color ? `<span style="color:${color}">` : "<span>" })
    .replace(/<\/font\s*>/gi, "</span>")
    .replace(/<span\b[^>]*>/gi, (tag) => { const color = colorFromTag(tag); return color ? `<span style="color:${color}">` : "<span>" })
    .replace(/<input\b[^>]*>/gi, (tag) => `<input type="checkbox"${/\schecked(?:\s|=|>)/i.test(tag) ? " checked" : ""}>`)
    .replace(new RegExp(`<(?!/?(?:${allowedTags})\\b)[^>]*>`, "gi"), "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, href: string) => {
      // Une page d'Eraser : lien relatif, ouvert sur place.
      const internal = internalAppPath(href.replace(/&amp;/g, "&"))
      if (internal) return `<a href="${internal.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`
      try {
        const url = new URL(href)
        return ["http:", "https:"].includes(url.protocol) ? `<a href="${url.toString().replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">` : "<a>"
      } catch { return "<a>" }
    })
    .replace(/<(strong|b|em|i|u|s|br|p|div|ul|ol|li|h2|h3|hr)\b[^>]*>/gi, "<$1>")
    .replace(/<b>/gi, "<strong>").replace(/<\/b>/gi, "</strong>")
    .replace(/<i>/gi, "<em>").replace(/<\/i>/gi, "</em>")
    .replace(/\s(?:on\w+|class|id)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "")
}

/** Texte brut d'un contenu enrichi : les retours à la ligne HTML redeviennent des « \n ». */
export function richTextPlainText(html: string) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h2|h3)>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Échappe un texte brut pour l'injecter dans une zone éditable sans interpréter de balise. */
export function escapeRichText(text: string) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export const richTextColors = ["#1f1b16", "#b3261e", "#7f1d1d", "#315b55", "#285f8f", "#6b4c9a", "#b7791f"]

export type RichTextCommand =
  | "bold" | "italic" | "underline" | "strike"
  | "heading" | "bulletList" | "orderedList" | "rule" | "checkbox"
  | "link" | "color" | "clear"

/** Classes de rendu d'un contenu enrichi, identiques en lecture et en édition. */
export const richTextRendering = "[&_a]:underline [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-border [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_input]:mr-2 [&_input]:accent-primary"

export type RichTextTarget = { node: HTMLElement; flush: () => void }

function selectionInside(node: HTMLElement) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  return node.contains(range.commonAncestorContainer) ? range : null
}

export function rememberRichTextSelection(node: HTMLElement | null, saved: MutableRefObject<Range | null>) {
  if (!node) return
  const range = selectionInside(node)
  if (range) saved.current = range.cloneRange()
}

function restoreSelection(node: HTMLElement, saved: MutableRefObject<Range | null>, force = false) {
  if (!force && selectionInside(node)) return
  const range = saved.current
  if (!range || !node.contains(range.commonAncestorContainer)) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Bloc contenant la sélection, à l'intérieur de la zone éditable. */
function enclosingBlock(node: HTMLElement) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  let candidate: Node | null = selection.getRangeAt(0).commonAncestorContainer
  while (candidate && candidate !== node) {
    if (candidate instanceof HTMLElement && /^(h2|h3|p|div|li|blockquote)$/i.test(candidate.tagName)) return candidate
    candidate = candidate.parentNode
  }
  return null
}

/**
 * `formatBlock` sait poser un titre mais l'imbrique au lieu de le retirer :
 * demander « p » sur un `h2` produit `<h2><p>…</p></h2>`. Le retrait est donc fait
 * à la main, en remplaçant le bloc et en y replaçant la sélection.
 */
function toggleHeading(node: HTMLElement) {
  const block = enclosingBlock(node)
  if (block && /^h[23]$/i.test(block.tagName)) {
    const paragraph = document.createElement("p")
    paragraph.innerHTML = block.innerHTML
    block.replaceWith(paragraph)
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return
  }
  document.execCommand("formatBlock", false, "h2")
}

/** Renvoie vrai si la commande a modifié le contenu. `label` : texte du lien quand rien n'est sélectionné. */
export function runRichTextCommand(target: RichTextTarget | null, saved: MutableRefObject<Range | null>, name: RichTextCommand, value?: string, label?: string) {
  if (!target) return false
  const { node } = target
  // Revenir d'ailleurs (le sélecteur de lien) remet le curseur au début du champ :
  // la sélection mémorisée l'emporte alors sur celle que le navigateur vient de poser.
  const hadFocus = node.contains(document.activeElement)
  node.focus()
  restoreSelection(node, saved, !hadFocus)
  try {
    document.execCommand("styleWithCSS", false, name === "color" ? "true" : "false")
    if (name === "bold") document.execCommand("bold")
    else if (name === "italic") document.execCommand("italic")
    else if (name === "underline") document.execCommand("underline")
    else if (name === "strike") document.execCommand("strikeThrough")
    // Le titre est une bascule : un second appui rend le paragraphe ordinaire.
    else if (name === "heading") toggleHeading(node)
    else if (name === "bulletList") document.execCommand("insertUnorderedList")
    else if (name === "orderedList") document.execCommand("insertOrderedList")
    else if (name === "rule") document.execCommand("insertHorizontalRule")
    else if (name === "checkbox") document.execCommand("insertHTML", false, '<input type="checkbox"> ')
    else if (name === "clear") { document.execCommand("removeFormat"); document.execCommand("unlink") }
    else if (name === "color") {
      const color = normalizeCssColorToHex(value || "")
      if (!color) return false
      document.execCommand("foreColor", false, color)
    } else if (name === "link") {
      if (!value) return false
      let href = internalAppPath(value)
      if (!href) {
        try {
          const url = new URL(value)
          if (!["http:", "https:"].includes(url.protocol)) return false
          href = url.toString()
        } catch { return false }
      }
      // Sans texte sélectionné, le lien est inséré avec le nom de la page.
      const selection = window.getSelection()
      if (!selection?.rangeCount || selection.getRangeAt(0).collapsed) {
        const text = escapeRichText(label || href)
        document.execCommand("insertHTML", false, `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${text}</a>&nbsp;`)
      } else document.execCommand("createLink", false, href)
    }
  } catch { return false }
  rememberRichTextSelection(node, saved)
  target.flush()
  return true
}

function commandActive(name: "bold" | "italic" | "underline" | "strikeThrough") {
  try { return document.queryCommandState(name) } catch { return false }
}

/** Les pages liables, chargées une fois puis gardées deux minutes pour tous les éditeurs. */
let linkTargets: { at: number; promise: Promise<AppLinkTarget[]> } | null = null

function loadLinkTargets() {
  if (linkTargets && Date.now() - linkTargets.at < 120_000) return linkTargets.promise
  const promise = fetch("/api/link-targets")
    .then((response) => response.ok ? response.json() as Promise<{ targets?: AppLinkTarget[] }> : { targets: [] })
    .then((payload) => payload.targets ?? [])
    .catch(() => { linkTargets = null; return [] as AppLinkTarget[] })
  linkTargets = { at: Date.now(), promise }
  return promise
}

function foldLinkText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim()
}

/**
 * Le bouton « Lien » : une recherche parmi les pages d'Eraser (campagnes et leurs pages,
 * personnages, classes, index, règles), ou une adresse web collée. Le texte sélectionné
 * devient le lien ; sans sélection, le nom de la page est inséré.
 */
function RichTextLinkPicker({ disabled, onPrepare, onPick }: { disabled: boolean; onPrepare: () => void; onPick: (href: string, label: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [targets, setTargets] = useState<AppLinkTarget[] | null>(null)
  const [highlight, setHighlight] = useState(0)
  useEffect(() => {
    if (!open) return
    let alive = true
    void loadLinkTargets().then((loaded) => { if (alive) setTargets(loaded) })
    return () => { alive = false }
  }, [open])
  const folded = foldLinkText(query)
  const external = /^https?:\/\/\S+$/i.test(query.trim()) ? query.trim() : /^www\.\S+$/i.test(query.trim()) ? `https://${query.trim()}` : ""
  const results = useMemo(() => {
    if (!targets) return []
    const words = folded.split(/\s+/).filter(Boolean)
    return targets.filter((target) => {
      const haystack = foldLinkText(`${target.label} ${target.hint ?? ""} ${target.group}`)
      return words.every((word) => haystack.includes(word))
    }).slice(0, 60)
  }, [folded, targets])
  const options = [...(external ? [{ label: external, href: external, group: "Adresse web" } as AppLinkTarget] : []), ...results]
  function choose(target: AppLinkTarget) {
    setOpen(false)
    setQuery("")
    onPick(target.href, target.hint ? `${target.label} (${target.hint})` : target.label)
  }
  return <Popover open={open} onOpenChange={(next) => { if (next) onPrepare(); setOpen(next); if (!next) setQuery("") }}>
    <PopoverTrigger asChild>
      <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} onMouseDown={(event) => { onPrepare(); event.preventDefault() }} title="Lien vers une page ou une adresse"><Link2 /></Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 p-2" data-rich-text-popover="" onCloseAutoFocus={(event) => event.preventDefault()}>
      <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input
        autoFocus
        value={query}
        onChange={(event) => { setQuery(event.target.value); setHighlight(0) }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(options.length - 1, current + 1)) }
          if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(0, current - 1)) }
          if (event.key === "Enter") { event.preventDefault(); const option = options[highlight]; if (option) choose(option) }
        }}
        placeholder="Rechercher une page, ou coller une adresse…"
        className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
      /></div>
      <div className="mt-2 max-h-72 overflow-y-auto">
        {targets === null && !external ? <div className="grid min-h-20 place-items-center"><LoaderCircle className="size-4 animate-spin text-muted-foreground" /></div>
          : options.length ? options.map((option, index) => <button
            key={`${option.group}:${option.href}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setHighlight(index)}
            onClick={() => choose(option)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${index === highlight ? "bg-accent" : ""}`}
          >
            {option.group === "Adresse web" ? <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" /> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1"><span className="block truncate">{option.label}</span><span className="block truncate text-[11px] text-muted-foreground">{option.hint ? `${option.group} · ${option.hint}` : option.group}</span></span>
          </button>)
            : <p className="px-2 py-5 text-center text-xs text-muted-foreground">Aucune page ne correspond. Colle une adresse commençant par https:// pour un lien externe.</p>}
      </div>
    </PopoverContent>
  </Popover>
}

export function RichTextToolbar({ targetRef, ready, compact = false, leading, trailing, className = "" }: {
  targetRef: MutableRefObject<RichTextTarget | null>
  /** Faux tant qu'aucune zone n'a reçu le focus : les boutons restent inertes. */
  ready: boolean
  compact?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  const saved = useRef<Range | null>(null)
  const [, refresh] = useState(0)
  const keep = (event: ReactMouseEvent) => { rememberRichTextSelection(targetRef.current?.node ?? null, saved); event.preventDefault() }
  const run = (name: RichTextCommand, value?: string) => { runRichTextCommand(targetRef.current, saved, name, value); refresh((tick) => tick + 1) }
  const size = compact ? "icon-xs" : "icon-xs"
  const off = !ready
  const state = (name: "bold" | "italic" | "underline" | "strikeThrough") => ready && commandActive(name)
  const toggleClass = (active: boolean) => active ? "bg-primary/15 text-primary" : ""

  return <div className={`flex flex-wrap items-center gap-0.5 ${className}`}>
    {leading}
    {leading && <span className="mx-1 h-5 w-px bg-border" />}
    <Button type="button" size={size} variant="ghost" disabled={off} className={toggleClass(state("bold"))} onMouseDown={keep} onClick={() => run("bold")} title="Gras"><Bold /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} className={toggleClass(state("italic"))} onMouseDown={keep} onClick={() => run("italic")} title="Italique"><Italic /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} className={toggleClass(state("underline"))} onMouseDown={keep} onClick={() => run("underline")} title="Souligné"><Underline /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} className={toggleClass(state("strikeThrough"))} onMouseDown={keep} onClick={() => run("strike")} title="Barré"><Strikethrough /></Button>
    <span className="mx-1 h-5 w-px bg-border" />
    <Button type="button" size={size} variant="ghost" disabled={off} onMouseDown={keep} onClick={() => run("heading")} title="Titre"><Heading2 /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} onMouseDown={keep} onClick={() => run("bulletList")} title="Liste à puces"><List /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} onMouseDown={keep} onClick={() => run("orderedList")} title="Liste numérotée"><ListOrdered /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} onMouseDown={keep} onClick={() => run("checkbox")} title="Case à cocher"><ListChecks /></Button>
    <Button type="button" size={size} variant="ghost" disabled={off} onMouseDown={keep} onClick={() => run("rule")} title="Ligne de séparation"><Minus /></Button>
    <RichTextLinkPicker disabled={off} onPrepare={() => rememberRichTextSelection(targetRef.current?.node ?? null, saved)} onPick={(href, label) => { runRichTextCommand(targetRef.current, saved, "link", href, label); refresh((tick) => tick + 1) }} />
    <span className="mx-1 h-5 w-px bg-border" />
    <span className="flex items-center gap-1" aria-label="Couleur du texte">
      <Palette className="mr-0.5 size-3.5 text-muted-foreground" />
      {richTextColors.map((color) => <button key={color} type="button" disabled={off} onMouseDown={keep} onClick={() => run("color", color)} className="size-5 rounded-full border border-black/15 shadow-sm disabled:opacity-40" style={{ backgroundColor: color }} aria-label={`Texte ${color}`} title={`Couleur ${color}`} />)}
      <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-muted-foreground/60" title="Choisir une autre couleur" onPointerDown={() => rememberRichTextSelection(targetRef.current?.node ?? null, saved)}>
        <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">+</span>
        <input type="color" disabled={off} className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => run("color", event.target.value)} aria-label="Autre couleur du texte" />
      </label>
    </span>
    <Button type="button" size={size} variant="ghost" disabled={off} onMouseDown={keep} onClick={() => run("clear")} title="Retirer la mise en forme"><Eraser /></Button>
    {trailing}
  </div>
}

/**
 * La zone éditable elle-même. Non contrôlée : son contenu est posé au montage puis
 * appartient au navigateur. Pour repartir d'une autre valeur, il faut la remonter
 * (une `key` différente), jamais lui passer une nouvelle propriété.
 */
export const RichTextSurface = memo(function RichTextSurface({ initialHtml, plain = false, disabled = false, placeholder = "Écrire…", delay = 700, onCommit, onActivate, className = "" }: {
  initialHtml: string
  /** Le contenu est renvoyé en texte brut, sans mise en forme. */
  plain?: boolean
  disabled?: boolean
  placeholder?: string
  delay?: number
  onCommit: (value: string) => void
  onActivate?: (target: RichTextTarget) => void
  className?: string
}) {
  const editor = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const applied = useRef(initialHtml)
  const commit = useRef(onCommit)
  useEffect(() => { commit.current = onCommit })

  const flush = useCallback(() => {
    const node = editor.current
    if (!node) return
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null }
    const safe = sanitizeRichText(node.innerHTML)
    if (safe === applied.current) return
    applied.current = safe
    commit.current(plain ? richTextPlainText(safe) : safe)
  }, [plain])

  useEffect(() => {
    // Une seule fois : la suite appartient au navigateur.
    if (editor.current) editor.current.innerHTML = applied.current
  }, [])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  function toggleCheckbox(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLInputElement
    if (target.tagName !== "INPUT" || target.type !== "checkbox") return
    if (target.checked) target.setAttribute("checked", "")
    else target.removeAttribute("checked")
    flush()
  }

  return <div
    ref={editor}
    contentEditable={!disabled}
    suppressContentEditableWarning
    spellCheck
    role="textbox"
    aria-multiline="true"
    tabIndex={0}
    data-placeholder={placeholder}
    onInput={() => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, delay) }}
    onBlur={flush}
    onClick={toggleCheckbox}
    onFocus={() => { if (editor.current && onActivate) onActivate({ node: editor.current, flush }) }}
    className={`whitespace-pre-wrap break-words outline-none empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)] ${richTextRendering} ${className}`}
    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
  />
})

/** Affichage seul d'un contenu enrichi, avec le même rendu que l'éditeur. */
export function RichTextView({ html, fallback = "", className = "" }: { html: string; fallback?: string; className?: string }) {
  const safe = sanitizeRichText(html || fallback)
  if (!safe.trim()) return null
  // Les cases à cocher d'un texte seulement affiché ne réagissent pas : sans éditeur
  // derrière, un clic changerait la case à l'écran sans rien enregistrer.
  return <div className={`${richTextRendering} [&_input]:pointer-events-none ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />
}

/**
 * Un champ autonome : sa barre d'outils et sa zone de saisie. C'est la forme utilisée
 * partout hors tableaux (notes, récits, descriptions d'objets, fiches de PNJ…).
 */
export function RichTextField({ value, onCommit, plain = false, disabled = false, placeholder, label, minHeight = "min-h-24", toolbar = "focus", className = "", trailing }: {
  value: string
  onCommit: (value: string) => void
  plain?: boolean
  disabled?: boolean
  placeholder?: string
  label?: string
  minHeight?: string
  /** « focus » n'affiche la barre que lorsque le champ est utilisé, « always » la garde. */
  toolbar?: "focus" | "always"
  className?: string
  trailing?: ReactNode
}) {
  const targetRef = useRef<RichTextTarget | null>(null)
  const [active, setActive] = useState(false)
  // La zone signale une seule fois qu'elle est prête : la barre s'active alors.
  const [ready, setReady] = useState(false)
  const showToolbar = !disabled && (toolbar === "always" || active)

  return <div
    className={`overflow-hidden rounded-xl border bg-background/45 ${className}`}
    onFocusCapture={() => setActive(true)}
    onBlurCapture={(event) => {
      const next = event.relatedTarget as HTMLElement | null
      // Le sélecteur de lien s'ouvre hors du champ : la barre reste affichée.
      if (!event.currentTarget.contains(next) && !next?.closest?.("[data-rich-text-popover]")) setActive(false)
    }}
  >
    {(showToolbar || label) && <div className="flex flex-wrap items-center gap-1 border-b bg-card/60 px-2 py-1">
      {label && <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{label}</span>}
      {showToolbar && <RichTextToolbar targetRef={targetRef} ready={ready} trailing={trailing} />}
      {!showToolbar && trailing}
    </div>}
    <RichTextSurface
      initialHtml={plain ? escapeRichText(value) : sanitizeRichText(value)}
      plain={plain}
      disabled={disabled}
      placeholder={placeholder}
      onCommit={onCommit}
      onActivate={(target) => { targetRef.current = target; setActive(true); setReady(true) }}
      className={`${minHeight} px-3 py-2 text-sm leading-6`}
    />
  </div>
}

/**
 * Affichage qui devient modifiable au double-clic, avec enregistrement explicite.
 * Utilisé là où le texte fait partie de la mise en page (titres de classes, pastilles)
 * et où une barre d'outils permanente encombrerait.
 */
export function RichTextInlineEditor({ html, fallback, canEdit, onSave, className = "", placeholder = "Non renseigné" }: {
  html: string
  fallback?: string
  canEdit: boolean
  onSave: (html: string) => Promise<void>
  className?: string
  placeholder?: string
}) {
  const targetRef = useRef<RichTextTarget | null>(null)
  const draft = useRef(sanitizeRichText(html || fallback || ""))
  const [editing, setEditing] = useState(false)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const safe = sanitizeRichText(html || fallback || "")

  async function save() {
    setPending(true)
    await onSave(draft.current)
    setPending(false)
    setEditing(false)
    setReady(false)
  }

  if (!editing) return <div
    onDoubleClick={canEdit ? () => { draft.current = safe; setEditing(true) } : undefined}
    title={canEdit ? "Double-cliquer pour modifier" : undefined}
    className={`${richTextRendering} ${className}`}
    dangerouslySetInnerHTML={{ __html: safe || placeholder }}
  />

  return <div className="overflow-hidden rounded-xl border bg-background shadow-lg">
    <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
      <RichTextToolbar targetRef={targetRef} ready={ready} trailing={<>
        <Button type="button" size="icon-xs" className="ml-auto" disabled={pending} onMouseDown={(event) => event.preventDefault()} onClick={() => void save()} title="Enregistrer"><Check /></Button>
        <Button type="button" size="icon-xs" variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={() => { setEditing(false); setReady(false) }} title="Annuler"><X /></Button>
      </>} />
    </div>
    <RichTextSurface
      initialHtml={safe}
      onCommit={(value) => { draft.current = value }}
      onActivate={(target) => { targetRef.current = target; setReady(true) }}
      className="min-h-24 px-3 py-2 text-sm leading-6"
    />
  </div>
}
