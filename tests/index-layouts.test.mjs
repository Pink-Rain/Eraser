import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const layouts = await vite.ssrLoadModule("/lib/index-layouts.ts");

const sample = {
  aside: [{ column: "Portrait" }],
  asideWidth: "lg",
  sections: [
    { id: "a", title: "Identité", rows: [{ id: "r1", fields: [{ column: "Nom", span: 8, large: true }, { column: "Rang", span: 4 }] }] },
    { id: "b", framed: true, rows: [{ id: "r2", fields: [{ column: "Description", span: 12, hideLabel: true }] }] },
  ],
};

test("une mise en page se relit telle qu'enregistrée, et rien d'autre", () => {
  const parsed = layouts.parseIndexLayout(JSON.stringify(sample));
  assert.deepEqual(parsed, sample);
  assert.equal(layouts.parseIndexLayout(""), null);
  assert.equal(layouts.parseIndexLayout("pas du json"), null);
  assert.equal(layouts.parseIndexLayout({ aside: [], sections: [] }), null);
  // Largeur inconnue écartée, colonne en double gardée une seule fois.
  const cleaned = layouts.parseIndexLayout({ aside: [{ column: "Nom" }], sections: [{ rows: [{ fields: [{ column: "Nom", span: 5 }, { column: "Rang", span: 7 }] }] }] });
  assert.deepEqual(cleaned.sections[0].rows[0].fields, [{ column: "Rang" }]);
});

test("les champs se rangent selon la mise en page, le reste à la suite ou masqué", () => {
  const items = ["Nom", "Rang", "Portrait", "Description", "Habitat"].map((header) => ({ header }));
  const arranged = layouts.arrangeLayout(sample, items, (item) => item.header);
  assert.deepEqual(arranged.aside.map((field) => field.item.header), ["Portrait"]);
  assert.deepEqual(arranged.sections[0].rows[0].fields.map((field) => [field.item.header, field.span]), [["Nom", 8], ["Rang", 4]]);
  assert.deepEqual(arranged.rest.map((item) => item.header), ["Habitat"]);
  assert.deepEqual(layouts.arrangeLayout({ ...sample, rest: "hide" }, items, (item) => item.header).rest, []);
  // Une colonne disparue est sautée ; une ligne, puis une section sans titre, vides disparaissent.
  const without = layouts.arrangeLayout(sample, items.filter((item) => item.header !== "Description"), (item) => item.header);
  assert.deepEqual(without.sections.map((section) => section.id), ["a"]);
});

test("une colonne renommée garde sa place dans la mise en page", () => {
  const renamed = layouts.renameLayoutColumns({ ...sample, subtitle: "Rang" }, new Map([["rang", "Niveau"]]));
  assert.equal(renamed.sections[0].rows[0].fields[1].column, "Niveau");
  assert.equal(renamed.subtitle, "Niveau");
  assert.equal(layouts.tabLayout({ "Créatures": { form: sample } }, "creatures", "form"), sample);
  assert.equal(layouts.tabLayout({ "Créatures": { form: sample } }, "creatures", "hover"), null);
});

test("la mise en page de départ ressemble à l'affichage automatique", () => {
  const start = layouts.startingLayout([{ header: "Nom", name: true }, { header: "Image", picture: true }, { header: "Rang" }, { header: "Type" }, { header: "Description", long: true }]);
  assert.deepEqual(start.aside, [{ column: "Image" }]);
  assert.deepEqual(start.sections[0].rows.map((row) => row.fields.map((field) => field.column)), [["Nom"], ["Rang", "Type"], ["Description"]]);
});

test("la fiche des créatures a sa mise en page d'Eraser tant qu'aucune n'est réglée, et chaque champ peut porter son libellé", async () => {
  const defaults = await vite.ssrLoadModule("/lib/index-layout-defaults.ts");
  const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  const builtin = defaults.builtinLayoutFor("creatures", "Créatures", "form");
  assert.equal(builtin.aside[0].column, "Portrait");
  assert.equal(defaults.builtinLayoutFor("creatures", "Créatures", "hover"), null);
  assert.equal(defaults.builtinLayoutFor("places", "Villes", "form"), null);
  // Une mise en page réglée dans « Modifier » la remplace.
  assert.equal(defaults.tabLayoutOrBuiltin({ "Créatures": { form: sample } }, "creatures", "Créatures", "form"), sample);
  assert.equal(defaults.tabLayoutOrBuiltin({}, "creatures", "Créatures", "form"), builtin);
  // Elle se relit telle quelle (libellés compris) et range toutes les colonnes de la feuille d'origine.
  assert.deepEqual(layouts.parseIndexLayout(JSON.stringify(builtin)), builtin);
  const headers = definitions.worldIndexDefinitions.creatures.tabs[0].headers;
  const placed = [...builtin.aside, ...builtin.sections.flatMap((section) => section.rows.flatMap((row) => row.fields))].map((field) => field.column);
  for (const column of placed) assert.ok(headers.includes(column), column);
  const description = builtin.sections.flatMap((section) => section.rows.flatMap((row) => row.fields)).find((field) => field.column === "Description");
  assert.equal(description.label, "Description, Histoire, Lore, Autre");
  const arranged = layouts.arrangeLayout(builtin, headers.map((header) => ({ header })), (item) => item.header);
  // Les anciennes colonnes (archivées, hors de la fiche) restent à la suite tant qu'on ne les retire pas.
  assert.ok(arranged.rest.every((item) => definitions.creatureArchivedHeaders.includes(item.header) || item.header === "ID"), arranged.rest.map((item) => item.header).join(", "));
});

