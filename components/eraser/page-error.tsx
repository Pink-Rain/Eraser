"use client"

import { startTransition, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Le dernier essai automatique, par page : jamais plus d'un par minute (pas de boucle). */
const autoRetriedAt = new Map<string, number>()
const AUTO_RETRY_SECONDS = 10

/**
 * Une page qui n'a pas pu se charger. Le plus souvent, Google Sheets a refusé parce que
 * toute la table ouvrait la même page au même moment : la page se relit d'elle-même une
 * fois, quelques secondes plus tard. « Réessayer » relit vraiment les données (avant, il
 * ne faisait que réafficher la même erreur).
 */
export function PageError({ error, reset, title, label }: { error: Error & { digest?: string }; reset: () => void; title: string; label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [retrying, setRetrying] = useState(false)
  const [countdown, setCountdown] = useState(() => Date.now() - (autoRetriedAt.get(pathname) ?? 0) > 60_000 ? AUTO_RETRY_SECONDS : 0)

  useEffect(() => { console.error(label, error) }, [error, label])

  function retry() {
    setRetrying(true)
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => {
      if (countdown > 1) { setCountdown(countdown - 1); return }
      setCountdown(0)
      autoRetriedAt.set(pathname, Date.now())
      retry()
    }, 1_000)
    return () => window.clearTimeout(timer)
  // `retry` ne dépend que du routeur et de reset, stables pendant l'affichage de l'erreur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, pathname])

  return (
    <main className="grid min-h-[70svh] place-items-center px-5">
      <div className="max-w-lg rounded-2xl border border-destructive/30 bg-card p-7 text-center shadow-sm">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tes données sont conservées. Le plus souvent, Google Sheets est très sollicité, par exemple quand toute la table
          ouvre la même page au même moment.
        </p>
        {countdown > 0 && <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Nouvel essai automatique dans {countdown} s…</p>}
        <Button type="button" className="mt-5" disabled={retrying} onClick={() => { setCountdown(0); retry() }}>{retrying ? <LoaderCircle className="animate-spin" /> : null}Réessayer</Button>
      </div>
    </main>
  )
}
