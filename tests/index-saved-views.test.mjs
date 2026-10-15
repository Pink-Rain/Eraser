import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const saved = await vite.ssrLoadModule("/lib/index-saved-views.ts");
const windows = await vite.ssrLoadModule("/lib/index-windows.ts");
const defaults = await vite.ssrLoadModule("/lib/index-window-defaults.ts");
const pages = await vite.ssrLoadModule("/lib/custom-pages.ts");
const presentations = await vite.ssrLoadModule("/lib/index-presentations.ts");

// Des onglets-fenêtres comme ceux du classeur « Eraser · Réglages des index ».
const userWindows = [
  { id: "f-runes", index: "weapon-modifiers", name: "Runes", source: "*", match: "toutes", conditions: [{ column: "Type", operator: "est", value: "Rune" }], position: 0 },
  { id: "f-epees", index: "objects", name: "Épées légendaires", source: "file1:12", match: "une", conditions: [{ column: "Nom", operator: "contient", value: "épée" }, { column: "Rareté", operator: "est", value: "Légendaire" }], position: 3 },
  { id: "f-tout", index: "places", name: "Tout", source: "Villes", match: "toutes", conditions: [], position: 1 },
  { id: "f-stats", index: "places", name: "Statistiques", source: "*", match: "toutes", conditions: [], position: 2, layout: { kind: "stats" } },
];

test("un onglet-fenêtre relu comme une vue revient tel quel", () => {
  for (const tabWindow of [...userWindows, ...defaults.builtinWindowsFor("class-spells"), ...defaults.builtinWindowsFor("creature-spells")]) {
    const view = saved.savedViewFromWindow(tabWindow);
    assert.equal(view.id, tabWindow.id, "même identifiant : les choix d'onglet enregistrés la retrouvent");
    assert.equal(view.kind, tabWindow.layout?.kind === "stats" ? "stats" : "table");
    assert.deepEqual(saved.windowFromSavedView(view), tabWindow, tabWindow.name);
  }
});

test("une vue filtre exactement les mêmes lignes que l'onglet-fenêtre", () => {
  const rows = [
    { Nom: "Épée de feu", Rareté: "Légendaire", Type: "Rune" },
    { Nom: "Bouclier", Rareté: "Commun", Type: "Matériau" },
    { Nom: "Dague", Rareté: "Légendaire", Type: "" },
    { Nom: "Lance", Rareté: "Rare", Type: "Passif" },
  ];
  for (const tabWindow of [...userWindows, ...defaults.builtinWindowsFor("class-spells")]) {
    const view = saved.savedViewFromWindow(tabWindow);
    for (const row of rows) {
      const cell = (column) => row[column] ?? "";
      assert.equal(saved.matchesSavedView(view, cell), windows.matchesFilter(tabWindow, cell), `${tabWindow.name} · ${row.Nom}`);
    }
  }
});

test("l'onglet stat garde ses anciennes statistiques ; une ancienne présentation reste ignorée", () => {
  const stat = { id: "s1", title: "Lieux par région", measure: "count", source: "*", conditions: [], rows: ["Région"], columns: [], form: "bars" };
  const legacy = { ...userWindows[3], layout: { kind: "stats", stats: [stat] } };
  const view = saved.savedViewFromWindow(legacy);
  assert.equal(view.stats?.length, 1);
  assert.deepEqual(saved.windowFromSavedView(view).layout.kind, "stats");
  // Une fenêtre qui portait un kanban (version précédente) : le kanban n'était déjà plus montré.
  const kanban = saved.savedViewFromWindow({ ...userWindows[0], layout: { kind: "kanban", kanbanColumn: "Type" } });
  assert.equal(kanban.kind, "table");
  assert.equal(saved.windowFromSavedView(kanban).layout, undefined);
});

