import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, LibraryBig, LoaderCircle, PencilRuler } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ClassDetail } from "@/components/eraser/class-detail"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { Button } from "@/components/ui/button"
import { getClassContent } from "@/lib/class-content"
import { classImageUrl } from "@/lib/class-images"
import { listClasses } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function ClassDetailData({ classId }: { classId: string }) {
  const content = await getClassContent(classId).catch((error) => {
    console.error("CLASS_CONTENT_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })
  if (!content) return <div className="w-full px-5 sm:px-8">
    <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <LibraryBig className="mx-auto size-8 text-muted-foreground" />
      <h1 className="font-display mt-4 text-3xl font-semibold">Classe introuvable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cette classe n’existe pas ou a été retirée de l’index.
      </p>
    </div>
  </div>
  return <ClassDetail content={content} imageUrl={classImageUrl(content.characterClass.image)} />
}

/**
 * La page s'affiche tout de suite (nom de la classe compris, lu dans l'index local) ;
 * la présentation et les sorts arrivent ensuite. Avant, rien ne s'affichait tant que
 * les deux classeurs n'avaient pas été relus dans Google Sheets.
 */
export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const classId = decodeURIComponent(id)
  const characterClass = (await listClasses().catch(() => [])).find((item) => item.id === classId)

  return (
    <AuthenticatedShell pageLabel={characterClass?.name ?? "Classe"}>
      <div className="w-full flex-1 px-5 pt-8 sm:px-8 md:pt-12">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" className="-ml-3">
            <Link href="/regles/classes">
              <ArrowLeft className="size-4" />
              Retour aux classes
            </Link>
          </Button>
          {/* La page se consulte ; la classe se modifie dans le créateur de classe. */}
          {(account.role === "admin" || account.role === "mj") && <Button asChild variant="outline" size="sm">
            <Link href={`/creation-de-classe?classe=${encodeURIComponent(classId)}`}>
              <PencilRuler className="size-4" />
              Modifier dans le créateur de classe
            </Link>
          </Button>}
        </div>
      </div>
      <Suspense key={classId} fallback={<div className="w-full px-5 sm:px-8">
        {characterClass && <h1 className="font-display text-4xl font-semibold sm:text-5xl" style={{ color: characterClass.accentDark }}>{characterClass.name}</h1>}
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Chargement de la présentation et des sorts…</p>
        <DeferredContentLoading label="Chargement de la classe…" className="mt-4" />
      </div>}>
        <ClassDetailData classId={classId} />
      </Suspense>
    </AuthenticatedShell>
  )
}
