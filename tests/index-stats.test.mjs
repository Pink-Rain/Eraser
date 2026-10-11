import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const stats = await vite.ssrLoadModule("/lib/index-stats.ts");
const layouts = await vite.ssrLoadModule("/lib/index-view-layouts.ts");

// Un petit index : chaque ligne est un objet { onglet, colonnes… }.
const rows = [
  { tab: "Armes", Nom: "Dague", Type: "Arme", Rareté: "Commun", Prix: "50 PC", Éléments: "Feu, Glace" },
  { tab: "Armes", Nom: "Épée", Type: "Arme", Rareté: "Rare", Prix: "12 PO", Éléments: "Feu" },
  { tab: "Armes", Nom: "Arc", Type: "Arme", Rareté: "rare", Prix: "1 250,5 PO", Éléments: "" },
  { tab: "Objets", Nom: "Corde", Type: "Outil", Rareté: "Commun", Prix: "2 PO", Éléments: "" },
  { tab: "Objets", Nom: "Lanterne", Type: "Outil", Rareté: "", Prix: "", Éléments: "<b>Lumière</b>" },
];
const valueOf = (row, column) => row[column] ?? "";
const tabOf = (row) => row.tab;

test("une statistique se nettoie : champs connus, longueurs et nombres bornés", () => {
  const cleaned = stats.cleanStat({
    id: "st-abc", title: "  Prix   moyen ", measure: "average", field: "Prix", source: "Armes", evil: "<script>",
    where: [{ column: "Type", operator: "est", value: "Arme", extra: 1 }, { column: "Type", operator: "inconnu", value: "x" }],
    by: ["Rareté", "Rareté", "Type", "Éléments", "Nom"], cols: ["Type", "Prix"], form: "table", top: 4, percent: "row", pinned: true,
  });
  assert.deepEqual(cleaned, {
    id: "st-abc", title: "Prix moyen", measure: "average", field: "Prix", source: "Armes",
    where: [{ column: "Type", operator: "est", value: "Arme" }],
    by: ["Rareté", "Type", "Éléments"], cols: ["Prix"], form: "table", top: 4, pinned: true,
  });
  // « % de la ligne » ne vaut que pour ce qui s'additionne : une moyenne le perd.
  assert.equal(cleaned.percent, undefined);
  // Mesure sans colonne : on compte ; forme impossible : la plus proche ; titre absent : proposé.
  const fallback = stats.cleanStat({ id: "mauvais id !", measure: "sum", by: ["Type"], cols: [], form: "number" }, "stat-9");
  assert.deepEqual(fallback, { id: "stat-9", title: "Lignes par Type", measure: "count", by: ["Type"], form: "bars" });
  assert.equal(stats.cleanStat("pas un objet"), null);
  // Pas de colonnes sans lignes.
  assert.deepEqual(stats.cleanStat({ id: "a", by: [], cols: ["Type"], form: "table" }).cols, undefined);
});

test("les statistiques d'un onglet : 24 au plus, identifiants uniques", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ id: index < 2 ? "double" : `s${index}`, title: `S${index}`, measure: "count", by: [], form: "number" }));
  const cleaned = stats.cleanStats(many);
  assert.equal(cleaned.length, stats.STAT_LIMITS.stats);
  assert.equal(new Set(cleaned.map((stat) => stat.id)).size, cleaned.length);
  assert.deepEqual(cleaned.slice(0, 2).map((stat) => stat.id), ["double", "double-2"]);
  assert.deepEqual(stats.cleanStats("rien"), []);
  // Six conditions au plus.
  const where = Array.from({ length: 9 }, () => ({ column: "Type", operator: "non-vide", value: "" }));
  assert.equal(stats.cleanStat({ id: "w", where, by: [], form: "number" }).where.length, stats.STAT_LIMITS.conditions);
});

test("cleanViewLayout garde un onglet stat valide et rejette les champs inconnus", () => {
  const layout = layouts.cleanViewLayout({ kind: "stats", groupBy: "Type", tiles: [{ kind: "count" }], evil: "x", stats: [{ id: "st-1", title: "Raretés", measure: "count", by: ["Rareté"], form: "donut", hack: true }, "abîmée"] });
  assert.deepEqual(layout, { kind: "stats", stats: [{ id: "st-1", title: "Raretés", measure: "count", by: ["Rareté"], form: "donut" }] });
  assert.deepEqual(layouts.cleanViewLayout({ kind: "stats" }), { kind: "stats" });
  assert.deepEqual(layouts.parseViewLayout(JSON.stringify(layout)), layout);
  // « stats » n'est pas une présentation proposée pour un onglet-fenêtre ordinaire.
  assert.ok(!layouts.viewLayoutKinds.some((kind) => kind.value === "stats"));
  // Les autres présentations ne bougent pas.
  assert.deepEqual(layouts.cleanViewLayout({ kind: "kanban", kanbanColumn: "Statut", stats: [{ id: "x" }] }), { kind: "kanban", kanbanColumn: "Statut" });
});

