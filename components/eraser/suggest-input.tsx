"use client"

import { useId, useRef, useState } from "react"

import { Input } from "@/components/ui/input"

export type SuggestGroup = { label?: string; items: string[] }

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()

/**
 * Un champ libre avec des propositions, à la place d'une <datalist> (dont la liste native
 * s'affiche en noir sous Windows). Les propositions se filtrent en tapant, se choisissent à
 * la souris ou au clavier (↑ ↓ Entrée, Échap) ; toute autre valeur reste permise.
 *
 * La liste n'est pas déplacée hors de la page (portail) : dans une fenêtre, elle défile et
 * se place comme le reste de son contenu.
 */
export function SuggestInput({ value, onChange, groups, placeholder, className = "", "aria-label": ariaLabel }: { value: string; onChange: (value: string) => void; groups: SuggestGroup[]; placeholder?: string; className?: string; "aria-label"?: string }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Tant qu'on n'a rien tapé depuis l'ouverture, toute la liste est proposée.
  const [typed, setTyped] = useState(false)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const query = typed ? fold(value) : ""
  const shown = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !query || fold(item).includes(query)).slice(0, 60) }))
    .filter((group) => group.items.length)
  // Chaque groupe sait où commence sa numérotation dans la liste entière (pour ↑ ↓).
  const starts = shown.map((_, groupIndex) => shown.slice(0, groupIndex).reduce((total, group) => total + group.items.length, 0))
  const flat = shown.flatMap((group) => group.items)
  const exact = flat.length === 1 && fold(flat[0]) === fold(value)

  function choose(item: string) { onChange(item); setOpen(false); setActive(-1); setTyped(false) }

  function move(by: number) {
    if (!flat.length) return
    setOpen(true)
    const next = (active + by + flat.length) % flat.length
    setActive(next)
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" })
  }

  return <div className={`relative min-w-0 ${className}`}>
    <Input
      value={value}
      onChange={(event) => { onChange(event.target.value); setTyped(true); setOpen(true); setActive(-1) }}
      onFocus={() => { setOpen(true); setTyped(false) }}
      onClick={() => setOpen(true)}
      onBlur={() => { setOpen(false); setActive(-1) }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); move(1) }
        else if (event.key === "ArrowUp") { event.preventDefault(); move(-1) }
        else if (event.key === "Enter" && open && active >= 0 && flat[active]) { event.preventDefault(); choose(flat[active]) }
        else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      role="combobox"
      aria-expanded={open && flat.length > 0}
      aria-controls={listId}
      aria-autocomplete="list"
      autoComplete="off"
      className="h-8 w-full"
    />
    {open && flat.length > 0 && !exact && <div
      ref={listRef}
      id={listId}
      role="listbox"
      // La souris ne retire pas le focus du champ : le choix s'applique avant sa fermeture.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-60 min-w-48 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {shown.map((group, groupIndex) => <div key={group.label ?? groupIndex}>
        {group.label && <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.label}</p>}
        {group.items.map((item, itemIndex) => {
          const position = starts[groupIndex] + itemIndex
          return <button key={item} type="button" role="option" aria-selected={position === active} data-index={position} onClick={() => choose(item)} onMouseEnter={() => setActive(position)} className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${position === active ? "bg-primary/10 text-foreground" : "hover:bg-muted"} ${fold(item) === fold(value) ? "font-semibold" : ""}`}>{item}</button>
        })}
      </div>)}
    </div>}
  </div>
}
