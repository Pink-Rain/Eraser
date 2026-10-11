import { CustomPageRoute } from "@/components/eraser/custom-page-route"

export const dynamic = "force-dynamic"

/** Une page du créateur de pages hors menu : on y arrive par un lien ou par la recherche. */
export default async function OffMenuCustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <CustomPageRoute place="hors-menu" slug={slug} />
}
