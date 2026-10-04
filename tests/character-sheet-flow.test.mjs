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
const tabletop = await vite.ssrLoadModule("/lib/tabletop-access.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");
const { characterSheetHeaders, characterSecondaryCalculationHeaders, characterSecondaryCalculatedFields, characterValueHeaders } = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");

// Les caches du module vivent le temps du processus : classeurs et fiches ont des identifiants jamais réutilisés.
let serial = 0;
const fresh = (name) => `${name}-${++serial}`;
const headers = [...characterSheetHeaders];
const admin = { uid: "admin-1", role: "admin", accountRole: "admin", email: "", displayName: "Admin" };

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

/** La ligne d'une feuille sous forme { en-tête: valeur } (les cases vides omises). */
function record(gridRows, rowIndex) {
  const names = gridRows[0];
  return Object.fromEntries((gridRows[rowIndex] ?? []).flatMap((value, column) => value !== "" ? [[names[column] || `#${column}`, value]] : []));
}

/** Les en-têtes des cases qui diffèrent entre deux copies d'une feuille. */
function changedCells(before, after) {
  const changed = [];
  for (let row = 0; row < Math.max(before.length, after.length); row += 1) {
    for (let column = 0; column < Math.max(before[row]?.length ?? 0, after[row]?.length ?? 0); column += 1) {
      if ((before[row]?.[column] ?? "") !== (after[row]?.[column] ?? "")) changed.push(`${row}:${after[0][column]}`);
    }
  }
  return changed;
}

const copyOf = (gridRows) => gridRows.map((row) => [...row]);

beforeEach(async () => {
  google.reset();
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
  await db.delete(schema.campaignIndex);
  await db.delete(schema.characterIndex);
  await db.delete(schema.campaignCharacters);
});

test("Tabletop : seule la vie changée est écrite, « 12,5 » reste « 12,5 »", async () => {
  const id = fresh("PERSO");
  const characters = await linkCharacters([{ "ID": id, "Joueur": "uid-1", "Nom personnage": "Aldor", "Vie actuelle": "10", "Vie totale": "12,5" }]);
  await sheets.syncExistingIdentityIndexes();
  const before = copyOf(google.grid(characters, "Personnages"));
  const entity = await tabletop.updateTabletopEntityHp(admin, "bac-a-sable", "character", id, { currentHp: 9 });
  assert.deepEqual(changedCells(before, google.grid(characters, "Personnages")), ["1:Vie actuelle"]);
  assert.equal(record(google.grid(characters, "Personnages"), 1)["Vie actuelle"], "9");
  assert.equal(record(google.grid(characters, "Personnages"), 1)["Vie totale"], "12,5");
  assert.equal(entity.currentHp, 9);
  assert.equal(entity.totalHp, 12.5);
  assert.equal(entity.ownerUid, "uid-1");
  // Une valeur illisible n'écrit rien.
  assert.equal(await tabletop.updateTabletopEntityHp(admin, "bac-a-sable", "character", id, { currentHp: "beaucoup" }), null);
  assert.equal(record(google.grid(characters, "Personnages"), 1)["Vie actuelle"], "9");
  // Le joueur d'un pion (qui peut le contrôler) vient de l'index local, pas d'une colonne lue à part.
  google.grid(characters, "Personnages")[1][headers.indexOf("Joueur")] = "uid-2";
  assert.equal((await sheets.listTabletopCharacterEntitiesByIds([id]))[0].ownerUid, "uid-1");
});

