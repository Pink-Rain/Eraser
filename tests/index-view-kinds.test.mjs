import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const views = await vite.ssrLoadModule("/lib/index-presentations.ts");
const calendars = await vite.ssrLoadModule("/lib/calendars.ts");

test("les nouvelles vues et leurs réglages se relisent, rien d'autre", () => {
  const gallery = views.cleanPresentation({ kind: "gallery", imageColumn: "Portrait", galleryShape: "square", gallerySize: "lg", captionOnHover: true, itemCard: "*" });
  assert.deepEqual(gallery, { kind: "gallery", imageColumn: "Portrait", galleryShape: "square", gallerySize: "lg", captionOnHover: true, itemCard: "*" });
  assert.deepEqual(views.cleanPresentation({ kind: "timeline", dateColumn: "Date", timelineSide: "right" }), { kind: "timeline", dateColumn: "Date", timelineSide: "right" });
  assert.deepEqual(views.cleanPresentation({ kind: "tree", parentColumn: "Pays", collapsed: true }), { kind: "tree", collapsed: true, parentColumn: "Pays" });
  assert.deepEqual(views.cleanPresentation({ kind: "codex", showToc: true, detailFields: ["Description"] }), { kind: "codex", detailFields: ["Description"], showToc: true });
  // Valeurs inconnues écartées.
  assert.deepEqual(views.cleanPresentation({ kind: "gallery", galleryShape: "ronde", gallerySize: 3, timelineSide: "haut" }), { kind: "gallery" });
  // Les anciennes vues gardent exactement leur forme.
  assert.deepEqual(views.cleanPresentation({ kind: "list", compact: true, fields: ["Type"] }), { kind: "list", compact: true, fields: ["Type"] });
  // Une liste de cartes : la carte choisie se garde.
  assert.deepEqual(views.cleanPresentation({ kind: "kanban", kanbanColumn: "État", itemCard: "CARTE-12" }), { kind: "kanban", kanbanColumn: "État", itemCard: "CARTE-12" });
});

