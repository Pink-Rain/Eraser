import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { AddressRedirect } from "@/components/eraser/address-redirect"
import { documentStudioHref } from "@/lib/document-model"

export const dynamic = "force-dynamic"

/**
 * L'ancienne page Document d'une campagne : son éditeur vit dans l'extension Eraser Doc
 * (`/extension/doc/campagne/<id>`, mêmes paramètres : `document`, `nouveau`, `session`).
 */
export default async function CampaignDocumentMovedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AuthenticatedShell pageLabel="Document" roles={["admin", "mj"]}><AddressRedirect to={documentStudioHref(id)} label="Ouverture des documents" /></AuthenticatedShell>
}
