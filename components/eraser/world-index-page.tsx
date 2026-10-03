import { Suspense, type ReactNode } from "react"

import { DeferredContentLoading } from "@/components/eraser/deferred-content-loading"
import { WorldIndexManager } from "@/components/eraser/world-index-manager"
import { worldIndexDefinitions, type BuiltinWorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndex, type WorldIndexData } from "@/lib/world-indexes"

async function IndexData({ indexKey }: { indexKey: BuiltinWorldIndexKey }) {
  const definition = worldIndexDefinitions[indexKey]
  let data: WorldIndexData | null = null
  let error = ""
  try {
    data = await getWorldIndex(indexKey)
  } catch (reason) {
    console.error("WORLD_INDEX_LOAD_FAILED", indexKey, reason instanceof Error ? reason.message : "UNKNOWN_ERROR")
    error = `La feuille « ${definition.sheetName} » n’a pas pu être chargée depuis Google Drive.`
  }
  return <WorldIndexManager indexKey={indexKey} initialData={data} initialError={error} />
}

/**
 * La page d'un index prévu par Eraser : son titre et son tableau, sur le moteur des index.
 * `aside` : un lien sous le titre (une page liée, une ancienne vue gardée).
 */
export function WorldIndexPage({ indexKey, aside }: { indexKey: BuiltinWorldIndexKey; aside?: ReactNode }) {
  const definition = worldIndexDefinitions[indexKey]
  return (
    <div className="w-full px-4 pt-4 sm:px-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Index</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{definition.title}</h1>
        </div>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      <Suspense fallback={<DeferredContentLoading variant="table" label="Chargement de l’index…" />}>
        <IndexData indexKey={indexKey} />
      </Suspense>
    </div>
  )
}
