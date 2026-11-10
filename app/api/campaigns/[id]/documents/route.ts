import { NextResponse } from "next/server"

import { listCampaignDocuments, listDocumentTemplates, saveCampaignDocument } from "@/lib/campaign-documents"
import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { listCampaignMembers } from "@/lib/google-sheets"
import { sessionManager } from "@/lib/session-access"

const failed = (code: string) => (error: unknown) => {
  console.error(code, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  return null
}

/**
 * Ce que ce serveur sait garder d'un document, lu par l'éditeur (Eraser Doc) : sans l'une de ces
 * capacités, il n'en propose pas les outils (un Eraser plus ancien effacerait leur travail).
 */
const DOCUMENT_FEATURES = ["dossiers", "modeles", "calques", "formes"]

/**
 * Les documents de la campagne (éditeur de l'extension Eraser Doc, Créateur de session) : MJ et
 * administrateurs. `?atelier=1` : ce qu'il faut à l'éditeur en plus (la campagne, ses sessions, ses
 * joueurs, les modèles du compte et les capacités du serveur) ; une session, un joueur ou un modèle
 * illisible laisse son menu vide, pas l'éditeur.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if (new URL(request.url).searchParams.get("atelier") !== "1") return NextResponse.json({ documents: await listCampaignDocuments(id) })
    const [documents, sessions, members, templates] = await Promise.all([
      listCampaignDocuments(id),
      listCampaignSessionsForDisplay(id).catch(failed("DOCUMENT_STUDIO_SESSIONS_FAILED")),
      listCampaignMembers(id).catch(failed("DOCUMENT_STUDIO_MEMBERS_FAILED")),
      listDocumentTemplates(manager.account.uid).catch(failed("DOCUMENT_STUDIO_TEMPLATES_FAILED")),
    ])
    return NextResponse.json({
      campaign: { id: manager.campaign.id, name: manager.campaign.name },
      documents,
      sessions: (sessions ?? []).map((session) => ({ id: session.id, name: session.name })),
      players: (members ?? []).map((member) => ({ id: member.id, name: member.name })),
      templates: templates ?? [],
      features: DOCUMENT_FEATURES,
    })
  } catch {
    return NextResponse.json({ error: "Les documents n’ont pas pu être lus." }, { status: 400 })
  }
}

const fileOf = (form: FormData, name: string) => {
  const value = form.get(name)
  return value instanceof File && value.size > 0 ? value : null
}

/**
 * Enregistre un document : le champ « document » (JSON : id, titre, session, fond, contenu,
 * dossier, modèle), le rendu (« render », WebP), l'impression (« print », JPEG sur fond blanc, pour
 * le PDF), s'il vient de l'ordinateur le fond (« background »), et les images posées ou calques de
 * dessin (« piece-<nom> »). Tout est facultatif sauf le document : l'éditeur envoie un gros
 * document en plusieurs fois (le serveur refuse un envoi de fichiers de plus de 1 Mo).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const manager = await sessionManager(id)
  if (!manager) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const form = await request.formData()
    const input = JSON.parse(String(form.get("document") || "{}")) as Record<string, unknown>
    const pieces = new Map<string, File>()
    for (const name of new Set(form.keys())) {
      const asset = /^piece-([\w-]{1,80})$/.exec(name)?.[1]
      const file = asset ? fileOf(form, name) : null
      if (asset && file) pieces.set(asset, file)
    }
    const document = await saveCampaignDocument(id, input, { render: fileOf(form, "render"), print: fileOf(form, "print"), background: fileOf(form, "background"), pieces }, manager.account.uid)
    return NextResponse.json({ document })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "DOCUMENT_TOO_LONG" ? "Le document est trop long pour être enregistré : raccourcis un texte ou retire une zone."
      : code === "INVALID_DOCUMENT_FILE" ? "Une image du document est trop lourde (15 Mo au plus) ou d’un format inconnu."
        : code === "DOCUMENT_BACKGROUND_MISSING" ? "Choisis d’abord l’image de fond à envoyer depuis ton ordinateur."
          : code === "DOCUMENT_NOT_FOUND" ? "Ce document n’appartient pas à cette campagne."
            : "Le document n’a pas pu être enregistré (Google est peut-être saturé). Réessaie dans un instant."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
