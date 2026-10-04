import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le vrai moteur des index (lib/world-indexes.ts), branché sur un Google Sheets en mémoire
// qu'une « autre installation » modifie entre la lecture de la page et l'écriture : chaque
// écriture doit viser la ligne et la case que la page a vues, ou être refusée.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-world-index-writes-"));
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
const engine = await vite.ssrLoadModule("/lib/world-indexes.ts");
const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
const customIndexes = await vite.ssrLoadModule("/lib/custom-indexes.ts");
const { characterSheetHeaders } = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;
const SCHEMA_TAB = "Eraser · colonnes";
const SCHEMA_HEADERS = ["Onglet", "Colonne", "Nom d’origine", "Type et réglages (JSON)", "État", "Supprimé le"];
const creatureHeaders = definitions.worldIndexDefinitions.creatures.tabs[0].headers;

async function link(key, spreadsheetId, tabName) {
  await jdr.saveJdrSheet({ key, spreadsheetId, name: key, tabName, webViewLink: "" });
}

/** Une ligne de feuille à partir de { en-tête: valeur }. */
const line = (headers, values) => headers.map((header) => values[header] ?? "");

/** Les lignes d'une feuille sous forme { en-tête: valeur }, par identifiant. */
function byId(grid) {
  const [headers, ...rows] = grid;
  const id = headers.indexOf("ID");
  return Object.fromEntries(rows.filter((row) => row[id]).map((row) => [row[id], Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""]))]));
}

const ids = (grid) => grid.slice(1).map((row) => row[grid[0].indexOf("ID")]);

async function linkCreatures(rows, extraTabs = []) {
  const id = fresh("creatures");
  google.addSpreadsheet(id, [{ title: "Créatures", grid: [creatureHeaders, ...rows.map((values) => line(creatureHeaders, values))] }, ...extraTabs]);
  await link("creatures", id, "Créatures");
  return id;
}

beforeEach(async () => {
  google.reset();
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
  await db.delete(schema.characterIndex);
  await db.delete(schema.campaignIndex);
  await db.delete(schema.campaignCharacters);
  // Chaque test relit ses index : rien ne reste en mémoire d'un test à l'autre.
  for (const key of ["creatures", "creature-spells", "characters", "campaigns", "class-spells", "places", "peoples"]) engine.forgetEffectiveIndex(key);
});

test("Supprimer vise la ligne par son identifiant, même décalée ailleurs, sans confondre deux homonymes", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "Type": "Bête", "ID": "CRE-1" }, { "Nom": "Loup", "Type": "Garou", "ID": "CRE-2" }, { "Nom": "Ours", "Type": "Bête", "ID": "CRE-3" }]);
  const data = await engine.getWorldIndex("creatures", { refresh: true });
  const [table] = data.tables;
  // La page voit le second « Loup » (CRE-2) à la ligne 3.
  assert.equal(table.rows.find((row) => row.values[table.headers.indexOf("ID")] === "CRE-2").rowNumber, 3);
  // Une autre installation ajoute une ligne en haut : tout descend d'une ligne.
  google.grid(id, "Créatures").splice(1, 0, line(creatureHeaders, { "Nom": "Renard", "ID": "CRE-9" }));
  await engine.deleteWorldIndexRows("creatures", "Créatures", [{ rowNumber: 3, id: "CRE-2", name: "Loup" }]);
  assert.deepEqual(ids(google.grid(id, "Créatures")), ["CRE-9", "CRE-1", "CRE-3"]);
  // Une ligne déjà supprimée ailleurs : rien n'est supprimé à sa place.
  await assert.rejects(() => engine.deleteWorldIndexRows("creatures", "Créatures", [{ rowNumber: 4, id: "CRE-404", name: "Ours" }]), /WORLD_INDEX_ROW_CHANGED/);
  assert.deepEqual(ids(google.grid(id, "Créatures")), ["CRE-9", "CRE-1", "CRE-3"]);
});

