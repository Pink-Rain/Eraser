import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { HiddenEffectsAdmin } from "@/components/eraser/hidden-effects-admin"
import { hiddenEffectsAvailable, readHiddenEffectTypes } from "@/lib/hidden-effects-store"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Administration › Effets cachés : les types d'items dont l'effet reste verrouillé tant qu'un personnage ne l'a pas débloqué. */
export default async function HiddenEffectsPage() {
  if (!await authorizedAccount(["admin"])) redirect("/")
  return <AuthenticatedShell pageLabel="Effets cachés" roles={["admin"]}>
    <HiddenEffectsAdmin initial={{ types: await readHiddenEffectTypes().catch(() => []), available: hiddenEffectsAvailable() }} />
  </AuthenticatedShell>
}
