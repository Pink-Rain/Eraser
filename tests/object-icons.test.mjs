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

test("remplace les anciennes icônes générées mais garde celles choisies à la main", () => {
  assert.equal(icons.resolvedObjectIcon("🏹", "Arbalète", "Arme à distance", "Arbalète"), "eraser:armes/arbalete");
  assert.equal(icons.resolvedObjectIcon("", "Bombe", "Consommable", "Autre"), "eraser:divers/bombe");
  assert.equal(icons.resolvedObjectIcon("🐉", "Arbalète", "Arme à distance", "Arbalète"), "🐉");
  assert.equal(icons.resolvedObjectIcon("eraser:divers/bombe", "Arbalète", "Arme à distance", "Arbalète"), "eraser:divers/bombe");
  assert.equal(icons.objectIconSource("eraser:armes/katana"), "/icones/objets/armes/katana.webp");
  assert.equal(icons.objectIconSource("🐉"), "");
});

test("chaque icône possède son image", async () => {
  assert.equal(icons.OBJECT_ICON_KEYS.size, 131);
  for (const key of icons.OBJECT_ICON_KEYS) await access(new URL(`../public/icones/objets/${key}.webp`, import.meta.url));
});
