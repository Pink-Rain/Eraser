import { Compass } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PreparedPage } from "@/components/eraser/prepared-page"

export const dynamic = "force-dynamic"

export default function OutsideCombatRulesPage() {
  return (
    <AuthenticatedShell pageLabel="Hors combat">
      <PreparedPage
        eyebrow="Règles"
        title="Hors combat"
        description="Exploration, interactions, tests et autres résolutions hors affrontement prendront place ici."
        icon={Compass}
      />
    </AuthenticatedShell>
  )
}
