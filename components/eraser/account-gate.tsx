"use client"

import { Clock3, LogOut, ShieldX } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AccountRecord } from "@/lib/auth-types"

export function AccountGate({ account }: { account: AccountRecord }) {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/connexion"
  }

  const suspended = account.status === "suspendu"
  return (
    <main className="paper-grain flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-card/95 p-7 text-center shadow-[0_24px_80px_rgb(65_44_24/0.12)] sm:p-9">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          {suspended ? <ShieldX className="size-6" /> : <Clock3 className="size-6" />}
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
          Compte connecté
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold">
          {suspended ? "Accès suspendu" : "Accès en attente"}
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          {suspended
            ? "Ce compte ne peut actuellement accéder à aucun contenu d’Eraser."
            : "Un administrateur doit encore attribuer un rôle Admin, MJ ou Joueur à ce compte."}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{account.email}</p>
        <Button variant="outline" className="mt-7" onClick={signOut}>
          <LogOut className="size-4" />
          Se déconnecter
        </Button>
      </section>
    </main>
  )
}
