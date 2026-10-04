import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le vrai lib/google-sheets.ts, branché sur un Google Sheets en mémoire et sur la base
// SQLite du bureau : chaque feuille a ses colonnes dans le désordre, exprès.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-named-columns-"));
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

// Les caches du module (en-têtes vérifiés, lignes retrouvées…) vivent le temps du
// processus : chaque test prend des classeurs neufs, aux identifiants jamais réutilisés.
let serial = 0;
const fresh = (name) => `${name}-${++serial}`;

async function link(key, spreadsheetId, tabName) {
  await jdr.saveJdrSheet({ key, spreadsheetId, name: key, tabName, webViewLink: "" });
}

async function linkNpcs(grid) {
  const id = fresh("npcs");
  google.addSpreadsheet(id, [{ title: "PNJs", grid }]);
  await link("npcs", id, "PNJs");
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `npc-sheet-schema:${id}:PNJs:v9` });
  return id;
}

/** La ligne d'une feuille sous forme { en-tête: valeur } (les cases vides omises). */
function record(gridRows, rowIndex) {
  const headers = gridRows[0];
  return Object.fromEntries((gridRows[rowIndex] ?? []).flatMap((value, column) => value !== "" ? [[headers[column] || `#${column}`, value]] : []));
}

beforeEach(async () => {
  google.reset();
  // Une base neuve à chaque test : les vérifications « déjà faites » ne s'y gardent pas.
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
  await db.delete(schema.campaignIndex);
  await db.delete(schema.characterIndex);
  await db.delete(schema.campaignCharacters);
});

const shopHeaders = ["ID", "Page lié", "Ville", "Taille de ville", "Type de magasin", "Nom du magasin", "Taille du magasin", "Objets JSON", "Ajouté à la campagne", "ID PNJ lié", "Créé le", "Modifié le"];

async function linkShops(grid = [shopHeaders]) {
  const id = fresh("shops");
  google.addSpreadsheet(id, [{ title: "Magasins", grid }]);
  await link("shops", id, "Magasins");
  return id;
}

const npcHeaders = [
  "ID", "Page lié", "Nom du PNJ", "Classe / métier", "Vie actuelle", "Vie totale", "Rapidité",
  "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Capacité de combat",
  "Capacité de tir", "Capacité magique", "Force mentale", "Constitution", "Peuple", "Genre", "Âge",
  "Poids", "Taille", "Notes MJ", "Portrait", "Notes joueurs", "Inventaire JSON (archive)",
  "Ajouté au créateur de session", "Créé le", "Modifié le", "Dossier", "Dans le groupe joueur", "PNJ important", "Créé par",
  "Titre", "Histoire / Lore", "Sorts actifs", "Sorts passifs",
];

