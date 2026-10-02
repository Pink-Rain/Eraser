"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Crown, LoaderCircle, ShieldCheck, UsersRound } from "lucide-react"

import { AccountAvatar } from "@/components/eraser/account-dialog"
import type { SiteRole } from "@/lib/auth-types"

export type DirectoryEntry = { uid: string; name: string; role: SiteRole | null }

// Gardée d'un affichage à l'autre : revenir à l'accueil montre aussitôt la liste.
let knownDirectory: DirectoryEntry[] | null = null

const roleIcons = { admin: ShieldCheck, mj: Crown, joueur: UsersRound } as const
const roleLabels: Record<SiteRole, string> = { admin: "Administrateur", mj: "Maître du jeu", joueur: "Joueur" }

/** Les autres comptes : un clic ouvre leur profil (personnages, campagnes, succès). */
export function HomeAccounts() {
  const [accounts, setAccounts] = useState<DirectoryEntry[] | null>(knownDirectory)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch("/api/account/directory", { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as { accounts?: DirectoryEntry[]; error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return
        if (!response.ok) { setError(payload.error || "La liste des comptes n’a pas pu être chargée."); return }
        knownDirectory = payload.accounts ?? []
        setAccounts(knownDirectory)
      })
      .catch(() => { if (active) setError("La liste des comptes n’a pas pu être chargée.") })
    return () => { active = false }
  }, [])
  return <section className="rounded-[1.5rem] border bg-card/90 p-4 shadow-[0_12px_35px_rgb(67_50_31/0.07)] sm:p-5">
    <div className="mb-4 flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><UsersRound className="size-4.5" /></div>
      <h2 className="font-display flex-1 text-2xl font-semibold tracking-[-0.01em]">Joueurs et MJ</h2>
      {accounts && <span className="text-sm text-muted-foreground tabular-nums">{accounts.length}</span>}
    </div>
    {accounts
      ? accounts.length
        ? <div className="grid max-h-80 gap-1 overflow-y-auto pr-1">
          {accounts.map((account) => {
            const Icon = account.role ? roleIcons[account.role] : null
            return <Link key={account.uid} href={`/profil/${encodeURIComponent(account.uid)}`} prefetch={false} data-tab-href={`/profil/${encodeURIComponent(account.uid)}`} data-tab-label={account.name} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-accent">
              <AccountAvatar user={{ uid: account.uid, displayName: account.name, email: "" }} version={0} className="size-9 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{account.name}</span>
              {Icon && account.role && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={roleLabels[account.role]} />}
            </Link>
          })}
        </div>
        : <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Aucun autre compte pour l’instant.</p>
      : error
        ? <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{error}</p>
        : <div className="grid min-h-24 place-items-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>}
  </section>
}
