"use client"

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle, ArrowDown, BookOpen, Check, ChevronRight, CircleUserRound, Compass, Crown, FlaskConical, HardDrive,
  LayoutGrid, LibraryBig, List, LoaderCircle, Map, Minus, Pencil, Plus, Search, ShieldCheck, Store, Swords, Trash2,
  UsersRound, type LucideIcon,
} from "lucide-react"

import { PageLabel, useShellData } from "@/components/eraser/app-shell"
import { useIndexFavorites } from "@/components/eraser/index-favorites"
import { indexPageIcons } from "@/components/eraser/index-directory"
import { RichTextField, RichTextView } from "@/components/eraser/rich-text"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { AdminTodoRecord, CampaignRecord, CharacterRecord } from "@/lib/google-sheets"
import { indexHomeHref, indexPages } from "@/lib/index-pages"
import { cn } from "@/lib/utils"

const viewLabels = { admin: "Vue administrateur", mj: "Vue maître du jeu", joueur: "Vue joueur" } as const

function folded(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr")
}

function plainText(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

function shortDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

// ---------- Mise en page commune ----------

function Panel({ title, icon: Icon, action, children, className }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5", className)}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><Icon className="size-4.5" /></div>
        <h2 className="font-display flex-1 text-2xl font-semibold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Toolbar({ search, onSearch, placeholder, children }: { search: string; onSearch: (value: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} className="h-9 pl-9" aria-label={placeholder} />
      </div>
      {children}
    </div>
  )
}

function LayoutToggle({ value, onChange }: { value: "grid" | "list"; onChange: (value: "grid" | "list") => void }) {
  return (
    <div className="flex shrink-0 rounded-lg border bg-background/60 p-0.5" role="group" aria-label="Affichage">
      {([["grid", LayoutGrid, "Grille"], ["list", List, "Liste"]] as const).map(([mode, Icon, label]) => (
        <button key={mode} type="button" onClick={() => onChange(mode)} aria-pressed={value === mode} title={label} className={cn("flex size-8 items-center justify-center rounded-md transition", value === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
      <Icon className="size-7 opacity-50" />
      {children}
    </div>
  )
}

// ---------- Colonne de droite : règles, index, outils ----------

type QuickLink = { href: string; label: string; icon: LucideIcon }

const ruleLinks: QuickLink[] = [
  { href: "/regles/classes", label: "Classe", icon: Crown },
  { href: "/regles/combat", label: "Combat", icon: Swords },
  { href: "/regles/hors-combat", label: "Hors combat", icon: Compass },
  { href: "/regles/vocabulaire", label: "Vocabulaire", icon: BookOpen },
]

const toolLinks: QuickLink[] = [
  { href: "/bac-a-sable/tabletop", label: "Tabletop", icon: Map },
  { href: "/bac-a-sable/magasin", label: "Magasin", icon: Store },
  { href: "/bac-a-sable/pnjs", label: "PNJs du bac à sable", icon: FlaskConical },
  { href: "/administration/comptes-et-roles", label: "Comptes et rôles", icon: ShieldCheck },
  { href: "/administration/google-drive", label: "Google Drive et Sheets", icon: HardDrive },
  { href: "/administration/corbeille", label: "Corbeille", icon: Trash2 },
]

function LinkList({ links }: { links: QuickLink[] }) {
  return (
    <div className="grid gap-1">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} prefetch={false} className="group flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm transition hover:bg-accent">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-primary transition group-hover:bg-primary/10"><Icon className="size-4" /></span>
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <ChevronRight className="size-4 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </Link>
      ))}
    </div>
  )
}

function SideColumn({ withIndex, withTools }: { withIndex: boolean; withTools: boolean }) {
  const { isFavorite } = useIndexFavorites()
  const starred = indexPages.filter((page) => isFavorite(page.key))
  return (
    <aside className="space-y-5">
      <Panel title="Règles" icon={BookOpen}><LinkList links={ruleLinks} /></Panel>
      {withIndex && (
        <Panel title="Index" icon={LibraryBig} action={<Link href={indexHomeHref} prefetch={false} className="text-xs font-medium text-primary hover:underline">Tout voir</Link>}>
          <LinkList links={(starred.length ? starred : indexPages).map((page) => ({ href: page.href, label: page.label, icon: indexPageIcons[page.key] }))} />
        </Panel>
      )}
      {withTools && <Panel title="Outils MJ et administration" icon={ShieldCheck}><LinkList links={toolLinks} /></Panel>}
    </aside>
  )
}

/**
 * Une image qui n'apparaît qu'une fois chargée : absente (404 arrivé avant que la page
 * soit interactive) ou cassée, elle laisse simplement voir l'icône en dessous.
 */
function QuietImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState("")
  const [failed, setFailed] = useState("")
  if (!src || failed === src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(node) => { if (node?.complete) { if (node.naturalWidth) setLoaded(src); else setFailed(src) } }}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(src)}
      onError={() => setFailed(src)}
      className={cn("absolute inset-0 size-full object-cover transition-opacity", loaded === src ? "opacity-100" : "opacity-0")}
    />
  )
}

