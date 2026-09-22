import { BookText, ExternalLink } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { VocabularyGlossary } from "@/components/eraser/vocabulary-glossary"
import { Button } from "@/components/ui/button"
import { getJdrSheet } from "@/lib/jdr-sheets"
import { authorizedAccount } from "@/lib/server-auth"
import { listVocabulary, type VocabularyEntry } from "@/lib/vocabulary"

export const dynamic = "force-dynamic"

export default async function VocabularyPage() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const canEdit = account.role === "admin" || account.role === "mj"

  let entries: VocabularyEntry[] = []
  let loadError = ""
  try {
    entries = await listVocabulary()
  } catch (error) {
    console.error("VOCABULARY_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    loadError = "Le vocabulaire est momentanément indisponible."
  }
  const sheet = account.role === "admin" ? await getJdrSheet("vocabulary").catch(() => null) : null

  return (
    <AuthenticatedShell pageLabel="Vocabulaire">
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <section className="max-w-3xl">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
            <span className="h-px w-7 bg-primary/50" />
            Règles
          </div>
          <div className="flex items-start gap-4">
            <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]">
              <BookText className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
                Vocabulaire
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                Le dictionnaire des mots qu’on utilise sans arrêt autour de la table, rangés par ordre alphabétique.
              </p>
              {sheet && (
                <Button asChild variant="link" className="admin-view-only mt-2 hidden h-auto px-0">
                  <a href={sheet.webViewLink} target="_blank" rel="noreferrer">
                    Ouvrir le tableau « Vocabulaire »
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </section>

        <VocabularyGlossary initialEntries={entries} canEdit={canEdit} loadError={loadError} />
      </div>
    </AuthenticatedShell>
  )
}
