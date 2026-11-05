import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const search = await vite.ssrLoadModule("/lib/choice-search.ts");

const options = ["Bois", "Épée", "Épée longue", "Fer", "Forteresse du Nord", "Grande épée", "Marché", "Rouge dragon"].map((value) => ({ value }));
const names = (query) => search.searchChoices(options, query).map((hit) => hit.option.value);

test("ce qu'on commence à taper propose les noms qui commencent ainsi d'abord", () => {
  assert.deepEqual(names("epe"), ["Épée", "Épée longue", "Grande épée"]);
  assert.equal(names("")[0], "Bois");
  assert.equal(names("").length, options.length);
});

test("le nom exact passe devant, accents et casse ignorés", () => {
  const hits = search.searchChoices(options, "EPEE");
  assert.equal(hits[0].option.value, "Épée");
  assert.equal(hits[0].rank, 0);
});

test("les mots tapés dans le désordre trouvent le nom", () => {
  assert.deepEqual(names("dragon rou"), ["Rouge dragon"]);
});

test("une faute de frappe propose quand même le bon nom, marqué proche", () => {
  const hits = search.searchChoices(options, "Fortresse");
  assert.equal(hits[0].option.value, "Forteresse du Nord");
  assert.equal(hits[0].close, true);
  assert.equal(search.searchChoices(options, "Marhcé")[0].option.value, "Marché");
});

test("un mot trop court n'accepte aucune faute (pas de bruit)", () => {
  assert.deepEqual(names("Fez"), []);
  assert.equal(search.typoTolerance(3), 0);
  assert.equal(search.typoTolerance(5), 1);
  assert.equal(search.typoTolerance(9), 2);
});

test("la distance compte une inversion de lettres comme une seule faute", () => {
  assert.equal(search.spellingDistance("marhce", "marche", 2), 1);
  assert.equal(search.spellingDistance("abc", "abc", 1), 0);
  assert.ok(search.spellingDistance("bois", "forteresse", 2) > 2);
});

test("les autres écritures d'un nom le trouvent aussi", () => {
  const hits = search.searchChoices([{ value: "Marché", aliases: ["Marché ordinaire"] }], "ordinaire");
  assert.equal(hits[0].option.value, "Marché");
});

test("plusieurs noms collés d'un coup se séparent sans doublon", () => {
  assert.deepEqual(search.splitTypedNames("Fer, Épée ; bois\nFER,  "), ["Fer", "Épée", "bois"]);
});