test("un bloc « Vue d'index » relu comme une vue redonne les mêmes champs au serveur des pages", () => {
  const blocks = [
    { id: "b-own", type: "view", index: "npcs", tab: "Bibliothèque", kind: "kanban", heading: "Les PNJ par rang", layout: { kind: "kanban", kanbanColumn: "Rang" } },
    { id: "b-version", type: "view", index: "npcs", tab: "Bibliothèque", kind: "list", presetId: "vue:liste-courte" },
    { id: "b-preset", type: "view", index: "npcs", tab: "Bibliothèque", kind: "kanban", presetId: "eraser:kanban-narrow", cardId: "carte-2", where: { match: "une", conditions: [{ column: "Rang", operator: "est", value: "2" }] }, sort: { column: "Rang", desc: true } },
    { id: "b-cartes", type: "view", index: "places", tab: "Villes", kind: "cards", cardId: "c-ville", click: "/fiche/places/{ID}" },
    { id: "b-table", type: "view", index: "places", tab: "Villes", kind: "table", click: "-", where: { match: "toutes", conditions: [{ column: "Pays", operator: "est", value: "{Nom}" }] } },
  ].map((block) => pages.cleanBlock(block));
  const fields = ["kind", "layout", "presetId", "cardId", "where", "sort", "click"];
  for (const block of blocks) {
    const view = saved.savedViewFromBlock(block);
    const expected = Object.fromEntries(fields.filter((field) => block[field] !== undefined).map((field) => [field, block[field]]));
    assert.deepEqual(saved.blockFieldsFromSavedView(view), expected, block.id);
  }
});

test("une version nommée d'une présentation devient une vue qui garde cette version", () => {
  const tab = presentations.parseTabPresentations({ list: { kind: "list", compact: true }, named: [{ id: "liste-courte", name: "Liste courte", layout: { kind: "list", numbered: true } }] });
  const variant = presentations.namedPresentationsOf(tab, "list")[0];
  const view = saved.savedViewFromVariant("npcs", "Bibliothèque", variant, 4);
  assert.deepEqual(view, { id: "version-liste-courte", index: "npcs", name: "Liste courte", source: "Bibliothèque", kind: "list", shape: { from: "variant", id: "liste-courte" }, position: 4 });
  assert.deepEqual(saved.blockFieldsFromSavedView(view), { kind: "list", presetId: "vue:liste-courte" });
});

test("une vue enregistrée se relit à l'identique, et rien d'autre ne passe", () => {
  const views = [
    ...userWindows.map(saved.savedViewFromWindow),
    saved.savedViewFromBlock(pages.cleanBlock({ id: "b-own", type: "view", index: "npcs", tab: "Bibliothèque", kind: "kanban", layout: { kind: "kanban", kanbanColumn: "Rang" }, cardId: "c1", sort: { column: "Rang", desc: false }, click: "-" })),
    { id: "v-icone", index: "places", name: "Mes villes", icon: "castle", source: "Villes", kind: "gallery", shape: { from: "preset", id: "eraser:galerie" }, position: 5 },
  ];
  for (const view of views) assert.deepEqual(saved.cleanSavedView(JSON.parse(JSON.stringify(view))), view, view.name);
  // Illisible : sans identifiant, sans index, d'un genre inconnu.
  assert.equal(saved.cleanSavedView({ index: "places", kind: "list" }), null);
  assert.equal(saved.cleanSavedView({ id: "v1", kind: "list" }), null);
  assert.equal(saved.cleanSavedView({ id: "v1", index: "places", kind: "carrousel" }), null);
  // Une forme propre d'un autre genre que la vue, une condition inconnue, une adresse externe : écartées.
  const cleaned = saved.cleanSavedView({ id: "v1", index: "places", kind: "list", shape: { from: "own", layout: { kind: "kanban" } }, filter: { match: "toutes", conditions: [{ column: "Type", operator: "pirate", value: "x" }] }, click: "https://exemple.com" });
  assert.deepEqual(cleaned, { id: "v1", index: "places", name: "Vue", source: "*", kind: "list", position: 0 });
  // Une condition « catégorie de sort » (onglets prévus par Eraser) ne s'enregistre pas.
  assert.equal(saved.cleanSavedView(saved.savedViewFromWindow(defaults.builtinWindowsFor("class-spells")[1])).filter, undefined);
});

test("les vues d'un index se lisent dans l'ordre, sans doublon", () => {
  const list = saved.parseSavedViews([
    { id: "b", index: "places", kind: "table", position: 2 },
    { id: "a", index: "places", kind: "list", position: 1 },
    { id: "b", index: "places", kind: "kanban", position: 0 },
    "abîmée",
  ]);
  assert.deepEqual(list.map((view) => `${view.id}:${view.kind}`), ["a:list", "b:table"]);
});
