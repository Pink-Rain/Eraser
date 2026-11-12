import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Ce qu'un exemplaire de l'inventaire porte en propre (lib/item-instance.ts) : sa réserve
// (portions, doses), ce qu'il donne en plus au recyclage, les lignes de son effet. Le modèle pur,
// puis le vrai lib/google-sheets.ts sur un Google Sheets en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-instance-"));
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
    { find: /^@\/lib\/shared-store$/, replacement: `${root}tests/fakes/shared-store.ts` },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const instance = await vite.ssrLoadModule("/lib/item-instance.ts");
const links = await vite.ssrLoadModule("/lib/item-modifiers.ts");
const documents = await vite.ssrLoadModule("/lib/document-model.ts");
const satiety = await vite.ssrLoadModule("/lib/satiety.ts");

test("la réserve d'un exemplaire : validée strictement, consommée une unité à la fois", () => {
  const { itemReserveInput, parseItemReserve, withItemReserve, consumeItemReserve, itemReserveLabel, itemReserveAfter } = instance;
  assert.equal(itemReserveInput(undefined), undefined);
  assert.deepEqual(itemReserveInput({ count: 3, total: 3, unit: "portion", nutrition: 4 }), { count: 3, total: 3, unit: "portion", nutrition: 4 });
  assert.deepEqual(itemReserveInput({ count: 1, total: 2, unit: "dose" }), { count: 1, total: 2, unit: "dose" });
  assert.deepEqual(itemReserveInput({ count: 1, total: 1, unit: "portion", nutrition: 0 }), { count: 1, total: 1, unit: "portion" });
  for (const bad of [{ count: 0, total: 3, unit: "portion" }, { count: 4, total: 3, unit: "portion" }, { count: 1, total: 100, unit: "dose" }, { count: 1.5, total: 2, unit: "dose" }, { count: "1", total: 2, unit: "dose" }, { count: 1, total: 2, unit: "bol" }, { count: 1, total: 2, unit: "portion", nutrition: -1 }, { count: 1, total: 2, unit: "portion", nutrition: 100 }, [1, 2], "3/3"]) {
    assert.equal(itemReserveInput(bad), null, JSON.stringify(bad));
  }

  // Rangée avec les liens d'un exemplaire, sans les déranger.
  const raw = withItemReserve(links.serializeItemLinks([{ target: "comp:Tir", value: "+2" }], []), { count: 2, total: 3, unit: "portion", nutrition: 4 });
  assert.deepEqual(parseItemReserve(raw), { count: 2, total: 3, unit: "portion", nutrition: 4 });
  assert.deepEqual(links.parseItemModifiers(raw), [{ target: "comp:Tir", value: "+2" }], "les liens ignorent la réserve");
  assert.deepEqual(links.parseItemAttachments(raw), []);
  assert.deepEqual(links.parseItemOverrides(raw), {});
  assert.equal(itemReserveLabel(parseItemReserve(raw)), "2 / 3 portions");
  assert.equal(itemReserveLabel({ count: 1, total: 1, unit: "dose" }), "1 / 1 dose");
  assert.deepEqual(itemReserveAfter(parseItemReserve(raw), 5), { count: 0, total: 3, unit: "portion", nutrition: 4 });

  const once = consumeItemReserve(raw);
  assert.equal(once.emptied, false);
  assert.deepEqual(once.reserve, { count: 1, total: 3, unit: "portion", nutrition: 4 });
  assert.equal(parseItemReserve(once.modifiers).count, 1);
  // La dernière : l'exemplaire est consommé ; le JSON rendu repart plein (l'exemplaire suivant d'une pile).
  const last = consumeItemReserve(once.modifiers);
  assert.equal(last.emptied, true);
  assert.equal(last.reserve.count, 0);
  assert.equal(parseItemReserve(last.modifiers).count, 3);
  assert.equal(consumeItemReserve(""), null);
  assert.equal(consumeItemReserve(links.serializeItemLinks([{ target: "comp:Tir", value: "+2" }], [])), null);
  assert.equal(parseItemReserve('[{"target":"reserve","value":"2/3","unit":"bol"}]'), null);
  assert.equal(parseItemReserve("illisible"), null);
});