test("Fiche ouverte après une ligne supprimée ailleurs : le bon personnage, seules ses formules réparées", async () => {
  const [a, b, c] = ["A", "B", "C"].map((letter) => fresh(`PERSO-${letter}`));
  const characters = await linkCharacters([
    { "ID": a, "Joueur": "uid-1", "Nom personnage": "Aldor", "Peuple": "Elfe" },
    { "ID": b, "Joueur": "uid-1", "Nom personnage": "Brin", "Peuple": "Humain" },
    // Un total en erreur : la fiche répare ses formules à l'ouverture.
    { "ID": c, "Joueur": "uid-1", "Nom personnage": "Cael", "Peuple": "Nain", "Rapidité": "#REF!", "Note": "Notes de Cael" },
  ]);
  await sheets.syncExistingIdentityIndexes();
  // Brin (ligne 3) est lu par cette installation…
  assert.equal((await sheets.getCharacterSheet(null, b)).values[0], "Brin");
  // …puis la ligne d'Aldor est supprimée ailleurs : Cael arrive en ligne 3.
  google.grid(characters, "Personnages").splice(1, 1);
  const before = copyOf(google.grid(characters, "Personnages"));
  const sheet = await sheets.getCharacterSheet(null, c);
  assert.equal(sheet.name, "Cael");
  assert.equal(sheet.values[sheet.headers.indexOf("Peuple")], "Nain");
  // Seules les cases des totaux calculés de Cael sont écrites : jamais sa ligne entière.
  const secondary = new Set([...characterSecondaryCalculationHeaders, ...characterSecondaryCalculatedFields.map((field) => characterValueHeaders[field.valueIndex])]);
  const changed = changedCells(before, google.grid(characters, "Personnages"));
  assert.ok(changed.length > 0);
  assert.deepEqual(changed.filter((cell) => !cell.startsWith("2:") || !secondary.has(cell.slice(2))), []);
  const repaired = record(google.grid(characters, "Personnages"), 2);
  assert.equal(repaired["Nom personnage"], "Cael");
  assert.equal(repaired["Note"], "Notes de Cael");
  assert.match(repaired["Rapidité"], /^=.*3\+.*3$/);
  assert.equal(record(google.grid(characters, "Personnages"), 1)["Nom personnage"], "Brin");
});

test("Colonne insérée ailleurs avant les colonnes de l'index : refus, ou écriture à la vraie place", async () => {
  const id = fresh("PERSO");
  const sheetHeaders = [...headers, "Pêche [COM-1]", "Chasse [COM-2]"];
  const characters = await linkCharacters([{ "ID": id, "Joueur": "uid-1", "Nom personnage": "Aldor" }], sheetHeaders);
  await sheets.syncExistingIdentityIndexes();
  const sheet = await sheets.getCharacterSheet(null, id);
  const fishing = sheet.headers.indexOf("Pêche [COM-1]");
  assert.ok(fishing >= characterValueHeaders.length);
  // Ailleurs, une colonne « Mes notes » est insérée en 6e position : tout ce qui suit glisse d'une colonne.
  const tab = google.world.files.get(characters).tabs[0];
  for (const [index, row] of tab.grid.entries()) row.splice(5, 0, index === 0 ? "Mes notes" : "");
  tab.columnCount += 1;
  const before = copyOf(tab.grid);
  // La fiche ouverte avant l'insertion envoie la place qu'elle connaissait : refusée, rien n'est écrit.
  await assert.rejects(sheets.patchCharacterSheet(null, id, [{ index: fishing, header: "Pêche [COM-1]", value: "7" }]), (error) => error.message === "CHARACTER_SHEET_CHANGED" && error.character.headers.includes("Mes notes"));
  assert.deepEqual(changedCells(before, tab.grid), []);
  // Une case d'origine va dans sa colonne retrouvée par son nom, jamais dans sa voisine.
  const note = sheet.headers.indexOf("Note");
  await sheets.patchCharacterSheet(null, id, [{ index: note, header: "Note", value: "noté" }]);
  assert.deepEqual(changedCells(before, tab.grid), ["1:Note"]);
  // Avec la place relue, la case de l'index s'écrit sous son en-tête.
  const reread = await sheets.patchCharacterSheet(null, id, []);
  await sheets.patchCharacterSheet(null, id, [{ index: reread.headers.indexOf("Pêche [COM-1]"), header: "Pêche [COM-1]", value: "7" }]);
  assert.equal(record(tab.grid, 1)["Pêche [COM-1]"], "7");
  assert.equal(record(tab.grid, 1)["Mes notes"], undefined);
});

