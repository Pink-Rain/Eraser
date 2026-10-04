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

const npcHeaders = [
  "ID", "Page lié", "Nom du PNJ", "Classe / métier", "Vie actuelle", "Vie totale", "Rapidité",
  "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Capacité de combat",
  "Capacité de tir", "Capacité magique", "Force mentale", "Constitution", "Peuple", "Genre", "Âge",
  "Poids", "Taille", "Notes MJ", "Portrait", "Notes joueurs", "Inventaire JSON (archive)",
  "Ajouté au créateur de session", "Créé le", "Modifié le", "Dossier", "Dans le groupe joueur", "PNJ important", "Créé par",
  "Titre", "Histoire / Lore", "Sorts actifs", "Sorts passifs",
];

async function linkNpcs(rows) {
  const id = fresh("npcs");
  const grid = [npcHeaders, ...rows.map((values) => npcHeaders.map((header) => values[header] ?? ""))];
  google.addSpreadsheet(id, [{ title: "PNJs", grid }]);
  await jdr.saveJdrSheet({ key: "npcs", spreadsheetId: id, name: "npcs", tabName: "PNJs", webViewLink: "" });
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `npc-sheet-schema:${id}:PNJs:v9` });
  return id;
}

const cellOf = (rows, rowIndex, header) => rows[rowIndex]?.[npcHeaders.indexOf(header)] ?? "";

test("PNJ déplacé : sa ligne garde toutes ses colonnes, seule la page change", async () => {
  const id = await linkNpcs([
    { "ID": "PNJ-1", "Page lié": "CAMP-A", "Nom du PNJ": "Maé Terval", "Capacité de combat": "7", "Âge": "41", "Dossier": "Ville", "Ajouté au créateur de session": "Oui", "Dans le groupe joueur": "Oui", "Notes MJ": "secret" },
  ]);
  const moved = await sheets.moveNpcsToPage("CAMP-A", "CAMP-B", ["PNJ-1"]);
  assert.deepEqual(moved.map((npc) => [npc.id, npc.pageLinked, npc.inCampaign, npc.inPlayerGroup]), [["PNJ-1", "CAMP-B", false, false]]);
  const rows = google.grid(id, "PNJs");
  assert.equal(rows.filter((row) => row.some(Boolean)).length, 2);
  for (const [header, value] of [["ID", "PNJ-1"], ["Page lié", "CAMP-B"], ["Capacité de combat", "7"], ["Âge", "41"], ["Dossier", "Ville"], ["Notes MJ", "secret"], ["Ajouté au créateur de session", "Non"]]) {
    assert.equal(cellOf(rows, 1, header), value, header);
  }
});

