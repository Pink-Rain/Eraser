import { notFound, redirect } from "next/navigation"
import { BookOpen, CalendarDays, ChartColumn, ChevronDown, Drama, LayoutDashboard, Map, PackageSearch, Store, Waypoints } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CampaignGroupTable, GroupNpcsPanel, MetNpcsPanel, type FolderCharacter, type FolderMember, type FolderNpc, type MetNpc, type NpcRelation } from "@/components/eraser/campaign-folder"
import { MenuLinkPanel } from "@/components/eraser/menu-page"
import { Roll20BridgePanel } from "@/components/eraser/roll20-bridge-panel"
import { readAchievements } from "@/lib/achievements"
import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { historyCounts, readCharacterHistories } from "@/lib/character-history"
import { playerNamesFor } from "@/lib/chat-accounts"
import { getCampaignDashboard, listCampaignMembers, listCharacterGroupStats, listNpcs, listRelationsOfCharacters, type CampaignRecord } from "@/lib/google-sheets"
import { identityUidsForUser } from "@/lib/identity-links"
import { getRoll20LinkForManager } from "@/lib/roll20-bridge"
import { authorizedAccount, type AuthorizedUser } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Les raretés comptées « rares ou mieux » (l'ordre de l'Index des items). */
const RARE_OR_BETTER = ["Rare", "Très rare", "Ultime", "Épique", "Légendaire"]

const failed = (code: string) => (error: unknown) => {
  console.error(code, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  return null
}

/**
 * Tout ce que montre le dossier, chaque partie lue à part : une lecture refusée (Google
 * saturé) laisse sa partie vide, jamais la page entière. Rien n'est écrit.
 */
async function folderData(campaign: CampaignRecord, account: AuthorizedUser) {
  const [listed, npcs, sessions] = await Promise.all([
    listCampaignMembers(campaign.id).catch(failed("CAMPAIGN_FOLDER_MEMBERS_FAILED")),
    listNpcs(campaign.id).catch(failed("CAMPAIGN_FOLDER_NPCS_FAILED")),
    listCampaignSessionsForDisplay(campaign.id).catch(failed("CAMPAIGN_FOLDER_SESSIONS_FAILED")),
  ])
  const members = listed ?? []
  const ids = members.map((member) => member.id)
  const [stats, histories, achievements, relations, players] = await Promise.all([
    listCharacterGroupStats(ids).catch(failed("CAMPAIGN_FOLDER_STATS_FAILED")),
    readCharacterHistories(ids).catch(failed("CAMPAIGN_FOLDER_HISTORY_FAILED")),
    readAchievements().catch(failed("CAMPAIGN_FOLDER_ACHIEVEMENTS_FAILED")),
    listRelationsOfCharacters(ids).catch(failed("CAMPAIGN_FOLDER_RELATIONS_FAILED")),
    playerNamesFor(account, members.map((member) => member.ownerUid)).catch(failed("CAMPAIGN_FOLDER_PLAYERS_FAILED")),
  ])
  // Les succès sont ceux du compte du joueur (une case « Joueur » peut en nommer plusieurs).
  const ownerUids = new globalThis.Map(await Promise.all(members.map(async (member) => {
    const uids = member.ownerUid.split(/\s*·\s*/).map((uid) => uid.trim()).filter(Boolean)
    const linked = (await Promise.all(uids.map((uid) => identityUidsForUser(uid).catch(() => [uid])))).flat()
    return [member.id, new Set([...uids, ...linked])] as const
  })))
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("fr")
  const rows: FolderMember[] = members.map((member) => {
    const stat = stats?.[member.id]
    const counts = historyCounts(histories?.[member.id] ?? null, RARE_OR_BETTER)
    const uids = ownerUids.get(member.id) ?? new Set<string>()
    const playerName = players?.get(member.ownerUid) ?? ""
    const level = Number.parseInt(member.level, 10)
    return {
      id: member.id,
      name: member.name,
      playerName,
      portrait: `/api/characters/portrait/${encodeURIComponent(member.id)}`,
      classes: member.classes,
      level: Number.isFinite(level) ? level : null,
      currentHp: stat?.currentHp ?? null,
      totalHp: stat?.totalHp ?? null,
      life: stat?.life ?? "alive",
      states: stat?.states ?? [],
      achievements: achievements ? achievements.obtained.filter((entry) => entry.uid ? uids.has(entry.uid) : Boolean(playerName) && !playerName.includes("&") && fold(entry.player) === fold(playerName)).length : null,
      falls: counts?.falls ?? null,
      returns: counts?.returns ?? null,
      items: counts?.items ?? null,
      rareItems: counts?.rareItems ?? null,
      lastItems: counts?.lastItems ?? [],
      purse: stat?.purse ?? null,
    }
  })
  const subtitle = (npc: { title: string; occupation: string }) => [npc.title, npc.occupation].filter(Boolean).join(" · ")
  // Ce que chaque personnage pense de chaque PNJ (sa relation notée, sinon aucune).
  const levelOf = new globalThis.Map<string, number>()
  for (const relation of relations ?? []) if (relation.targetKind === "npc") levelOf.set(`${relation.characterId}\u0000${relation.targetId}`, relation.level)
  const relationsOf = (npcId: string): NpcRelation[] => members.map((member) => ({ characterId: member.id, level: levelOf.get(`${member.id}\u0000${npcId}`) ?? null }))
  // Amis, neutres ou hostiles : la moyenne des relations notées.
  const attitudeOf = (list: NpcRelation[]) => {
    const levels = list.flatMap((relation) => relation.level === null ? [] : [relation.level])
    const mean = levels.length ? levels.reduce((total, value) => total + value, 0) / levels.length : 0
    return mean > 0 ? "ami" as const : mean < 0 ? "hostile" as const : "neutre" as const
  }
  const withRelations = <T extends { id: string }>(npc: T) => { const list = relationsOf(npc.id); return { ...npc, relations: list, attitude: attitudeOf(list) } }
  const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name, "fr")
  const groupNpcs: FolderNpc[] = (npcs ?? []).filter((npc) => npc.inPlayerGroup).map((npc) => withRelations({ id: npc.id, name: npc.name, portrait: npc.portrait, subtitle: subtitle(npc), currentHp: npc.currentHp, totalHp: npc.totalHp })).sort(byName)
  // Les PNJ croisés : ceux d'une session, du créateur de session, ou notés dans les relations du groupe.
  const inSessions = new Set((sessions ?? []).flatMap((session) => session.npcIds))
  const noted = new Set((relations ?? []).flatMap((relation) => relation.targetKind === "npc" ? [relation.targetId] : []))
  const metNpcs: MetNpc[] = (npcs ?? []).filter((npc) => !npc.inPlayerGroup && (inSessions.has(npc.id) || npc.inCampaign || noted.has(npc.id)))
    .map((npc) => withRelations({ id: npc.id, name: npc.name, portrait: npc.portrait, subtitle: subtitle(npc) })).sort(byName)
  const characters: FolderCharacter[] = rows.map((row) => ({ id: row.id, name: row.name, portrait: row.portrait }))
  return { rows, groupNpcs, metNpcs, characters, membersFailed: !listed }
}

