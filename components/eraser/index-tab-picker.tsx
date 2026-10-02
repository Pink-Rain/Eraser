"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Check, ChevronDown } from "lucide-react"

import { replaceAppUrl, URL_CHANGE_EVENT } from "@/components/eraser/app-tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { cn } from "@/lib/utils"

const isText = (value: unknown): value is string => typeof value === "string"

/**
 * L'onglet affiché d'un index, gardé dans l'adresse (`?onglet=…`) : chaque onglet de
 * l'application a le sien (« États » dans l'un, « Effets » dans l'autre), et un clic
 * droit peut l'ouvrir ailleurs. Sans paramètre, le dernier onglet choisi sert de départ.
 */
export function useIndexTabParam(pathname: string, storageKey: string, initial: string, param = "onglet") {
  const [stored, setStored] = usePersistentState(storageKey, initial, isText)
  const [fromUrl, setFromUrl] = useState<string | null>(null)
  useEffect(() => {
    const sync = () => setFromUrl(new URLSearchParams(window.location.search).get(param))
    const timer = window.setTimeout(sync, 0)
    window.addEventListener(URL_CHANGE_EVENT, sync)
    window.addEventListener("popstate", sync)
    return () => { window.clearTimeout(timer); window.removeEventListener(URL_CHANGE_EVENT, sync); window.removeEventListener("popstate", sync) }
  }, [param])
  const hrefOf = useCallback((value: string) => `${pathname}?${param}=${encodeURIComponent(value)}`, [param, pathname])
  const set = useCallback((next: string) => {
    setStored(next)
    setFromUrl(next)
    // Pas d'étape « précédent » à chaque changement d'onglet de l'index.
    replaceAppUrl(hrefOf(next), { record: false })
  }, [hrefOf, setStored])
  return [fromUrl ?? stored, set, hrefOf] as const
}

export type IndexTabOption = { value: string; label: string; detail?: string; group?: string }

/**
 * Le choix de l'onglet d'un index. Chaque entrée est un lien de l'application : un clic
 * droit propose de l'ouvrir dans un nouvel onglet, une nouvelle fenêtre ou ici, et
 * Ctrl+clic ou le clic du milieu l'ouvrent dans un nouvel onglet.
 */
export function IndexTabPicker({ value, options, onChange, hrefOf, tabLabel, disabled = false, className, empty = "Aucun onglet" }: {
  value: string
  options: IndexTabOption[]
  onChange: (value: string) => void
  hrefOf: (value: string) => string
  /** Le nom de l'onglet de l'application ouvert sur cette entrée (« États · Effets »). */
  tabLabel: (option: IndexTabOption) => string
  disabled?: boolean
  className?: string
  empty?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.value === value)
  const groups: Array<{ name: string; options: IndexTabOption[] }> = []
  for (const option of options) {
    const name = option.group ?? ""
    const group = groups.find((candidate) => candidate.name === name)
    if (group) group.options.push(option)
    else groups.push({ name, options: [option] })
  }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button
        type="button"
        disabled={disabled || !options.length}
        data-tab-href={current ? hrefOf(current.value) : undefined}
        data-tab-label={current ? tabLabel(current) : undefined}
        className={cn("flex h-9 w-full min-w-56 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50", className)}
      >
        <span className="min-w-0 flex-1 truncate">{current ? current.label : empty}{current?.detail && <span className="ml-1 text-muted-foreground">{current.detail}</span>}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="max-h-[min(28rem,70svh)] w-[var(--radix-popover-trigger-width)] min-w-56 overflow-y-auto p-1">
      {groups.map((group) => <div key={group.name || "_"} role="group" aria-label={group.name || undefined}>
        {group.name && <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.name}</p>}
        {group.options.map((option) => <a
          key={option.value}
          href={hrefOf(option.value)}
          data-tab-href={hrefOf(option.value)}
          data-tab-label={tabLabel(option)}
          onClick={(event) => { event.preventDefault(); onChange(option.value); setOpen(false) }}
          className={cn("flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground", option.value === value && "font-medium")}
        >
          <Check className={cn("size-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {option.detail && <span className="shrink-0 text-xs text-muted-foreground">{option.detail}</span>}
        </a>)}
      </div>)}
      <p className="border-t px-2 pb-1 pt-1.5 text-[10px] text-muted-foreground">Clic droit : ouvrir dans un autre onglet ou une autre fenêtre.</p>
    </PopoverContent>}
  </Popover>
}
