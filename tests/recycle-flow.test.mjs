import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le recyclage d'un item de l'inventaire : la colonne « Se recycle en » de l'Index des items
// (jamais « Recyclage de », qui lui répond), les exemplaires retirés et les produits choisis
// ajoutés sous le même verrou. Le vrai lib/google-sheets.ts, sur un Google Sheets en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-recycle-"));
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
const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");

const itemHeaders = ["ID", "Nom", "Type", "Genre", "Nombre max", "Se recycle en", "Recyclage de"];
const item = (values) => itemHeaders.map((header) => values[header] ?? "");
const contentHeaders = ["ID contenant", "ID", "ID personnage", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"];

test("Recycler : les exemplaires choisis partent, les produits cochés arrivent, le reste est refusé", async () => {
  google.addSpreadsheet("objets-recyclage", [{ title: "Items", grid: [itemHeaders,
    item({ ID: "IT-EPEE", Nom: "Épée rouillée", Type: "Épée", Genre: "Arme", "Nombre max": "5", "Se recycle en": "Ferraille, Cuir" }),
    item({ ID: "IT-FER", Nom: "Ferraille", Type: "Ressource", Genre: "Objet", "Nombre max": "99", "Recyclage de": "Épée rouillée" }),
    item({ ID: "IT-CUIR", Nom: "Cuir", Type: "Ressource", Genre: "Objet", "Nombre max": "99", "Recyclage de": "Épée rouillée" }),
    item({ ID: "IT-BATON", Nom: "Bâton", Type: "Bâton", Genre: "Arme" }),
    item({ ID: "IT-ARC", Nom: "Arc fendu", Type: "Arc", Genre: "Arme", "Se recycle en": "Bois inconnu" }),
  ] }]);
  drive.drive.objects.push({ id: "objets-recyclage", name: "Index des objets" });
  const inventory = "inventaire-recyclage";
  google.addSpreadsheet(inventory, [
    { title: "Types de contenants", grid: [["ID", "Nom", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"]] },
    { title: "Contenu inventaire", grid: [contentHeaders] },
  ]);
  await jdr.saveJdrSheet({ key: "inventory", spreadsheetId: inventory, name: "inventory", tabName: "Types de contenants", webViewLink: "" });

  const owner = "PERSO-RECYCLE";
  const start = await sheets.getCharacterInventory(owner);
  const catalog = new Map(start.items.map((entry) => [entry.name, entry]));
  const id = (name) => catalog.get(name).id;
  // « Se recycle en » : les items nommés, retrouvés dans le catalogue ; « Recyclage de » n'en donne pas.
  assert.deepEqual(catalog.get("Épée rouillée").recycle, [{ id: id("Ferraille"), name: "Ferraille" }, { id: id("Cuir"), name: "Cuir" }]);
  assert.equal(catalog.get("Ferraille").recycle, undefined, "« Recyclage de » n'est pas ce que l'item donne");
  assert.equal(catalog.get("Bâton").recycle, undefined);
  assert.equal(catalog.get("Arc fendu").recycle, undefined, "un nom introuvable ne donne pas de bouton");

  let current = await sheets.addCharacterInventoryItem(owner, id("Épée rouillée"), undefined, "character", 3);
  current = await sheets.addCharacterInventoryItem(owner, id("Bâton"));
  const slotOf = (record, name) => record.containers.flatMap((container) => container.slots).find((slot) => slot.item?.name === name && slot.quantity > 0);
  const swords = slotOf(current, "Épée rouillée");
  assert.equal(swords.quantity, 3);
  // La case porte ses produits jusqu'à la page (le bouton du recyclage).
  assert.deepEqual(swords.item.recycle.map((product) => product.name), ["Ferraille", "Cuir"]);
  const expected = { itemId: swords.itemId, quantity: 3 };

  // Refusés, sans rien écrire.
  await assert.rejects(sheets.recycleCharacterInventoryItem(owner, swords.id, 1, [{ itemId: id("Bâton"), quantity: 1 }], "character", expected), /INVENTORY_NOT_RECYCLABLE/);
  await assert.rejects(sheets.recycleCharacterInventoryItem(owner, swords.id, 4, [{ itemId: id("Ferraille"), quantity: 1 }], "character", expected), /INVALID_INVENTORY_RECYCLE/);
  await assert.rejects(sheets.recycleCharacterInventoryItem(owner, swords.id, 1, [], "character", expected), /INVALID_INVENTORY_RECYCLE/);
  await assert.rejects(sheets.recycleCharacterInventoryItem(owner, swords.id, 1, [{ itemId: id("Ferraille"), quantity: 0 }], "character", expected), /INVALID_INVENTORY_RECYCLE/);
  await assert.rejects(sheets.recycleCharacterInventoryItem(owner, swords.id, 1, [{ itemId: id("Ferraille"), quantity: 1 }], "character", { itemId: swords.itemId, quantity: 2 }), /INVENTORY_CHANGED/);
  await assert.rejects(sheets.recycleCharacterInventoryItem(owner, slotOf(current, "Bâton").id, 1, [{ itemId: id("Ferraille"), quantity: 1 }]), /INVENTORY_NOT_RECYCLABLE/);
  current = await sheets.getCharacterInventory(owner);
  assert.equal(slotOf(current, "Épée rouillée").quantity, 3, "un refus ne touche à rien");
  assert.equal(slotOf(current, "Ferraille"), undefined);

  // Deux épées sur trois, pour deux ferrailles et un cuir (ce que le MJ a accordé).
  current = await sheets.recycleCharacterInventoryItem(owner, swords.id, 2, [{ itemId: id("Ferraille"), quantity: 2 }, { itemId: id("Cuir"), quantity: 1 }], "character", expected);
  assert.equal(slotOf(current, "Épée rouillée").quantity, 1);
  assert.equal(slotOf(current, "Ferraille").quantity, 2);
  assert.equal(slotOf(current, "Cuir").quantity, 1);
  const familyOf = (name) => current.containers.find((container) => container.slots.some((slot) => slot.id === slotOf(current, name).id))?.category;
  assert.equal(familyOf("Ferraille"), "Inventaire", "un produit est rangé comme un item ajouté à la main");

  // La dernière épée, pour une seule ferraille : sa case est vidée, la ferraille s'empile.
  current = await sheets.recycleCharacterInventoryItem(owner, swords.id, 1, [{ itemId: id("Ferraille"), quantity: 1 }], "character", { itemId: swords.itemId, quantity: 1 });
  assert.equal(slotOf(current, "Épée rouillée"), undefined);
  assert.equal(slotOf(current, "Ferraille").quantity, 3);
  assert.equal(slotOf(current, "Bâton").quantity, 1, "les autres items ne bougent pas");
});

test("Un produit sans place : l'item recyclé revient tel qu'il était (sac de PNJ plein)", async () => {
  const npc = "PNJ-RECYCLE";
  // La feuille des PNJ (leur sac), avec ses seules colonnes utiles ici.
  const npcHeaders = ["ID", "Page lié", "Nom du PNJ", "Inventaire JSON (archive)"];
  google.addSpreadsheet("pnj-recyclage", [{ title: "PNJs", grid: [npcHeaders, [npc, "CAMP-R", "Forgeron", ""]] }]);
  await jdr.saveJdrSheet({ key: "npcs", spreadsheetId: "pnj-recyclage", name: "npcs", tabName: "PNJs", webViewLink: "" });
  const catalog = new Map((await sheets.getCharacterInventory("PERSO-RECYCLE")).items.map((entry) => [entry.name, entry.id]));
  let current = await sheets.addCharacterInventoryItem(npc, catalog.get("Épée rouillée"), undefined, "npc", 5);
  // Le sac (15 cases) : une case d'épées, quatorze bâtons.
  current = await sheets.addCharacterInventoryItem(npc, catalog.get("Bâton"), undefined, "npc", 14);
  const slots = current.containers.flatMap((container) => container.slots);
  const swords = slots.find((slot) => slot.item?.name === "Épée rouillée");
  assert.equal(slots.filter((slot) => slot.quantity > 0).length, 15);
  await assert.rejects(sheets.recycleCharacterInventoryItem(npc, swords.id, 1, [{ itemId: catalog.get("Ferraille"), quantity: 1 }], "npc", { itemId: swords.itemId, quantity: 5 }), /INVENTORY_FULL/);
  current = await sheets.getNpcBackpackInventory(npc);
  const after = current.containers.flatMap((container) => container.slots);
  assert.equal(after.find((slot) => slot.id === swords.id).quantity, 5, "la case reprend ses épées");
  assert.equal(after.find((slot) => slot.item?.name === "Ferraille"), undefined);
  // Toute la pile : sa case libérée accueille la ferraille.
  current = await sheets.recycleCharacterInventoryItem(npc, swords.id, 5, [{ itemId: catalog.get("Ferraille"), quantity: 2 }], "npc", { itemId: swords.itemId, quantity: 5 });
  const done = current.containers.flatMap((container) => container.slots);
  assert.equal(done.find((slot) => slot.item?.name === "Ferraille")?.quantity, 2);
  assert.equal(done.find((slot) => slot.item?.name === "Épée rouillée" && slot.quantity > 0), undefined);
});

test("La demande de recyclage d'une requête, et ses produits gardés par un inventaire résumé", () => {
  const { inventoryRecycleRequest, keepCatalogFields, inventoryRecycleErrorMessage } = inventorySchema;
  assert.deepEqual(inventoryRecycleRequest({ action: "recycle-item", slotId: "S1", count: 2.7, products: [{ itemId: "A", quantity: 3 }, { itemId: "", quantity: 1 }, { itemId: "B", quantity: "2" }, null] }), { slotId: "S1", count: 2, products: [{ itemId: "A", quantity: 3 }] });
  assert.equal(inventoryRecycleRequest({ action: "recycle-item", slotId: "S1", count: 1 }), null);
  assert.equal(inventoryRecycleRequest({ action: "set-quantity", slotId: "S1", count: 1, products: [] }), null);
  assert.equal(inventoryRecycleErrorMessage("INVENTORY_FULL"), undefined);
  assert.match(inventoryRecycleErrorMessage("INVENTORY_NOT_RECYCLABLE"), /recycle/);

  const sword = { id: "IT-EPEE", name: "Épée", recycle: [{ id: "IT-FER", name: "Ferraille" }] };
  const previous = { containerTypes: [], items: [], containers: [{ id: "C", slots: [{ id: "S", item: sword }] }] };
  const summary = { containerTypes: [], items: [], containers: [{ id: "C", slots: [{ id: "S", item: { id: "IT-EPEE", name: "Épée" } }] }] };
  assert.deepEqual(keepCatalogFields(summary, previous).containers[0].slots[0].item.recycle, sword.recycle);
});
