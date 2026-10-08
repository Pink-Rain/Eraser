import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const bonuses = await vite.ssrLoadModule("/lib/rank-bonuses.ts");
const catalog = await vite.ssrLoadModule("/lib/character-catalog.ts");
const sheetMap = await vite.ssrLoadModule("/lib/character-sheet-map.ts");
const schema = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
const modifiers = await vite.ssrLoadModule("/lib/item-modifiers.ts");
const progression = await vite.ssrLoadModule("/components/eraser/class-progression.tsx");
const dialog = await vite.ssrLoadModule("/components/eraser/spell-choice-dialog.tsx");

const headers = bonuses.RANK_BONUS_HEADERS;
const row = (rank, cells = {}) => headers.map((header, index) => index === 0 ? `Rang ${rank}` : cells[header] ?? "");

test("Bonus de rang : les colonnes au rôle fixe sont lues, les rangs dépassent 20", () => {
  const { bonuses: list, rows } = bonuses.parseRankBonusRows([
    [...headers, "Note MJ"],
    row(1, { "Cible 1": "Rapidité", "Valeur 1": "+5" }),
    row(2, { "Cible 1": "Force", "Valeur 1": "2", "Cible 3": "Caractéristique", "Valeur 3": "10", "Choix": "1", "Sort sur mesure": "Oui", "Autre": "Un familier" }),
    [...row(25, { "Cible 2": "Déplacement", "Valeur 2": "-1,5" }), "secret"],
    row(3),
    ["Pas un rang"],
  ]);
  assert.deepEqual(list.map((bonus) => bonus.rank), [1, 2, 3, 25]);
  assert.deepEqual(list[0].bonuses, [{ target: "Rapidité", value: "+5", amount: 5, slot: 1 }]);
  assert.equal(list[0].choose, 0);
  assert.equal(list[1].choose, 1);
  assert.equal(list[1].customSpell, true);
  assert.equal(list[1].other, "Un familier");
  assert.deepEqual(list[1].bonuses.map((entry) => entry.slot), [1, 3]);
  assert.equal(list[3].bonuses[0].amount, -1.5);
  assert.deepEqual(list[3].entries, [{ label: "Note MJ", value: "secret" }]);
  assert.equal(bonuses.rankBonusHasContent(list[2]), false);
  assert.equal(rows.find((item) => item.rank === 2).values[headers.indexOf("Choix")], "1");
  // « Choix » égal (ou supérieur) au nombre de bonus : il les a tous.
  const all = bonuses.parseRankBonusRows([headers, row(4, { "Cible 1": "Force", "Valeur 1": "1", "Choix": "3" })]).bonuses[0];
  assert.equal(all.choose, 0);
  assert.equal(bonuses.rankBonusPickCount(all), 1);
});

test("Déplacement : un nouveau type de caractéristique, avec ses colonnes écrites par Eraser", () => {
  assert.equal(catalog.characteristicKindOf("Déplacement"), "deplacement");
  assert.equal(catalog.characteristicKindOf("Caractéristique de déplacement"), "deplacement");
  assert.equal(catalog.characteristicKindOf("Secondaire"), "secondaire");
  assert.equal(catalog.characteristicKindOf(""), "principale");
  const movement = catalog.builtinCharacterCatalog.characteristics.filter((item) => item.kind === "deplacement");
  assert.deepEqual(movement.map((item) => catalog.movementRole(item)), ["gratuite", "mineure", "majeure"]);
  // Les lignes de départ de l'index les portent sous le type « Déplacement ».
  const seeds = catalog.catalogSeedRows()[catalog.CHARACTERISTICS_TAB].filter((item) => item.Type === catalog.MOVEMENT_LABEL);
  assert.equal(seeds.length, 3);
  // Une ligne de l'index de ce type est relue comme telle ; une colonne simple dans la feuille.
  const read = catalog.catalogFromTables({ headers: ["Nom", "Type", "Clé de fiche"], rows: [["Course", "Déplacement", "CAR-ABCD1234"]] }, null);
  assert.equal(read.characteristics[0].kind, "deplacement");
  assert.deepEqual(catalog.catalogColumns(read).map((column) => column.header), ["Course [CAR-ABCD1234]"]);
  // Les colonnes d'origine du déplacement, ajoutées à droite, sont écrites par Eraser.
  const map = sheetMap.characterSheetMap([...schema.characterSheetHeaders, catalog.MOVEMENT_FREE_KEY, "Colonne à la main"]);
  const free = map.layout.index(catalog.MOVEMENT_FREE_KEY);
  assert.equal(map.writable[free], true);
  assert.equal(map.writable[map.layout.headers.indexOf("Colonne à la main")], false);
  // Les objets et les états peuvent viser le déplacement (le « Mod. » de la fiche).
  const targets = modifiers.buildItemModifierTargets(catalog.builtinCharacterCatalog, map.layout);
  const target = targets.find((item) => item.id === `carac:${catalog.MOVEMENT_FREE_KEY}`);
  assert.equal(target.valueIndex, free);
  assert.equal(modifiers.modifierTargetIdForName(catalog.builtinCharacterCatalog, "Action de déplacement majeure"), `carac:${catalog.MOVEMENT_MAJOR_KEY}`);
});

