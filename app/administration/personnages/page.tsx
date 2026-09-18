import Link from "next/link"
import { CircleUserRound, ExternalLink } from "lucide-react"
import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listAllCharactersForAdmin } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function AllCharactersPage() {
  if (!(await authorizedAccount(["admin"]))) redirect("/")
  const characters = await listAllCharactersForAdmin()
  return (
    <AuthenticatedShell pageLabel="Tous les personnages" roles={["admin"]}>
      <div className="w-full flex-1 px-5 py-9 sm:px-8 md:py-14">
        <div className="flex items-center gap-4"><div className="flex size-12 items-center justify-center rounded-2xl border bg-card text-primary"><CircleUserRound /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/75">Administration</p><h1 className="font-display text-4xl font-semibold sm:text-5xl">Tous les personnages</h1></div></div>
        <div className="mt-10 overflow-hidden rounded-2xl border bg-card/90">
          <Table><TableHeader><TableRow><TableHead>Personnage</TableHead><TableHead>Compte</TableHead><TableHead>Campagne(s)</TableHead><TableHead className="text-right">Fiche</TableHead></TableRow></TableHeader>
            <TableBody>{characters.map((character) => <TableRow key={character.id}><TableCell className="font-medium">{character.name}</TableCell><TableCell><p>{character.ownerName}</p><p className="text-xs text-muted-foreground">{character.ownerEmail}</p></TableCell><TableCell>{character.campaigns.length ? <div className="flex flex-wrap gap-1">{character.campaigns.map((campaign) => <span key={campaign.id} className="rounded-full border px-2 py-0.5 text-xs" style={{ color: campaign.accentColor, borderColor: `${campaign.accentColor}66` }}>{campaign.name}</span>)}</div> : <span className="text-muted-foreground">Sans campagne</span>}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/personnage/${encodeURIComponent(character.id)}`}>Ouvrir<ExternalLink /></Link></Button></TableCell></TableRow>)}</TableBody>
          </Table>
          {!characters.length && <p className="p-8 text-center text-sm text-muted-foreground">Aucun personnage.</p>}
        </div>
      </div>
    </AuthenticatedShell>
  )
}
