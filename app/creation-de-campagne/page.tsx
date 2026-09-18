import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CampaignCreationForm } from "@/components/eraser/campaign-creation-form"

export const dynamic = "force-dynamic"

export default function CampaignCreationPage() {
  return (
    <AuthenticatedShell pageLabel="Création de campagne" roles={["admin", "mj"]}>
      <CampaignCreationForm />
    </AuthenticatedShell>
  )
}