test("PNJ : colonnes déplacées et colonne perso, lues et écrites par leur nom", async () => {
  // « Nom du PNJ » tout au bout, « Peuple » en 2e, une colonne « Ma formule » ajoutée à la main au milieu.
  const headers = npcHeaders.filter((header) => header !== "Nom du PNJ" && header !== "Peuple");
  headers.splice(1, 0, "Peuple");
  headers.splice(5, 0, "Ma formule");
  headers.push("Nom du PNJ");
  const row = headers.map((header) => ({ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor", "Peuple": "Elfe", "Ma formule": "=E2*2", "Vie totale": "30", "Vie actuelle": "12", "Titre": "Le sage", "Sorts actifs": "Boule de feu" })[header] ?? "");
  const npcs = await linkNpcs([headers, row]);

  const [aldor] = await sheets.listNpcs("CAMP-1");
  assert.equal(aldor.name, "Aldor");
  assert.equal(aldor.people, "Elfe");
  assert.equal(aldor.totalHp, 30);
  assert.equal(aldor.currentHp, 12);
  assert.equal(aldor.title, "Le sage");
  assert.equal(aldor.activeSpells, "Boule de feu");
  // Aucune ligne d'en-têtes insérée, aucun en-tête réécrit.
  assert.deepEqual(google.grid(npcs, "PNJs")[0], headers);

  await sheets.saveNpc("CAMP-1", { ...aldor, name: "Aldor le Gris", currentHp: 20 });
  const saved = record(google.grid(npcs, "PNJs"), 1);
  assert.equal(saved["Nom du PNJ"], "Aldor le Gris");
  assert.equal(saved["Vie actuelle"], "20");
  assert.equal(saved["Peuple"], "Elfe");
  // La colonne ajoutée à la main garde sa formule.
  assert.equal(saved["Ma formule"], "=E2*2");

  const [created] = await sheets.saveNpcs("CAMP-1", [{ ...aldor, id: "PNJ-2", name: "Vesna", people: "Naine", createdAt: "", updatedAt: "" }]);
  assert.equal(created.name, "Vesna");
  const added = record(google.grid(npcs, "PNJs"), 2);
  assert.equal(added["ID"], "PNJ-2");
  assert.equal(added["Nom du PNJ"], "Vesna");
  assert.equal(added["Peuple"], "Naine");
  assert.equal(added["Ma formule"], undefined);

  await sheets.deleteNpcs("CAMP-1", ["PNJ-1"]);
  assert.deepEqual(record(google.grid(npcs, "PNJs"), 1), {});
  assert.deepEqual((await sheets.listNpcs("CAMP-1")).map((npc) => npc.name), ["Vesna"]);
});

test("PNJ : une colonne prévue absente est ajoutée à droite, rien ne bouge", async () => {
  const headers = npcHeaders.filter((header) => header !== "Sorts passifs" && header !== "Titre");
  // « Titre » manque et sa place d'origine porte « Histoire / Lore » : ajoutée à droite.
  const npcs = await linkNpcs([headers, headers.map((header) => header === "ID" ? "PNJ-1" : header === "Page lié" ? "CAMP-1" : header === "Nom du PNJ" ? "Aldor" : "")]);
  const [aldor] = await sheets.listNpcs("CAMP-1");
  const after = google.grid(npcs, "PNJs")[0];
  assert.deepEqual(after.slice(0, headers.length), headers);
  assert.deepEqual(after.slice(headers.length), ["Titre", "Sorts passifs"]);
  await sheets.saveNpc("CAMP-1", { ...aldor, title: "Archimage", passiveSpells: "Aura" });
  const saved = record(google.grid(npcs, "PNJs"), 1);
  assert.equal(saved["Titre"], "Archimage");
  assert.equal(saved["Sorts passifs"], "Aura");
});

test("Feuille sans ligne d'en-têtes : une ligne est insérée au-dessus, comme avant", async () => {
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["CAMP-1", "mj-1", "Les Brumes", "", "", "#123456"]] }]);
  await link("campaigns", camps, "Campagnes");
  await linkShops();
  await linkNpcs([npcHeaders]);
  await sheets.createCampaignForMj("mj-1", { name: "Nouvelle" });
  const rows = google.grid(camps, "Campagnes");
  assert.deepEqual(rows[0], ["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"]);
  assert.deepEqual(rows[1].slice(0, 3), ["CAMP-1", "mj-1", "Les Brumes"]);
  assert.equal(record(rows, 2)["Nom de la campagne"], "Nouvelle");
});