/**
 * Le dossier d'une campagne (vue MJ) : sa bannière, le groupe personnage par personnage, puis
 * les PNJ du groupe et ceux rencontrés, les pages de la campagne et le compagnon Roll20.
 */
export default async function CampaignFolderPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()
  const [link, data] = await Promise.all([getRoll20LinkForManager(account, id).catch(() => null), folderData(campaign, account)])
  const href = `/campagne/${encodeURIComponent(campaign.id)}`
  const accent = campaign.accentColor || "#3b5c8a"
  return (
    <AuthenticatedShell pageLabel={`Dossier · ${campaign.name}`} roles={["admin", "mj"]}>
      <div className="w-full flex-1 space-y-6 px-5 py-7 sm:px-8 md:py-10">
        {/* La bannière, plus basse : un dégradé transparent porte le nom de la campagne. */}
        <header className="relative isolate overflow-hidden rounded-[1.5rem] border shadow-[0_12px_35px_rgb(67_50_31/0.08)]" style={{ borderColor: `${accent}55`, background: `linear-gradient(120deg, ${accent}, ${accent}aa 55%, ${accent}55)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {campaign.bannerUrl && <img src={campaign.bannerUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
          <div className="absolute inset-y-0 left-0 -z-10 w-2/3 bg-gradient-to-r from-black/35 to-transparent" />
          <div className="flex min-h-32 flex-col justify-end gap-1 px-5 pb-4 pt-12 text-white sm:min-h-40 sm:px-7 sm:pb-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80"><Map className="size-3.5" />Dossier de campagne</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] drop-shadow-sm sm:text-4xl">{campaign.name}</h1>
            {campaign.description && <p className="line-clamp-2 max-w-3xl whitespace-pre-wrap text-sm text-white/85">{campaign.description}</p>}
          </div>
        </header>

        <section aria-labelledby="groupe" className="space-y-3">
          <h2 id="groupe" className="flex items-center gap-2 font-display text-2xl font-semibold"><ChartColumn className="size-5 text-primary" />Le groupe, personnage par personnage</h2>
          {data.membersFailed
            ? <p className="rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">Les personnages n’ont pas pu être lus pour l’instant (Google est peut-être saturé). Actualise dans un instant.</p>
            : <CampaignGroupTable members={data.rows} />}
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
          <div className="min-w-0 space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <GroupNpcsPanel npcs={data.groupNpcs} characters={data.characters} />
              <MetNpcsPanel npcs={data.metNpcs} characters={data.characters} />
            </div>
            <details id="roll20" className="group rounded-2xl border bg-card/70 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
                <span className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 font-display text-sm font-bold text-primary">R20</span>
                <span className="min-w-0 flex-1"><span className="block font-display text-2xl font-semibold">Compagnon Roll20</span><span className="block text-xs text-muted-foreground">{link ? "Relié à cette campagne." : "Pas encore relié."} Déplier pour le régler.</span></span>
                <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t px-5 pb-6"><Roll20BridgePanel key={id} campaignId={id} initialLink={link} embedded /></div>
            </details>
          </div>
          <MenuLinkPanel title="La campagne" icon={Map} links={[
            { href, label: "Tableau de bord", description: "Les personnages, le groupe, l’inventaire et le chat de la campagne.", icon: LayoutDashboard },
            { href: `${href}/journal`, label: `Journal de ${campaign.name}`, description: "Les sessions, de la première à la dernière.", icon: BookOpen },
            { href: `${href}/lieux-et-rencontres`, label: "Créateur de session", description: "Préparer les lieux et les rencontres de la prochaine session.", icon: Waypoints },
            { href: `${href}/evenements`, label: "Événements", description: "Les événements à déclencher pendant la partie.", icon: CalendarDays },
            { href: `${href}/magasin-et-fouille`, label: "Magasins", description: "Les boutiques de la campagne et leurs stocks.", icon: Store },
            { href: `${href}/fouilles`, label: "Fouilles", description: "Ce que les joueurs trouvent en fouillant.", icon: PackageSearch },
            { href: `${href}/pnjs`, label: "PNJs", description: "Les PNJ de la campagne, leurs fiches et leurs sacs.", icon: Drama },
          ]} />
        </div>
      </div>
    </AuthenticatedShell>
  )
}