// ---------- MJ : campagnes ----------

function CampaignBanner({ campaign, className }: { campaign: CampaignRecord; className?: string }) {
  return (
    <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground", className)} style={{ color: campaign.accentColor }}>
      <Map className="size-6 opacity-60" />
      <QuietImage src={campaign.bannerUrl} />
    </div>
  )
}

function CampaignColumn({ campaigns }: { campaigns: CampaignRecord[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("recent")
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const visible = useMemo(() => {
    const query = folded(search.trim())
    return campaigns
      .filter((campaign) => !query || folded(`${campaign.name} ${plainText(campaign.description)}`).includes(query))
      .sort((left, right) => sort === "name" ? left.name.localeCompare(right.name, "fr", { sensitivity: "base" }) : right.updatedAt.localeCompare(left.updatedAt))
  }, [campaigns, search, sort])
  // Ouvrir le tableau de bord sélectionne aussi la campagne dans le menu.
  const open = (campaign: CampaignRecord) => router.push(`/campagne/${encodeURIComponent(campaign.id)}`)

  return (
    <Panel title="Mes campagnes" icon={Map} action={<Button asChild size="sm"><Link href="/creation-de-campagne" prefetch={false}><Plus />Nouvelle campagne</Link></Button>}>
      <Toolbar search={search} onSearch={setSearch} placeholder="Chercher une campagne">
        <NativeSelect value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 text-sm" aria-label="Trier les campagnes">
          <NativeSelectOption value="recent">Plus récentes</NativeSelectOption>
          <NativeSelectOption value="name">Par nom</NativeSelectOption>
        </NativeSelect>
        <LayoutToggle value={layout} onChange={setLayout} />
      </Toolbar>
      {!campaigns.length ? (
        <EmptyState icon={Map}>Aucune campagne pour l’instant.<Button asChild size="sm" variant="outline" className="mt-2"><Link href="/creation-de-campagne" prefetch={false}><Plus />Créer la première</Link></Button></EmptyState>
      ) : !visible.length ? (
        <EmptyState icon={Search}>Aucune campagne ne correspond.</EmptyState>
      ) : layout === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((campaign) => (
            <button key={campaign.id} type="button" onClick={() => open(campaign)} className="group flex flex-col overflow-hidden rounded-2xl border bg-background/40 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgb(67_50_31/0.12)]" style={{ borderColor: `${campaign.accentColor}55` }}>
              <CampaignBanner campaign={campaign} className="aspect-[16/6] w-full" />
              <div className="h-1 w-full" style={{ backgroundColor: campaign.accentColor }} />
              <div className="flex flex-1 flex-col p-3.5">
                <h3 className="font-display truncate text-lg font-semibold" style={{ color: campaign.accentColor }}>{campaign.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{plainText(campaign.description) || "Pas encore de description."}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/80">Modifiée le {shortDate(campaign.updatedAt)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-1.5">
          {visible.map((campaign) => (
            <button key={campaign.id} type="button" onClick={() => open(campaign)} className="group flex items-center gap-3 rounded-xl border border-l-4 bg-background/40 p-2 text-left transition hover:bg-accent" style={{ borderLeftColor: campaign.accentColor }}>
              <CampaignBanner campaign={campaign} className="h-11 w-16 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate font-semibold" style={{ color: campaign.accentColor }}>{campaign.name}</p>
                <p className="truncate text-xs text-muted-foreground">{plainText(campaign.description) || "Pas encore de description."}</p>
              </div>
              <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">{shortDate(campaign.updatedAt)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ---------- Joueur : personnages ----------

function Portrait({ character, className }: { character: CharacterRecord; className?: string }) {
  return (
    <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground", className)}>
      <CircleUserRound className="size-7 opacity-40" />
      <QuietImage src={`/api/characters/portrait/${encodeURIComponent(character.id)}`} />
    </div>
  )
}

function CharacterColumn({ characters }: { characters: CharacterRecord[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [campaignFilter, setCampaignFilter] = useState("all")
  const [sort, setSort] = useState("recent")
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const campaigns = useMemo(() => {
    const seen = new globalThis.Map<string, string>()
    for (const character of characters) for (const campaign of character.campaigns) seen.set(campaign.id, campaign.name)
    return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1], "fr"))
  }, [characters])
  const visible = useMemo(() => {
    const query = folded(search.trim())
    return characters
      .filter((character) => campaignFilter === "all" || (campaignFilter === "none" ? !character.campaigns.length : character.campaigns.some((campaign) => campaign.id === campaignFilter)))
      .filter((character) => !query || folded(`${character.name} ${character.subtitle} ${character.campaigns.map((campaign) => campaign.name).join(" ")}`).includes(query))
      .sort((left, right) => sort === "name" ? left.name.localeCompare(right.name, "fr", { sensitivity: "base" }) : right.updatedAt.localeCompare(left.updatedAt))
  }, [campaignFilter, characters, search, sort])
  // Ouvrir la fiche sélectionne aussi le personnage dans le menu.
  const open = (character: CharacterRecord) => router.push(`/personnage/${encodeURIComponent(character.id)}`)

  return (
    <Panel title="Mes personnages" icon={UsersRound} action={<Button asChild size="sm"><Link href="/creation-de-personnage" prefetch={false}><Plus />Nouveau personnage</Link></Button>}>
      <Toolbar search={search} onSearch={setSearch} placeholder="Chercher un personnage">
        {campaigns.length > 0 && (
          <NativeSelect value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="h-9 text-sm" aria-label="Filtrer par campagne">
            <NativeSelectOption value="all">Toutes les campagnes</NativeSelectOption>
            <NativeSelectOption value="none">Sans campagne</NativeSelectOption>
            {campaigns.map(([id, name]) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <NativeSelect value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 text-sm" aria-label="Trier les personnages">
          <NativeSelectOption value="recent">Plus récents</NativeSelectOption>
          <NativeSelectOption value="name">Par nom</NativeSelectOption>
        </NativeSelect>
        <LayoutToggle value={layout} onChange={setLayout} />
      </Toolbar>
      {!characters.length ? (
        <EmptyState icon={CircleUserRound}>Aucun personnage pour l’instant.<Button asChild size="sm" variant="outline" className="mt-2"><Link href="/creation-de-personnage" prefetch={false}><Plus />Créer le premier</Link></Button></EmptyState>
      ) : !visible.length ? (
        <EmptyState icon={Search}>Aucun personnage ne correspond.</EmptyState>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visible.map((character) => {
            const accent = character.campaigns[0]?.accentColor || "#927640"
            return (
              <button key={character.id} type="button" onClick={() => open(character)} className="group flex flex-col overflow-hidden rounded-2xl border bg-background/40 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgb(67_50_31/0.12)]" style={{ borderColor: `${accent}55` }}>
                <Portrait character={character} className="aspect-[4/5] w-full" />
                <div className="h-1 w-full" style={{ backgroundColor: accent }} />
                <div className="p-3">
                  <h3 className="font-display truncate text-base font-semibold">{character.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">{character.subtitle || "Peuple à choisir"}</p>
                  <div className="mt-1.5 flex min-h-4 flex-wrap gap-x-2 gap-y-0.5">
                    {character.campaigns.length ? character.campaigns.map((campaign) => <span key={campaign.id} className="truncate text-[10px] font-medium" style={{ color: campaign.accentColor }}>{campaign.name}</span>) : <span className="text-[10px] text-muted-foreground/80">Sans campagne</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid gap-1.5">
          {visible.map((character) => (
            <button key={character.id} type="button" onClick={() => open(character)} className="flex items-center gap-3 rounded-xl border border-l-4 bg-background/40 p-2 text-left transition hover:bg-accent" style={{ borderLeftColor: character.campaigns[0]?.accentColor || "#927640" }}>
              <Portrait character={character} className="size-11 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="font-display truncate font-semibold">{character.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[character.subtitle, character.campaigns.map((campaign) => campaign.name).join(", ") || "Sans campagne"].filter(Boolean).join(" · ")}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ---------- Admin : to-dos ----------

const priorityIcons = { haute: AlertTriangle, moyenne: Minus, basse: ArrowDown }
const priorityLabels = { haute: "Priorité élevée", moyenne: "Priorité moyenne", basse: "Priorité basse" }
const priorityColors = { haute: "#b4413c", moyenne: "#927640", basse: "#52665c" }
type TodoForm = { name: string; content: string; priority: AdminTodoRecord["priority"]; label: string; labelColor: string }
const emptyTodo: TodoForm = { name: "", content: "", priority: "moyenne", label: "", labelColor: "#927640" }

function TodoColumn() {
  const [todos, setTodos] = useState<AdminTodoRecord[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("todo")
  const [labelFilter, setLabelFilter] = useState("all")
  const [sort, setSort] = useState("updated")
  const [editing, setEditing] = useState<{ id: string | null; form: TodoForm } | null>(null)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    let active = true
    fetch("/api/admin/todos")
      .then(async (response) => ({ response, payload: (await response.json()) as { todos?: AdminTodoRecord[] } }))
      .then(({ response, payload }) => { if (!active) return; if (response.ok) setTodos(payload.todos || []); else setLoadError("Les to-do n’ont pas pu être chargées.") })
      .catch(() => { if (active) setLoadError("Les to-do n’ont pas pu être chargées.") })
    return () => { active = false }
  }, [])

  const labels = useMemo(() => [...new Set((todos || []).map((todo) => todo.label).filter(Boolean))].sort((left, right) => left.localeCompare(right, "fr")), [todos])
  const visible = useMemo(() => {
    const query = folded(search.trim())
    const rank = { haute: 0, moyenne: 1, basse: 2 }
    return (todos || [])
      .filter((todo) => status === "all" || (status === "done" ? todo.completed === "oui" : todo.completed !== "oui"))
      .filter((todo) => labelFilter === "all" || todo.label === labelFilter)
      .filter((todo) => !query || folded(`${todo.name} ${plainText(todo.content)} ${todo.label} ${todo.creatorName}`).includes(query))
      .sort((left, right) => sort === "priority" ? rank[left.priority] - rank[right.priority] || right.updatedAt.localeCompare(left.updatedAt) : right.updatedAt.localeCompare(left.updatedAt))
  }, [labelFilter, search, sort, status, todos])
  const remaining = (todos || []).filter((todo) => todo.completed !== "oui").length

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setPending(true)
    setFormError("")
    const response = await fetch("/api/admin/todos", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing.id ? { id: editing.id, patch: editing.form } : editing.form),
    }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { todo?: AdminTodoRecord; error?: string }
    setPending(false)
    if (!response?.ok || !payload.todo) return setFormError(payload.error || "Enregistrement impossible.")
    const saved = payload.todo
    setTodos((current) => editing.id ? (current || []).map((todo) => todo.id === editing.id ? saved : todo) : [saved, ...(current || [])])
    setEditing(null)
  }

  async function toggle(todo: AdminTodoRecord) {
    const completed = todo.completed === "oui" ? "non" : "oui"
    setTodos((current) => (current || []).map((item) => item.id === todo.id ? { ...item, completed } : item))
    const response = await fetch("/api/admin/todos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: todo.id, patch: { completed } }) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { todo?: AdminTodoRecord }
    setTodos((current) => (current || []).map((item) => item.id === todo.id ? payload.todo || (response?.ok ? item : todo) : item))
  }

  async function remove(id: string) {
    const response = await fetch(`/api/admin/todos?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (response?.ok) setTodos((current) => (current || []).filter((todo) => todo.id !== id))
  }

  const form = editing?.form
  const setForm = (patch: Partial<TodoForm>) => setEditing((current) => current ? { ...current, form: { ...current.form, ...patch } } : current)

  return (
    <Panel title="To-do" icon={Check} action={<Button size="sm" onClick={() => { setFormError(""); setEditing({ id: null, form: emptyTodo }) }}><Plus />Nouvelle to-do</Button>}>
      <Toolbar search={search} onSearch={setSearch} placeholder="Chercher une to-do">
        <NativeSelect value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 text-sm" aria-label="État">
          <NativeSelectOption value="todo">À faire{todos ? ` (${remaining})` : ""}</NativeSelectOption>
          <NativeSelectOption value="done">Terminées</NativeSelectOption>
          <NativeSelectOption value="all">Toutes</NativeSelectOption>
        </NativeSelect>
        {labels.length > 0 && (
          <NativeSelect value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)} className="h-9 text-sm" aria-label="Étiquette">
            <NativeSelectOption value="all">Toutes les étiquettes</NativeSelectOption>
            {labels.map((label) => <NativeSelectOption key={label} value={label}>{label}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <NativeSelect value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 text-sm" aria-label="Tri">
          <NativeSelectOption value="updated">Plus récentes</NativeSelectOption>
          <NativeSelectOption value="priority">Par priorité</NativeSelectOption>
        </NativeSelect>
      </Toolbar>

      {todos === null ? (
        loadError ? <EmptyState icon={AlertTriangle}>{loadError}</EmptyState> : <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !visible.length ? (
        <EmptyState icon={Check}>{todos.length ? "Aucune to-do pour ces filtres." : "Aucune to-do pour l’instant."}</EmptyState>
      ) : (
        <div className="grid gap-2">
          {visible.map((todo) => {
            const PriorityIcon = priorityIcons[todo.priority]
            const done = todo.completed === "oui"
            return (
              <article key={todo.id} className={cn("group flex items-start gap-3 rounded-xl border border-l-4 bg-background/40 p-3 transition hover:bg-accent/60", done && "opacity-70")} style={{ borderLeftColor: done ? undefined : priorityColors[todo.priority] }}>
                <button type="button" onClick={() => void toggle(todo)} className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border transition", done ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50")} aria-label={done ? "Marquer comme à faire" : "Valider la to-do"} title={done ? "Terminée" : priorityLabels[todo.priority]}>
                  {done ? <Check className="size-4" /> : <PriorityIcon className="size-3.5" style={{ color: priorityColors[todo.priority] }} />}
                </button>
                <div className="min-w-0 flex-1">
                  {todo.name && <p className={cn("font-medium", done && "line-through")}>{todo.name}</p>}
                  <RichTextView html={todo.content} className={cn("text-sm leading-6", todo.name ? "line-clamp-3 text-muted-foreground" : "font-medium", done && !todo.name && "line-through")} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {todo.label && <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: todo.labelColor }}>{todo.label}</span>}
                    <span className="text-[10px] text-muted-foreground">{todo.creatorName} · {shortDate(todo.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => { setFormError(""); setEditing({ id: todo.id, form: { name: todo.name, content: todo.content, priority: todo.priority, label: todo.label, labelColor: todo.labelColor } }) }} aria-label="Modifier"><Pencil /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label="Supprimer"><Trash2 /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Mettre cette to-do à la corbeille ?</AlertDialogTitle><AlertDialogDescription>Elle pourra être restaurée par un administrateur.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove(todo.id)}>Mettre à la corbeille</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing?.id ? "Modifier la to-do" : "Nouvelle to-do"}</DialogTitle>
            <DialogDescription className="sr-only">Nom, contenu, priorité et étiquette de la to-do.</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="grid gap-3">
              <Input value={form.name} onChange={(event) => setForm({ name: event.target.value })} placeholder="Nom (facultatif)" aria-label="Nom" />
              <RichTextField value={form.content} onCommit={(html) => setForm({ content: html })} placeholder="Contenu de la to-do" minHeight="min-h-28" />
              <div className="grid gap-2 sm:grid-cols-2">
                <NativeSelect className="w-full" value={form.priority} onChange={(event) => setForm({ priority: event.target.value as AdminTodoRecord["priority"] })} aria-label="Priorité">
                  {(["haute", "moyenne", "basse"] as const).map((priority) => <NativeSelectOption key={priority} value={priority}>{priorityLabels[priority]}</NativeSelectOption>)}
                </NativeSelect>
                <div className="flex gap-1.5">
                  <Input value={form.label} onChange={(event) => setForm({ label: event.target.value })} placeholder="Étiquette" aria-label="Étiquette" list="home-todo-labels" />
                  <datalist id="home-todo-labels">{labels.map((label) => <option key={label} value={label} />)}</datalist>
                  <Input type="color" value={form.labelColor} onChange={(event) => setForm({ labelColor: event.target.value })} className="w-11 shrink-0 px-1" aria-label="Couleur de l’étiquette" />
                </div>
              </div>
              {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
                <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{editing?.id ? "Enregistrer" : "Ajouter"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}

// ---------- Page ----------

export function HomeShell() {
  const { characters, campaigns, viewRole, user } = useShellData()
  const firstName = (user.displayName || user.email.split("@")[0]).trim()
  return (
    <PageLabel label="Accueil">
      <div className="flex w-full flex-1 flex-col px-5 py-9 sm:px-8 md:py-12">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
            <span className="h-px w-7 bg-primary/50" />{viewLabels[viewRole]}
          </div>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Bonjour, <span className="text-primary">{firstName}</span></h1>
        </header>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
          {viewRole === "mj" ? <CampaignColumn campaigns={campaigns} /> : viewRole === "admin" ? <TodoColumn /> : <CharacterColumn characters={characters} />}
          <SideColumn withIndex={viewRole !== "joueur"} withTools={viewRole === "admin"} />
        </div>
      </div>
    </PageLabel>
  )
}
