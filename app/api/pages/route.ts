import { NextResponse } from "next/server"

import {
  blockVisibleTo,
  canEditNotes,
  canEditPage,
  canManagePages,
  canRevealSecrets,
  findBlock,
  PAGE_LIMITS,
  pageForViewer,
  pageSummary,
  reIdContent,
  studioPage,
  type CustomPage,
  type PagePlace,
  type PageViewer,
} from "@/lib/custom-pages"
import {
  adoptEraserPage,
  createCustomPage,
  deleteCustomPage,
  deletePageSnapshot,
  deletePageTemplate,
  findCustomPage,
  listCustomPages,
  listPageSnapshots,
  listPageTemplates,
  PageStoreError,
  pagesLinkingTo,
  publishCustomPage,
  readCustomPage,
  readPageTemplate,
  restoreCustomPage,
  revertCustomPage,
  saveCustomPage,
  savePageSnapshot,
  savePageTemplate,
  trashCustomPage,
  unpublishCustomPage,
  updateLiveBlock,
} from "@/lib/custom-pages-store"
import { campaignsOf, pageAuthor, viewerFor } from "@/lib/custom-pages-server"
import { blueprintSlug, blueprintVisibility, eraserPageBlueprint, eraserPageEntries } from "@/lib/eraser-page-blueprints"
import { isReplaceablePath } from "@/lib/page-replacements"
import { authorizedAccount, type AuthorizedUser } from "@/lib/server-auth"
import { sanitizeRichText } from "@/lib/rich-text-sanitize"


const denied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })
const missing = () => NextResponse.json({ error: "Cette page n’existe pas, ou elle ne t’est pas ouverte." }, { status: 404 })

function failure(error: unknown, fallback: string) {
  if (error instanceof PageStoreError) return NextResponse.json({ error: error.userMessage, code: error.code }, { status: error.status })
  console.error("CUSTOM_PAGES_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  return NextResponse.json({ error: fallback }, { status: 502 })
}

const places: PagePlace[] = ["regles", "ressources", "bac-a-sable", "administration", "campagne", "hors-menu"]

/** Ce que l'Index des pages montre : pages lisibles par le compte (admin : toutes), corbeille comprise. */
async function directory(account: AuthorizedUser) {
  const [pages, templates, campaigns] = await Promise.all([listCustomPages({ fresh: true }), listPageTemplates().catch(() => []), campaignsOf(account)])
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const base: PageViewer = { role: account.role, uid: account.uid, name: pageAuthor(account).name }
  const summaries = pages.flatMap((page) => {
    const campaign = page.place === "campagne" ? byId.get(page.campaignId) : undefined
    const viewer: PageViewer = { ...base, member: account.role === "admin" || Boolean(campaign), manager: account.role === "admin" || Boolean(campaign?.mine) }
    // Un MJ voit les pages qu'il peut modifier, et celles qui lui sont ouvertes.
    if (account.role !== "admin" && !canEditPage(page, viewer) && (page.vis === "admin" || page.place === "administration" || (page.place === "campagne" && !campaign))) return []
    return [pageSummary(page, viewer)]
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return {
    pages: summaries,
    // Les pages d'Eraser, et celle du créateur qui remplace ou complète chacune (même en brouillon).
    eraser: eraserPageEntries(pages, account.role),
    templates: templates.map((template) => ({ id: template.id, name: template.name, createdAt: template.createdAt, createdBy: template.createdBy.name, title: template.content.title, icon: template.content.icon, emoji: template.content.emoji, blocks: template.content.sections.reduce((total, section) => total + section.cols.flat().length, 0) })),
    campaigns: campaigns.filter((campaign) => account.role === "admin" || campaign.mine).map((campaign) => ({ id: campaign.id, name: campaign.name })),
    allCampaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })),
  }
}

