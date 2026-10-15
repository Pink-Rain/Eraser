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

test("une vue montre la même forme qu'un bloc de page : la sienne, la version, le preset, sinon celle de l'onglet", () => {
  const stored = { Bibliothèque: presentations.parseTabPresentations({ kanban: { kind: "kanban", kanbanColumn: "Rang" }, named: [{ id: "serre", name: "Serré", layout: { kind: "kanban", kanbanColumn: "Lieu", laneWidth: "narrow" } }] }) };
  const presets = [{ id: "p1", name: "Kanban large", layout: { kind: "kanban", kanbanColumn: "Absente", laneWidth: "wide" } }, { id: "p2", name: "Une liste", layout: { kind: "list", compact: true } }];
  const context = { tab: "Bibliothèque", headers: ["Nom", "Rang", "Lieu"], presentations: stored, presets };
  const resolve = (view) => saved.resolveSavedViewPresentation(view, context);
  assert.deepEqual(resolve({ kind: "kanban" }), { kind: "kanban", kanbanColumn: "Rang" }, "celle de l'onglet");
  assert.deepEqual(resolve({ kind: "kanban", shape: { from: "variant", id: "serre" } }), { kind: "kanban", kanbanColumn: "Lieu", laneWidth: "narrow" });
  // Un preset : ses colonnes absentes de l'onglet sont retirées, le reste est gardé.
  assert.deepEqual(resolve({ kind: "kanban", shape: { from: "preset", id: "p1" } }), { kind: "kanban", laneWidth: "wide" });
  // Un preset ou une version d'un autre genre, ou disparus : la forme de l'onglet.
  assert.deepEqual(resolve({ kind: "kanban", shape: { from: "preset", id: "p2" } }), { kind: "kanban", kanbanColumn: "Rang" });
  assert.deepEqual(resolve({ kind: "kanban", shape: { from: "variant", id: "disparue" } }), { kind: "kanban", kanbanColumn: "Rang" });
  assert.deepEqual(resolve({ kind: "list", shape: { from: "own", layout: { kind: "list", numbered: true, fields: ["Rang", "Absente"] } } }), { kind: "list", numbered: true, fields: ["Rang"] });
  // Un onglet sans réglage : les réglages d'office.
  assert.deepEqual(resolve({ kind: "codex" }), { kind: "codex" });
  for (const kind of ["table", "cards", "stats"]) assert.equal(resolve({ kind }), null, kind);
});

test("les filtres personnels du tableau deviennent le filtre d'une vue, et ce qui ne passe pas est dit", () => {
  const headerOf = (key) => key.startsWith("__") ? undefined : key;
  const { filter, skipped } = saved.filterFromGridFilters({
    Type: { condition: { type: "contains", value: " rune " }, hidden: ["Matériau", ""] },
    Prix: { condition: { type: "gte", value: "10" } },
    Rang: { condition: { type: "gt", value: "2" } },
    __proprietaire: { hidden: ["Lina"] },
    Nom: { condition: { type: "none", value: "" } },
  }, headerOf);
  assert.deepEqual(filter, { match: "toutes", conditions: [
    { column: "Type", operator: "contient", value: "rune" },
    { column: "Type", operator: "n-est-pas", value: "Matériau" },
    { column: "Type", operator: "non-vide", value: "" },
    { column: "Rang", operator: "superieur", value: "2" },
  ] });
  assert.deepEqual(skipped, ["Prix", "__proprietaire"]);
  // Les lignes gardées : les mêmes que le tableau filtré (pour ce qui passe).
  const view = { filter };
  assert.equal(saved.matchesSavedView(view, (column) => ({ Type: "Rune de feu", Rang: "3" })[column] ?? ""), true);
  assert.equal(saved.matchesSavedView(view, (column) => ({ Type: "Matériau", Rang: "3" })[column] ?? ""), false);
  assert.equal(saved.matchesSavedView(view, (column) => ({ Type: "Rune", Rang: "1" })[column] ?? ""), false);
  assert.deepEqual(saved.filterFromGridFilters({}, headerOf), { skipped: [] });
  assert.match(saved.newSavedViewId(), /^vue-[a-z0-9]+$/);
});

