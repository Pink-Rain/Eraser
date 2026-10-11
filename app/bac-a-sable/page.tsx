import { redirect } from "next/navigation"
import { Drama, FilePlus2, FlaskConical, Map, Store } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { customPageLinks } from "@/components/eraser/custom-page-links"
import { MenuPage } from "@/components/eraser/menu-page"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** La page de la section Bac à sable du menu. */
export default async function SandboxPage() {
  if (!await authorizedAccount(["admin", "mj"])) redirect("/")
  const pages = await customPageLinks("bac-a-sable")
  return (
    <AuthenticatedShell pageLabel="Bac à sable" roles={["admin", "mj"]}>
      <MenuPage
        eyebrow="Menu"
        title="Bac à sable"
        icon={FlaskConical}
        description="Un terrain d’essai hors campagne : préparer une carte, un magasin ou des PNJ avant de les amener à la table."
        links={[
          { href: "/bac-a-sable/tabletop", label: "Tabletop", description: "Une table de jeu libre pour essayer cartes et jetons.", icon: Map },
          { href: "/bac-a-sable/magasin", label: "Magasin", description: "Générer et régler un magasin sans campagne.", icon: Store },
          { href: "/bac-a-sable/pnjs", label: "PNJs", description: "Les PNJ de la bibliothèque, hors campagne.", icon: Drama },
          { href: "/pages", label: "Créateur de pages", description: "Créer des pages faites de blocs : textes, secrets à révéler, carnets, vues des index…", icon: FilePlus2 },
          ...pages,
        ]}
      />
    </AuthenticatedShell>
  )
}