test("Campagnes : création et modification rangées sous leurs en-têtes", async () => {
  const headers = ["Nom de la campagne", "ID", "Couleur d’accent", "MJ", "Bannière", "Description"];
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [headers, ["Les Brumes", "CAMP-1", "#123456", "mj-1", "", "Une campagne"]] }]);
  await link("campaigns", camps, "Campagnes");
  await linkShops();
  await linkNpcs([npcHeaders]);
  const campaign = await sheets.createCampaignForMj("mj-2", { name: "Le Val", description: "Neuve", accentColor: "#abcdef" });
  const added = record(google.grid(camps, "Campagnes"), 2);
  assert.deepEqual(added, { "Nom de la campagne": "Le Val", "ID": campaign.id, "Couleur d’accent": "#abcdef", "MJ": "mj-2", "Description": "Neuve" });
  assert.deepEqual(google.grid(camps, "Campagnes")[0], headers);
  await sheets.updateCampaignForMj(null, "CAMP-1", { name: "Les Brumes d'Ys" }).catch(() => undefined);
  // L'index local ne connaît pas encore CAMP-1 : la synchronisation le lit par nom.
  await sheets.syncExistingIdentityIndexes();
  const updated = await sheets.updateCampaignForMj(null, "CAMP-1", { name: "Les Brumes d'Ys" });
  assert.equal(updated.mjUid, "mj-1");
  const row = record(google.grid(camps, "Campagnes"), 1);
  assert.equal(row["Nom de la campagne"], "Les Brumes d'Ys");
  assert.equal(row["MJ"], "mj-1");
  assert.equal(row["Couleur d’accent"], "#123456");
});

const characterSchema = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");

test("Fiche de personnage : colonnes déplacées, valeurs et formules à leur vraie place", async () => {
  const headers = [...characterSchema.characterSheetHeaders];
  const peuple = headers.indexOf("Peuple"); const classe = headers.indexOf("Classe");
  [headers[peuple], headers[classe]] = [headers[classe], headers[peuple]];
  headers.push(headers.splice(headers.indexOf("Force"), 1)[0]);
  headers.splice(headers.indexOf("Note") + 1, 0, "Mes notes");
  const cell = (header) => ({ "ID": "PERSO-1", "Joueur": "uid-1", "Nom personnage": "Aldor", "Peuple": "Elfe", "Classe": "Mage", "Force": "40", "Mes notes": "=1+1", "Level": "3" })[header] ?? "";
  const characters = fresh("chars");
  google.addSpreadsheet(characters, [{ title: "Personnages", grid: [headers, headers.map(cell)] }]);
  await link("characters", characters, "Personnages");
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["ID", "MJ", "Nom de la campagne", "Description", "Bannière", "Couleur d’accent"]] }]);
  await link("campaigns", camps, "Campagnes");
  const links = fresh("links");
  google.addSpreadsheet(links, [{ title: "Personnages par campagne", grid: [["ID campagne", "ID personnage"]] }]);
  await link("campaign_characters", links, "Personnages par campagne");
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `character-schema:v5:${characterSchema.characterSheetHeaders.length}` });

  await sheets.syncExistingIdentityIndexes();
  const [indexed] = await getDb().select().from(schema.characterIndex);
  assert.deepEqual({ id: indexed.id, ownerUid: indexed.ownerUid, name: indexed.name, subtitle: indexed.subtitle }, { id: "PERSO-1", ownerUid: "uid-1", name: "Aldor", subtitle: "Elfe" });

  const sheet = await sheets.getCharacterSheet(null, "PERSO-1");
  const at = (header) => sheet.headers.indexOf(header);
  assert.equal(sheet.values[at("Peuple")], "Elfe");
  assert.equal(sheet.values[at("Classe")], "Mage");
  assert.equal(sheet.values[at("Force")], "40");
  assert.equal(sheet.values[at("Level")], "3");

  const forceColumn = headers.indexOf("Force");
  await sheets.patchCharacterSheet(null, "PERSO-1", { [at("Force")]: "55", [at("Mes notes")]: "écrasé ?" });
  let written = record(google.grid(characters, "Personnages"), 1);
  assert.equal(written["Force"], "55");
  assert.equal(written["Mes notes"], "=1+1");

  await sheets.patchCharacterSheet(null, "PERSO-1", { [at("Nom personnage")]: "Aldor le Gris" });
  written = record(google.grid(characters, "Personnages"), 1);
  assert.equal(written["Nom personnage"], "Aldor le Gris");
  assert.equal(written["Peuple"], "Elfe");
  assert.equal(written["Force"], "55");
  assert.equal(written["Mes notes"], "=1+1");
  assert.deepEqual(google.grid(characters, "Personnages")[0], headers);

  const created = await sheets.createCharacterForUser("uid-2", ["Vesna", "Naine"]);
  const added = record(google.grid(characters, "Personnages"), 2);
  assert.equal(added["ID"], created.id);
  assert.equal(added["Joueur"], "uid-2");
  assert.equal(added["Nom personnage"], "Vesna");
  assert.equal(added["Peuple"], "Naine");
  assert.equal(added["Mes notes"], undefined);
  // Le total de « Parade » (compétence de Force) vise la vraie colonne de Force, sur sa ligne.
  const letter = (index) => { let current = index + 1; let result = ""; while (current > 0) { const remainder = (current - 1) % 26; result = String.fromCharCode(65 + remainder) + result; current = Math.floor((current - 1) / 26); } return result; };
  assert.match(added["Parade — Total de stats"], new RegExp(`${letter(forceColumn)}3`));
});

