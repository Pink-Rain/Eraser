import assert from "node:assert/strict";
import test, { after } from "node:test";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const icons = await vite.ssrLoadModule("/lib/object-icons.ts");

// Lignes réelles des index (nom, type, sous-type) et l'icône attendue.
const cases = [
  ["Arbalète", "Arme à distance", "Arbalète", "armes/arbalete"],
  ["Arbalète d'esclavagiste ", "Arme à distance", "Arbalète", "armes/arbalete-desclavagiste"],
  ["Arc'Säy ", "Arme Batarde ", "Arme d'escrime & Arc", "armes/arcsay"],
  ["Bague clouté", "Arme de corps à corps", "Mains nues", "armes/bague-cloutee"],
  ["Baguette  magique", "Arme magique", "Baguette magique", "armes/baguette-magique"],
  ["Baton de guerison", "Arme magique", "Baton magique", "armes/baton-de-guerison"],
  ["Baton redoutable\n", "Arme magique", "Baton magique", "armes/baton-redoutable"],
  ["Dague briseépée ", "Arme de corps à corps", "Arme de contact", "armes/dague-brise-epee"],
  ["Canon", "Arme à distance", "Autre", "armes/canon"],
  ["Goupillou", "Arme de corps à corps", "Arme lourde", "armes/goupillon"],
  ["Lance pierre", "Arme à distance", "Précision", "armes/lance-pierre"],
  ["Bouclier de lumière ou d'ombre", "Bouclier", "Secondaire", "armes/bouclier-de-lumiere-ou-dombre"],
  ["Épée des rois", "Arme de corps à corps", "Arme d'escrime", "armes/rapiere"],
  ["Amulette boussole", "Equipement léger", "Amulette", "equipement/amulette"],
  ["Gant d'escalade", "Equipement léger", "Anneau", "equipement/anneau"],
  ["Bombe de glace ", "Consommable", "Autre", "divers/bombe"],
  ["Elixirs de force", "Consommable", "Elexirs", "alchimie/elixirs"],
  ["Ragoût", "Consommable", "Nourriture", "alchimie/nourriture"],
  ["Pomme", "Ressource", "Nourriture", "ingredients/nourriture"],
  ["Corail runique", "Rune", "/", "ingredients/rune"],
  ["Sable", "Nature", "Autre", "ingredients/gisement"],
  ["Pissenlit", "Nature", "Autre", "ingredients/fleur"],
  ["Nénuphar", "Nature", "Autre", "ingredients/fleur"],
  ["Os ", "Créature", "", "ingredients/reste"],
  ["Larme de sirène", "Créature", "Base", "ingredients/base"],
  ["Champignon fumant", "Nature", "Champignon", "ingredients/champignon"],
  ["Canot", "Objet", "Transport ", "divers/transport"],
  ["Huile pour lampe", "Objet", "Consommable", "divers/consommable"],
  ["Kit maniement du bois", "Objet", "Outils", "divers/outils"],
  ["Livre des marées", "Livre", "Culture", "ecrits/livre-de-culture"],
  ["Chant des brumes", "Parchemin", "Musicaux", "ecrits/parchemin-musical"],
];

test("choisit l'icône d'après le nom des armes et le sous-type des objets", () => {
  for (const [name, type, subtype, expected] of cases) {
    assert.equal(icons.suggestedObjectIconKey(name, type, subtype), expected, `${name} (${type} / ${subtype})`);
  }
});

test("affiche ce que contient la case « Icône »", () => {
  const drive = icons.driveImageFormula("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  assert.equal(drive, '=IMAGE("https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345&sz=w256")');
  // Image du Drive posée par Eraser ou importée à la main : servie par Eraser.
  assert.equal(icons.objectIconImage(drive, "Arbalète", "Arme à distance", "Arbalète").src, "/api/items/icons/1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  assert.equal(icons.objectIconImage("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view", "Arbalète", "", "").src, "/api/items/icons/1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  // Adresse d'image quelconque, en formule ou en texte.
  assert.equal(icons.objectIconImage('=IMAGE("https://exemple.fr/dague.png")', "Dague", "", "").src, "https://exemple.fr/dague.png");
  // Case vide ou ancien émoji généré : l'icône d'Eraser.
  assert.equal(icons.objectIconImage("", "Bombe", "Consommable", "Autre").src, "/icones/objets/divers/bombe.webp");
  assert.equal(icons.objectIconImage("🏹", "Arbalète", "Arme à distance", "Arbalète").src, "/icones/objets/armes/arbalete.webp");
  // Émoji choisi à la main : gardé tel quel.
  assert.equal(icons.objectIconImage("🐉", "Arbalète", "Arme à distance", "Arbalète"), null);
  assert.equal(icons.isGeneratedObjectIcon(drive), false);
  assert.equal(icons.objectIconKeyFromDriveFileName(icons.objectIconDriveFileName("armes/katana")), "armes/katana");
});

test("chaque icône possède son image", async () => {
  assert.equal(icons.OBJECT_ICON_KEYS.size, 131);
  for (const key of icons.OBJECT_ICON_KEYS) await access(new URL(`../public/icones/objets/${key}.webp`, import.meta.url));
});

test("le serveur retrouve les images à envoyer sur le Drive", async () => {
  const assets = await vite.ssrLoadModule("/lib/object-icon-assets.ts");
  const bytes = await assets.bundledIconBytes("armes/katana");
  assert.ok(bytes.byteLength > 1000);
  assert.equal(new TextDecoder().decode(new Uint8Array(bytes).slice(8, 12)), "WEBP");
});
