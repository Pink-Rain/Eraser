import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// La fiche de personnage (lib/google-sheets.ts) contre un Google Sheets en mémoire que
// « quelqu'un d'autre » (une autre installation, ou Sheets à la main) modifie entre deux
// lectures : rien ne doit partir dans la fiche voisine ni effacer ce que l'autre a fait.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-character-sheet-"));
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
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");
const { characterSheetHeaders } = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");

// Les caches du module vivent le temps du processus : classeurs et fiches ont des identifiants jamais réutilisés.
let serial = 0;
const fresh = (name) => `${name}-${++serial}`;
const headers = [...characterSheetHeaders];

async function link(key, spreadsheetId, tabName) {
  await jdr.saveJdrSheet({ key, spreadsheetId, name: key, tabName, webViewLink: "" });
}

/** Une feuille de personnages rangée comme Eraser (ou avec ces en-têtes), avec ces fiches ({ en-tête: valeur }). */
async function linkCharacters(rows, sheetHeaders = headers) {
  const id = fresh("chars");
  google.addSpreadsheet(id, [{ title: "Personnages", grid: [sheetHeaders, ...rows.map((cells) => sheetHeaders.map((header) => cells[header] ?? ""))] }]);
  await link("characters", id, "Personnages");
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `character-schema:v5:${characterSheetHeaders.length}` });
  return id;
}

beforeEach(async () => {
  google.reset();
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
  await db.delete(schema.campaignIndex);
  await db.delete(schema.characterIndex);
  await db.delete(schema.campaignCharacters);
});

test("En-têtes « Joueur », « Nom personnage » ou « MJ » renommés : les joueurs et noms connus restent", async () => {
  const [a, b] = ["A", "B"].map((letter) => fresh(`PERSO-${letter}`));
  const characters = await linkCharacters([{ "ID": a, "Joueur": "uid-1", "Nom personnage": "Aldor" }, { "ID": b, "Joueur": "uid-2", "Nom personnage": "Brin" }]);
  const camps = fresh("camps");
  const campaignId = fresh("CAMP");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"], [campaignId, "mj-1", "Les Brumes", "", "", "#334455"]] }]);
  await link("campaigns", camps, "Campagnes");
  await sheets.syncExistingIdentityIndexes();
  const known = async () => ({
    characters: (await getDb().select().from(schema.characterIndex)).map((row) => [row.id, row.ownerUid, row.name]).sort(),
    campaigns: (await getDb().select().from(schema.campaignIndex)).map((row) => [row.id, row.mjUid, row.name]),
  });
  const expected = { characters: [[a, "uid-1", "Aldor"], [b, "uid-2", "Brin"]].sort(), campaigns: [[campaignId, "mj-1", "Les Brumes"]] };
  assert.deepEqual(await known(), expected);
  const names = google.grid(characters, "Personnages")[0];
  names[headers.indexOf("Joueur")] = "Joueuse";
  names[headers.indexOf("Nom personnage")] = "Nom du personnage";
  google.grid(camps, "Campagnes")[0][1] = "Maître du jeu";
  await sheets.syncExistingIdentityIndexes();
  assert.deepEqual(await known(), expected);
  // Les colonnes remises à droite, encore vides : toujours rien d'effacé.
  names.push("Joueur", "Nom personnage");
  google.grid(camps, "Campagnes")[0].push("MJ");
  await sheets.syncExistingIdentityIndexes();
  assert.deepEqual(await known(), expected);
});

test("Une fiche à la corbeille ne réapparaît pas dans la liste de son joueur", async () => {
  const id = fresh("PERSO");
  await linkCharacters([{ "ID": id, "Joueur": "uid-trash", "Nom personnage": "Oublié" }]);
  const now = new Date().toISOString();
  await getDb().insert(schema.characterIndex).values({ id, ownerUid: "uid-trash", name: "Oublié", subtitle: "", updatedAt: now, deletedAt: now });
  assert.deepEqual((await sheets.listCharactersForUser("uid-trash")).map((character) => character.id), []);
  const [row] = (await getDb().select().from(schema.characterIndex)).filter((entry) => entry.id === id);
  assert.equal(row.deletedAt, now);
});
