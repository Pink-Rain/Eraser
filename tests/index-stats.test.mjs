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

/* ---------- Statistiques enrichies (maquette validée) et colonnes regroupées ---------- */

// L'Index des items : rareté et emplacement, principal et secondaire.
const items = [
  { tab: "Objets", Nom: "Canot", Type: "Transport", Prix: "2 PO", "Rareté principale": "Commun", "Emplacement principal": "Bateau", "Rareté secondaire": "Rare", "Emplacement secondaire": "Marché ordinaire" },
  { tab: "Objets", Nom: "Poêle", Type: "Utilitaire", Prix: "5 PC", "Rareté principale": "Très commun", "Emplacement principal": "Donjon, Ville", "Rareté secondaire": "Commun", "Emplacement secondaire": "Jungle" },
  { tab: "Objets", Nom: "Miroir", Type: "Décoratif", Prix: "1 PO", "Rareté principale": "Rare", "Emplacement principal": "Maison", "Rareté secondaire": "", "Emplacement secondaire": "" },
  { tab: "Armes", Nom: "Dague", Type: "Arme", Prix: "50 PC", "Rareté principale": "Très commun", "Emplacement principal": "Armurier", "Rareté secondaire": "Rare", "Emplacement secondaire": "Donjon" },
  { tab: "Armes", Nom: "Encre", Type: "Arme", Prix: "", "Rareté principale": "", "Emplacement principal": "", "Rareté secondaire": "", "Emplacement secondaire": "" },
];
const rarityOrder = ["Très commun", "Commun", "Très peu commun", "Rare", "Très rare", "Ultime"];
const itemOrder = (column) => /^Rareté/.test(column) ? rarityOrder : [];
const rarity = { id: "g-rar", name: "Rareté (P+S)", columns: ["Rareté principale", "Rareté secondaire"] };
const place = { id: "g-emp", name: "Emplacement (P+S)", columns: ["Emplacement principal", "Emplacement secondaire"] };
const env = { valueOf, tabOf, orderOf: itemOrder, groups: [rarity, place] };
const counts = (prepared, column) => stats.groupStatRows(prepared.units, prepared.valueOf, column, { order: prepared.orderOf(column) }).map((group) => [stats.statKeyLabel(group), group.rows.length]);

test("une ancienne statistique se relit à l'identique ; les nouveaux réglages sont gardés et bornés", () => {
  const old = { id: "st-old", title: "Raretés", measure: "count", by: ["Rareté"], cols: ["Type"], form: "table", top: 6, percent: "row" };
  assert.deepEqual(stats.cleanStat(old), old);
  const fresh = stats.cleanStat({
    id: "st-new", title: "Nouvelle", measure: "count", by: ["Type"], cols: ["Rareté principale"], blocks: [["Rareté secondaire", "Type"], [], ["Emplacement principal"], ["Nom"]], form: "table", top: 4, percent: "parent",
    where: [{ column: "Attributs", operator: "contient", value: "Poison", or: [{ column: "Attributs", operator: "contient", value: "Saignante" }, { column: "x", operator: "bidon", value: "" }] }, { column: "Rareté principale", operator: "au-moins", value: "Rare" }],
    joined: true, once: true, compare: "rest", goal: 12, hist: { field: "Prix" }, colors: { mode: "value", hue: "#ABCDEF", ramp: "rouge", values: { Rare: "#285f8f", Commun: "pas une couleur" } }, evil: 1,
  });
  assert.deepEqual(fresh, {
    id: "st-new", title: "Nouvelle", measure: "count", by: ["Type"], cols: ["Rareté principale"], blocks: [["Rareté secondaire"], ["Emplacement principal"]], form: "table", top: 4,
    where: [{ column: "Attributs", operator: "contient", value: "Poison", or: [{ column: "Attributs", operator: "contient", value: "Saignante" }] }, { column: "Rareté principale", operator: "au-moins", value: "Rare" }],
    joined: true, once: true, colors: { mode: "value", hue: "#abcdef", values: { Rare: "#285f8f" } },
  });
  // « % du parent » : seulement avec deux niveaux de lignes ; la comparaison : seulement tuile, barres, colonnes.
  assert.equal(fresh.percent, undefined);
  assert.equal(stats.cleanStat({ id: "p", by: ["Type", "Nom"], form: "table", percent: "parent" }).percent, "parent");
  // Chaque forme garde ses propres réglages.
  assert.deepEqual(stats.cleanStat({ id: "h", by: [], form: "histogram", hist: { field: "Prix", bins: 8, scale: "log" }, goal: 3 }).hist, { field: "Prix", bins: 8, scale: "log" });
  assert.equal(stats.cleanStat({ id: "h", by: [], form: "histogram", hist: { field: "Prix", bins: 7, scale: "?" } }).hist.bins, 6);
  assert.equal(stats.cleanStat({ id: "g", by: [], form: "gauge", goal: 50 }).goal, 50);
  assert.equal(stats.cleanStat({ id: "g", by: [], form: "gauge", goal: -1 }).goal, undefined);
  assert.deepEqual(stats.cleanStat({ id: "s", by: ["Type"], form: "scatter", scatter: { x: "Prix", y: "Valeur" } }).scatter, { x: "Prix", y: "Valeur" });
  const compared = stats.cleanStat({ id: "c", by: ["Type"], form: "bars", compare: "filter", compareWhere: [{ column: "Onglet", operator: "est", value: "Armes" }] });
  assert.deepEqual([compared.compare, compared.compareWhere], ["filter", [{ column: "Onglet", operator: "est", value: "Armes" }]]);
  assert.equal(stats.cleanStat({ id: "c", by: ["Type"], form: "bars", compare: "filter", compareWhere: [] }).compare, undefined);
  assert.equal(stats.cleanStat({ id: "c", by: ["Type"], form: "ranking", compare: "rest" }).compare, undefined);
  // Les anciennes statistiques gardées dans un onglet stat (alpha 197) aussi.
  assert.deepEqual(layouts.cleanViewLayout({ kind: "stats", stats: [old] }).stats, [old]);
});

