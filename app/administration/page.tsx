import { redirect } from "next/navigation"
import { HardDrive, ShieldCheck, Trash2, Users } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ErrorJournalPanel } from "@/components/eraser/error-journal-panel"
import { MenuPage } from "@/components/eraser/menu-page"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** La page de la section Administration du menu : ses pages, puis le journal des erreurs. */
export default async function AdministrationPage() {
  if (!await authorizedAccount(["admin"])) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Administration" roles={["admin"]}>
      <MenuPage
        eyebrow="Menu"
        title="Administration"
        icon={ShieldCheck}
        description="Les comptes, la connexion à Google et la corbeille, puis ce qui s’est mal passé sur ce serveur."
        links={[
          { href: "/administration/comptes-et-roles", label: "Comptes et rôles", description: "Les comptes de la table, leurs rôles et leurs accès.", icon: Users },
          { href: "/administration/google-drive", label: "Google Drive et Sheets", description: "Le compte Google relié, les feuilles d’Eraser et leurs performances.", icon: HardDrive },
          { href: "/administration/corbeille", label: "Corbeille", description: "Les personnages, campagnes et index supprimés, à restaurer.", icon: Trash2 },
        ]}
      >
        <ErrorJournalPanel />
      </MenuPage>
    </AuthenticatedShell>
  )
}
