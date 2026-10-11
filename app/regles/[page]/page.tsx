import { CustomPageRoute } from "@/components/eraser/custom-page-route"

export const dynamic = "force-dynamic"

/** Une page du créateur de pages rangée dans Règles (les pages d’Eraser de la section gardent leur adresse). */
export default async function RulesCustomPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  return <CustomPageRoute place="regles" slug={page} />
}
