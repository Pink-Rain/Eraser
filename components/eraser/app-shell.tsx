"use client"

import { EditorDockProvider } from "@/components/eraser/editor-dock"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { installNavigationCacheGuard } from "@/lib/navigation-cache"
import { PortraitFramingEffect } from "@/components/eraser/portrait-framing"
import { PageEditButton } from "@/components/eraser/page-edit-button"
import { SharePageButton } from "@/components/eraser/share-page"
import { rememberScroll } from "@/lib/scroll-memory"
import Link from "next/link"
import dynamic from "next/dynamic"
import { usePathname, useRouter } from "next/navigation"
import {
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Crown,
  DownloadCloud,
  FilePlus2,
  Folder,
  Link2,
  PanelLeft,
  Star,
  FlaskConical,
  Home,
  LibraryBig,
  LoaderCircle,
  Map,
  Plus,
  Search,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { internalAppPath } from "@/lib/app-links"
import { allowedRoleViews, type SiteRole } from "@/lib/auth-types"
import { AppTabsProvider } from "@/components/eraser/app-tabs"
import { AccountAvatar, AccountDialog } from "@/components/eraser/account-dialog"
import { DesktopTitlebar } from "@/components/eraser/desktop-titlebar"
import { PendingPage, usePendingPage } from "@/components/eraser/page-transition"
import { useIndexDirectoryLayout, useIndexEntries, useIndexStars } from "@/components/eraser/index-entries"
import { useStoredText } from "@/hooks/use-persistent-state"
import { indexDirectoryOrder } from "@/lib/index-directory"
import "@/lib/desktop-bridge"
import type { AdminTodoRecord, CampaignRecord, CharacterRecord } from "@/lib/google-sheets"
import { campaignCreatedEvent, characterCreatedEvent } from "@/lib/selection-events"
import { cn } from "@/lib/utils"
import { IndexIconGlyph } from "@/components/eraser/index-gauge"
import { menuItemActive, resolveMenu, type MenuIconKey, type MenuPageEntry, type ResolvedMenuItem } from "@/lib/app-menu"
// Seul le numéro de version est gardé (import nommé d'un JSON) : c'est celui du serveur
// qui tourne, donc aussi d'une mise à jour reçue sans réinstallation.
import { version as appVersion } from "@/package.json"
import { PageSearch, ShellBreadcrumb, VolumeControl } from "@/components/eraser/shell-nav"

const AdminTodoMenu = dynamic(() => import("@/components/eraser/admin-todo-menu").then((module) => module.AdminTodoMenu))
const GlobalTableChat = dynamic(() => import("@/components/eraser/global-table-chat").then((module) => module.GlobalTableChat), { ssr: false })
const ItemNotifications = dynamic(() => import("@/components/eraser/item-notifications").then((module) => module.ItemNotifications), { ssr: false })

const PageLabelContext = createContext<(label: string | null) => void>(() => undefined)
/** Deux listes venues du serveur au contenu identique (les tableaux, eux, sont toujours neufs). */
function sameList(left: unknown[], right: unknown[]) {
  return left === right || (left.length === right.length && JSON.stringify(left) === JSON.stringify(right))
}

const ShellDataContext = createContext<{ characters: CharacterRecord[]; campaigns: CampaignRecord[]; /** Faux tant que les listes n'ont jamais répondu (elles arrivent après la page). */ listsLoaded: boolean; viewRole: SiteRole; user: ShellUser; avatarVersion: number; openAccount: () => void; /** La campagne choisie dans le menu (vue MJ). */ selectedCampaignId: string | null; /** Le personnage choisi dans le menu (vue joueur). */ selectedCharacterId?: string | null } | null>(null)

/**
 * Nomme la page (en-tête et onglet). Un PageLabel imbriqué l'emporte sur celui qui
 * l'entoure : une page peut préciser son titre (« Classe · Samouraï ») à l'intérieur
 * du titre général posé par AuthenticatedShell.
 */
export function PageLabel({ label, children }: { label: string; children: ReactNode }) {
  const setParentLabel = useContext(PageLabelContext)
  const [childLabel, setChildLabel] = useState<string | null>(null)
  const effective = childLabel ?? label
  useEffect(() => setParentLabel(effective), [effective, setParentLabel])
  useEffect(() => () => setParentLabel(null), [setParentLabel])
  return <PageLabelContext.Provider value={setChildLabel}>{children}</PageLabelContext.Provider>
}

/** La page de l'atelier qu'affiche la page ouverte (pour « Modifier la page », dans l'en-tête). */
const PageEditContext = createContext<(pageId: string | null) => void>(() => undefined)

/**
 * Signale au bandeau quelle page de l'atelier est affichée (une page créée, ou une page
 * d'Eraser remplacée) : « Modifier la page » l'ouvre directement. Retirée en quittant la page.
 */
export function usePageEditTarget(pageId: string | null) {
  const setTarget = useContext(PageEditContext)
  useEffect(() => { setTarget(pageId); return () => setTarget(null) }, [pageId, setTarget])
}

/** Les données du cadre, ou `null` hors du cadre (aperçus, pages publiques). */
export function useOptionalShellData() {
  return useContext(ShellDataContext)
}

export function useShellData() {
  const value = useContext(ShellDataContext)
  if (!value) throw new Error("SHELL_DATA_UNAVAILABLE")
  return value
}

function IntentLink(props: ComponentProps<typeof Link>) {
  // Automatic and hover prefetching both start the full Google-backed server
  // render. When someone clicks before that slow prefetch completes, the
  // router starts a second identical request. Keep navigation single-shot;
  // route-level Suspense boundaries below make the destination appear at once.
  return <Link {...props} prefetch={false} />
}

export type ShellUser = {
  uid: string
  email: string
  displayName: string
  role: SiteRole
}

const roleLabels: Record<SiteRole, string> = {
  admin: "Administrateur",
  mj: "Maître du jeu",
  joueur: "Joueur",
}

const roleViewLabels: Record<SiteRole, string> = {
  admin: "Vue administrateur",
  mj: "Vue MJ",
  joueur: "Vue joueur",
}

/** Les icônes des entrées du menu d'Eraser. */
const menuIcons: Record<MenuIconKey, typeof BookOpen> = {
  home: Home,
  map: Map,
  user: CircleUserRound,
  scroll: ScrollText,
  library: LibraryBig,
  flask: FlaskConical,
  shield: ShieldCheck,
  "file-plus": FilePlus2,
  menu: PanelLeft,
  link: Link2,
  folder: Folder,
  star: Star,
}

const roleIcons = {
  joueur: UserRound,
  mj: Crown,
  admin: ShieldCheck,
}

/**
 * Une section du menu. Avec `href`, c'est aussi une page : un clic sur son nom l'ouvre, un
 * clic ailleurs sur la ligne (ou sur la flèche) déplie la section. Menu replié, l'icône
 * ouvre la page.
 */
function NavSection({
  label,
  icon: Icon,
  active,
  href,
  pageActive = false,
  children,
}: {
  label: string
  icon: (props: { className?: string }) => ReactNode
  active: boolean
  href?: string
  pageActive?: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const { state, isMobile } = useSidebar()
  const [open, setOpen] = useState(active)
  // Arriver sur une page de la section la déplie (sans la refermer en la quittant).
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setOpen(true)
  }
  const collapsed = state === "collapsed" && !isMobile
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={label} isActive={pageActive} className="h-10 cursor-pointer select-none">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label={href ? `${label} : déplier la section` : label}
            onClick={() => { if (collapsed && href) router.push(href); else setOpen((current) => !current) }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((current) => !current) } }}
          >
            <Icon />
            {href
              ? <IntentLink href={href} onClick={(event) => event.stopPropagation()} className="min-w-0 truncate rounded-sm underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none" title={`Ouvrir ${label}`}>{label}</IntentLink>
              : <span className="min-w-0 truncate">{label}</span>}
            <ChevronDown className="ml-auto shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarMenuButton>
        <CollapsibleContent>
          <SidebarMenuSub>{children}</SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function NavSubLink({ href, label, active, nested = false }: { href: string; label: string; active: boolean; nested?: boolean }) {
  return (
    <SidebarMenuSubItem className={nested ? "ml-3" : undefined}>
      <SidebarMenuSubButton asChild isActive={active}>
        <IntentLink href={href}>
          <span>{label}</span>
        </IntentLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}

export function AppShell({
  user,
  characters,
  campaigns,
  todos,
  initialViewRole,
  pageLabel,
  menu = null,
  campaignPages,
  children,
}: {
  user: ShellUser
  /** Le menu réglé dans l'éditeur, déjà filtré pour la vue du compte ; `null` : celui d'Eraser. */
  menu?: ResolvedMenuItem[] | null
  /** Les pages créées de chaque campagne, sous son dossier (vue MJ) ; en vol avec la liste des campagnes. */
  campaignPages?: Record<string, MenuPageEntry[]> | Promise<Record<string, MenuPageEntry[]>>
  /** Listes de la barre latérale, encore en vol : la coque ne les attend jamais (app/layout.tsx). */
  characters: CharacterRecord[] | Promise<CharacterRecord[]>
  campaigns: CampaignRecord[] | Promise<CampaignRecord[]>
  todos: AdminTodoRecord[]
  initialViewRole: SiteRole
  pageLabel: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  // Les index du menu : étoilés dans la section Index, en rouge directement dans le menu (dans l'ordre de la page Index).
  const managesIndexes = (user.role === "admin" || user.role === "mj") && (initialViewRole === "admin" || initialViewRole === "mj")
  const indexEntries = useIndexEntries(managesIndexes)
  const { starOf } = useIndexStars()
  const { layout: indexLayout } = useIndexDirectoryLayout(indexEntries, managesIndexes)
  const orderedIndexes = useMemo(() => {
    const byKey = new globalThis.Map(indexEntries.map((entry) => [entry.key, entry]))
    return indexDirectoryOrder(indexLayout).flatMap((key) => byKey.get(key) ?? [])
  }, [indexEntries, indexLayout])
  const [accountOpen, setAccountOpen] = useState(false)
  const openAccount = useCallback(() => setAccountOpen(true), [])
  const [avatarVersion, setAvatarVersion] = useState(0)
  const characterStorageKey = `eraser-character:${user.email}`
  const campaignStorageKey = `eraser-campaign:${user.email}`
  const [viewRole, setViewRole] = useState<SiteRole>(initialViewRole)
  // Le personnage et la campagne retenus sont lus dans le stockage dès le premier rendu
  // client, et non plus recopiés dans un état par un minuteur après peinture.
  const [selectedCharacterId, setSelectedCharacterId] = useStoredText(characterStorageKey)
  const [selectedCampaignId, setSelectedCampaignId] = useStoredText(campaignStorageKey)
  const [visibleCharacters, setVisibleCharacters] = useState<CharacterRecord[]>(() => Array.isArray(characters) ? characters : [])
  const [visibleCampaigns, setVisibleCampaigns] = useState<CampaignRecord[]>(() => Array.isArray(campaigns) ? campaigns : [])
  const [visibleCampaignPages, setVisibleCampaignPages] = useState<Record<string, MenuPageEntry[]>>(() => campaignPages && !(campaignPages instanceof Promise) ? campaignPages : {})
  // Tant que les listes n'ont jamais répondu, la barre latérale et l'accueil disent qu'elles
  // arrivent, au lieu d'annoncer « aucun personnage ».
  const [listsLoaded, setListsLoaded] = useState(() => Array.isArray(characters) && Array.isArray(campaigns))
  const [visibleTodos, setVisibleTodos] = useState(todos)
  // Un choix retenu qui n'est plus dans la liste (supprimé, autre compte) ne sélectionne rien.
  const selectedCharacter = useMemo(
    () => visibleCharacters.find((character) => character.id === selectedCharacterId) ?? null,
    [visibleCharacters, selectedCharacterId],
  )
  const selectedCampaign = useMemo(
    () => visibleCampaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [visibleCampaigns, selectedCampaignId],
  )
  const selectedCampaignInList = selectedCampaign?.id ?? null
  const selectedCharacterInList = selectedCharacter?.id ?? null
  // Le compte ne change pas d'une page à l'autre : le même objet, tant que ses champs sont les mêmes.
  const { uid: userUid, email: userEmail, displayName: userDisplayName, role: userRole } = user
  const shellUser = useMemo<ShellUser>(() => ({ uid: userUid, email: userEmail, displayName: userDisplayName, role: userRole }), [userDisplayName, userEmail, userRole, userUid])
  // Les pages qui lisent ces données ne se redessinent que si elles changent vraiment.
  const shellData = useMemo(() => ({ characters: visibleCharacters, campaigns: visibleCampaigns, listsLoaded, viewRole, user: shellUser, avatarVersion, openAccount, selectedCampaignId: selectedCampaignInList, selectedCharacterId: selectedCharacterInList }), [avatarVersion, listsLoaded, openAccount, selectedCampaignInList, selectedCharacterInList, shellUser, viewRole, visibleCampaigns, visibleCharacters])
  // Au clic, la page de destination s'affiche aussitôt, sans ses données ; le titre d'un
  // personnage ou d'une campagne est déjà connu ici.
  const pendingPage = usePendingPage((to) => {
    const match = to.match(/^\/(personnage|campagne)\/([^/]+)\/?$/)
    if (!match) return undefined
    const id = decodeURIComponent(match[2])
    return match[1] === "personnage" ? visibleCharacters.find((character) => character.id === id)?.name : visibleCampaigns.find((campaign) => campaign.id === id)?.name
  }, children)
  const [currentPageLabel, setCurrentPageLabel] = useState(pageLabel)
  // La page de l'atelier affichée (page créée, page d'Eraser remplacée) : « Modifier la page » l'ouvre.
  const [editPageId, setEditPageId] = useState<string | null>(null)
  // Le titre le plus précis l'emporte ; un titre retiré (page quittée) ne vide pas l'en-tête.
  const setShellLabel = useCallback((label: string | null) => { if (label) setCurrentPageLabel(label) }, [])
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [todosLoaded, setTodosLoaded] = useState(todos.length > 0 || user.role !== "admin")
  const todosLoadingRef = useRef(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateNotice, setUpdateNotice] = useState("")

  // Une modification enregistrée rend périmées les pages gardées par le routeur : elles
  // sont oubliées, et revenir sur un index le relit au lieu d'en montrer l'ancienne copie.
  useEffect(() => installNavigationCacheGuard(), [])

  // Revenir sur une page (autre onglet d'Eraser, lien) la remet là où on l'avait laissée.
  const pageScrollerRef = useRef<HTMLDivElement>(null)
  const pageArriving = Boolean(pendingPage)
  useEffect(() => {
    const scroller = pageScrollerRef.current
    if (!scroller || pageArriving) return
    return rememberScroll(`eraser:page-scroll:${pathname}`, scroller, 60)
  }, [pageArriving, pathname])

  // Un lien vers une page d'Eraser écrit dans un texte enrichi est un simple <a> :
  // on l'ouvre sur place, comme un lien du menu, au lieu de recharger toute l'appli.
  useEffect(() => {
    function openAppLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]")
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.closest("[contenteditable='true']")) return
      const href = internalAppPath(anchor.getAttribute("href") || "")
      if (!href) return
      event.preventDefault()
      router.push(href)
    }
    document.addEventListener("click", openAppLink)
    return () => document.removeEventListener("click", openAppLink)
  }, [router])

  // Chaque clic renvoie la liste du serveur (un nouveau tableau, souvent identique, encore en
  // vol) : elle n'est reprise que si elle a changé, sinon toute l'enveloppe se redessinait à
  // chaque page. Pendant qu'elle arrive, la barre latérale garde la précédente.
  // Les tâches ne sont plus recopiées ici : la coque reçoit toujours une liste vide, qui
  // effaçait à chaque navigation celle chargée depuis le menu du compte.
  useEffect(() => {
    let active = true
    void Promise.all([characters, campaigns]).then(([nextCharacters, nextCampaigns]) => {
      if (!active) return
      setVisibleCharacters((current) => sameList(current, nextCharacters) ? current : nextCharacters)
      setVisibleCampaigns((current) => sameList(current, nextCampaigns) ? current : nextCampaigns)
      setListsLoaded(true)
    })
    return () => { active = false }
  }, [campaigns, characters])

  useEffect(() => {
    let active = true
    void Promise.resolve(campaignPages ?? {}).then((next) => {
      if (!active) return
      setVisibleCampaignPages((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    })
    return () => { active = false }
  }, [campaignPages])

  useEffect(() => {
    if (!accountMenuOpen || viewRole !== "admin" || user.role !== "admin" || todosLoaded || todosLoadingRef.current) return
    let active = true
    todosLoadingRef.current = true
    fetch("/api/admin/todos").then(async (response) => ({ response, payload: (await response.json()) as { todos?: AdminTodoRecord[] } })).then(({ response, payload }) => {
      if (!active) return
      if (response.ok) { setVisibleTodos(payload.todos || []); setTodosLoaded(true) }
    }).catch(() => undefined).finally(() => { todosLoadingRef.current = false })
    return () => { active = false }
  }, [accountMenuOpen, todosLoaded, user.role, viewRole])

  // Une campagne ou un personnage tout juste créé rejoint la liste et devient la
  // sélection : on arrive sur son tableau de bord ou sa fiche déjà choisi.
  useEffect(() => {
    function campaignCreated(event: Event) {
      const campaign = (event as CustomEvent<CampaignRecord>).detail
      if (!campaign?.id) return
      setVisibleCampaigns((current) => current.some((item) => item.id === campaign.id) ? current : [campaign, ...current])
      setSelectedCampaignId(campaign.id)
    }
    function characterCreated(event: Event) {
      const character = (event as CustomEvent<CharacterRecord>).detail
      if (!character?.id) return
      setVisibleCharacters((current) => current.some((item) => item.id === character.id) ? current : [character, ...current])
      setSelectedCharacterId(character.id)
    }
    window.addEventListener(campaignCreatedEvent, campaignCreated)
    window.addEventListener(characterCreatedEvent, characterCreated)
    return () => {
      window.removeEventListener(campaignCreatedEvent, campaignCreated)
      window.removeEventListener(characterCreatedEvent, characterCreated)
    }
  }, [setSelectedCampaignId, setSelectedCharacterId])

  // Ouvrir la fiche d'un de ses personnages ou le tableau de bord d'une de ses
  // campagnes (depuis l'accueil, un index, un lien) le sélectionne aussi.
  useEffect(() => {
    // Le choix est écrit dans le stockage (qui prévient la coque) seulement s'il change.
    const characterMatch = pathname.match(/^\/personnage\/([^/]+)/)
    const campaignMatch = pathname.match(/^\/campagne\/([^/]+)/)
    const characterId = characterMatch ? decodeURIComponent(characterMatch[1]) : ""
    if (characterId && visibleCharacters.some((item) => item.id === characterId)) setSelectedCharacterId(characterId)
    const campaignId = campaignMatch ? decodeURIComponent(campaignMatch[1]) : ""
    if (campaignId && visibleCampaigns.some((item) => item.id === campaignId)) setSelectedCampaignId(campaignId)
  }, [pathname, setSelectedCampaignId, setSelectedCharacterId, visibleCampaigns, visibleCharacters])

  useEffect(() => {
    function updateCampaign(event: Event) {
      const campaign = (event as CustomEvent<CampaignRecord>).detail
      if (!campaign?.id) return
      setVisibleCampaigns((current) => current.map((item) => item.id === campaign.id ? campaign : item))
    }
    window.addEventListener("eraser:campaign-updated", updateCampaign)
    return () => window.removeEventListener("eraser:campaign-updated", updateCampaign)
  }, [])

  async function changeView(nextRole: SiteRole) {
    if (!allowedRoleViews[user.role].includes(nextRole)) return
    const response = await fetch("/api/auth/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    })
    if (!response.ok) return
    setViewRole(nextRole)
    window.location.assign("/")
  }

  // Choisir enregistre : le stockage prévient la coque.
  const selectCharacter = setSelectedCharacterId
  const selectCampaign = setSelectedCampaignId

  async function deleteItem(kind: "character" | "campaign", id: string) {
    const response = await fetch("/api/items/delete", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id }),
    })
    if (!response.ok) return
    // Retiré de la liste, il n'est plus sélectionné (le choix retenu ne désigne plus rien).
    if (kind === "character") setVisibleCharacters((current) => current.filter((item) => item.id !== id))
    else setVisibleCampaigns((current) => current.filter((item) => item.id !== id))
  }

  const viewControls = user.role !== "joueur" && (
    <span className="flex items-center gap-1" aria-label="Changer de vue">
      {allowedRoleViews[user.role].map((role) => {
        const Icon = roleIcons[role]
        return (
          <Button key={role} type="button" variant="ghost" size="icon" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void changeView(role) }} className={cn("size-7 rounded-md", viewRole === role && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")} aria-label={roleViewLabels[role]} title={roleViewLabels[role]}>
            <Icon className="size-3.5" />
          </Button>
        )
      })}
    </span>
  )

  // Le menu : celui d'Eraser, ou celui réglé dans l'éditeur du menu (même rendu, mêmes rôles).
  const menuItems = useMemo(() => menu ?? resolveMenu(null, { role: viewRole, pages: {} }), [menu, viewRole])
  const managesMenu = (user.role === "admin" || user.role === "mj") && (viewRole === "admin" || viewRole === "mj")

  function menuIcon(item: ResolvedMenuItem) {
    if (item.icon || item.emoji) return <IndexIconGlyph icon={item.icon} emoji={item.emoji} filled={Boolean(item.emoji)} className="size-4" />
    const Icon = menuIcons[item.builtinIcon ?? "link"]
    return <Icon />
  }

  function renderSubItem(item: ResolvedMenuItem) {
    if (item.dynamic === "index-etoiles") {
      // Les index étoilés, dans l'ordre de la page Index ; les autres restent sur la page.
      return orderedIndexes.filter((entry) => starOf(entry.key) === "star" || (starOf(entry.key) === "none" && pathname === entry.href)).map((entry) => (
        <NavSubLink key={entry.key} href={entry.href} label={entry.label} active={pathname === entry.href} />
      ))
    }
    if (item.dynamic === "section-pages") {
      // Les pages du créateur de pages rangées dans la section, sous ses pages d'Eraser.
      return (item.pages ?? []).map((page) => <NavSubLink key={`${item.key}:${page.href}`} href={page.href} label={page.title} active={pathname === page.href} />)
    }
    if (!item.href) return null
    return <NavSubLink key={item.key} href={item.href} label={item.label} active={menuItemActive(item, pathname)} />
  }

  function renderMenuItem(item: ResolvedMenuItem): ReactNode {
    if (item.dynamic === "dossier") {
      if (viewRole !== "mj" || !selectedCampaign) return null
      const campaignHref = `/campagne/${encodeURIComponent(selectedCampaign.id)}`
      return <NavSection key={item.key} label={`Dossier - ${selectedCampaign.name}`} icon={Map} active={pathname.startsWith("/campagne/")} href={`${campaignHref}/dossier`} pageActive={pathname === `${campaignHref}/dossier`}>
        <NavSubLink href={campaignHref} label={`Campagne - ${selectedCampaign.name}`} active={pathname === campaignHref} />
        <NavSubLink nested href={`${campaignHref}/journal`} label={`Journal de ${selectedCampaign.name}`} active={pathname === `${campaignHref}/journal`} />
        <NavSubLink href={`${campaignHref}/lieux-et-rencontres`} label="Créateur de session" active={pathname === `${campaignHref}/lieux-et-rencontres`} />
        <NavSubLink nested href={`${campaignHref}/evenements`} label="Événements" active={pathname === `${campaignHref}/evenements`} />
        <NavSubLink nested href={`${campaignHref}/magasin-et-fouille`} label="Magasins" active={pathname.startsWith(`${campaignHref}/magasin-et-fouille`)} />
        <NavSubLink nested href={`${campaignHref}/fouilles`} label="Fouilles" active={pathname === `${campaignHref}/fouilles`} />
        <NavSubLink nested href={`${campaignHref}/pnjs`} label="PNJs" active={pathname === `${campaignHref}/pnjs`} />
        <NavSubLink nested href={`${campaignHref}/document`} label="Document" active={pathname === `${campaignHref}/document`} />
        {(visibleCampaignPages[selectedCampaign.id] ?? []).map((page) => <NavSubLink key={page.href} href={page.href} label={page.title} active={pathname === page.href} />)}
      </NavSection>
    }
    if (item.dynamic === "personnage") {
      if (viewRole !== "joueur" || !selectedCharacter) return null
      const characterHref = `/personnage/${encodeURIComponent(selectedCharacter.id)}`
      return (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton asChild tooltip={selectedCharacter.name} isActive={pathname === characterHref} className="h-10">
            <IntentLink href={characterHref}>
              <CircleUserRound />
              <span>{selectedCharacter.name}</span>
            </IntentLink>
          </SidebarMenuButton>
          {selectedCharacter.campaigns.length > 0 && (
            <SidebarMenuSub>
              {selectedCharacter.campaigns.map((campaign) => {
                const href = `/campagne/${encodeURIComponent(campaign.id)}`
                return <div key={campaign.id}><NavSubLink href={href} label={`Campagne - ${campaign.name}`} active={pathname === href} /><NavSubLink nested href={`${href}/journal`} label={`Journal de ${campaign.name}`} active={pathname === `${href}/journal`} /></div>
              })}
            </SidebarMenuSub>
          )}
          {/* Menu replié, la liste des campagnes disparaît : chacune garde une icône cliquable. */}
          {selectedCharacter.campaigns.map((campaign) => {
            const href = `/campagne/${encodeURIComponent(campaign.id)}`
            return <div key={campaign.id} className="contents">
              <SidebarMenuButton asChild tooltip={`Campagne - ${campaign.name}`} isActive={pathname === href} className="mt-1 hidden group-data-[collapsible=icon]:flex">
                <IntentLink href={href} aria-label={`Campagne - ${campaign.name}`}>
                  <Map style={{ color: campaign.accentColor }} />
                  <span>{campaign.name}</span>
                </IntentLink>
              </SidebarMenuButton>
              <SidebarMenuButton asChild tooltip={`Journal de ${campaign.name}`} isActive={pathname === `${href}/journal`} className="mt-1 hidden group-data-[collapsible=icon]:flex">
                <IntentLink href={`${href}/journal`} aria-label={`Journal de ${campaign.name}`}>
                  <BookOpen style={{ color: campaign.accentColor }} />
                  <span>Journal de {campaign.name}</span>
                </IntentLink>
              </SidebarMenuButton>
            </div>
          })}
        </SidebarMenuItem>
      )
    }
    if (item.dynamic === "index-rouges") {
      if (!managesMenu) return null
      // Les index à l'étoile rouge (le créateur de classe et l'index des items d'abord), directement dans le menu.
      return orderedIndexes.filter((entry) => starOf(entry.key) === "red").map((entry) => {
        const EntryIcon = entry.icon
        return <SidebarMenuItem key={`${item.key}:${entry.key}`}>
          <SidebarMenuButton asChild tooltip={entry.label} isActive={pathname === entry.href || pathname.startsWith(`${entry.href}/`)} className="h-10">
            <IntentLink href={entry.href}>
              <EntryIcon />
              <span>{entry.label}</span>
            </IntentLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      })
    }
    if (item.section) {
      const childActive = (item.children ?? []).some((child) => menuItemActive(child, pathname) || (child.pages ?? []).some((page) => page.href === pathname))
      return <NavSection key={item.key} label={item.label} icon={() => menuIcon(item)} href={item.href} pageActive={Boolean(item.href) && pathname === item.href} active={childActive || (Boolean(item.href) && menuItemActive(item, pathname))}>
        {(item.children ?? []).map((child) => renderSubItem(child))}
      </NavSection>
    }
    if (!item.href) return null
    const external = item.href.startsWith("http")
    return <SidebarMenuItem key={item.key}>
      <SidebarMenuButton asChild tooltip={item.label} isActive={menuItemActive(item, pathname)} className="h-10">
        {external
          ? <a href={item.href} target="_blank" rel="noreferrer">{menuIcon(item)}<span>{item.label}</span></a>
          : <IntentLink href={item.href}>{menuIcon(item)}<span>{item.label}</span></IntentLink>}
      </SidebarMenuButton>
      {item.action && <SidebarMenuAction asChild showOnHover={false} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
        <IntentLink href={item.action.href} aria-label={item.action.label} title={item.action.label}><Plus /></IntentLink>
      </SidebarMenuAction>}
    </SidebarMenuItem>
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.assign("/connexion")
  }

  async function checkForUpdates() {
    if (!window.eraserDesktop) { setUpdateNotice("Disponible uniquement dans l’application Windows."); return }
    setCheckingUpdate(true); setUpdateNotice("")
    try {
      const result = await window.eraserDesktop.checkForUpdates()
      // Un message court : il n'y a rien, ou la version qui arrive.
      if (result.status === "ready" || result.status === "available") setUpdateNotice(["Eraser", result.updateVersion, "en cours de téléchargement"].filter(Boolean).join(" "))
      else if (result.status === "not-available") setUpdateNotice("Aucune mise à jour")
      else if (result.status === "unavailable") setUpdateNotice("Disponible uniquement dans l’application Windows.")
      else setUpdateNotice("Vérification impossible, réessaie plus tard.")
    } catch {
      setUpdateNotice("Vérification impossible, réessaie plus tard.")
    } finally {
      setCheckingUpdate(false)
      window.setTimeout(() => setUpdateNotice(""), 8000)
    }
  }

  return (
    <PageLabelContext.Provider value={setShellLabel}>
    {/* Les avatars rognés montrent le visage choisi dans l'éditeur de token. */}
    <PortraitFramingEffect />
    {/* Les onglets enveloppent la barre de titre, qui les affiche, et toute la coque :
        le clic droit sur un lien est capté au niveau du document. */}
    <AppTabsProvider pathname={pathname} label={currentPageLabel}>
    {/* The sidebar is always dark; without this the OS-default light scrollbar
        shows up on top of it. Kept as an inline style tag (not globals.css)
        since historical CSS files must stay byte-identical to the site. */}
    <style>{`
      [data-sidebar="content"] { scrollbar-width: thin; scrollbar-color: var(--sidebar-border) transparent; }
      [data-sidebar="content"]::-webkit-scrollbar { width: 8px; }
      [data-sidebar="content"]::-webkit-scrollbar-track { background: transparent; }
      [data-sidebar="content"]::-webkit-scrollbar-thumb { background-color: var(--sidebar-border); border-radius: 9999px; }
      [data-sidebar="content"]::-webkit-scrollbar-thumb:hover { background-color: var(--sidebar-ring); }
    `}</style>
    {/* DesktopTitlebar renders nothing on the website (no window.eraserDesktop).
        In the desktop app it's a `position: fixed` overlay (not a normal-flow
        sibling — an earlier attempt to reserve flow space via a `transform`
        containing-block trick on a wrapper div didn't actually shift the
        sidebar's own `fixed inset-y-0` panel, which kept rendering under the
        bar instead of below it). It compensates by injecting its own <style>
        overrides that pad/shrink the sidebar primitives by its height instead. */}
    <DesktopTitlebar />
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="gap-3 border-b border-sidebar-border p-3 group-data-[collapsible=icon]:p-1">
          <div className="flex items-center gap-2">
            <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="size-12 shrink-0 overflow-hidden rounded-xl p-0 hover:bg-transparent group-data-[collapsible=icon]:size-8"
                  aria-label="Ouvrir mes personnages"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/eraser-logo.png" alt="" className="size-full object-contain transition-transform hover:scale-105" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-80">
                {viewRole === "admin" ? (
                  <AdminTodoMenu todos={visibleTodos} onTodosChange={setVisibleTodos} viewControls={viewControls} />
                ) : (
                  <>
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
                  <span>{viewRole === "mj" ? "Mes campagnes" : "Mes personnages"}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7 rounded-md"
                    data-tab-href={viewRole === "mj" ? "/creation-de-campagne" : "/creation-de-personnage"}
                    data-tab-label={viewRole === "mj" ? "Nouvelle campagne" : "Nouveau personnage"}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      router.push(viewRole === "mj" ? "/creation-de-campagne" : "/creation-de-personnage")
                    }}
                    aria-label={viewRole === "mj" ? "Créer une campagne" : "Créer un personnage"}
                    title={viewRole === "mj" ? "Créer une campagne" : "Créer un personnage"}
                  >
                    <Plus className="size-4" />
                  </Button>
                  {viewControls}
                </div>
                <DropdownMenuSeparator />
                {viewRole === "mj" && visibleCampaigns.length ? (
                  visibleCampaigns.map((campaign) => (
                    <div key={campaign.id} data-tab-href={`/campagne/${encodeURIComponent(campaign.id)}`} data-tab-label={campaign.name} onClick={() => selectCampaign(campaign.id)} className="flex cursor-pointer items-center gap-2 rounded-md border-l-2 px-2 py-2 transition-colors hover:bg-accent" style={{ borderColor: selectedCampaignId === campaign.id ? campaign.accentColor : "transparent", backgroundColor: selectedCampaignId === campaign.id ? `${campaign.accentColor}12` : undefined }}>
                      <div className={cn(
                        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground",
                      )} style={{ borderColor: `${campaign.accentColor}88`, color: campaign.accentColor, boxShadow: selectedCampaignId === campaign.id ? `0 0 0 2px ${campaign.accentColor}33` : undefined }}>
                        <Map className="size-4" />
                        {campaign.bannerUrl && <img src={campaign.bannerUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />}
                      </div>
                      <p className="min-w-0 flex-1 truncate font-medium" style={{ color: selectedCampaignId === campaign.id ? campaign.accentColor : undefined }}>{campaign.name}</p>
                      <Button asChild variant="ghost" size="icon-xs"><IntentLink href={`/campagne/${encodeURIComponent(campaign.id)}`} onClick={(event) => { event.stopPropagation(); selectCampaign(campaign.id) }} aria-label="Ouvrir le tableau de bord"><Search /></IntentLink></Button>
                      <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-xs" onClick={(event) => event.stopPropagation()} aria-label="Supprimer la campagne"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Mettre cette campagne à la corbeille ?</AlertDialogTitle><AlertDialogDescription>Ses données pourront être restaurées par un administrateur.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteItem("campaign", campaign.id)}>Mettre à la corbeille</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                    </div>
                  ))
                ) : !listsLoaded && (viewRole === "mj" || !visibleCharacters.length) ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground" role="status">
                    <LoaderCircle className="size-4 animate-spin" />
                    {viewRole === "mj" ? "Chargement des campagnes…" : "Chargement des personnages…"}
                  </div>
                ) : viewRole === "mj" ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    <Map className="mx-auto mb-2 size-7 opacity-60" />
                    Aucune campagne n’est encore reliée à ce compte.
                  </div>
                ) : visibleCharacters.length ? (
                  visibleCharacters.map((character) => (
                    <div key={character.id} data-tab-href={`/personnage/${encodeURIComponent(character.id)}`} data-tab-label={character.name} onClick={() => selectCharacter(character.id)} className="flex cursor-pointer items-center gap-2 rounded-md border-l-2 px-2 py-2 transition-colors hover:bg-accent" style={{ borderColor: selectedCharacterId === character.id ? character.campaigns[0]?.accentColor || "var(--primary)" : "transparent", backgroundColor: selectedCharacterId === character.id ? `${character.campaigns[0]?.accentColor || "#927640"}12` : undefined }}>
                      <div className={cn(
                        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground",
                      )} style={{ borderColor: `${character.campaigns[0]?.accentColor || "#927640"}88` }}>
                        <CircleUserRound className="size-4" />
                        <img src={`/api/characters/portrait/${encodeURIComponent(character.id)}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{character.name}</p>
                        {character.campaigns.length ? (
                          <div className="mt-0.5 flex min-w-0 gap-1 overflow-hidden">
                            {character.campaigns.map((campaign) => (
                              <span key={campaign.id} className="truncate text-xs" style={{ color: campaign.accentColor }}>{campaign.name}</span>
                            ))}
                          </div>
                        ) : <p className="truncate text-xs text-muted-foreground">Sans campagne</p>}
                      </div>
                      <Button asChild variant="ghost" size="icon-xs"><IntentLink href={`/personnage/${encodeURIComponent(character.id)}`} onClick={(event) => { event.stopPropagation(); selectCharacter(character.id) }} aria-label="Ouvrir la fiche"><Search /></IntentLink></Button>
                      <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-xs" onClick={(event) => event.stopPropagation()} aria-label="Supprimer le personnage"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Mettre ce personnage à la corbeille ?</AlertDialogTitle><AlertDialogDescription>Sa fiche pourra être restaurée par un administrateur.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => deleteItem("character", character.id)}>Mettre à la corbeille</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    <CircleUserRound className="mx-auto mb-2 size-7 opacity-60" />
                    Aucun personnage n’a encore été créé pour ce compte.
                  </div>
                )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="font-display truncate text-lg font-semibold tracking-wide">Eraser</p>
              <p className="truncate text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground/55">
                Carnet de campagne
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => renderMenuItem(item))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {user.role === "admin" && viewRole === "admin" && (
          <SidebarGroup className="mt-auto border-t border-sidebar-border">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Corbeille" isActive={pathname === "/administration/corbeille"} className="h-10">
                    <IntentLink href="/administration/corbeille"><Trash2 /><span>Corbeille</span></IntentLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Actualiser / mise à jour concernent l'application de bureau elle-même,
            pas les droits d'administration : visibles quel que soit le rôle. */}
        <SidebarGroup className={user.role === "admin" && viewRole === "admin" ? "border-t border-sidebar-border" : "mt-auto border-t border-sidebar-border"}>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Chercher les mises à jour" className="h-10" onClick={() => void checkForUpdates()} disabled={checkingUpdate}>
                  <DownloadCloud className={checkingUpdate ? "animate-pulse" : undefined} />
                  {/* La version qui tourne (celle du serveur, mise à jour sans réinstallation comprise), en tout petit. */}
                  <span className="flex min-w-0 flex-col leading-tight"><span className="truncate">{checkingUpdate ? "Recherche…" : "Chercher les mises à jour"}</span><span className="truncate text-[10px] font-normal text-sidebar-foreground/40">{appVersion}</span></span>
                </SidebarMenuButton>
                {updateNotice && <p className="px-2 pb-1 pt-0.5 text-[11px] leading-4 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">{updateNotice}</p>}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              {/* Un clic ouvre le profil (personnages, campagnes, succès) ; la roue, les
                  réglages du compte : avatar, pseudo, e-mail, mot de passe, déconnexion. */}
              <SidebarMenuButton asChild size="lg" tooltip="Mon profil" isActive={pathname === "/profil"} className="pr-9">
                <IntentLink href="/profil" data-tab-href="/profil" data-tab-label="Mon profil">
                  <AccountAvatar user={user} version={avatarVersion} className="size-8 shrink-0" />
                  <div className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-medium">{user.displayName || user.email}</span>
                    <span className="block truncate text-xs text-sidebar-foreground/55">
                      {roleLabels[user.role]}
                    </span>
                  </div>
                </IntentLink>
              </SidebarMenuButton>
              <SidebarMenuAction onClick={() => setAccountOpen(true)} aria-haspopup="dialog" aria-label="Réglages du compte" title="Réglages du compte" className="text-sidebar-foreground/55">
                <Settings2 />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
          {accountOpen && <AccountDialog open onOpenChange={setAccountOpen} user={user} roleLabel={roleLabels[user.role]} avatarVersion={avatarVersion} onAvatarChange={() => setAvatarVersion(Date.now())} onSignOut={() => void signOut()} />}
        </SidebarFooter>
      </Sidebar>

      {/* La hauteur est fixée et seul le bloc de contenu défile : l’en-tête reste visible
          quelle que soit la page affichée, sans dépendre d’un `position: sticky` que le
          contenu d’une page pourrait neutraliser. */}
      <SidebarInset className="h-svh min-h-svh min-w-0 w-0 flex-1 overflow-hidden">
        <header className="z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 shadow-sm backdrop-blur md:px-7">
          <SidebarTrigger aria-label="Afficher ou masquer la navigation" />
          {/* Le fil d'Ariane suit la page qui s'ouvre dès le clic, puis celle affichée. */}
          <ShellBreadcrumb pathname={pendingPage?.to || pathname} current={pendingPage?.title || currentPageLabel} campaignName={(id) => visibleCampaigns.find((campaign) => campaign.id === id)?.name} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <PageSearch />
            {user.role === "admin" && viewRole === "admin" && !pendingPage && <PageEditButton pathname={pathname} pageId={editPageId} />}
            <SharePageButton title={currentPageLabel} />
            <VolumeControl />
            <Badge variant="outline" className="hidden shrink-0 border-primary/20 bg-primary/5 sm:inline-flex">
              {roleViewLabels[viewRole]}
            </Badge>
          </div>
        </header>
        {/* `--eraser-viewport` : la hauteur visible de ce bloc (l’écran moins l’en-tête), pour
            les calques qui couvrent l’écran pendant qu’on fait défiler (FX page entière). */}
        <div ref={pageScrollerRef} className="paper-grain flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip overscroll-contain [--eraser-viewport:calc(100svh-3.5rem)]">
          <ShellDataContext.Provider value={shellData}>
            <PageEditContext.Provider value={setEditPageId}>
            {pendingPage && <PendingPage pending={pendingPage} />}
            {/* La page actuelle reste montée (cachée) pendant que la suivante arrive. */}
            {/* « Modifier » d'un index reste ouvert en changeant de page : il vit ici, pas dans la page. */}
            <EditorDockProvider areaRef={pageScrollerRef}>
            <div data-view-role={viewRole} className={pendingPage ? "hidden" : "contents"}>
              {children}
            </div>
            </EditorDockProvider>
            </PageEditContext.Provider>
          </ShellDataContext.Provider>
        </div>
      </SidebarInset>
    </SidebarProvider>
    <GlobalTableChat user={{ uid: user.uid, role: user.role }} />
    <ItemNotifications />
    </AppTabsProvider>
    </PageLabelContext.Provider>
  )
}
