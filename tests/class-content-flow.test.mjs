import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le vrai lib/class-content.ts et les routes des sorts, branchés sur un Google Sheets et un
// Drive en mémoire. La feuille bouge « depuis une autre installation » entre la lecture de
// la page et son écriture : chaque écriture doit toucher le bon sort, ou être refusée.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-class-content-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: /^@\/lib\/server-auth$/, replacement: `${root}tests/fakes/server-auth.ts` },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const content = await vite.ssrLoadModule("/lib/class-content.ts");
const { remapSpellChoiceIds } = await vite.ssrLoadModule("/lib/class-spell-utils.ts");
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const spellRoute = await vite.ssrLoadModule("/app/api/resources/class-index/route.ts");
const presentationRoute = await vite.ssrLoadModule("/app/api/classes/content/route.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");
const { classSheetHeaders } = await vite.ssrLoadModule("/lib/entity-sheets.ts");
const { characterSheetHeaders } = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");

// Les classeurs gardent les mêmes identifiants d'un test à l'autre (le classeur des sorts
// est retrouvé dans le Drive puis gardé en mémoire) ; leur contenu est neuf à chaque test.
const SPELLS = "sorts";
const CHARACTERS = "personnages";
const spellHeaders = ["ID", "Nom", "Effet", "Description", "Type", "Compétence", "Distance", "Charges", "Guerrier·e", "Mage"];
const CHOICES = "Sorts de classe choisis JSON";

/** Des lignes rangées sous leurs en-têtes ({ en-tête: valeur }). */
function rowsOf(headers, rows) {
  return [headers, ...rows.map((values) => headers.map((header) => values[header] ?? ""))];
}

/** La ligne d'une feuille sous forme { en-tête: valeur } (les cases vides omises). */
function record(gridRows, rowIndex) {
  const headers = gridRows[0];
  return Object.fromEntries((gridRows[rowIndex] ?? []).flatMap((value, column) => value !== "" ? [[headers[column] || `#${column}`, value]] : []));
}

function spellSheet(rows, { headers = spellHeaders, tabs = [] } = {}) {
  google.addSpreadsheet(SPELLS, [{ title: "Sorts", grid: rowsOf(headers, rows) }, ...tabs]);
  return () => google.grid(SPELLS, "Sorts");
}

const names = (grid) => grid.slice(1).map((_, index) => record(grid, index + 1)["Nom"]);

async function linkCharacters(people) {
  google.addSpreadsheet(CHARACTERS, [{ title: "Personnages", grid: rowsOf(characterSheetHeaders, people) }]);
  await jdr.saveJdrSheet({ key: "characters", spreadsheetId: CHARACTERS, name: "Feuille de personnage", tabName: "Personnages", webViewLink: "" });
}

/** Le brouillon que la page construit à partir d'un sort (comme toDraft dans l'interface). */
function toDraft(spell) {
  return { id: spell.id.startsWith("LIGNE-") ? "" : spell.id, name: spell.name === "Sort sans nom" ? "" : spell.name, effect: spell.effect, effectHtml: spell.effectHtml, description: spell.description, descriptionHtml: spell.descriptionHtml, type: spell.type, skillsRaw: spell.skillsRaw, distance: spell.distance, distanceHtml: spell.distanceHtml, charges: spell.charges, chargesLabel: spell.chargesLabel, classRanks: { ...spell.classRanks } };
}