test("Une ligne copiée dans Sheets (même identifiant) : la copie est visée par son nom à sa place", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "Type": "Bête", "ID": "CRE-1" }, { "Nom": "Loup", "Type": "Bête", "ID": "CRE-1" }, { "Nom": "Ours", "ID": "CRE-3" }]);
  // Un identifiant porté par deux lignes ne désigne aucune des deux.
  await assert.rejects(() => engine.deleteWorldIndexRows("creatures", "Créatures", [{ rowNumber: 3, id: "CRE-1", name: "Loup" }]), /WORLD_INDEX_ROW_DUPLICATE/);
  assert.equal(google.grid(id, "Créatures").length, 4);
  // La page, qui voit le doublon, ne l'envoie pas : la copie est reconnue par son nom à son numéro.
  await engine.deleteWorldIndexRows("creatures", "Créatures", [{ rowNumber: 3, id: "", name: "Loup" }]);
  assert.deepEqual(ids(google.grid(id, "Créatures")), ["CRE-1", "CRE-3"]);
});

test("Une case est écrite dans la ligne de son identifiant, et refusée si elle a changé ailleurs", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "Type": "Bête", "ID": "CRE-1" }, { "Nom": "Ours", "Type": "Bête", "ID": "CRE-2" }]);
  await engine.getWorldIndex("creatures", { refresh: true });
  // Une ligne ajoutée en haut ailleurs : la page croit encore l'ours à la ligne 3.
  google.grid(id, "Créatures").splice(1, 0, line(creatureHeaders, { "Nom": "Renard", "Type": "Bête", "ID": "CRE-9" }));
  await engine.updateWorldIndexCell("creatures", "Créatures", { rowNumber: 3, id: "CRE-2", name: "Ours" }, "Type", "Plantigrade", { previous: "Bête" });
  assert.equal(byId(google.grid(id, "Créatures"))["CRE-2"]["Type"], "Plantigrade");
  assert.equal(byId(google.grid(id, "Créatures"))["CRE-1"]["Type"], "Bête");

  // Quelqu'un d'autre a changé la case entre-temps : elle n'est pas écrasée.
  const grid = google.grid(id, "Créatures");
  grid.find((row) => row.includes("CRE-1"))[creatureHeaders.indexOf("Type")] = "Fauve";
  await assert.rejects(() => engine.updateWorldIndexCell("creatures", "Créatures", { rowNumber: 3, id: "CRE-1", name: "Loup" }, "Type", "Chien", { previous: "Bête" }), /WORLD_INDEX_CELL_CHANGED/);
  assert.equal(byId(google.grid(id, "Créatures"))["CRE-1"]["Type"], "Fauve");
  // Une case enrichie vue en HTML par la page est comparée en texte.
  await engine.updateWorldIndexCell("creatures", "Créatures", { rowNumber: 3, id: "CRE-1", name: "Loup" }, "Type", "Chien", { previous: "<b>Fauve</b>" });
  assert.equal(byId(google.grid(id, "Créatures"))["CRE-1"]["Type"], "Chien");

  // La ligne a été supprimée ailleurs : refusé, rien n'est écrit dans celle qui a pris sa place.
  grid.splice(grid.findIndex((row) => row.includes("CRE-2")), 1);
  await assert.rejects(() => engine.updateWorldIndexCell("creatures", "Créatures", { rowNumber: 4, id: "CRE-2", name: "Ours" }, "Type", "Disparu"), /WORLD_INDEX_ROW_CHANGED/);
  assert.ok(!google.grid(id, "Créatures").some((row) => row.includes("Disparu")));
  // Une colonne disparue : refusé.
  await assert.rejects(() => engine.updateWorldIndexCell("creatures", "Créatures", { rowNumber: 3, id: "CRE-1", name: "Loup" }, "Colonne fantôme", "X"), /WORLD_INDEX_COLUMN_NOT_FOUND/);
});

