import { Suspense } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { GoogleDriveManager } from "@/components/eraser/google-drive-manager"
import { listDriveFiles } from "@/lib/google-drive"
import {
  listDriveSpreadsheetDuplicates,
} from "@/lib/google-sheets"
import {
  getGoogleAuthorization,
  getGoogleOAuthSettings,
  googleDriveAccountEmail,
  googleOAuthConfigured,
  googleOAuthRedirectUri,
} from "@/lib/google-oauth"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

async function GoogleDriveData({ origin, oauthStatus }: { origin: string; oauthStatus?: string }) {
  const [configured, oauthSettings, authorization] = await Promise.all([
    googleOAuthConfigured(),
    getGoogleOAuthSettings(),
    getGoogleAuthorization(),
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

export default async function GoogleDriveAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) redirect("/")

  const headerStore = await headers()
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host")
  const protocol = headerStore.get("x-forwarded-proto") || "https"
  const origin = host ? `${protocol}://${host}` : "https://eraser-jdr.eliot-myr-0.chatgpt.site"
  const oauthStatus = (await searchParams).google
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
          Relie ici le compte Google créé spécialement pour Eraser. Le site pourra utiliser
          tout son Drive pour lire, importer, créer et modifier les fichiers nécessaires.
        </p>
        <Suspense fallback={<DeferredContentLoading label="Chargement du Drive…" />}>
          <GoogleDriveData origin={origin} oauthStatus={oauthStatus} />
        </Suspense>
      </div>
    </AuthenticatedShell>
  )
}
