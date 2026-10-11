import { CustomPageRoute } from "@/components/eraser/custom-page-route"

export const dynamic = "force-dynamic"

/** Une page du créateur de pages rangée dans l’Administration : réservée aux admins. */
export default async function AdministrationCustomPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params
  return <CustomPageRoute place="administration" slug={page} />
}
