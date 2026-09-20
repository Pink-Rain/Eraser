"use client"

import dynamic from "next/dynamic"

// Leaflet and Trystero are already loaded lazily inside TabletopWorkspace, but the
// component itself (and its CSS) was still bundled and server-rendered for every
// visitor of these two routes. Loading it client-only keeps that weight off pages
// that don't need it and off the server render.
export const TabletopWorkspaceLazy = dynamic(
  () => import("@/components/eraser/tabletop-workspace-v2").then((module) => module.TabletopWorkspace),
  {
    ssr: false,
    loading: () => <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Chargement du tabletop…</div>,
  },
)
