import Link from "next/link"
import { ExternalLink, Map } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { OwnerSelector } from "@/components/eraser/owner-selector"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listAllCampaignsForAdmin } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

export const dynamic = "force-dynamic"

export default async function AllCampaignsPage() {
  if (!(await authorizedAccount(["admin"]))) redirect("/")
  const [campaigns, accounts] = await Promise.all([listAllCampaignsForAdmin(), listAccounts(await currentAuthToken())])
  return (
    <AuthenticatedShell pageLabel="Toutes les campagnes" roles={["admin"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <div className="flex items-center gap-4"><div className="flex size-12 items-center justify-center rounded-2xl border bg-card text-primary"><Map /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/75">Administration</p><h1 className="font-display text-4xl font-semibold sm:text-5xl">Toutes les campagnes</h1></div></div>
        <div className="mt-10 overflow-hidden rounded-2xl border bg-card/90">
          <Table><TableHeader><TableRow><TableHead>Campagne</TableHead><TableHead>Propriétaire</TableHead><TableHead>Attribuer à</TableHead><TableHead>Personnages</TableHead><TableHead className="text-right">Tableau de bord</TableHead></TableRow></TableHeader>
            <TableBody>{campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell><div className="flex items-center gap-2 font-medium"><span className="size-3 rounded-full" style={{ backgroundColor: campaign.accentColor }} />{campaign.name}</div></TableCell><TableCell><p>{campaign.ownerName}</p><p className="text-xs text-muted-foreground">{campaign.ownerEmail || (campaign.mjUid ? campaign.mjUid : "Aucun compte")}</p></TableCell><TableCell><OwnerSelector kind="campaign" itemId={campaign.id} ownerUid={campaign.mjUid} accounts={accounts} /></TableCell><TableCell>{campaign.characters.length ? campaign.characters.map((character) => character.name).join(", ") : <span className="text-muted-foreground">Aucun</span>}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/campagne/${encodeURIComponent(campaign.id)}`}>Ouvrir<ExternalLink /></Link></Button></TableCell></TableRow>)}</TableBody>
          </Table>
          {!campaigns.length && <p className="p-8 text-center text-sm text-muted-foreground">Aucune campagne.</p>}
        </div>
      </div>
    </AuthenticatedShell>
  )
}
