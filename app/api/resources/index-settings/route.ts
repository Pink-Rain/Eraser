import { NextResponse } from "next/server"

import { deleteColumnPreset, deleteIndexView, listColumnPresets, listIndexViews, saveColumnPreset, saveIndexView } from "@/lib/index-settings"
import type { PresetColumn } from "@/lib/index-presets"
import type { ViewCondition } from "@/lib/index-views"
import { authorizedAccount } from "@/lib/server-auth"

const messages: Record<string, string> = {
  INDEX_VIEW_NAME_INVALID: "Donne un nom (60 caractères au plus) à l’onglet-fenêtre.",
  INDEX_VIEW_NOT_FOUND: "Cet onglet-fenêtre n’existe plus.",
  INDEX_PRESET_NAME_INVALID: "Donne un nom (60 caractères au plus) au preset.",
  INDEX_PRESET_EMPTY: "Ce preset n’a aucune colonne à garder (le Nom et l’ID sont déjà dans chaque onglet).",
  INDEX_PRESET_NOT_FOUND: "Ce preset n’existe plus.",
}

/** Onglets-fenêtres d'un index (`index`) et presets d'onglets, pour les MJ et administrateurs. */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const index = new URL(request.url).searchParams.get("index")?.trim() ?? ""
  try {
    const [views, presets] = await Promise.all([index ? listIndexViews(index) : Promise.resolve([]), listColumnPresets()])
    return NextResponse.json({ views, presets })
  } catch (error) {
    console.error("INDEX_SETTINGS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les onglets-fenêtres et les presets n’ont pas pu être chargés." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string; id?: string; index?: string; name?: string; source?: string; match?: string; conditions?: ViewCondition[]; description?: string; columns?: PresetColumn[] }
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
