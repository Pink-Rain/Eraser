import { NextResponse } from "next/server"

import { deleteColumnPreset, deleteIndexView, listColumnPresets, listIndexViews, saveColumnPreset, saveIndexView } from "@/lib/index-settings"
import { listIndexLayouts, saveIndexLayouts } from "@/lib/index-layouts-store"
import { parseIndexLayout } from "@/lib/index-layouts"
import type { PresetColumn } from "@/lib/index-presets"
import type { ViewCondition } from "@/lib/index-views"
import { authorizedAccount } from "@/lib/server-auth"

const messages: Record<string, string> = {
  INDEX_VIEW_NAME_INVALID: "Donne un nom (60 caractères au plus) à l’onglet-fenêtre.",
  INDEX_VIEW_NOT_FOUND: "Cet onglet-fenêtre n’existe plus.",
  INDEX_PRESET_NAME_INVALID: "Donne un nom (60 caractères au plus) au preset.",
  INDEX_PRESET_EMPTY: "Ce preset n’a aucune colonne à garder (le Nom et l’ID sont déjà dans chaque onglet).",
  INDEX_PRESET_NOT_FOUND: "Ce preset n’existe plus.",
  INDEX_LAYOUT_INVALID: "Cette mise en page n’a pas pu être lue.",
  INDEX_LAYOUTS_UNAVAILABLE: "Les mises en page se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  INDEX_LAYOUT_TOO_LARGE: "Cette mise en page est trop grande pour être enregistrée : retire quelques sections ou lignes.",
}

/** Onglets-fenêtres et mises en page d'un index (`index`), et presets d'onglets, pour les MJ et administrateurs. */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const index = new URL(request.url).searchParams.get("index")?.trim() ?? ""
  try {
    const [views, presets, layouts] = await Promise.all([index ? listIndexViews(index) : Promise.resolve([]), listColumnPresets(), index ? listIndexLayouts(index).catch(() => ({})) : Promise.resolve({})])
    return NextResponse.json({ views, presets, layouts })
  } catch (error) {
    console.error("INDEX_SETTINGS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les onglets-fenêtres et les presets n’ont pas pu être chargés." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string; id?: string; index?: string; name?: string; source?: string; match?: string; conditions?: ViewCondition[]; description?: string; columns?: PresetColumn[]; changes?: Array<{ tab?: unknown; form?: unknown; hover?: unknown }> }
    if (body.action === "save-layouts") {
      // Mise en page de la fiche et du survol, onglet par onglet ; vide : l'affichage automatique.
      const changes = (Array.isArray(body.changes) ? body.changes : []).map((change) => ({ tab: String(change.tab ?? ""), form: parseIndexLayout(change.form), hover: parseIndexLayout(change.hover) }))
      try {
        return NextResponse.json({ layouts: await saveIndexLayouts(String(body.index ?? ""), changes) })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_LAYOUTS_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "La mise en page n’a pas pu être enregistrée sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-view") {
      const id = await saveIndexView({ id: body.id, index: String(body.index ?? ""), name: String(body.name ?? ""), source: String(body.source ?? "*"), match: body.match === "une" ? "une" : "toutes", conditions: Array.isArray(body.conditions) ? body.conditions : [] })
      return NextResponse.json({ id, views: await listIndexViews(String(body.index ?? "")) })
    }
    if (body.action === "delete-view" && body.id) {
      await deleteIndexView(body.id)
      return NextResponse.json({ ok: true, views: body.index ? await listIndexViews(body.index) : [] })
    }
    if (body.action === "save-preset") {
      const id = await saveColumnPreset({ id: body.id, name: String(body.name ?? ""), description: body.description, columns: Array.isArray(body.columns) ? body.columns : [] })
      return NextResponse.json({ id, presets: await listColumnPresets() })
    }
    if (body.action === "delete-preset" && body.id) {
      await deleteColumnPreset(body.id)
      return NextResponse.json({ ok: true, presets: await listColumnPresets() })
    }
    throw new Error("INDEX_SETTINGS_INVALID")
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("INDEX_SETTINGS_SAVE_FAILED", code)
    return NextResponse.json({ error: messages[code] ?? "Le réglage n’a pas pu être enregistré dans Google Sheets." }, { status: 400 })
  }
}
