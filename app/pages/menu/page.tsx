import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { MenuEditor } from "@/components/eraser/menu-editor"
import { mergeMenu } from "@/lib/app-menu"
import { hasPreviousMenu, readMenuLayout } from "@/lib/app-menu-store"
import { pageHref } from "@/lib/custom-pages"
import { readablePages } from "@/lib/custom-pages-server"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** L'éditeur du menu latéral (admins et MJ) : un réglage commun à toute la table. */
export default async function MenuEditorPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  const [layout, previous, pages] = await Promise.all([
    readMenuLayout({ fresh: true }).catch(() => null),
    hasPreviousMenu().catch(() => false),
    readablePages(account, { includeDrafts: true }).catch(() => []),
  ])
  return (
    <AuthenticatedShell pageLabel="Menu" roles={["admin", "mj"]}>
      <MenuEditor
        role={account.role}
        initial={{
          items: mergeMenu(layout?.items),
          custom: Boolean(layout),
          updatedAt: layout?.updatedAt ?? "",
          updatedBy: layout?.updatedBy ?? "",
          previous,
          pages: pages.map(({ page }) => { const content = page.published ?? page; return { id: page.id, title: content.title, href: pageHref(page), icon: content.icon, emoji: content.emoji, status: page.status, vis: page.vis, place: page.rowOf?.index || page.replaces ? "" : page.place } }),
        }}
      />
    </AuthenticatedShell>
  )
}
