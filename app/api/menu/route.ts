import { NextResponse } from "next/server"

import { mergeMenu } from "@/lib/app-menu"
import { hasPreviousMenu, readMenuLayout, resetMenuLayout, restorePreviousMenu, saveMenuLayout } from "@/lib/app-menu-store"
import { canBuildPages, pageHref } from "@/lib/custom-pages"
import { PageStoreError } from "@/lib/custom-pages-store"
import { pageAuthor, readablePages } from "@/lib/custom-pages-server"
import { authorizedAccount } from "@/lib/server-auth"

const denied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })

function failure(error: unknown) {
  if (error instanceof PageStoreError) return NextResponse.json({ error: error.userMessage, code: error.code }, { status: error.status })
  console.error("APP_MENU_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  return NextResponse.json({ error: "Le menu n’a pas pu être enregistré sur le serveur partagé d’Eraser." }, { status: 502 })
}

/** Le menu réglé (admins et MJ) : le réglage complété du menu d'Eraser, et les pages qu'on peut y placer. */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !canBuildPages(account.role)) return denied()
  try {
    const [layout, pages, previous] = await Promise.all([readMenuLayout(), readablePages(account, { includeDrafts: true }), hasPreviousMenu()])
    return NextResponse.json({
      items: mergeMenu(layout?.items),
      custom: Boolean(layout),
      updatedAt: layout?.updatedAt ?? "",
      updatedBy: layout?.updatedBy ?? "",
      previous,
      pages: pages.map(({ page }) => ({ id: page.id, title: (page.published ?? page).title, href: pageHref(page), icon: (page.published ?? page).icon, emoji: (page.published ?? page).emoji, status: page.status, vis: page.vis, place: page.rowOf?.index || page.replaces ? "" : page.place })),
    })
  } catch (error) {
    return failure(error)
  }
}

/** save (items, base) · reset (« Rétablir le menu d'Eraser ») · restore (remettre le menu d'avant). */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account || !canBuildPages(account.role)) return denied()
  let body: { action?: string; items?: unknown; base?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Requête illisible." }, { status: 400 }) }
  const by = pageAuthor(account).name
  try {
    if (body.action === "reset") { await resetMenuLayout(); return NextResponse.json({ items: mergeMenu(null), custom: false, updatedAt: "", previous: true }) }
    if (body.action === "restore") { const layout = await restorePreviousMenu(by); return NextResponse.json({ items: mergeMenu(layout.items), custom: true, updatedAt: layout.updatedAt, previous: false }) }
    if (body.action === "save") { const layout = await saveMenuLayout(body.items, typeof body.base === "string" ? body.base : "", by, { admin: account.role === "admin" }); return NextResponse.json({ items: mergeMenu(layout.items), custom: true, updatedAt: layout.updatedAt }) }
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
  } catch (error) {
    return failure(error)
  }
}