test("les nouvelles vues sont des vues de « Modifier », avec leurs presets", () => {
  for (const kind of ["gallery", "timeline", "tree", "codex"]) {
    assert.ok(views.isPresentationKind(kind), kind);
    assert.ok(views.builtinPresentationPresets.some((preset) => preset.layout.kind === kind), kind);
  }
  for (const preset of views.builtinPresentationPresets) assert.ok(views.cleanPresentationPreset(preset), preset.id);
  const parsed = views.parseTabPresentations({ tree: { parentColumn: "Région" }, gallery: { kind: "list", imageColumn: "Image" } });
  assert.deepEqual(parsed, { tree: { kind: "tree", parentColumn: "Région" }, gallery: { kind: "gallery", imageColumn: "Image" } });
  // Les autres versions d'une vue : gardées sous « named », sans doublon ni genre inconnu ; l'étoilée ne bouge pas.
  const versions = views.parseTabPresentations(JSON.stringify({ list: { compact: true }, named: [{ id: "court", name: "Liste courte", layout: { kind: "list", fields: ["Type"] } }, { id: "court", name: "doublon", layout: { kind: "list" } }, { id: "tableau", name: "Tableau", layout: { kind: "table" } }, { id: "k", name: "", layout: { kind: "kanban", kanbanColumn: "État" } }] }));
  assert.deepEqual(versions.list, { kind: "list", compact: true });
  assert.deepEqual(versions.named.map((item) => [item.id, item.name, item.layout.kind]), [["court", "Liste courte", "list"], ["k", "Vue", "kanban"]]);
  assert.deepEqual(views.namedPresentationsOf(versions, "kanban").map((item) => item.id), ["k"]);
  assert.deepEqual(views.presentationEntries(versions).map(([kind]) => kind), ["list"]);
  assert.deepEqual(views.presentationVariant({ Lieux: versions }, "lieux", "court"), { kind: "list", fields: ["Type"] });
  assert.equal(views.presentationVariant({ Lieux: versions }, "Lieux", "disparue"), null);
  // L'élément sur mesure d'une vue : une carte gardée dans la vue, relue comme une carte.
  const own = views.cleanPresentation({ kind: "list", itemCard: views.PRESENTATION_ITEM_CARD, itemTemplate: { id: "c1", name: "Élément", blocks: [{ id: "b1", type: "title", column: "Nom" }, { id: "b2", type: "pirate" }] } });
  assert.equal(own.itemCard, "@vue");
  assert.deepEqual(own.itemTemplate.blocks.map((block) => block.type), ["title"]);
  assert.equal(views.cleanPresentation({ kind: "list", itemTemplate: "illisible" }).itemTemplate, undefined);
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
  const list = views.cleanPresentation({ kind: "list", numbered: true, alphabet: true, iconColumn: "Icône", itemIcon: "skull", badgeColumn: "Rang", fields: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], look: { surface: "zebra", color: "#397f88", sectionIcon: "flag", radius: "lg", shadow: true, titleCaps: true, fieldColor: "accent" } });
  assert.deepEqual(list, { kind: "list", fields: ["A", "B", "C", "D", "E", "F", "G", "H"], iconColumn: "Icône", itemIcon: "skull", badgeColumn: "Rang", numbered: true, alphabet: true, look: { surface: "zebra", radius: "lg", shadow: true, titleCaps: true, fieldColor: "accent", color: "#397f88", sectionIcon: "flag" } });
  const kanban = views.cleanPresentation({ kind: "kanban", kanbanColumn: "État", laneCollapse: true, lanes: [{ value: "En cours", label: "WIP", color: "#b3261e", icon: "⚔️", limit: 3 }, { value: "Fini", hidden: true }, { value: "" }, { value: "Rien" }] });
  // Une valeur seule reste (colonne ajoutée à la main) ; une valeur vide est écartée.
  assert.deepEqual(kanban.lanes, [{ value: "En cours", label: "WIP", color: "#b3261e", icon: "⚔️", limit: 3 }, { value: "Fini", hidden: true }, { value: "Rien" }]);
  assert.equal(kanban.laneCollapse, true);
  const master = views.cleanPresentation({ kind: "master-detail", masterSide: "right", detailColumns: 3, detailImage: "banner" });
  assert.deepEqual(master, { kind: "master-detail", masterSide: "right", detailColumns: 3, detailImage: "banner" });
  const calendar = views.cleanPresentation({ kind: "calendar", dateColumn: "Date", hideSeasons: true, monthStyle: "season", maxPerDay: 40 });
  assert.deepEqual(calendar, { kind: "calendar", dateColumn: "Date", hideSeasons: true, monthStyle: "season", maxPerDay: 12 });
  const dashboard = views.cleanPresentation({ kind: "dashboard", tileColumns: 6, tiles: [{ kind: "count", icon: "users", unit: "PNJ", size: "lg", note: "dans le monde", color: "#285f8f" }, { kind: "sum", column: "Prix", unit: "PO" }] });
  assert.deepEqual(dashboard, { kind: "dashboard", tiles: [{ kind: "count", color: "#285f8f", icon: "users", unit: "PNJ", size: "lg", note: "dans le monde" }, { kind: "sum", column: "Prix", unit: "PO" }], tileColumns: 6 });
  const gallery = views.cleanPresentation({ kind: "gallery", imageColumn: "Portrait", galleryWidthRem: 11.25, galleryRatio: 1.333, galleryRadiusPx: 500, galleryFit: "contain", galleryStill: true, badgeColumn: "Rang" });
  assert.deepEqual(gallery, { kind: "gallery", imageColumn: "Portrait", badgeColumn: "Rang", galleryWidthRem: 11.5, galleryRatio: 1.33, galleryRadiusPx: 200, galleryFit: "contain", galleryStill: true });
  const timeline = views.cleanPresentation({ kind: "timeline", dateColumn: "Année", timelineStyle: "chapters", milestoneEvery: 100, milestoneIcon: "hourglass", dateStyle: "badge" });
  assert.deepEqual(timeline, { kind: "timeline", dateColumn: "Année", timelineStyle: "chapters", milestoneEvery: 100, milestoneIcon: "hourglass", dateStyle: "badge" });
  const tree = views.cleanPresentation({ kind: "tree", parentColumn: "Pays", treeStyle: "boxed", branchIcon: "trees", leafIcon: "leaf", depthColors: true, rootsAsSections: true });
  assert.deepEqual(tree, { kind: "tree", parentColumn: "Pays", treeStyle: "boxed", branchIcon: "trees", leafIcon: "leaf", depthColors: true, rootsAsSections: true });
  const codex = views.cleanPresentation({ kind: "codex", codexStyle: "scroll", proseColumns: 2, chapterNumbers: true, tocPosition: "top", showToc: true });
  assert.deepEqual(codex, { kind: "codex", showToc: true, codexStyle: "scroll", proseColumns: 2, chapterNumbers: true, tocPosition: "top" });
  // Valeurs inconnues écartées, et un preset appliqué ailleurs garde icônes et pastilles seulement si leurs colonnes existent.
  assert.deepEqual(views.cleanPresentation({ kind: "tree", treeStyle: "ronde", milestoneEvery: 7, look: { color: "rouge", radius: "xl" } }), { kind: "tree" });
  const fitted = views.fitLayoutToColumns({ kind: "list", iconColumn: "icône", badgeColumn: "Rang", itemIcon: "star" }, ["Nom", "Icône"]);
  assert.deepEqual(fitted, { kind: "list", iconColumn: "Icône", itemIcon: "star" });
  for (const preset of views.builtinPresentationPresets) assert.deepEqual(views.cleanPresentation(preset.layout), preset.layout, preset.id);
});

