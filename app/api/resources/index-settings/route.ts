import { NextResponse } from "next/server"

import { deleteColumnPreset, deleteIndexView, listColumnPresets, listIndexViews, saveColumnPreset, saveIndexView } from "@/lib/index-settings"
import { deleteLayoutPreset, listIndexLayouts, listLayoutPresets, saveIndexLayouts, saveLayoutPreset } from "@/lib/index-layouts-store"
import { parseIndexLayout, parseNamedLayouts } from "@/lib/index-layouts"
import { deleteCardPreset, listCardPresets, listIndexCards, saveCardPreset, saveIndexCards } from "@/lib/index-cards-store"
import { parseCardTemplate, parseTabCards } from "@/lib/index-cards"
import { cleanTabLocks } from "@/lib/index-locks"
import { listIndexLocks, saveIndexLocks } from "@/lib/index-locks-store"
import { deleteViewPreset, listIndexPresentations, listIndexStatsRecord, listViewPresets, saveIndexPresentations, saveIndexStats, saveViewPreset } from "@/lib/index-presentations-store"
import { cleanVersionMeta } from "@/lib/index-versions"
import { cleanPresentation, parseTabPresentations } from "@/lib/index-presentations"
import { listIndexSavedViews, removeIndexSavedView, saveIndexSavedView } from "@/lib/index-saved-views-store"
import type { PresetColumn } from "@/lib/index-presets"
import { savedViewUses } from "@/lib/custom-pages"
import { listCustomPages } from "@/lib/custom-pages-store"
import type { FilterCondition } from "@/lib/index-windows"
import { authorizedAccount } from "@/lib/server-auth"

const messages: Record<string, string> = {
  INDEX_VIEW_NAME_INVALID: "Donne un nom (60 caractères au plus) à l’onglet-fenêtre.",
  INDEX_VIEW_NOT_FOUND: "Cet onglet-fenêtre n’existe plus.",
  INDEX_VIEW_LAYOUT_TOO_LARGE: "Cet onglet est trop long pour sa case Google Sheets : supprime une statistique ou retire quelques conditions.",
  INDEX_PRESET_NAME_INVALID: "Donne un nom (60 caractères au plus) au preset.",
  INDEX_PRESET_EMPTY: "Ce preset n’a aucune colonne à garder (le Nom et l’ID sont déjà dans chaque onglet).",
  INDEX_PRESET_NOT_FOUND: "Ce preset n’existe plus.",
  INDEX_LAYOUT_INVALID: "Cette mise en page n’a pas pu être lue.",
  INDEX_LAYOUTS_UNAVAILABLE: "Les mises en page se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  INDEX_LAYOUT_TOO_LARGE: "Cette mise en page est trop grande pour être enregistrée : retire quelques sections ou lignes.",
  INDEX_CARDS_INVALID: "Ces cartes n’ont pas pu être lues.",
  INDEX_CARDS_UNAVAILABLE: "Les cartes se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  INDEX_CARDS_TOO_LARGE: "Les cartes de cet onglet sont trop grandes pour être enregistrées : retire une carte ou quelques blocs.",
  INDEX_LOCKS_UNAVAILABLE: "Les cadenas se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  INDEX_LOCKS_TOO_LARGE: "Trop d’usages écrits pour cet onglet : raccourcis-les.",
  INDEX_PRESENTATIONS_INVALID: "Ces vues n’ont pas pu être lues.",
  INDEX_PRESENTATIONS_UNAVAILABLE: "Les vues se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  INDEX_STATS_TOO_LARGE: "Trop de statistiques pour cet index : supprime-en une ou retire quelques conditions.",
  INDEX_PRESENTATIONS_TOO_LARGE: "Les vues de cet onglet sont trop grandes pour être enregistrées : retire quelques tuiles.",
  INDEX_SAVED_VIEW_INVALID: "Cette vue n’a pas pu être lue.",
  INDEX_SAVED_VIEWS_UNAVAILABLE: "Les vues se gardent sur le serveur partagé d’Eraser, qui n’est pas configuré ici.",
  INDEX_SAVED_VIEW_TOO_LARGE: "Cette vue est trop grande pour être enregistrée : retire quelques conditions ou réglages de sa forme.",
}

