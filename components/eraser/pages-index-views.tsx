"use client"

import { useMemo, useState } from "react"
import { Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { IndexEditor } from "@/components/eraser/index-editor"
import { useIndexSettings } from "@/components/eraser/index-windows"
import { PageSearchQuery, PageViewBlock } from "@/components/eraser/page-index-block"
import { newBlock, type ViewBlock, type ViewBlockKind } from "@/lib/custom-pages"
import { lockedPolicy, type IndexEditorModel } from "@/lib/index-schema-shared"
import { PAGES_INDEX, PAGES_INDEX_TITLE, PAGES_TAB, pagesIndexColumns, pagesIndexHeaders, type PagesIndexRow } from "@/lib/pages-index-shared"

/**
 * L'Index des pages vu par le moteur des index : les pages (celles de l'atelier et celles
 * d'Eraser) en cartes, en liste, en galerie… avec leur survol, comme les lignes de n'importe quel
 * index. « Modifier l'affichage » règle leurs cartes, leurs survols et leurs vues ; les mêmes
 * se retrouvent dans un bloc Vue d'index (index « Pages ») : un menu, une galerie de règles.
 */

const LOCK = "Les colonnes de l’index des pages viennent des pages elles-mêmes : un titre, une icône ou une description se changent dans l’atelier."

/** Le modèle de l'éditeur : colonnes en lecture, seuls l'affichage (cartes, survol, vues) se règle. */
function pagesEditorModel(): IndexEditorModel {
  return {
    family: "world",
    key: PAGES_INDEX,
    title: PAGES_INDEX_TITLE,
    tabs: [{
      name: PAGES_TAB,
      columns: pagesIndexColumns().map((column) => ({ ...column, policy: lockedPolicy([LOCK], "L’affichage : cartes, survol et vues.") })),
      remove: false,
      removeReason: "L’index des pages n’a qu’un onglet.",
      rename: false,
      renameReason: "L’onglet des pages garde son nom.",
      addColumns: false,
      addColumnsReason: LOCK,
    }],
    addTabs: false,
    addTabsReason: "L’index des pages n’a qu’un onglet.",
    relationTargets: [],
  }
}

export const pageViewKinds: Array<{ value: Exclude<ViewBlockKind, "table">; label: string }> = [
  { value: "cards", label: "Cartes" },
  { value: "list", label: "Liste" },
  { value: "gallery", label: "Galerie" },
  { value: "codex", label: "Codex" },
  { value: "master-detail", label: "Maître-détail" },
  { value: "kanban", label: "Kanban" },
  { value: "tree", label: "Arborescence" },
  { value: "timeline", label: "Chronologie" },
]

export function PagesIndexView({ kind, query, rows }: { kind: Exclude<ViewBlockKind, "table">; query: string; rows: PagesIndexRow[] }) {
  const settings = useIndexSettings(PAGES_INDEX)
  const [editing, setEditing] = useState(false)
  // Après « Modifier l'affichage », la vue relit ses cartes et ses formes.
  const [version, setVersion] = useState(0)
  const block = useMemo<ViewBlock>(() => ({ ...(newBlock("view", "b-index-pages") as ViewBlock), index: PAGES_INDEX, tab: PAGES_TAB, kind }), [kind])
  const preview = useMemo(() => ({ [PAGES_TAB]: rows.slice(0, 40).map((row) => Object.fromEntries(pagesIndexHeaders.map((header, at) => [header, [row.title, row.description, row.icon, row.image, row.section, row.address, row.visibility, row.status, row.origin, row.updated, row.id][at] ?? ""]))) }), [rows])
  const optionsOf = (_tab: string, header: string) => (pagesIndexColumns().find((column) => column.header === header)?.spec.options ?? []).map((option) => ({ value: option.value, color: option.color }))
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
      <span>Les pages telles que les lecteurs les voient (publiées), celles de l’atelier et celles d’Eraser au même rang. Un bloc Vue d’index « Pages » les montre pareil.</span>
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}><Settings2 />Modifier l’affichage</Button>
    </div>
    <PageSearchQuery query={query}>
      <PageViewBlock key={`${kind}:${version}`} block={block} source={{ direct: true }} />
    </PageSearchQuery>
    {editing && <IndexEditor
      model={pagesEditorModel()}
      open
      title="Modifier l’affichage des pages"
      intro="Les cartes, le survol et les vues des pages. Les colonnes viennent des pages : elles se changent dans l’atelier."
      initialMode={kind === "cards" ? "cards" : `view:${kind}`}
      initialTab={PAGES_TAB}
      onClose={() => setEditing(false)}
      onApply={() => { setEditing(false); setVersion((value) => value + 1) }}
      layouts={settings.layouts}
      onSaveLayouts={async (changes) => { await settings.saveLayouts(changes); setVersion((value) => value + 1) }}
      cardsIndex={PAGES_INDEX}
      cards={settings.cards}
      onSaveCards={async (changes) => { await settings.saveCards(changes); setVersion((value) => value + 1) }}
      presentations={settings.presentations}
      onSavePresentations={async (changes) => { await settings.savePresentations(changes); setVersion((value) => value + 1) }}
      viewPresets={settings.viewPresets}
      onSaveViewPreset={settings.saveViewPreset}
      onDeleteViewPreset={settings.deleteViewPreset}
      sampleRows={preview}
      previewRows={preview}
      optionsOf={optionsOf}
    />}
  </div>
}