test("Une ligne sans identifiant est reconnue par son nom à son numéro, sinon refusée", async () => {
  // Une ligne saisie dans Sheets, pas encore numérotée.
  const id = await linkCreatures([{ "Nom": "Loup", "ID": "CRE-1" }, { "Nom": "Ours" }]);
  google.grid(id, "Créatures").splice(1, 0, line(creatureHeaders, { "Nom": "Renard", "ID": "CRE-9" }));
  // La page la voyait à la ligne 3 : c'est maintenant le loup qui y est.
  await assert.rejects(() => engine.updateWorldIndexFields("creatures", "Créatures", { rowNumber: 3, id: "", name: "Ours" }, { "Type": "Plantigrade" }), /WORLD_INDEX_ROW_CHANGED/);
  await engine.updateWorldIndexFields("creatures", "Créatures", { rowNumber: 4, id: "", name: "Ours" }, { "Type": "Plantigrade" }, { previous: { "Type": "" } });
  // La ligne 4 de la feuille (l'ours), pas la 3 (le loup).
  const grid = google.grid(id, "Créatures");
  assert.equal(grid[3][creatureHeaders.indexOf("Nom")], "Ours");
  assert.equal(grid[3][creatureHeaders.indexOf("Type")], "Plantigrade");
  assert.equal(grid[2][creatureHeaders.indexOf("Type")], "");
});

test("« Ajouter » un nom déjà présent complète sa ligne sans rien y remplacer", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "Type": "Bête", "ID": "CRE-1" }]);
  const data = await engine.getWorldIndex("creatures", { refresh: true });
  const headers = data.tables[0].headers;
  await engine.addWorldIndexRow("creatures", "Créatures", headers.map((header) => ({ "Nom": "Loup", "Type": "Garou", "Rang": "3" })[header] ?? ""), headers);
  const rows = byId(google.grid(id, "Créatures"));
  assert.deepEqual(Object.keys(rows), ["CRE-1"]);
  assert.equal(rows["CRE-1"]["Type"], "Bête");
  assert.equal(rows["CRE-1"]["Rang"], "3");
});

test("Une ligne ajoutée par le moteur et une autre ajoutée au même moment ailleurs dans Eraser ne s'écrasent pas", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "ID": "CRE-1" }]);
  const data = await engine.getWorldIndex("creatures", { refresh: true });
  const headers = data.tables[0].headers;
  // Un autre module ajoute sa ligne au même onglet juste quand le moteur écrit la sienne.
  // Écrite à un numéro choisi d'après sa lecture, la ligne du moteur écrasait celle de l'autre.
  let other = null;
  google.world.beforeRequest = async (url, init) => {
    const writing = (init.method === "PUT" && decodeURIComponent(url).includes("Créatures")) || (url.includes(":batchUpdate") && /appendCells|insertDimension/.test(String(init.body)));
    if (other || !writing) return;
    other = sheets.appendRows(id, sheets.sheetTabRange("Créatures", "A:Z"), [line(creatureHeaders, { "Nom": "Ours", "ID": "CRE-7" })], { valueInputOption: "RAW" });
    // L'autre ajout passe le premier ; s'il attendait la fin de celui du moteur, au plus 100 ms.
    await Promise.race([other, new Promise((resolve) => setTimeout(resolve, 100))]);
  };
  await engine.addWorldIndexRow("creatures", "Créatures", headers.map((header) => header === "Nom" ? "Renard" : ""), headers);
  await other;
  assert.ok(other, "l'autre ajout a bien eu lieu pendant celui du moteur");
  // Les deux lignes sont là, chacune une fois (leur ordre est celui de leur arrivée chez Google).
  const names = google.grid(id, "Créatures").slice(1).map((row) => row[creatureHeaders.indexOf("Nom")]).filter(Boolean);
  assert.deepEqual([...names].sort(), ["Loup", "Ours", "Renard"]);
  assert.ok(byId(google.grid(id, "Créatures"))["CRE-7"]);
});

