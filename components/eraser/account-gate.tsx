"use client"

import { useState } from "react"
import { Clock3, LoaderCircle, LogOut, RefreshCw, ShieldX } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AccountRecord } from "@/lib/auth-types"

export function AccountGate({ account }: { account: AccountRecord }) {
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState("")

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/connexion"
  }

  // Relit le compte auprès du serveur (sans cache) : si un administrateur a validé
  // l'accès, la page complète est rechargée pour ouvrir l'application.
  async function refresh() {
    setChecking(true)
    setNotice("")
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" })
      if (response.status === 401) {
        window.location.href = "/connexion"
        return
      }
      const payload = (await response.json().catch(() => ({}))) as { status?: string; role?: string | null }
      if (payload.status === "actif" && payload.role) {
        window.location.reload()
        return
      }
      setNotice(payload.status === "suspendu" ? "Ce compte est suspendu." : "Toujours en attente : aucun rôle n’a encore été attribué.")
    } catch {
      setNotice("Impossible de vérifier pour l’instant. Réessaie dans un moment.")
    }
    setChecking(false)
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
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={refresh} disabled={checking}>
            {checking ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Actualiser
          </Button>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="size-4" />
            Se déconnecter
          </Button>
        </div>
        <p className="mt-4 min-h-5 text-sm text-muted-foreground" role="status">{notice}</p>
      </section>
    </main>
  )
}
