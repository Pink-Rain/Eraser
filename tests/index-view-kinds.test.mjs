import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const views = await vite.ssrLoadModule("/lib/index-view-layouts.ts");
const calendars = await vite.ssrLoadModule("/lib/calendars.ts");

test("les nouvelles vues et leurs réglages se relisent, rien d'autre", () => {
  const gallery = views.cleanViewLayout({ kind: "gallery", imageColumn: "Portrait", galleryShape: "square", gallerySize: "lg", captionOnHover: true, itemCard: "*" });
  assert.deepEqual(gallery, { kind: "gallery", imageColumn: "Portrait", galleryShape: "square", gallerySize: "lg", captionOnHover: true, itemCard: "*" });
  assert.deepEqual(views.cleanViewLayout({ kind: "timeline", dateColumn: "Date", timelineSide: "right" }), { kind: "timeline", dateColumn: "Date", timelineSide: "right" });
  assert.deepEqual(views.cleanViewLayout({ kind: "tree", parentColumn: "Pays", collapsed: true }), { kind: "tree", collapsed: true, parentColumn: "Pays" });
  assert.deepEqual(views.cleanViewLayout({ kind: "codex", showToc: true, detailFields: ["Description"] }), { kind: "codex", detailFields: ["Description"], showToc: true });
  // Valeurs inconnues écartées.
  assert.deepEqual(views.cleanViewLayout({ kind: "gallery", galleryShape: "ronde", gallerySize: 3, timelineSide: "haut" }), { kind: "gallery" });
  // Les anciennes vues gardent exactement leur forme.
  assert.deepEqual(views.cleanViewLayout({ kind: "list", compact: true, fields: ["Type"] }), { kind: "list", compact: true, fields: ["Type"] });
  // Une liste de cartes : la carte choisie se garde.
  assert.deepEqual(views.cleanViewLayout({ kind: "kanban", kanbanColumn: "État", itemCard: "CARTE-12" }), { kind: "kanban", kanbanColumn: "État", itemCard: "CARTE-12" });
});

test("les nouvelles vues sont des vues de « Modifier », avec leurs presets", () => {
  for (const kind of ["gallery", "timeline", "tree", "codex"]) {
    assert.ok(views.isPresentationKind(kind), kind);
    assert.ok(views.builtinViewPresets.some((preset) => preset.layout.kind === kind), kind);
  }
  for (const preset of views.builtinViewPresets) assert.ok(views.cleanViewPreset(preset), preset.id);
  const parsed = views.parseTabPresentations({ tree: { parentColumn: "Région" }, gallery: { kind: "list", imageColumn: "Image" } });
  assert.deepEqual(parsed, { tree: { kind: "tree", parentColumn: "Région" }, gallery: { kind: "gallery", imageColumn: "Image" } });
  // Un preset appliqué ailleurs : la colonne du parent suit si elle existe.
  assert.equal(views.fitLayoutToColumns({ kind: "tree", parentColumn: "pays" }, ["Nom", "Pays"]).parentColumn, "Pays");
  assert.equal(views.fitLayoutToColumns({ kind: "tree", parentColumn: "Pays" }, ["Nom"]).parentColumn, undefined);
});

test("l'arborescence range chaque ligne sous son parent, sans boucle ni perte", () => {
  const rows = [
    { name: "Ardalie", parent: "" },
    { name: "Valdor", parent: "ardalie" },
    { name: "Port-Brume", parent: "<b>Valdor</b>" },
    { name: "Bourg", parent: "Valdor, Ardalie" },
    { name: "Île perdue", parent: "Atlantide" },
    { name: "A", parent: "B" },
    { name: "B", parent: "A" },
    { name: "Moi", parent: "Moi" },
  ];
  const tree = views.rowTree(rows, (row) => row.name, (row) => row.parent);
  const names = (nodes) => nodes.map((node) => [node.row.name, names(node.children)]);
  assert.deepEqual(names(tree), [
    ["Ardalie", [["Valdor", [["Port-Brume", []], ["Bourg", []]]]]],
    ["Île perdue", []],
    ["A", [["B", []]]],
    ["Moi", []],
  ]);
  assert.equal(views.treeSize(tree[0]), 3);
  assert.equal(tree[0].children[0].children[0].depth, 2);
  // Chaque ligne apparaît une fois.
  const count = (nodes) => nodes.reduce((sum, node) => sum + 1 + count(node.children), 0);
  assert.equal(count(tree), rows.length);
});

test("la chronologie lit les dates du calendrier, puis les années seules", () => {
  const rows = [
    { name: "Couronnement", date: "12 mars 1023" },
    { name: "Fondation", date: "An 980" },
    { name: "Bataille", date: "1023-01-05" },
    { name: "Légende", date: "" },
    { name: "Rumeur", date: "un jour" },
  ];
  const { dated, undated } = views.timelineEntries(rows, (row) => row.date, (text) => calendars.parseCalendarDate(text, calendars.realCalendar));
  assert.deepEqual(dated.map((entry) => entry.row.name), ["Fondation", "Bataille", "Couronnement"]);
  assert.equal(dated[0].date.yearOnly, true);
  assert.deepEqual(undated.map((row) => row.name), ["Légende", "Rumeur"]);
});
