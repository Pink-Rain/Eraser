"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle } from "lucide-react"

import { ATELIER_HREF, studioHref } from "@/lib/custom-pages"

/** L'ancienne adresse « /pages/atelier?id=… » mène à l'atelier de cette page (extension Eraser Page) ; sans identifiant, à « Nouvelle page ». */
export function StudioRedirect() {
  const router = useRouter()
  const query = useSearchParams()
  const id = query.get("id") ?? ""
  const section = query.get("section") ?? ""
  useEffect(() => {
    if (id) { router.replace(studioHref(id)); return }
    const next = new URLSearchParams({ nouvelle: "1" })
    if (section) next.set("section", section)
    router.replace(`${ATELIER_HREF}?${next.toString()}`)
  }, [id, router, section])
  return <div className="grid min-h-[40svh] place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Ouverture de l’atelier" /></div>
}