async function post(route, url, body) {
  const response = await route.POST(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}
const spellAction = (body) => post(spellRoute, "/api/resources/class-index", body);

/** Les sorts tels que la page « Création de classe » les lit. */
async function pageSpells() {
  const { spells } = await content.listClassResources();
  return Object.fromEntries(spells.map((spell) => [spell.name, spell]));
}

beforeEach(async () => {
  google.reset();
  const db = getDb();
  // Les feuilles reliées sont aussi gardées en mémoire quelques minutes : oubliées une à une.
  for (const key of ["classes", "characters"]) await jdr.forgetJdrSheet(key);
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
  await db.delete(schema.classIndex);
  // La synchronisation des images de classes (Drive, script Google) n'est pas le sujet ici.
  await db.insert(schema.sheetIndexSyncs).values({ key: "class-images:renamed-v2" });
  for (const id of [SPELLS, CHARACTERS, "presentation", "classes"]) sheets.clearSpreadsheetReadCache(id);
  content.invalidateClassContentCaches();
  google.world.drive.push(
    { id: "dossier-classe", name: "Classe", mimeType: "application/vnd.google-apps.folder" },
    { id: SPELLS, name: "Sorts de classe", mimeType: "application/vnd.google-apps.spreadsheet", parents: ["dossier-classe"] },
    { id: "presentation", name: "Présentation des classes", mimeType: "application/vnd.google-apps.spreadsheet", parents: ["dossier-classe"] },
  );
  google.addSpreadsheet("classes", [{ title: "Classes", grid: rowsOf(classSheetHeaders, [
    { "ID": "CLA-0001", "Type": "Solide", "Nom de la classe": "Guerrier·e" },
    { "ID": "CLA-0002", "Type": "Éclectique", "Nom de la classe": "Mage" },
  ]) }]);
  await jdr.saveJdrSheet({ key: "classes", spreadsheetId: "classes", name: "Classes", tabName: "Classes", webViewLink: "" });
});

const fireball = { "ID": "SOR-FEU", "Nom": "Boule de feu", "Effet": "Inflige 2d6", "Type": "Actif -Action majeur", "Charges": "2", "Mage": "3" };
const lightning = { "ID": "SOR-ECLAIR", "Nom": "Éclair", "Effet": "Inflige 1d8", "Type": "Actif -Action mineur", "Mage": "4" };
const frost = { "ID": "SOR-GEL", "Nom": "Gel", "Effet": "Ralentit", "Type": "Passif", "Guerrier·e": "2" };

test("Supprimer : une ligne insérée au-dessus entre-temps ne fait pas supprimer le sort voisin", async () => {
  const grid = spellSheet([fireball, lightning, frost]);
  const spells = await pageSpells();
  assert.equal(spells["Éclair"].rowNumber, 3);
  // Une autre installation insère un sort en tête : « Éclair » descend en ligne 4.
  grid().splice(1, 0, rowsOf(spellHeaders, [{ "ID": "SOR-NEUF", "Nom": "Nouveau", "Type": "Passif" }])[1]);
  const deleted = await spellAction({ action: "delete", rowNumber: spells["Éclair"].rowNumber, expectedId: spells["Éclair"].id, index: "classes" });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.deepEqual(names(grid()), ["Nouveau", "Boule de feu", "Gel"]);

  // Supprimé ailleurs entre-temps : rien n'est supprimé à sa place.
  const again = await spellAction({ action: "delete", rowNumber: 3, expectedId: "SOR-ECLAIR", index: "classes" });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /La feuille a changé entre-temps : actualise puis recommence\./);
  // Le même ID sur deux lignes (une ligne copiée dans Sheets) : refusé aussi.
  grid().push([...grid()[3]]);
  const duplicated = await spellAction({ action: "delete", rowNumber: 4, expectedId: "SOR-GEL", index: "classes" });
  assert.equal(duplicated.status, 409);
  assert.deepEqual(names(grid()), ["Nouveau", "Boule de feu", "Gel", "Gel"]);
});

test("Modifier, lier ou supprimer sans l'ID attendu est refusé, rien n'est écrit", async () => {
  const grid = spellSheet([fireball, lightning]);
  const before = JSON.stringify(grid());
  const { "Boule de feu": spell } = await pageSpells();
  const draft = { ...toDraft(spell), effect: "Inflige 9d6", effectHtml: undefined };
  const update = await spellAction({ action: "update", rowNumber: spell.rowNumber, original: toDraft(spell), draft });
  assert.equal(update.status, 400);
  const link = await spellAction({ action: "link", rowNumber: spell.rowNumber, classId: "CLA-0001", rank: 5 });
  assert.equal(link.status, 400);
  const remove = await spellAction({ action: "delete", rowNumber: spell.rowNumber });
  assert.equal(remove.status, 400);
  await assert.rejects(() => content.saveClassSpell(spell.rowNumber, draft, { original: toDraft(spell) }), /CLASS_SPELL_ID_REQUIRED/);
  await assert.rejects(() => content.saveClassSpell(spell.rowNumber, draft, { expectedId: spell.id }), /CLASS_SPELL_ORIGINAL_REQUIRED/);
  assert.equal(JSON.stringify(grid()), before);
});

