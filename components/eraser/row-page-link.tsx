"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { rowPageHref } from "@/lib/custom-pages-rows"

type Template = { index: string; tab: string }

let templates: Promise<Template[]> | null = null

/** Les index dont les lignes ont une page (modèles publiés du créateur de pages), lus une fois. */
function loadTemplates() {
  if (!templates) templates = fetch("/api/pages/block-data?row-templates=1").then(async (response) => response.ok ? ((await response.json()) as { templates: Template[] }).templates : []).catch(() => { templates = null; return [] })
  return templates
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/**
 * « Page de la ligne » dans la fiche d'une ligne d'index, quand un modèle de page de ligne
 * existe pour son index (ou son onglet) : elle s'ouvre à son adresse stable /fiche/<index>/<ID>.
 */
export function RowPageLink({ index, tab, id }: { index: string; tab: string; id: string }) {
  const [found, setFound] = useState(false)
  useEffect(() => {
    let alive = true
    void loadTemplates().then((list) => { if (alive) setFound(list.some((template) => template.index === index && (!template.tab || fold(template.tab) === fold(tab)))) })
    return () => { alive = false }
  }, [index, tab])
  if (!found || !id) return null
  return <Button asChild size="sm" variant="outline"><Link href={rowPageHref(index, id)} prefetch={false}><FileText />Page de la ligne</Link></Button>
}
