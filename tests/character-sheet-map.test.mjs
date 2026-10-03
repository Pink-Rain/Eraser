import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const { characterSheetMap, characterSheetRow, characterValuesOf } = await vite.ssrLoadModule("/lib/character-sheet-map.ts");
const schema = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
const catalog = await vite.ssrLoadModule("/lib/character-catalog.ts");
const cells = await vite.ssrLoadModule("/lib/character-sheet-cells.ts");
const { sheetColumnLetter } = await vite.ssrLoadModule("/lib/sheet-columns.ts");

const canonical = schema.characterSheetHeaders;
const valueIndex = (header) => schema.characterValueHeaders.indexOf(header);

test("une feuille rangée comme Eraser se lit d'un seul tenant, dès la colonne C", () => {
  const map = characterSheetMap(canonical);
  assert.equal(map.contiguous, true);
  assert.equal(map.layout.cell, undefined);
  assert.equal(map.valueColumns[0], 2);
  assert.equal(map.layout.headers.length, schema.characterValueHeaders.length);
});

test("des colonnes déplacées dans Sheets sont relues à leur place réelle", () => {
  const moved = [...canonical];
  // « Peuple » et « Classe » échangées, « Force » envoyée tout au bout.
  const peuple = moved.indexOf("Peuple"); const classe = moved.indexOf("Classe");
  [moved[peuple], moved[classe]] = [moved[classe], moved[peuple]];
  const force = moved.splice(moved.indexOf("Force"), 1)[0];
  moved.push(force);
  const map = characterSheetMap(moved);
  assert.equal(map.contiguous, false);
  const row = moved.map((header) => `valeur de ${header}`);
  const values = characterValuesOf(map, row);
  assert.equal(values[valueIndex("Peuple")], "valeur de Peuple");
  assert.equal(values[valueIndex("Classe")], "valeur de Classe");
  assert.equal(values[valueIndex("Force")], "valeur de Force");
  assert.equal(values[valueIndex("Nom personnage")], "valeur de Nom personnage");
  // Les formules écrites par Eraser visent la vraie case de « Force ».
  const written = cells.applySkillCells(Array(map.layout.headers.length).fill(""), 7, map.layout, catalog.builtinCharacterCatalog);
  const parade = written[map.layout.index("Parade", schema.characterSkillMetrics[2])];
  assert.match(parade, new RegExp(`${sheetColumnLetter(moved.length)}7`));
  // Et une ligne ajoutée range chaque valeur sous son en-tête.
  const appended = characterSheetRow(map, "PERSO-1", "uid-1", values);
  assert.equal(appended[moved.indexOf("ID")], "PERSO-1");
  assert.equal(appended[moved.indexOf("Joueur")], "uid-1");
  assert.equal(appended[moved.indexOf("Force")], "valeur de Force");
});

test("les colonnes de l'index des compétences s'écrivent, celles ajoutées à la main non", () => {
  const map = characterSheetMap([...canonical, "Pêche sportive — Total de stats [COM-1A2B]", "Mes notes"]);
  const catalogIndex = map.layout.headers.indexOf("Pêche sportive — Total de stats [COM-1A2B]");
  const notesIndex = map.layout.headers.indexOf("Mes notes");
  assert.equal(map.writable[catalogIndex], true);
  assert.equal(map.writable[notesIndex], false);
  assert.equal(map.valueColumns[catalogIndex], canonical.length);
  const row = characterSheetRow(map, "P", "U", map.layout.headers.map(() => "x"));
  assert.equal(row[canonical.length + 1], "");
});