/**
 * GET ?list=1 : l'Index des pages (admins et MJ). ?id= : une page pour l'atelier (qui peut
 * la modifier). ?place=&slug=(&campaign=) : une page telle que le compte la lit.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return denied()
  const parameters = new URL(request.url).searchParams
  try {
    if (parameters.get("list")) {
      if (!canManagePages(account.role)) return denied()
      return NextResponse.json(await directory(account))
    }
    // Les versions brouillon d'une page (atelier) : lues en GET, pour ne pas compter comme une écriture.
    const draftsOf = parameters.get("drafts")
    if (draftsOf) {
      if (!canManagePages(account.role)) return denied()
      const page = await readCustomPage(draftsOf, { fresh: true })
      if (!page) return missing()
      if (!canEditPage(page, await viewerFor(account, page))) return denied()
      return NextResponse.json({ drafts: await listPageSnapshots(page.id) })
    }
    const id = parameters.get("id")
    if (id) {
      if (!canManagePages(account.role)) return denied()
      const page = await readCustomPage(id, { fresh: true })
      if (!page) return missing()
      const viewer = await viewerFor(account, page)
      if (!canEditPage(page, viewer)) return denied()
      return NextResponse.json({ page: studioPage(page), linking: await pagesLinkingTo(page.id) })
    }
    const place = parameters.get("place") as PagePlace
    const slug = parameters.get("slug") ?? ""
    if (!places.includes(place) || !slug) return NextResponse.json({ error: "Adresse de page incomplète." }, { status: 400 })
    const page = await findCustomPage(place, slug, parameters.get("campaign") ?? "")
    if (!page) return missing()
    const view = pageForViewer(page, await viewerFor(account, page))
    return view ? NextResponse.json({ page: view }) : missing()
  } catch (error) {
    return failure(error, "Les pages n’ont pas pu être lues sur le serveur partagé d’Eraser.")
  }
}

type Body = { action?: string; id?: string; page?: unknown; base?: string; blockId?: string; html?: unknown; name?: unknown; templateId?: string; draftId?: string }

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return denied()
  let body: Body
  try { body = (await request.json()) as Body } catch { return NextResponse.json({ error: "Requête illisible." }, { status: 400 }) }
  const by = pageAuthor(account)
  const action = body.action ?? ""
  try {
    // Ce que peuvent faire tous les rôles : écrire dans un carnet qui le permet.
    if (action === "edit-notes") {
      const page = await readCustomPage(String(body.id ?? ""), { fresh: true })
      if (!page) return missing()
      const viewer = await viewerFor(account, page)
      const view = pageForViewer(page, viewer)
      const block = view?.sections.flatMap((section) => section.cols.flat()).find((item) => item.id === body.blockId)
      if (!view || !block || block.type !== "notes") return missing()
      if (!canEditNotes(block, account.role)) return NextResponse.json({ error: "Ton rôle ne peut pas écrire dans ce carnet." }, { status: 403 })
      const html = sanitizeRichText(typeof body.html === "string" ? body.html : "").slice(0, PAGE_LIMITS.html)
      const saved = await updateLiveBlock(page.id, block.id, (_, state) => {
        if ((state.editedAt ?? "") !== (body.base ?? "")) throw new PageStoreError("CUSTOM_PAGE_NOTES_CHANGED", `Ce carnet vient d’être modifié${state.editedBy ? ` par ${state.editedBy}` : ""}. Recharge la page pour voir son texte, puis recommence.`, 409)
        return { ...state, html, editedAt: new Date().toISOString(), editedBy: by.name }
      })
      return NextResponse.json({ page: pageForViewer(saved, viewer) })
    }

    if (!canManagePages(account.role)) return denied()

    if (action === "create") {
      // Depuis un modèle : son contenu, avec la place et l'adresse choisies.
      const template = body.templateId ? await readPageTemplate(body.templateId) : null
      if (body.templateId && !template) return NextResponse.json({ error: "Ce modèle n’existe plus." }, { status: 404 })
      const input = { ...(body.page && typeof body.page === "object" ? body.page : {}), ...(template ? reIdContent(template.content) : {}) } as Record<string, unknown>
      if (template && body.page && typeof body.page === "object" && typeof (body.page as Record<string, unknown>).title === "string") input.title = (body.page as Record<string, unknown>).title
      const viewer: PageViewer = { role: account.role, uid: account.uid, member: false, manager: false }
      const draft = input as { place?: string; campaignId?: string; vis?: string }
      if (draft.place === "campagne") Object.assign(viewer, await viewerFor(account, { place: "campagne", campaignId: String(draft.campaignId ?? "") }))
      if (!canEditPage({ vis: draft.vis === "admin" ? "admin" : "tous", place: (draft.place ?? "hors-menu") as PagePlace }, viewer)) return NextResponse.json({ error: "Ton rôle ne peut pas créer une page à cet endroit." }, { status: 403 })
      const created = await createCustomPage(input, by)
      return NextResponse.json({ page: studioPage(created) })
    }

    // « Modifier » une page d'Eraser : la page qui la remplace, ou une nouvelle en brouillon,
    // redessinée en blocs (lib/eraser-page-blueprints.ts). Rien ne change avant la publication.
    if (action === "adopt") {
      const path = typeof (body as { path?: unknown }).path === "string" ? (body as { path: string }).path.trim() : ""
      if (!isReplaceablePath(path)) return NextResponse.json({ error: "Cette page d’Eraser ne peut pas être modifiée ici." }, { status: 400 })
      const vis = blueprintVisibility(path)
      if (vis === "admin" && account.role !== "admin") return denied()
      const { page, created } = await adoptEraserPage(path, eraserPageBlueprint(path), blueprintSlug(path), vis, by)
      return NextResponse.json({ page: studioPage(page), created })
    }

    if (action === "save-template" || action === "delete-template") {
      if (action === "delete-template") {
        await deletePageTemplate(String(body.templateId ?? ""))
        return NextResponse.json({ ok: true })
      }
      const page = await readCustomPage(String(body.id ?? ""), { fresh: true })
      if (!page) return missing()
      if (!canEditPage(page, await viewerFor(account, page))) return denied()
      const template = await savePageTemplate(page, body.name, by)
      return NextResponse.json({ template: { id: template.id, name: template.name } })
    }

    const page = await readCustomPage(String(body.id ?? ""), { fresh: true })
    if (!page) return missing()
    const viewer = await viewerFor(account, page)

    if (action === "reveal" || action === "hide") {
      if (!canRevealSecrets(account.role) || !pageForViewer(page, viewer)) return denied()
      const block = findBlock(page.published ?? page, String(body.blockId ?? "")) ?? findBlock(page, String(body.blockId ?? ""))
      if (!block || block.type !== "secret" || !blockVisibleTo(block.vis, account.role)) return missing()
      const saved = await updateLiveBlock(page.id, block.id, (_, state) => {
        const { revealedAt: _at, revealedBy: _by, ...rest } = state
        void _at; void _by
        return action === "reveal" ? { ...rest, revealedAt: new Date().toISOString(), revealedBy: by.name } : rest
      })
      return NextResponse.json({ page: pageForViewer(saved, viewer), live: saved.live })
    }

    if (!canEditPage(page, viewer)) return NextResponse.json({ error: "Ton rôle ne peut pas modifier cette page." }, { status: 403 })
    // Les versions brouillon : la page elle-même ne change pas.
    if (action === "save-draft") return NextResponse.json({ drafts: await savePageSnapshot(page, body.name, by) })
    if (action === "delete-draft") return NextResponse.json({ drafts: await deletePageSnapshot(page.id, String(body.draftId ?? "")) })
    const base = typeof body.base === "string" ? body.base : ""
    let saved: CustomPage
    switch (action) {
      case "save": {
        // Changer la place : il faut aussi pouvoir créer une page au nouvel endroit.
        const next = (body.page && typeof body.page === "object" ? body.page : {}) as { place?: string; campaignId?: string; vis?: string }
        if (next.place && (next.place !== page.place || next.campaignId !== page.campaignId || next.vis !== page.vis)) {
          const target = await viewerFor(account, { place: (next.place as PagePlace) ?? "hors-menu", campaignId: String(next.campaignId ?? "") })
          if (!canEditPage({ vis: next.vis === "admin" ? "admin" : "tous", place: next.place as PagePlace }, target)) return NextResponse.json({ error: "Ton rôle ne peut pas ranger la page à cet endroit." }, { status: 403 })
        }
        saved = await saveCustomPage(page.id, body.page, base, by)
        break
      }
      case "publish": saved = await publishCustomPage(page.id, base, by); break
      case "unpublish": saved = await unpublishCustomPage(page.id, base, by); break
      case "revert": saved = await revertCustomPage(page.id, base, by); break
      case "trash": saved = await trashCustomPage(page.id, by); break
      case "restore": saved = await restoreCustomPage(page.id, by); break
      case "duplicate": {
        const copy = await createCustomPage({ ...page, title: `${page.title} (copie)`.slice(0, PAGE_LIMITS.title), slug: `${page.slug}-copie` }, by)
        return NextResponse.json({ page: studioPage(copy) })
      }
      case "delete":
        if (account.role !== "admin") return NextResponse.json({ error: "Seul un administrateur supprime une page pour de bon." }, { status: 403 })
        await deleteCustomPage(page.id)
        return NextResponse.json({ ok: true })
      default:
        return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
    }
    return NextResponse.json({ page: studioPage(saved) })
  } catch (error) {
    return failure(error, "La page n’a pas pu être enregistrée sur le serveur partagé d’Eraser.")
  }
}
