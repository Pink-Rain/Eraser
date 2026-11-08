import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { AddressRedirect } from "@/components/eraser/address-redirect"
import { ATELIER_HREF } from "@/lib/custom-pages"

export const dynamic = "force-dynamic"

/** L'ancienne adresse de l'Index des pages : il vit dans l'extension Eraser Page. */
export default function PagesIndexMovedPage() {
  return <AuthenticatedShell pageLabel="Index des pages" roles={["admin"]}><AddressRedirect to={ATELIER_HREF} label="Ouverture de l’Index des pages" /></AuthenticatedShell>
}