test("sections : la lettre en marge et le menu des sections se relisent", () => {
  const glossary = views.cleanPresentation({ kind: "list", alphabet: true, menu: "top", look: { sectionStyle: "letter" } });
  assert.deepEqual(glossary, { kind: "list", alphabet: true, menu: "top", look: { sectionStyle: "letter" } });
  assert.equal(views.cleanPresentation({ kind: "list", menu: "bottom" }).menu, undefined);
  assert.equal(views.cleanPresentation({ kind: "list", look: { sectionStyle: "huge" } }).look?.sectionStyle, undefined);
});

test("lot B : élément, au clic, détail, formule par groupe, jauge, onglets, zigzag se relisent et se bornent", async () => {
  const starters = await vite.ssrLoadModule("/lib/index-presentation-starters.ts");
  const layout = views.cleanPresentation({ kind: "list", itemForm: "principal", click: "side", detail: { kind: "form", form: "court", width: "wide", nav: true }, groupFormula: { op: "sum", column: "Prix", target: 100, label: "Σ", style: "bar" }, gauge: { column: "Vie", style: "charges", max: 5, maxColumn: "Vie totale", label: "PV" }, menu: "tabs", look: { zigzag: true } });
  assert.deepEqual(layout, { kind: "list", menu: "tabs", itemForm: "principal", click: "side", detail: { kind: "form", form: "court", width: "wide", nav: true }, groupFormula: { op: "sum", column: "Prix", target: 100, label: "Σ", style: "bar" }, gauge: { column: "Vie", style: "charges", max: 5, maxColumn: "Vie totale", label: "PV" }, look: { zigzag: true } });
  // « Ouvrir la fiche » choisi se garde : il l'emporte sur le clic de la carte de l'élément (absent :
  // « comme la carte », qui ouvre la fiche d'office). Un clic inconnu, une formule sans opération
  // connue ou une jauge sans colonne disparaissent.
  assert.equal(views.cleanPresentation({ kind: "list", click: "sheet", groupFormula: { op: "median" }, gauge: { style: "bar" } }).click, "sheet");
  assert.equal(views.cleanPresentation({ kind: "list", click: "fly" }).click, undefined);
  assert.equal(views.cleanPresentation({ kind: "list", groupFormula: { op: "median" } }).groupFormula, undefined);
  assert.equal(views.cleanPresentation({ kind: "list", gauge: { style: "bar" } }).gauge, undefined);
  // Appliquée à un autre onglet : la formule et la jauge ne gardent que les colonnes connues.
  const fitted = views.fitLayoutToColumns(layout, ["Nom", "Vie"]);
  assert.equal(fitted.groupFormula, undefined);
  assert.deepEqual(fitted.gauge, { column: "Vie", style: "charges", max: 5, label: "PV" });
  // La formule d'un groupe.
  const rows = [{ Prix: "10" }, { Prix: "25,5" }, { Prix: "" }];
  const valueOf = (row, column) => row[column] ?? "";
  assert.equal(views.groupFormulaValue({ op: "count" }, rows, valueOf), 3);
  assert.equal(views.groupFormulaValue({ op: "sum", column: "Prix" }, rows, valueOf), 35.5);
  assert.equal(views.groupFormulaValue({ op: "max", column: "Prix" }, rows, valueOf), 25.5);
  assert.equal(views.groupFormulaValue({ op: "avg", column: "Prix" }, rows, valueOf), 17.75);
  assert.equal(views.formatPresentationNumber(17.75), "17,75");
  // Les formes de base de 4, 5 et 6, bâties sur les colonnes, passent telles quelles le nettoyage.
  const columns = [{ header: "Nom", spec: { kind: "name" } }, { header: "Portrait", spec: { kind: "file", file: { accept: "image" } } }, { header: "Type", spec: { kind: "choice", options: [{ value: "Arme" }] } }, { header: "Prix", spec: { kind: "number" } }, { header: "Vie", spec: { kind: "number" } }, { header: "Description", spec: { kind: "rich" } }, { header: "Lieu", spec: { kind: "linked-choice" } }];
  for (const kind of ["list", "kanban", "master-detail"]) {
    const forms = starters.presentationStartersFor(kind, columns);
    assert.ok(forms.length >= 6, kind);
    for (const form of forms) {
      const clean = views.cleanPresentation(form.layout);
      assert.ok(clean, form.key);
      assert.equal(clean.kind, kind, form.key);
      assert.deepEqual(views.cleanPresentation(clean), clean, form.key);
    }
  }
  const linked = starters.presentationStartersFor("kanban", columns).find((form) => form.key === "kanban-linked");
  assert.equal(linked.layout.kanbanColumn, "Lieu");
  assert.deepEqual(linked.layout.groupFormula, { op: "sum", column: "Prix" });
  const gauge = starters.presentationStartersFor("list", columns).find((form) => form.key === "list-gauge");
  assert.deepEqual(gauge.layout.gauge, { column: "Prix", style: "bar", maxColumn: "Vie" });
  assert.equal(starters.presentationStartersFor("list", columns).find((form) => form.key === "list-zigzag").layout.imageColumn, "Portrait");
});

