import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// L'Index des items, lu et écrit par le vrai moteur des index (lib/world-indexes.ts) sur un
// Google Sheets en mémoire : la feuille change « sur une autre installation » entre la lecture
// gardée en mémoire et l'écriture. L'inventaire, les magasins et les références lisent ce même
// moteur (lib/object-catalog.ts) : il n'y a plus d'autre lecteur des items.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-object-index-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const driveFake = `${root}tests/fakes/objects-drive.ts`;
const iconsFake = `${root}tests/fakes/object-icon-drive.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: /^@\/lib\/google-drive$/, replacement: driveFake },
    { find: /^@\/lib\/object-icon-drive$/, replacement: iconsFake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const drive = await vite.ssrLoadModule(driveFake);
const icons = await vite.ssrLoadModule(iconsFake);
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const world = await vite.ssrLoadModule("/lib/world-indexes.ts");
const catalog = await vite.ssrLoadModule("/lib/object-catalog.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;
/** L'Index des items relu à l'instant par le moteur. */
const readItems = () => world.getWorldIndex("objects", { refresh: true });

// La première lecture des items lance des tâches de fond (colonnes de combat, icônes) qui ne
// repassent pas avant dix minutes : elles passent ici, sur un classeur jetable, et ne viennent
// plus écrire pendant les tests.
{
  const warm = fresh("objets");
  google.addSpreadsheet(warm, [{ title: "Jetable", grid: [["ID", "Nom", "Icône"], ["J-1", "Caillou", ""]] }]);
  drive.drive.objects.push({ id: warm, name: "Jetable" });
  await readItems();
  await new Promise((resolve) => setTimeout(resolve, 200));
}

beforeEach(async () => {
  google.reset();
  drive.reset();
  world.forgetEffectiveIndex("objects");
  await getDb().delete(schema.jdrGoogleSheets);
  await getDb().delete(schema.sheetIndexSyncs);
});

/** Le classeur des items, rangé dans le dossier « Objets ». */
function objectsFile(tabs) {
  const id = fresh("objets");
  google.addSpreadsheet(id, tabs);
  drive.drive.objects.push({ id, name: "Index des objets" });
  return id;
}

const armes = () => [
  ["ID", "Nom", "Type", "Prix"],
  ["ARM-1", "Épée", "Arme", "10"],
  ["ARM-2", "Dague", "Arme", "4"],
  ["ARM-3", "Arc", "Arme", "8"],
];

const names = (id, tab) => google.grid(id, tab).slice(1).map((row) => row[google.grid(id, tab)[0].indexOf("Nom")] ?? "");

test("Suppression d'après une page périmée : c'est la ligne de cet ID qui part, ou rien", async () => {
  const id = objectsFile([{ title: "Armes", grid: armes() }]);
  // La page (et le serveur) ont lu le tableau…
  const dague = (await readItems()).tables[0].rows.find((row) => row.values[1] === "Dague");
  // …puis une autre installation insère une ligne en tête : la Dague passe en ligne 4.
  google.grid(id, "Armes").splice(1, 0, ["ARM-0", "Hache", "Arme", "6"]);
  await world.deleteWorldIndexRows("objects", "Armes", [{ id: "ARM-2", rowNumber: dague.rowNumber, name: "Dague" }]);
  assert.deepEqual(names(id, "Armes"), ["Hache", "Épée", "Arc"]);
  // Une ligne qui n'est plus là : rien n'est supprimé.
  await assert.rejects(world.deleteWorldIndexRows("objects", "Armes", [{ id: "ARM-3", rowNumber: 4, name: "Arc" }, { id: "ARM-9", rowNumber: 2, name: "Fronde" }]));
  assert.deepEqual(names(id, "Armes"), ["Hache", "Épée", "Arc"]);
});

test("Case modifiée après un déplacement de lignes : à la ligne de son ID, sous son en-tête", async () => {
  const id = objectsFile([{ title: "Armes", grid: armes() }]);
  const epee = (await readItems()).tables[0].rows.find((row) => row.values[1] === "Épée");
  // Ailleurs : une ligne arrive en tête.
  google.grid(id, "Armes").splice(1, 0, ["ARM-0", "Hache", "Arme", "6"]);
  await world.updateWorldIndexCell("objects", "Armes", { id: "ARM-1", rowNumber: epee.rowNumber, name: "Épée" }, "Prix", "12");
  const grid = google.grid(id, "Armes");
  assert.deepEqual(grid.find((row) => row[0] === "ARM-1"), ["ARM-1", "Épée", "Arme", "12"]);
  assert.deepEqual(grid.find((row) => row[0] === "ARM-0"), ["ARM-0", "Hache", "Arme", "6"]);
  // Une colonne qui n'existe pas : rien n'est écrit.
  await assert.rejects(world.updateWorldIndexCell("objects", "Armes", { id: "ARM-1", rowNumber: 3, name: "Épée" }, "Poids", "3"));
  assert.deepEqual(google.grid(id, "Armes").find((row) => row[0] === "ARM-1"), ["ARM-1", "Épée", "Arme", "12"]);
});

test("Ajout, insertion et copie : chaque valeur sous son en-tête, chaque ligne à côté de la bonne, chacune son ID", async () => {
  const id = objectsFile([{ title: "Armes", grid: armes() }]);
  await readItems();
  await world.addWorldIndexRow("objects", "Armes", ["", "Lance", "Arme", "7"], ["ID", "Nom", "Type", "Prix"]);
  const lance = google.grid(id, "Armes").find((row) => row[1] === "Lance");
  assert.deepEqual(lance.slice(1, 4), ["Lance", "Arme", "7"]);
  assert.ok(lance[0].trim());
  await world.duplicateWorldIndexRows("objects", "Armes", [{ id: "ARM-2", rowNumber: 3, name: "Dague" }]);
  await world.insertWorldIndexRows("objects", "Armes", { id: "ARM-1", rowNumber: 2, name: "Épée" }, 1);
  const rows = names(id, "Armes");
  assert.equal(rows.filter((name) => name === "Dague").length, 2);
  assert.ok(rows.includes(""), rows.join(", "));
  const ids = google.grid(id, "Armes").slice(1).map((row) => row[0]).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});

test("Icônes posées d'après un instantané : une icône choisie entre-temps n'est jamais écrasée", async () => {
  const id = objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type", "Icône"], ["ARM-1", "Épée", "Arme", ""], ["ARM-2", "Dague", "Arme", ""]] }]);
  icons.hold();
  await readItems();
  const sync = sheets.syncObjectIndexIcons();
  // Pendant ce temps, ailleurs : une ligne arrive en tête et l'Épée reçoit une icône choisie à la main.
  const grid = google.grid(id, "Armes");
  grid.splice(1, 0, ["ARM-0", "Arc", "Arme", "=IMAGE(\"https://exemple.org/arc.png\")"]);
  grid.find((row) => row[0] === "ARM-1")[3] = "=IMAGE(\"https://exemple.org/epee.png\")";
  icons.release();
  await sync;
  const icon = (key) => google.grid(id, "Armes").find((row) => row[0] === key)[3];
  assert.equal(icon("ARM-0"), "=IMAGE(\"https://exemple.org/arc.png\")");
  assert.equal(icon("ARM-1"), "=IMAGE(\"https://exemple.org/epee.png\")");
  assert.match(icon("ARM-2"), /^=IMAGE\("https:\/\/drive\.google\.com/);
});

test("Les icônes =IMAGE arrivent telles quelles au moteur, à l'inventaire et aux magasins", async () => {
  objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type", "Icône"], ["ARM-1", "Épée", "Arme", "=IMAGE(\"https://exemple.org/epee.png\")"]] }]);
  const [table] = (await readItems()).tables;
  assert.equal(table.rows[0].values[3], "=IMAGE(\"https://exemple.org/epee.png\")");
  const [item] = await catalog.objectCatalog();
  assert.equal(item.rows[0].values[3], "=IMAGE(\"https://exemple.org/epee.png\")");
});

test("« Nombre max » d'après un instantané : seules les cases encore vides, à la ligne de leur ID", async () => {
  const id = objectsFile([{ title: "Flèches", grid: [["ID", "Nom", "Type", "Nombre max"], ["F-1", "Flèche", "Munition", ""], ["F-2", "Potion", "Consommable", ""]] }]);
  await readItems();
  const grid = google.grid(id, "Flèches");
  grid.splice(1, 0, ["F-0", "Corde", "Objet", ""]);
  grid.find((row) => row[0] === "F-1")[3] = "50";
  await sheets.ensureObjectIndexStackLimits();
  const max = (key) => google.grid(id, "Flèches").find((row) => row[0] === key)[3];
  assert.equal(max("F-1"), "50");
  assert.equal(max("F-2"), "5");
  assert.equal(max("F-0"), "");
});

test("Réparation des en-têtes (regroupement) : une colonne en double n'est jamais supprimée", async () => {
  // « Description » en double, vide : une ancienne version l'ajoutait en fin de tableau.
  const id = objectsFile([{ title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Description"], ["OBJ-1", "Corde", "Chanvre", "Outil", ""]] }]);
  await sheets.objectIndexTablesForRegroup();
  assert.deepEqual(google.grid(id, "Objets")[0], ["ID", "Nom", "Description", "Type", "Description"]);
  assert.deepEqual(google.grid(id, "Objets")[1], ["OBJ-1", "Corde", "Chanvre", "Outil", ""]);
});

test("Un item nommé sans ID reçoit le sien avant d'être servi : une ligne insérée au-dessus ne le change plus", async () => {
  const id = objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type"], ["ARM-1", "Épée", "Arme"], ["", "Fronde", "Arme"]] }]);
  const fronde = (await readItems()).tables[0].rows.find((row) => row.values[1] === "Fronde");
  const written = google.grid(id, "Armes")[2][0];
  assert.equal(fronde.values[0], written);
  assert.equal(written, `DRIVE-${id}-1-3`);
  // L'inventaire voit le même ID, par le moteur.
  assert.equal((await catalog.objectCatalog())[0].rows.find((row) => row.values[1] === "Fronde").values[0], written);
  google.grid(id, "Armes").splice(1, 0, ["ARM-0", "Hache", "Arme"]);
  const reread = (await readItems()).tables[0];
  assert.equal(reread.rows.find((row) => row.values[1] === "Fronde").values[0], written);
});

test("L'inventaire recopie le texte des items à jour, pas celui gardé pour l'affichage", async () => {
  const id = objectsFile([{ title: "Objets", grid: [["ID", "Nom", "Description", "Type"], ["OBJ-1", "Corde", "Chanvre", "Objet"]] }]);
  const inventory = fresh("inventaire");
  google.addSpreadsheet(inventory, [
    { title: "Types de contenants", grid: [["ID", "Nom", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"]] },
    { title: "Contenu inventaire", grid: [["ID", "ID personnage", "ID contenant", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"]] },
  ]);
  await jdr.saveJdrSheet({ key: "inventory", spreadsheetId: inventory, name: "inventory", tabName: "Types de contenants", webViewLink: "" });
  await sheets.getCharacterInventory("PERSO-A");
  // Renommé dans Sheets ; six minutes plus tard, la copie d'affichage (30 min) est encore servie.
  google.grid(id, "Objets")[1][1] = "Corde de chanvre";
  const realNow = Date.now;
  Date.now = () => realNow() + 6 * 60_000;
  try {
    assert.equal((await catalog.objectCatalog())[0].rows[0].values[1], "Corde", "l'affichage reprend la copie gardée sans attendre");
    const added = await sheets.addCharacterInventoryItem("PERSO-A", "OBJ-1");
    const slot = added.containers.flatMap((container) => container.slots).find((candidate) => candidate.itemId === "OBJ-1");
    assert.equal(slot.item.name, "Corde de chanvre");
    const row = google.grid(inventory, "Contenu inventaire").find((line) => line[4] === "OBJ-1");
    assert.equal(row[6], "Corde de chanvre");
  } finally {
    Date.now = realNow;
  }
});

test("Une colonne sans en-tête s'appelle « Colonne 3 » : le moteur la lit sous ce nom", async () => {
  objectsFile([{ title: "Objets", grid: [["ID", "Nom", ""], ["O-1", "Corde", "note"], ["O-2", "Torche", "autre"]] }]);
  const [table] = (await readItems()).tables;
  assert.equal(table.headers[2], "Colonne 3");
  assert.equal(table.rows[0].values[2], "note");
});

test("Les items ne sont lus qu'une fois : le moteur, l'inventaire et les magasins partagent sa lecture", async () => {
  objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type", "Rareté et emplacements"], ["ARM-1", "Épée", "Arme", "Commun : Armurerie"]] }]);
  await readItems();
  const gridReads = () => google.world.calls.filter((call) => call.url.includes("includeGridData")).length;
  const before = gridReads();
  const shops = await vite.ssrLoadModule("/lib/shop-schema.ts");
  const refs = await vite.ssrLoadModule("/lib/index-references-server.ts");
  const items = await shops.loadShopGeneratorItems();
  assert.deepEqual(items.map((item) => item.name), ["Épée"]);
  assert.ok(refs);
  await catalog.objectCatalog();
  assert.equal(gridReads(), before, "un consommateur a relu les items à part");
});

test("Items, un index du moteur : le moteur des index lit et écrit les items, l'inventaire voit ses écritures", async () => {
  const world = await vite.ssrLoadModule("/lib/world-indexes.ts");
  const id = objectsFile([
    { title: "Armes", grid: [["ID", "Nom", "Type", "Prix", "Rareté principale"], ["ARM-1", "Épée", "Arme", "10", "commun"], ["ARM-2", "Dague", "Arme", "4", "Rare"]] },
    { title: "Livres", grid: [["ID", "Nom", "Type"], ["LIV-1", "Grimoire", "Livre"]] },
  ]);
  assert.equal(await world.knownWorldIndexKey("objects"), "objects");
  const data = await world.getWorldIndex("objects", { refresh: true });
  assert.deepEqual(data.tables.map((table) => table.tabName).sort(), ["Armes", "Livres"]);
  assert.equal(data.columns.Armes.find((column) => column.header === "ID").spec.kind, "id");
  // Une case : sous son en-tête, à la ligne de son ID (même si la page la voyait ailleurs).
  google.grid(id, "Armes").splice(1, 0, ["ARM-0", "Hache", "Arme", "6", ""]);
  await world.updateWorldIndexCell("objects", "Armes", { rowNumber: 3, id: "ARM-2", name: "Dague" }, "Prix", "5");
  assert.deepEqual(google.grid(id, "Armes").find((row) => row[0] === "ARM-2"), ["ARM-2", "Dague", "Arme", "5", "Rare"]);
  // L'inventaire et les magasins (le catalogue du moteur) voient l'écriture du moteur (ici, la
  // copie gardée ne connaissait pas la ligne insérée dans Sheets : elle est relue).
  const read = await catalog.objectCatalog({ current: true });
  const armes = read.find((table) => table.tabName === "Armes");
  assert.equal(armes.rows.find((row) => row.values[0] === "ARM-2").values[3], "5");
  // Catalogue à jour : la case est corrigée dans la copie du moteur, sans relire tout le classeur mis en forme.
  const gridReads = () => google.world.calls.filter((call) => call.url.includes("includeGridData")).length;
  const before = gridReads();
  const hache = google.grid(id, "Armes").findIndex((row) => row[0] === "ARM-0") + 1;
  await world.updateWorldIndexCell("objects", "Armes", { rowNumber: hache, id: "ARM-0", name: "Hache" }, "Prix", "7");
  assert.equal((await catalog.objectCatalog({ current: true })).find((table) => table.tabName === "Armes").rows.find((row) => row.values[0] === "ARM-0").values[3], "7");
  assert.equal(gridReads(), before);
  // « Corriger N fautes » : la rareté mal écrite prend le choix de la liste.
  assert.equal(await world.normalizeWorldIndexChoices("objects"), 1);
  assert.equal(google.grid(id, "Armes").find((row) => row[0] === "ARM-1")[4], "Commun");
  // Vers un autre onglet : l'item garde son ID, ses colonnes remplies arrivent avec lui.
  const epee = google.grid(id, "Armes").findIndex((row) => row[0] === "ARM-1") + 1;
  await world.moveWorldIndexRows("objects", "Armes", "Livres", [{ rowNumber: epee, id: "ARM-1", name: "Épée" }]);
  const livres = google.grid(id, "Livres");
  assert.ok(livres[0].includes("Prix") && livres[0].includes("Rareté principale"));
  const moved = livres.find((row) => row[0] === "ARM-1");
  assert.equal(moved[livres[0].indexOf("Prix")], "10");
  assert.ok(!google.grid(id, "Armes").some((row) => row[0] === "ARM-1"));
  // Ajouter : chaque valeur sous son en-tête, avec un identifiant.
  await world.addWorldIndexRow("objects", "Armes", ["", "Lance", "Arme", "7", ""], ["ID", "Nom", "Type", "Prix", "Rareté principale"]);
  const lance = google.grid(id, "Armes").find((row) => row[1] === "Lance");
  assert.deepEqual(lance.slice(1, 4), ["Lance", "Arme", "7"]);
  assert.ok(lance[0].trim());
  // Une liste liée d'un autre index vers les items : le nom choisi y crée sa ligne.
  assert.equal(await world.ensureWorldIndexEntry("objects", "Armes", "Arbalète"), true);
  assert.ok(google.grid(id, "Armes").some((row) => row[1] === "Arbalète"));
  // Les items sont une cible de relation comme les autres index.
  assert.ok((await world.worldRelationTargets()).some((target) => target.index === "objects" && target.tabs.some((tab) => tab.name === "Armes")));
});

test("Onglets d'items réunis et renommés dans Sheets : l'index les montre sans redémarrer Eraser", async () => {
  const world = await vite.ssrLoadModule("/lib/world-indexes.ts");
  const id = objectsFile([
    { title: "Objets", grid: [["ID", "Nom", "Genre"], ["OBJ-1", "Corde", "Objet"]] },
    { title: "Armes", grid: [["ID", "Nom", "Genre"], ["ARM-1", "Épée", "Arme"]] },
  ]);
  assert.deepEqual((await world.getWorldIndex("objects", { refresh: true })).tables.map((table) => table.tabName).sort(), ["Armes", "Objets"]);
  // Dans Sheets : les armes rejoignent « Objets », « Armes » est supprimé, « Objets » devient « Items ».
  const file = google.world.files.get(id);
  const [objets, armesTab] = file.tabs;
  objets.grid.push(armesTab.grid[1]);
  file.tabs.splice(1, 1);
  objets.title = "Items";
  const data = await world.getWorldIndex("objects", { refresh: true });
  assert.deepEqual(data.tables.map((table) => table.tabName), ["Items"]);
  assert.deepEqual(data.tables[0].rows.map((row) => row.values[0]), ["OBJ-1", "ARM-1"]);
});

test("Colonne liée vers son propre index : les deux colonnes se répondent d'un onglet à l'autre, sans doublon", async () => {
  const world = await vite.ssrLoadModule("/lib/world-indexes.ts");
  const id = objectsFile([
    { title: "Armes", grid: [["ID", "Nom", "Type"], ["ARM-1", "Épée", "Arme"], ["ARM-2", "Hache", "Arme"]] },
    { title: "Ressources", grid: [["ID", "Nom", "Type"], ["RES-1", "Fer", "Métal"], ["RES-2", "Bois", "Bois"]] },
  ]);
  await readItems();
  const recycles = { kind: "linked", link: { index: "objects", tab: "*", column: "Recyclage de" } };
  // La colonne est ajoutée dans un onglet, puis dans l'autre : l'autre côté naît dans tous les onglets.
  await world.applyWorldSchemaOperations("objects", [{ op: "add-column", tab: "Armes", header: "Se recycle en", spec: recycles }]);
  await world.applyWorldSchemaOperations("objects", [{ op: "add-column", tab: "Ressources", header: "Se recycle en", spec: recycles }]);
  for (const tab of ["Armes", "Ressources"]) assert.ok(google.grid(id, tab)[0].includes("Recyclage de"), tab);
  const row = (tab, name) => {
    const grid = google.grid(id, tab);
    const found = grid.find((line) => line[1] === name);
    return found && Object.fromEntries(grid[0].map((header, column) => [header, found[column] ?? ""]));
  };
  const at = (tab, name) => google.grid(id, tab).findIndex((line) => line[1] === name) + 1;
  // L'Épée (Armes) se recycle en Fer (Ressources) : le Fer est « Recyclage de » l'Épée.
  await world.updateWorldIndexCell("objects", "Armes", { rowNumber: at("Armes", "Épée"), id: "ARM-1", name: "Épée" }, "Se recycle en", "Fer");
  assert.equal(row("Ressources", "Fer")["Recyclage de"], "Épée");
  // Dans l'autre sens, depuis le Fer : la Hache est trouvée dans son onglet, jamais recréée ailleurs.
  await world.updateWorldIndexCell("objects", "Ressources", { rowNumber: at("Ressources", "Fer"), id: "RES-1", name: "Fer" }, "Recyclage de", "Épée, Hache");
  assert.equal(row("Armes", "Hache")["Se recycle en"], "Fer");
  assert.equal(row("Armes", "Épée")["Se recycle en"], "Fer");
  assert.deepEqual(google.grid(id, "Ressources").slice(1).map((line) => line[1]), ["Fer", "Bois"]);
  assert.deepEqual(google.grid(id, "Armes").slice(1).map((line) => line[1]), ["Épée", "Hache"]);
  // Dans le même onglet aussi : le Bois se recycle en Fer.
  await world.updateWorldIndexCell("objects", "Ressources", { rowNumber: at("Ressources", "Bois"), id: "RES-2", name: "Bois" }, "Se recycle en", "Fer");
  assert.equal(row("Ressources", "Fer")["Recyclage de"], "Épée, Hache, Bois");
  // Un nom retiré d'un côté disparaît de l'autre ; une ligne ne se cite pas elle-même en retour.
  await world.updateWorldIndexCell("objects", "Ressources", { rowNumber: at("Ressources", "Fer"), id: "RES-1", name: "Fer" }, "Recyclage de", "Hache, Bois, Fer");
  assert.equal(row("Armes", "Épée")["Se recycle en"], "");
  assert.equal(row("Ressources", "Fer")["Se recycle en"], "");
  // Un nom absent de l'index naît une seule fois, dans un onglet qui a la colonne d'en face.
  await world.updateWorldIndexCell("objects", "Armes", { rowNumber: at("Armes", "Hache"), id: "ARM-2", name: "Hache" }, "Se recycle en", "Fer, Cuivre");
  const copper = ["Armes", "Ressources"].flatMap((tab) => google.grid(id, tab).filter((line) => line[1] === "Cuivre").map(() => tab));
  assert.equal(copper.length, 1, JSON.stringify(copper));
  assert.equal(row(copper[0], "Cuivre")["Recyclage de"], "Hache");
  // L'éditeur explique le lien : chaque colonne nomme celle qui lui répond.
  const model = await world.worldEditorModel("objects");
  const answer = model.tabs.find((tab) => tab.name === "Ressources").columns.find((column) => column.header === "Recyclage de");
  assert.equal(answer.spec.kind, "linked");
  assert.equal(answer.spec.link.index, "objects");
  assert.match(answer.policy.reasons[0], /Se recycle en/);
});

test("Colonne liée vers son propre index : les deux côtés ajoutés ensemble, un lien symétrique, et ce qui ne peut pas répondre", async () => {
  const world = await vite.ssrLoadModule("/lib/world-indexes.ts");
  const id = objectsFile([
    { title: "Armes", grid: [["ID", "Nom", "Type"], ["ARM-1", "Épée", "Arme"], ["ARM-2", "Hache", "Arme"]] },
    { title: "Ressources", grid: [["ID", "Nom", "Type"], ["RES-1", "Fer", "Métal"]] },
  ]);
  await readItems();
  const linked = (tab, column) => ({ kind: "linked", link: { index: "objects", tab, column } });
  // Les deux colonnes créées dans le même enregistrement : la seconde, déjà née du premier lien, est réglée.
  await world.applyWorldSchemaOperations("objects", [
    { op: "add-column", tab: "Armes", header: "Se recycle en", spec: linked("*", "Recyclage de") },
    { op: "add-column", tab: "Armes", header: "Recyclage de", spec: linked("Armes", "Se recycle en") },
  ]);
  const headers = google.grid(id, "Armes")[0];
  assert.equal(headers.filter((header) => header === "Recyclage de").length, 1);
  assert.equal(headers.filter((header) => header === "Se recycle en").length, 1);
  assert.ok(google.grid(id, "Ressources")[0].includes("Recyclage de"));
  // Un lien symétrique : « Allié de » se répond à elle-même, d'un onglet à l'autre.
  await world.applyWorldSchemaOperations("objects", [{ op: "add-column", tab: "Armes", header: "Allié de", spec: linked("*", "Allié de") }]);
  assert.ok(google.grid(id, "Ressources")[0].includes("Allié de"));
  const row = (tab, name) => {
    const grid = google.grid(id, tab);
    const found = grid.find((line) => line[1] === name);
    return Object.fromEntries(grid[0].map((header, column) => [header, found[column] ?? ""]));
  };
  await world.updateWorldIndexCell("objects", "Armes", { rowNumber: 2, id: "ARM-1", name: "Épée" }, "Allié de", "Hache, Fer");
  assert.equal(row("Armes", "Hache")["Allié de"], "Épée");
  assert.equal(row("Ressources", "Fer")["Allié de"], "Épée");
  assert.equal(row("Armes", "Épée")["Allié de"], "Hache, Fer");
  assert.deepEqual(google.grid(id, "Ressources").slice(1).map((line) => line[1]), ["Fer"]);
  // Le nom, l'identifiant ou une colonne qui répond déjà à une autre : refusés, sans rien écrire.
  const before = google.grid(id, "Armes")[0].join("|");
  await assert.rejects(() => world.applyWorldSchemaOperations("objects", [{ op: "add-column", tab: "Armes", header: "Fondu", spec: linked("*", "Nom") }]), /ne peut pas être « Nom »/);
  await assert.rejects(() => world.applyWorldSchemaOperations("objects", [{ op: "add-column", tab: "Armes", header: "Fondu", spec: linked("*", "ID") }]), /INDEX_SCHEMA_INVALID/);
  await assert.rejects(() => world.applyWorldSchemaOperations("objects", [{ op: "add-column", tab: "Armes", header: "Fondu", spec: linked("*", "Recyclage de") }]), /répond déjà à « Se recycle en »/);
  // Ajoutée en même temps avec un autre type, la colonne qui répond effacerait le lien : refusé d'avance.
  await assert.rejects(() => world.applyWorldSchemaOperations("objects", [
    { op: "add-column", tab: "Armes", header: "Fondu en", spec: { kind: "rich" } },
    { op: "add-column", tab: "Armes", header: "Fondu de", spec: linked("*", "Fondu en") },
  ]), /« Fondu en » \(Armes\) répondra à « Fondu de »/);
  assert.equal(google.grid(id, "Armes")[0].join("|"), before);
  assert.ok(!google.grid(id, "Ressources")[0].includes("Fondu"));
  // L'éditeur dit la même chose avant d'enregistrer.
  const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  assert.deepEqual(definitions.linkedColumnProblems("objects", [{ op: "add-column", tab: "Armes", header: "A", spec: linked("*", "B") }, { op: "add-column", tab: "Armes", header: "B", spec: linked("Armes", "A") }]), []);
  assert.equal(definitions.linkedColumnProblems("objects", [{ op: "spec", tab: "Armes", header: "A", spec: linked("*", "Nom") }]).length, 1);
});
