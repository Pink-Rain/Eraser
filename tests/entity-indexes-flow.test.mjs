import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le vrai moteur des index (lib/world-indexes.ts) sur les feuilles des PNJs, des
// personnages et des sorts, branché sur un Google Sheets en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-entity-indexes-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const engine = await vite.ssrLoadModule("/lib/world-indexes.ts");
const { characterSheetHeaders } = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
const { npcSheetHeaders } = await vite.ssrLoadModule("/lib/entity-sheets.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;

async function link(key, spreadsheetId, tabName) {
  await jdr.saveJdrSheet({ key, spreadsheetId, name: key, tabName, webViewLink: "" });
}

/** La ligne d'une feuille sous forme { en-tête: valeur } (les cases vides omises). */
function record(gridRows, rowIndex) {
  const headers = gridRows[0];
  return Object.fromEntries((gridRows[rowIndex] ?? []).flatMap((value, column) => value !== "" ? [[headers[column] || `#${column}`, value]] : []));
}

beforeEach(async () => {
  google.reset();
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
  // Chaque test relit ses index : rien ne reste en mémoire d'un test à l'autre.
  for (const key of ["npcs", "characters", "creatures", "creature-spells"]) engine.forgetEffectiveIndex(key);
});

async function linkNpcs(grid) {
  const id = fresh("npcs");
  google.addSpreadsheet(id, [{ title: "PNJs", grid }]);
  await link("npcs", id, "PNJs");
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `npc-sheet-schema:${id}:PNJs:v9` });
  return id;
}

// La feuille des PNJs dans le désordre, avec une colonne ajoutée à la main.
function npcGrid(rows) {
  const headers = npcSheetHeaders.filter((header) => header !== "Nom du PNJ");
  headers.splice(3, 0, "Ma colonne");
  headers.push("Nom du PNJ");
  return [headers, ...rows.map((values) => headers.map((header) => values[header] ?? ""))];
}

