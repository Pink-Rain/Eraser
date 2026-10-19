import { Suspense } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { FoldSection } from "@/components/eraser/fold-section"
import { openSectionsOf, OPEN_SECTIONS_PARAM } from "@/lib/open-sections"
import { GoogleDriveManager } from "@/components/eraser/google-drive-manager"
import { PerformancePanel } from "@/components/eraser/performance-panel"
import { SheetDiagnosticsGrid } from "@/components/eraser/sheet-diagnostics-grid"
import { WriteTestLink } from "@/components/eraser/write-test-link"
import { listDriveFiles } from "@/lib/google-drive"
import {
  diagnoseJdrSheets,
  listDriveSpreadsheetDuplicates,
} from "@/lib/google-sheets"
import {
  getGoogleAuthorization,
  getGoogleOAuthSettings,
  googleDriveAccountEmail,
  googleOAuthConfigured,
  googleOAuthRedirectUri,
} from "@/lib/google-oauth"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function GoogleDriveData({ origin, oauthStatus, open }: { origin: string; oauthStatus?: string; open: Set<string> }) {
  const sessionToken = await currentAuthToken()
  const [configured, oauthSettings, authorization] = await Promise.all([
    googleOAuthConfigured(sessionToken),
    getGoogleOAuthSettings(sessionToken),
    getGoogleAuthorization(sessionToken),
  ])
  const callbackUrl = googleOAuthRedirectUri(origin)
  let files: Awaited<ReturnType<typeof listDriveFiles>> = []
  let duplicateGroups: Awaited<ReturnType<typeof listDriveSpreadsheetDuplicates>> = []
  let loadError: string | null = null
  // Le Drive n'est parcouru que pour les parties dépliées qui le montrent.
  const openSections = { files: open.has("fichiers"), duplicates: open.has("doublons") }
  if (configured && authorization && (openSections.files || openSections.duplicates)) {
    try {
      ;[files, duplicateGroups] = await Promise.all([
        openSections.files ? listDriveFiles() : Promise.resolve([] as typeof files),
        openSections.duplicates ? listDriveSpreadsheetDuplicates() : Promise.resolve([] as typeof duplicateGroups),
      ])
    } catch {
      loadError = "Le compte est relié, mais son Drive n’a pas pu être chargé. Tu peux le reconnecter."
    }
  }
  return (
    <GoogleDriveManager
      configured={configured}
      callbackUrl={callbackUrl}
      defaultEmail={googleDriveAccountEmail()}
      oauthSettings={oauthSettings}
      authorization={authorization}
      files={files}
      duplicateGroups={duplicateGroups}
      loadError={loadError}
      oauthStatus={oauthStatus}
      openSections={openSections}
    />
  )
}

async function SheetDiagnostics({ writeTest }: { writeTest: boolean }) {
  const diagnostics = await diagnoseJdrSheets(writeTest).catch(() => null)
  if (!diagnostics) return null
  const broken = diagnostics.filter((item) => item.status !== "ok")
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {broken.length
          ? `${broken.length} feuille${broken.length > 1 ? "s" : ""} en défaut. L’erreur brute de Google est indiquée telle quelle.`
          : writeTest
            ? "Toutes les feuilles se lisent et s’écrivent correctement."
            : "Toutes les feuilles se lisent correctement."}
      </p>
      <p className="mt-3 text-sm">
        <WriteTestLink writeTest={writeTest} />
        <span className="ml-2 text-muted-foreground">Le test d’écriture ajoute une ligne témoin dans chaque feuille puis l’efface.</span>
      </p>
      <div className="mt-4"><SheetDiagnosticsGrid diagnostics={diagnostics} /></div>
    </>
  )
}

export default async function GoogleDriveAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; test?: string; [OPEN_SECTIONS_PARAM]?: string }>
}) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")

  const headerStore = await headers()
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host")
  const protocol = headerStore.get("x-forwarded-proto") || "http"
  const origin = host ? `${protocol}://${host}` : "http://127.0.0.1:32147"
  const query = await searchParams
  const oauthStatus = query.google
  const writeTest = query.test === "ecriture"
  // Les parties repliées ne sont pas calculées : la page s'ouvre sans lire tout le Drive ni
  // diagnostiquer chaque feuille. Lancer le test d'écriture déplie le diagnostic.
  const open = openSectionsOf(query[OPEN_SECTIONS_PARAM])
  if (writeTest) open.add("diagnostic")
  return (
    <AuthenticatedShell pageLabel="Google Drive et Sheets" roles={["admin"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
          Administration
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">
          Google Drive et Sheets
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Relie ici le compte Google créé spécialement pour Eraser. L’application pourra utiliser
          tout ce Drive pour lire, importer, créer et modifier les fichiers nécessaires.
        </p>
        <Suspense fallback={<DeferredContentLoading label="Chargement du Drive…" />}>
          <GoogleDriveData origin={origin} oauthStatus={oauthStatus} open={open} />
        </Suspense>
        <div className="mt-6 grid gap-6">
          <FoldSection id="diagnostic" serverOpen={open.has("diagnostic")} eyebrow="Vérification" title="Diagnostic des feuilles" summary="Chaque feuille d’Eraser est lue (et, au choix, écrite) pour vérifier qu’elle répond.">
            {/* Sans clé : changer de test garde le tableau affiché jusqu'au nouveau résultat. */}
            <Suspense fallback={<DeferredContentLoading label="Diagnostic des feuilles…" className="mt-0" />}>
              <SheetDiagnostics writeTest={writeTest} />
            </Suspense>
          </FoldSection>
          <FoldSection id="lenteurs" eyebrow="Serveur local" title="Lenteurs" summary="Les appels à Google et au serveur partagé qui ont fait attendre les pages.">
            <PerformancePanel embedded />
          </FoldSection>
        </div>
      </div>
    </AuthenticatedShell>
  )
}
