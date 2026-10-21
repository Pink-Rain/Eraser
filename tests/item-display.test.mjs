import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const display = await vite.ssrLoadModule("/lib/item-display.ts");

const columnsOf = (place) => display.itemPlaceDisplay({}, place).fields.map((field) => `${field.zone}:${field.column}`);

test("sans réglage, chaque endroit garde l'affichage d'avant", () => {
  const traits = ["Attributs", "Matériaux", "Runes", "Compétence", "Distance", "Action", "Action de rechargement"].map((column) => `effect:${column}`);
  assert.deepEqual(columnsOf("inventory"), ["under:Type", "under:Sous-type", "description:Description", "effect:Effet", ...traits]);
  assert.deepEqual(columnsOf("shop"), ["under:Type", "under:Sous-type", "description:Description", "effect:Effet", ...traits]);
  // La fouille écrit aussi le prix sous le nom.
  assert.deepEqual(columnsOf("search"), ["under:Type", "under:Sous-type", "under:Prix", "description:Description", "effect:Effet", ...traits]);
  // L'effet : « Effet : … » dans l'inventaire et la fouille, sous son titre dans le magasin.
  assert.equal(display.itemFieldStyle(display.itemPlaceDisplay({}, "inventory").fields[3]), "label");
  assert.equal(display.itemFieldStyle(display.itemPlaceDisplay({}, "shop").fields[3]), "text");
  for (const place of ["inventory", "shop", "search"]) assert.equal(display.isDefaultItemPlaceDisplay(place, display.defaultItemPlaceDisplay(place)), true);
});

test("un réglage se relit nettoyé, rangé zone par zone, sans doublon", () => {
  const parsed = display.parseItemPlaceDisplay({
    fields: [
      { column: "Notes MJ", zone: "effect", style: "text", audience: "mj" },
      { column: "Poids", zone: "under", style: "value", audience: "all" },
      { column: "poids", zone: "name" },
      { column: "Rareté", zone: "name", style: "inconnu", audience: "personne" },
      { column: "", zone: "under" },
      { column: "Origine", zone: "ailleurs" },
    ],
  });
  assert.deepEqual(parsed, { fields: [
    { column: "Rareté", zone: "name" },
    { column: "Poids", zone: "under" },
    { column: "Notes MJ", zone: "effect", style: "text", audience: "mj" },
  ] });
  assert.equal(display.parseItemPlaceDisplay("pas du json"), null);
  assert.deepEqual(display.parseItemDisplaySettings(JSON.stringify({ shop: parsed, ailleurs: parsed, search: { fields: "x" } })), { shop: parsed });
});

test("les colonnes qu'Eraser lit déjà se reconnaissent sous leurs autres noms", () => {
  assert.equal(display.knownItemField("Catégorie"), "type");
  assert.equal(display.knownItemField("Coût"), "price");
  assert.equal(display.knownItemField("Portée"), "distance");
  assert.equal(display.knownItemField("Poids"), null);
  assert.equal(display.sameItemColumn("Type", "categorie"), true);
  assert.equal(display.sameItemColumn("Poids", "poids"), true);
  assert.equal(display.sameItemColumn("Poids", "Masse"), false);
  assert.equal(display.isFixedItemColumn("Icône"), true);
  assert.equal(display.isFixedItemColumn("Nom de l’objet"), true);
});

test("chacun ne reçoit que ce qu'il voit, et jamais l'effet d'un magasin s'il est joueur", () => {
  const settings = {
    shop: { fields: [{ column: "Poids", zone: "under" }, { column: "Enchantement", zone: "effect" }, { column: "Effet", zone: "effect", style: "text" }] },
    inventory: { fields: [{ column: "Notes MJ", zone: "description", audience: "mj" }, { column: "Indice", zone: "description", audience: "players" }] },
  };
  const players = display.itemDisplayForViewer(settings, "players");
  const mj = display.itemDisplayForViewer(settings, "mj");
  assert.deepEqual(players.shop.fields.map((field) => field.column), ["Poids"]);
  assert.deepEqual(mj.shop.fields.map((field) => field.column), ["Poids", "Enchantement", "Effet"]);
  assert.deepEqual(players.inventory.fields.map((field) => field.column), ["Indice"]);
  assert.deepEqual(mj.inventory.fields.map((field) => field.column), ["Notes MJ"]);
  // La fouille non réglée : l'affichage d'Eraser.
  assert.equal(players.search.fields.length, display.defaultItemPlaceDisplay("search").fields.length);
  // Les valeurs envoyées : les colonnes qu'Eraser ne lit pas déjà dans l'item, et que le lecteur voit.
  assert.deepEqual(display.itemExtraColumns(players), ["Indice", "Poids"]);
  assert.deepEqual(display.itemExtraColumns(mj), ["Notes MJ", "Poids", "Enchantement"]);
});

test("une colonne renommée est suivie partout où elle est placée", () => {
  const settings = { inventory: { fields: [{ column: "Poids", zone: "under" }] }, search: { fields: [{ column: "Poids", zone: "name" }, { column: "Effet", zone: "effect" }] } };
  const renamed = display.renameItemDisplayColumns(settings, [{ from: "poids", to: "Masse" }]);
  assert.deepEqual(renamed.inventory.fields, [{ column: "Masse", zone: "under" }]);
  assert.deepEqual(renamed.search.fields.map((field) => field.column), ["Masse", "Effet"]);
  assert.equal(display.renameItemDisplayColumns(settings, [{ from: "Origine", to: "Provenance" }]), null);
});

test("une case en liste se coupe en valeurs", () => {
  assert.deepEqual(display.itemListValues("Lame, Contact | Feu;  <b>Glace</b>"), ["Lame", "Contact", "Feu", "Glace"]);
});
