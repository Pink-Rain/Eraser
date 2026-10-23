import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { DocumentStudio } from "@/components/eraser/document-studio"
import { listCampaignDocuments } from "@/lib/campaign-documents"
import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { getCampaignDashboard, listCampaignMembers } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

const failed = (code: string) => (error: unknown) => {
  console.error(code, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  return null
}

async function DocumentStudioData({ campaignId, documentId, sessionId, startNew }: { campaignId: string; documentId: string; sessionId: string; startNew: boolean }) {
  // Les documents d'abord ; une session ou un joueur illisible laisse son menu vide, pas la page.
  const [documents, sessions, members] = await Promise.all([
    listCampaignDocuments(campaignId),
    listCampaignSessionsForDisplay(campaignId).catch(failed("DOCUMENT_PAGE_SESSIONS_FAILED")),
    listCampaignMembers(campaignId).catch(failed("DOCUMENT_PAGE_MEMBERS_FAILED")),
  ])
  return <DocumentStudio
    campaignId={campaignId}
    initialDocuments={documents}
    sessions={(sessions ?? []).map((session) => ({ id: session.id, name: session.name }))}
    players={(members ?? []).map((member) => ({ id: member.id, name: member.name }))}
    initialDocumentId={documentId}
    initialSessionId={sessionId}
    startNew={startNew}
  />
}

/**
 * « Document » (menu › Créateur de session) : les documents de la campagne et leur éditeur.
 * `?document=ID` ouvre un document, `?nouveau=1` en commence un (`&session=ID` : rangé dans
 * cette session).
 */
export default async function CampaignDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ document?: string; session?: string; nouveau?: string }> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/connexion")

  const [{ id }, query] = await Promise.all([params, searchParams])
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, id).catch(() => null)
  if (!campaign) notFound()

  return (
    <AuthenticatedShell pageLabel={`${campaign.name} / Document`}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">{campaign.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Document</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Lettres, parchemins, pages de grimoire : écris-les sur un fond, donne-les aux joueurs pendant la session (ils les lisent depuis leur inventaire) et envoie-les dans Roll20 avec le compagnon (handout et PDF).</p>
        <Suspense key={id} fallback={<DeferredContentLoading label="Chargement des documents…" />}>
          <DocumentStudioData campaignId={campaign.id} documentId={query.document || ""} sessionId={query.session || ""} startNew={query.nouveau === "1"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
