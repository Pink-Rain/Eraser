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

test("Magasins : une trouvaille de la colonne « Rareté et emplacements » se vend au magasin qu'elle nomme, de n'importe quel index", async () => {
  const { rerollShop } = await vite.ssrLoadModule("/components/eraser/shop-generator.tsx");
  const types = await vite.ssrLoadModule("/lib/shop-types.ts");
  const found = (id, place, extra = {}) => ({ id, name: id, description: "", effect: "", nameHtml: "", descriptionHtml: "", effectHtml: "", type: "Objet", subtype: "", price: "1 PO", icon: "", locations: [{ place, rarity: "Commun", exact: true }], ...extra });
  assert.equal(types.isShopTypePlace("Armurerie", { name: "Armurerie", key: "armory" }), true);
  assert.equal(types.isShopTypePlace("armureries", { name: "Armurerie", key: "armory" }), true);
  assert.equal(types.isShopTypePlace("Armurier", { name: "Armurerie", key: "armory" }), false, "l'ancien nom (colonne Emplacements) n'est plus lu pour la nouvelle colonne");
  const shop = { id: "s", key: "black-market", name: "Marché noir", size: "Grand", cityKey: "village", cityName: "Brume", items: [] };
  // Une créature (index « creatures ») se vend au Marché noir sans que ses « Trouvailles » la nomment.
  const catalog = [found("Dague", "Marché noir"), found("Loup", "Marché noir", { source: "creatures" }), found("Pain", "Marché")];
  const sold = rerollShop(catalog, shop).items.map((entry) => entry.id).sort();
  assert.deepEqual(sold, ["Dague", "Loup"]);
  // « Marché » ne prend pas ce qui est au « Marché noir », et inversement.
  assert.deepEqual(rerollShop(catalog, { ...shop, key: "market", name: "Marché" }).items.map((entry) => entry.id), ["Pain"]);
});

test("Événements : une rencontre tirée parmi les index de la colonne « Événement », au bon lieu et à sa rareté", async () => {
  const draws = await vite.ssrLoadModule("/lib/environment-draws.ts");
  const row = (id, source, locations) => ({ id, name: id, description: "", effect: "", nameHtml: "", descriptionHtml: "", effectHtml: "", type: "", subtype: "", price: "", icon: "", source, locations });
  const items = [
    row("creatures:LOUP", "creatures", [{ place: "Forêt", rarity: "Commun", exact: true }, { place: "Forêt", rarity: "Rare", exact: true }]),
    row("creatures:OURS", "creatures", [{ place: "Forêt noire", rarity: "Ultime", exact: true }]),
    row("Épée", undefined, [{ place: "Forêt", rarity: "Commun", exact: true }]),
    row("creatures:VIEUX", "creatures", [{ place: "Forêt - Plaine", rarity: "Très rare" }]),
  ];
  const places = ["Forêt", "Forêt noire", "Plaine"];
  const pool = draws.encounterPool(items, "Forêt", ["creatures"], places);
  assert.deepEqual(pool.map((entry) => `${entry.item.id}/${entry.rarity}`), ["creatures:LOUP/common", "creatures:LOUP/rare", "creatures:VIEUX/very-rare"], "les items (pas dans « Événement ») et la Forêt noire sont écartés ; une ancienne colonne est encore lue");
  assert.deepEqual(draws.encounterPool(items, "Forêt", [], places), [], "rien de réglé : rien à tirer");
  assert.equal(draws.drawEncounter(pool, () => 0).rarity, "common");
  assert.equal(draws.drawEncounter(pool, () => 0.999).rarity, "very-rare");
  assert.equal(draws.drawEncounter([], () => 0), null);
});

test("Statistiques : rareté seule, lieux seuls, les deux ensemble (« Rare · Forêt ») ou par paire", () => {
  const cell = "Commun : Forêt - Ville\nRare : Donjon";
  const base = "Rareté et emplacements";
  const [rarityOnly, placeOnly, both] = rarity.rarityFacetColumns(base);
  assert.equal(rarity.rarityFacetValue(cell, rarity.parseRarityFacet(rarityOnly, [base])), "Commun, Rare");
  assert.equal(rarity.rarityFacetValue(cell, rarity.parseRarityFacet(placeOnly, [base])), "Forêt, Ville, Donjon");
  assert.equal(rarity.rarityFacetValue(cell, rarity.parseRarityFacet(both, [base])), "Commun · Forêt, Commun · Ville, Rare · Donjon");
  const [rarities, places] = rarity.rarityPairGroups(base, 3);
  assert.equal(rarities.columns.length, 3);
  assert.equal(rarity.rarityFacetValue(cell, rarity.parseRarityFacet(rarities.columns[2], [base])), "Rare");
  assert.equal(rarity.rarityFacetValue(cell, rarity.parseRarityFacet(places.columns[2], [base])), "Donjon");
  assert.equal(rarity.rarityFacetValue(cell, rarity.parseRarityFacet(places.columns[1], [base])), "Ville");
  assert.equal(rarity.isRarityPairGroupId(rarities.id), true);
  assert.equal(rarity.isRarityPairGroupId("g-1"), false);
  assert.equal(rarity.parseRarityFacet("Rareté principale", [base]), null);
});

test("Statistiques : par paire, une rareté ne croise que ses propres lieux ; séparées, toutes les combinaisons", async () => {
  const stats = await vite.ssrLoadModule("/lib/index-stats.ts");
  const base = "Rareté et emplacements";
  const cells = { a: "Commun : Forêt\nRare : Donjon", b: "Commun : Donjon" };
  const facet = (column) => rarity.parseRarityFacet(column, [base]);
  const valueOf = (row, column) => facet(column) ? rarity.rarityFacetValue(cells[row], facet(column)) : cells[row];
  const groups = rarity.rarityPairGroups(base, 2);
  const crossed = (by, cols) => {
    const prepared = stats.prepareStat({ id: "s", title: "", measure: "count", by: [by], cols: [cols], form: "cross" }, ["a", "b"], { valueOf, groups });
    const out = [];
    for (const unit of prepared.units) for (const left of stats.cellParts(prepared.valueOf(unit, by))) for (const right of stats.cellParts(prepared.valueOf(unit, cols))) out.push(`${unit.row}:${left}×${right}`);
    return out.sort();
  };
  const [rarityOnly, placeOnly] = rarity.rarityFacetColumns(base);
  // Séparées : la ligne « a » croise chacune de ses raretés avec chacun de ses lieux.
  assert.deepEqual(crossed(rarityOnly, placeOnly), ["a:Commun×Donjon", "a:Commun×Forêt", "a:Rare×Donjon", "a:Rare×Forêt", "b:Commun×Donjon"]);
  // Ensemble (par paire) : Commun ne va qu'avec la Forêt, Rare qu'avec le Donjon.
  assert.deepEqual(crossed(stats.groupRef(groups[0].id), stats.groupRef(groups[1].id)), ["a:Commun×Forêt", "a:Rare×Donjon", "b:Commun×Donjon"]);
});
