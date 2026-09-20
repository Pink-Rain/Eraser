import { Suspense } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { GoogleDriveManager } from "@/components/eraser/google-drive-manager"
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

async function GoogleDriveData({ origin, oauthStatus }: { origin: string; oauthStatus?: string }) {
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
  if (configured && authorization) {
    try {
      ;[files, duplicateGroups] = await Promise.all([listDriveFiles(), listDriveSpreadsheetDuplicates()])
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
    />
  )
}

async function SheetDiagnostics({ writeTest }: { writeTest: boolean }) {
  const diagnostics = await diagnoseJdrSheets(writeTest).catch(() => null)
  if (!diagnostics) return null
  const broken = diagnostics.filter((item) => item.status !== "ok")
  return (
    <section className="mt-10 rounded-2xl border bg-card/70 p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold">Diagnostic des feuilles</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {broken.length
          ? `${broken.length} feuille${broken.length > 1 ? "s" : ""} en défaut. L’erreur brute de Google est indiquée telle quelle.`
          : writeTest
            ? "Toutes les feuilles se lisent et s’écrivent correctement."
            : "Toutes les feuilles se lisent correctement."}
      </p>
      <p className="mt-3 text-sm">
        <a href={writeTest ? "/administration/google-drive" : "/administration/google-drive?test=ecriture"} className="font-medium underline underline-offset-2">
          {writeTest ? "Revenir au test de lecture seule" : "Tester aussi l’écriture"}
        </a>
        <span className="ml-2 text-muted-foreground">Le test d’écriture ajoute une ligne témoin dans chaque feuille puis l’efface.</span>
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="py-2 pr-3 font-semibold">Feuille</th><th className="py-2 pr-3 font-semibold">Onglet attendu</th><th className="py-2 pr-3 font-semibold">Lignes</th><th className="py-2 font-semibold">État</th></tr>
          </thead>
          <tbody className="divide-y">
            {diagnostics.map((item) => (
              <tr key={item.key} className="align-top">
                <td className="py-2 pr-3 font-medium">
                  {item.webViewLink
                    ? <a href={item.webViewLink} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item.name}</a>
                    : item.name}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{item.expectedTab}</td>
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{item.rows === null ? "—" : item.rows}</td>
                <td className="py-2">
                  {item.status === "ok"
                    ? <span className="text-emerald-700">OK</span>
                    : <span className="text-destructive">
                        {item.detail}
                        {item.actualTabs.length ? <span className="block text-xs text-muted-foreground">Onglets présents : {item.actualTabs.join(", ")}</span> : null}
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function GoogleDriveAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; test?: string }>
}) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")

  const headerStore = await headers()
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host")
  const protocol = headerStore.get("x-forwarded-proto") || "https"
  const origin = host ? `${protocol}://${host}` : "https://eraser-jdr.eliot-myr-0.chatgpt.site"
  const query = await searchParams
  const oauthStatus = query.google
  const writeTest = query.test === "ecriture"
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
          <GoogleDriveData origin={origin} oauthStatus={oauthStatus} />
        </Suspense>
        <Suspense key={writeTest ? "write" : "read"} fallback={<DeferredContentLoading label="Diagnostic des feuilles…" />}>
          <SheetDiagnostics writeTest={writeTest} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
