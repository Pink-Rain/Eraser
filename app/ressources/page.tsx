import { LibraryBig } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { IndexDirectory } from "@/components/eraser/index-directory"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** L’accueil de la section Index : même présentation que la page Classe des règles. */
export default async function IndexHomePage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  return (
    <AuthenticatedShell pageLabel="Index" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <section className="max-w-3xl">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
            <span className="h-px w-7 bg-primary/50" />
            Index
          </div>
          <div className="flex items-start gap-4">
            <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]">
              <LibraryBig className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">Index</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Toutes les bibliothèques du monde d’Eraser. L’étoile d’une carte la garde dans l’Index et dans le menu ; sans étoile, elle passe dans l’Index secondaire.
              </p>
            </div>
          </div>
        </section>
        <IndexDirectory />
      </div>
    </AuthenticatedShell>
  )
}
