import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const values = await vite.ssrLoadModule("/lib/google-sheet-values.ts");

const ranges = ["'Personnages'!A:A", "'Personnages'!C:C", "'Personnages'!D:D", "'Personnages'!AA:AA"];
const answer = (range, filter, cell) => ({ valueRange: { range, values: [[cell]] }, ...(filter ? { dataFilters: [{ a1Range: filter }] } : {}) });

test("une lecture groupée rendue dans le désordre garde chaque colonne à sa place (par filtre)", () => {
  const shuffled = [answer("Personnages!AA1:AA9", ranges[3], "Langue"), answer("Personnages!A1:A9", ranges[0], "ID"), answer("Personnages!D1:D9", ranges[2], "Peuple"), answer("Personnages!C1:C9", ranges[1], "Nom")];
  assert.deepEqual(values.matchValueRanges(ranges, shuffled).map((matched) => matched?.values?.[0]?.[0]), ["ID", "Nom", "Peuple", "Langue"]);
});

test("sans filtre dans la réponse, chaque plage est retrouvée par ses colonnes", () => {
  const shuffled = [answer("Personnages!D1:D9", "", "Peuple"), answer("Personnages!AA1:AA9", "", "Langue"), answer("Personnages!A1:A9", "", "ID"), answer("Personnages!C1:C9", "", "Nom")];
  assert.deepEqual(values.matchValueRanges(ranges, shuffled).map((matched) => matched?.values?.[0]?.[0]), ["ID", "Nom", "Peuple", "Langue"]);
  assert.equal(values.sameRangeColumns("Personnages!A1:A20", "'Personnages'!A:A"), true);
  assert.equal(values.sameRangeColumns("Personnages!AA1:AA20", "'Personnages'!A:A"), false);
  assert.equal(values.sameRangeColumns("Autre!A1:A20", "'Personnages'!A:A"), false);
});

test("une réponse manquante reste vide au lieu de prendre la colonne voisine", () => {
  const partial = [answer("Personnages!A1:A9", ranges[0], "ID"), answer("Personnages!D1:D9", ranges[2], "Peuple")];
  assert.deepEqual(values.matchValueRanges(ranges, partial).map((matched) => matched?.values?.[0]?.[0]), ["ID", undefined, "Peuple", undefined]);
});

test("un texte saisi reste du texte, un nombre reste un nombre", () => {
  assert.equal(values.textCell("- se méfie de lui"), "'- se méfie de lui");
  assert.equal(values.textCell("=A1"), "'=A1");
  assert.equal(values.textCell("+ un allié"), "'+ un allié");
  assert.equal(values.textCell("@Lina"), "'@Lina");
  assert.equal(values.textCell("'twas"), "''twas");
  assert.equal(values.textCell("-5"), "-5");
  assert.equal(values.textCell("+2,5"), "+2,5");
  assert.equal(values.textCell("Sorcier·ère"), "Sorcier·ère");
  assert.equal(values.textCell(""), "");
});

test("un nombre lu dans une feuille réglée en français ou en anglais garde sa valeur", () => {
  assert.equal(values.sheetNumber("1,25"), 1.25);
  assert.equal(values.sheetNumber("1369,397166"), 1369.397166);
  assert.equal(values.sheetNumber("1\u202f369,4"), 1369.4);
  assert.equal(values.sheetNumber("1,369.4"), 1369.4);
  assert.equal(values.sheetNumber("-12"), -12);
  assert.equal(values.sheetNumber(3.5), 3.5);
  assert.ok(Number.isNaN(values.sheetNumber("")));
  assert.ok(Number.isNaN(values.sheetNumber("abc")));
});
