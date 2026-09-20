import { Suspense } from "react"
import { ExternalLink, LibraryBig } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ClassCard } from "@/components/eraser/class-card"
import { ClassAccentSampler } from "@/components/eraser/class-accent-sampler"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { Button } from "@/components/ui/button"
import { classImageUrl } from "@/lib/class-images"
import {
  classTypes,
  listClasses,
} from "@/lib/google-sheets"
import { getJdrSheet } from "@/lib/jdr-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function ClassesIndexData({ canSampleAccents, showErrorDetail }: { canSampleAccents: boolean; showErrorDetail: boolean }) {
  let classes: Awaited<ReturnType<typeof listClasses>> = []
  let loadError = false
  let loadErrorDetail = ""
  try {
    classes = await listClasses()
  } catch (error) {
    loadError = true
    loadErrorDetail = error instanceof Error ? error.message : "UNKNOWN_ERROR"
    console.error("CLASS_INDEX_LOAD_FAILED", loadErrorDetail)
  }
  const imageCounts = new Map<string, number>()
  classes.forEach((characterClass) => imageCounts.set(characterClass.image, (imageCounts.get(characterClass.image) || 0) + 1))
  return (
    <>
      {canSampleAccents && <ClassAccentSampler targets={classes.flatMap((characterClass) => {
        const imageUrl = classImageUrl(characterClass.image)
        return !characterClass.accentReady && imageUrl && imageCounts.get(characterClass.image) === 1 ? [{ id: characterClass.id, imageUrl }] : []
      })} />}
      {loadError && (
        <div className="mt-10 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          {loadErrorDetail === "CLASSES_SHEET_NOT_LINKED"
            ? "La feuille « Classes » n’est pas reliée à cette installation d’Eraser. Un administrateur doit ouvrir Administration → Google Drive et cliquer sur « Relier mes feuilles existantes »."
            : "L’index Google Sheets est momentanément indisponible."}
          {showErrorDetail && loadErrorDetail && <span className="mt-1 block font-mono text-xs opacity-80">{loadErrorDetail}</span>}
        </div>
      )}

      {!loadError && classes.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed bg-card/55 px-6 py-12 text-center text-sm text-muted-foreground">
          Aucune classe n’a encore été ajoutée dans l’index.
        </div>
      )}

      <div className="mt-12 space-y-14">
        {classTypes.map((type) => {
          const typeClasses = classes.filter((characterClass) => characterClass.type === type)
          if (!typeClasses.length) return null
          return (
            <section key={type} aria-labelledby={`type-${type}`} className="deferred-section">
              <div className="mb-5 border-b pb-3 text-center">
                <h2 id={`type-${type}`} className="font-display text-3xl font-semibold sm:text-4xl">
                  {type}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {typeClasses.map((characterClass) => (
                  <ClassCard key={characterClass.id} characterClass={characterClass} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

export default async function ClassesRulesPage() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const classesSheet = account.role === "admin" ? await getJdrSheet("classes").catch(() => null) : null

  return (
    <AuthenticatedShell pageLabel="Classe">
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <section className="flex items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
              <span className="h-px w-7 bg-primary/50" />
              Règles
            </div>
            <div className="flex items-start gap-4">
              <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card/90 text-primary shadow-[0_8px_25px_rgb(67_50_31/0.06)]">
                <LibraryBig className="size-5" />
              </div>
              <div>
                <h1 className="font-display text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
                  Classe
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                  Parcours les classes par grande famille, puis ouvre une carte pour consulter sa fiche.
                </p>
              </div>
            </div>
          </div>
          {classesSheet && (
            <Button asChild variant="outline" className="admin-view-only hidden shrink-0">
              <a href={classesSheet.webViewLink} target="_blank" rel="noreferrer">
                Ouvrir le tableau
                <ExternalLink className="size-4" />
              </a>
            </Button>
          )}
        </section>

        <Suspense fallback={<DeferredContentLoading label="Chargement des classes…" />}>
          <ClassesIndexData canSampleAccents={account.role === "admin"} showErrorDetail={account.role === "admin"} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