test("l'enregistrement d'un index : les anciennes entrées sans groupes se lisent, les groupes se nettoient", () => {
  const old = { stats: [{ id: "a", title: "A", measure: "count", by: [], form: "number" }] };
  assert.deepEqual(stats.cleanStatsRecord(old), { stats: old.stats, groups: [] });
  assert.deepEqual(stats.cleanStatsRecord(null), { stats: [], groups: [] });
  const groups = stats.cleanColumnGroups([
    { id: "g-1", name: " Rareté  (P+S) ", columns: ["Rareté principale", "Rareté secondaire", "rareté principale"] },
    { id: "g-1", name: "Rareté (P+S)", columns: ["A", "B"] },
    { id: "!!", columns: ["Emplacement principal", "Emplacement secondaire", "groupe:g-1"] },
    { id: "g-3", name: "Seul", columns: ["A"] },
    "abîmé",
  ]);
  assert.deepEqual(groups, [
    { id: "g-1", name: "Rareté (P+S)", columns: ["Rareté principale", "Rareté secondaire"] },
    { id: "g-1-2", name: "Rareté (P+S) 2", columns: ["A", "B"] },
    { id: "g-3", name: "Emplacement (P+S)", columns: ["Emplacement principal", "Emplacement secondaire"] },
  ]);
});

test("familles de colonnes jumelles : principale/secondaire, P./S., 1/2/3", () => {
  const columns = ["Nom", "Type", "Sous-type", "Rareté principale", "Emplacement principal", "Rareté secondaire", "Emplacement secondaire", "Dégâts P.", "Dégâts S.", "Attaque 1", "Attaque 2", "Attaque 3", "Effets"];
  assert.deepEqual(stats.columnFamilies(columns), [
    { name: "Rareté (P+S)", columns: ["Rareté principale", "Rareté secondaire"] },
    { name: "Emplacement (P+S)", columns: ["Emplacement principal", "Emplacement secondaire"] },
    { name: "Dégâts (P+S)", columns: ["Dégâts P.", "Dégâts S."] },
    { name: "Attaque (1+2+3)", columns: ["Attaque 1", "Attaque 2", "Attaque 3"] },
  ]);
  assert.deepEqual(stats.suggestColumnGroups(columns, [rarity]).map((family) => family.name), ["Emplacement (P+S)", "Dégâts (P+S)", "Attaque (1+2+3)"]);
  assert.deepEqual(stats.memberLabels(["Rareté principale", "Rareté secondaire"]), ["principale", "secondaire"]);
  assert.deepEqual(stats.memberLabels(["Dégâts P.", "Dégâts S."]), ["P.", "S."]);
  assert.deepEqual(stats.memberLabels(["Force", "Agilité"]), ["Force", "Agilité"]);
  assert.equal(stats.defaultGroupName(["Force", "Agilité"]), "Force + Agilité");
  assert.equal(stats.statColumnLabel([rarity], "groupe:g-rar"), "Rareté (P+S)");
  assert.equal(stats.statColumnLabel([rarity], stats.RANK_COLUMN), "Rang dans le groupe");
  assert.equal(stats.statColumnLabel([], "groupe:g-x"), "Groupe supprimé");
});

