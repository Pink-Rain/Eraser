import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const sorting = await vite.ssrLoadModule("/lib/index-sort.ts");

const sortTexts = (values, spec, direction = 1, options) => sorting.sortByIndexKey(values, (value) => sorting.indexSortKey(value, spec, options), direction);

test("le tri lit le texte affiché, pas la mise en forme", () => {
  const values = ["<b>Zorg</b>", "  « Alpha »", "<span style=\"color:red\">beta</span>", "<i>Éclair</i>"];
  assert.deepEqual(sortTexts(values, { kind: "rich" }), ["  « Alpha »", "<span style=\"color:red\">beta</span>", "<i>Éclair</i>", "<b>Zorg</b>"]);
});

test("les cases vides restent en bas dans les deux sens", () => {
  assert.deepEqual(sortTexts(["", "B", "A", ""], { kind: "rich" }), ["A", "B", "", ""]);
  assert.deepEqual(sortTexts(["", "B", "A", ""], { kind: "rich" }, -1), ["B", "A", "", ""]);
});

test("nombres, formules et jauges se rangent sur leur valeur", () => {
  assert.deepEqual(sortTexts(["2 PO", "50 PC", "1 PO"], { kind: "number", number: { unit: "money", defaultUnit: "PO" } }), ["50 PC", "1 PO", "2 PO"]);
  assert.deepEqual(sortTexts(["10", "9", "Élite", "-3"], { kind: "formula" }), ["-3", "9", "10", "Élite"]);
  assert.deepEqual(sortTexts(["10|skull", "2|eye", "3"], { kind: "gauge", gauge: { style: "icons", max: 10 } }), ["2|eye", "3", "10|skull"]);
  // Un texte qui n'est qu'un nombre passe avant le texte.
  assert.deepEqual(sortTexts(["Douze", "12", "3"], { kind: "rich" }), ["3", "12", "Douze"]);
});

test("une liste se range sur son choix bien écrit, une case à cocher sur son état", () => {
  const spec = { kind: "choice", options: [{ value: "Agressif" }, { value: "Défensif" }, { value: "Calme" }] };
  assert.deepEqual(sortTexts(["défensif", "Aggressif", "Calme"], spec), ["Aggressif", "Calme", "défensif"]);
  assert.deepEqual(sortTexts(["Oui", "", "Non", "TRUE"], { kind: "checkbox" }), ["", "Non", "Oui", "TRUE"]);
});

test("une référence se range sur le nom actuel de sa ligne", () => {
  const values = ['<a href="/reference/states/ETA-1">Ancien nom</a>', "Brume"];
  const resolveReference = (href) => href.endsWith("ETA-1") ? "Zéphyr" : undefined;
  assert.deepEqual(sortTexts(values, { kind: "rich" }, 1, { resolveReference }), ["Brume", '<a href="/reference/states/ETA-1">Ancien nom</a>']);
  assert.deepEqual(sortTexts(values, { kind: "rich" }), ['<a href="/reference/states/ETA-1">Ancien nom</a>', "Brume"]);
});
