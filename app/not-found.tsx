"use client"

import Link from "next/link"

/**
 * Une page introuvable, dans l'appli : de quoi revenir en arrière ou à l'accueil. La page
 * brute par défaut n'avait ni menu ni retour, et l'application de bureau restait bloquée.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-5">
      <div className="max-w-lg rounded-2xl border bg-card p-7 text-center shadow-sm">
        <h1 className="font-display text-2xl font-semibold">Cette page est introuvable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Elle a peut-être été supprimée ou déplacée. Tes données ne sont pas touchées.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")} className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Revenir en arrière</button>
          <Link href="/" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Accueil</Link>
        </div>
      </div>
    </main>
  )
}