test("Passage de rang : les bonus ne sont proposés qu'aux rangs atteints après leur arrivée, une seule fois", () => {
  const list = bonuses.parseRankBonusRows([headers, row(1, { "Cible 1": "Rapidité", "Valeur 1": "5" }), row(2, { "Autre": "Un titre" }), row(21, { "Cible 1": "Force", "Valeur 1": "1" })]).bonuses;
  const classes = [{ id: "CLA-1", name: "Guerrier", accentDark: "#123456", accentLight: "#abcdef" }];
  const spells = [{ id: "S1", classRanks: { "CLA-1": 2 } }, { id: "S2", classRanks: { "CLA-1": 2 } }];
  // Un personnage d'avant les bonus de rang : rien n'est reproposé.
  assert.deepEqual(progression.pendingRankBonuses(list, 21, ""), []);
  // Il passe du niveau 1 au niveau 2 : seul le rang 2 donne ses bonus, avec son sort.
  let value = progression.startRankBonuses("", 1);
  assert.equal(progression.startRankBonuses(value, 5), value);
  let steps = progression.pendingRankSteps(classes, spells, 2, value, list);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].rank, 2);
  assert.equal(steps[0].choice.options.length, 2);
  assert.equal(steps[0].bonus.other, "Un titre");
  // Le rang 21 (au-delà des sorts) n'a que ses bonus.
  steps = progression.pendingRankSteps(classes, spells, 21, value, list);
  assert.deepEqual(steps.map((step) => [step.rank, Boolean(step.choice), Boolean(step.bonus)]), [[2, true, true], [21, false, true]]);
  // Obtenus : plus jamais proposés ; le sort sur mesure rejoint la fiche.
  value = progression.takeRankBonus(value, 21, { applied: [{ target: "Force", amount: 1 }], spell: "S9" });
  const state = progression.parseClassChoices(value);
  assert.deepEqual(state.extras, ["S9"]);
  assert.deepEqual(state.rankBonuses.taken["21"].applied, [{ target: "Force", amount: 1 }]);
  assert.deepEqual(progression.pendingRankSteps(classes, spells, 21, value, list).map((step) => step.rank), [2]);
  // Les autres réglages de la fiche survivent.
  const kept = progression.parseClassChoices(progression.takeRankBonus(JSON.stringify({ states: [{ id: "ETA-1", name: "Peur", level: 1 }], rankBonuses: { from: 3, taken: {} } }), 4, { applied: [] }));
  assert.equal(kept.states.length, 1);
  assert.equal(kept.rankBonuses.from, 3);
});

test("Passage de rang : il reste à choisir, répartir et chercher avant d'obtenir les bonus", () => {
  const [bonus] = bonuses.parseRankBonusRows([headers, row(3, { "Cible 1": "Force", "Valeur 1": "2", "Cible 2": "Caractéristique", "Valeur 2": "10", "Choix": "1", "Sort sur mesure": "TRUE" })]).bonuses;
  const empty = { slots: [], spread: {}, spell: null };
  assert.equal(dialog.rankBonusMissing(bonus, empty).length, 2);
  const spreading = { slots: [2], spread: { 2: { Force: 4, Charisme: 3 } }, spell: null };
  assert.deepEqual(dialog.rankBonusMissing(bonus, spreading), ["répartir 3 points de caractéristique", "choisir le sort sur mesure"]);
  assert.deepEqual(dialog.rankBonusMissing(bonus, { slots: [2], spread: { 2: { Force: 4, Charisme: 6 } }, spell: { id: "S1" } }), []);
  assert.deepEqual(dialog.rankBonusMissing(undefined, empty), []);
});
