import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const rarity = await vite.ssrLoadModule("/lib/rarity-places.ts");
const sections = await vite.ssrLoadModule("/lib/index-sections.ts");
const richText = await vite.ssrLoadModule("/lib/google-sheet-rich-text.ts");
const columns = await vite.ssrLoadModule("/lib/index-columns.ts");

test("Rareté et emplacements : une ligne par rareté, ses lieux séparés par « - »", () => {
  const cell = "Commun : Armurerie - Marché noir\nTrès rare : Bateau - Ville - Forêt noire";
  assert.deepEqual(rarity.parseRarityPlaces(cell), [
    { rarity: "Commun", places: ["Armurerie", "Marché noir"] },
    { rarity: "Très rare", places: ["Bateau", "Ville", "Forêt noire"] },
  ]);
  assert.equal(rarity.formatRarityPlaces(rarity.parseRarityPlaces(cell)), cell, "aller-retour exact");
  // La même rareté écrite deux fois réunit ses lieux ; une rareté seule (sans lieu) se garde.
  assert.deepEqual(rarity.parseRarityPlaces("Rare : Forêt\nrare : Ville, Forêt\nUltime"), [{ rarity: "Rare", places: ["Forêt", "Ville"] }, { rarity: "Ultime", places: [] }]);
  // Une case passée par le texte enrichi (retours en <br>) se relit pareil.
  assert.deepEqual(rarity.parseRarityPlaces("Commun : Forêt<br>Rare : Ville"), [{ rarity: "Commun", places: ["Forêt"] }, { rarity: "Rare", places: ["Ville"] }]);
  assert.deepEqual(rarity.rarityPlacePairs(cell).map((pair) => `${pair.rarity}/${pair.place}`), ["Commun/Armurerie", "Commun/Marché noir", "Très rare/Bateau", "Très rare/Ville", "Très rare/Forêt noire"]);
  assert.deepEqual(rarity.raritiesOf(cell), ["Commun", "Très rare"]);
  assert.deepEqual(rarity.placesIn("Commun : Forêt - Ville\nRare : forêt"), ["Forêt", "Ville"]);
  assert.equal(rarity.formatRarityPlaces([{ rarity: "Rare", places: [] }, { rarity: "", places: [] }]), "Rare");
});

test("Rareté et emplacements : les raretés reconnues comme celles des magasins et de la fouille", () => {
  assert.equal(rarity.rarityKeyOf("Très commun"), "very-common");
  assert.equal(rarity.rarityKeyOf("Peu commun"), "common");
  assert.equal(rarity.rarityKeyOf("Utltime"), "ultimate");
  assert.equal(rarity.rarityKeyOf("Légendaire"), "ultimate");
  assert.equal(rarity.rarityKeyOf("très rare"), "very-rare");
  assert.equal(rarity.rarityKeyOf("Forêt"), null);
});

test("Rareté et emplacements : reprise des anciennes colonnes, lieux réécrits sous leur nom de l'Index des lieux", () => {
  const resolve = rarity.placeResolver([{ name: "Armurerie", aliases: ["Armurier", "Armurerie"] }, { name: "Marché", aliases: ["Marché", "Marché ordinaire"] }, { name: "Forêt" }]);
  const entries = rarity.entriesFromLegacy([{ rarity: "Commun", place: "Armurier - Marché noir" }, { rarity: "Très rare", place: "Bateau - Ville - Maison - Donjon - Corps - Forêt noire" }], resolve);
  assert.equal(rarity.formatRarityPlaces(entries), "Commun : Armurerie - Marché noir\nTrès rare : Bateau - Ville - Maison - Donjon - Corps - Forêt noire");
  // Les deux paires à la même rareté : une seule ligne ; une paire incomplète est sautée.
  assert.equal(rarity.formatRarityPlaces(rarity.entriesFromLegacy([{ rarity: "Rare", place: "Marché ordinaire" }, { rarity: "rare", place: "forêt" }, { rarity: "", place: "Ville" }, { rarity: "Ultime", place: "" }], resolve)), "Rare : Marché - Forêt");
  assert.equal(rarity.isRarityPlacesHeader("Rareté et emplacements"), true);
  assert.equal(rarity.isRarityPlacesHeader("Rareté/emplacement"), true);
  assert.equal(rarity.isRarityPlacesHeader("Rareté principale"), false);
});

test("Sections : « ## Titre » puis le texte, aller-retour par le texte enrichi de Sheets compris", () => {
  const parts = [{ title: "Tome 1", html: "Le <strong>début</strong> de l’histoire" }, { title: "Tome 2", html: "La suite<br>sur deux lignes" }];
  const cell = sections.formatSections(parts);
  assert.deepEqual(sections.parseSections(cell), parts);
  // Écrite dans Sheets puis relue : le texte et ses gras reviennent, les parties aussi.
  const sheet = richText.htmlToRichText(cell);
  assert.equal(sheet.text, "## Tome 1\nLe début de l’histoire\n## Tome 2\nLa suite\nsur deux lignes");
  const back = richText.richTextHtml(sheet.text, sheet.runs);
  assert.deepEqual(sections.parseSections(back).map((part) => part.title), ["Tome 1", "Tome 2"]);
  assert.match(sections.parseSections(back)[0].html, /<(b|strong)>début<\/(b|strong)>|font-weight:bold[^>]*>début/);
  // Écrit à la main dans la feuille, sans gras ; un texte avant le premier titre ; un titre <h3> collé.
  assert.deepEqual(sections.parseSections("Intro\n## Histoire\nLongue\n## Culture").map((part) => part.title), ["", "Histoire", "Culture"]);
  assert.deepEqual(sections.parseSections("<h3>Géographie</h3><p>Des monts</p>"), [{ title: "Géographie", html: "Des monts" }]);
  assert.deepEqual(sections.sectionTitles("Intro\n## Histoire\nLongue"), ["Introduction", "Histoire"]);
  assert.equal(sections.sectionsPlainText(cell), "Tome 1\nLe début de l’histoire\nTome 2\nLa suite\nsur deux lignes");
  assert.equal(sections.formatSections([{ title: "", html: "" }, { title: "", html: "<p></p>" }]), "");
  assert.equal(columns.isRichSpec({ kind: "sections" }), true);
});