test("Lier : le rang va au sort retrouvé par son ID, et pas s'il a changé entre-temps", async () => {
  const grid = spellSheet([fireball, lightning]);
  const { "Éclair": spell } = await pageSpells();
  grid().splice(1, 1);
  const linked = await spellAction({ action: "link", rowNumber: spell.rowNumber, expectedId: spell.id, classId: "CLA-0001", rank: 5, originalRank: null });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(record(grid(), 1)["Nom"], "Éclair");
  assert.equal(record(grid(), 1)["Guerrier·e"], "5");
  // Le rang de Mage a changé ailleurs : le lien vu par la page n'est plus le bon.
  grid()[1][spellHeaders.indexOf("Mage")] = "6";
  const stale = await spellAction({ action: "link", rowNumber: 2, expectedId: spell.id, classId: "CLA-0002", rank: 7, originalRank: 4 });
  assert.equal(stale.status, 409);
  assert.equal(record(grid(), 1)["Mage"], "6");
});

test("Modifier : un champ changé ailleurs entre-temps donne 409 ; seuls les champs changés sont écrits", async () => {
  const grid = spellSheet([fireball, lightning]);
  const { "Boule de feu": spell } = await pageSpells();
  // Une autre installation corrige l'effet et relie le sort au Guerrier·e.
  grid()[1][spellHeaders.indexOf("Effet")] = "Inflige 3d6";
  grid()[1][spellHeaders.indexOf("Guerrier·e")] = "1";
  // La page, ouverte avant, change aussi l'effet : refusé, la correction reste.
  const conflict = await spellAction({ action: "update", rowNumber: spell.rowNumber, expectedId: spell.id, original: toDraft(spell), draft: { ...toDraft(spell), effect: "Inflige 4d6", effectHtml: undefined }, index: "classes" });
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.error, /actualise puis recommence/);
  assert.equal(record(grid(), 1)["Effet"], "Inflige 3d6");
  // Elle change seulement le type : écrit, sans ramener l'ancien effet ni vider le lien Guerrier·e.
  const saved = await spellAction({ action: "update", rowNumber: spell.rowNumber, expectedId: spell.id, original: toDraft(spell), draft: { ...toDraft(spell), type: "Actif -Action mineur" }, index: "classes" });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(record(grid(), 1), { ...fireball, "Effet": "Inflige 3d6", "Type": "Actif -Action mineur", "Guerrier·e": "1" });
  // Le sort rendu est celui de la feuille, relu : la page repart de là.
  assert.equal(saved.body.result.spell.effect, "Inflige 3d6");
  assert.deepEqual(saved.body.result.spell.classRanks, { "CLA-0001": 1, "CLA-0002": 3 });
  // Une case de classe que le brouillon ne cite pas n'est jamais vidée (même illisible comme rang).
  grid()[2][spellHeaders.indexOf("Guerrier·e")] = "à voir";
  const { "Éclair": other } = await pageSpells();
  const renamed = await spellAction({ action: "update", rowNumber: other.rowNumber, expectedId: other.id, original: toDraft(other), draft: { ...toDraft(other), name: "Éclair en chaîne", classRanks: {} }, index: "classes" });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal(record(grid(), 2)["Guerrier·e"], "à voir");
  // Le brouillon retire le lien Mage qu'il voyait : celui-là seul est effacé.
  assert.equal(record(grid(), 2)["Mage"], undefined);
  assert.equal(record(grid(), 2)["Nom"], "Éclair en chaîne");
});