test("Copie séparée dans une campagne : formules gardées, et c'est bien ce personnage", async () => {
  const characters = await linkCharacters([]);
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"]] }]);
  await link("campaigns", camps, "Campagnes");
  const links = fresh("links");
  google.addSpreadsheet(links, [{ title: "Personnages par campagne", grid: [["ID campagne", "ID personnage"]] }]);
  await link("campaign_characters", links, "Personnages par campagne");
  const campaignId = fresh("CAMP");
  await getDb().insert(schema.campaignIndex).values({ id: campaignId, mjUid: "mj-1", name: "Les Brumes", description: "", bannerUrl: "", accentColor: "#334455", updatedAt: new Date().toISOString() });
  // Comme Google : une lecture de valeurs rend le résultat d'une formule, pas la formule.
  google.world.formulaResults = () => "0";
  const aldor = await sheets.createCharacterForUser("uid-1", ["Aldor", "Elfe"]);
  const brin = await sheets.createCharacterForUser("uid-1", ["Brin", "Humain"]);
  await sheets.syncExistingIdentityIndexes();
  for (const id of [aldor.id, brin.id]) await sheets.getCharacterSheet(null, id);
  // La ligne d'Aldor est supprimée ailleurs : Brin remonte d'une ligne.
  google.grid(characters, "Personnages").splice(1, 1);
  const source = copyOf(google.grid(characters, "Personnages"))[1];
  const { member } = await sheets.addCharacterToCampaign(null, campaignId, brin.id, true);
  const grid = google.grid(characters, "Personnages");
  assert.equal(grid.length, 3);
  const copy = record(grid, 2);
  assert.equal(copy["ID"], member.id);
  assert.notEqual(member.id, brin.id);
  assert.equal(copy["Nom personnage"], "Brin");
  assert.equal(copy["Joueur"], "uid-1");
  assert.equal(copy["Peuple"], "Humain");
  // Chaque formule de la source est encore une formule dans la copie (les totaux ne sont pas figés).
  const formulas = source.flatMap((cell, column) => String(cell).startsWith("=") ? [grid[0][column]] : []);
  assert.ok(formulas.includes("Rapidité") && formulas.includes("Parade — Total de stats"), formulas.join(", "));
  assert.deepEqual(formulas.filter((header) => !String(copy[header] ?? "").startsWith("=")), []);
  assert.deepEqual(grid[1], source);
  assert.deepEqual((await getDb().select().from(schema.characterIndex)).map((row) => row.id).sort(), [aldor.id, brin.id, member.id].sort());
});

test("Copie séparée qui échoue en route : la ligne ajoutée est retirée, aucune fiche vide ne reste", async () => {
  const characters = await linkCharacters([]);
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"]] }]);
  await link("campaigns", camps, "Campagnes");
  const campaignId = fresh("CAMP");
  await getDb().insert(schema.campaignIndex).values({ id: campaignId, mjUid: "mj-1", name: "Les Brumes", description: "", bannerUrl: "", accentColor: "#334455", updatedAt: new Date().toISOString() });
  const brin = await sheets.createCharacterForUser("uid-1", ["Brin", "Humain"]);
  await sheets.syncExistingIdentityIndexes();
  const before = copyOf(google.grid(characters, "Personnages"));
  // Google ne répond pas au moment de recopier la ligne.
  google.world.beforeRequest = (url, init) => {
    if (String(init.body ?? "").includes("copyPaste")) throw new Error("socket hang up");
  };
  await assert.rejects(sheets.addCharacterToCampaign(null, campaignId, brin.id, true));
  google.world.beforeRequest = null;
  assert.deepEqual(google.grid(characters, "Personnages"), before);
  assert.deepEqual((await getDb().select().from(schema.characterIndex)).map((row) => row.id), [brin.id]);
});

