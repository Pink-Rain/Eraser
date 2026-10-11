import { CustomPageRoute } from "@/components/eraser/custom-page-route"

export const dynamic = "force-dynamic"

/** Une page du créateur de pages rangée dans Index (les index gardent leur adresse, et « index/… » ses index personnalisés). */
export default async function IndexCustomPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  return <CustomPageRoute place="ressources" slug={page} />
}
