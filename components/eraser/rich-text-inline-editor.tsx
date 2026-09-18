"use client"

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { Bold, Check, Italic, Link2, LoaderCircle, Palette, Underline, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function sanitizeRichText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<span\b[^>]*>/gi, (tag) => {
      const color = tag.match(/\bstyle\s*=\s*["'][^"']*\bcolor\s*:\s*(#[0-9a-f]{3}|#[0-9a-f]{6})\b[^"']*["']/i)?.[1]
      return color ? `<span style="color:${color.toLowerCase()}">` : "<span>"
    })
    .replace(/<(?!\/?(?:strong|b|em|i|u|s|br|p|div|ul|ol|li|a|span)\b)[^>]*>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, href: string) => {
      try {
        const url = new URL(href)
        return ["http:", "https:"].includes(url.protocol) ? `<a href="${url.toString().replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">` : "<a>"
      } catch { return "<a>" }
    })
    .replace(/<(strong|b|em|i|u|s|br|p|div|ul|ol|li)\b[^>]*>/gi, "<$1>")
    .replace(/\s(?:on\w+|class|id)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "")
}

const textColors = ["#1f1b16", "#b3261e", "#7f1d1d", "#315b55", "#285f8f", "#6b4c9a", "#b7791f"]

function RichTextToolbar({ command, trailing }: { command: (name: string, value?: string) => void; trailing?: ReactNode }) {
  const preserveSelection = (event: MouseEvent) => event.preventDefault()
  return <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => command("bold")} title="Gras"><Bold /></Button>
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => command("italic")} title="Italique"><Italic /></Button>
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => command("underline")} title="Souligné"><Underline /></Button>
    <Button type="button" size="icon-xs" variant="ghost" onMouseDown={preserveSelection} onClick={() => { const href = window.prompt("Adresse du lien"); if (href) command("createLink", href) }} title="Lien"><Link2 /></Button>
    <span className="mx-1 h-5 w-px bg-border" />
    <span className="flex items-center gap-1" aria-label="Couleur du texte"><Palette className="mr-0.5 size-3.5 text-muted-foreground" />{textColors.map((color) => <button key={color} type="button" onMouseDown={preserveSelection} onClick={() => command("foreColor", color)} className="size-5 rounded-full border border-black/15 shadow-sm" style={{ backgroundColor: color }} aria-label={`Texte ${color}`} title={`Couleur ${color}`} />)}<label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-muted-foreground/60" title="Choisir une autre couleur"><span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">+</span><input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={(event) => command("foreColor", event.target.value)} aria-label="Autre couleur du texte" /></label></span>
    {trailing}
  </div>
}

export function RichTextInlineEditor({
  html,
  fallback,
  canEdit,
  onSave,
  className = "",
  placeholder = "Non renseigné",
}: {
  html: string
  fallback?: string
  canEdit: boolean
  onSave: (html: string) => Promise<void>
  className?: string
  placeholder?: string
}) {
  const editor = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const safe = sanitizeRichText(html || fallback || "")

  useEffect(() => {
    if (editing && editor.current) editor.current.innerHTML = safe
  }, [editing, safe])

  function command(name: string, value?: string) {
    editor.current?.focus()
    document.execCommand(name, false, value)
  }

  async function save() {
    setPending(true)
    await onSave(sanitizeRichText(editor.current?.innerHTML || ""))
    setPending(false)
    setEditing(false)
  }

  if (!editing) return <div onDoubleClick={canEdit ? () => setEditing(true) : undefined} title={canEdit ? "Double-cliquer pour modifier" : undefined} className={className} dangerouslySetInnerHTML={{ __html: safe || `<span class="text-muted-foreground">${placeholder}</span>` }} />

  return <div className="overflow-hidden rounded-xl border bg-background shadow-lg">
    <RichTextToolbar command={command} trailing={<>
      <Button type="button" size="icon-xs" className="ml-auto" onClick={() => void save()} disabled={pending} title="Enregistrer">{pending ? <LoaderCircle className="animate-spin" /> : <Check />}</Button>
      <Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(false)} title="Annuler"><X /></Button>
    </>} />
    <div ref={editor} contentEditable suppressContentEditableWarning className="min-h-24 px-3 py-2 text-sm leading-6 outline-none empty:before:text-muted-foreground/50 empty:before:content-['Écrire…'] [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc" />
  </div>
}

export function RichTextEditorField({ value, onChange, className = "" }: { value: string; onChange: (html: string) => void; className?: string }) {
  const editor = useRef<HTMLDivElement>(null)
  const safe = sanitizeRichText(value)

  useEffect(() => {
    if (editor.current && document.activeElement !== editor.current && editor.current.innerHTML !== safe) editor.current.innerHTML = safe
  }, [safe])

  function command(name: string, argument?: string) {
    editor.current?.focus()
    document.execCommand(name, false, argument)
    onChange(sanitizeRichText(editor.current?.innerHTML || ""))
  }

  return <div className={`overflow-hidden rounded-xl border bg-background ${className}`}>
    <RichTextToolbar command={command} />
    <div ref={editor} contentEditable suppressContentEditableWarning onInput={() => onChange(sanitizeRichText(editor.current?.innerHTML || ""))} dangerouslySetInnerHTML={{ __html: safe }} className="min-h-28 px-3 py-2 text-sm leading-6 outline-none empty:before:text-muted-foreground/50 empty:before:content-['Écrire…'] [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc" />
  </div>
}
