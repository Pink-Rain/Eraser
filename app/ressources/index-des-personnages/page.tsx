import Link from "next/link"
import { CircleUserRound, ExternalLink } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { OwnerSelector } from "@/components/eraser/owner-selector"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listAllCharactersForAdmin } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

export const dynamic = "force-dynamic"

export default async function CharacterIndexPage() {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  // Seul un administrateur réattribue un propriétaire ; un MJ consulte.
  const isAdmin = account.role === "admin"
  const token = await currentAuthToken()
  const [characters, accounts] = await Promise.all([listAllCharactersForAdmin(token), isAdmin ? listAccounts(token) : Promise.resolve([])])
  return (
    <AuthenticatedShell pageLabel="Personnages" roles={["admin", "mj"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <div className="flex items-center gap-4"><div className="flex size-12 items-center justify-center rounded-2xl border bg-card text-primary"><CircleUserRound /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/75">Index</p><h1 className="font-display text-4xl font-semibold sm:text-5xl">Personnages</h1></div></div>
        <div className="mt-10 overflow-hidden rounded-2xl border bg-card/90">
          <Table><TableHeader><TableRow><TableHead>Personnage</TableHead><TableHead>Propriétaire</TableHead>{isAdmin && <TableHead>Attribuer à</TableHead>}<TableHead>Campagne(s)</TableHead><TableHead className="text-right">Fiche</TableHead></TableRow></TableHeader>
            <TableBody>{characters.map((character) => <TableRow key={character.id}><TableCell className="font-medium">{character.name}</TableCell><TableCell><p>{character.ownerName}</p>{isAdmin && <p className="text-xs text-muted-foreground">{character.ownerEmail || (character.ownerUid ? character.ownerUid : "Aucun compte")}</p>}</TableCell>{isAdmin && <TableCell><OwnerSelector kind="character" itemId={character.id} ownerUid={character.ownerUid} accounts={accounts} /></TableCell>}<TableCell>{character.campaigns.length ? <div className="flex flex-wrap gap-1">{character.campaigns.map((campaign) => <span key={campaign.id} className="rounded-full border px-2 py-0.5 text-xs" style={{ color: campaign.accentColor, borderColor: `${campaign.accentColor}66` }}>{campaign.name}</span>)}</div> : <span className="text-muted-foreground">Sans campagne</span>}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/personnage/${encodeURIComponent(character.id)}`}>Ouvrir<ExternalLink /></Link></Button></TableCell></TableRow>)}</TableBody>
          </Table>
          {!characters.length && <p className="p-8 text-center text-sm text-muted-foreground">Aucun personnage.</p>}
        </div>
      </div>
    </AuthenticatedShell>
  )
}
