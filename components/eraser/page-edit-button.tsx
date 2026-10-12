"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { LoaderCircle, PenLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { studioHref } from "@/lib/custom-pages"
import { isForbiddenReplacement, matchesReplacement, replaceableRoutes } from "@/lib/page-replacements"

/**
 * « Modifier la page », dans l'en-tête, en vue administrateur : ouvre l'atelier du créateur de
 * pages sur la page affichée. Une page de l'atelier (ou une page d'Eraser déjà reprise) s'ouvre
 * directement ; une page d'Eraser pas encore reprise est d'abord adoptée (sa page de
 * remplacement, en brouillon), puis l'atelier s'ouvre. Les pages d'index n'ont pas ce bouton :
 * elles se modifient avec « Modifier » du moteur des index.
 */
export function PageEditButton({ pathname, pageId }: { pathname: string; pageId: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (pageId) return <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex" title="Modifier cette page dans l’atelier"><Link href={studioHref(pageId)} prefetch={false}><PenLine />Modifier la page</Link></Button>
  if (!pathname || isForbiddenReplacement(pathname)) return null
  const route = replaceableRoutes.find((candidate) => matchesReplacement(candidate.path, pathname))
  if (!route) return null

  async function adopt() {
    setBusy(true); setError("")
    const response = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adopt", path: route!.path }) }).catch(() => null)
    const payload = (await response?.json().catch(() => ({})) ?? {}) as { page?: { id: string }; error?: string }
    if (!response?.ok || !payload.page) { setError(payload.error || "Eraser ne répond pas : réessaie dans un instant."); setBusy(false); return }
    router.push(studioHref(payload.page.id))
  }

  return <Button type="button" size="sm" variant="outline" className="hidden sm:inline-flex" disabled={busy} onClick={() => void adopt()} title={error || `Reprendre « ${route.label} » dans l’atelier pour la modifier`}>
    {busy ? <LoaderCircle className="animate-spin" /> : <PenLine />}Modifier la page
  </Button>
}
