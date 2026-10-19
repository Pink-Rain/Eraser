import { Suspense } from "react"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { StudioRedirect } from "@/components/eraser/studio-redirect"

export const dynamic = "force-dynamic"

/**
 * L'ancienne adresse de l'atelier (« /pages/atelier?id=… », « ?nouvelle=1&section=… ») : le
 * navigateur lit lui-même l'adresse et va à la bonne page. Rien n'est décidé ici d'après les
 * paramètres de requête : le routeur rend la page une première fois sans eux.
 */
export default function PageStudioLegacyPage() {
  return (
    <AuthenticatedShell pageLabel="Atelier" roles={["admin"]}>
      <Suspense fallback={null}><StudioRedirect /></Suspense>
    </AuthenticatedShell>
  )
}
