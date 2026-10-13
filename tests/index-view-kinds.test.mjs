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

test("les réglages propres à chaque vue se relisent (icônes, couleurs, colonnes du kanban, galerie libre, chronologie, arbre, codex)", () => {
  const list = views.cleanViewLayout({ kind: "list", numbered: true, alphabet: true, iconColumn: "Icône", itemIcon: "skull", badgeColumn: "Rang", fields: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], look: { surface: "zebra", color: "#397f88", sectionIcon: "flag", radius: "lg", shadow: true, titleCaps: true, fieldColor: "accent" } });
  assert.deepEqual(list, { kind: "list", fields: ["A", "B", "C", "D", "E", "F", "G", "H"], iconColumn: "Icône", itemIcon: "skull", badgeColumn: "Rang", numbered: true, alphabet: true, look: { surface: "zebra", radius: "lg", shadow: true, titleCaps: true, fieldColor: "accent", color: "#397f88", sectionIcon: "flag" } });
  const kanban = views.cleanViewLayout({ kind: "kanban", kanbanColumn: "État", laneCollapse: true, lanes: [{ value: "En cours", label: "WIP", color: "#b3261e", icon: "⚔️", limit: 3 }, { value: "Fini", hidden: true }, { value: "" }, { value: "Rien" }] });
  assert.deepEqual(kanban.lanes, [{ value: "En cours", label: "WIP", color: "#b3261e", icon: "⚔️", limit: 3 }, { value: "Fini", hidden: true }]);
  assert.equal(kanban.laneCollapse, true);
  const master = views.cleanViewLayout({ kind: "master-detail", masterSide: "right", detailColumns: 3, detailImage: "banner" });
  assert.deepEqual(master, { kind: "master-detail", masterSide: "right", detailColumns: 3, detailImage: "banner" });
  const calendar = views.cleanViewLayout({ kind: "calendar", dateColumn: "Date", hideSeasons: true, monthStyle: "season", maxPerDay: 40 });
  assert.deepEqual(calendar, { kind: "calendar", dateColumn: "Date", hideSeasons: true, monthStyle: "season", maxPerDay: 12 });
  const dashboard = views.cleanViewLayout({ kind: "dashboard", tileColumns: 6, tiles: [{ kind: "count", icon: "users", unit: "PNJ", size: "lg", note: "dans le monde", color: "#285f8f" }, { kind: "sum", column: "Prix", unit: "PO" }] });
  assert.deepEqual(dashboard, { kind: "dashboard", tiles: [{ kind: "count", color: "#285f8f", icon: "users", unit: "PNJ", size: "lg", note: "dans le monde" }, { kind: "sum", column: "Prix", unit: "PO" }], tileColumns: 6 });
  const gallery = views.cleanViewLayout({ kind: "gallery", imageColumn: "Portrait", galleryWidthRem: 11.25, galleryRatio: 1.333, galleryRadiusPx: 500, galleryFit: "contain", galleryStill: true, badgeColumn: "Rang" });
  assert.deepEqual(gallery, { kind: "gallery", imageColumn: "Portrait", badgeColumn: "Rang", galleryWidthRem: 11.5, galleryRatio: 1.33, galleryRadiusPx: 200, galleryFit: "contain", galleryStill: true });
  const timeline = views.cleanViewLayout({ kind: "timeline", dateColumn: "Année", timelineStyle: "chapters", milestoneEvery: 100, milestoneIcon: "hourglass", dateStyle: "badge" });
  assert.deepEqual(timeline, { kind: "timeline", dateColumn: "Année", timelineStyle: "chapters", milestoneEvery: 100, milestoneIcon: "hourglass", dateStyle: "badge" });
  const tree = views.cleanViewLayout({ kind: "tree", parentColumn: "Pays", treeStyle: "boxed", branchIcon: "trees", leafIcon: "leaf", depthColors: true, rootsAsSections: true });
  assert.deepEqual(tree, { kind: "tree", parentColumn: "Pays", treeStyle: "boxed", branchIcon: "trees", leafIcon: "leaf", depthColors: true, rootsAsSections: true });
  const codex = views.cleanViewLayout({ kind: "codex", codexStyle: "scroll", proseColumns: 2, chapterNumbers: true, tocPosition: "top", showToc: true });
  assert.deepEqual(codex, { kind: "codex", showToc: true, codexStyle: "scroll", proseColumns: 2, chapterNumbers: true, tocPosition: "top" });
  // Valeurs inconnues écartées, et un preset appliqué ailleurs garde icônes et pastilles seulement si leurs colonnes existent.
  assert.deepEqual(views.cleanViewLayout({ kind: "tree", treeStyle: "ronde", milestoneEvery: 7, look: { color: "rouge", radius: "xl" } }), { kind: "tree" });
  const fitted = views.fitLayoutToColumns({ kind: "list", iconColumn: "icône", badgeColumn: "Rang", itemIcon: "star" }, ["Nom", "Icône"]);
  assert.deepEqual(fitted, { kind: "list", iconColumn: "Icône", itemIcon: "star" });
  for (const preset of views.builtinViewPresets) assert.deepEqual(views.cleanViewLayout(preset.layout), preset.layout, preset.id);
});

test("sections : la lettre en marge et le menu des sections se relisent", () => {
  const glossary = views.cleanViewLayout({ kind: "list", alphabet: true, menu: "top", look: { sectionStyle: "letter" } });
  assert.deepEqual(glossary, { kind: "list", alphabet: true, menu: "top", look: { sectionStyle: "letter" } });
  assert.equal(views.cleanViewLayout({ kind: "list", menu: "bottom" }).menu, undefined);
  assert.equal(views.cleanViewLayout({ kind: "list", look: { sectionStyle: "huge" } }).look?.sectionStyle, undefined);
});
