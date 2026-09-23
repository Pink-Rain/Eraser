"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { usePathname, useRouter } from "next/navigation"
import {
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Crown,
  DownloadCloud,
  FlaskConical,
  Home,
  LibraryBig,
  LogOut,
  Map,
  Plus,
  RefreshCw,
  Search,
  ScrollText,
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
  CollapsibleTrigger,
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { allowedRoleViews, type SiteRole } from "@/lib/auth-types"
import { AppTabsProvider } from "@/components/eraser/app-tabs"
import { DesktopTitlebar } from "@/components/eraser/desktop-titlebar"
import "@/lib/desktop-bridge"
import type { AdminTodoRecord, CampaignRecord, CharacterRecord } from "@/lib/google-sheets"
import { cn } from "@/lib/utils"

const AdminTodoMenu = dynamic(() => import("@/components/eraser/admin-todo-menu").then((module) => module.AdminTodoMenu))
const GlobalTableChat = dynamic(() => import("@/components/eraser/global-table-chat").then((module) => module.GlobalTableChat), { ssr: false })

const PageLabelContext = createContext<(label: string) => void>(() => undefined)
const ShellDataContext = createContext<{ characters: CharacterRecord[]; campaigns: CampaignRecord[]; viewRole: SiteRole } | null>(null)

export function PageLabel({ label, children }: { label: string; children: ReactNode }) {
  const setPageLabel = useContext(PageLabelContext)
  useEffect(() => setPageLabel(label), [label, setPageLabel])
  return children
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

const roleIcons = {
  joueur: UserRound,
  mj: Crown,
  admin: ShieldCheck,
}

function NavSection({
  label,
  icon: Icon,
  active,
  children,
}: {
  label: string
  icon: typeof BookOpen
  active: boolean
  children: ReactNode
}) {
  return (
    <Collapsible defaultOpen={active} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} className="h-10">
            <Icon />
            <span>{label}</span>
            <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
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
  children,
}: {
  user: ShellUser
  characters: CharacterRecord[]
  campaigns: CampaignRecord[]
  todos: AdminTodoRecord[]
  initialViewRole: SiteRole
  pageLabel: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const characterStorageKey = `eraser-character:${user.email}`
  const campaignStorageKey = `eraser-campaign:${user.email}`
  const [viewRole, setViewRole] = useState<SiteRole>(initialViewRole)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [visibleCharacters, setVisibleCharacters] = useState(characters)
  const [visibleCampaigns, setVisibleCampaigns] = useState(campaigns)
  const [visibleTodos, setVisibleTodos] = useState(todos)
  const [currentPageLabel, setCurrentPageLabel] = useState(pageLabel)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [todosLoaded, setTodosLoaded] = useState(todos.length > 0 || user.role !== "admin")
  const todosLoadingRef = useRef(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateNotice, setUpdateNotice] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisibleCharacters(characters)
      setVisibleCampaigns(campaigns)
      setVisibleTodos(todos)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [campaigns, characters, todos])

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

  useEffect(() => {
    function updateCampaign(event: Event) {
      const campaign = (event as CustomEvent<CampaignRecord>).detail
      if (!campaign?.id) return
      setVisibleCampaigns((current) => current.map((item) => item.id === campaign.id ? campaign : item))
    }
    window.addEventListener("eraser:campaign-updated", updateCampaign)
    return () => window.removeEventListener("eraser:campaign-updated", updateCampaign)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedCharacter = window.localStorage.getItem(characterStorageKey)
      if (savedCharacter && visibleCharacters.some((character) => character.id === savedCharacter)) {
        setSelectedCharacterId(savedCharacter)
      }
      const savedCampaign = window.localStorage.getItem(campaignStorageKey)
      if (savedCampaign && visibleCampaigns.some((campaign) => campaign.id === savedCampaign)) {
        setSelectedCampaignId(savedCampaign)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [campaignStorageKey, characterStorageKey, visibleCampaigns, visibleCharacters])

  const selectedCharacter = useMemo(
    () => visibleCharacters.find((character) => character.id === selectedCharacterId) ?? null,
    [visibleCharacters, selectedCharacterId],
  )
  const selectedCampaign = useMemo(
    () => visibleCampaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [visibleCampaigns, selectedCampaignId],
  )

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

  function selectCharacter(characterId: string) {
    window.localStorage.setItem(characterStorageKey, characterId)
    setSelectedCharacterId(characterId)
  }

  function selectCampaign(campaignId: string) {
    window.localStorage.setItem(campaignStorageKey, campaignId)
    setSelectedCampaignId(campaignId)
  }

  async function deleteItem(kind: "character" | "campaign", id: string) {
    const response = await fetch("/api/items/delete", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id }),
    })
    if (!response.ok) return
    if (kind === "character") {
      setVisibleCharacters((current) => current.filter((item) => item.id !== id))
      if (selectedCharacterId === id) setSelectedCharacterId(null)
    } else {
      setVisibleCampaigns((current) => current.filter((item) => item.id !== id))
      if (selectedCampaignId === id) setSelectedCampaignId(null)
    }
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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.assign("/connexion")
  }

  async function checkForUpdates() {
    if (!window.eraserDesktop) { setUpdateNotice("Disponible uniquement dans l’application Windows."); return }
    setCheckingUpdate(true); setUpdateNotice("")
    try {
      const result = await window.eraserDesktop.checkForUpdates()
      switch (result.status) {
        case "ready":
          setUpdateNotice(`Eraser ${result.updateVersion || ""} est prêt : il s’applique en quelques secondes, sans réinstallation.`.replace("  ", " "))
          break
        case "available":
          setUpdateNotice(`Mise à jour ${result.updateVersion || ""} trouvée : téléchargement en cours, elle s’installera toute seule, sans assistant.`.replace("  ", " "))
          break
        case "not-available":
          setUpdateNotice("Aucune mise à jour disponible, tu as déjà la dernière version.")
          break
        case "timeout":
          setUpdateNotice("La vérification prend trop de temps, réessaie plus tard.")
          break
        case "unavailable":
          setUpdateNotice("Disponible uniquement dans l’application Windows installée.")
          break
        case "error":
        default:
          setUpdateNotice(result.message ? `La vérification a échoué : ${result.message}` : "La vérification a échoué.")
          break
      }
    } catch {
      setUpdateNotice("La vérification a échoué.")
    } finally {
      setCheckingUpdate(false)
      window.setTimeout(() => setUpdateNotice(""), 8000)
    }
  }

  return (
    <PageLabelContext.Provider value={setCurrentPageLabel}>
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
                  <img src="/favicon.png" alt="" className="size-full object-contain transition-transform hover:scale-105" />
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
                    <div key={campaign.id} onClick={() => selectCampaign(campaign.id)} className="flex cursor-pointer items-center gap-2 rounded-md border-l-2 px-2 py-2 transition-colors hover:bg-accent" style={{ borderColor: selectedCampaignId === campaign.id ? campaign.accentColor : "transparent", backgroundColor: selectedCampaignId === campaign.id ? `${campaign.accentColor}12` : undefined }}>
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
                ) : viewRole === "mj" ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    <Map className="mx-auto mb-2 size-7 opacity-60" />
                    Aucune campagne n’est encore reliée à ce compte.
                  </div>
                ) : visibleCharacters.length ? (
                  visibleCharacters.map((character) => (
                    <div key={character.id} onClick={() => selectCharacter(character.id)} className="flex cursor-pointer items-center gap-2 rounded-md border-l-2 px-2 py-2 transition-colors hover:bg-accent" style={{ borderColor: selectedCharacterId === character.id ? character.campaigns[0]?.accentColor || "var(--primary)" : "transparent", backgroundColor: selectedCharacterId === character.id ? `${character.campaigns[0]?.accentColor || "#927640"}12` : undefined }}>
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
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Accueil" isActive={pathname === "/"} className="h-10">
                    <IntentLink href="/">
                      <Home />
                      <span>Accueil</span>
                    </IntentLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {viewRole === "mj" && selectedCampaign && (
                  <NavSection label={`Dossier - ${selectedCampaign.name}`} icon={Map} active={pathname.startsWith("/campagne/")}>
                    {(() => {
                      const campaignHref = `/campagne/${encodeURIComponent(selectedCampaign.id)}`
                      return <>
                        <NavSubLink href={campaignHref} label={`Campagne - ${selectedCampaign.name}`} active={pathname === campaignHref} />
                        <NavSubLink href={`${campaignHref}/roll20`} label="Roll20" active={pathname === `${campaignHref}/roll20`} />
                        <NavSubLink href={`${campaignHref}/lieux-et-rencontres`} label="Créateur de session" active={pathname === `${campaignHref}/lieux-et-rencontres`} />
                        <NavSubLink nested href={`${campaignHref}/evenements`} label="Événements" active={pathname === `${campaignHref}/evenements`} />
                        <NavSubLink nested href={`${campaignHref}/magasin-et-fouille`} label="Magasins et fouilles" active={pathname.startsWith(`${campaignHref}/magasin-et-fouille`)} />
                        <NavSubLink nested href={`${campaignHref}/pnjs`} label="PNJs" active={pathname === `${campaignHref}/pnjs`} />
                      </>
                    })()}
                  </NavSection>
                )}

                {viewRole === "joueur" && selectedCharacter && (() => {
                  const characterHref = `/personnage/${encodeURIComponent(selectedCharacter.id)}`
                  return (
                    <SidebarMenuItem>
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
                            return <div key={campaign.id}><NavSubLink href={href} label={`Campagne - ${campaign.name}`} active={pathname === href} /></div>
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  )
                })()}

                <NavSection label="Règles" icon={ScrollText} active={pathname.startsWith("/regles")}>
                  <NavSubLink
                    href="/regles/classes"
                    label="Classe"
                    active={pathname.startsWith("/regles/classes")}
                  />
                  <NavSubLink href="/regles/vocabulaire" label="Vocabulaire" active={pathname === "/regles/vocabulaire"} />
                  <NavSubLink href="/regles/combat" label="Combat" active={pathname === "/regles/combat"} />
                  <NavSubLink href="/regles/hors-combat" label="Hors combat" active={pathname === "/regles/hors-combat"} />
                </NavSection>

                {(user.role === "admin" || user.role === "mj") && (viewRole === "admin" || viewRole === "mj") && (
                  <>
                    <NavSection label="Ressources" icon={LibraryBig} active={pathname.startsWith("/ressources")}>
                      <NavSubLink href="/ressources/index-des-classes" label="Index des classes" active={pathname === "/ressources/index-des-classes"} />
                      <NavSubLink href="/ressources/index-des-objets" label="Index des objets" active={pathname === "/ressources/index-des-objets"} />
                      <NavSubLink href="/ressources/index-des-creatures" label="Index des créatures" active={pathname === "/ressources/index-des-creatures"} />
                      <NavSubLink href="/ressources/index-des-langues" label="Index des langues" active={pathname === "/ressources/index-des-langues"} />
                      <NavSubLink href="/ressources/index-des-lieux" label="Index des lieux" active={pathname === "/ressources/index-des-lieux"} />
                      <NavSubLink href="/ressources/index-des-peuples" label="Index des peuples" active={pathname === "/ressources/index-des-peuples"} />
                      <NavSubLink href="/ressources/index-des-religions" label="Index des religions" active={pathname === "/ressources/index-des-religions"} />
                      <NavSubLink href="/ressources/index-des-campagnes" label="Index des campagnes" active={pathname === "/ressources/index-des-campagnes"} />
                      <NavSubLink href="/ressources/index-des-personnages" label="Index des personnages" active={pathname === "/ressources/index-des-personnages"} />
                      <NavSubLink href="/ressources/index-des-pnjs" label="Index des PNJ" active={pathname === "/ressources/index-des-pnjs"} />
                    </NavSection>
                    <NavSection label="Bac à sable" icon={FlaskConical} active={pathname.startsWith("/bac-a-sable/")}>
                      <NavSubLink href="/bac-a-sable/tabletop" label="Tabletop" active={pathname === "/bac-a-sable/tabletop"} />
                      <NavSubLink href="/bac-a-sable/magasin" label="Magasin" active={pathname === "/bac-a-sable/magasin"} />
                      <NavSubLink href="/bac-a-sable/pnjs" label="PNJs" active={pathname === "/bac-a-sable/pnjs"} />
                    </NavSection>
                  </>
                )}

                {user.role === "admin" && viewRole === "admin" && (
                  <NavSection
                    label="Administration"
                    icon={ShieldCheck}
                    active={pathname.startsWith("/administration")}
                  >
                    <NavSubLink
                      href="/administration/comptes-et-roles"
                      label="Comptes et rôles"
                      active={pathname === "/administration/comptes-et-roles"}
                    />
                    <NavSubLink
                      href="/administration/google-drive"
                      label="Google Drive et Sheets"
                      active={pathname === "/administration/google-drive"}
                    />
                  </NavSection>
                )}
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
                <SidebarMenuButton tooltip="Actualiser" className="h-10" onClick={() => window.location.reload()}>
                  <RefreshCw /><span>Actualiser</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Chercher les mises à jour" className="h-10" onClick={() => void checkForUpdates()} disabled={checkingUpdate}>
                  <DownloadCloud className={checkingUpdate ? "animate-pulse" : undefined} /><span>{checkingUpdate ? "Recherche…" : "Chercher les mises à jour"}</span>
                </SidebarMenuButton>
                {updateNotice && <p className="px-2 pb-1 pt-0.5 text-[11px] leading-4 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">{updateNotice}</p>}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Mon compte">
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-semibold uppercase text-[#d7b77f]">
                  {(user.displayName || user.email).slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{user.displayName || user.email}</span>
                  <span className="block truncate text-xs text-sidebar-foreground/55">
                    {roleLabels[user.role]}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-2"
          >
            <LogOut className="size-4" />
            <span className="group-data-[collapsible=icon]:hidden">Se déconnecter</span>
          </Button>
        </SidebarFooter>
      </Sidebar>

      {/* La hauteur est fixée et seul le bloc de contenu défile : l’en-tête reste visible
          quelle que soit la page affichée, sans dépendre d’un `position: sticky` que le
          contenu d’une page pourrait neutraliser. */}
      <SidebarInset className="h-svh min-h-svh min-w-0 w-0 flex-1 overflow-hidden">
        <header className="z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 shadow-sm backdrop-blur md:px-7">
          <SidebarTrigger aria-label="Afficher ou masquer la navigation" />
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="size-4 shrink-0" />
            <span>Eraser</span>
            <span aria-hidden="true">/</span>
            <span className="truncate text-foreground">{currentPageLabel}</span>
          </div>
          <Badge variant="outline" className="ml-auto shrink-0 border-primary/20 bg-primary/5">
            {roleViewLabels[viewRole]}
          </Badge>
        </header>
        <div className="paper-grain flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip overscroll-contain">
          <ShellDataContext.Provider value={{ characters: visibleCharacters, campaigns: visibleCampaigns, viewRole }}>
            <div data-view-role={viewRole} className="contents">
              {children}
            </div>
          </ShellDataContext.Provider>
        </div>
      </SidebarInset>
    </SidebarProvider>
    <GlobalTableChat user={{ uid: user.uid, role: user.role }} />
    </AppTabsProvider>
    </PageLabelContext.Provider>
  )
}
