"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle } from "lucide-react"

/**
 * Une ancienne adresse qui a déménagé, paramètres compris (« ?dossier=… ») : lus par le
 * navigateur, le routeur rendant d'abord chaque page sans eux.
 */
export function AddressRedirect({ to, label }: { to: string; label: string }) {
  const router = useRouter()
  useEffect(() => { router.replace(`${to}${window.location.search}`) }, [router, to])
  return <div className="grid min-h-[40svh] place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label={label} /></div>
}