test("recyclage et lignes d'effet d'un exemplaire : validés, bornés", () => {
  const { itemRecycleInput, itemEffectSourcesInput, itemInstanceInput, requestedItemInstance, serializeItemInstance, parseItemRecycleNames, parseItemEffectSources } = instance;
  assert.deepEqual(itemRecycleInput(["Bocal", " bocal ", "Fiole"]), ["Bocal", "Fiole"]);
  for (const bad of [[], Array.from({ length: 11 }, (_, index) => `Item ${index}`), [""], [3], "Bocal", ["x".repeat(161)]]) assert.equal(itemRecycleInput(bad), null, JSON.stringify(bad).slice(0, 40));
  assert.deepEqual(itemEffectSourcesInput([]), []);
  assert.deepEqual(itemEffectSourcesInput([{ source: "Pomme", text: "+1 Vie", type: "ignoré" }]), [{ source: "Pomme", text: "+1 Vie" }]);
  for (const bad of [[{ source: "Pomme", text: "x".repeat(301) }], [{ source: "", text: "a" }], [{ source: "Pomme" }], Array.from({ length: 31 }, () => ({ source: "a", text: "b" })), [null], {}]) {
    assert.equal(itemEffectSourcesInput(bad), null, JSON.stringify(bad).slice(0, 40));
  }
  // Une requête sans rien de tout cela reste celle d'avant.
  assert.deepEqual(itemInstanceInput({ name: "Pain" }), {});
  assert.equal(requestedItemInstance({ name: "Pain" }), undefined);
  assert.throws(() => requestedItemInstance({ reserve: { count: 9, total: 3, unit: "portion" } }), /INVALID_INVENTORY_INSTANCE/);
  const input = requestedItemInstance({ reserve: { count: 3, total: 3, unit: "portion", nutrition: 2 }, recycle: ["Bocal"], effectSources: [{ source: "Pomme", text: "+1 Vie" }] });
  const raw = serializeItemInstance({ ...input, effectSources: [{ ...input.effectSources[0], type: "Ingrédient" }] });
  assert.deepEqual(parseItemRecycleNames(raw), ["Bocal"]);
  assert.deepEqual(parseItemEffectSources(raw), [{ source: "Pomme", text: "+1 Vie", type: "Ingrédient" }]);
  assert.equal(serializeItemInstance({}), "");
});

test("ce que l'exemplaire porte en propre survit à chaque réécriture de son JSON", () => {
  const own = instance.serializeItemInstance({ reserve: { count: 2, total: 3, unit: "dose" }, recycle: ["Fiole"], effectSources: [{ source: "Menthe", text: "Souffle frais", type: "Ingrédient" }] });
  const marked = instance.withKeptItemEntries(documents.documentItemModifiers("CAMP-1", "doc-1"), own);
  const check = (raw, label) => {
    assert.deepEqual(instance.parseItemReserve(raw), { count: 2, total: 3, unit: "dose" }, label);
    assert.deepEqual(instance.parseItemRecycleNames(raw), ["Fiole"], label);
    assert.equal(instance.parseItemEffectSources(raw).length, 1, label);
    assert.deepEqual(documents.documentOfItem(raw), { campaignId: "CAMP-1", documentId: "doc-1" }, label);
  };
  check(marked, "réunis");
  // L'enclume renvoie ses liens seuls : le reste est repris de l'exemplaire.
  const anvil = links.keepItemCharges(links.serializeItemLinks([{ target: "comp:Tir", value: "+1" }], [], { runes: "Lame de feu" }), marked);
  check(anvil, "enclume");
  assert.deepEqual(links.parseItemModifiers(anvil), [{ target: "comp:Tir", value: "+1" }]);
  // Une charge dépensée.
  const spent = links.withItemCharge(anvil, "rune", "Lame de feu", 0);
  check(spent, "charge");
  assert.equal(links.parseItemCharges(spent)["rune:lame de feu"], 0);
  // Une réserve déjà dans les nouveaux liens l'emporte sur l'ancienne.
  const replaced = instance.withKeptItemEntries(instance.withItemReserve("", { count: 1, total: 3, unit: "dose" }), marked);
  assert.equal(instance.parseItemReserve(replaced).count, 1);
  assert.equal(instance.withKeptItemEntries("", ""), "");
});