test("Déplacer, dupliquer et insérer visent les lignes par leur identifiant", async () => {
  const id = fresh("places");
  const headers = definitions.worldIndexDefinitions.places.tabs[0].headers;
  const tabs = definitions.worldIndexDefinitions.places.tabs.map((tab) => ({ title: tab.name, grid: [tab.headers] }));
  tabs[0].grid.push(line(headers, { "Nom": "Brume", "ID": "LIE-1" }), line(headers, { "Nom": "Val", "ID": "LIE-2" }));
  google.addSpreadsheet(id, tabs);
  await link("places", id, tabs[0].title);
  await engine.getWorldIndex("places", { refresh: true });
  const first = tabs[0].title;
  const second = tabs[1].title;
  // Une autre installation ajoute une ligne en haut : « Val » descend à la ligne 4.
  google.grid(id, first).splice(1, 0, line(headers, { "Nom": "Cime", "ID": "LIE-9" }));
  await engine.moveWorldIndexRows("places", first, second, [{ rowNumber: 3, id: "LIE-2", name: "Val" }]);
  assert.deepEqual(ids(google.grid(id, first)), ["LIE-9", "LIE-1"]);
  assert.deepEqual(ids(google.grid(id, second)), ["LIE-2"]);
  // Dupliquer : la copie, sous l'originale (retrouvée par son identifiant), a le sien.
  google.grid(id, first).splice(1, 0, line(headers, { "Nom": "Gué", "ID": "LIE-8" }));
  await engine.duplicateWorldIndexRows("places", first, [{ rowNumber: 3, id: "LIE-1", name: "Brume" }]);
  const after = google.grid(id, first);
  assert.deepEqual(after.slice(1).map((row) => row[headers.indexOf("Nom")]), ["Gué", "Cime", "Brume", "Brume"]);
  assert.match(after[4][headers.indexOf("ID")], /^LIE-[0-9A-F]{8}$/);
  // Insérer : sous la ligne visée, là où elle est maintenant.
  await engine.insertWorldIndexRows("places", first, { rowNumber: 2, id: "LIE-9", name: "Cime" }, 1);
  assert.deepEqual(google.grid(id, first).slice(1).map((row) => row[headers.indexOf("Nom")] ?? ""), ["Gué", "Cime", "", "Brume", "Brume"]);
});

test("Schéma : une lecture ratée de « Eraser · colonnes » n'efface ni ne recrée rien", async () => {
  // « Climat » a été supprimée définitivement : la feuille ne l'a plus, le schéma le dit.
  const headers = creatureHeaders.filter((header) => header !== "Climat");
  const id = fresh("creatures");
  google.addSpreadsheet(id, [
    { title: "Créatures", grid: [headers, line(headers, { "Nom": "Loup", "ID": "CRE-1" })] },
    { title: SCHEMA_TAB, grid: [SCHEMA_HEADERS, ["Créatures", "Odeur", "", "{\"kind\":\"rich\"}", "ajouté", ""], ["Créatures", "Climat", "", "", "supprimé", "2026-01-01T00:00:00.000Z"], ["Créatures", "Rang", "", "{\"kind\":\"number\"}", "", ""]] },
  ]);
  await link("creatures", id, "Créatures");
  const schemaBefore = google.grid(id, SCHEMA_TAB).map((row) => [...row]);
  const stop = google.failReads(SCHEMA_TAB);
  try {
    // L'affichage tient bon, sans les réglages…
    const data = await engine.getWorldIndex("creatures", { refresh: true });
    assert.equal(data.tables[0].rows.length, 1);
    // …mais la colonne supprimée n'est pas recréée, et rien n'écrit un schéma vide.
    assert.ok(!google.grid(id, "Créatures")[0].includes("Climat"));
    await assert.rejects(() => engine.applyWorldSchemaOperations("creatures", [{ op: "add-column", tab: "Créatures", header: "Cri", spec: { kind: "rich" } }]));
    await assert.rejects(() => engine.restoreWorldIndexTrash("creatures", "Créatures", "Climat"));
    assert.deepEqual(google.grid(id, SCHEMA_TAB), schemaBefore);
    assert.ok(!google.grid(id, "Créatures")[0].includes("Cri"));
  } finally {
    stop();
  }
  // Google répond de nouveau : l'opération passe et garde les réglages d'avant.
  await engine.applyWorldSchemaOperations("creatures", [{ op: "add-column", tab: "Créatures", header: "Cri", spec: { kind: "rich" } }]);
  const rows = google.grid(id, SCHEMA_TAB).slice(1).filter((row) => row[0]);
  assert.ok(rows.some((row) => row[1] === "Odeur" && row[4] === "ajouté"));
  assert.ok(rows.some((row) => row[1] === "Climat" && row[4] === "supprimé"));
  assert.ok(rows.some((row) => row[1] === "Rang" && row[3].includes("number")));
  assert.ok(rows.some((row) => row[1] === "Cri"));
  assert.ok(!google.grid(id, "Créatures")[0].includes("Climat"));
});