test("un bloc de page qui montre une vue (D4) : la vue règle la forme, le filtre et le tri, la page garde le reste", () => {
  const view = { id: "vue-boss", index: "creatures", name: "Les boss", source: "Bestiaire", kind: "kanban", shape: { from: "variant", id: "serre" }, filter: { match: "toutes", conditions: [{ column: "Type", operator: "est", value: "Boss" }] }, sort: { column: "Niveau", desc: true }, position: 2 };
  // La copie gardée par le bloc (son dernier enregistrement) : un ancien tableau trié par nom, avec une carte.
  const block = pages.cleanBlock({ id: "b1", type: "view", index: "creatures", tab: "Ancien onglet", kind: "cards", cardId: "c-1", sort: { column: "Nom", desc: false }, click: "-", limit: 6, height: "md", heading: "Boss du chapitre", rowMatch: "Lieu", ignoreSearch: true, savedViewId: "vue-boss" });
  assert.equal(block.savedViewId, "vue-boss", "le lien se garde à l'enregistrement");
  const shown = saved.linkedBlock(block, view);
  assert.deepEqual({ tab: shown.tab, kind: shown.kind, presetId: shown.presetId, where: shown.where, sort: shown.sort, cardId: shown.cardId, click: shown.click }, { tab: "Bestiaire", kind: "kanban", presetId: "vue:serre", where: view.filter, sort: view.sort, cardId: undefined, click: undefined });
  assert.deepEqual({ limit: shown.limit, height: shown.height, heading: shown.heading, rowMatch: shown.rowMatch, ignoreSearch: shown.ignoreSearch }, { limit: 6, height: "md", heading: "Boss du chapitre", rowMatch: "Lieu", ignoreSearch: true });
  // Vue retirée, illisible, ou d'un autre identifiant : la copie du bloc, telle quelle.
  assert.equal(saved.linkedBlock(block, null), block);
  assert.equal(saved.linkedBlock(block, { ...view, id: "autre" }), block);
  // L'onglet stat n'est pas une vue qu'un bloc montre.
  assert.equal(saved.linkedBlock({ ...block, savedViewId: "s" }, { ...view, id: "s", kind: "stats" }).kind, "cards");
  // Une vue de tous les onglets : l'onglet reste celui du bloc.
  assert.equal(saved.linkedBlock(block, { ...view, source: "*" }).tab, "Ancien onglet");
  // Détacher : la vue d'aujourd'hui devient la copie du bloc, qui se relit sans perte.
  const detached = pages.cleanBlock({ ...block, ...saved.linkedBlockFields(block, view), savedViewId: undefined });
  assert.equal(detached.savedViewId, undefined);
  assert.deepEqual({ tab: detached.tab, kind: detached.kind, presetId: detached.presetId, where: detached.where, sort: detached.sort }, { tab: "Bestiaire", kind: "kanban", presetId: "vue:serre", where: view.filter, sort: view.sort });
  // Une forme propre à la vue passe telle quelle.
  const own = saved.linkedBlock(block, { ...view, shape: { from: "own", layout: { kind: "list", compact: true } }, kind: "list" });
  assert.deepEqual([own.kind, own.layout, own.presetId], ["list", { kind: "list", compact: true }, undefined]);
});

test("les pages qui montrent une vue : version en cours et publiée, corbeille exclue, par index", () => {
  const block = (id, savedViewId, index = "creatures") => ({ id, type: "view", vis: "tous", index, tab: "Bestiaire", kind: "table", limit: 0, height: "auto", heading: "", rowMatch: "", savedViewId });
  const page = (id, sections, extra = {}) => ({ id, title: `Page ${id}`, slug: id, place: "wiki", campaignId: "", trashedAt: "", published: null, sections, ...extra });
  const section = (...blocks) => [{ id: "s", cols: [blocks] }];
  const uses = pages.savedViewUses([
    page("a", section(block("1", "vue-boss"), block("2", "vue-boss"))),
    page("b", section(), { published: { sections: section(block("3", "vue-boss")) } }),
    page("c", section(block("4", "vue-boss")), { trashedAt: "2026-10-15" }),
    page("d", section(block("5", "vue-boss", "places"), block("6", "vue-autre"))),
  ], "creatures");
  assert.deepEqual(Object.keys(uses).sort(), ["vue-autre", "vue-boss"]);
  assert.deepEqual(uses["vue-boss"].map((entry) => entry.id), ["a", "b"]);
  assert.ok(uses["vue-boss"][0].href);
});