test("un groupe compte un emplacement par colonne remplie ; une ligne vide compte une fois", () => {
  const stat = { id: "x", title: "", measure: "count", by: ["groupe:g-rar"], form: "bars" };
  const prepared = stats.prepareStat(stat, items, env);
  assert.equal(prepared.size, 2);
  // Canot (C+R), Poêle (TC+C), Miroir (R), Dague (TC+R), Encre (rien : une fois, sans valeur).
  assert.equal(prepared.units.length, 8);
  assert.deepEqual(counts(prepared, "groupe:g-rar"), [["Très commun", 2], ["Commun", 2], ["Rare", 3], ["Sans valeur", 1]]);
  assert.equal(stats.unitRows(prepared.units).length, 5);
  assert.deepEqual(counts(prepared, stats.RANK_COLUMN), [["principale", 5], ["secondaire", 3]]);
  // « Une seule fois par valeur » : des lignes, chacune dans chacune de ses raretés.
  const once = stats.prepareStat({ ...stat, once: true }, items, env);
  assert.equal(once.size, 0);
  assert.deepEqual(counts(once, "groupe:g-rar"), [["Très commun", 2], ["Commun", 2], ["Rare", 3], ["Sans valeur", 1]]);
  const twice = items.concat([{ tab: "Objets", Nom: "Double", "Rareté principale": "Rare", "Rareté secondaire": "Rare" }]);
  assert.deepEqual(counts(stats.prepareStat(stat, twice, env), "groupe:g-rar").find(([label]) => label === "Rare"), ["Rare", 5]);
  assert.deepEqual(counts(stats.prepareStat({ ...stat, once: true }, twice, env), "groupe:g-rar").find(([label]) => label === "Rare"), ["Rare", 4]);
});

test("deux groupes de même taille s'alignent rang par rang (rareté P avec emplacement P)", () => {
  const stat = { id: "x", title: "", measure: "count", by: ["groupe:g-rar"], cols: ["groupe:g-emp"], form: "cross", top: 0 };
  const prepared = stats.prepareStat(stat, items, env);
  const table = stats.statTable(stat, prepared.units, prepared.valueOf, { orderOf: prepared.orderOf });
  const cell = (row, column) => { const node = table.total.children.find((entry) => entry.label === row); const index = table.leaves.findIndex((labels) => labels[0] === column); return node.cells[index].value; };
  // Rare : Canot (secondaire → Marché ordinaire), Miroir (principal → Maison), Dague (secondaire → Donjon).
  assert.equal(cell("Rare", "Marché ordinaire"), 1);
  assert.equal(cell("Rare", "Maison"), 1);
  assert.equal(cell("Rare", "Donjon"), 1);
  assert.equal(cell("Rare", "Bateau"), null);
  // Très commun : Poêle (principal → Donjon, Ville), Dague (principal → Armurier).
  assert.equal(cell("Très commun", "Donjon"), 1);
  assert.equal(cell("Très commun", "Ville"), 1);
  assert.equal(cell("Très commun", "Armurier"), 1);
});