test("Schéma : une colonne liée aux créatures garde les réglages des sorts des créatures écrits entre-temps", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "ID": "CRE-1" }], [
    { title: "Sorts des créatures", grid: [["ID", "Nom", "Effet", "Description", "Type", "Compétences", "Distance", "Charges"]] },
    { title: SCHEMA_TAB, grid: [SCHEMA_HEADERS, ["Créatures", "Odeur", "", "{\"kind\":\"rich\"}", "ajouté", ""]] },
  ]);
  const peoples = fresh("peoples");
  google.addSpreadsheet(peoples, [{ title: "Peuples", grid: [definitions.worldIndexDefinitions.peoples.tabs[0].headers] }]);
  await link("peoples", peoples, "Peuples");
  // Les deux index du classeur partagé sont lus (et gardés en mémoire) par cette installation…
  await engine.getWorldIndex("creatures", { refresh: true });
  await engine.getWorldIndex("creature-spells", { refresh: true });
  // …puis les sorts reçoivent une colonne : le schéma du classeur change.
  await engine.applyWorldSchemaOperations("creature-spells", [{ op: "add-column", tab: "Sorts des créatures", header: "Rareté", spec: { kind: "rich" } }]);
  // Une colonne liée des peuples vers les créatures réécrit leur schéma : la ligne des sorts reste.
  await engine.applyWorldSchemaOperations("peoples", [{ op: "add-column", tab: "Peuples", header: "Bêtes", spec: { kind: "linked", link: { index: "creatures", tab: "Créatures", column: "Peuples" } } }]);
  let rows = google.grid(id, SCHEMA_TAB).slice(1).filter((row) => row[0]);
  assert.ok(rows.some((row) => row[0] === "Sorts des créatures" && row[1] === "Rareté"), JSON.stringify(rows));
  assert.ok(rows.some((row) => row[0] === "Créatures" && row[1] === "Peuples"));
  // Une colonne liée des créatures vers elles-mêmes : l'autre côté, écrit en route, reste aussi.
  await engine.applyWorldSchemaOperations("creatures", [{ op: "add-column", tab: "Créatures", header: "Proies", spec: { kind: "linked", link: { index: "creatures", tab: "Créatures", column: "Prédateurs" } } }]);
  rows = google.grid(id, SCHEMA_TAB).slice(1).filter((row) => row[0]);
  for (const column of ["Rareté", "Peuples", "Proies", "Prédateurs", "Odeur"]) assert.ok(rows.some((row) => row[1] === column), `${column} : ${JSON.stringify(rows)}`);
});

test("Corbeille : une colonne en double n'est jamais effacée à l'aveugle", async () => {
  // « Comportement » deux fois : la première porte les données, la copie (en Q) est vide.
  const headers = [...creatureHeaders];
  headers.splice(16, 0, "Comportement");
  const id = fresh("creatures");
  google.addSpreadsheet(id, [
    { title: "Créatures", grid: [headers, line(headers, { "Nom": "Loup", "Comportement": "Agressif", "ID": "CRE-1" })] },
    { title: SCHEMA_TAB, grid: [SCHEMA_HEADERS, ["Créatures", "Comportement", "", "", "", "2026-01-01T00:00:00.000Z"]] },
  ]);
  await link("creatures", id, "Créatures");
  assert.equal(headers.filter((header) => header === "Comportement").length, 2);
  await assert.rejects(() => engine.purgeWorldIndexTrash("creatures", "Créatures", "Comportement"), /INDEX_TRASH_AMBIGUOUS/);
  const grid = google.grid(id, "Créatures");
  assert.deepEqual(grid[0], headers);
  assert.equal(grid[1][grid[0].indexOf("Comportement")], "Agressif");
  // Toujours à la corbeille : le schéma n'a pas bougé.
  assert.deepEqual(google.grid(id, SCHEMA_TAB)[1], ["Créatures", "Comportement", "", "", "", "2026-01-01T00:00:00.000Z"]);
});