test("lot C : calendrier (échelles, formes, bannière) et tableau de bord (tuiles mixtes, sections) se relisent et se bornent", async () => {
  const calendar = views.cleanPresentation({ kind: "calendar", dateColumn: "Date", calendarScale: "week", calendarForms: { week: "table", month: "grid", day: "paragraphs", agenda: "bidon" }, calendarSwitcher: true, calendarStay: true, calendarBanner: "season", bannerImage: "https://x/y.png", bannerHeight: 900, hideEmptyDays: true });
  assert.deepEqual(calendar, { kind: "calendar", dateColumn: "Date", calendarScale: "week", calendarForms: { week: "table", day: "paragraphs" }, calendarSwitcher: true, calendarStay: true, calendarBanner: "season", bannerImage: "https://x/y.png", bannerHeight: 400, hideEmptyDays: true });
  // L'ancien « Agenda » (apparence) reste une échelle ; une échelle réglée prend le pas.
  assert.equal(views.calendarScaleOf({ look: { calendarMode: "agenda" } }), "agenda");
  assert.equal(views.calendarScaleOf({ calendarScale: "year", look: { calendarMode: "agenda" } }), "year");
  assert.equal(views.calendarScaleOf({}), "month");
  const dashboard = views.cleanPresentation({ kind: "dashboard", collapsible: true, tiles: [
    { kind: "gauge", measure: "sum", column: "Or", target: 100, style: "bar", section: "Groupe", full: true },
    { kind: "gauge", row: "Aldric", column: "Vie", maxColumn: "Vie max", style: "charges" },
    { kind: "stat", stat: "st-12" },
    { kind: "view", view: "list", limit: 500 },
    { kind: "view", view: "dashboard" },
    { kind: "card", row: "Aldric", form: "principal" },
    { kind: "text", text: "  {nombre} lignes  " },
    { kind: "linked", column: "Personnage", formulas: [{ op: "count" }, { op: "sum", column: "Or", label: "Or", unit: "po" }, { op: "bidon" }] },
    { kind: "bidon" },
  ] });
  assert.deepEqual(dashboard.tiles, [
    { kind: "gauge", column: "Or", full: true, section: "Groupe", measure: "sum", target: 100, style: "bar" },
    { kind: "gauge", column: "Vie", row: "Aldric", maxColumn: "Vie max", style: "charges" },
    { kind: "stat", stat: "st-12" },
    { kind: "view", view: "list", limit: 100 },
    { kind: "view" },
    { kind: "card", row: "Aldric", form: "principal" },
    { kind: "text", text: "{nombre} lignes" },
    { kind: "linked", column: "Personnage", formulas: [{ op: "count" }, { op: "sum", column: "Or", label: "Or", unit: "po" }] },
  ]);
  assert.equal(dashboard.collapsible, true);
  // Appliqué à un autre onglet : les colonnes absentes des tuiles et de leurs formules s'effacent.
  const fitted = views.fitLayoutToColumns(dashboard, ["Nom", "Personnage", "Vie"]);
  assert.deepEqual(fitted.tiles.map((tile) => tile.kind), ["gauge", "stat", "view", "view", "card", "text", "linked"]);
  assert.deepEqual(fitted.tiles[0], { kind: "gauge", column: "Vie", row: "Aldric", style: "charges" });
  assert.deepEqual(fitted.tiles[6].formulas, [{ op: "count" }]);

  // Les valeurs des tuiles : jauge (formule ou ligne), tuiles liées, texte à formules.
  const rows = [{ name: "Aldric", or: "120", vie: "40", max: "50", perso: "Aldric" }, { name: "Brisaïs", or: "30", vie: "14", max: "40", perso: "Aldric, Colombe" }, { name: "Colombe", or: "", vie: "32", max: "32", perso: "" }];
  const valueOf = (row, column) => ({ Or: row.or, Vie: row.vie, "Vie max": row.max, Personnage: row.perso })[column] ?? "";
  const nameOf = (row) => row.name;
  assert.deepEqual(views.tileGaugeValue({ kind: "gauge", measure: "sum", column: "Or", target: 100 }, rows, valueOf, nameOf), { value: 150, max: 100 });
  assert.deepEqual(views.tileGaugeValue({ kind: "gauge" }, rows, valueOf, nameOf), { value: 3, max: null });
  const own = views.tileGaugeValue({ kind: "gauge", row: "aldric", column: "Vie", maxColumn: "Vie max" }, rows, valueOf, nameOf);
  assert.deepEqual([own.value, own.max, own.row?.name], [40, 50, "Aldric"]);
  assert.deepEqual(views.linkedTiles({ kind: "linked", column: "Personnage", formulas: [{ op: "count" }, { op: "sum", column: "Or", label: "Or", unit: "po" }] }, rows, valueOf), [
    { name: "Aldric", count: 2, values: [{ label: "lignes", value: 2, unit: undefined }, { label: "Or", value: 150, unit: "po" }] },
    { name: "Colombe", count: 1, values: [{ label: "lignes", value: 1, unit: undefined }, { label: "Or", value: 30, unit: "po" }] },
  ]);
  const segments = views.textWithFormulas("{nombre} membres, {somme Or} po, {moyenne vie} de vie, {Vie de Brisaïs} pour elle, {Or}, {remplies Or}, {Inconnu de Personne}.", rows, valueOf, nameOf, ["Or", "Vie", "Vie max", "Personnage"]);
  assert.deepEqual(segments.filter((segment) => "formula" in segment).map((segment) => segment.value), ["3", "150", "28,67", "14", "150", "2", "—"]);
  assert.equal(segments[0].value, "3");
  assert.equal(segments[1].text, " membres, ");

  // Les formes de départ du lot C : dix-huit pour le calendrier, huit pour le tableau de bord, toutes propres.
  const starters = await vite.ssrLoadModule("/lib/index-presentation-starters.ts");
  const columns = [{ header: "Nom" }, { header: "Date" }, { header: "Type", spec: { kind: "choice", options: [{ value: "A" }] } }, { header: "Or", spec: { kind: "number" } }, { header: "Personnage", spec: { kind: "linked" } }, { header: "Description" }];
  const calendars = starters.presentationStartersFor("calendar", columns);
  const dashboards = starters.presentationStartersFor("dashboard", columns);
  assert.equal(calendars.length, 18);
  assert.equal(dashboards.length, 8);
  for (const starter of [...calendars, ...dashboards]) {
    const clean = views.cleanPresentation(starter.layout);
    assert.ok(clean, starter.key);
    assert.deepEqual(views.cleanPresentation(clean), clean, starter.key);
  }
  assert.ok(calendars.every((starter) => starter.layout.dateColumn === "Date"));
  assert.ok(new Set(calendars.map((starter) => starter.layout.calendarScale ?? "month")).size === 6, "toutes les échelles sont proposées");
  assert.ok(dashboards.some((starter) => starter.layout.tiles.some((tile) => tile.kind === "linked" && tile.column === "Personnage")));
});

