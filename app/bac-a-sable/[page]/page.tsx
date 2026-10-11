import { CustomPageRoute } from "@/components/eraser/custom-page-route"

export const dynamic = "force-dynamic"

/** Une page du créateur de pages rangée dans le Bac à sable (Tabletop, Magasin et PNJs gardent leur adresse). */
export default async function SandboxCustomPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  return <CustomPageRoute place="bac-a-sable" slug={page} />
}