test("Inventaire : contenants et emplacements créés sous leurs en-têtes", async () => {
  const id = fresh("inventory");
  google.addSpreadsheet(id, [
    { title: "Types de contenants", grid: [["Nom", "ID", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID personnage", "Nom personnalisé", "ID", "ID type", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"]] },
    { title: "Contenu inventaire", grid: [["ID contenant", "ID", "ID personnage", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"]] },
  ]);
  await link("inventory", id, "Types de contenants");
  const inventory = await sheets.getCharacterInventorySummary("PERSO-9");
  assert.ok(inventory.containers.length > 0);
  const containers = google.grid(id, "Contenants personnages");
  assert.equal(containers[0][0], "ID personnage");
  const mine = containers.slice(1).map((_, index) => record(containers, index + 1)).filter((row) => row["ID personnage"] === "PERSO-9");
  assert.ok(mine.length > 0);
  assert.ok(mine.every((row) => row["ID"] && row["Catégorie"]));
  const contents = google.grid(id, "Contenu inventaire");
  const slots = contents.slice(1).map((_, index) => record(contents, index + 1)).filter((row) => row["ID personnage"] === "PERSO-9");
  assert.ok(slots.length > 0);
  const containerIds = new Set(mine.map((row) => row["ID"]));
  assert.ok(slots.every((row) => containerIds.has(row["ID contenant"]) && row["Emplacement"]));
  // Les types de base sont ajoutés, eux aussi sous leurs en-têtes.
  const types = google.grid(id, "Types de contenants");
  assert.ok(types.slice(1).some((row, index) => record(types, index + 1)["ID"] === "TYPE-SAC-BASE" && record(types, index + 1)["Nom"] === "Sac de base"));
});

test("Tabletop : cartes et pions écrits et déplacés par nom de colonne", async () => {
  const id = fresh("tabletop");
  google.addSpreadsheet(id, [
    { title: "Cartes", grid: [["Nom", "ID", "Page liée", "Image", "Largeur", "Hauteur", "Taille case (px)", "Distance par case", "Unité", "Clé de salon", "Créé par", "Créée le", "Modifiée le", "Dossier"]] },
    { title: "Tokens", grid: [["Y", "X", "ID", "ID carte", "Type d’entité", "ID entité", "Créé le", "Modifié le", "Nom", "Icône", "Échelle pion", "Échelle icône", "Couleur"]] },
    { title: "Dossiers", grid: [["ID", "Page liée", "Nom", "Ordre", "Créé le", "Modifié le"]] },
    { title: "Journal", grid: [["ID", "ID carte", "Type", "ID auteur", "Auteur", "Contenu", "Formule", "Résultat", "Horodatage", "Audience", "ID destinataire", "Destinataire"]] },
  ]);
  await link("tabletop", id, "Cartes");
  const map = await sheets.createTabletopMap("CAMP-1", "uid-1", "Forêt");
  const maps = google.grid(id, "Cartes");
  assert.equal(record(maps, 1)["Nom"], "Forêt");
  assert.equal(record(maps, 1)["ID"], map.id);
  const token = await sheets.addTabletopToken(map.id, "npc", "PNJ-1", 10, 20);
  await sheets.moveTabletopToken(map.id, token.id, 111, 222);
  const tokens = google.grid(id, "Tokens");
  assert.equal(record(tokens, 1)["X"], "111");
  assert.equal(record(tokens, 1)["Y"], "222");
  assert.equal(record(tokens, 1)["ID entité"], "PNJ-1");
  assert.deepEqual((await sheets.listTabletopTokens(map.id)).map((item) => [item.x, item.y]), [[111, 222]]);
});

test("Magasins : enregistrés et vérifiés par nom de colonne", async () => {
  const headers = [...shopHeaders].reverse();
  await linkShops([headers]);
  const [saved] = await sheets.saveGeneratedShops("CAMP-1", [{ id: "SHOP-1", key: "tavern", name: "Le Pot", size: "Petit", cityKey: "village", cityName: "Brume", items: [] }]);
  assert.equal(saved.name, "Le Pot");
  assert.equal(saved.cityName, "Brume");
  const listed = await sheets.listSavedShops("CAMP-1");
  assert.deepEqual(listed.map((shop) => shop.name), ["Le Pot"]);
});

test("Fiche rangée comme Eraser : une seule plage écrite dès la colonne C, comme avant", async () => {
  const headers = [...characterSchema.characterSheetHeaders];
  const characters = fresh("chars");
  google.addSpreadsheet(characters, [{ title: "Personnages", grid: [headers, headers.map((header) => ({ "ID": "PERSO-2", "Joueur": "uid-1", "Nom personnage": "Brin", "Peuple": "Humain" })[header] ?? "")] }]);
  await link("characters", characters, "Personnages");
  await getDb().insert(schema.characterIndex).values({ id: "PERSO-2", ownerUid: "uid-1", name: "Brin", subtitle: "Humain", updatedAt: new Date().toISOString() });
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `character-schema:v5:${characterSchema.characterSheetHeaders.length}` });
  const sheet = await sheets.getCharacterSheet(null, "PERSO-2");
  assert.equal(sheet.values[1], "Humain");
  // Une fiche créée s'écrit d'un bloc, dès la colonne C de sa ligne.
  const before = google.world.requests.length;
  const created = await sheets.createCharacterForUser("uid-1", ["Brin le Bref", "Humain"]);
  const writes = google.world.requests.slice(before).filter((request) => request.startsWith("PUT") || request.includes("batchUpdate"));
  assert.ok(writes.some((request) => request.startsWith("PUT /values/'Personnages'!C3:")), writes.join("\n"));
  assert.equal(record(google.grid(characters, "Personnages"), 2)["ID"], created.id);
  assert.equal(record(google.grid(characters, "Personnages"), 2)["Nom personnage"], "Brin le Bref");
  assert.equal(record(google.grid(characters, "Personnages"), 1)["Nom personnage"], "Brin");
});

/** Une feuille de personnages rangée comme Eraser, avec ces fiches (ID, joueur, nom, peuple). */
async function linkCharacters(people) {
  const headers = [...characterSchema.characterSheetHeaders];
  const characters = fresh("chars");
  const rows = people.map(([id, owner, name, folk]) => headers.map((header) => ({ "ID": id, "Joueur": owner, "Nom personnage": name, "Peuple": folk })[header] ?? ""));
  google.addSpreadsheet(characters, [{ title: "Personnages", grid: [headers, ...rows] }]);
  await link("characters", characters, "Personnages");
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `character-schema:v5:${characterSchema.characterSheetHeaders.length}` });
  return characters;
}