test("PNJs : le moteur lit la feuille par le nom de ses colonnes, sans toucher aux en-têtes", async () => {
  const grid = npcGrid([{ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor", "Peuple": "Elfe", "Ma colonne": "à moi", "Notes MJ": "secret" }]);
  const id = await linkNpcs(grid);
  const headersBefore = [...google.grid(id, "PNJs")[0]];

  const data = await engine.getWorldIndex("npcs", { refresh: true });
  const [table] = data.tables;
  assert.equal(table.tabName, "PNJs");
  assert.deepEqual(table.headers, headersBefore);
  const at = (header) => table.headers.indexOf(header);
  assert.equal(table.rows[0].values[at("Nom du PNJ")], "Aldor");
  assert.equal(table.rows[0].values[at("Ma colonne")], "à moi");
  // Les colonnes de l'index : la colonne du nom ouvre la ligne, les techniques sont masquées.
  const spec = (header) => data.columns.PNJs.find((column) => column.header === header)?.spec;
  assert.equal(spec("Nom du PNJ").kind, "name-form");
  assert.equal(spec("Page lié").hidden, true);
  assert.equal(spec("Peuple").kind, "linked-choice");
  assert.equal(spec("Notes MJ").kind, "rich");
  assert.equal(spec("Ma colonne").kind, "rich");
  // Aucun en-tête ajouté ni réécrit par le moteur.
  assert.deepEqual(google.grid(id, "PNJs")[0], headersBefore);
});

test("PNJs : une case modifiée dans l'index est lue par les campagnes", async () => {
  const id = await linkNpcs(npcGrid([{ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor" }]));
  const data = await engine.getWorldIndex("npcs", { refresh: true });
  const column = data.tables[0].headers.indexOf("Titre");
  await engine.updateWorldIndexCell("npcs", "PNJs", 2, column, "Le sage");
  assert.equal(record(google.grid(id, "PNJs"), 1)["Titre"], "Le sage");
  const [aldor] = await sheets.listNpcs("CAMP-1");
  assert.equal(aldor.title, "Le sage");
});

test("PNJs : un ajout depuis l'index rejoint la bibliothèque, même si le nom existe déjà", async () => {
  const id = await linkNpcs(npcGrid([{ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor" }]));
  const data = await engine.getWorldIndex("npcs", { refresh: true });
  const headers = data.tables[0].headers;
  await engine.addWorldIndexRow("npcs", "PNJs", headers.map((header) => header === "Nom du PNJ" ? "Aldor" : header === "Peuple" ? "Elfe" : ""));
  const added = record(google.grid(id, "PNJs"), 2);
  assert.match(added["ID"], /^PNJ-[0-9A-F]{8}$/);
  assert.equal(added["Nom du PNJ"], "Aldor");
  assert.equal(added["Page lié"], "index-des-pnjs");
  assert.ok(added["Créé le"]);
  // Le PNJ de la campagne n'a pas été complété à sa place.
  assert.deepEqual(record(google.grid(id, "PNJs"), 1), { "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor" });
  const library = await sheets.listNpcs("index-des-pnjs");
  assert.equal(library.length, 1);
  assert.equal(library[0].people, "Elfe");
});

test("Personnages : seules les colonnes de l'index sont lues, au-delà de AZ, et écrites à leur place", async () => {
  // Les colonnes à l'envers : « Nom personnage » se retrouve très loin à droite.
  const headers = [...characterSheetHeaders].reverse();
  assert.ok(headers.indexOf("Nom personnage") > 52);
  const row = headers.map((header) => ({ "ID": "PER-1", "Joueur": "uid-1", "Nom personnage": "Brin", "Peuple": "Elfe", "Force": "12" })[header] ?? "");
  const id = fresh("characters");
  google.addSpreadsheet(id, [{ title: "Personnages", grid: [headers, row] }]);
  await link("characters", id, "Personnages");

  const data = await engine.getWorldIndex("characters", { refresh: true });
  const [table] = data.tables;
  assert.ok(!table.headers.includes("Force"));
  assert.ok(table.headers.includes("Nom personnage"));
  assert.equal(table.columnsAt.length, table.headers.length);
  const name = table.headers.indexOf("Nom personnage");
  assert.equal(table.rows[0].values[name], "Brin");
  assert.equal(table.columnsAt[name], headers.indexOf("Nom personnage"));

  const title = table.headers.indexOf("Titre honorifique");
  await engine.updateWorldIndexCell("characters", "Personnages", 2, title, "La Brave");
  const saved = record(google.grid(id, "Personnages"), 1);
  assert.equal(saved["Titre honorifique"], "La Brave");
  assert.equal(saved["Force"], "12");
  assert.equal(saved["Nom personnage"], "Brin");

  // Un personnage naît de sa page et part à la corbeille : pas depuis le tableau.
  await assert.rejects(() => engine.addWorldIndexRow("characters", "Personnages", table.headers.map(() => "")), /WORLD_INDEX_ROWS_LOCKED/);
  await assert.rejects(() => engine.deleteWorldIndexRows("characters", "Personnages", [2]), /WORLD_INDEX_ROWS_LOCKED/);
  assert.equal(record(google.grid(id, "Personnages"), 1)["ID"], "PER-1");

  // Dupliquer copie toute la ligne (colonnes hors du tableau comprises), avec un nouvel identifiant.
  await engine.duplicateWorldIndexRows("characters", "Personnages", [2]);
  const copy = record(google.grid(id, "Personnages"), 2);
  assert.match(copy["ID"], /^PER-[0-9A-F]{8}$/);
  assert.equal(copy["Nom personnage"], "Brin");
  assert.equal(copy["Force"], "12");
  assert.equal(record(google.grid(id, "Personnages"), 1)["ID"], "PER-1");
});

test("Sorts des créatures : leurs réglages n'effacent pas ceux de l'index des créatures", async () => {
  const id = fresh("creatures");
  google.addSpreadsheet(id, [
    { title: "Créatures", grid: [["Nom", "ID"], ["Loup", "CRE-1"]] },
    { title: "Sorts des créatures", grid: [["ID", "Nom", "Effet", "Description", "Type", "Compétences", "Distance", "Charges"], ["SOR-1", "Morsure", "2d6", "", "Actif", "", "", ""]] },
    { title: "Eraser · colonnes", grid: [["Onglet", "Colonne", "Nom d’origine", "Type et réglages (JSON)", "État", "Supprimé le"], ["Créatures", "Odeur", "", "{\"kind\":\"rich\"}", "ajouté", ""]] },
  ]);
  await link("creatures", id, "Créatures");

  const data = await engine.getWorldIndex("creature-spells", { refresh: true });
  assert.equal(data.tables[0].rows[0].values[data.tables[0].headers.indexOf("Nom")], "Morsure");
  await engine.applyWorldSchemaOperations("creature-spells", [{ op: "add-column", tab: "Sorts des créatures", header: "Rareté", spec: { kind: "rich" } }]);
  const rows = google.grid(id, "Eraser · colonnes").slice(1).filter((line) => line[0]);
  assert.ok(rows.some((line) => line[0] === "Créatures" && line[1] === "Odeur"));
  assert.ok(rows.some((line) => line[0] === "Sorts des créatures" && line[1] === "Rareté"));
  assert.equal(google.grid(id, "Sorts des créatures")[0].at(-1), "Rareté");
  // Un index d'entités garde son seul onglet.
  await assert.rejects(() => engine.applyWorldSchemaOperations("creature-spells", [{ op: "add-tab", name: "Autres", columns: [] }]), /INDEX_SCHEMA_LOCKED/);
});

test("PNJs : un PNJ enregistré dans sa campagne est relu par l'index sans « Actualiser »", async () => {
  await linkNpcs(npcGrid([{ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor" }]));
  const before = await engine.getWorldIndex("npcs", { refresh: true });
  const name = before.tables[0].headers.indexOf("Nom du PNJ");
  const [aldor] = await sheets.listNpcs("CAMP-1");
  await sheets.saveNpc("CAMP-1", { ...aldor, name: "Aldor le Gris" });
  const after = await engine.getWorldIndex("npcs");
  assert.equal(after.tables[0].rows[0].values[name], "Aldor le Gris");
});
