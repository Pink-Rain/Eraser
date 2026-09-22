"use client"

import { useEffect, useRef, useState, type MouseEvent, type MutableRefObject, type ReactNode } from "react"
import { Bold, Check, Italic, Link2, LoaderCircle, Palette, Underline, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { normalizeCssColorToHex } from "@/lib/google-sheet-rich-text"

function colorFromTag(tag: string) {
  const style = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] || ""
  const styleColor = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1] || ""
  const attributeColor = tag.match(/\bcolor\s*=\s*["']([^"']+)["']/i)?.[1] || ""
  return normalizeCssColorToHex(styleColor || attributeColor)
}

export function sanitizeRichText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<font\b[^>]*>/gi, (tag) => { const color = colorFromTag(tag); return color ? `<span style="color:${color}">` : "<span>" })
    .replace(/<\/font\s*>/gi, "</span>")
    .replace(/<span\b[^>]*>/gi, (tag) => { const color = colorFromTag(tag); return color ? `<span style="color:${color}">` : "<span>" })
    .replace(/<(?!\/?(?:strong|b|em|i|u|s|br|p|div|ul|ol|li|a|span)\b)[^>]*>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, href: string) => {
      try {
        const url = new URL(href)
        return ["http:", "https:"].includes(url.protocol) ? `<a href="${url.toString().replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">` : "<a>"
      } catch { return "<a>" }
    })
    .replace(/<(strong|b|em|i|u|s|br|p|div|ul|ol|li)\b[^>]*>/gi, "<$1>")
    .replace(/<b>/gi, "<strong>").replace(/<\/b>/gi, "</strong>")
    .replace(/<i>/gi, "<em>").replace(/<\/i>/gi, "</em>")
    .replace(/\s(?:on\w+|class|id)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "")
}

export const richTextColors = ["#1f1b16", "#b3261e", "#7f1d1d", "#315b55", "#285f8f", "#6b4c9a", "#b7791f"]
const textColors = richTextColors
export type RichTextCommand = "bold" | "italic" | "underline" | "createLink" | "foreColor"

/** Texte brut d’une cellule enrichie : les retours à la ligne HTML redeviennent des « \n ». */
export function richTextPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Échappe un texte brut pour l’injecter dans une cellule éditable sans interpréter de balise. */
export function escapeRichText(text: string) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function selectionBelongsTo(editor: HTMLElement, range: Range) {
  return editor.contains(range.commonAncestorContainer)
}

export function rememberRichTextSelection(editor: HTMLElement | null, savedRange: MutableRefObject<Range | null>) {
  const selection = window.getSelection()
  if (!editor || !selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (selectionBelongsTo(editor, range)) savedRange.current = range.cloneRange()
}

export function applyRichTextCommand(editor: HTMLElement | null, savedRange: MutableRefObject<Range | null>, name: RichTextCommand, value?: string) {
  if (!editor) return false
  editor.focus()
  const selection = window.getSelection()
  const range = savedRange.current?.cloneRange() || (selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null)
  if (!selection || !range || !selectionBelongsTo(editor, range) || range.collapsed) return false

  let wrapper: HTMLElement
  if (name === "bold") wrapper = document.createElement("strong")
  else if (name === "italic") wrapper = document.createElement("em")
  else if (name === "underline") wrapper = document.createElement("u")
  else if (name === "createLink") {
    try {
      const url = new URL(value || "")
      if (!["http:", "https:"].includes(url.protocol)) return false
      wrapper = document.createElement("a")
      wrapper.setAttribute("href", url.toString())
      wrapper.setAttribute("target", "_blank")
      wrapper.setAttribute("rel", "noreferrer")
    } catch { return false }
  } else {
    const color = normalizeCssColorToHex(value || "")
    if (!color) return false
    wrapper = document.createElement("span")
    wrapper.setAttribute("style", `color:${color}`)
  }

  wrapper.appendChild(range.extractContents())
  range.insertNode(wrapper)
  range.selectNodeContents(wrapper)
  selection.removeAllRanges()
  selection.addRange(range)
  savedRange.current = range.cloneRange()
  return true
}

function RichTextToolbar({ command, captureSelection, trailing }: { command: (name: RichTextCommand, value?: string) => void; captureSelection: () => void; trailing?: ReactNode }) {
  const preserveSelection = (event: MouseEvent) => { captureSelection(); event.preventDefault() }
  return <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => command("bold")} title="Gras"><Bold /></Button>
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => command("italic")} title="Italique"><Italic /></Button>
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => command("underline")} title="Souligné"><Underline /></Button>
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => { const href = window.prompt("Adresse du lien"); if (href) command("createLink", href) }} title="Lien"><Link2 /></Button>
    <span className="mx-1 h-5 w-px bg-border" />
    <span className="flex items-center gap-1" aria-label="Couleur du texte"><Palette className="mr-0.5 size-3.5 text-muted-foreground" />{textColors.map((color) => <button key={color} type="button" onMouseDown={preserveSelection} onClick={() => command("foreColor", color)} className="size-5 rounded-full border border-black/15 shadow-sm" style={{ backgroundColor: color }} aria-label={`Texte ${color}`} title={`Couleur ${color}`} />)}<label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-muted-foreground/60" title="Choisir une autre couleur" onPointerDown={captureSelection}><span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">+</span><input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => command("foreColor", event.target.value)} aria-label="Autre couleur du texte" /></label></span>
    {trailing}
  </div>
}