test("Lecture groupée rendue dans le désordre par Google : chaque colonne reste à sa place", async () => {
  await linkCharacters([["PERSO-A", "uid-1", "Aldor", "Elfe"], ["PERSO-B", "uid-2", "Brin", "Humain"]]);
  google.world.reverseFilteredReads = true;
  await sheets.syncExistingIdentityIndexes();
  const indexed = (await getDb().select().from(schema.characterIndex)).map((row) => [row.id, row.ownerUid, row.name, row.subtitle]).sort();
  assert.deepEqual(indexed, [["PERSO-A", "uid-1", "Aldor", "Elfe"], ["PERSO-B", "uid-2", "Brin", "Humain"]]);
});

test("Deux suppressions définitives de suite suppriment chacune la bonne ligne", async () => {
  const characters = await linkCharacters([["PERSO-A", "uid-1", "Aldor", "Elfe"], ["PERSO-B", "uid-1", "Brin", "Humain"], ["PERSO-C", "uid-1", "Cael", "Nain"]]);
  await sheets.syncExistingIdentityIndexes();
  // Les lignes sont lues (et gardées en mémoire) avant les suppressions, comme dans l'application.
  for (const id of ["PERSO-A", "PERSO-B", "PERSO-C"]) await sheets.getCharacterSheet(null, id);
  // Une fiche en service ne se supprime pas définitivement.
  await assert.rejects(sheets.permanentlyDeleteItem("character", "PERSO-A"), /ITEM_NOT_IN_TRASH/);
  await sheets.softDeleteItem("character", "PERSO-A");
  await sheets.softDeleteItem("character", "PERSO-B");
  await sheets.permanentlyDeleteItem("character", "PERSO-A");
  await sheets.permanentlyDeleteItem("character", "PERSO-B");
  const rows = google.grid(characters, "Personnages").slice(1).map((row, index) => record(google.grid(characters, "Personnages"), index + 1)["Nom personnage"]);
  assert.deepEqual(rows, ["Cael"]);
});

