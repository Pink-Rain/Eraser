import Link from "next/link"
import { ArrowLeft, LibraryBig } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ClassDetail } from "@/components/eraser/class-detail"
import { Button } from "@/components/ui/button"
import { getClassContent } from "@/lib/class-content"
import { classImageUrl } from "@/lib/class-images"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) redirect("/connexion")
  const { id } = await params
  const content = await getClassContent(decodeURIComponent(id)).catch((error) => {
    console.error("CLASS_CONTENT_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })
  const imageUrl = content ? classImageUrl(content.characterClass.image) : null

  return (
    <AuthenticatedShell pageLabel={content?.characterClass.name ?? "Classe"}>
      <div className="w-full flex-1 px-5 pt-8 sm:px-8 md:pt-12">
        <Button asChild variant="ghost" className="-ml-3 mb-7">
          <Link href="/regles/classes">
            <ArrowLeft className="size-4" />
            Retour aux classes
          </Link>
        </Button>

        {!content ? (
          <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <LibraryBig className="mx-auto size-8 text-muted-foreground" />
            <h1 className="font-display mt-4 text-3xl font-semibold">Classe introuvable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cette classe n’existe pas ou a été retirée de l’index.
            </p>
          </div>
        ) : null}
      </div>
      {content && <ClassDetail initialContent={content} imageUrl={imageUrl} canEdit={account.role === "admin" || account.role === "mj"} />}
    </AuthenticatedShell>
  )
}