test("conditions : « ou », ordre des listes, groupes (une colonne suffit, ou rang par rang)", () => {
  const either = { column: "Type", operator: "est", value: "Arme", or: [{ column: "Type", operator: "est", value: "Transport" }] };
  assert.deepEqual(stats.statRows({ where: [either] }, items, valueOf).map((row) => row.Nom), ["Canot", "Dague", "Encre"]);
  assert.deepEqual(stats.statRows({ where: [either, { column: "Prix", operator: "non-vide", value: "" }] }, items, valueOf).map((row) => row.Nom), ["Canot", "Dague"]);
  assert.deepEqual(stats.statRows({ where: [{ column: "Rareté principale", operator: "au-moins", value: "Commun" }] }, items, valueOf, undefined, itemOrder).map((row) => row.Nom), ["Canot", "Miroir"]);
  assert.deepEqual(stats.statRows({ where: [{ column: "Rareté principale", operator: "au-plus", value: "Commun" }] }, items, valueOf, undefined, itemOrder).map((row) => row.Nom), ["Canot", "Poêle", "Dague"]);
  assert.deepEqual(stats.statRows({ where: [{ column: "Rareté principale", operator: "superieur", value: "Commun" }] }, items, valueOf, undefined, itemOrder).map((row) => row.Nom), ["Miroir"]);
  assert.equal(stats.matchStatCondition({ column: "Prix", operator: "au-moins", value: "2" }, "2 PO"), true);
  assert.equal(stats.matchStatCondition({ column: "Prix", operator: "au-plus", value: "1,5" }, "2 PO"), false);
  // Une condition sur un groupe, compté par lignes : vraie si une de ses colonnes la remplit.
  const any = stats.prepareStat({ id: "x", title: "", measure: "count", by: ["Type"], where: [{ column: "groupe:g-rar", operator: "est", value: "Rare" }], form: "bars" }, items, env);
  assert.deepEqual(stats.unitRows(any.units).map((row) => row.Nom), ["Canot", "Miroir", "Dague"]);
  // … et rang par rang quand la statistique compte des emplacements de ce groupe.
  const slots = stats.prepareStat({ id: "x", title: "", measure: "count", by: ["groupe:g-emp"], where: [{ column: "groupe:g-rar", operator: "est", value: "Rare" }], form: "bars" }, items, env);
  assert.deepEqual(counts(slots, "groupe:g-emp").map(([label]) => label), ["Donjon", "Maison", "Marché ordinaire"]);
});

test("comparé au reste de l'index, ou à d'autres lignes", () => {
  const stat = { id: "x", title: "", measure: "count", by: [], where: [{ column: "Type", operator: "est", value: "Arme" }], form: "number", compare: "rest" };
  const rest = stats.prepareStat(stat, items, env);
  assert.deepEqual([rest.units.length, rest.other.length], [2, 3]);
  const other = stats.prepareStat({ ...stat, compare: "filter", compareWhere: [{ column: "Prix", operator: "contient", value: "PO" }] }, items, env);
  assert.deepEqual(other.other.map((unit) => unit.row.Nom), ["Canot", "Miroir"]);
  assert.equal(stats.prepareStat({ ...stat, compare: undefined }, items, env).other, null);
  assert.equal(stats.autoStatTitle(stat), "Nombre de lignes · Type est « Arme » · contre le reste");
});

test("histogramme : tranches rondes, paliers ×10, dernière tranche fermée", () => {
  assert.equal(stats.niceStep(100, 6), 20);
  assert.equal(stats.niceStep(7, 4), 2);
  const linear = stats.histogramBins([0, 5, 10, 25, 40], 4, "auto");
  assert.equal(linear.log, false);
  assert.deepEqual(linear.bins.map((bin) => [bin.from, bin.to]), [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50]]);
  const log = stats.histogramBins([0, 1, 3, 40, 900, 5000], 8, "auto");
  assert.equal(stats.histogramBins([0, 1, 3, 40, 900, 5000], 6, "auto").bins.length, 5);
  assert.equal(log.log, true);
  assert.deepEqual(log.bins.map((bin) => bin.zero ? "0" : `${bin.from}-${bin.to}`), ["0", "1-3", "3-10", "10-30", "30-100", "100-300", "300-1000", "1000-3000", "3000-10000"]);
  const values = [{ Prix: "1 PO" }, { Prix: "2 PO" }, { Prix: "4 PO" }, { Prix: "" }];
  const histogram = stats.statHistogram(values, valueOf, "Prix", 3, "lin");
  assert.deepEqual([histogram.withValue, histogram.without], [3, 1]);
  assert.equal(histogram.bins.reduce((total, bin) => total + bin.rows.length, 0), 3);
  assert.equal(stats.statHistogram([{ Prix: "10" }, { Prix: "20" }], valueOf, "Prix", 2, "lin").bins.at(-1).rows.length, 1);
});