test("Une ligne supprimée ailleurs ne fait pas écrire dans la fiche voisine", async () => {
  const characters = await linkCharacters([["PERSO-A", "uid-1", "Aldor", "Elfe"], ["PERSO-B", "uid-1", "Brin", "Humain"], ["PERSO-C", "uid-1", "Cael", "Nain"]]);
  await sheets.syncExistingIdentityIndexes();
  const sheet = await sheets.getCharacterSheet(null, "PERSO-C");
  const at = (header) => sheet.headers.indexOf(header);
  await sheets.patchCharacterSheet(null, "PERSO-C", { [at("Note")]: "première" });
  // Une autre installation supprime la ligne d'Aldor : Brin et Cael remontent d'une ligne.
  google.grid(characters, "Personnages").splice(1, 1);
  await sheets.patchCharacterSheet(null, "PERSO-C", { [at("Note")]: "seconde" });
  const grid = google.grid(characters, "Personnages");
  const byName = Object.fromEntries(grid.slice(1).map((_, index) => record(grid, index + 1)).map((row) => [row["Nom personnage"], row]));
  assert.equal(byName["Cael"]["Note"], "seconde");
  assert.equal(byName["Brin"]["Note"], undefined);
  assert.equal(grid.length, 3);
});

test("Relations, sessions, vocabulaire et to-do : lus et écrits par nom de colonne", async () => {
  const relations = fresh("relations");
  google.addSpreadsheet(relations, [{ title: "Relations", grid: [["Nom", "ID", "ID personnage", "Type de cible", "ID cible", "Niveau", "Notes personnelles", "Créé par", "ID campagne", "Créée le", "Modifiée le"]] }]);
  await link("character_relations", relations, "Relations");
  await sheets.saveCharacterRelation({ id: "REL-1", characterId: "PERSO-1", targetKind: "npc", targetId: "PNJ-1", name: "Aldor", level: 2, personalNotes: "Ami", createdByUid: "uid-1", campaignId: "CAMP-1" });
  const relationRows = google.grid(relations, "Relations");
  assert.equal(record(relationRows, 1)["Nom"], "Aldor");
  assert.equal(record(relationRows, 1)["Niveau"], "2");
  assert.deepEqual((await sheets.listCharacterRelations("PERSO-1")).map((relation) => [relation.name, relation.level]), [["Aldor", 2]]);

  const sessionsModule = await vite.ssrLoadModule("/lib/campaign-sessions.ts");
  const sessions = fresh("sessions");
  google.addSpreadsheet(sessions, [{ title: "Sessions", grid: [["Titre", "ID", "ID campagne", "Bannière", "Personnages (JSON)", "PNJs (JSON)", "Magasins (JSON)", "Créée par", "Créée le", "Modifiée le"]] }]);
  await link("sessions", sessions, "Sessions");
  const characters = fresh("chars");
  google.addSpreadsheet(characters, [{ title: "Personnages", grid: [characterSchema.characterSheetHeaders] }]);
  await link("characters", characters, "Personnages");
  await linkNpcs([npcHeaders]);
  await linkShops();
  const session = await sessionsModule.createCampaignSession("CAMP-1", "Première", "uid-1");
  await sessionsModule.renameCampaignSession("CAMP-1", session.id, "Prologue");
  const sessionRows = google.grid(sessions, "Sessions");
  assert.equal(record(sessionRows, 1)["Titre"], "Prologue");
  assert.equal(record(sessionRows, 1)["ID campagne"], "CAMP-1");

  const vocabularyModule = await vite.ssrLoadModule("/lib/vocabulary.ts");
  const vocabulary = fresh("vocabulary");
  google.addSpreadsheet(vocabulary, [{ title: "Vocabulaire", grid: [["Contenu", "Titre"], ["Une attaque", "Coup"]] }]);
  await link("vocabulary", vocabulary, "Vocabulaire");
  assert.deepEqual((await vocabularyModule.listVocabulary()).map((entry) => [entry.title, entry.content]), [["Coup", "Une attaque"]]);
  await vocabularyModule.updateVocabularyEntry(2, "Coup", { title: "Coup", content: "Une frappe" });
  assert.deepEqual(google.grid(vocabulary, "Vocabulaire")[1], ["Une frappe", "Coup"]);

  const todos = fresh("todos");
  google.addSpreadsheet(todos, [{ title: "To-do", grid: [["Nom", "ID", "ID admin", "Admin créateur", "Contenu", "Priorité", "Étiquette", "Couleur", "Réalisée", "Créée le", "Modifiée le", "Supprimée le"]] }]);
  await link("admin_todos", todos, "To-do");
  const todo = await sheets.createAdminTodo({ creatorUid: "uid-1", creatorName: "Admin", name: "Ranger", content: "Ranger la cave", priority: "haute", label: "", labelColor: "#123456" });
  await sheets.updateAdminTodo(todo.id, { completed: "oui" });
  const todoRow = record(google.grid(todos, "To-do"), 1);
  assert.equal(todoRow["Nom"], "Ranger");
  assert.equal(todoRow["Contenu"], "Ranger la cave");
  assert.equal(todoRow["Réalisée"], "oui");
});

