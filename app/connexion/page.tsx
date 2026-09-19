import { KeyRound } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthPanel } from "@/components/eraser/auth-panel"
import { currentAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>
}) {
  if (await currentAccount()) redirect("/")
  const { authError } = await searchParams
  return (
    <main className="paper-grain min-h-svh px-5 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid min-h-[calc(100svh-5rem)] items-center gap-10 py-10 lg:grid-cols-[1fr_0.86fr]">
          <section className="max-w-xl">
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
              <KeyRound className="size-5" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
              Portail des joueurs
            </p>
            <h1 className="font-display mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              Entre dans <span className="text-primary">Eraser</span>
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Crée ton compte directement dans l’application. Une fois inscrit,
              l’administrateur t’attribuera le rôle adapté à la campagne.
            </p>
          </section>

          <AuthPanel initialError={authError?.slice(0, 240)} />
        </div>
      </div>
    </main>
  )
}
