import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// Le compagnon Roll20 est maintenant dans le dossier de la campagne : les anciens liens y mènent.
export default async function Roll20BridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/campagne/${encodeURIComponent(id)}/dossier#roll20`)
}