test("créatures : listes et types modifiables, sauf ce que recopie un compagnon", async () => {
  const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  const policy = (header) => definitions.worldColumnPolicy("creatures", "Créatures", header, []);
  assert.deepEqual([policy("Emplacement principal").rename, policy("Emplacement principal").type, policy("Emplacement principal").remove], [true, true, true]);
  assert.deepEqual([policy("Type").rename, policy("Type").type, policy("Type").remove], [false, true, false]);
  assert.deepEqual([policy("Force").rename, policy("Force").type], [false, false]);
  assert.equal(policy("Sorts actifs").type, false);
  assert.ok(policy("Sorts actifs").reasons.some((reason) => /fusion/.test(reason)));
  assert.ok(policy("Portrait").reasons.some((reason) => /token/.test(reason)));
  assert.equal(definitions.worldColumnSpec("creatures", "Créatures", "Portrait").file.store, "creature-portraits");
});

test("cadrage du token : le visage choisi recadre les avatars rognés, et resserre les petites vignettes", async () => {
  const framing = await vite.ssrLoadModule("/lib/portrait-framing-shared.ts");
  // Image deux fois plus haute que large, centrée et couvrant juste le cercle : tout au milieu.
  assert.deepEqual(framing.framingFromPlacement({ x: 256, y: 256, width: 432 }, 2, 512, 216), { x: 0.5, y: 0.5, span: 1 });
  // Agrandie deux fois et descendue : le cercle montre le haut de l'image (le visage), sur la moitié de sa largeur.
  const face = framing.framingFromPlacement({ x: 256, y: 256 + 432, width: 864 }, 2, 512, 216);
  assert.deepEqual(face, { x: 0.5, y: 0.25, span: 0.5 });
  const small = framing.framedImageStyle(face, { width: 36, height: 36 }, { width: 100, height: 200 });
  // 36 px : l'image (36 × 72) est doublée et le visage (au quart de sa hauteur) ramené au centre.
  assert.equal(small.transform, "translate(-18.0px, -18.0px) scale(2.000)");
  // Une grande carte garde l'image entière en largeur : seul le point du visage compte.
  assert.equal(framing.framedImageStyle(face, { width: 104, height: 144 }, { width: 100, height: 200 }).transform, "");
  assert.equal(framing.cleanPortraitFraming({ x: "a" }), null);
  assert.deepEqual(framing.cleanPortraitFraming({ x: 2, y: -1, span: 9 }), { x: 1, y: 0, span: 4 });
});

test("onglets-fenêtres prévus par Eraser : Actifs, Passifs et Bonus rangent les sorts comme les pages de classe", async () => {
  const defaults = await vite.ssrLoadModule("/lib/index-view-defaults.ts");
  const views = await vite.ssrLoadModule("/lib/index-views.ts");
  const spells = await vite.ssrLoadModule("/lib/class-spell-utils.ts");
  const types = [...spells.classSpellTypeSuggestions, "", "Actif - bonus de dégâts", "Passif bonus", "Réaction", "BONUS", "passif", "<b>Passif</b>"];
  const inView = (index, id, type) => views.matchesView(defaults.builtinViewsFor(index).find((view) => view.id === `eraser-${id}`), (column) => column === "Type" ? type : "");
  for (const type of types) {
    const category = spells.classSpellCategory(type.replace(/<[^>]+>/g, ""));
    // Sorts des classes : exactement l'ancien filtre de la page.
    assert.equal(inView("class-spells", "actifs", type), category === "actif", type);
    assert.equal(inView("class-spells", "passifs", type), category === "passif", type);
    assert.equal(inView("class-spells", "bonus", type), category === "bonus", type);
    // Créatures : pas de bonus, un sort ainsi typé reste avec les actifs.
    assert.equal(inView("creature-spells", "actifs", type), category !== "passif", type);
    assert.equal(inView("creature-spells", "passifs", type), category === "passif", type);
  }
  assert.deepEqual(defaults.builtinViewsFor("places"), []);
  // Ajouter depuis Passifs ou Bonus donne son Type à la ligne (vide, elle serait un actif et quitterait la vue).
  const view = (index, id) => defaults.builtinViewsFor(index).find((item) => item.id === `eraser-${id}`);
  assert.deepEqual(defaults.viewAddDefaults(view("class-spells", "passifs")), { Type: "Passif" });
  assert.deepEqual(defaults.viewAddDefaults(view("class-spells", "bonus")), { Type: "Bonus" });
  assert.deepEqual(defaults.viewAddDefaults(view("class-spells", "actifs")), {});
  assert.deepEqual(defaults.viewAddDefaults(view("creature-spells", "actifs")), {});
  assert.deepEqual(defaults.viewAddDefaults(null), {});
  assert.ok(defaults.builtinViewsFor("class-spells").every((view) => view.builtin));
  // Jamais proposée dans la fenêtre « Modifier un onglet-fenêtre », ni relue dans les réglages.
  assert.ok(!views.viewOperators.some((operator) => operator.value === "categorie-sort"));
  assert.deepEqual(views.parseViewConditions(JSON.stringify([{ column: "Type", operator: "categorie-sort", value: "actif" }])), []);
});

