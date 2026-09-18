import { BookText } from "lucide-react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PreparedPage } from "@/components/eraser/prepared-page"

export const dynamic = "force-dynamic"

export default function VocabularyPage() {
  return (
    <AuthenticatedShell pageLabel="Vocabulaire">
      <PreparedPage
        eyebrow="Règles"
        title="Vocabulaire"
        description="Le glossaire des termes, états, actions et notions propres à Eraser sera organisé ici."
        icon={BookText}
      />
    </AuthenticatedShell>
  )
}