test("Fusion : les bonnes lignes partent en un seul appel, les fiches citent le sort gardé", async () => {
  const care = { "ID": "SOR-SOIN", "Nom": "Soin", "Effet": "Rend 2d4 PV", "Type": "Actif -Action majeur", "Guerrier·e": "1" };
  const care2 = { "ID": "SOR-SOINS", "Nom": "Soins", "Effet": "Rend 2d4 PV", "Type": "Actif -Action majeur", "Mage": "2" };
  const other = { "ID": "SOR-AUTRE", "Nom": "Autre", "Effet": "Rien", "Type": "Passif" };
  const care3 = { "ID": "SOR-SOIN-LEGER", "Nom": "Soin léger", "Effet": "Rend 1d4 PV", "Type": "Actif -Action majeur" };
  const grid = spellSheet([care, care2, other, care3], { tabs: [{ title: "Doublons ignorés", grid: [["Sort 1", "Sort 2", "Ignoré le"], ["SOR-SOINS", "SOR-AUTRE", "hier"], ["SOR-SOIN", "SOR-SOIN-LEGER", "hier"]] }] });
  const aldor = JSON.stringify({ choices: { "CLA-0002": { "2": "SOR-SOINS" } }, charges: { "SOR-SOINS": 1 }, order: ["SOR-AUTRE", "SOR-SOINS"], extras: [], edits: { "SOR-SOINS": { name: "Mes soins" } }, removed: [], notes: "garde-moi" });
  const brin = JSON.stringify({ choices: {}, extras: ["SOR-AUTRE"] });
  const cael = JSON.stringify({ choices: { "CLA-0001": { "1": "SOR-SOIN" } }, removed: ["SOR-SOIN-LEGER"], extras: [] });
  await linkCharacters([
    { "ID": "PERSO-A", "Joueur": "uid-1", "Nom personnage": "Aldor", [CHOICES]: aldor },
    { "ID": "PERSO-B", "Joueur": "uid-1", "Nom personnage": "Brin", [CHOICES]: brin },
    { "ID": "PERSO-C", "Joueur": "uid-2", "Nom personnage": "Cael", [CHOICES]: cael },
  ]);
  const spells = await pageSpells();
  const keep = spells["Soin"];
  const removed = [spells["Soins"], spells["Soin léger"]];
  // Une autre installation insère une ligne en tête : tout descend d'une ligne.
  grid().splice(1, 0, rowsOf(spellHeaders, [{ "ID": "SOR-TETE", "Nom": "En tête", "Type": "Passif" }])[1]);
  const draft = { ...toDraft(keep), classRanks: { "CLA-0001": 1, "CLA-0002": 2 } };
  const before = google.world.calls.length;
  const merged = await spellAction({ action: "merge", keep: { rowNumber: keep.rowNumber, id: keep.id }, remove: removed.map((spell) => ({ rowNumber: spell.rowNumber, id: spell.id })), original: toDraft(keep), draft, index: "classes" });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  assert.deepEqual(names(grid()), ["En tête", "Soin", "Autre"]);
  assert.deepEqual(record(grid(), 2), { ...care, "Mage": "2" });
  // Une seule suppression, de la plus basse ligne à la plus haute (« Soin léger » en ligne 6, « Soins » en 4).
  const deletions = google.world.calls.slice(before).filter((call) => (call.body?.requests ?? []).some((request) => request.deleteDimension));
  assert.equal(deletions.length, 1);
  assert.deepEqual(deletions[0].body.requests.map((request) => request.deleteDimension.range.startIndex), [5, 3]);
  // Les fiches citent le sort gardé ; le reste de leur JSON ne bouge pas.
  const characters = google.grid(CHARACTERS, "Personnages");
  const choicesOf = (row) => record(characters, row)[CHOICES];
  assert.deepEqual(JSON.parse(choicesOf(1)), { choices: { "CLA-0002": { "2": "SOR-SOIN" } }, charges: { "SOR-SOIN": 1 }, order: ["SOR-AUTRE", "SOR-SOIN"], extras: [], edits: { "SOR-SOIN": { name: "Mes soins" } }, removed: [], notes: "garde-moi" });
  assert.equal(choicesOf(2), brin);
  // Cael avait retiré « Soin léger » mais garde « Soin », choisi au rang 1 : il le garde.
  assert.deepEqual(JSON.parse(choicesOf(3)), { choices: { "CLA-0001": { "1": "SOR-SOIN" } }, removed: [], extras: [] });
  assert.equal(record(characters, 1)["Nom personnage"], "Aldor");
  assert.equal(merged.body.result.characters, 2);
  // « Doublons ignorés » suit aussi ; la paire devenue « Soin avec lui-même » est vidée.
  const ignored = google.grid(SPELLS, "Doublons ignorés");
  assert.deepEqual(ignored[1].slice(0, 2), ["SOR-SOIN", "SOR-AUTRE"]);
  assert.deepEqual(ignored[2].filter(Boolean), []);
});

