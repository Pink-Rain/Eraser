import { Swords } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PreparedPage } from "@/components/eraser/prepared-page"

export const dynamic = "force-dynamic"

export default function CombatRulesPage() {
  return (
    <AuthenticatedShell pageLabel="Combat">
      <PreparedPage
        eyebrow="Règles"
        title="Combat"
        description="Les règles de tours, d’actions, d’états et de résolution des affrontements seront réunies ici."
        icon={Swords}
      />
    </AuthenticatedShell>
  )
}
