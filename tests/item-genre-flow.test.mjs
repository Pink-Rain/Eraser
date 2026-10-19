import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Tous les items dans un seul onglet : la colonne « Genre » range chacun dans l'inventaire
// (Arme → armes, Équipement → équipement, le reste → inventaire classique), et les magasins,
// les fouilles et les événements les lisent comme avant. Le vrai lib/google-sheets.ts, sur un
// Google Sheets en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-item-genre-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const driveFake = `${root}tests/fakes/objects-drive.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true, hmr: false }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: /^@\/lib\/google-drive$/, replacement: driveFake },
    { find: /^@\/lib\/object-icon-drive$/, replacement: `${root}tests/fakes/object-icon-drive.ts` },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const drive = await vite.ssrLoadModule(driveFake);
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const inventorySchema = await vite.ssrLoadModule("/lib/inventory-schema.ts");
const shopSchema = await vite.ssrLoadModule("/lib/shop-schema.ts");
const shopTypes = await vite.ssrLoadModule("/lib/shop-types.ts");
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

const combat = ["Compétence", "Distance", "Action", "Action de rechargement", "Valeur", "Attributs", "Matériaux", "Runes"];
const itemHeaders = ["ID", "Nom", "Type", "Sous-type", "Genre", "Prix", "Rareté et emplacements", "Icône", ...combat];
const item = (values) => itemHeaders.map((header) => values[header] ?? "");
const contentHeaders = ["ID contenant", "ID", "ID personnage", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"];

test("Un seul onglet d'items : le Genre range dans l'inventaire, les magasins lisent les items comme avant", async () => {
  // Les noms et les types ne disent plus la famille : seul le Genre la dit (ou rien, pour le dernier).
  google.addSpreadsheet("objets-genre", [{ title: "Items", grid: [itemHeaders,
    item({ ID: "IT-LAME", Nom: "Lame du serment", Type: "Tranchante", Genre: "Arme", Prix: "10 PO", "Rareté et emplacements": "Commun : Armurerie - Marché noir" }),
    item({ ID: "IT-BIJOU", Nom: "Bijou d'Harrite", Type: "Bijou", Genre: "Equipement", Prix: "5 PO", "Rareté et emplacements": "Rare : Antiquaire" }),
    item({ ID: "IT-PARCHEMIN", Nom: "Parchemin de feu", Type: "Parchemin", Genre: "Objet", Prix: "2 PO", "Rareté et emplacements": "Commun : Librairie\nTrès rare : Donjon" }),
    item({ ID: "IT-CHARME", Nom: "Charme porte-bonheur", Type: "Charme", Prix: "1 PO" }),
  ] }]);
  drive.drive.objects.push({ id: "objets-genre", name: "Index des objets" });
  const inventory = "inventaire-genre";
  google.addSpreadsheet(inventory, [
    { title: "Types de contenants", grid: [["ID", "Nom", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"]] },
    { title: "Contenu inventaire", grid: [contentHeaders] },
  ]);
  await jdr.saveJdrSheet({ key: "inventory", spreadsheetId: inventory, name: "inventory", tabName: "Types de contenants", webViewLink: "" });

  const start = await sheets.getCharacterInventory("PERSO-G");
  const catalog = new Map(start.items.map((entry) => [entry.name, entry]));
  assert.equal(catalog.get("Lame du serment")?.genre, "Arme");
  const familyOf = (inventoryRecord, name) => {
    const container = inventoryRecord.containers.find((candidate) => candidate.slots.some((slot) => slot.item?.name === name));
    return container?.category;
  };
  // Ajoutés sans contenant choisi : chacun dans la famille que dit son genre.
  let current = start;
  for (const name of ["Lame du serment", "Bijou d'Harrite", "Parchemin de feu", "Charme porte-bonheur"]) current = await sheets.addCharacterInventoryItem("PERSO-G", catalog.get(name).id);
  assert.equal(familyOf(current, "Lame du serment"), "Armes");
  assert.equal(familyOf(current, "Bijou d'Harrite"), "Équipement");
  assert.equal(familyOf(current, "Parchemin de feu"), "Inventaire", "un parchemin n'est plus pris pour une arme (« arc »)");
  assert.equal(familyOf(current, "Charme porte-bonheur"), "Inventaire", "sans genre : son type décide, et « Charme » n'est plus une arme");
  // Un objet va aussi par terre ou dans l'esthétique ; un équipement ne va pas dans les armes.
  const slotOf = (name) => current.containers.flatMap((container) => container.slots).find((slot) => slot.item?.name === name);
  const containerOf = (category) => current.containers.find((container) => container.category === category);
  current = await sheets.moveCharacterInventoryItem("PERSO-G", slotOf("Parchemin de feu").id, containerOf("Au sol").id);
  assert.equal(familyOf(current, "Parchemin de feu"), "Au sol");
  current = await sheets.moveCharacterInventoryItem("PERSO-G", slotOf("Parchemin de feu").id, containerOf("Esthétique").id);
  assert.equal(familyOf(current, "Parchemin de feu"), "Esthétique");
  await assert.rejects(sheets.moveCharacterInventoryItem("PERSO-G", slotOf("Bijou d'Harrite").id, containerOf("Armes").id), /INVENTORY_NO_COMPATIBLE_CONTAINER/);

  // Les magasins, les fouilles et les événements : la colonne « Rareté et emplacements » de
  // l'onglet unique, et le genre en type quand la case Type est vide.
  const forShops = await shopSchema.loadShopGeneratorItems();
  const lame = forShops.find((entry) => entry.name === "Lame du serment");
  assert.deepEqual(lame.locations.map((location) => `${location.rarity}|${location.place}`), ["Commun|Armurerie", "Commun|Marché noir"]);
  assert.equal(lame.genre, "Arme");
  assert.deepEqual(forShops.find((entry) => entry.name === "Parchemin de feu").locations.map((location) => location.place), ["Librairie", "Donjon"]);
  // Un type de magasin réglé sur les anciens onglets (« Armes ») vend encore les armes, par leur genre.
  const armory = { ...shopTypes.builtinShopTypes[0], types: ["Armes"], subtypes: [] };
  assert.equal(shopTypes.shopTypeAllows(armory, lame), true);
  assert.equal(shopTypes.shopTypeAllows(armory, forShops.find((entry) => entry.name === "Bijou d'Harrite")), false);
  void inventorySchema;
});

test("Familles d'inventaire : le genre d'abord, puis le type, sans prendre un mot pour un autre", () => {
  const { genreInventoryCategory, inventoryKindOf, compatibleInventoryCategory, canItemGoInInventoryCategory } = inventorySchema;
  assert.equal(genreInventoryCategory("Arme"), "Armes");
  assert.equal(genreInventoryCategory("Equipement"), "Équipement");
  assert.equal(genreInventoryCategory("Équipements"), "Équipement");
  assert.equal(genreInventoryCategory("Objet"), "Inventaire");
  assert.equal(genreInventoryCategory("Consommable"), "Inventaire", "tout autre genre : l'inventaire classique");
  assert.equal(genreInventoryCategory(""), null);
  assert.equal(inventoryKindOf({ genre: "Arme", type: "Bijou" }), "Arme");
  assert.equal(inventoryKindOf({ type: "Arme à distance", subtype: "Arc" }), "Arme à distance Arc");
  // Les anciennes fautes de la recherche par sous-chaîne.
  for (const type of ["Parchemin", "Marchandise", "Charme", "Objet élégant"]) assert.equal(compatibleInventoryCategory(type), "Inventaire", type);
  for (const type of ["Arme à distance", "Arbalètes", "Épée longue", "Hachette"]) assert.equal(compatibleInventoryCategory(type), "Armes", type);
  for (const type of ["Equipement léger", "Gantelets", "Amulette"]) assert.equal(compatibleInventoryCategory(type), "Équipement", type);
  assert.equal(canItemGoInInventoryCategory(inventoryKindOf({ genre: "Objet" }), "Au sol"), true);
  assert.equal(canItemGoInInventoryCategory(inventoryKindOf({ genre: "Objet" }), "Esthétique"), true);
  assert.equal(canItemGoInInventoryCategory(inventoryKindOf({ genre: "Objet" }), "Armes"), false);
  assert.equal(inventorySchema.parseInventoryCategory("Par terre"), "Au sol");
  assert.equal(inventorySchema.parseInventoryCategory("Purement esthétique"), "Esthétique");
});