async function linkInventory() {
  const id = fresh("inventory");
  google.addSpreadsheet(id, [
    { title: "Types de contenants", grid: [["Nom", "ID", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID personnage", "Nom personnalisé", "ID", "ID type", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"]] },
    { title: "Contenu inventaire", grid: [["ID contenant", "ID", "ID personnage", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"]] },
  ]);
  await jdr.saveJdrSheet({ key: "inventory", spreadsheetId: id, name: "inventory", tabName: "Types de contenants", webViewLink: "" });
}

test("PNJ copié : toute la ligne est reprise avec un nouvel ID", async () => {
  await linkInventory();
  const id = await linkNpcs([
    { "ID": "PNJ-1", "Page lié": "CAMP-A", "Nom du PNJ": "Maé Terval", "Capacité de tir": "5", "Taille": "1,62 m", "Notes joueurs": "- se méfie", "Ajouté au créateur de session": "Oui" },
  ]);
  const [copy] = await sheets.copyNpcsToPage("CAMP-A", "CAMP-B", ["PNJ-1"]);
  assert.notEqual(copy.id, "PNJ-1");
  assert.equal(copy.pageLinked, "CAMP-B");
  const rows = google.grid(id, "PNJs");
  const at = rows.findIndex((row) => row[0] === copy.id);
  assert.ok(at > 1);
  assert.equal(cellOf(rows, at, "Capacité de tir"), "5");
  assert.equal(cellOf(rows, at, "Taille"), "1,62 m");
  assert.equal(cellOf(rows, at, "Notes joueurs"), "- se méfie");
  assert.equal(cellOf(rows, at, "Ajouté au créateur de session"), "Non");
  assert.equal(cellOf(rows, 1, "ID"), "PNJ-1");
});

test("PNJ : une action sur une case n'écrase pas le reste avec une copie dépassée", async () => {
  const id = await linkNpcs([{ "ID": "PNJ-1", "Page lié": "CAMP-A", "Nom du PNJ": "Aldor", "Notes MJ": "ancienne", "Vie actuelle": "10", "Vie totale": "30" }]);
  const [stale] = await sheets.listNpcs("CAMP-A");
  // Modifié ailleurs entre-temps.
  google.grid(id, "PNJs")[1][npcHeaders.indexOf("Notes MJ")] = "nouvelle";
  await sheets.saveNpcs("CAMP-A", [{ ...stale, currentHp: 4 }], { only: ["Vie actuelle"] });
  const rows = google.grid(id, "PNJs");
  assert.equal(cellOf(rows, 1, "Vie actuelle"), "4");
  assert.equal(cellOf(rows, 1, "Notes MJ"), "nouvelle");
  await assert.rejects(sheets.saveNpcs("CAMP-B", [{ ...stale, pageLinked: "CAMP-B" }]), /NPC_PAGE_MISMATCH/);
  assert.equal(rows.filter((row) => row[0] === "PNJ-1").length, 1);
});

const shopHeaders = ["ID", "Page lié", "Ville", "Taille de ville", "Type de magasin", "Nom du magasin", "Taille du magasin", "Objets JSON", "Ajouté à la campagne", "ID PNJ lié", "Créé le", "Modifié le"];
const shop = (id, name) => ({ id, key: "market", name, size: "Petit", cityKey: "village", cityName: "Brume", items: [] });

test("Magasins : une ligne écrite plus à droite n'est pas prise pour une ligne libre", async () => {
  const id = fresh("shops");
  // Ligne 3 : un magasin écrit en colonne K par l'ancien ajout (ID en K, page en L).
  const shifted = [...Array(10).fill(""), "SHOP-K", "CAMP-1", "Brume", "village", "market", "Ancien", "Petit", "[]", "Oui"];
  google.addSpreadsheet(id, [{ title: "Magasins", grid: [shopHeaders, ["SHOP-1", "CAMP-1", "Brume", "village", "market", "Premier", "Petit", "[]", "Non", "", "", ""], shifted, []] }]);
  google.world.files.get(id).tabs[0].columnCount = 26;
  await jdr.saveJdrSheet({ key: "shops", spreadsheetId: id, name: "shops", tabName: "Magasins", webViewLink: "" });
  await sheets.saveGeneratedShops("CAMP-1", [shop("SHOP-2", "Nouveau")], {});
  const rows = google.grid(id, "Magasins");
  assert.deepEqual(rows[2].slice(10, 12), ["SHOP-K", "CAMP-1"]);
  assert.equal(rows[2][0] ?? "", "");
  assert.equal(rows.find((row) => row[0] === "SHOP-2")?.[5], "Nouveau");
});

test("Magasins : ajouter à la campagne ne réécrit que ses cases", async () => {
  const id = fresh("shops");
  google.addSpreadsheet(id, [{ title: "Magasins", grid: [shopHeaders, ["SHOP-1", "CAMP-1", "Brume", "village", "market", "Nom de la feuille", "Petit", "[]", "Non", "", "2026-09-01", "2026-09-01"]] }]);
  await jdr.saveJdrSheet({ key: "shops", spreadsheetId: id, name: "shops", tabName: "Magasins", webViewLink: "" });
  await sheets.saveGeneratedShops("CAMP-1", [shop("SHOP-1", "Copie dépassée")], { inCampaign: true, npcId: "" });
  const row = google.grid(id, "Magasins")[1];
  assert.equal(row[5], "Nom de la feuille");
  assert.equal(row[8], "Oui");
  await assert.rejects(sheets.saveGeneratedShops("CAMP-2", [shop("SHOP-1", "Volé")], {}), /SHOP_NOT_ON_PAGE/);
});

const todoHeaders = ["ID", "ID admin", "Admin créateur", "Nom", "Contenu", "Priorité", "Étiquette", "Couleur", "Réalisée", "Créée le", "Modifiée le", "Supprimée le"];
const todo = (id, name) => [id, "uid-1", "Admin", name, `Contenu ${name}`, "moyenne", "", "#927640", "non", "2026-09-01", "2026-09-01", ""];

test("To-do : modifiée après un décalage fait ailleurs, c'est bien elle qui change", async () => {
  const id = fresh("todos");
  google.addSpreadsheet(id, [{ title: "To-do", grid: [todoHeaders, todo("T1", "Un"), todo("T2", "Deux"), todo("T3", "Trois")] }]);
  await jdr.saveJdrSheet({ key: "admin_todos", spreadsheetId: id, name: "To-do administration", tabName: "To-do", webViewLink: "" });
  // Une modification refusée lit (et garde) la ligne 3, celle de T2…
  await assert.rejects(sheets.updateAdminTodo("T2", { content: "   " }), /INVALID_TODO_CONTENT/);
  // …puis T1 est supprimée ailleurs : T2 remonte en ligne 2, T3 en ligne 3.
  google.grid(id, "To-do").splice(1, 1);
  await sheets.updateAdminTodo("T3", { name: "Trois bis", content: "- à faire" });
  const rows = google.grid(id, "To-do");
  assert.equal(rows[1][3], "Deux");
  assert.equal(rows[2][0], "T3");
  assert.equal(rows[2][3], "Trois bis");
  assert.equal(rows[2][4], "- à faire");
  // Une to-do créée garde son texte, même s'il commence par « - ».
  const created = await sheets.createAdminTodo({ creatorUid: "uid-1", creatorName: "Admin", name: "= pas une formule", content: "- liste", priority: "haute", label: "", labelColor: "#123456" });
  const added = google.grid(id, "To-do").find((row) => row[0] === created.id);
  assert.equal(added[3], "= pas une formule");
  assert.equal(added[4], "- liste");
  assert.deepEqual(google.world.enteredCells.at(-1).slice(3, 5), [{ stringValue: "= pas une formule" }, { stringValue: "- liste" }]);
});

test("Vocabulaire : supprimé après une insertion faite ailleurs, c'est bien ce mot qui part", async () => {
  const id = fresh("vocabulary");
  google.addSpreadsheet(id, [{ title: "Vocabulaire", grid: [["Titre", "Contenu"], ["Arcane", "a"], ["Brume", "b"]] }]);
  await jdr.saveJdrSheet({ key: "vocabulary", spreadsheetId: id, name: "Vocabulaire", tabName: "Vocabulaire", webViewLink: "" });
  const vocabulary = await vocabularyModule();
  assert.deepEqual((await vocabulary.listVocabulary()).map((entry) => [entry.rowNumber, entry.title]), [[2, "Arcane"], [3, "Brume"]]);
  // Une première demande lit la feuille (et la garde en mémoire)…
  await assert.rejects(vocabulary.deleteVocabularyEntry(2, "Inconnu"), /VOCABULARY_NOT_FOUND/);
  // …puis un mot est inséré ailleurs en tête : Arcane passe en ligne 3, Brume en ligne 4.
  google.grid(id, "Vocabulaire").splice(1, 0, ["Ancre", "z"]);
  await vocabulary.deleteVocabularyEntry(3, "Brume");
  assert.deepEqual(google.grid(id, "Vocabulaire").map((row) => row[0]), ["Titre", "Ancre", "Arcane"]);
});

async function vocabularyModule() {
  return vite.ssrLoadModule("/lib/vocabulary.ts");
}
