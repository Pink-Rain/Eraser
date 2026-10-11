import { CustomPageRoute } from "@/components/eraser/custom-page-route"

export const dynamic = "force-dynamic"

/** Une page du créateur de pages rattachée à une campagne : ouverte à ses membres (et aux admins). */
export default async function CampaignCustomPage({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params
  return <CustomPageRoute place="campagne" slug={slug} campaignId={id} />
}
