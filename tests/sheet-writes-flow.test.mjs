import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les écritures communes de lib/google-sheets.ts (ajouts de lignes…), branchées sur un
// Google Sheets en mémoire et sur la base SQLite du bureau.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-sheet-writes-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true, hmr: false }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;

beforeEach(async () => {
  google.reset();
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
});

const tokenHeaders = ["ID", "ID carte", "Type d’entité", "ID entité", "X", "Y", "Créé le", "Modifié le", "Nom", "Icône", "Échelle pion", "Échelle icône", "Couleur"];

/** Une ligne écrite en colonne J par l'ancien ajout de Google (« Tokens » réel, lignes 12 à 29). */
const shiftedToken = (id) => [...Array(9).fill(""), id, "MAP-OLD", "npc", "PNJ-OLD", "800", "450", "2026-09-03", "2026-09-03", "", "", "1", "1", "#7f3430"];

test("un ajout tombe en colonne A sous la dernière ligne remplie, même sous des lignes écrites en J", async () => {
  const id = fresh("tabletop");
  google.addSpreadsheet(id, [
    { title: "Cartes", grid: [["ID", "Page liée", "Nom", "Image", "Largeur", "Hauteur", "Taille case (px)", "Distance par case", "Unité", "Clé de salon", "Créé par", "Créée le", "Modifiée le", "Dossier"]] },
    { title: "Tokens", grid: [tokenHeaders, [], ["TOK-A", "MAP-OLD", "npc", "PNJ-A", "10", "10"], shiftedToken("TOK-J1"), shiftedToken("TOK-J2")] },
    { title: "Dossiers", grid: [["ID", "Page liée", "Nom", "Ordre", "Créé le", "Modifié le"]] },
    { title: "Journal", grid: [["ID", "ID carte", "Type", "ID auteur", "Auteur", "Contenu", "Formule", "Résultat", "Horodatage", "Audience", "ID destinataire", "Destinataire"]] },
  ]);
  google.world.files.get(id).tabs[1].columnCount = 22;
  await jdr.saveJdrSheet({ key: "tabletop", spreadsheetId: id, name: "tabletop", tabName: "Cartes", webViewLink: "" });
  const map = await sheets.createTabletopMap("CAMP-1", "uid-1", "Forêt");
  const token = await sheets.addTabletopToken(map.id, "npc", "PNJ-1", 10, 20);
  const tokens = google.grid(id, "Tokens");
  // Sous les deux lignes décalées (4 et 5), jamais dans la ligne vide 2 ni en colonne J.
  assert.equal(tokens.length, 6);
  assert.equal(tokens[5][0], token.id);
  assert.equal(tokens[5][9] ?? "", "");
  assert.equal(tokens[1].length, 0);
  assert.equal(tokens[3][9], "TOK-J1");
  assert.deepEqual((await sheets.listTabletopTokens(map.id)).map((item) => item.id), [token.id]);
});

test("une saisie garde son sens : formule, nombre, texte, case à cocher ; RAW écrit tel quel", async () => {
  const id = fresh("sheet");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["A", "B", "C", "D", "E", "F", "G", "H"]] }]);
  const appended = await sheets.appendRows(id, "'Feuille'!A:H", [["=1+1", "12", "007", "'- se méfie", "TRUE", "texte", 3.5, ""]]);
  assert.equal(appended.updatedRange, "'Feuille'!A2:H2");
  assert.deepEqual(google.world.enteredCells.at(-1), [
    { formulaValue: "=1+1" }, { numberValue: 12 }, { stringValue: "007" }, { stringValue: "- se méfie" },
    { boolValue: true }, { stringValue: "texte" }, { numberValue: 3.5 }, undefined,
  ]);
  await sheets.appendRows(id, "'Feuille'!A:B", [["=1+1", "12"]], { valueInputOption: "RAW" });
  assert.deepEqual(google.world.enteredCells.at(-1), [{ stringValue: "=1+1" }, { stringValue: "12" }]);
  assert.deepEqual(google.grid(id, "Feuille")[2], ["=1+1", "12"]);
});

test("deux ajouts lancés ensemble gardent leurs deux lignes", async () => {
  const id = fresh("sheet");
  google.addSpreadsheet(id, [{ title: "Journal", grid: [["ID", "Texte"], ["J-0", "avant"]] }]);
  const [first, second] = await Promise.all([
    sheets.appendRows(id, "'Journal'!A:B", [["J-1", "un"]]),
    sheets.appendRows(id, "'Journal'!A:B", [["J-2", "deux"]]),
  ]);
  const rows = google.grid(id, "Journal");
  assert.deepEqual(rows.slice(1).map((row) => row[0]).sort(), ["J-0", "J-1", "J-2"]);
  assert.notEqual(first.updatedRange, second.updatedRange);
});

test("une grille pleine est agrandie avant l'ajout", async () => {
  const id = fresh("sheet");
  google.addSpreadsheet(id, [{ title: "Pleine", grid: [["ID"], ["1"], ["2"]] }]);
  const tab = google.world.files.get(id).tabs[0];
  tab.rowCount = 3;
  tab.columnCount = 1;
  await sheets.appendRows(id, "'Pleine'!A:B", [["3", "trois"]]);
  assert.deepEqual(google.grid(id, "Pleine")[3], ["3", "trois"]);
  assert.ok(tab.rowCount >= 4);
  assert.ok(tab.columnCount >= 2);
});
