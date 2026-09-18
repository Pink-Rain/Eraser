"use client"

import { BookOpen, ShieldCheck, UsersRound } from "lucide-react"

import { PageLabel, useShellData } from "@/components/eraser/app-shell"

const roleLabels = {
  admin: "Administrateur",
  mj: "Maître du jeu",
  joueur: "Joueur",
} as const

export function HomeShell() {
  const { characters, campaigns, viewRole } = useShellData()
  return (
    <PageLabel label="Accueil">
      <div className="flex w-full flex-1 flex-col px-5 py-9 sm:px-8 md:py-14">
        <section className="max-w-3xl">
          <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/75">
            <span className="h-px w-7 bg-primary/50" />
            Espace de campagne
          </div>
          <h1 className="font-display text-5xl font-semibold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl">
            Bienvenue dans <span className="text-primary">Eraser</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Ton point d’entrée vers tes personnages, leurs fiches et les données
            de campagne auxquelles ton rôle te donne accès.
          </p>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3" aria-label="Aperçu du compte">
          <article className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)]">
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/9 text-primary">
                <UsersRound className="size-5" />
              </div>
              <span className="font-display text-3xl">{viewRole === "mj" ? campaigns.length : characters.length}</span>
            </div>
            <h2 className="mt-5 font-medium">{viewRole === "mj" ? "Mes campagnes" : viewRole === "admin" ? "Administration" : "Mes personnages"}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {viewRole === "mj" ? "Seules les campagnes dont tu es MJ sont chargées ici." : viewRole === "admin" ? "Les outils globaux sont accessibles uniquement dans cette vue." : "Seuls les personnages reliés à ton compte sont chargés ici."}
            </p>
          </article>

          <article className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)]">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#52665c]/10 text-[#40564b]">
              <ShieldCheck className="size-5" />
            </div>
            <h2 className="mt-5 font-medium">Accès vérifié</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Vue {roleLabels[viewRole]} active, avec ses permissions propres.
            </p>
          </article>

          <article className="rounded-2xl border bg-card/90 p-5 shadow-[0_10px_35px_rgb(67_50_31/0.06)]">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#927640]/10 text-[#735a28]">
              <BookOpen className="size-5" />
            </div>
            <h2 className="mt-5 font-medium">Données reliées</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Les feuilles autorisées sont lues uniquement depuis le serveur.
            </p>
          </article>
        </section>
      </div>
    </PageLabel>
  )
}
