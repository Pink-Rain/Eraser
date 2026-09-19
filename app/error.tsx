"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function RootPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("PAGE_CLIENT_ERROR", error) }, [error])
  return (
    <main className="grid min-h-[70svh] place-items-center px-5">
      <div className="max-w-lg rounded-2xl border border-destructive/30 bg-card p-7 text-center shadow-sm">
        <h1 className="font-display text-2xl font-semibold">Impossible d’afficher cette page</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tes données sont conservées. Si Google Sheets ou Google Drive est momentanément indisponible ou lent à répondre,
          un message reste affiché ici au lieu d’un écran vide ou d’une erreur brute.
        </p>
        <Button type="button" className="mt-5" onClick={reset}>Réessayer</Button>
      </div>
    </main>
  )
}
