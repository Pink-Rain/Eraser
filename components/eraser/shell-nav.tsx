"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BookOpen, ChevronRight, FileText, Folder, LoaderCircle, Search, Volume1, Volume2, VolumeX } from "lucide-react"

import { loadLinkTargets } from "@/components/eraser/rich-text"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { AppLinkTarget } from "@/lib/app-links"
import { breadcrumbsFor, childrenOf, sectionsOf } from "@/lib/breadcrumbs"
import { playVolumePreview, setSoundsEnabled, setSoundVolume, SOUND_VOLUME_EVENT, soundsEnabled, soundVolume } from "@/lib/sounds"

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").trim()

type CrumbMenuItem = { label: string; href?: string; children?: Array<{ label: string; href: string }> }

/**
 * Le « › » entre deux étapes, comme dans l'explorateur de Windows : il ouvre la liste de
 * ce que contient l'étape à sa gauche. `trigger` : remplace le chevron (une étape sans page).
 */
function CrumbMenu({ items, current, label, trigger }: { items: CrumbMenuItem[]; current: string; label: string; trigger?: (open: boolean) => ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (!items.length) return trigger ? <>{trigger(false)}</> : <ChevronRight className="size-3.5 shrink-0 opacity-40" aria-hidden />
  const go = (href: string) => { setOpen(false); router.push(href) }
  const isCurrent = (href?: string) => Boolean(href) && href!.split(/[?#]/)[0] === current
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild>
      {trigger ? trigger(open) : <button type="button" className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground data-[state=open]:bg-muted" aria-label={`Contenu de ${label}`} title={`Contenu de ${label}`}><ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} /></button>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-[min(28rem,70vh)] w-64 overflow-y-auto">
      {items.map((item) => item.children?.length
        ? <DropdownMenuSub key={`${item.label}:${item.href ?? ""}`}>
          <DropdownMenuSubTrigger className="gap-2"><Folder className="size-3.5 text-muted-foreground" />{item.label}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[min(28rem,70vh)] w-64 overflow-y-auto">
            {item.href && <><DropdownMenuItem onSelect={() => go(item.href!)} className="gap-2 font-medium"><FileText className="size-3.5 text-muted-foreground" />Ouvrir {item.label}</DropdownMenuItem><DropdownMenuSeparator /></>}
            {item.children.map((child) => <DropdownMenuItem key={child.href} onSelect={() => go(child.href)} className={`gap-2 ${isCurrent(child.href) ? "font-semibold text-primary" : ""}`}><FileText className="size-3.5 text-muted-foreground" /><span className="truncate">{child.label}</span></DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        : item.href ? <DropdownMenuItem key={item.href} onSelect={() => go(item.href!)} className={`gap-2 ${isCurrent(item.href) ? "font-semibold text-primary" : ""}`}><FileText className="size-3.5 text-muted-foreground" /><span className="truncate">{item.label}</span></DropdownMenuItem> : null)}
    </DropdownMenuContent>
  </DropdownMenu>
}

/**
 * Le fil d'Ariane de la barre du haut, façon explorateur de Windows : Eraser (l'accueil),
 * les étapes au-dessus de la page (toutes cliquables : une étape sans page ouvre son
 * contenu), puis la page. Chaque « › » liste le contenu de l'étape à sa gauche, seulement
 * ce à quoi le compte a accès.
 */
export function ShellBreadcrumb({ pathname, current, campaignName }: { pathname: string; current: string; campaignName: (id: string) => string | undefined }) {
  const [targets, setTargets] = useState<AppLinkTarget[]>([])
  // Après le contenu de la page : les menus du fil d'Ariane ne lui prennent jamais sa place.
  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => { void loadLinkTargets().then((next) => { if (alive) setTargets(next) }) }, 1500)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [])
  const path = pathname.split(/[?#]/)[0]
  const crumbs = breadcrumbsFor(path, campaignName)
  const sections = useMemo(() => sectionsOf(targets), [targets])
  const home = path === "/"
  const link = "truncate rounded-md px-1.5 py-0.5 transition hover:bg-muted hover:text-foreground"
  const here = childrenOf(path, targets)
  return <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-0.5 text-sm text-muted-foreground">
    {home
      ? <span className="flex shrink-0 items-center gap-1.5 px-1.5 text-foreground"><BookOpen className="size-4" />Eraser</span>
      : <Link href="/" prefetch={false} className={`flex shrink-0 items-center gap-1.5 ${link}`} title="Accueil"><BookOpen className="size-4" />Eraser</Link>}
    <CrumbMenu label="Eraser" current={path} items={sections} />
    {crumbs.map((crumb) => {
      const children = childrenOf(crumb.path, targets)
      return <Fragment key={crumb.path}>
        {crumb.href
          ? <Link href={crumb.href} prefetch={false} className={`min-w-0 max-w-48 ${link}`}>{crumb.label}</Link>
          : <CrumbMenu label={crumb.label} current={path} items={children} trigger={(open) => <button type="button" className={`min-w-0 max-w-48 ${link} ${open ? "bg-muted text-foreground" : ""}`} title={`Contenu de ${crumb.label}`}>{crumb.label}</button>} />}
        <CrumbMenu label={crumb.label} current={path} items={children} />
      </Fragment>
    })}
    {!home && <span className="min-w-0 truncate px-1.5 text-foreground" aria-current="page">{current}</span>}
    {!home && here.length > 0 && <CrumbMenu label={current} current={path} items={here} />}
  </nav>
}

/**
 * Chercher une page : seulement celles auxquelles le compte a accès (la liste vient du
 * serveur, filtrée par rôle : un joueur y trouve ses personnages et ses campagnes, pas
 * les index). Ctrl + K l'ouvre de partout.
 */
export function PageSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [targets, setTargets] = useState<AppLinkTarget[] | null>(null)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true) }
    }
    window.addEventListener("keydown", shortcut)
    return () => window.removeEventListener("keydown", shortcut)
  }, [])

  useEffect(() => {
    if (!open) return
    let alive = true
    void loadLinkTargets().then((next) => { if (alive) setTargets(next) })
    return () => { alive = false }
  }, [open])

  const matches = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    return (targets ?? []).filter((target) => {
      const text = fold(`${target.label} ${target.group} ${target.hint ?? ""}`)
      return words.every((word) => text.includes(word))
    }).slice(0, 60)
  }, [query, targets])

  function go(target: AppLinkTarget) {
    setOpen(false)
    setQuery("")
    router.push(target.href)
  }

  function move(by: number) {
    if (!matches.length) return
    const next = (active + by + matches.length) % matches.length
    setActive(next)
    list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" })
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex h-8 min-w-0 items-center gap-2 rounded-lg border bg-background/60 px-2.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground" aria-label="Chercher une page" title="Chercher une page (Ctrl + K)">
      <Search className="size-4 shrink-0" />
      <span className="hidden lg:inline">Chercher une page…</span>
      <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[10px] lg:inline">Ctrl K</kbd>
    </button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Chercher une page</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); move(1) }
              else if (event.key === "ArrowUp") { event.preventDefault(); move(-1) }
              else if (event.key === "Enter" && matches[active]) { event.preventDefault(); go(matches[active]) }
            }}
            placeholder="Une page, un personnage, une campagne, un index…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
            aria-label="Chercher une page"
          />
        </div>
        <div ref={list} className="max-h-[min(26rem,60vh)] overflow-y-auto p-1.5" role="listbox">
          {targets === null && <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Chargement des pages…</p>}
          {targets !== null && !matches.length && <p className="py-8 text-center text-sm text-muted-foreground">Aucune page ne correspond.</p>}
          {matches.map((target, index) => {
            const header = target.group !== matches[index - 1]?.group ? target.group : ""
            return <Fragment key={`${target.group}:${target.href}`}>
              {header && <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{header}</p>}
              <button type="button" role="option" aria-selected={index === active} data-index={index} onMouseEnter={() => setActive(index)} onClick={() => go(target)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${index === active ? "bg-accent" : ""}`}>
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{target.label}</span>
                {target.hint && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{target.hint}</span>}
              </button>
            </Fragment>
          })}
        </div>
        <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</p>
      </DialogContent>
    </Dialog>
  </>
}

/** Le volume des sons d'Eraser, gardé sur cet ordinateur (50 % au premier lancement). */
export function VolumeControl() {
  const [volume, setVolume] = useState(0.5)
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    const sync = () => { setVolume(soundVolume()); setEnabled(soundsEnabled()) }
    sync()
    window.addEventListener(SOUND_VOLUME_EVENT, sync)
    return () => window.removeEventListener(SOUND_VOLUME_EVENT, sync)
  }, [])
  const silent = !enabled || volume === 0
  const Icon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  function change(next: number) {
    setVolume(next)
    setSoundVolume(next)
    if (next > 0 && !enabled) { setEnabled(true); setSoundsEnabled(true) }
  }

  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Volume des sons : ${silent ? "coupé" : `${Math.round(volume * 100)} %`}`} title="Volume des sons"><Icon className="size-4" /></button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-64 p-3">
      <p className="mb-2 flex items-center justify-between text-sm font-medium">Volume des sons<span className="tabular-nums text-muted-foreground">{silent ? "coupé" : `${Math.round(volume * 100)} %`}</span></p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { const next = !enabled; setEnabled(next); setSoundsEnabled(next); window.dispatchEvent(new CustomEvent(SOUND_VOLUME_EVENT)) }} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={enabled ? "Couper les sons" : "Remettre les sons"} title={enabled ? "Couper les sons" : "Remettre les sons"}>{silent ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
        <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} onChange={(event) => change(Number(event.target.value) / 100)} onPointerUp={() => playVolumePreview()} onKeyUp={() => playVolumePreview()} className="h-2 min-w-0 flex-1 cursor-pointer accent-primary" aria-label="Volume des sons" />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Gardé sur cet ordinateur, même après avoir fermé Eraser.</p>
    </PopoverContent>
  </Popover>
}