test("blocs, allure des sections, formulaires nommés : lus et réécrits tels quels, bornés", () => {
  const rich = {
    aside: [{ column: "Portrait", hideLabel: true }],
    asideSide: "right",
    accent: "{Couleur}",
    sections: [
      { id: "s1", title: "Caractéristiques", look: "tinted", color: "#397f88", icon: "shield", collapsible: true, columns: 2, rows: [{ id: "r1", fields: [{ column: "bloc:abc", span: 12, hideLabel: true, block: { kind: "tiles", columns: ["Force", "Dextérité"], colors: { Force: "#397f88" }, perRow: 2, short: true } }] }] },
      { id: "s2", rows: [{ id: "r2", fields: [{ column: "bloc:lvl", span: 12, block: { kind: "levels", levels: [{ label: "Niveau 1", column: "Description niveau 1" }], rules: "Règles", rulesLabel: "Règles liées" } }, { column: "Nom", span: 6, icon: "user", color: "accent", label: "Qui" }] }] },
    ],
    rest: "hide",
    icon: "Icône",
    tint: true,
    nameInAccent: true,
    width: "lg",
  };
  const parsed = layouts.parseIndexLayout(JSON.stringify(rich));
  assert.deepEqual(parsed, rich);
  // Un bloc illisible est écarté ; une clé « bloc: » sans bloc aussi ; une couleur farfelue est oubliée.
  const cleaned = layouts.parseIndexLayout({ aside: [], sections: [{ rows: [{ fields: [{ column: "bloc:x" }, { column: "bloc:y", block: { kind: "inventory", accept: "Chapeaux" } }, { column: "Nom", color: "rouge" }] }] }] });
  assert.deepEqual(cleaned.sections[0].rows[0].fields, [{ column: "bloc:y", block: { kind: "inventory", accept: "all" } }, { column: "Nom" }]);
  // Les colonnes qu'un bloc lit comptent comme placées.
  assert.equal(layouts.layoutPlaces(rich, "Force"), true);
  assert.equal(layouts.layoutPlaces(rich, "Règles"), true);
  assert.equal(layouts.layoutPlaces(rich, "Icône"), true);
  // Renommer une colonne suit dans les blocs.
  const renamed = layouts.renameLayoutColumns(rich, new Map([["force", "Puissance"], ["icone", "Emblème"]]));
  assert.deepEqual(renamed.sections[0].rows[0].fields[0].block.columns, ["Puissance", "Dextérité"]);
  assert.deepEqual(renamed.sections[0].rows[0].fields[0].block.colors, { Puissance: "#397f88" });
  assert.equal(renamed.icon, "Emblème");
  // Le rangement garde les blocs (par `blockItem`) et saute une colonne absente.
  const arranged = layouts.arrangeLayout(rich, [{ header: "Nom" }, { header: "Portrait" }], (item) => item.header, (field) => ({ header: field.column, block: field.block }));
  assert.deepEqual(arranged.sections.map((section) => section.rows.map((row) => row.fields.map((field) => field.column))), [[["bloc:abc"]], [["bloc:lvl", "Nom"]]]);
  assert.equal(arranged.asideSide, "right");
  assert.equal(arranged.sections[0].look, "tinted");
  // Les formulaires nommés d'un onglet : l'étoilé en tête sous « principal », les autres par leur identifiant.
  const entry = layouts.parseTabLayouts(JSON.stringify({ form: sample, forms: [{ id: "court", name: "Fiche courte", layout: sample }, { id: "principal", name: "doublon", layout: sample }, { id: "nul", layout: {} }] }));
  assert.deepEqual(entry.forms.map((item) => item.id), ["court"]);
  assert.deepEqual(layouts.tabFormsOf(entry).map((item) => [item.id, item.name]), [["principal", "Formulaire principal"], ["court", "Fiche courte"]]);
  assert.equal(layouts.formOf(entry, "court"), entry.forms[0].layout);
  assert.equal(layouts.formOf(entry, "inconnu"), entry.form);
  assert.equal(layouts.formOf(entry), entry.form);
  assert.equal(layouts.parseTabLayouts("{}"), null);
  // Une couleur réglée se résout pour une ligne.
  assert.equal(layouts.resolveLayoutColor("{Couleur}", "#000000", (column) => column === "Couleur" ? "#b3261e" : ""), "#b3261e");
  assert.equal(layouts.resolveLayoutColor("{Couleur}", "#000000", () => "pas une couleur"), "#000000");
  assert.equal(layouts.resolveLayoutColor(undefined, "#111111"), "#111111");
});