/** Une feuille de personnages rangée comme Eraser, avec ces fiches. */
async function linkCharacters(people) {
  const headers = [...characterSheetHeaders];
  const id = fresh("chars");
  google.addSpreadsheet(id, [{ title: "Personnages", grid: [headers, ...people.map((values) => line(headers, values))] }]);
  await link("characters", id, "Personnages");
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `character-schema:v5:${characterSheetHeaders.length}` }).onConflictDoNothing();
  return id;
}

test("Index d'entités : « Modifier » ne déplace, ne renomme ni n'efface jamais une colonne de la feuille", async () => {
  const id = await linkCharacters([{ "ID": "PER-1", "Joueur": "uid-1", "Nom personnage": "Brin", "Peuple": "Elfe" }]);
  const before = [...google.grid(id, "Personnages")[0]];
  // L'ordre des colonnes ne change que l'affichage.
  const data = await engine.applyWorldSchemaOperations("characters", [{ op: "order-columns", tab: "Personnages", headers: ["Nom personnage", "Peuple", "Joueur", "ID", "Classe", "Level", "Titre honorifique", "Portrait"] }]);
  assert.deepEqual(google.grid(id, "Personnages")[0], before);
  assert.deepEqual(data.columns.Personnages.map((column) => column.header).slice(0, 3), ["Nom personnage", "Peuple", "Joueur"]);
  // Une colonne lue par les fiches ne se renomme pas, même déverrouillée…
  await assert.rejects(() => engine.applyWorldSchemaOperations("characters", [{ op: "rename", tab: "Personnages", header: "Peuple", to: "Race", force: true }]), /INDEX_SCHEMA_LOCKED/);
  // …et ne s'efface pas : à la corbeille, elle reste dans la feuille.
  await engine.applyWorldSchemaOperations("characters", [{ op: "remove-column", tab: "Personnages", header: "Peuple", force: true }]);
  await assert.rejects(() => engine.purgeWorldIndexTrash("characters", "Personnages", "Peuple"), /INDEX_TRASH_ENTITY_LOCKED/);
  assert.deepEqual(google.grid(id, "Personnages")[0], before);
  assert.equal(byId(google.grid(id, "Personnages"))["PER-1"]["Peuple"], "Elfe");
});

