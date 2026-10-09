import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const decks = await vite.ssrLoadModule("/lib/class-decks.ts");

// Les colonnes de l'onglet « Cartes » existant : Carte, Nom, Effet, Icone, Classe.
const sheetRows = [
  { "Carte": "1", "Nom": "L'Ermite (Carreau)", "Effet": "Invisible trois tours.", "Icone": "", "Classe": "Cartomancien·ne" },
  { "Carte": "2", "Nom": "La force (Coeur)", "Effet": "Lancez un 1d6 :\n1 - Immobilisé", "Icone": "♥", "Classe": "Cartomancien·ne" },
  { "Carte": "3", "Nom": "Autre classe", "Effet": "", "Icone": "", "Classe": "Barde" },
  { "Carte": "", "Nom": "Sans numéro", "Effet": "", "Icone": "", "Classe": "Cartomancien·ne" },
];

test("Les cartes de l'onglet Cartes existant se relisent, par classe", () => {
  const cards = sheetRows.flatMap((row) => decks.cardFromCells((header) => row[header] ?? "") ?? []);
  assert.equal(cards.length, 3);
  const mine = decks.cardsOfClass(cards, "cartomancien·ne");
  assert.deepEqual(mine.map((card) => card.number), ["1", "2"]);
  assert.equal(mine[1].effect, "Lancez un 1d6 :<br>1 - Immobilisé");
  assert.deepEqual(decks.cardCells(mine[0]), { "Carte": "1", "Nom": "L'Ermite (Carreau)", "Effet": "Invisible trois tours.", "Icone": "", "Classe": "Cartomancien·ne", "Couleur": "", "Illustration": "" });
  // Deux images : l'icône du coin (« Icone ») et l'illustration du centre (« Illustration »).
  const drawn = decks.cardFromCells((header) => ({ Carte: "4", Nom: "La mort", Icone: "spade", Illustration: "https://exemple.fr/mort.png" })[header] ?? "");
  assert.deepEqual([drawn.icon, drawn.illustration], ["spade", "https://exemple.fr/mort.png"]);
  assert.equal(decks.cardCells(drawn)["Illustration"], "https://exemple.fr/mort.png");
  // La colonne « Couleur » : une couleur propre à la carte, sinon celle du deck (vide).
  const colored = decks.cardFromCells((header) => ({ Carte: "2", Nom: "La force (Coeur)", Couleur: "#b9504e" })[header] ?? "");
  assert.equal(colored.color, "#b9504e");
  assert.equal(decks.cardCells(colored)["Couleur"], "#b9504e");
  assert.equal(decks.cardFromCells((header) => ({ Carte: "3", Nom: "X", Couleur: "rouge" })[header] ?? "").color, "");
  assert.equal(decks.cardKey("Cartomancien·ne", " 2 "), decks.cardKey("cartomancien·ne", "2"));
});

test("Un deck reçu de l'éditeur : réglages sûrs, numéros donnés aux nouvelles cartes", () => {
  let counter = 0;
  const result = decks.sanitizeDeck({ deck: { classId: "CLA-9", className: "Cartomancien·ne", name: "Tarot", handLimit: 5, drawMode: "choix", placement: "bandeau" }, cards: [{ number: "1", name: "L'Ermite" }, { number: "", name: "Nouvelle" }, { number: "1", name: "Doublon" }, { name: "  " }] }, () => `X${(counter += 1)}YZW`);
  assert.match(result.deck.id, /^DCK-/);
  assert.deepEqual([result.deck.handLimit, result.deck.drawMode, result.deck.placement], [5, "choix", "bandeau"]);
  // Tirage « au hasard ou au choix » : gardé par l'éditeur, écrit et relu dans la feuille.
  const both = decks.sanitizeDeck({ deck: { classId: "CLA-9", className: "C", drawMode: "les-deux" }, cards: [] }, () => "BOTH1");
  assert.equal(both.deck.drawMode, "les-deux");
  assert.equal(decks.deckCells(both.deck)["Tirage"], "Au hasard ou au choix");
  const tirage = (text) => decks.deckFromCells((header) => ({ ID: "DCK-1", Nom: "Tarot", Tirage: text })[header] ?? "").drawMode;
  assert.deepEqual(["Au hasard ou au choix", "les deux", "Hasard / choix", "Au choix", "choix", "Au hasard", ""].map(tirage), ["les-deux", "les-deux", "les-deux", "choix", "choix", "hasard", "hasard"]);
  assert.equal(decks.sanitizeDeck({ deck: { classId: "CLA-9", className: "C", drawMode: "n'importe" }, cards: [] }, () => "X1").deck.drawMode, "hasard");
  assert.deepEqual(result.cards.map((card) => [card.number, card.name]), [["1", "L'Ermite"], ["2", "Nouvelle"], ["3", "Doublon"]]);
  assert.equal(decks.sanitizeDeck({ deck: { className: "X" } }, () => "A"), null);
  const cells = decks.deckCells(result.deck);
  assert.equal(cells["Tirage"], "Au choix");
  assert.deepEqual(decks.deckFromCells((header) => cells[header]), result.deck);
});

test("Pioche, main, défausse, retirées : déplacer, piocher au hasard, tout remettre", () => {
  const cards = ["1", "2", "3", "4"].map((number) => ({ number, name: `Carte ${number}`, effect: "", icon: "", className: "C" }));
  let state = { hand: [], discard: [], removed: [] };
  assert.equal(decks.deckPiles(cards, state).draw.length, 4);
  const drawn = decks.randomCard(decks.deckPiles(cards, state).draw, () => 0.6);
  assert.equal(drawn.number, "3");
  state = decks.moveCard(state, "3", "hand");
  state = decks.moveCard(state, "1", "hand");
  state = decks.moveCard(state, "3", "discard");
  state = decks.moveCard(state, "2", "removed");
  const piles = decks.deckPiles(cards, state);
  assert.deepEqual([piles.draw, piles.hand, piles.discard, piles.removed].map((pile) => pile.map((card) => card.number)), [["4"], ["1"], ["3"], ["2"]]);
  // Une carte disparue du deck est oubliée ; une nouvelle arrive dans la pioche.
  const fewer = decks.deckPiles(cards.filter((card) => card.number !== "3").concat({ number: "5", name: "Nouvelle", effect: "", icon: "", className: "C" }), state);
  assert.deepEqual(fewer.discard, []);
  assert.deepEqual(fewer.draw.map((card) => card.number), ["4", "5"]);
  // Rangé dans la case des sorts choisis, sans rien effacer d'autre.
  const json = decks.withDeckState(JSON.stringify({ choices: { a: 1 }, specifics: { "JAU-1": { current: 2 } } }), "DCK-1", state);
  assert.deepEqual(decks.deckStatesOf(json)["DCK-1"], state);
  assert.deepEqual(JSON.parse(json).specifics["JAU-1"], { current: 2 });
  assert.equal("DCK-1" in JSON.parse(decks.withDeckState(json, "DCK-1", { hand: [], discard: [], removed: [] })).specifics, false);
  assert.equal(decks.randomCard([]), null);
});
