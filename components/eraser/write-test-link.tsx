"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle } from "lucide-react"

/**
 * Le lien « Tester aussi l'écriture » du diagnostic des feuilles : le tableau affiché
 * reste visible pendant le nouveau test (plusieurs secondes), le lien montre qu'il tourne.
 */
export function WriteTestLink({ writeTest }: { writeTest: boolean }) {
  const router = useRouter()
  const [pendingFor, setPendingFor] = useState<boolean | null>(null)
  // Le test demandé est affiché : le lien redevient normal.
  const pending = pendingFor !== null && pendingFor !== writeTest
  const href = writeTest ? "/administration/google-drive" : "/administration/google-drive?test=ecriture"
  return <a
    href={href}
    aria-busy={pending}
    onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      setPendingFor(!writeTest)
      router.push(href)
    }}
    className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
  >
    {pending && <LoaderCircle className="size-3.5 animate-spin" />}
    {pending ? (writeTest ? "Test de lecture en cours…" : "Test d’écriture en cours…") : writeTest ? "Revenir au test de lecture seule" : "Tester aussi l’écriture"}
  </a>
}