test("Case JSON modifiée ailleurs entre-temps : refusée, rien n'est écrit", async () => {
  const id = fresh("PERSO");
  const header = "Sorts de classe choisis JSON";
  const characters = await linkCharacters([{ "ID": id, "Joueur": "uid-1", "Nom personnage": "Aldor", [header]: "{\"charges\":{\"s1\":2}}" }]);
  await sheets.syncExistingIdentityIndexes();
  const sheet = await sheets.getCharacterSheet(null, id);
  const index = sheet.headers.indexOf(header);
  // Le MJ, sur une autre installation, pose un état sur la fiche.
  const row = google.grid(characters, "Personnages")[1];
  const column = headers.indexOf(header);
  row[column] = "{\"charges\":{\"s1\":2},\"states\":[{\"id\":\"st-1\",\"name\":\"Étourdi\",\"level\":1}]}";
  // Le joueur, parti de l'ancienne case, dépense une charge : refusé, l'état du MJ reste.
  await assert.rejects(
    sheets.patchCharacterSheet(null, id, [{ index, header, value: "{\"charges\":{\"s1\":1}}", before: sheet.values[index] }]),
    (error) => error.message === "CHARACTER_SHEET_CHANGED" && error.character.values[index] === row[column],
  );
  assert.match(row[column], /Étourdi/);
  // Partie de la case actuelle, la même dépense passe.
  const next = "{\"charges\":{\"s1\":1},\"states\":[{\"id\":\"st-1\",\"name\":\"Étourdi\",\"level\":1}]}";
  await sheets.patchCharacterSheet(null, id, [{ index, header, value: next, before: row[column] }]);
  assert.equal(google.grid(characters, "Personnages")[1][column], next);
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

test("Texte saisi gardé en texte : création de fiche, nom et notes de relation", async () => {
  const characters = await linkCharacters([]);
  const created = await sheets.createCharacterForUser("uid-1", ["=IMPORTRANGE(\"x\")", "- elfe des bois"]);
  // La ligne ajoutée : le nom saisi y entre comme du texte, jamais comme une formule.
  const entered = google.world.enteredCells.find((cells) => cells[headers.indexOf("ID")]?.stringValue === created.id);
  assert.deepEqual(entered[headers.indexOf("Nom personnage")], { stringValue: "=IMPORTRANGE(\"x\")" });
  const row = record(google.grid(characters, "Personnages"), 1);
  assert.equal(row["ID"], created.id);
  assert.equal(row["Nom personnage"], "=IMPORTRANGE(\"x\")");
  assert.equal(row["Peuple"], "- elfe des bois");
  // Les formules d'Eraser restent des formules.
  assert.match(row["Rapidité"], /^=/);
  const [indexed] = (await getDb().select().from(schema.characterIndex)).filter((entry) => entry.id === created.id);
  assert.equal(indexed.name, "=IMPORTRANGE(\"x\")");
  assert.equal(indexed.subtitle, "- elfe des bois");

  const relations = fresh("relations");
  google.addSpreadsheet(relations, [{ title: "Relations", grid: [["ID", "ID personnage", "Type de cible", "ID cible", "Nom", "Niveau", "Notes personnelles", "Créé par", "ID campagne", "Créée le", "Modifiée le"]] }]);
  await link("character_relations", relations, "Relations");
  const saved = await sheets.saveCharacterRelation({ id: fresh("REL"), characterId: created.id, targetKind: "npc", targetId: "PNJ-1", name: "=Aldor", level: -1, personalNotes: "- se méfie de lui", createdByUid: "uid-1", campaignId: "CAMP-1" });
  const relationHeaders = google.grid(relations, "Relations")[0];
  const enteredRelation = google.world.enteredCells.at(-1);
  assert.deepEqual(enteredRelation[relationHeaders.indexOf("Nom")], { stringValue: "=Aldor" });
  assert.deepEqual(enteredRelation[relationHeaders.indexOf("Notes personnelles")], { stringValue: "- se méfie de lui" });
  const written = record(google.grid(relations, "Relations"), 1);
  assert.equal(written["Notes personnelles"], "- se méfie de lui");
  assert.equal(written["Nom"], "=Aldor");
  assert.equal(written["Niveau"], "-1");
  assert.equal(saved.personalNotes, "- se méfie de lui");
  assert.equal(saved.name, "=Aldor");
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