test("Personnages et campagnes : un MJ n'écrit que dans ses lignes, jamais le propriétaire", async () => {
  const characters = await linkCharacters([{ "ID": "PER-A", "Joueur": "uid-1", "Nom personnage": "Aldor" }, { "ID": "PER-B", "Joueur": "uid-2", "Nom personnage": "Brin" }]);
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"], ["CAMP-1", "mj-1", "Les Brumes", "", "", ""], ["CAMP-2", "mj-2", "Le Val", "", "", ""]] }]);
  await link("campaigns", camps, "Campagnes");
  const links = fresh("links");
  google.addSpreadsheet(links, [{ title: "Personnages par campagne", grid: [["ID campagne", "ID personnage"], ["CAMP-1", "PER-A"]] }]);
  await link("campaign_characters", links, "Personnages par campagne");
  await sheets.syncExistingIdentityIndexes();
  const mj = { uid: "mj-1", role: "mj" };
  const guard = engine.worldIndexRowGuard("characters", mj);
  assert.equal(engine.worldIndexRowGuard("characters", { uid: "a", role: "admin" }), undefined);
  assert.equal(engine.worldIndexRowGuard("creatures", mj), undefined);

  // Un personnage de sa campagne : oui.
  await engine.updateWorldIndexCell("characters", "Personnages", { rowNumber: 2, id: "PER-A", name: "Aldor" }, "Titre honorifique", "Le Sage", { guard });
  assert.equal(byId(google.grid(characters, "Personnages"))["PER-A"]["Titre honorifique"], "Le Sage");
  // Le propriétaire, même de cette ligne : non, quel que soit le chemin.
  await assert.rejects(() => engine.updateWorldIndexCell("characters", "Personnages", { rowNumber: 2, id: "PER-A", name: "Aldor" }, "Joueur", "mj-1", { guard }), /WORLD_INDEX_OWNER_LOCKED/);
  await assert.rejects(() => engine.updateWorldIndexFields("characters", "Personnages", { rowNumber: 2, id: "PER-A", name: "Aldor" }, { "Joueur": "mj-1" }, { guard }), /WORLD_INDEX_OWNER_LOCKED/);
  // Le personnage d'un autre MJ : non, ni modifié ni copié.
  await assert.rejects(() => engine.updateWorldIndexCell("characters", "Personnages", { rowNumber: 3, id: "PER-B", name: "Brin" }, "Titre honorifique", "Volé", { guard }), /WORLD_INDEX_WRITE_DENIED/);
  await assert.rejects(() => engine.duplicateWorldIndexRows("characters", "Personnages", [{ rowNumber: 3, id: "PER-B", name: "Brin" }], { guard }), /WORLD_INDEX_WRITE_DENIED/);
  assert.equal(google.grid(characters, "Personnages").length, 3);
  assert.equal(byId(google.grid(characters, "Personnages"))["PER-B"]["Joueur"], "uid-2");

  // Les campagnes : la sienne oui, celle d'un autre non, la case « MJ » jamais.
  const campaignGuard = engine.worldIndexRowGuard("campaigns", mj);
  await engine.updateWorldIndexCell("campaigns", "Campagnes", { rowNumber: 2, id: "CAMP-1", name: "Les Brumes" }, "Description", "Brouillard", { guard: campaignGuard });
  await assert.rejects(() => engine.updateWorldIndexCell("campaigns", "Campagnes", { rowNumber: 3, id: "CAMP-2", name: "Le Val" }, "Description", "À moi", { guard: campaignGuard }), /WORLD_INDEX_WRITE_DENIED/);
  await assert.rejects(() => engine.updateWorldIndexCell("campaigns", "Campagnes", { rowNumber: 2, id: "CAMP-1", name: "Les Brumes" }, "MJ", "mj-2", { guard: campaignGuard }), /WORLD_INDEX_OWNER_LOCKED/);
  const campaigns = byId(google.grid(camps, "Campagnes"));
  assert.equal(campaigns["CAMP-1"]["Description"], "Brouillard");
  assert.equal(campaigns["CAMP-1"]["MJ"], "mj-1");
  assert.equal(campaigns["CAMP-2"]["Description"], "");
});

test("Sorts des classes : colonnes de classe et « Compétence » verrouillées, copie sans rang", async () => {
  const policy = (header) => definitions.worldColumnPolicy("class-spells", "Sorts", header, [], { classNames: ["Guerrier·e", "Mage"] });
  for (const header of ["Guerrier·e", "Mage", "CLA-0003", "Compétence", "Compétences utilisées"]) {
    assert.equal(policy(header).rename, false, header);
    assert.equal(policy(header).remove, false, header);
  }
  assert.equal(policy("Mes notes").rename, true);

  // Le classeur des sorts, nommé, est aussi dans le Drive : il s'y retrouve par son nom.
  const id = fresh("spells");
  const headers = ["ID", "Nom", "Effet", "Description", "Type", "Compétence", "Distance", "Charges", "Guerrier·e", "CLA-0002"];
  google.addSpreadsheet(id, [{ title: "Sorts", grid: [headers, line(headers, { "ID": "SOR-1", "Nom": "Frappe", "Type": "Actif", "Guerrier·e": "2", "CLA-0002": "1" })] }], { name: "Sorts de classe" });
  const db = getDb();
  await db.delete(schema.classIndex);
  await db.insert(schema.classIndex).values([{ id: "CLA-0001", type: "Martiale", name: "Guerrier·e" }, { id: "CLA-0002", type: "Magique", name: "Mage" }]);
  // Classes déjà lues (pas de relecture de la feuille Classes), images déjà rangées.
  await db.insert(schema.sheetIndexSyncs).values([{ key: "classes:global", syncedAt: new Date().toISOString() }, { key: "class-images:renamed-v2", syncedAt: new Date().toISOString() }]);
  await engine.duplicateWorldIndexRows("class-spells", "Sorts", [{ rowNumber: 2, id: "SOR-1", name: "Frappe" }]);
  const grid = google.grid(id, "Sorts");
  assert.equal(grid.length, 3);
  const copy = Object.fromEntries(headers.map((header, column) => [header, grid[2][column] ?? ""]));
  assert.equal(copy["Nom"], "Frappe");
  assert.notEqual(copy["ID"], "SOR-1");
  // Chaque rang n'admet que trois sorts : la copie n'en prend aucun.
  assert.equal(copy["Guerrier·e"], "");
  assert.equal(copy["CLA-0002"], "");
  assert.equal(grid[1][headers.indexOf("Guerrier·e")], "2");
});

