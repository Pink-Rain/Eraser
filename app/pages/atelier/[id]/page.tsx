import { redirect } from "next/navigation"

import { studioHref } from "@/lib/custom-pages"

export const dynamic = "force-dynamic"

/** L'ancienne adresse de l'atelier d'une page : il vit dans l'extension Eraser Page. */
export default async function PageStudioMovedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(studioHref(decodeURIComponent(id)))
}
