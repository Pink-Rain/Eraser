import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les vues enregistrées sur le serveur partagé (lib/index-saved-views-store.ts), avec un serveur
// partagé en mémoire. Les onglets-fenêtres de la feuille sont une copie, jamais modifiée.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^@\/lib\/shared-store$/, replacement: `${root}tests/fakes/shared-store.ts` },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); });
const shared = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");
const store = await vite.ssrLoadModule("/lib/index-saved-views-store.ts");
const saved = await vite.ssrLoadModule("/lib/index-saved-views.ts");

beforeEach(() => { shared.reset(); });

// Une copie des onglets-fenêtres d'un index, comme dans le classeur « Eraser · Réglages des index ».
const windowsOf = (index) => [
  { id: `${index}-runes`, index, name: "Runes", source: "*", match: "toutes", conditions: [{ column: "Type", operator: "est", value: "Rune" }], position: 0 },
  { id: `${index}-materiaux`, index, name: "Matériaux", source: "*", match: "toutes", conditions: [{ column: "Type", operator: "est", value: "Matériau" }], position: 1 },
  { id: `${index}-stats`, index, name: "Statistiques", source: "*", match: "toutes", conditions: [], position: 2, layout: { kind: "stats" } },
];
const names = (views) => views.map((view) => view.name);

test("sans rien d'enregistré, les vues sont exactement les onglets-fenêtres d'aujourd'hui", async () => {
  const windows = windowsOf("vide");
  assert.deepEqual(await store.listIndexSavedViews("vide", windows), windows.map(saved.savedViewFromWindow));
});

test("migration sur une copie : progressive, la feuille jamais modifiée, et réversible", async () => {
  const windows = windowsOf("copie");
  const before = structuredClone(windows);
  const [runes] = await store.listIndexSavedViews("copie", windows);
  // Une vue reprise d'un onglet-fenêtre, modifiée : elle le remplace à l'affichage.
  await store.saveIndexSavedView({ ...runes, name: "Runes anciennes", sort: { column: "Rang", desc: true } });
  // Un onglet-fenêtre retiré ne revient pas.
  await store.removeIndexSavedView("copie", "copie-materiaux");
  // Une vue nouvelle, en kanban.
  await store.saveIndexSavedView({ id: "copie-kanban", index: "copie", name: "Par rareté", source: "*", kind: "kanban", position: 5 });
  // Pendant ce temps, une installation pas encore à jour crée un onglet-fenêtre dans la feuille.
  const later = [...windows, { id: "copie-armes", index: "copie", name: "Armes", source: "*", match: "toutes", conditions: [], position: 3 }];
  const views = await store.listIndexSavedViews("copie", later);
  assert.deepEqual(names(views), ["Runes anciennes", "Statistiques", "Armes", "Par rareté"]);
  assert.deepEqual(views[0].sort, { column: "Rang", desc: true });
  assert.deepEqual(windows, before, "la copie des onglets-fenêtres n'a pas bougé");
  // Retour en arrière : tout ce que garde le serveur partagé pour l'index s'efface.
  await store.forgetIndexSavedViews("copie");
  assert.deepEqual(await store.listIndexSavedViews("copie", windows), windows.map(saved.savedViewFromWindow));
});

test("rien d'autre n'est touché : une seule portée, une entrée par vue, aucun autre index", async () => {
  await store.saveIndexSavedView({ id: "v1", index: "lieux", name: "Villes", source: "Villes", kind: "list", position: 0 });
  await store.saveIndexSavedView({ id: "v1", index: "peuples", name: "Elfes", source: "*", kind: "table", position: 0 });
  assert.deepEqual([...shared.store.records.keys()], ["index-saved-views"]);
  assert.deepEqual([...shared.store.records.get("index-saved-views").keys()].sort(), ["lieux::v1", "peuples::v1"]);
  assert.deepEqual(names(await store.listIndexSavedViews("lieux", [])), ["Villes"]);
  // Une entrée rangée sous un autre index que le sien est écartée.
  await shared.writeSharedRecord("index-saved-views", "lieux::v2", JSON.stringify({ id: "v2", index: "peuples", name: "Intruse", source: "*", kind: "table", position: 1 }));
  assert.deepEqual(names(await store.listStoredSavedViews("lieux", true)), ["Villes"]);
  // Les onglets-fenêtres d'un autre index ne s'invitent pas.
  assert.deepEqual(names(await store.listIndexSavedViews("lieux", windowsOf("ailleurs"))), ["Villes"]);
});

test("une vue prévue par Eraser, illisible ou trop grande ne s'enregistre pas", async () => {
  await assert.rejects(store.saveIndexSavedView({ id: "eraser-actifs", index: "class-spells", name: "Actifs", source: "*", kind: "table", position: -3, builtin: true }), /INDEX_SAVED_VIEW_INVALID/);
  await assert.rejects(store.saveIndexSavedView({ id: "x", kind: "table" }), /INDEX_SAVED_VIEW_INVALID/);
  const tiles = Array.from({ length: 24 }, () => ({ kind: "text", text: "x".repeat(1500) }));
  await assert.rejects(store.saveIndexSavedView({ id: "grande", index: "lieux", name: "Grande", source: "Villes", kind: "dashboard", shape: { from: "own", layout: { kind: "dashboard", tiles } }, position: 0 }), /INDEX_SAVED_VIEW_TOO_LARGE/);
  assert.equal(shared.store.records.get("index-saved-views"), undefined);
});

test("au regroupement des index d'objets, les vues enregistrées suivent leurs tableaux", async () => {
  await store.saveIndexSavedView({ id: "o1", index: "objects", name: "Épées", source: "fileA:1", kind: "table", position: 0 });
  await store.saveIndexSavedView({ id: "o2", index: "objects", name: "Toutes", source: "*", kind: "table", position: 1 });
  assert.equal(await store.remapIndexSavedViewSources("objects", new Map([["fileA:1", "merged:7"]])), 1);
  const views = await store.listIndexSavedViews("objects", []);
  assert.deepEqual(views.map((view) => `${view.id}:${view.source}`), ["o1:merged:7", "o2:*"]);
});