test("Références {} : PNJs, campagnes et personnages citables, colonnes privées cachées aux joueurs", async () => {
  const refs = await vite.ssrLoadModule("/lib/index-references-server.ts");
  const headers = [...npcHeaders].reverse();
  const npc = (values) => headers.map((header) => values[header] ?? "");
  await linkNpcs([headers, npc({ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor", "Notes MJ": "Traître", "Notes joueurs": "Un vieux sage", "Classe / métier": "Mage", "Portrait": "/api/npcs/portrait/PNJ-1" }), npc({ "ID": "PNJ-2", "Page lié": "CAMP-OLD", "Nom du PNJ": "Oublié" })]);
  const camps = fresh("camps");
  google.addSpreadsheet(camps, [{ title: "Campagnes", grid: [["Couleur d’accent", "Nom de la campagne", "ID", "MJ", "Description", "Bannière"], ["#334455", "Les Brumes", "CAMP-1", "mj-1", "Brouillard éternel", ""]] }]);
  await link("campaigns", camps, "Campagnes");
  await getDb().insert(schema.campaignIndex).values({ id: "CAMP-1", mjUid: "mj-1", name: "Les Brumes", description: "", bannerUrl: "", accentColor: "#334455", updatedAt: new Date().toISOString() });
  const characterHeaders = [...characterSchema.characterSheetHeaders];
  characterHeaders.push(characterHeaders.splice(characterHeaders.indexOf("Peuple"), 1)[0]);
  const characters = fresh("chars");
  google.addSpreadsheet(characters, [{ title: "Personnages", grid: [characterHeaders, characterHeaders.map((header) => ({ "ID": "PERSO-1", "Joueur": "uid-1", "Nom personnage": "Brin", "Peuple": "Humain", "Classe": "[\"Mage\",\"Prêtre\"]", "Force": "40" })[header] ?? "")] }]);
  await link("characters", characters, "Personnages");

  const catalog = await refs.referenceCatalog({ fresh: true });
  const labels = catalog.entries.map((entry) => entry.label);
  for (const label of ["PNJ", "Campagne", "Personnage"]) assert.ok(labels.includes(label), labels.join(", "));
  const npcIndex = catalog.indexes.find((index) => index.key === "npcs");
  // Le PNJ d'une campagne fermée n'est pas proposé ; celui des Brumes l'est, avec sa campagne.
  assert.deepEqual(npcIndex.rows.map((row) => [row.name, row.tab]), [["Aldor", "Les Brumes"]]);
  assert.ok(npcIndex.tabs[0].columns.includes("Notes joueurs"));
  assert.ok(!npcIndex.tabs[0].columns.includes("Page lié"));

  const requests = [
    { index: "npcs", id: "PNJ-1" },
    { index: "npcs", id: "PNJ-1", column: "Notes MJ" },
    { index: "campaigns", id: "CAMP-1" },
    { index: "characters", id: "PERSO-1" },
    { index: "characters", id: "PERSO-1", column: "Force" },
  ];
  const keyOf = (request) => `${request.index}\u0001${request.id}\u0001${(request.column ?? "").toLocaleLowerCase("fr")}`;
  const mj = await refs.resolveReferences(requests, { byName: true });
  assert.equal(mj[keyOf(requests[0])].name, "Aldor");
  assert.equal(mj[keyOf(requests[0])].type, "Mage");
  assert.equal(mj[keyOf(requests[0])].descriptionHtml, "Un vieux sage");
  assert.equal(mj[keyOf(requests[0])].image, "/api/npcs/portrait/PNJ-1");
  assert.equal(mj[keyOf(requests[1])].value, "Traître");
  assert.equal(mj[keyOf(requests[2])].color, "#334455");
  assert.equal(mj[keyOf(requests[2])].descriptionHtml, "Brouillard éternel");
  assert.equal(mj[keyOf(requests[3])].type, "Mage · Prêtre");
  assert.equal(mj[keyOf(requests[4])].value, "40");
  const player = await refs.resolveReferences(requests, { byName: false, player: true });
  assert.equal(player[keyOf(requests[0])].name, "Aldor");
  assert.equal(player[keyOf(requests[1])], null);
  assert.equal(player[keyOf(requests[4])], null);
  assert.equal(player[keyOf(requests[3])].name, "Brin");
});