test("calendriers : jours comptés, semaines et images des mois (monde et réel)", () => {
  const world = { name: "Brume", era: "AR", description: "", months: [{ name: "Givrelune", days: 30, season: "Hiver" }, { name: "Brumaire", days: 31, season: "Hiver" }, { name: "Floréal", days: 29, season: "Printemps" }], seasons: [{ name: "Hiver", color: "#285f8f", months: 2 }, { name: "Printemps", color: "#4d7c0f", months: 1 }], weekdays: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] };
  assert.equal(calendars.yearLength(world, 1), 90);
  assert.equal(calendars.dayNumber(world, { year: 1, month: 0, day: 1 }), 0);
  assert.equal(calendars.dayNumber(world, { year: 2, month: 1, day: 3 }), 90 + 30 + 2);
  assert.deepEqual(calendars.dateFromDayNumber(world, 122), { year: 2, month: 1, day: 3 });
  assert.deepEqual(calendars.addDays(world, { year: 1, month: 2, day: 29 }, 1), { year: 2, month: 0, day: 1 });
  assert.deepEqual(calendars.addDays(world, { year: 2, month: 0, day: 1 }, -1), { year: 1, month: 2, day: 29 });
  assert.equal(calendars.weekdayOf(world, { year: 1, month: 0, day: 7 }), 0);
  assert.deepEqual(calendars.weekStartOf(world, { year: 1, month: 0, day: 9 }), { year: 1, month: 0, day: 7 });
  assert.deepEqual(calendars.addMonths(world, 1, 2, 1), { year: 2, month: 0 });
  assert.deepEqual(calendars.addMonths(world, 2, 0, -1), { year: 1, month: 2 });
  // Le calendrier réel : les bissextiles comptent, la semaine commence le lundi.
  const real = calendars.realCalendar;
  assert.equal(calendars.dayNumber(real, { year: 2024, month: 2, day: 1 }) - calendars.dayNumber(real, { year: 2024, month: 1, day: 28 }), 2);
  assert.deepEqual(calendars.addDays(real, { year: 2023, month: 11, day: 31 }, 1), { year: 2024, month: 0, day: 1 });
  assert.deepEqual(calendars.weekStartOf(real, { year: 2026, month: 9, day: 13 }), { year: 2026, month: 9, day: 12 });
  // L'image d'un mois ou d'une saison vient de la colonne « Image » de son onglet.
  const [parsed] = calendars.calendarsFromTables([
    { tabName: "Calendriers", headers: ["Nom", "Ère"], rows: [{ values: ["Brume", "AR"] }] },
    { tabName: "Mois", headers: ["Calendrier", "Nom", "Nombre de jours", "Saison", "Image"], rows: [{ values: ["Brume", "Givrelune", "30", "Hiver", "<img src=\"https://img/givrelune.png\">"] }, { values: ["Brume", "Floréal", "29", "Printemps", ""] }] },
    { tabName: "Saisons", headers: ["Calendrier", "Nom", "Couleur", "Image"], rows: [{ values: ["Brume", "Hiver", "#285f8f", "/api/files/hiver.jpg"] }] },
  ]);
  assert.equal(parsed.months[0].image, "https://img/givrelune.png");
  assert.equal(parsed.months[1].image, undefined);
  assert.equal(parsed.seasons[0].image, "/api/files/hiver.jpg");
});