test("une présentation trop longue pour une case Sheets est repérée", () => {
  const long = "x".repeat(200);
  const heavy = Array.from({ length: 24 }, (_, index) => ({
    id: `s${index}`, title: long, measure: "sum", field: long, source: long,
    where: Array.from({ length: 6 }, () => ({ column: long, operator: "contient", value: long })),
    by: [`${long}1`, `${long}2`, `${long}3`], cols: [`${long}4`, `${long}5`], form: "table",
  }));
  const big = layouts.cleanViewLayout({ kind: "stats", stats: heavy });
  assert.equal(big.stats.length, 24);
  assert.ok(JSON.stringify(big).length > layouts.MAX_VIEW_LAYOUT_JSON);
  assert.equal(layouts.viewLayoutTooLarge(big), true);
  assert.equal(layouts.viewLayoutTooLarge(layouts.cleanViewLayout({ kind: "stats", stats: heavy.slice(0, 2) })), false);
  assert.equal(layouts.viewLayoutTooLarge(undefined), false);
});

test("formes permises et ajustement de la phrase", () => {
  const base = { id: "a", title: "", measure: "count", by: [], form: "number" };
  assert.equal(stats.formProblem(base, "number"), "");
  assert.notEqual(stats.formProblem(base, "bars"), "");
  assert.notEqual(stats.formProblem({ ...base, measure: "average", field: "Prix", by: ["Type"] }, "donut"), "");
  assert.equal(stats.formProblem({ ...base, by: ["Type"], cols: ["Rareté"] }, "table"), "");
  assert.equal(stats.fitForm({ ...base, by: ["Type"] }).form, "bars");
  assert.equal(stats.fitForm({ ...base, by: ["Type"], cols: ["Rareté"], form: "bars" }).form, "table");
  assert.equal(stats.fitForm({ ...base, by: ["Type"], cols: ["Rareté"], form: "bars" }).top, 6);
  assert.equal(stats.fitForm({ ...base, by: ["Type"], form: "ranking" }).top, 10);
  assert.equal(stats.fitForm({ ...base, by: ["Type"], form: "bars", percent: "row" }).percent, undefined);
  assert.equal(stats.fitForm({ ...base, by: ["Type"], form: "bars", percent: "total" }).percent, "total");
  assert.deepEqual(stats.percentChoices({ measure: "count", form: "table" }).map((choice) => choice.value), ["none", "total", "row", "column"]);
  assert.deepEqual(stats.percentChoices({ measure: "average", form: "table" }).map((choice) => choice.value), ["none"]);
  assert.equal(stats.autoStatTitle({ measure: "sum", field: "Prix", by: ["Type"], cols: ["Rareté"], where: [{ column: "Type", operator: "est", value: "Arme" }] }), "Prix total par Type × Rareté · Type est « Arme »");
});

test("mesures : compter, additionner, moyenne, maximum, minimum ; colonnes de nombres", () => {
  assert.equal(stats.cellNumber("1 250,5 PO"), 1250.5);
  assert.equal(layouts.cellNumber("50 PC"), 50);
  assert.equal(stats.aggregate({ measure: "count" }, rows, valueOf), 5);
  assert.equal(stats.aggregate({ measure: "sum", field: "Prix" }, rows, valueOf), 1314.5);
  assert.equal(stats.aggregate({ measure: "average", field: "Prix" }, rows, valueOf), 328.63);
  assert.equal(stats.aggregate({ measure: "max", field: "Prix" }, rows, valueOf), 1250.5);
  assert.equal(stats.aggregate({ measure: "min", field: "Prix" }, rows, valueOf), 2);
  assert.equal(stats.aggregate({ measure: "average", field: "Nom" }, rows, valueOf), null);
  assert.deepEqual(stats.numericColumns(["Nom", "Type", "Prix", "Éléments"], rows, valueOf), ["Prix"]);
  // Un nom qui contient un chiffre n'est pas un nombre ; un prix avec son unité, si.
  assert.equal(stats.isNumberCell("1 250,5 PO"), true);
  assert.equal(stats.isNumberCell("40 m"), true);
  assert.equal(stats.isNumberCell("Potion n°2"), false);
  assert.deepEqual(stats.numericColumns(["Nom"], [{ Nom: "Potion n°2" }, { Nom: "Épée 3" }], valueOf), []);
});

test("les lignes comptées : la source, puis les conditions des onglets-fenêtres", () => {
  assert.deepEqual(stats.statRows({ source: "Armes" }, rows, valueOf, tabOf).map((row) => row.Nom), ["Dague", "Épée", "Arc"]);
  assert.deepEqual(stats.statRows({ where: [{ column: "Éléments", operator: "est", value: "glace" }] }, rows, valueOf, tabOf).map((row) => row.Nom), ["Dague"]);
  assert.deepEqual(stats.statRows({ source: "Objets", where: [{ column: "Prix", operator: "non-vide", value: "" }] }, rows, valueOf, tabOf).map((row) => row.Nom), ["Corde"]);
});

