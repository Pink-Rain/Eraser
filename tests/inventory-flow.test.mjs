import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les inventaires du vrai lib/google-sheets.ts, branchés sur un Google Sheets en mémoire :
// deux modifications lancées ensemble, ou une feuille changée par une autre installation.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-inventory-"));
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

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;

beforeEach(async () => {
  google.reset();
  const db = getDb();
  await db.delete(schema.jdrGoogleSheets);
  await db.delete(schema.sheetIndexSyncs);
});

const npcHeaders = [
  "ID", "Page lié", "Nom du PNJ", "Classe / métier", "Vie actuelle", "Vie totale", "Rapidité",
  "Force", "Dextérité", "Intelligence", "Sagesse", "Charisme", "Capacité de combat",
  "Capacité de tir", "Capacité magique", "Force mentale", "Constitution", "Peuple", "Genre", "Âge",
  "Poids", "Taille", "Notes MJ", "Portrait", "Notes joueurs", "Inventaire JSON (archive)",
  "Ajouté au créateur de session", "Créé le", "Modifié le", "Dossier", "Dans le groupe joueur", "PNJ important", "Créé par",
  "Titre", "Histoire / Lore", "Sorts actifs", "Sorts passifs",
];

// « Contenu inventaire » rangé autrement qu'Eraser l'écrit : chaque case est retrouvée par son nom.
const contentHeaders = ["ID contenant", "ID", "ID personnage", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"];

/** Un classeur d'inventaire vide (et une feuille des PNJ) reliés à cette installation. */
async function linkInventory({ npcs = [] } = {}) {
  const inventory = fresh("inventory");
  google.addSpreadsheet(inventory, [
    { title: "Types de contenants", grid: [["ID", "Nom", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"], ["OBJ-CORDE", "Corde", "10 m de chanvre", "Objet", "", "", "5"]] },
    { title: "Contenu inventaire", grid: [contentHeaders] },
  ]);
  await jdr.saveJdrSheet({ key: "inventory", spreadsheetId: inventory, name: "inventory", tabName: "Types de contenants", webViewLink: "" });
  const npcSheet = fresh("npcs");
  google.addSpreadsheet(npcSheet, [{ title: "PNJs", grid: [npcHeaders, ...npcs.map((npc) => npcHeaders.map((header) => npc[header] ?? ""))] }]);
  await jdr.saveJdrSheet({ key: "npcs", spreadsheetId: npcSheet, name: "npcs", tabName: "PNJs", webViewLink: "" });
  await getDb().insert(schema.sheetIndexSyncs).values({ key: `npc-sheet-schema:${npcSheet}:PNJs:v9` });
  return { inventory, npcSheet };
}

/** Les lignes d'un onglet sous forme { en-tête: valeur }, avec leur numéro de ligne. */
function rowsOf(spreadsheet, tab) {
  const grid = google.grid(spreadsheet, tab);
  return grid.slice(1).map((line, index) => ({ row: index + 2, ...Object.fromEntries(grid[0].map((header, column) => [header, line[column] ?? ""])) }));
}

const occupied = (spreadsheet, owner) => rowsOf(spreadsheet, "Contenu inventaire").filter((row) => row["ID personnage"] === owner && (row["ID objet"] || row["Nom personnalisé"]) && Number(row["Nombre"]) > 0);

/** Un personnage dont le sac contient un objet créé à la main. */
async function characterWith(owner, name) {
  const inventory = await sheets.getCharacterInventory(owner);
  const sack = inventory.containers.find((container) => container.category === "Inventaire");
  const filled = await sheets.createCharacterInventoryItem(owner, sack.id, { name, description: "", type: "Objet", subtype: "", effect: "" });
  return filled.containers.flatMap((container) => container.slots).find((slot) => slot.item?.name === name);
}

test("Deux transferts lancés ensemble vers le même personnage : les deux objets arrivent", async () => {
  const { inventory } = await linkInventory();
  const corde = await characterWith("PERSO-A", "Corde de Lina");
  const lanterne = await characterWith("PERSO-B", "Lanterne de Brin");
  await sheets.getCharacterInventory("PERSO-T");
  await Promise.all([
    sheets.transferCharacterInventoryItem("PERSO-A", corde.id, "PERSO-T"),
    sheets.transferCharacterInventoryItem("PERSO-B", lanterne.id, "PERSO-T"),
  ]);
  assert.deepEqual(occupied(inventory, "PERSO-T").map((row) => row["Nom personnalisé"]).sort(), ["Corde de Lina", "Lanterne de Brin"]);
  assert.deepEqual(occupied(inventory, "PERSO-A"), []);
  assert.deepEqual(occupied(inventory, "PERSO-B"), []);
});

test("Une ligne insérée au-dessus par une autre installation : l'écriture touche la bonne case", async () => {
  const { inventory } = await linkInventory();
  const corde = await characterWith("PERSO-A", "Corde");
  // Gardé en mémoire par cette installation…
  await sheets.getCharacterInventory("PERSO-A");
  // …pendant qu'une autre trie la feuille : la case d'un autre personnage arrive juste au-dessus.
  const grid = google.grid(inventory, "Contenu inventaire");
  grid.splice(grid.findIndex((row) => row.includes(corde.id)), 0, contentHeaders.map((header) => ({ "ID": "AUTRE-1", "ID personnage": "PERSO-Z", "ID contenant": "SAC-Z", "Emplacement": "1", "ID objet": "OBJ-EPEE", "Nombre": "1", "Nom personnalisé": "Épée de Zoé" })[header] ?? ""));
  await sheets.setCharacterInventoryItemEquipped("PERSO-A", corde.id, true);
  const rows = rowsOf(inventory, "Contenu inventaire");
  const other = rows.find((row) => row["ID"] === "AUTRE-1");
  assert.ok(other, "la case de Zoé a été écrasée");
  assert.equal(other["Nom personnalisé"], "Épée de Zoé");
  assert.equal(other["Équipé"], "");
  assert.equal(rows.find((row) => row["ID"] === corde.id)["Équipé"], "Oui");
  assert.equal(rows.filter((row) => row["ID"] === corde.id).length, 1);
});

test("Un nombre changé ailleurs entre-temps : la modification est refusée", async () => {
  const { inventory } = await linkInventory();
  const corde = await characterWith("PERSO-A", "Flèches");
  await sheets.setCharacterInventoryItemQuantity("PERSO-A", corde.id, 3, "character", { itemId: "", quantity: 1 });
  // Une autre installation en ajoute deux : la page, elle, montre toujours 3.
  const grid = google.grid(inventory, "Contenu inventaire");
  const line = grid.findIndex((row) => row.includes(corde.id));
  grid[line][contentHeaders.indexOf("Nombre")] = "5";
  await assert.rejects(sheets.setCharacterInventoryItemQuantity("PERSO-A", corde.id, 2, "character", { itemId: "", quantity: 3 }), /INVENTORY_CHANGED/);
  assert.equal(rowsOf(inventory, "Contenu inventaire").find((row) => row["ID"] === corde.id)["Nombre"], "5");
  await assert.rejects(sheets.transferCharacterInventoryItem("PERSO-A", corde.id, "PERSO-T", "character", undefined, { itemId: "", quantity: 3 }), /INVENTORY_CHANGED/);
  assert.equal(occupied(inventory, "PERSO-T").length, 0);
});

test("Le résumé et la fiche complète chargés ensemble : aucun contenant ni emplacement en double", async () => {
  const { inventory } = await linkInventory();
  await Promise.all([sheets.getCharacterInventorySummary("PERSO-N"), sheets.getCharacterInventory("PERSO-N"), sheets.getCharacterInventorySummary("PERSO-N")]);
  const containers = rowsOf(inventory, "Contenants personnages").filter((row) => row["ID personnage"] === "PERSO-N");
  assert.equal(containers.length, 5);
  assert.equal(new Set(containers.map((row) => row["ID type"])).size, 5);
  const slots = rowsOf(inventory, "Contenu inventaire").filter((row) => row["ID personnage"] === "PERSO-N");
  const pairs = slots.map((row) => `${row["ID contenant"]}#${row["Emplacement"]}`);
  assert.equal(new Set(pairs).size, pairs.length);
});

test("Le résumé puis l'inventaire complet : une seule lecture des onglets ; un objet reçu fait relire Google", async () => {
  const { inventory } = await linkInventory();
  // Ses contenants créés, puis tout oublié : comme une fiche qu'on rouvre.
  await sheets.getCharacterInventory("PERSO-R");
  sheets.forgetInventoryReads();
  const reads = () => google.world.calls.filter((call) => call.url.includes(`/${inventory}/values:batchGet`)).length;
  const before = reads();
  await sheets.getCharacterInventorySummary("PERSO-R");
  await sheets.getCharacterInventory("PERSO-R");
  await sheets.getCharacterInventorySummary("PERSO-R");
  assert.equal(reads() - before, 1, "la fiche relisait les onglets d'inventaire à chaque demande");
  // Une autre installation vient d'y ranger un objet : la page le redemande, Google est relu.
  sheets.forgetInventoryReads();
  await sheets.getCharacterInventorySummary("PERSO-R");
  assert.equal(reads() - before, 2);
});

test("Un déplacement dans l'inventaire : arrivée et départ écrits en une seule fois", async () => {
  const { inventory } = await linkInventory();
  const corde = await characterWith("PERSO-A", "Corde");
  const current = await sheets.getCharacterInventory("PERSO-A");
  const aesthetic = current.containers.find((container) => container.category === "Esthétique");
  const before = google.world.requests.length;
  await sheets.moveCharacterInventoryItem("PERSO-A", corde.id, aesthetic.id, { itemId: "", quantity: 1 });
  const writes = google.world.requests.slice(before).filter((request) => request.startsWith("PUT") || request.includes("values:batchUpdate"));
  assert.deepEqual(writes, ["POST /values:batchUpdate"]);
  const mine = occupied(inventory, "PERSO-A");
  assert.equal(mine.length, 1);
  assert.equal(mine[0]["ID contenant"], aesthetic.id);
});

test("Une feuille des PNJ illisible arrête le transfert : le destinataire n'est pas pris pour un personnage", async () => {
  const { inventory, npcSheet } = await linkInventory();
  const corde = await characterWith("PERSO-A", "Corde");
  google.world.files.delete(npcSheet);
  await assert.rejects(sheets.transferCharacterInventoryItem("PERSO-A", corde.id, "PNJ-1"));
  assert.equal(occupied(inventory, "PERSO-A").length, 1);
  assert.deepEqual(rowsOf(inventory, "Contenants personnages").filter((row) => row["ID personnage"] === "PNJ-1"), []);
});

test("Créature compagnon : un seul sac à dos à elle, l'objet donné par son personnage y arrive", async () => {
  const { inventory } = await linkInventory();
  const corde = await characterWith("PERSO-A", "Corde de Lina");
  const owner = "COMPAGNON:PERSO-A:cmp-1";
  await sheets.transferCharacterInventoryItem("PERSO-A", corde.id, owner);
  // Rangée comme un PNJ : un sac à dos, jamais les cinq contenants d'un personnage.
  const containers = rowsOf(inventory, "Contenants personnages").filter((row) => row["ID personnage"] === owner && !row["Supprimé le"]);
  assert.deepEqual(containers.map((row) => row["Nom personnalisé"]), ["Sac à dos"]);
  assert.deepEqual(occupied(inventory, owner).map((row) => row["Nom personnalisé"]), ["Corde de Lina"]);
  assert.deepEqual(occupied(inventory, "PERSO-A"), []);
  // Et elle la rend à son personnage.
  const backpack = await sheets.getNpcBackpackInventory(owner);
  const slot = backpack.containers.flatMap((container) => container.slots).find((candidate) => candidate.item?.name === "Corde de Lina");
  await sheets.transferCharacterInventoryItem(owner, slot.id, "PERSO-A", "npc");
  assert.deepEqual(occupied(inventory, owner), []);
  assert.deepEqual(occupied(inventory, "PERSO-A").map((row) => row["Nom personnalisé"]), ["Corde de Lina"]);
});

test("Le sac d'un PNJ : réuni une fois, sans doubler l'ancien inventaire ni toucher à « Équipé »", async () => {
  const { inventory } = await linkInventory({ npcs: [{ "ID": "PNJ-1", "Page lié": "CAMP-1", "Nom du PNJ": "Aldor", "Inventaire JSON (archive)": JSON.stringify([{ name: "Gourde", quantity: 2 }]) }] });
  // Un PNJ pris pour un personnage : cinq contenants, une arme équipée dans le rangement d'armes.
  const asCharacter = await sheets.getCharacterInventory("PNJ-1");
  const weapons = asCharacter.containers.find((container) => container.category === "Armes");
  const armed = await sheets.createCharacterInventoryItem("PNJ-1", weapons.id, { name: "Dague", description: "", type: "Arme", subtype: "", effect: "" });
  const dague = armed.containers.flatMap((container) => container.slots).find((slot) => slot.item?.name === "Dague");
  await sheets.setCharacterInventoryItemEquipped("PNJ-1", dague.id, true);

  const backpack = await sheets.getNpcBackpackInventory("PNJ-1");
  assert.equal(backpack.containers.length, 1);
  assert.equal(backpack.containers[0].name, "Sac à dos");
  const items = () => occupied(inventory, "PNJ-1").map((row) => `${row["Nom personnalisé"]}×${row["Nombre"]}${row["Équipé"] === "Oui" ? " équipé" : ""}`).sort();
  assert.deepEqual(items(), ["Dague×1 équipé", "Gourde×2"]);

  // Relancé (un autre contenant est apparu ailleurs) : rien n'est ajouté deux fois.
  const containers = google.grid(inventory, "Contenants personnages");
  containers.push(["SAC-EN-PLUS", "PNJ-1", "", "Sacoche", "Inventaire", "3", "1", "", ""]);
  await sheets.getNpcBackpackInventory("PNJ-1");
  assert.deepEqual(items(), ["Dague×1 équipé", "Gourde×2"]);
  const active = rowsOf(inventory, "Contenants personnages").filter((row) => row["ID personnage"] === "PNJ-1" && !row["Supprimé le"]);
  assert.deepEqual(active.map((row) => row["Nom personnalisé"]), ["Sac à dos"]);
  const sack = active[0]["ID"];
  const pairs = rowsOf(inventory, "Contenu inventaire").filter((row) => row["ID contenant"] === sack).map((row) => row["Emplacement"]);
  assert.equal(new Set(pairs).size, pairs.length);
});
