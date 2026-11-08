import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { ExtensionHost, ExtensionUnavailable } from "@/components/eraser/extension-host"
import { EXTENSION_API_VERSION, extensionOpenFor, linkedExtension } from "@/lib/extensions"
import { extensionsDirectory, readInstalledExtension } from "@/lib/extensions-install"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** Une extension installée (lib/extensions.ts), ouverte dans la coque d'Eraser. */
export default async function ExtensionPage({ params }: { params: Promise<{ id: string; chemin?: string[] }> }) {
  const { id, chemin } = await params
  const definition = linkedExtension(id)
  if (!definition) notFound()
  const account = await authorizedAccount()
  if (!account) redirect("/")
  if (!extensionOpenFor(id, account)) redirect("/")
  const installed = await readInstalledExtension(id)

  let content
  if (installed && installed.api <= EXTENSION_API_VERSION) {
    content = <ExtensionHost
      id={id}
      version={installed.version}
      entry={installed.entry}
      styles={installed.styles}
      path={chemin ?? []}
      account={{ uid: account.uid, displayName: account.displayName, role: account.role }}
    />
  } else {
    const detail = !extensionsDirectory()
      ? "Les extensions ne s'installent que dans l'application Windows d'Eraser."
      : installed
        ? "La version installée demande une version plus récente d'Eraser."
        : "Elle n'a pas encore de version publiée, ou son téléchargement est en cours : « Chercher les mises à jour », en bas de la barre latérale, l'installe tout de suite."
    content = <ExtensionUnavailable title={`${definition.name} n'est pas installée sur cet ordinateur`} detail={detail} />
  }
  return <AuthenticatedShell pageLabel={definition.name}>{content}</AuthenticatedShell>
}