test("Index personnalisés : la corbeille relit le registre, n'écrit que sa case et vérifie le classeur", async () => {
  // Les classeurs nommés sont aussi dans le Drive : retrouvés par leur nom, mis à la corbeille.
  const inDrive = (id) => google.world.drive.find((file) => file.id === id);
  const registry = fresh("registry");
  const headers = ["Clé", "Titre", "Classeur", "ID du classeur", "Description", "Créé le", "Supprimé le"];
  google.addSpreadsheet(registry, [{ title: "Index", grid: [headers, ["perso-reliques", "Reliques", "Index · Reliques", "reliques-1", "", "2026-01-01", "2026-02-01"], ["perso-autre", "Autre", "Index · Autre", "notes-1", "", "2026-01-01", "2026-02-01"]] }], { name: "Eraser · Index personnalisés" });
  google.addSpreadsheet("reliques-1", [{ title: "Reliques", grid: [["Nom", "ID"]] }], { name: "Index · Reliques" });
  google.addSpreadsheet("notes-1", [{ title: "Notes", grid: [["Nom"]] }], { name: "Notes de la MJ" });
  // Le registre est lu (et gardé en mémoire)…
  assert.equal((await customIndexes.listTrashedCustomIndexes()).length, 2);
  // …puis une autre installation renomme un index : la restauration ne remet pas l'ancien titre.
  google.grid(registry, "Index")[1][1] = "Reliques sacrées";
  await customIndexes.restoreCustomIndex("perso-reliques");
  assert.deepEqual(google.grid(registry, "Index")[1], ["perso-reliques", "Reliques sacrées", "Index · Reliques", "reliques-1", "", "2026-01-01", ""]);
  // Un classeur qui n'est pas un « Index · … » ne part jamais à la corbeille.
  await assert.rejects(() => customIndexes.purgeCustomIndex("perso-autre"), /CUSTOM_INDEX_FILE_MISMATCH/);
  assert.equal(inDrive("notes-1").trashed, undefined);
  assert.equal(google.grid(registry, "Index")[2][0], "perso-autre");
  // Le bon classeur : à la corbeille du Drive, et sa ligne du registre vidée.
  await customIndexes.trashCustomIndex("perso-reliques");
  await customIndexes.purgeCustomIndex("perso-reliques");
  assert.equal(inDrive("reliques-1").trashed, true);
  assert.deepEqual(google.grid(registry, "Index")[1].filter(Boolean), []);
});

test("Une écriture d'un autre module pendant une tâche du moteur fait relire l'index", async () => {
  const id = await linkCreatures([{ "Nom": "Loup", "Type": "Bête", "ID": "CRE-1" }]);
  await engine.getWorldIndex("creatures", { refresh: true });
  // Une écriture du moteur, ralentie par une lecture à refaire, sur les créatures…
  const stop = google.failReads("Créatures", { times: 1 });
  const writing = engine.updateWorldIndexCell("creatures", "Créatures", { rowNumber: 2, id: "CRE-1", name: "Loup" }, "Rang", "2");
  // …pendant qu'un autre module écrit dans le même classeur.
  google.grid(id, "Créatures")[1][creatureHeaders.indexOf("Type")] = "Garou";
  await sheets.updateRange(id, "'Créatures'!Z1:Z1", [[""]]);
  await writing;
  stop();
  const data = await engine.getWorldIndex("creatures");
  assert.equal(data.tables[0].rows[0].values[data.tables[0].headers.indexOf("Type")], "Garou");
});
