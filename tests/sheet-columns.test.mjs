import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const { sheetColumns, headerAdditions, withSheetHeaders, sheetColumnLetter } = await vite.ssrLoadModule("/lib/sheet-columns.ts");

const expected = ["ID", "Page lié", "Nom du PNJ", "Peuple"];

test("une colonne déplacée dans Sheets est toujours lue par son nom", () => {
  const columns = sheetColumns(["Peuple", "ID", "Nom du PNJ", "Page lié"], expected);
  const row = ["Elfe", "PNJ-1", "Aldor", "CAMP-1"];
  assert.equal(columns.get(row, "ID"), "PNJ-1");
  assert.equal(columns.get(row, "Nom du PNJ"), "Aldor");
  assert.equal(columns.get(row, "Peuple"), "Elfe");
  assert.deepEqual(columns.missing, []);
  assert.deepEqual(columns.unnamed, []);
});

test("le nom est retrouvé sans tenir compte des accents, de la casse ni de l'apostrophe", () => {
  const columns = sheetColumns(["id", "PAGE LIE", "nom  du pnj", "Peuple"], expected);
  assert.equal(columns.at("Page lié"), 1);
  assert.equal(columns.at("Nom du PNJ"), 2);
  const accent = sheetColumns(["Couleur d'accent"], ["Couleur d’accent"]);
  assert.equal(accent.at("Couleur d’accent"), 0);
});

test("un ancien nom (alias) retrouve la colonne renommée par Eraser", () => {
  const columns = sheetColumns(["ID", "Page liée", "Nom du PNJ", "Peuple"], expected, { "Page lié": ["Page liée"] });
  assert.equal(columns.at("Page lié"), 1);
  assert.equal(columns.at("Page liée"), 1);
  assert.deepEqual(columns.missing, []);
});

test("sans en-tête à sa place d'origine, une colonne y est lue comme avant ; sinon elle manque", () => {
  // En-tête « Page lié » effacé, case vide entre deux colonnes nommées : lu en colonne B, comme avant.
  const blank = sheetColumns(["ID", "", "Nom du PNJ", "Peuple"], expected);
  assert.equal(blank.at("Page lié"), 1);
  assert.deepEqual(blank.unnamed, [{ name: "Page lié", index: 1 }]);
  assert.deepEqual(blank.missing, []);
  // Au-delà de la dernière colonne nommée, rien n'est deviné : la colonne manque.
  const short = sheetColumns(["ID", "Page lié", "Nom du PNJ"], expected);
  assert.equal(short.at("Peuple"), -1);
  assert.deepEqual(short.missing, ["Peuple"]);
  assert.deepEqual(headerAdditions(short).cells, [{ index: 3, header: "Peuple" }]);
  // Une feuille sans aucun en-tête est lue à la place d'origine de chaque colonne.
  const none = sheetColumns([], expected);
  assert.equal(none.at("Peuple"), 3);
  assert.deepEqual(none.missing, []);
  // La case d'origine porte un autre en-tête : la colonne manque, rien n'est lu à sa place.
  const taken = sheetColumns(["ID", "Page lié", "Nom du PNJ", "Notes"], expected);
  assert.equal(taken.at("Peuple"), -1);
  assert.equal(taken.get(["a", "b", "c", "note"], "Peuple"), "");
  assert.deepEqual(taken.missing, ["Peuple"]);
});

test("les en-têtes à ajouter ne remplacent rien : cases vides nommées, absentes à droite", () => {
  const columns = sheetColumns(["ID", "", "Nom du PNJ", "Notes"], expected);
  const { cells, headers } = headerAdditions(columns);
  assert.deepEqual(cells, [{ index: 1, header: "Page lié" }, { index: 4, header: "Peuple" }]);
  assert.deepEqual(headers, ["ID", "Page lié", "Nom du PNJ", "Notes", "Peuple"]);
  const next = withSheetHeaders(columns, headers);
  assert.deepEqual(next.missing, []);
  assert.equal(next.at("Peuple"), 4);
  assert.equal(next.at("Notes"), 3);
});

test("écrire une ligne ne touche que les colonnes nommées", () => {
  const columns = sheetColumns(["ID", "Formule perso", "Nom du PNJ", "Page lié", "Peuple"], expected);
  const runs = columns.runs({ "ID": "PNJ-1", "Nom du PNJ": "Aldor", "Page lié": "CAMP-1", "Peuple": "Elfe" });
  assert.deepEqual(runs, [{ start: 0, values: ["PNJ-1"] }, { start: 2, values: ["Aldor", "CAMP-1", "Elfe"] }]);
  const row = columns.row({ "Nom du PNJ": "Vesna" }, ["PNJ-1", "=B2*2", "Aldor", "CAMP-1"]);
  assert.deepEqual(row, ["PNJ-1", "=B2*2", "Vesna", "CAMP-1", ""]);
  assert.throws(() => sheetColumns(["ID", "Notes", "Nom du PNJ", "Page lié", "Autre"], expected).row({ "Peuple": "Elfe" }), /SHEET_COLUMN_MISSING:Peuple/);
  assert.equal(columns.blank().length, 5);
});

test("lettres de colonnes", () => {
  assert.equal(sheetColumnLetter(1), "A");
  assert.equal(sheetColumnLetter(26), "Z");
  assert.equal(sheetColumnLetter(27), "AA");
  assert.equal(sheetColumnLetter(37), "AK");
});