test("Fusion : un champ que la fusion ne change pas n'est pas réécrit", async () => {
  const unnamed = { "ID": "SOR-SANS-NOM", "Effet": "Rend 2d4 PV", "Type": "Actif -Action majeur", "Distance": "3 cases", "Guerrier·e": "1" };
  const twin = { "ID": "SOR-JUMEAU", "Nom": "Soin", "Effet": "Rend 2d4 PV", "Type": "Actif -Action majeur", "Mage": "2" };
  const grid = spellSheet([unnamed, twin]);
  const spells = await pageSpells();
  const keep = spells["Sort sans nom"];
  // Le brouillon de l'écran des doublons : textes simples, nom affiché, classes réunies.
  const draft = { id: keep.id, name: "Sort sans nom", type: keep.type, skillsRaw: keep.skillsRaw, distance: keep.distance, charges: keep.charges, effect: keep.effect, effectHtml: keep.effectHtml || keep.effect, description: keep.description, descriptionHtml: keep.descriptionHtml || keep.description, classRanks: { "CLA-0001": 1, "CLA-0002": 2 } };
  const before = google.world.calls.length;
  const merged = await spellAction({ action: "merge", keep: { rowNumber: keep.rowNumber, id: keep.id }, remove: [{ rowNumber: spells["Soin"].rowNumber, id: spells["Soin"].id }], original: toDraft(keep), draft, index: "classes" });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  const written = google.world.calls.slice(before).flatMap((call) => (call.body?.requests ?? []).flatMap((request) => request.updateCells ? [request.updateCells.range.startColumnIndex] : []));
  assert.deepEqual(written, [spellHeaders.indexOf("Mage")]);
  assert.deepEqual(record(grid(), 1), { ...unnamed, "Mage": "2" });
});

test("Fusion : un sort supprimé ailleurs entre-temps fait tout refuser", async () => {
  const grid = spellSheet([fireball, lightning, frost]);
  const spells = await pageSpells();
  grid().splice(2, 1);
  const before = JSON.stringify(grid());
  const merged = await spellAction({ action: "merge", keep: { rowNumber: spells["Boule de feu"].rowNumber, id: spells["Boule de feu"].id }, remove: [{ rowNumber: spells["Éclair"].rowNumber, id: spells["Éclair"].id }], original: toDraft(spells["Boule de feu"]), draft: { ...toDraft(spells["Boule de feu"]), name: "Boule de feu majeure" }, index: "classes" });
  assert.equal(merged.status, 409);
  assert.equal(JSON.stringify(grid()), before);
});

