import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// L'Index des objets du vrai lib/google-sheets.ts, sur un Google Sheets en mémoire : la
// feuille change « sur une autre installation » entre la lecture gardée en mémoire et l'écriture.
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
const objectSchema = await vite.ssrLoadModule("/lib/object-schema.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;

// La première lecture du catalogue lance des tâches de fond (colonnes de combat, icônes) qui
// ne repassent pas avant dix minutes : elles passent ici, sur un classeur jetable, et ne
// viennent plus écrire pendant les tests.
{
  const warm = fresh("objets");
  google.addSpreadsheet(warm, [{ title: "Jetable", grid: [["ID", "Nom", "Icône"], ["J-1", "Caillou", ""]] }]);
  drive.drive.objects.push({ id: warm, name: "Jetable" });
  await sheets.listObjectIndexTables();
  await new Promise((resolve) => setTimeout(resolve, 200));
}

beforeEach(async () => {
  google.reset();
  drive.reset();
  sheets.clearObjectIndexTableCache();
  await getDb().delete(schema.jdrGoogleSheets);
  await getDb().delete(schema.sheetIndexSyncs);
});

/** Un classeur d'objets rangé dans le dossier « Objets ». */
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

const names = (id, tab) => google.grid(id, tab).slice(1).map((row) => row[google.grid(id, tab)[0].indexOf("Nom")]);

test("Suppression d'après une page périmée : c'est la ligne de cet ID qui part, ou rien", async () => {
  const id = objectsFile([{ title: "Armes", grid: armes() }]);
  // La page (et le serveur) ont lu le tableau…
  const [table] = await sheets.listObjectIndexTables();
  const dague = table.rows.find((row) => row.values[1] === "Dague");
  // …puis une autre installation insère une ligne en tête : la Dague passe en ligne 4.
  google.grid(id, "Armes").splice(1, 0, ["ARM-0", "Hache", "Arme", "6"]);
  await sheets.deleteObjectIndexRows(id, "Armes", [{ id: "ARM-2", rowNumber: dague.rowNumber, name: "Dague" }]);
  assert.deepEqual(names(id, "Armes"), ["Hache", "Épée", "Arc"]);
  // Une ligne qui n'est plus là : rien n'est supprimé.
  await assert.rejects(sheets.deleteObjectIndexRows(id, "Armes", [{ id: "ARM-3", rowNumber: 4, name: "Arc" }, { id: "ARM-9", rowNumber: 2, name: "Fronde" }]), /OBJECT_INDEX_CHANGED/);
  assert.deepEqual(names(id, "Armes"), ["Hache", "Épée", "Arc"]);
});

test("Case modifiée après un déplacement de colonnes et de lignes : sous son en-tête, à la ligne de son ID", async () => {
  const id = objectsFile([{ title: "Armes", grid: armes() }]);
  const [table] = await sheets.listObjectIndexTables();
  const epee = table.rows.find((row) => row.values[1] === "Épée");
  // Ailleurs : « Prix » passe avant « Nom » et une ligne arrive en tête.
  const grid = google.grid(id, "Armes");
  for (const row of grid) row.splice(1, 0, row.splice(3, 1)[0] ?? "");
  grid.splice(1, 0, ["ARM-0", "6", "Hache", "Arme"]);
  await sheets.updateObjectIndexCell(id, "Armes", { id: "ARM-1", rowNumber: epee.rowNumber, name: "Épée", header: "Prix", occurrence: 0 }, "12");
  const after = google.grid(id, "Armes");
  assert.deepEqual(after[0], ["ID", "Prix", "Nom", "Type"]);
  assert.deepEqual(after.find((row) => row[0] === "ARM-1"), ["ARM-1", "12", "Épée", "Arme"]);
  assert.deepEqual(after.find((row) => row[0] === "ARM-0"), ["ARM-0", "6", "Hache", "Arme"]);
  // Une colonne qui n'existe plus : rien n'est écrit.
  await assert.rejects(sheets.updateObjectIndexCell(id, "Armes", { id: "ARM-1", rowNumber: 3, name: "Épée", header: "Poids", occurrence: 0 }, "3"), /OBJECT_INDEX_CHANGED/);
});

test("Ajout, insertion et copie : chaque valeur sous son en-tête, chaque ligne à côté de la bonne", async () => {
  const id = objectsFile([{ title: "Armes", grid: armes() }]);
  await sheets.listObjectIndexTables();
  // Ailleurs : les colonnes changent d'ordre.
  for (const row of google.grid(id, "Armes")) row.reverse();
  await sheets.addObjectIndexRowWithValues(id, "Armes", [["ID", ""], ["Nom", "Lance"], ["Type", "Arme"], ["Prix", "7"]]);
  const grid = google.grid(id, "Armes");
  const lance = grid.find((row) => row.includes("Lance"));
  assert.deepEqual(lance.slice(0, 3), ["7", "Arme", "Lance"]);
  assert.match(lance[3], /^[0-9a-f-]{36}$/);
  // La Dague est maintenant en ligne 4 : la copie et la ligne vide arrivent sous elle.
  grid.splice(1, 0, ["6", "Arme", "Hache", "ARM-0"]);
  await sheets.duplicateObjectIndexRows(id, "Armes", [{ id: "ARM-2", rowNumber: 3, name: "Dague" }]);
  await sheets.insertObjectIndexRow(id, "Armes", { id: "ARM-1", rowNumber: 2, name: "Épée" }, 1, false);
  const rows = google.grid(id, "Armes").slice(1).map((row) => row[2] ?? "");
  assert.deepEqual(rows, ["Hache", "Épée", "", "Dague", "Dague", "Arc", "Lance"]);
  const ids = google.grid(id, "Armes").slice(1).map((row) => row[3]);
  assert.equal(new Set(ids).size, ids.length);
});

test("Renommer une colonne : celle de ce nom dans la ligne 1 relue, même si l'ordre a changé", async () => {
  const id = objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type", "Prix", "Couleur"], ["ARM-1", "Épée", "Arme", "10", "Rouge"]] }]);
  await sheets.listObjectIndexTables();
  // Ailleurs : « Couleur » est déplacée en tête.
  for (const row of google.grid(id, "Armes")) row.unshift(row.splice(4, 1)[0] ?? "");
  await objectSchema.applyObjectSchemaOperations(id, [{ op: "rename", tab: "Armes", header: "Couleur", to: "Teinte" }]);
  assert.deepEqual(google.grid(id, "Armes")[0], ["Teinte", "ID", "Nom", "Type", "Prix"]);
});

test("Icônes posées d'après un instantané : une icône choisie entre-temps n'est jamais écrasée", async () => {
  const id = objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type", "Icône"], ["ARM-1", "Épée", "Arme", ""], ["ARM-2", "Dague", "Arme", ""]] }]);
  icons.hold();
  await sheets.listObjectIndexTables();
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

test("« Nombre max » d'après un instantané : seules les cases encore vides, à la ligne de leur ID", async () => {
  const id = objectsFile([{ title: "Flèches", grid: [["ID", "Nom", "Type", "Nombre max"], ["F-1", "Flèche", "Munition", ""], ["F-2", "Potion", "Consommable", ""]] }]);
  await sheets.listObjectIndexTables();
  const grid = google.grid(id, "Flèches");
  grid.splice(1, 0, ["F-0", "Corde", "Objet", ""]);
  grid.find((row) => row[0] === "F-1")[3] = "50";
  await sheets.ensureObjectIndexStackLimits();
  const max = (key) => google.grid(id, "Flèches").find((row) => row[0] === key)[3];
  assert.equal(max("F-1"), "50");
  assert.equal(max("F-2"), "5");
  assert.equal(max("F-0"), "");
});

test("Réparation des en-têtes : une colonne en double n'est jamais supprimée", async () => {
  // « Description » en double, vide : une ancienne version l'ajoutait en fin de tableau.
  const id = objectsFile([{ title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Description"], ["OBJ-1", "Corde", "Chanvre", "Outil", ""]] }]);
  await sheets.objectIndexTablesForRegroup();
  assert.deepEqual(google.grid(id, "Objets")[0], ["ID", "Nom", "Description", "Type", "Description"]);
  assert.deepEqual(google.grid(id, "Objets")[1], ["OBJ-1", "Corde", "Chanvre", "Outil", ""]);
});

test("Un objet nommé sans ID reçoit le sien avant d'être servi : une ligne insérée au-dessus ne le change plus", async () => {
  const id = objectsFile([{ title: "Armes", grid: [["ID", "Nom", "Type"], ["ARM-1", "Épée", "Arme"], ["", "Fronde", "Arme"]] }]);
  const [table] = await sheets.listObjectIndexTables();
  const fronde = table.rows.find((row) => row.values[1] === "Fronde");
  const written = google.grid(id, "Armes")[2][0];
  assert.equal(fronde.values[0], written);
  assert.equal(written, `DRIVE-${id}-1-3`);
  google.grid(id, "Armes").splice(1, 0, ["ARM-0", "Hache", "Arme"]);
  sheets.clearObjectIndexTableCache();
  const [reread] = await sheets.listObjectIndexTables();
  assert.equal(reread.rows.find((row) => row.values[1] === "Fronde").values[0], written);
});

test("L'inventaire recopie le texte du catalogue à jour, pas celui gardé pour l'affichage", async () => {
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
    const added = await sheets.addCharacterInventoryItem("PERSO-A", "OBJ-1");
    const slot = added.containers.flatMap((container) => container.slots).find((candidate) => candidate.itemId === "OBJ-1");
    assert.equal(slot.item.name, "Corde de chanvre");
    const row = google.grid(inventory, "Contenu inventaire").find((line) => line[4] === "OBJ-1");
    assert.equal(row[6], "Corde de chanvre");
  } finally {
    Date.now = realNow;
  }
});

test("Ligne sans ID ni nom (insérée, ou brouillon) : elle se remplit et se supprime depuis Eraser", async () => {
  const refs = await vite.ssrLoadModule("/lib/object-index-refs.ts");
  const id = fresh("objets");
  google.addSpreadsheet(id, [{ title: "Objets", grid: [["Nom", "Description", "Type"], ["Corde", "Chanvre", "Objet"], ["Torche", "Bois", "Objet"]] }]);
  drive.drive.objects.push({ id, name: "Index des objets" });
  const [table] = await sheets.listObjectIndexTables();
  const corde = table.rows.find((candidate) => candidate.values[0] === "Corde");
  await sheets.insertObjectIndexRow(id, "Objets", refs.objectIndexRowRef(table.headers, corde), 1, false);
  sheets.clearObjectIndexTableCache();
  const [reread] = await sheets.listObjectIndexTables();
  const blank = reread.rows.find((candidate) => candidate.rowNumber === 3);
  // Remplie à sa place…
  await sheets.updateObjectIndexCell(id, "Objets", refs.objectIndexCellRef(reread.headers, blank, 1), "Brouillon");
  assert.equal(google.grid(id, "Objets")[2][1], "Brouillon");
  // …puis supprimée : la ligne n'a toujours ni ID ni nom.
  await sheets.deleteObjectIndexRows(id, "Objets", [refs.objectIndexRowRef(reread.headers, blank)]);
  assert.deepEqual(google.grid(id, "Objets").map((row) => row[0]), ["Nom", "Corde", "Torche"]);
});

test("« Modifier » : une colonne sans en-tête (« Colonne 3 ») reçoit le nom donné", async () => {
  const id = fresh("objets");
  google.addSpreadsheet(id, [{ title: "Objets", grid: [["ID", "Nom", ""], ["O-1", "Corde", "note"], ["O-2", "Torche", "autre"]] }]);
  drive.drive.objects.push({ id, name: "Index des objets" });
  const [table] = await sheets.listObjectIndexTables();
  assert.equal(table.headers[2], "Colonne 3");
  await objectSchema.applyObjectSchemaOperations(id, [{ op: "rename", tab: "Objets", header: "Colonne 3", to: "Notes" }]);
  assert.equal(google.grid(id, "Objets")[0][2], "Notes");
});
