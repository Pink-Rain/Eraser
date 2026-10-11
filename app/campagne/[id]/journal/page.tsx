import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CampaignJournal, type JournalSessionDetail, type JournalVisual } from "@/components/eraser/campaign-journal"
import { OBJECT_REFERENCE_INDEX, referenceKey, type ReferenceRequest } from "@/lib/index-references"
import { resolveReferences } from "@/lib/index-references-server"
import type { SessionNote } from "@/lib/session-note-rules"
import { listCampaignEvents } from "@/lib/campaign-events"
import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { listCampaignMembers, listCharactersForUser, listNpcs, listSavedShops } from "@/lib/google-sheets"
import { campaignReader } from "@/lib/session-access"
import { listSessionNotes } from "@/lib/session-notes"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

const safeImage = (url: string) => /^(https:\/\/|\/api\/)/.test(url) ? url : ""

/** L'index où chercher un lieu, une créature ou un objet cité par une note (« place:Nom »). */
const visualIndexes = { place: "places", creature: "creatures", item: OBJECT_REFERENCE_INDEX } as const

/**
 * Les images et icônes des lieux, créatures et objets que citent les notes, retrouvés par
 * leur nom dans leurs index (déjà en cache). Seuls l'image, le type, la couleur et l'icône
 * sortent : rien de privé. Une lecture qui échoue laisse les pastilles d'avant.
 */
async function noteVisuals(notes: SessionNote[] | null): Promise<Record<string, JournalVisual>> {
  const links = [...new Set((notes ?? []).flatMap((note) => [...note.links, ...(note.type === "butin" && note.title ? [`item:${note.title}`] : [])]))]
  const requests: Array<{ link: string; request: ReferenceRequest }> = links.flatMap((link) => {
    const kind = link.slice(0, link.indexOf(":")) as keyof typeof visualIndexes
    const name = link.slice(link.indexOf(":") + 1).trim()
    return visualIndexes[kind] && name ? [{ link, request: { index: visualIndexes[kind], id: `nom:${name}`, name } }] : []
  }).slice(0, 300)
  if (!requests.length) return {}
  try {
    const results = await resolveReferences(requests.map((entry) => entry.request), { byName: true, player: true })
    const visuals: Record<string, JournalVisual> = {}
    for (const { link, request } of requests) {
      const found = results[referenceKey(request)]
      if (!found) continue
      const image = safeImage(found.image ?? "")
      visuals[link] = { ...(image ? { image } : {}), ...(found.type ? { type: found.type } : {}), ...(found.color ? { color: found.color } : {}), ...(found.object ? { object: found.object } : {}) }
    }
    return visuals
  } catch (error) {
    console.error("JOURNAL_VISUALS_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return {}
  }
}

/**
 * Le journal d'une campagne : une page par session (bilan, groupe, lieux, PNJs, créatures,
 * objets, magasins, quêtes, événements) et ses notes publiques. Joueurs et MJ.
 */
export default async function CampaignJournalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const [{ id }, query] = await Promise.all([params, searchParams])
  const reader = await campaignReader(id)
  if (!reader) notFound()
  const sessions = await listCampaignSessionsForDisplay(id).catch((error) => {
    console.error("JOURNAL_SESSIONS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })
  const viewer = { uid: account.uid, manager: reader.manager }
  // Chaque lecture peut manquer (feuille pas encore créée, Google indisponible) : le reste s'affiche.
  const [notes, members, mine, npcs, shops, events] = await Promise.all([
    // Le journal ne montre que les notes de session (publiques) ; les notes privées restent dans la fiche.
    listSessionNotes(id, viewer).then((notes) => notes.filter((note) => !note.private)).catch(() => null),
    listCampaignMembers(id).catch(() => []),
    listCharactersForUser(account.uid).catch(() => []),
    listNpcs(id).catch(() => []),
    listSavedShops(id).catch(() => []),
    listCampaignEvents(id).catch(() => []),
  ])
  const visuals = await noteVisuals(notes)
  const list = sessions ?? []
  // Un joueur ne voit que ce qui est entré dans une session ; la préparation du MJ reste à lui.
  const inSessions = { npcs: new Set(list.flatMap((session) => session.npcIds)), shops: new Set(list.flatMap((session) => [...session.shopIds, ...session.eventIds.filter((entry) => entry.startsWith("shop:")).map((entry) => entry.slice(5))])), events: new Set(list.flatMap((session) => session.eventIds)) }
  const shown = <T extends { id: string }>(items: T[], set: Set<string>) => reader.manager ? items : items.filter((item) => set.has(item.id))
  const detail: JournalSessionDetail[] = list.map((session) => ({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    bannerUrl: safeImage(session.bannerUrl),
    characterIds: session.characterIds,
    npcIds: session.npcIds,
    shopIds: [...session.shopIds, ...session.eventIds.filter((entry) => entry.startsWith("shop:")).map((entry) => entry.slice(5))],
    eventIds: session.eventIds.filter((entry) => !entry.startsWith("shop:")),
    // Les lieux notés par le MJ en préparant la session : à lui seul.
    places: reader.manager ? session.places : "",
  }))
  return (
    <AuthenticatedShell pageLabel={`Journal de ${reader.campaign.name}`}>
      {sessions === null
        ? <p className="m-8 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">Les sessions n’ont pas pu être lues dans Google Sheets. Actualise dans un instant.</p>
        : <CampaignJournal
            key={id}
            campaignId={id}
            campaignName={reader.campaign.name}
            accentColor={reader.campaign.accentColor || "#927640"}
            sessions={detail}
            initialSessionId={query.session}
            initialNotes={notes ?? []}
            notesError={notes === null}
            viewer={{ uid: account.uid, manager: reader.manager, characterIds: mine.filter((character) => members.some((member) => member.id === character.id)).map((character) => character.id) }}
            members={members.map((member) => ({ id: member.id, name: member.name, hint: member.subtitle, image: `/api/characters/portrait/${encodeURIComponent(member.id)}` }))}
            npcs={shown(npcs, inSessions.npcs).map((npc) => ({ id: npc.id, name: npc.name, image: safeImage(npc.portrait), hint: [npc.title, npc.occupation].filter(Boolean).join(" · ") }))}
            shops={shown(shops, inSessions.shops).map((shop) => ({ id: shop.id, name: shop.name, hint: shop.cityName, items: shop.items.slice(0, 6).map((item) => ({ name: item.name, icon: item.icon, type: item.type, subtype: item.subtype })) }))}
            visuals={visuals}
            events={shown(events, inSessions.events).map((event) => ({ id: event.id, name: event.name, image: safeImage(event.image), kind: event.kind, tag: event.tag, tagColor: event.tagColor, description: reader.manager ? event.description : "" }))}
          />}
    </AuthenticatedShell>
  )
}