test("lot D : galerie, chronologie, arborescence et codex — réglages nouveaux relus et bornés, formes de base propres", async () => {
  const gallery = views.cleanPresentation({ kind: "gallery", imageColumn: "Portrait", galleryStyle: "cabinet", gallerySizeColumn: "Taille", gauge: { column: "Vie", style: "charges", max: 3 } });
  assert.deepEqual(gallery, { kind: "gallery", imageColumn: "Portrait", gauge: { column: "Vie", style: "charges", max: 3 }, galleryStyle: "cabinet", gallerySizeColumn: "Taille" });
  assert.equal(views.cleanPresentation({ kind: "gallery", galleryStyle: "plain" }).galleryStyle, undefined);
  const timeline = views.cleanPresentation({ kind: "timeline", dateColumn: "Date", endColumn: "Fin", laneColumn: "Personnage", timelineStyle: "bars", timelineAxis: "horizontal", timelineSide: "groups", timelinePeriods: "scale", groupBy: "Ère" });
  assert.deepEqual(timeline, { kind: "timeline", groupBy: "Ère", dateColumn: "Date", timelineSide: "groups", timelineStyle: "bars", timelineAxis: "horizontal", timelinePeriods: "scale", endColumn: "Fin", laneColumn: "Personnage" });
  assert.equal(views.cleanPresentation({ kind: "timeline", timelineAxis: "vertical", timelinePeriods: "bidon" }).timelineAxis, undefined);
  const tree = views.cleanPresentation({ kind: "tree", parentColumn: "Parent", treeStyle: "mindmap", numbered: true, dimColumn: "Vivant", dateColumn: "Naissance", endColumn: "Mort", click: "side", detail: { kind: "children", width: "wide" } });
  assert.deepEqual(tree, { kind: "tree", dateColumn: "Naissance", parentColumn: "Parent", numbered: true, click: "side", detail: { kind: "children", width: "wide" }, treeStyle: "mindmap", endColumn: "Mort", dimColumn: "Vivant" });
  const codex = views.cleanPresentation({ kind: "codex", codexStyle: "board", codexPages: true, codexTiles: ["PV", "CA", "", "Force", "Dex", "Con", "Int", "Sag"], codexLinks: ["Allié", "Ennemi"], codexRecto: "*", codexVerso: "CARTE-2", dateColumn: "Date" });
  assert.deepEqual(codex, { kind: "codex", dateColumn: "Date", codexStyle: "board", codexPages: true, codexTiles: ["PV", "CA", "Force", "Dex", "Con", "Int"], codexLinks: ["Allié", "Ennemi"], codexRecto: "*", codexVerso: "CARTE-2" });
  // Appliqués à un autre onglet : les colonnes absentes s'effacent (fin, fil, grisé, taille, tuiles, renvois).
  const fitted = views.fitLayoutToColumns({ ...timeline, ...codex, kind: "timeline" }, ["Nom", "Date", "Ère", "PV"]);
  assert.deepEqual([fitted.endColumn, fitted.laneColumn, fitted.codexTiles, fitted.codexLinks, fitted.groupBy], [undefined, undefined, ["PV"], undefined, "Ère"]);

  const starters = await vite.ssrLoadModule("/lib/index-presentation-starters.ts");
  const columns = [{ header: "Nom" }, { header: "Portrait", spec: { kind: "file", file: { accept: "image" } } }, { header: "Date" }, { header: "Date de fin" }, { header: "Type", spec: { kind: "choice", options: [{ value: "A" }] } }, { header: "Or", spec: { kind: "number" } }, { header: "Vie", spec: { kind: "number" } }, { header: "Personnage", spec: { kind: "linked" } }, { header: "Description" }];
  const counts = { gallery: 6, timeline: 11, tree: 9, codex: 10 };
  for (const [kind, expected] of Object.entries(counts)) {
    const list = starters.presentationStartersFor(kind, columns);
    assert.equal(list.length, expected, kind);
    for (const starter of list) {
      const clean = views.cleanPresentation(starter.layout);
      assert.ok(clean, starter.key);
      assert.deepEqual(views.cleanPresentation(clean), clean, starter.key);
      assert.equal(clean.kind, kind, starter.key);
    }
  }
  const timelines = starters.presentationStartersFor("timeline", columns);
  assert.ok(timelines.every((starter) => starter.layout.dateColumn === "Date"));
  assert.equal(timelines.find((starter) => starter.key === "chr-bars").layout.endColumn, "Date de fin");
  assert.equal(timelines.find((starter) => starter.key === "chr-lanes").layout.laneColumn, "Personnage");
  assert.ok(starters.presentationStartersFor("tree", columns).every((starter) => starter.layout.parentColumn === "Personnage"));
  assert.deepEqual(starters.presentationStartersFor("codex", columns).find((starter) => starter.key === "cdx-bestiary").layout.codexTiles, ["Or", "Vie"]);
  // Toutes les formes de départ des douze vues, sur un onglet réduit au nom : jamais une forme cassée.
  for (const kind of ["list", "kanban", "master-detail", "calendar", "dashboard", "gallery", "timeline", "tree", "codex"]) for (const starter of starters.presentationStartersFor(kind, [{ header: "Nom" }])) assert.ok(views.cleanPresentation(starter.layout), `${kind} ${starter.key}`);
});

test("le survol au passage de la souris se garde dans la présentation (absent : l'étoilé ; « - » : aucun)", () => {
  assert.equal(views.cleanPresentation({ kind: "kanban", hover: "court" }).hover, "court");
  assert.equal(views.cleanPresentation({ kind: "calendar", hover: "-" }).hover, "-");
  assert.equal(views.cleanPresentation({ kind: "list" }).hover, undefined);
});