/** Onglets-fenêtres, mises en page et cartes d'un index (`index`), et presets, pour les MJ et administrateurs. */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const index = new URL(request.url).searchParams.get("index")?.trim() ?? ""
  try {
    const [views, presets, layouts, layoutPresets, cards, cardPresets, presentations, viewPresets, statsRecord, locks] = await Promise.all([
      index ? listIndexViews(index) : Promise.resolve([]),
      listColumnPresets(),
      index ? listIndexLayouts(index).catch(() => ({})) : Promise.resolve({}),
      listLayoutPresets().catch(() => []),
      index ? listIndexCards(index).catch(() => ({})) : Promise.resolve({}),
      listCardPresets().catch(() => []),
      index ? listIndexPresentations(index).catch(() => ({})) : Promise.resolve({}),
      listViewPresets().catch(() => []),
      index ? listIndexStatsRecord(index).catch(() => ({ stats: [], groups: [] })) : Promise.resolve({ stats: [], groups: [] }),
      index ? listIndexLocks(index) : Promise.resolve({}),
    ])
    // Les vues enregistrées (roadmap « Vues des index ») : celles du serveur partagé, et les
    // onglets-fenêtres déjà lus ci-dessus. Serveur injoignable : on le dit, sans repli silencieux.
    let savedViews: unknown[] = []
    let savedViewsUnavailable = false
    // Les pages qui montrent chaque vue (serveur partagé, copie de 15 s) : l'index prévient avant de la changer.
    let savedViewPages: ReturnType<typeof savedViewUses> = {}
    if (index) {
      try { savedViews = await listIndexSavedViews(index, views) } catch (error) {
        savedViewsUnavailable = true
        console.error("INDEX_SAVED_VIEWS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
      }
      savedViewPages = savedViewUses(await listCustomPages().catch(() => []), index)
    }
    return NextResponse.json({ views, presets, layouts, layoutPresets, cards, cardPresets, presentations, viewPresets, stats: statsRecord.stats, statGroups: statsRecord.groups, locks, savedViews, savedViewPages, ...(savedViewsUnavailable ? { savedViewsUnavailable: true } : {}) })
  } catch (error) {
    console.error("INDEX_SETTINGS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les onglets-fenêtres et les presets n’ont pas pu être chargés." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: string; id?: string; index?: string; name?: string; source?: string; match?: string; conditions?: FilterCondition[]; layout?: unknown; description?: string; columns?: PresetColumn[]; changes?: Array<{ tab?: unknown; form?: unknown; hover?: unknown }> }
    if (body.action === "save-saved-view" || body.action === "remove-saved-view") {
      // Les vues enregistrées : sur le serveur partagé ; la feuille des onglets-fenêtres ne change pas.
      try {
        if (body.action === "remove-saved-view") {
          await removeIndexSavedView(String(body.index ?? ""), String(body.id ?? ""))
          return NextResponse.json({ removed: String(body.id ?? "") })
        }
        return NextResponse.json({ savedView: await saveIndexSavedView((body as { view?: unknown }).view) })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_SAVED_VIEW_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "La vue n’a pas pu être enregistrée sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-layouts") {
      // Mise en page de la fiche et du survol, onglet par onglet ; vide : l'affichage automatique.
      const changes = (Array.isArray(body.changes) ? body.changes : []).map((change) => ({ tab: String(change.tab ?? ""), form: parseIndexLayout(change.form), hover: parseIndexLayout(change.hover), forms: parseNamedLayouts((change as { forms?: unknown }).forms), hovers: parseNamedLayouts((change as { hovers?: unknown }).hovers), formMain: cleanVersionMeta((change as { formMain?: unknown }).formMain), hoverMain: cleanVersionMeta((change as { hoverMain?: unknown }).hoverMain) }))
      try {
        return NextResponse.json({ layouts: await saveIndexLayouts(String(body.index ?? ""), changes) })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_LAYOUTS_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "La mise en page n’a pas pu être enregistrée sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-layout-preset" || body.action === "delete-layout-preset") {
      // Les presets de mise en page (fiche, survol) : sur le serveur partagé, comme les mises en page.
      try {
        const raw = body as { layout?: unknown; kind?: unknown }
        const id = body.action === "save-layout-preset"
          ? await saveLayoutPreset({ id: body.id, name: String(body.name ?? ""), kind: raw.kind === "hover" ? "hover" : "form", layout: parseIndexLayout(raw.layout) })
          : (await deleteLayoutPreset(String(body.id ?? "")), "")
        return NextResponse.json({ id, layoutPresets: await listLayoutPresets() })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_LAYOUT_PRESET_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Le preset de mise en page n’a pas pu être enregistré sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-presentations") {
      // Les vues (liste, kanban…) de chaque onglet ; `null` : l'onglet revient aux réglages d'office.
      const raw = body as { changes?: Array<{ tab?: unknown; presentations?: unknown }> }
      const changes = (Array.isArray(raw.changes) ? raw.changes : []).map((change) => ({ tab: String(change.tab ?? ""), presentations: change.presentations === null ? null : parseTabPresentations(change.presentations) }))
      try {
        return NextResponse.json({ presentations: await saveIndexPresentations(String(body.index ?? ""), changes) })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_PRESENTATIONS_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Les vues n’ont pas pu être enregistrées sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-stats") {
      try {
        // Les colonnes regroupées ne sont remplacées que si elles sont envoyées : une ancienne page ne les efface pas.
        const raw = body as { stats?: unknown; groups?: unknown }
        const saved = await saveIndexStats(String(body.index ?? ""), raw.stats, Array.isArray(raw.groups) ? raw.groups : undefined)
        return NextResponse.json({ stats: saved.stats, statGroups: saved.groups })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_STATS_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Les statistiques n’ont pas pu être enregistrées sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-view-preset" || body.action === "delete-view-preset") {
      try {
        const raw = body as { layout?: unknown }
        const id = body.action === "save-view-preset"
          ? await saveViewPreset({ id: body.id, name: String(body.name ?? ""), layout: cleanPresentation(raw.layout) ?? null })
          : (await deleteViewPreset(String(body.id ?? "")), "")
        return NextResponse.json({ id, viewPresets: await listViewPresets() })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_VIEW_PRESET_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Le preset de vue n’a pas pu être enregistré sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-locks") {
      // Les cadenas des colonnes de chaque onglet ; `null` : plus aucun réglage dans l'onglet.
      const raw = body as { changes?: Array<{ tab?: unknown; locks?: unknown }> }
      const changes = (Array.isArray(raw.changes) ? raw.changes : []).map((change) => ({ tab: String(change.tab ?? ""), locks: change.locks === null ? null : cleanTabLocks(change.locks) }))
      try {
        return NextResponse.json({ locks: await saveIndexLocks(String(body.index ?? ""), changes) })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_LOCKS_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Les cadenas n’ont pas pu être enregistrés sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-cards") {
      // Les cartes de chaque onglet ; `null` : l'onglet revient aux cartes d'Eraser.
      const raw = body as { changes?: Array<{ tab?: unknown; cards?: unknown }> }
      const changes = (Array.isArray(raw.changes) ? raw.changes : []).map((change) => ({ tab: String(change.tab ?? ""), cards: change.cards === null ? null : parseTabCards(change.cards) ?? { cards: [] } }))
      try {
        return NextResponse.json({ cards: await saveIndexCards(String(body.index ?? ""), changes) })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_CARDS_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Les cartes n’ont pas pu être enregistrées sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-card-preset" || body.action === "delete-card-preset") {
      try {
        const raw = body as { card?: unknown }
        const id = body.action === "save-card-preset"
          ? await saveCardPreset({ id: body.id, name: String(body.name ?? ""), card: parseCardTemplate(raw.card) })
          : (await deleteCardPreset(String(body.id ?? "")), "")
        return NextResponse.json({ id, cardPresets: await listCardPresets() })
      } catch (error) {
        const code = error instanceof Error ? error.message : ""
        console.error("INDEX_CARD_PRESET_SAVE_FAILED", code)
        return NextResponse.json({ error: messages[code] ?? "Le preset de carte n’a pas pu être enregistré sur le serveur partagé d’Eraser." }, { status: 400 })
      }
    }
    if (body.action === "save-view") {
      const id = await saveIndexView({ id: body.id, index: String(body.index ?? ""), name: String(body.name ?? ""), source: String(body.source ?? "*"), match: body.match === "une" ? "une" : "toutes", conditions: Array.isArray(body.conditions) ? body.conditions : [], layout: body.layout })
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
