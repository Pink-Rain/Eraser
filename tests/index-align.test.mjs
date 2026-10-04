import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const { alignColumns, canonicalObjectHeader, isObjectSpellingFix, objectHeaderIndex } = await vite.ssrLoadModule("/lib/index-schema-shared.ts");
const { layoutPlaces } = await vite.ssrLoadModule("/lib/index-layouts.ts");

// Les en-têtes réels de l'index des objets (onglets Armes et Ressources).
const armes = ["Nom", "Description", "Type", "Sous-type", "Effets", "Valeur", "Distance", "Attributs", "Action", "Action de rechargement", "Compétence", "Prix", "Rareté principal", "Emplacement principal", "Rareté secondaire", "Emplacement secondaire", "Runes", "Matériaux", "Icône", "Nombre max", "ID"];
const ressources = ["Nom", "Description", "Type", "Sous-Type", "Effet", "Cout", "Rareté principale", "Emplacement principal", "Rareté secondaire", "Emplacement secondaire", "Icône", "Nombre max", "ID", "Compétence", "Distance", "Action", "Valeur", "Attributs", "Matériaux", "Runes", "Action de rechargement", "Notes MJ"];

test("les fautes des colonnes d'objets ont leur orthographe retenue", () => {
  assert.equal(canonicalObjectHeader("Rareté principal"), "Rareté principale");
  assert.equal(canonicalObjectHeader("Cout"), "Prix");
  assert.equal(canonicalObjectHeader("Sous-Type"), "Sous-type");
  assert.equal(canonicalObjectHeader("Effet"), "Effets");
  assert.equal(canonicalObjectHeader("Notes MJ"), "Notes MJ");
});

test("seule une correction d'orthographe déverrouille le renommage", () => {
  assert.equal(isObjectSpellingFix("Rareté principal", "Rareté principale"), true);
  assert.equal(isObjectSpellingFix("Cout", "Prix"), true);
  assert.equal(isObjectSpellingFix("Sous-Type", "Sous-type"), true);
  assert.equal(isObjectSpellingFix("Prix", "Cout"), false);
  assert.equal(isObjectSpellingFix("Prix", "Tarif"), false);
  assert.equal(isObjectSpellingFix("Rareté principale", "Rareté secondaire"), false);
});

test("un onglet aligné sur Armes prend ses noms, son ordre, et garde ses colonnes en plus", () => {
  const reference = armes.map((header) => ({ header, spec: { kind: "rich", note: header } }));
  const aligned = alignColumns(reference, ressources, (header) => header);
  assert.deepEqual(aligned.map((entry) => entry.header), [...armes.map(canonicalObjectHeader), "Notes MJ"]);
  // Chaque colonne de la référence retrouve la sienne, même sous un autre nom.
  assert.equal(aligned.find((entry) => entry.header === "Prix").item, "Cout");
  assert.equal(aligned.find((entry) => entry.header === "Effets").item, "Effet");
  assert.equal(aligned.find((entry) => entry.header === "Rareté principale").item, "Rareté principale");
  assert.equal(aligned.find((entry) => entry.header === "Rareté secondaire").item, "Rareté secondaire");
  // Rien n'est ajouté ni perdu : 21 colonnes communes, plus celle propre à l'onglet, qui garde son type.
  assert.equal(aligned.filter((entry) => !entry.item).length, 0);
  assert.equal(aligned.at(-1).spec, undefined);
});

test("une colonne absente de l'onglet est à ajouter", () => {
  const aligned = alignColumns([{ header: "Nom", spec: { kind: "name-form" } }, { header: "Poids", spec: { kind: "number" } }], ["Nom"], (header) => header);
  assert.deepEqual(aligned.map((entry) => [entry.header, entry.item ?? null]), [["Nom", "Nom"], ["Poids", null]]);
});

test("une mise en page dit quelles colonnes elle place", () => {
  const layout = { aside: [{ column: "Icône" }], sections: [{ id: "a", rows: [{ id: "b", fields: [{ column: "Prix" }] }] }], subtitle: "Type" };
  assert.equal(layoutPlaces(layout, "prix"), true);
  assert.equal(layoutPlaces(layout, "Icone"), true);
  assert.equal(layoutPlaces(layout, "Type"), true);
  assert.equal(layoutPlaces(layout, "Effets"), false);
  assert.equal(layoutPlaces(null, "Prix"), false);
});

test("un nom écrit avant l'alignement retrouve sa colonne", () => {
  const aligned = ["Nom", "Prix", "Effets", "Rareté principale", "Rareté secondaire", "Sous-type"];
  assert.equal(objectHeaderIndex(aligned, "Cout"), 1);
  assert.equal(objectHeaderIndex(aligned, "Effet"), 2);
  assert.equal(objectHeaderIndex(aligned, "Rareté principal"), 3);
  assert.equal(objectHeaderIndex(aligned, "Rareté secondaire"), 4);
  assert.equal(objectHeaderIndex(aligned, "Sous-Type"), 5);
  assert.equal(objectHeaderIndex(aligned, "Poids"), -1);
  // Le nom exact passe d'abord.
  assert.equal(objectHeaderIndex(["Cout", "Prix"], "Prix"), 1);
});

test("le nom enrichi des objets le reste à chaque lecture", async () => {
  const { normalizeSpec, isRichSpec } = await vite.ssrLoadModule("/lib/index-columns.ts");
  const once = normalizeSpec({ kind: "name-form", also: ["rich"] });
  assert.deepEqual(normalizeSpec(once), once);
  assert.equal(isRichSpec(once), true);
  assert.equal(isRichSpec({ kind: "name", also: ["rich"] }), true);
  // Un nom ordinaire reste en gras, en texte simple.
  assert.equal(isRichSpec(normalizeSpec({ kind: "name" })), false);
});