test("formes permises : chaque forme dit ce qu'il faut changer", () => {
  const base = { measure: "count", by: [], form: "number" };
  const one = { ...base, by: ["Type"] };
  const cross = { ...base, by: ["Type"], cols: ["Rareté"] };
  const ok = (stat, form, context) => stats.formProblem(stat, form, context) === "";
  assert.ok(ok(base, "gauge") && ok(base, "histogram") && ok(base, "number"));
  assert.ok(!ok(one, "gauge") && !ok(one, "histogram"));
  assert.ok(ok(one, "bars") && ok(one, "columns") && ok(one, "ranking") && ok(one, "donut") && ok(one, "treemap") && ok(one, "scatter") && ok(one, "table"));
  assert.ok(!ok(one, "columns", { distinct: 17 }));
  assert.ok(!ok(one, "scatter", { slots: true }) && !ok(base, "scatter", { numeric: 1 }));
  assert.ok(!ok({ ...one, compare: "rest" }, "donut"));
  assert.ok(ok({ ...base, by: ["Type", "Sous-type"] }, "treemap") && !ok({ ...base, by: ["A", "B", "C"] }, "treemap"));
  assert.ok(ok(cross, "stacked") && ok(cross, "stacked100") && ok(cross, "grouped") && ok(cross, "cross") && ok(cross, "sankey") && ok(cross, "table"));
  assert.ok(!ok({ ...cross, measure: "average", field: "Prix" }, "stacked") && ok({ ...cross, measure: "average", field: "Prix" }, "grouped"));
  assert.ok(ok({ ...base, by: ["Type", "Rareté"] }, "sankey") && !ok({ ...base, by: ["Type", "Rareté"] }, "cross"));
  assert.ok(!ok({ ...cross, blocks: [["Lieu"]] }, "cross") && ok({ ...cross, blocks: [["Lieu"]] }, "table"));
  assert.ok(!ok(one, "stacked") && !ok(cross, "bars"));
  // L'ajustement : comparaison et blocs suivent la forme.
  const fitted = stats.fitForm({ id: "a", title: "", measure: "count", by: ["Type"], form: "donut", compare: "rest" });
  assert.equal(fitted.form, "bars");
  assert.equal(stats.fitForm({ id: "a", title: "", measure: "count", by: ["Type"], form: "ranking", compare: "rest" }).compare, undefined);
  assert.deepEqual(stats.fitForm({ id: "a", title: "", measure: "count", by: ["Type"], cols: [], blocks: [["Lieu"]], form: "table" }).cols, ["Lieu"]);
  assert.equal(stats.fitForm({ id: "a", title: "", measure: "count", by: ["Type"], cols: ["Rareté"], form: "sankey" }).top, 6);
  assert.deepEqual(stats.percentChoices({ measure: "count", form: "table", by: ["A", "B"] }).map((choice) => choice.value), ["none", "total", "row", "column", "parent"]);
  assert.deepEqual(stats.percentChoices({ measure: "count", form: "columns" }).map((choice) => choice.value), ["none", "total"]);
});

test("tableau à niveaux : blocs côte à côte, groupe de colonnes replié en sous-total", () => {
  const stat = { measure: "count", by: ["Type"], cols: ["Rareté principale", "Emplacement principal"], blocks: [["Rareté secondaire"]], top: 0 };
  const table = stats.statTable(stat, items, valueOf, { orderOf: itemOrder });
  assert.equal(table.blocks.length, 2);
  assert.deepEqual(table.blocks.map((block) => block.columns), [["Rareté principale", "Emplacement principal"], ["Rareté secondaire"]]);
  assert.equal(table.leafInfo.filter((leaf) => leaf.block === 1).length, table.blocks[1].width);
  assert.ok(table.headers[0].some((header) => header.block === 1 && header.leaf));
  const closed = stats.statTable(stat, items, valueOf, { orderOf: itemOrder, closed: (block, key) => block === 0 && key === "très commun" });
  const folded = closed.headers[0].find((header) => header.key === "très commun");
  assert.deepEqual([folded.closed, folded.leaf, folded.span], [true, true, 1]);
  const index = closed.leafInfo.findIndex((leaf) => leaf.closed);
  assert.equal(closed.total.cells[index].value, 2);
});

