"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowUpRight, CircleMinus, LoaderCircle, MapPin, Plus, Search } from "lucide-react"
import Link from "next/link"

import { forgetWorldIndexData, loadWorldIndexData, useWorldIndexVersion, type LoadedWorldIndex } from "@/components/eraser/index-cells"
import { RevealToggle } from "@/components/eraser/session-reveal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { SessionPlace } from "@/lib/campaign-sessions"
import { announceWorldIndexChange } from "@/lib/world-index-events"

type IndexedPlace = SessionPlace & { type: string }

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim()
const plain = (value: string | undefined) => (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

/** Les lieux de tous les onglets de l'index : leur identifiant (sinon leur nom), leur onglet, leur type. */
function placesOf(data: LoadedWorldIndex | null): IndexedPlace[] {
  return (data?.tables ?? []).flatMap((table) => {
    const column = (name: string) => table.headers.findIndex((header) => fold(header) === name)
    const [nameAt, idAt, typeAt] = [column("nom"), column("id"), column("type")]
    if (nameAt < 0) return []
    return table.rows.flatMap((row) => {
      const name = plain(row.values[nameAt])
      if (!name) return []
      const id = idAt >= 0 ? plain(row.values[idAt]) : ""
      return [{ id: id || `nom:${fold(name)}`, name, tab: table.tabName, type: typeAt >= 0 ? plain(row.values[typeAt]) : "" }]
    })
  })
}

/**
 * Les lieux de la session, pris dans l'Index des lieux : on cherche, on lie. Un nom absent de
 * l'index s'y ajoute d'ici (dans l'onglet choisi), puis se lie à la session.
 */
export function SessionPlaces({ places, onAdd, onRemove }: { places: SessionPlace[]; onAdd: (place: SessionPlace) => void; onRemove: (place: SessionPlace) => void }) {
  const version = useWorldIndexVersion("places")
  const [loaded, setLoaded] = useState<{ version: number; places: IndexedPlace[]; failed: boolean } | null>(null)
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let alive = true
    void loadWorldIndexData("places").then((data) => { if (alive) setLoaded({ version, places: placesOf(data), failed: data === null }) })
    return () => { alive = false }
  }, [version])
  const index = useMemo(() => loaded?.places ?? [], [loaded])
  const tabs = useMemo(() => [...new Set(index.map((place) => place.tab))], [index])
  const chosenTab = tab || tabs.find((candidate) => fold(candidate) === "villes") || tabs[0] || "Villes"
  const linked = new Set(places.map((place) => place.id))
  const wanted = fold(query)
  const matches = wanted ? index.filter((place) => !linked.has(place.id) && fold(place.name).includes(wanted)).sort((left, right) => Number(!fold(left.name).startsWith(wanted)) - Number(!fold(right.name).startsWith(wanted)) || left.name.localeCompare(right.name, "fr")).slice(0, 8) : []
  const exact = index.find((place) => fold(place.name) === wanted)
  const byId = new Map(index.map((place) => [place.id, place]))

  function link(place: IndexedPlace) {
    onAdd({ id: place.id, name: place.name, tab: place.tab })
    setQuery(""); setError("")
  }

  async function createInIndex() {
    const name = query.replace(/\s+/g, " ").trim()
    if (!name || creating) return
    setCreating(true); setError("")
    try {
      const response = await fetch("/api/resources/world-indexes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ensure", key: "places", tabName: chosenTab, name }) })
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "Le lieu n’a pas pu être ajouté à l’index.")
      // Relu pour connaître son identifiant (donné par l'index à la création).
      forgetWorldIndexData("places")
      const fresh = placesOf(await loadWorldIndexData("places"))
      setLoaded({ version, places: fresh, failed: false })
      announceWorldIndexChange(["places"])
      const created = fresh.find((place) => fold(place.name) === fold(name))
      if (!created) throw new Error("Le lieu a été ajouté à l’index mais n’a pas pu être relu : cherche-le dans un instant.")
      link(created)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le lieu n’a pas pu être ajouté à l’index.")
    } finally {
      setCreating(false)
    }
  }

  return <div className="grid gap-3">
    {places.length > 0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{places.map((place) => {
      const known = byId.get(place.id)
      return <article key={place.id} className="flex items-center gap-3 rounded-2xl border bg-card/75 px-3 py-2.5 shadow-sm">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="size-4" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate font-display text-base font-semibold">{known?.name ?? place.name}</span><span className="block truncate text-[11px] text-muted-foreground">{[known?.type, known?.tab ?? place.tab].filter(Boolean).join(" · ") || "Index des lieux"}{loaded && !loaded.failed && !known && " · plus dans l’index"}</span></span>
        <RevealToggle kind="place" id={place.id} name={place.name} />
        <Button asChild size="icon-sm" variant="ghost" aria-label={`Ouvrir ${place.name} dans l’Index des lieux`} title="Ouvrir dans l’Index des lieux"><Link href={`/ressources/index-des-lieux?q=${encodeURIComponent(place.name)}`} prefetch={false}><ArrowUpRight /></Link></Button>
        <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Retirer ${place.name} de la session`} title="Retirer de la session" onClick={() => onRemove(place)}><CircleMinus /></Button>
      </article>
    })}</div>}
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={query} onChange={(event) => { setQuery(event.target.value); setError("") }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (matches[0]) link(matches[0]); else if (!exact && wanted) void createInIndex() } }} placeholder={loaded ? "Chercher un lieu de l’Index des lieux…" : "Lecture de l’Index des lieux…"} aria-label="Chercher un lieu" className="pl-9" disabled={!loaded} />
    </div>
    {wanted && <div className="rounded-xl border bg-background/60 p-1.5">
      {matches.map((place) => <button key={place.id} type="button" onClick={() => link(place)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"><MapPin className="size-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate font-medium">{place.name}</span><span className="shrink-0 text-[11px] text-muted-foreground">{[place.type, place.tab].filter(Boolean).join(" · ")}</span><Plus className="size-3.5 shrink-0" /></button>)}
      {exact && linked.has(exact.id) && <p className="px-2.5 py-2 text-xs text-muted-foreground">« {exact.name} » est déjà dans la session.</p>}
      {!exact && <div className="flex flex-wrap items-center gap-2 border-t px-2.5 pt-2 first:border-t-0 first:pt-1">
        <span className="text-xs text-muted-foreground">Pas dans l’index :</span>
        <NativeSelect value={chosenTab} onChange={(event) => setTab(event.target.value)} aria-label="Onglet de l’Index des lieux" className="h-8 py-0 text-xs">{(tabs.length ? tabs : [chosenTab]).map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect>
        <Button type="button" size="sm" variant="outline" disabled={creating} onClick={() => void createInIndex()}>{creating ? <LoaderCircle className="animate-spin" /> : <Plus />}Ajouter « {query.trim()} » à l’index</Button>
      </div>}
    </div>}
    {loaded?.failed && <p className="text-xs text-amber-600 dark:text-amber-400">L’Index des lieux n’a pas pu être lu : actualise dans un instant.</p>}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
}