test("l'affichage automatique et les survols d'Eraser sont exprimés en mise en page", async () => {
  const defaults = await vite.ssrLoadModule("/lib/index-layout-defaults.ts");
  const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  const sheets = await vite.ssrLoadModule("/lib/entity-sheets.ts");
  // La fiche automatique : deux champs par ligne, les textes longs sur toute la ligne, les images à droite.
  const columns = [{ header: "Nom", spec: { kind: "name-form" } }, { header: "Portrait", spec: { kind: "file", file: { accept: "image" } } }, { header: "Type", spec: { kind: "choice" } }, { header: "Rang", spec: { kind: "number" } }, { header: "Description", spec: { kind: "rich" } }, { header: "ID", spec: { kind: "id" } }];
  const form = defaults.automaticLayoutFor("form", columns);
  assert.equal(form.asideSide, "right");
  assert.deepEqual(form.aside.map((field) => field.column), ["Portrait"]);
  assert.deepEqual(form.sections[0].rows.map((row) => row.fields.map((field) => [field.column, field.span])), [[["Nom", 6], ["Type", 6]], [["Rang", 6]], [["Description", 12]]]);
  // Le survol automatique : l'image en tête, le type en sous-titre, la description.
  const hover = defaults.automaticLayoutFor("hover", columns);
  assert.equal(hover.image, "Portrait");
  assert.equal(hover.subtitle, "Type");
  assert.deepEqual(hover.sections[0].rows[0].fields, [{ column: "Description", span: 12, hideLabel: true }]);
  assert.equal(defaults.effectiveLayoutFor({}, "places", "Villes", "form", columns).source, "automatic");
  assert.equal(defaults.effectiveLayoutFor({ Villes: { form: form } }, "places", "Villes", "form", columns).source, "saved");
  // La fiche d'un PNJ : ses colonnes existent dans la feuille des PNJ ; tuiles et sac à dos en blocs.
  const npc = defaults.builtinLayoutFor("npcs", "PNJs", "form");
  assert.equal(defaults.effectiveLayoutFor({}, "npcs", "PNJs", "form", []).source, "eraser");
  const placed = [...npc.aside, ...npc.sections.flatMap((section) => section.rows.flatMap((row) => row.fields))];
  for (const field of placed) {
    if (field.block) for (const column of layouts.blockColumns(field.block)) assert.ok(sheets.npcSheetHeaders.includes(column), column);
    else assert.ok(sheets.npcSheetHeaders.includes(field.column), field.column);
  }
  assert.ok(placed.some((field) => field.block?.kind === "inventory"));
  assert.deepEqual(layouts.parseIndexLayout(JSON.stringify(npc)), npc);
  // Le survol d'un état : ses niveaux en bloc Paliers, un médaillon à sa couleur ; celui d'un modificateur : son icône, à sa couleur.
  const state = defaults.builtinLayoutFor("states", definitions.STATES_TAB, "hover");
  assert.equal(state.tint, true);
  assert.deepEqual(state.sections[0].rows[0].fields[0].block.levels.map((level) => level.column), ["Description niveau 1", "Description niveau 2"]);
  assert.deepEqual(layouts.parseIndexLayout(JSON.stringify(state)), state);
  const modifier = defaults.builtinLayoutFor("weapon-modifiers", definitions.WEAPON_MODIFIERS_TAB, "hover");
  assert.equal(modifier.icon, "Icône");
  assert.equal(modifier.accent, "{Couleur}");
  assert.deepEqual(layouts.parseIndexLayout(JSON.stringify(modifier)), modifier);
  assert.equal(defaults.tabFormOrBuiltin({ PNJs: { form: form, forms: [{ id: "court", name: "Courte", layout: hover }] } }, "npcs", "PNJs", "court"), hover);
  assert.equal(defaults.tabFormOrBuiltin({}, "npcs", "PNJs", "court"), npc);
});
