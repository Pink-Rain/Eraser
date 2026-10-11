"use client"

import { usePathname } from "next/navigation"

import { PageSkeleton } from "@/components/eraser/deferred-content-loading"
import { skeletonFor } from "@/components/eraser/page-transition"

/**
 * Le `loading.tsx` de chaque route : le squelette de la page qui arrive, le même que celui
 * de la navigation. Sa présence compte surtout pour le serveur : sans frontière de
 * chargement, le routeur rend chaque page deux fois (un rendu « à blanc » pour détecter une
 * redirection, puis le vrai) — toutes ses lectures et tout son calcul en double. Avec elle,
 * la page est rendue une fois et la coque s'affiche avant que ses données soient là.
 */
export function RouteLoading() {
  const pathname = usePathname()
  const { variant, eyebrow } = skeletonFor(pathname)
  return <PageSkeleton variant={variant} eyebrow={eyebrow} />
}