const editorClasses = "px-3 py-2 text-sm leading-6 outline-none empty:before:text-muted-foreground/50 empty:before:content-['Écrire…'] [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"

export function RichTextInlineEditor({ html, fallback, canEdit, onSave, className = "", placeholder = "Non renseigné" }: { html: string; fallback?: string; canEdit: boolean; onSave: (html: string) => Promise<void>; className?: string; placeholder?: string }) {
  const editor = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const safe = sanitizeRichText(html || fallback || "")

  useEffect(() => {
    if (editing && editor.current && editor.current.innerHTML !== safe) editor.current.innerHTML = safe
  }, [editing, safe])

  const captureSelection = () => rememberRichTextSelection(editor.current, savedRange)
  function command(name: RichTextCommand, value?: string) { applyRichTextCommand(editor.current, savedRange, name, value) }
  async function save() {
    setPending(true)
    await onSave(sanitizeRichText(editor.current?.innerHTML || ""))
    setPending(false)
    setEditing(false)
  }

  if (!editing) return <div onDoubleClick={canEdit ? () => setEditing(true) : undefined} title={canEdit ? "Double-cliquer pour modifier" : undefined} className={className} dangerouslySetInnerHTML={{ __html: safe || placeholder }} />
  return <div className="overflow-hidden rounded-xl border bg-background shadow-lg">
    <RichTextToolbar command={command} captureSelection={captureSelection} trailing={<><Button type="button" size="icon-xs" className="ml-auto" onClick={() => void save()} disabled={pending} title="Enregistrer">{pending ? <LoaderCircle className="animate-spin" /> : <Check />}</Button><Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(false)} title="Annuler"><X /></Button></>} />
    <div ref={editor} contentEditable suppressContentEditableWarning onMouseUp={captureSelection} onKeyUp={captureSelection} className={`min-h-24 ${editorClasses}`} />
  </div>
}

export function RichTextEditorField({ value, onChange, className = "", variant = "field" }: { value: string; onChange: (html: string) => void; className?: string; variant?: "field" | "table" }) {
  const editor = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const originalValue = useRef(value)
  const [editing, setEditing] = useState(variant !== "table")
  const safe = sanitizeRichText(value)

  useEffect(() => {
    if (editing && editor.current && document.activeElement !== editor.current && editor.current.innerHTML !== safe) editor.current.innerHTML = safe
  }, [editing, safe])

  const captureSelection = () => rememberRichTextSelection(editor.current, savedRange)
  function emit() { onChange(sanitizeRichText(editor.current?.innerHTML || "")) }
  function command(name: RichTextCommand, value?: string) { if (applyRichTextCommand(editor.current, savedRange, name, value)) emit() }
  function beginEditing() { originalValue.current = value; setEditing(true) }

  if (variant === "table" && !editing) return <div tabIndex={0} role="button" onDoubleClick={beginEditing} onKeyDown={(event) => { if (event.key === "Enter") beginEditing() }} title="Double-cliquer pour modifier" className={`h-full overflow-auto whitespace-pre-wrap break-words rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`} style={{ overflowWrap: "anywhere", wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: safe }} />

  return <div className={`overflow-hidden rounded-xl border bg-background ${variant === "table" ? "h-full" : ""} ${className}`}>
    <RichTextToolbar command={command} captureSelection={captureSelection} trailing={variant === "table" ? <><Button type="button" size="icon-xs" className="ml-auto" onMouseDown={(event) => event.preventDefault()} onClick={() => { emit(); setEditing(false) }} title="Terminer"><Check /></Button><Button type="button" size="icon-xs" variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(originalValue.current); setEditing(false) }} title="Annuler"><X /></Button></> : undefined} />
    <div ref={editor} contentEditable suppressContentEditableWarning onInput={() => { emit(); captureSelection() }} onMouseUp={captureSelection} onKeyUp={captureSelection} className={`${variant === "table" ? "max-h-[calc(100%-2.5rem)] min-h-16 overflow-auto" : "min-h-28"} ${editorClasses}`} />
  </div>
}