test("mosaïque et nuage de points", () => {
  const boxes = stats.squarify([{ value: 6 }, { value: 3 }, { value: 1 }], 0, 0, 100, 50);
  assert.equal(boxes.length, 3);
  assert.ok(Math.abs(boxes.reduce((total, box) => total + box.w * box.h, 0) - 5000) < 1e-6);
  const points = stats.statScatter([{ a: "1", b: "2" }, { a: "1", b: "2" }, { a: "3", b: "" }, { a: "4", b: "5" }], valueOf, "a", "b");
  assert.deepEqual(points.map((point) => [point.x, point.y, point.rows.length]), [[1, 2, 2], [4, 5, 1]]);
  assert.equal(stats.scatterAxis([1, 5000]).log, true);
  assert.equal(stats.scatterAxis([1, 50]).log, false);
});

test("chaque forme se dessine (page serveur), groupes compris", async () => {
  const { default: React } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { IndexStats } = await vite.ssrLoadModule("/components/eraser/index-stats.tsx");
  const keys = items.map((_, index) => String(index));
  const props = (stat) => ({
    stats: [{ ...stat, id: "st-1", title: "Essai", pinned: true }], groups: [rarity, place], rows: keys,
    columns: ["Nom", "Type", "Prix", "Rareté principale", "Emplacement principal", "Rareté secondaire", "Emplacement secondaire", "Onglet"], tabs: ["Objets", "Armes"],
    valueOf: (key, column) => column === "Onglet" ? items[Number(key)].tab : items[Number(key)][column] ?? "", tabOf: (key) => items[Number(key)].tab, nameOf: (key) => items[Number(key)].Nom,
    optionsOf: (column) => itemOrder(column).map((value) => ({ value })), canEdit: true, onSave: async () => {}, onOpen: () => {},
  });
  const forms = [
    { form: "number", by: [] }, { form: "number", by: [], compare: "rest", where: [{ column: "Type", operator: "est", value: "Arme" }] }, { form: "gauge", by: [], goal: 10 },
    { form: "bars", by: ["groupe:g-rar"] }, { form: "bars", by: ["Type"], compare: "rest", where: [{ column: "Onglet", operator: "est", value: "Armes" }] }, { form: "columns", by: ["Rareté principale"] }, { form: "ranking", by: ["Type"] },
    { form: "donut", by: ["groupe:g-emp"] }, { form: "treemap", by: ["Type", "Rareté principale"] }, { form: "stacked", by: ["Type"], cols: ["groupe:g-rar"] },
    { form: "stacked100", by: ["Type"], cols: ["Rareté principale"] }, { form: "grouped", by: ["Type"], cols: ["Rareté principale"] }, { form: "sankey", by: ["groupe:g-rar"], cols: ["groupe:g-emp"] },
    { form: "cross", by: ["groupe:g-rar"], cols: ["groupe:g-emp"], percent: "row" }, { form: "table", by: ["Type", "Nom"], cols: ["groupe:g-rar", stats.RANK_COLUMN], blocks: [["Emplacement principal"]], percent: "parent" },
    { form: "histogram", by: [], hist: { field: "Prix", bins: 4, scale: "auto" } }, { form: "scatter", by: ["Type"], scatter: { x: "Prix", y: "Prix" } },
  ];
  for (const entry of forms) {
    const stat = stats.cleanStat({ measure: "count", ...entry, id: "st-1" });
    assert.equal(stat.form, entry.form, `forme gardée : ${entry.form}`);
    const html = renderToStaticMarkup(React.createElement(IndexStats, props(stat)));
    assert.match(html, /Constructeur de statistique/, entry.form);
    const pinned = renderToStaticMarkup(React.createElement(IndexStats, { ...props(stat), pinnedOnly: true, canEdit: false }));
    assert.match(pinned, /Statistiques épinglées/, entry.form);
  }
  // Les emplacements se disent dans la phrase ; « fusionner » propose le groupe.
  const grouped = renderToStaticMarkup(React.createElement(IndexStats, props(stats.cleanStat({ id: "st-1", measure: "count", by: ["groupe:g-rar"], form: "bars" }))));
  assert.match(grouped, /les emplacements/);
  assert.match(grouped, /Colonnes regroupées/);
  const twins = renderToStaticMarkup(React.createElement(IndexStats, props(stats.cleanStat({ id: "st-1", measure: "count", by: ["Type"], cols: ["Rareté principale"], blocks: [["Rareté secondaire"]], form: "table" }))));
  assert.match(twins, /fusionner principale et secondaire/);
});