test("« LIGNE- » n'est jamais écrit dans une case ID, ni montré à une page", async () => {
  const grid = spellSheet([fireball, { "ID": "LIGNE-376", "Nom": "Peau de marbre", "Type": "Passif", "Guerrier·e": "3" }, { "Nom": "Sans ID", "Effet": "Quelque chose", "Type": "Passif" }]);
  const { spells } = await content.listClassResources();
  assert.ok(spells.every((spell) => /^SOR-[0-9A-F]{8}$|^SOR-FEU$/.test(spell.id)), spells.map((spell) => spell.id).join(", "));
  const ids = grid().slice(1).map((_, index) => record(grid(), index + 1)["ID"]);
  assert.ok(ids.every((id) => /^SOR-/.test(id)), ids.join(", "));
  assert.deepEqual(spells.map((spell) => spell.id), ids);
  // Les mêmes sorts sans ID reçoivent les mêmes ID sur une autre installation.
  spellSheet([fireball, { "ID": "LIGNE-376", "Nom": "Peau de marbre", "Type": "Passif", "Guerrier·e": "3" }, { "Nom": "Sans ID", "Effet": "Quelque chose", "Type": "Passif" }]);
  content.invalidateClassContentCaches();
  await content.ensureSpellIds("classes");
  assert.deepEqual(google.grid(SPELLS, "Sorts").slice(1).map((_, index) => record(google.grid(SPELLS, "Sorts"), index + 1)["ID"]), ids);
  // Une désignation « LIGNE-n » envoyée comme ID n'est jamais écrite : un vrai ID est donné.
  const created = await spellAction({ action: "add", rowNumber: null, draft: { id: "LIGNE-9", name: "Nouveau", effect: "", description: "", type: "Passif", skillsRaw: "", distance: "", charges: null, classRanks: {} }, index: "classes" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.match(record(google.grid(SPELLS, "Sorts"), 4)["ID"], /^SOR-[0-9A-F]{8}$/);
  const marble = (await pageSpells())["Peau de marbre"];
  const updated = await spellAction({ action: "update", rowNumber: marble.rowNumber, expectedId: marble.id, original: toDraft(marble), draft: { ...toDraft(marble), id: "LIGNE-3", effect: "Durcit la peau", effectHtml: undefined }, index: "classes" });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(record(google.grid(SPELLS, "Sorts"), 2)["ID"], marble.id);
});

test("Doublons ignorés : un ID « LIGNE-376 » écrit par erreur est remplacé, pas refusé", async () => {
  const grid = spellSheet([fireball, { "ID": "LIGNE-376", "Nom": "Peau de marbre", "Type": "Passif" }], { tabs: [{ title: "Doublons ignorés", grid: [["Sort 1", "Sort 2", "Ignoré le"]] }] });
  const { assigned } = await content.ignoreSpellPairs([["LIGNE-3", "SOR-FEU"]]);
  assert.match(assigned["LIGNE-3"], /^SOR-[0-9A-F]{8}$/);
  assert.equal(record(grid(), 2)["ID"], assigned["LIGNE-3"]);
  assert.deepEqual(google.grid(SPELLS, "Doublons ignorés")[1].slice(0, 2), [assigned["LIGNE-3"], "SOR-FEU"]);
});

test("Doublons ignorés illisible : l'erreur est rendue et aucun doublon n'est proposé", async () => {
  spellSheet([fireball, { ...fireball, "ID": "SOR-FEU-2" }], { tabs: [{ title: "Doublons ignorés", grid: [["Sort 1", "Sort 2", "Ignoré le"], ["SOR-FEU", "SOR-FEU-2", "hier"]] }] });
  google.world.failTabs.push("Doublons ignorés");
  const data = await content.listClassResources();
  assert.equal(data.spells.length, 2);
  assert.deepEqual(data.similarities, []);
  assert.match(data.similaritiesError, /Doublons ignorés/);
});

test("Sans colonne Description : la description est refusée, jamais perdue en silence", async () => {
  const headers = spellHeaders.filter((header) => header !== "Description");
  const grid = spellSheet([fireball], { headers });
  const before = JSON.stringify(grid());
  const onlyDescription = await spellAction({ action: "add", rowNumber: null, draft: { id: "", name: "", effect: "", description: "Une description seule", type: "Passif", skillsRaw: "", distance: "", charges: null, classRanks: {} }, index: "classes" });
  assert.equal(onlyDescription.status, 400);
  assert.match(onlyDescription.body.error, /colonne « Description »/);
  const { "Boule de feu": spell } = await pageSpells();
  const update = await spellAction({ action: "update", rowNumber: spell.rowNumber, expectedId: spell.id, original: toDraft(spell), draft: { ...toDraft(spell), description: "Ajoutée", descriptionHtml: undefined }, index: "classes" });
  assert.equal(update.status, 400);
  assert.match(update.body.error, /colonne « Description »/);
  assert.equal(JSON.stringify(grid()), before);
});

test("Nouveau sort : le texte saisi reste du texte (RAW), rangs et charges restent des nombres", async () => {
  const grid = spellSheet([fireball]);
  const draft = { id: "", name: "- se méfie", effect: "=1+1", description: "+2 au moral", type: "Actif -Action mineur", skillsRaw: "@Discrétion", distance: "0", charges: 3, classRanks: { "CLA-0001": 4 } };
  const created = await spellAction({ action: "add", rowNumber: null, draft, index: "classes" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  // L'ajout place la ligne d'un seul envoi (appendRows) : en RAW, le texte est
  // écrit tel quel (« =1+1 » n'est pas une formule) et les nombres restent des nombres.
  const appended = (request) => request.appendCells ?? request.updateCells;
  const insert = google.world.calls.find((call) => (call.body?.requests ?? []).some((request) => appended(request)?.rows?.[0]?.values?.some((cell) => cell.userEnteredValue?.stringValue === "- se méfie")));
  const row = appended(insert.body.requests.find((request) => appended(request)?.rows)).rows[0].values.map((cell) => cell.userEnteredValue);
  assert.deepEqual(row[spellHeaders.indexOf("Effet")], { stringValue: "=1+1" });
  assert.deepEqual(row[spellHeaders.indexOf("Charges")], { numberValue: 3 });
  assert.deepEqual(row[spellHeaders.indexOf("Guerrier·e")], { numberValue: 4 });
  assert.deepEqual(record(grid(), 2), { "ID": created.body.result.id, "Nom": "- se méfie", "Effet": "=1+1", "Description": "+2 au moral", "Type": "Actif -Action mineur", "Compétence": "@Discrétion", "Distance": "0", "Charges": "3", "Guerrier·e": "4" });
});

test("Présentation : la colonne est retrouvée par son en-tête après une colonne insérée", async () => {
  const headers = ["ID", "Classe", "Spécialité 1", "Spécialité 1 texte", "Caractéristique principale", "Caractéristique secondaire"];
  google.addSpreadsheet("presentation", [{ title: "Présentation", grid: rowsOf(headers, [
    { "ID": "CLA-0002", "Classe": "Mage", "Spécialité 1": "Feu", "Spécialité 1 texte": "Brûle tout", "Caractéristique principale": "Intelligence" },
    { "ID": "CLA-0001", "Classe": "Guerrier·e", "Spécialité 1": "Lame", "Spécialité 1 texte": "Tranche", "Caractéristique principale": "Force" },
  ]) }]);
  const { presentations } = await content.listClassPresentations(true);
  const mage = presentations.find((item) => item.classId === "CLA-0002");
  const column = mage.specialties[0].textColumn;
  // L'en-tête de la colonne telle que la page l'a lue.
  const header = headers[column];
  const edit = (value) => post(presentationRoute, "/api/classes/content", { action: "update-presentation", classId: "CLA-0002", rowNumber: mage.rowNumber, column, header, occurrence: 0, value });
  // Une colonne « Notes » est insérée avant la spécialité : le texte ne va pas dans le titre.
  const grid = google.grid("presentation", "Présentation");
  grid.forEach((row, index) => row.splice(2, 0, index === 0 ? "Notes" : "note"));
  const saved = await edit("Brûle <b>presque</b> tout");
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  let rows = google.grid("presentation", "Présentation");
  assert.deepEqual(record(rows, 1), { "ID": "CLA-0002", "Classe": "Mage", "Notes": "note", "Spécialité 1": "Feu", "Spécialité 1 texte": "Brûle presque tout", "Caractéristique principale": "Intelligence" });
  assert.equal(record(rows, 2)["Spécialité 1 texte"], "Tranche");
  // Une ligne insérée en tête : la classe est retrouvée sur sa nouvelle ligne.
  rows.splice(1, 0, ["CLA-0009", "Autre"]);
  assert.equal((await edit("Brûle tout, vraiment")).status, 200);
  rows = google.grid("presentation", "Présentation");
  assert.equal(record(rows, 2)["Spécialité 1 texte"], "Brûle tout, vraiment");
  assert.deepEqual(record(rows, 1), { "ID": "CLA-0009", "Classe": "Autre" });
  // Un en-tête renommé entre-temps : refusé avec un message, rien n'est écrit.
  rows[0][4] = "Texte de la spécialité 1";
  const refused = await edit("Autre texte");
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /actualise/);
  assert.equal(record(google.grid("presentation", "Présentation"), 2)["Texte de la spécialité 1"], "Brûle tout, vraiment");
});

test("Classes : une classe retirée de la feuille disparaît des listes, jamais sur une lecture vide", async () => {
  assert.deepEqual((await sheets.listClasses()).map((item) => item.id).sort(), ["CLA-0001", "CLA-0002"]);
  const classes = google.grid("classes", "Classes");
  classes.splice(2, 1);
  sheets.clearSpreadsheetReadCache("classes");
  await sheets.forgetClassIndexSync();
  const listed = async () => (await sheets.listClasses()).map((item) => item.id).sort();
  let ids = await listed();
  for (let attempt = 0; attempt < 40 && ids.includes("CLA-0002"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    ids = await listed();
  }
  assert.deepEqual(ids, ["CLA-0001"]);
  // Une feuille vide (ou illisible) ne vide pas la liste locale.
  classes.splice(1);
  sheets.clearSpreadsheetReadCache("classes");
  await sheets.forgetClassIndexSync();
  const reads = () => google.world.calls.filter((call) => call.url.includes("batchGetByDataFilter") && JSON.stringify(call.body).includes("Classes")).length;
  const before = reads();
  await sheets.listClasses();
  for (let attempt = 0; attempt < 40 && reads() === before; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual((await getDb().select().from(schema.classIndex)).map((row) => row.id), ["CLA-0001"]);
});

test("Bonus de rang : la ligne 1 est lue en entier, une colonne au-delà de Z est retrouvée", async () => {
  const headers = ["Rang", ...Array.from({ length: 27 }, (_, index) => `Bonus ${index + 1}`)];
  spellSheet([fireball], { tabs: [{ title: "Bonus de rang", grid: [headers, ...Array.from({ length: 20 }, (_, index) => [`Rang ${index + 1}`])] }] });
  await content.saveRankBonus(3, "Bonus 27", "+1 PV");
  const grid = google.grid(SPELLS, "Bonus de rang");
  assert.deepEqual(grid[0], headers);
  assert.equal(grid[3][27], "+1 PV");
  // Un nouveau bonus s'ajoute après la dernière colonne, sans en écraser une.
  await content.saveRankBonus(1, "Nouveau bonus", "Oui");
  assert.deepEqual(google.grid(SPELLS, "Bonus de rang")[0], [...headers, "Nouveau bonus"]);
  assert.equal(google.grid(SPELLS, "Bonus de rang")[1][28], "Oui");
});

test("Bonus de rang : l'ancienne colonne « Bonus » vide devient « Cible 1 », les autres colonnes s'ajoutent, un rang 21 aussi", async () => {
  spellSheet([fireball], { tabs: [{ title: "Bonus de rang", grid: [["Rang", "Bonus"], ...Array.from({ length: 20 }, (_, index) => [`Rang ${index + 1}`])] }] });
  const table = await content.listRankBonuses({ create: true });
  const expected = ["Rang", "Cible 1", "Valeur 1", "Cible 2", "Valeur 2", "Cible 3", "Valeur 3", "Cible 4", "Valeur 4", "Choix", "Sort sur mesure", "Autre"];
  assert.deepEqual(google.grid(SPELLS, "Bonus de rang")[0], expected);
  assert.deepEqual(table.headers, expected);
  assert.equal(table.rows.length, 20);
  await content.saveRankBonus(2, "Cible 1", "Rapidité");
  await content.saveRankBonus(2, "Valeur 1", "+5");
  const added = await content.addRankBonusRow();
  assert.deepEqual(added.rows.map((row) => row.rank).slice(-2), [20, 21]);
  await content.saveRankBonus(21, "Autre", "Un titre");
  const final = await content.listRankBonuses({ refresh: true });
  assert.deepEqual(final.bonuses.find((bonus) => bonus.rank === 2).bonuses, [{ target: "Rapidité", value: "+5", amount: 5, slot: 1 }]);
  assert.equal(final.bonuses.find((bonus) => bonus.rank === 21).other, "Un titre");
});

test("Remplacer des ID dans le JSON d'une fiche ne touche à rien d'autre", () => {
  const mapping = new Map([["SOR-B", "SOR-A"]]);
  const untouched = "{ \"choices\": {}, \"extras\": [\"SOR-C\"] }";
  assert.equal(remapSpellChoiceIds(untouched, mapping), untouched);
  assert.equal(remapSpellChoiceIds("pas du JSON", mapping), "pas du JSON");
  const both = JSON.parse(remapSpellChoiceIds(JSON.stringify({ charges: { "SOR-B": 1, "SOR-A": 3 }, edits: { "SOR-B": { name: "B" } }, order: ["SOR-A", "SOR-B"], removed: ["SOR-B"], extras: [], states: [{ id: "ETA-1", level: 2 }] }), mapping));
  assert.deepEqual(both, { charges: { "SOR-A": 3 }, edits: { "SOR-A": { name: "B" } }, order: ["SOR-A"], removed: ["SOR-A"], extras: [], states: [{ id: "ETA-1", level: 2 }] });
});
