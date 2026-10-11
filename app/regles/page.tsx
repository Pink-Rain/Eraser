import { BookText, Compass, ScrollText, Sparkles, Swords } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { customPageLinks } from "@/components/eraser/custom-page-links"
import { MenuPage } from "@/components/eraser/menu-page"

export const dynamic = "force-dynamic"

/** La page de la section Règles du menu. */
export default async function RulesPage() {
  // Les pages du créateur de pages rangées dans Règles suivent celles d’Eraser.
  const pages = await customPageLinks("regles")
  return (
    <AuthenticatedShell pageLabel="Règles">
      <MenuPage
        eyebrow="Menu"
        title="Règles"
        icon={ScrollText}
        description={<>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua : tout ce qu’il faut savoir pour jouer à Eraser.</p>
          <p className="mt-3">Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
        </>}
        links={[
          { href: "/regles/classes", label: "Classes", description: "Les classes jouables, leurs rangs et leurs sorts.", icon: Sparkles },
          { href: "/regles/vocabulaire", label: "Vocabulaire", description: "Les mots de la table et leur définition.", icon: BookText },
          { href: "/regles/combat", label: "Combat", description: "Tours, actions, états et résolution des affrontements.", icon: Swords },
          { href: "/regles/hors-combat", label: "Hors combat", description: "Exploration, social, repos et tout ce qui se passe entre deux combats.", icon: Compass },
          ...pages,
        ]}
      />
    </AuthenticatedShell>
  )
}
