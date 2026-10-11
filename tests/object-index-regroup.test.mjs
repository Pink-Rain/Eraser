import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const regroup = await vite.ssrLoadModule("/lib/object-index-regroup.ts");

test("les cinq index d'objets deviennent des onglets aux noms courts, dans l'ordre prévu", () => {
  const sources = [
    { key: "a", fileName: "Index armes", tabName: "Feuille 1" },
    { key: "o", fileName: "Index Objet", tabName: "Index des objets" },
    { key: "c", fileName: "Index consommable", tabName: "Feuille 1" },
    { key: "e", fileName: "Index équipement", tabName: "Feuille 1" },
    { key: "p", fileName: "Index des parchemins", tabName: "Parchemins" },
  ];
  const { names, order } = regroup.regroupedTabNames(sources);
  assert.deepEqual(order.map((key) => names.get(key)), ["Objets", "Équipement", "Parchemins", "Consommables", "Armes"]);
});

test("un classeur à plusieurs tableaux garde le nom de chaque onglet, sans doublon", () => {
  const { names } = regroup.regroupedTabNames([
    { key: "1", fileName: "Index armes", tabName: "Mêlée" },
    { key: "2", fileName: "Index armes", tabName: "Distance" },
    { key: "3", fileName: "Armes", tabName: "Feuille 1" },
  ]);
  assert.equal(names.get("1"), "Armes – Mêlée");
  assert.equal(names.get("2"), "Armes – Distance");
  assert.equal(names.get("3"), "Armes");
  assert.equal(regroup.regroupedBaseName("Index des runes"), "Runes");
  assert.ok(![...names.values()].some((name) => name.startsWith("Eraser")));
});

const nameOf = (row) => row.values[0] ?? "";

test("un tableau sans colonne ID reçoit l'identifiant que connaissent déjà les inventaires", () => {
  const plan = regroup.plannedObjectIds({
    fileId: "FICHIER", sheetId: 42, headers: ["Nom", "Type"], rawWidth: 2,
    rows: [{ rowNumber: 2, values: ["Épée", "Arme"] }, { rowNumber: 3, values: ["", "note"] }, { rowNumber: 4, values: ["Arc", "Arme"] }],
  }, nameOf);
  assert.equal(plan.column, 2);
  assert.equal(plan.addHeader, true);
  assert.deepEqual(plan.cells, [{ rowNumber: 2, value: "DRIVE-FICHIER-42-2" }, { rowNumber: 4, value: "DRIVE-FICHIER-42-4" }]);
});

test("une case ID déjà remplie n'est jamais réécrite", () => {
  const plan = regroup.plannedObjectIds({
    fileId: "F", sheetId: 0, headers: ["ID", "Nom"], rawWidth: 2,
    rows: [{ rowNumber: 2, values: ["OBJ-1", "Épée"] }, { rowNumber: 3, values: ["", "Arc"] }],
  }, (row) => row.values[1]);
  assert.equal(plan.column, 0);
  assert.equal(plan.addHeader, false);
  assert.deepEqual(plan.cells, [{ rowNumber: 3, value: "DRIVE-F-0-3" }]);
});

test("la copie n'est acceptée que si chaque ligne est identique", () => {
  const source = [{ rowNumber: 2, values: ["Épée", "Arme"] }, { rowNumber: 3, values: ["Arc", "Arme"] }];
  assert.deepEqual(regroup.copyMismatches(source, [{ rowNumber: 2, values: ["Épée", "Arme", "DRIVE-x"] }, { rowNumber: 3, values: ["Arc", "Arme", "DRIVE-y"] }], 2, 2), []);
  assert.equal(regroup.copyMismatches(source, [{ rowNumber: 2, values: ["Épée", "#REF!"] }, { rowNumber: 3, values: ["Arc", "Arme"] }], 2).length, 1);
  assert.ok(regroup.copyMismatches(source, [{ rowNumber: 2, values: ["Épée", "Arme"] }], 2)[0].includes("lignes"));
});

test("Identifiant d'un objet : une seule règle, octet pour octet celle écrite dans les inventaires et les magasins", async () => {
  const ids = await vite.ssrLoadModule("/lib/object-item-id.ts");
  // Une ligne sans ID : sa place (classeur, onglet, ligne), exactement comme avant.
  assert.equal(ids.positionalObjectId("1AbC", 0, 12), "DRIVE-1AbC-0-12");
  assert.equal(ids.objectItemId("", "1AbC", 1234, "7"), "DRIVE-1AbC-1234-7");
  assert.equal(ids.objectItemId("  OBJ-1 ", "1AbC", 0, 2), "OBJ-1");
  assert.equal(regroup.legacyObjectId("1AbC", 0, 12), "DRIVE-1AbC-0-12");
  // Les magasins gardent leur variante sans « DRIVE- » ; « Donner » et les fouilles la ramènent à celle de l'inventaire.
  assert.equal(ids.shopObjectId(undefined, "1AbC", 0, 12), "1AbC-0-12");
  assert.equal(ids.shopObjectId("OBJ-1", "1AbC", 0, 12), "OBJ-1");
  assert.equal(ids.positionalFromShopObjectId("1AbC-0-12"), ids.positionalObjectId("1AbC", 0, 12));
  assert.equal(ids.positionalFromShopObjectId("DRIVE-1AbC-0-12"), "DRIVE-1AbC-0-12");
  assert.equal(ids.isPositionalObjectId("DRIVE-x"), true);
  assert.equal(ids.isPositionalObjectId("OBJ-1"), false);
});