test("répartir par une colonne : plusieurs valeurs par case, majuscules confondues, vides à la fin", () => {
  const groups = stats.groupStatRows(rows, valueOf, "Éléments");
  assert.deepEqual(groups.map((group) => [stats.statKeyLabel(group), group.rows.length]), [["Feu", 2], ["Glace", 1], ["Lumière", 1], ["Sans valeur", 2]]);
  const rarities = stats.groupStatRows(rows, valueOf, "Rareté", { order: ["Rare", "Commun"] });
  assert.deepEqual(rarities.map((group) => [stats.statKeyLabel(group), group.rows.length]), [["Rare", 2], ["Commun", 2], ["Sans valeur", 1]]);
  // Les mêmes sections que celles des vues.
  assert.deepEqual(layouts.groupRowsBy(rows, (row) => row.Éléments).map((group) => group.name), ["Feu", "Glace", "Lumière", ""]);
});

test("« Autres » : au-delà de la limite, et dépliable", () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ Couleur: `C${String(index).padStart(2, "0")}` }));
  many.push({ Couleur: "C00" }, { Couleur: "C00" }, { Couleur: "" });
  const stat = { measure: "count", by: ["Couleur"] };
  const folded = stats.statBreakdown(stat, many, valueOf, { limit: 5, byValue: true });
  assert.equal(folded.hidden, 15);
  assert.equal(folded.parts.length, 7);
  assert.deepEqual(folded.parts.slice(-2).map((part) => [stats.statKeyLabel(part), part.value]), [["Autres", 15], ["Sans valeur", 1]]);
  assert.equal(folded.parts[0].label, "C00");
  assert.equal(folded.parts[0].value, 3);
  const open = stats.statBreakdown(stat, many, valueOf, { limit: 5, expanded: true });
  assert.equal(open.parts.length, 21);
  assert.equal(open.revealed("c19"), true);
  assert.equal(open.revealed("c00"), false);
  // Une seule valeur de trop ne fait pas d'« Autres ».
  assert.equal(stats.statBreakdown(stat, many.slice(0, 6), valueOf, { limit: 5 }).hidden, 0);
});

test("tableau croisé : niveaux, totaux, « Autres » en colonnes", () => {
  const table = stats.statTable({ measure: "count", by: ["Type"], cols: ["Rareté"] }, rows, valueOf, { orderOf: (column) => column === "Rareté" ? ["Commun", "Rare"] : [] });
  assert.deepEqual(table.headers[0].map((header) => stats.statKeyLabel(header)), ["Commun", "Rare", "Sans valeur"]);
  assert.deepEqual(table.total.children.map((node) => [node.label, node.total, node.cells.map((cell) => cell.value)]), [["Arme", 3, [1, 2, null]], ["Outil", 2, [1, null, 1]]]);
  assert.deepEqual(table.total.cells.map((cell) => cell.value), [2, 2, 1]);
  assert.deepEqual(table.leaves, [["Commun"], ["Rare"], ["Sans valeur"]]);
  // Deux niveaux de lignes, sommes de prix.
  const nested = stats.statTable({ measure: "sum", field: "Prix", by: ["Type", "Rareté"] }, rows, valueOf);
  assert.deepEqual(nested.total.children[0].children.map((node) => [node.labels.join(" › "), node.total]), [["Arme › Commun", 50], ["Arme › Rare", 1262.5]]);
  assert.equal(nested.total.total, 1314.5);
  // Une seule valeur gardée par niveau de colonnes : le reste dans « Autres », dépliable.
  const many = Array.from({ length: 6 }, (_, index) => ({ Type: "A", Lieu: `L${index % 3}` })).concat([{ Type: "B", Lieu: "L0" }]);
  const folded = stats.statTable({ measure: "count", by: ["Type"], cols: ["Lieu"], top: 1 }, many, valueOf);
  assert.deepEqual(folded.headers[0].map((header) => stats.statKeyLabel(header)), ["L0", "Autres"]);
  assert.equal(folded.hidden[0], 2);
  const opened = stats.statTable({ measure: "count", by: ["Type"], cols: ["Lieu"], top: 1 }, many, valueOf, { expanded: () => true });
  assert.deepEqual(opened.headers[0].map((header) => [header.label, header.revealed]), [["L0", false], ["L1", true], ["L2", true]]);
});

test("épinglées en tête, identifiants neufs", () => {
  const list = [{ id: "a" }, { id: "b", pinned: true }, { id: "c" }, { id: "d", pinned: true }];
  assert.deepEqual(stats.pinnedFirst(list).map((stat) => stat.id), ["b", "d", "a", "c"]);
  let step = 0;
  const id = stats.newStatId([{ id: "st-000000" }], () => (step++ === 0 ? 0 : 0.5));
  assert.match(id, /^st-[0-9a-z]{6}$/);
  assert.notEqual(id, "st-000000");
});