test("une portion rend sa Nutrition à la barre de rassasiement, bornée", () => {
  const at = "2026-11-12T10:00:00.000Z";
  assert.equal(satiety.applySatietyAction({ charges: 2, days: { C: 3 } }, { kind: "add", charges: 2 }, at).charges, 4);
  const full = satiety.applySatietyAction({ charges: 4, days: { C: 3 } }, { kind: "add", charges: 9 }, at);
  assert.equal(full.charges, satiety.SATIETY_MAX);
  assert.deepEqual(full.days, { C: 3 }, "les jours ne bougent pas");
});

const contentHeaders = ["ID contenant", "ID", "ID personnage", "Emplacement", "ID objet", "Nombre", "Nom personnalisé", "Description personnalisée", "Type", "Sous-type", "Effet", "Modifié le", "Équipé", "Modificateurs", "Nom mis en forme", "Description mise en forme", "Effet mis en forme"];

test("create-item, use-reserve et recyclage d'un exemplaire fabriqué, sur l'inventaire réel", async () => {
  const google = await vite.ssrLoadModule(fake);
  const drive = await vite.ssrLoadModule(driveFake);
  const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
  const jdr = await vite.ssrLoadModule("/lib/jdr-sheets.ts");
  const itemHeaders = ["ID", "Nom", "Type", "Genre", "Nombre max"];
  google.addSpreadsheet("objets-instance", [{ title: "Items", grid: [itemHeaders,
    ["IT-BOCAL", "Bocal", "Contenant", "Objet", "20"],
    ["IT-POMME", "Pomme", "Ingrédient", "Objet", "20"],
    ["IT-MENTHE", "Menthe", "Herbe", "Objet", "20"],
  ] }]);
  drive.drive.objects.push({ id: "objets-instance", name: "Index des objets" });
  google.addSpreadsheet("inventaire-instance", [
    { title: "Types de contenants", grid: [["ID", "Nom", "Catégorie", "Capacité", "Colonnes spéciales", "Actif"]] },
    { title: "Contenants personnages", grid: [["ID", "ID personnage", "ID type", "Nom personnalisé", "Catégorie", "Capacité", "Ordre", "Créé le", "Supprimé le"]] },
    { title: "Objets", grid: [["ID", "Nom", "Description", "Type", "Sous-type", "Effet", "Nombre max", "Poids", "Prix", "Encombrement", "Image", "Notes", "Lien", "Rareté", "Attributs", "Prérequis", "Édition", "Actif", "Icône"]] },
    { title: "Contenu inventaire", grid: [contentHeaders] },
  ]);
  await jdr.saveJdrSheet({ key: "inventory", spreadsheetId: "inventaire-instance", name: "inventory", tabName: "Types de contenants", webViewLink: "" });

  const owner = "PERSO-CUISINE";
  const start = await sheets.getCharacterInventory(owner);
  const bag = start.containers.find((container) => container.category === "Inventaire");
  const slotOf = (record, name) => record.containers.flatMap((container) => container.slots).find((slot) => slot.item?.name === name && slot.quantity > 0);

  // Un appel d'avant (sans réserve) reste le même.
  let current = await sheets.createCharacterInventoryItem(owner, bag.id, { name: "Caillou", description: "", type: "Objet", subtype: "", effect: "" });
  assert.equal(slotOf(current, "Caillou").modifiers, "");

  const made = instance.requestedItemInstance({ reserve: { count: 2, total: 2, unit: "portion", nutrition: 3 }, recycle: ["Bocal", "Inconnu"], effectSources: [{ source: "Pomme", text: "+1 Vie" }, { source: "Menthe", text: "Haleine fraîche" }, { source: "Mystère", text: "?" }] });
  current = await sheets.createCharacterInventoryItem(owner, bag.id, { name: "Compote", description: "Dans un bocal", type: "Plat", subtype: "", effect: "", instance: made });
  const compote = slotOf(current, "Compote");
  assert.deepEqual(instance.parseItemReserve(compote.modifiers), { count: 2, total: 2, unit: "portion", nutrition: 3 });
  // Le type de chaque source est retrouvé dans le catalogue (jamais pris de la requête).
  assert.deepEqual(instance.parseItemEffectSources(compote.modifiers).map((line) => [line.source, line.type ?? ""]), [["Pomme", "Ingrédient"], ["Menthe", "Herbe"], ["Mystère", ""]]);
  // Le recyclage propose ce que l'exemplaire porte, retrouvé dans le catalogue (un nom inconnu est écarté).
  assert.deepEqual(compote.item.recycle, [{ id: slotOf(current, "Compote").item.recycle[0].id, name: "Bocal" }]);

  // L'enclume (set-modifiers) et un déplacement gardent la réserve.
  const expected = (slot) => ({ itemId: slot.itemId, quantity: slot.quantity });
  current = await sheets.setCharacterInventoryItemModifiers(owner, compote.id, links.serializeItemLinks([{ target: "comp:Cuisine", value: "+1" }], []));
  assert.equal(instance.parseItemReserve(slotOf(current, "Compote").modifiers).count, 2);
  assert.deepEqual(links.parseItemModifiers(slotOf(current, "Compote").modifiers), [{ target: "comp:Cuisine", value: "+1" }]);
  const ground = current.containers.find((container) => container.category === "Au sol");
  current = await sheets.moveCharacterInventoryItem(owner, compote.id, ground.id, expected(slotOf(current, "Compote")));
  let moved = slotOf(current, "Compote");
  assert.equal(instance.parseItemRecycleNames(moved.modifiers)[0], "Bocal");
  assert.equal(instance.parseItemReserve(moved.modifiers).count, 2);

  // Une portion, puis la dernière : la case se vide. Un exemplaire sans réserve est refusé.
  const first = await sheets.consumeCharacterInventoryReserve(owner, moved.id, "character", expected(moved));
  assert.deepEqual(first.used, { count: 1, total: 2, unit: "portion", nutrition: 3 });
  moved = slotOf(first.inventory, "Compote");
  assert.equal(instance.parseItemReserve(moved.modifiers).count, 1);
  await assert.rejects(sheets.consumeCharacterInventoryReserve(owner, moved.id, "character", { itemId: moved.itemId, quantity: 2 }), /INVENTORY_CHANGED/);
  await assert.rejects(sheets.consumeCharacterInventoryReserve(owner, slotOf(first.inventory, "Caillou").id, "character"), /INVENTORY_NO_RESERVE/);
  const last = await sheets.consumeCharacterInventoryReserve(owner, moved.id, "character", expected(moved));
  assert.equal(last.used.count, 0);
  assert.equal(slotOf(last.inventory, "Compote"), undefined, "l'exemplaire est consommé");

  // Une pile de deux : la dernière portion du premier en retire un, le suivant repart plein.
  current = await sheets.createCharacterInventoryItem(owner, bag.id, { name: "Potion", description: "", type: "Potion", subtype: "", effect: "", instance: { reserve: { count: 1, total: 2, unit: "dose" }, recycle: ["Bocal"] } });
  let potion = slotOf(current, "Potion");
  current = await sheets.setCharacterInventoryItemQuantity(owner, potion.id, 2, "character", expected(potion));
  potion = slotOf(current, "Potion");
  const drunk = await sheets.consumeCharacterInventoryReserve(owner, potion.id, "character", expected(potion));
  potion = slotOf(drunk.inventory, "Potion");
  assert.equal(potion.quantity, 1);
  assert.deepEqual(instance.parseItemReserve(potion.modifiers), { count: 2, total: 2, unit: "dose" });

  // Un exemplaire fabriqué (sans ID d'item) se recycle en ce qu'il porte.
  const bocal = potion.item.recycle.find((product) => product.name === "Bocal");
  current = await sheets.recycleCharacterInventoryItem(owner, potion.id, 1, [{ itemId: bocal.id, quantity: 1 }], "character", expected(potion));
  assert.equal(slotOf(current, "Potion"), undefined);
  assert.equal(slotOf(current, "Bocal").quantity, 1);
});

