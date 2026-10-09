import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const rolls = await vite.ssrLoadModule("/lib/character-creation-rolls.ts");
const schema = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
const math = await vite.ssrLoadModule("/lib/math-expression.ts");

test("les dés de création : les bonnes formules, dans leurs bornes", () => {
  assert.deepEqual(rolls.CREATION_STATS.map((stat) => [stat.label, stat.dice]), [
    ["Cap de combat", "2d10+20"], ["Cap de tir", "2d10+20"], ["Cap magique", "2d10+20"], ["Constitution", "2d10+20"],
    ["Force mentale", "2d10+20"], ["Force", "2d10+20"], ["Dextérité", "2d10+20"], ["Intelligence", "2d10+20"], ["Sagesse", "2d10+20"],
    ["Charisme", "2d10+20"], ["Vie", "2d20+70"], ["Rapidité", "1d40-20"],
  ]);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rolled = rolls.rollCreationStats(math.rollDiceExpression);
    for (const stat of rolls.CREATION_STATS.slice(0, 10)) assert.ok(rolled[stat.key].value >= 22 && rolled[stat.key].value <= 40, stat.label);
    assert.ok(rolled.vie.value >= 72 && rolled.vie.value <= 110);
    assert.ok(rolled.rapidite.value >= -19 && rolled.rapidite.value <= 20);
  }
});

test("rééquilibrage : 25 points au plus, tous replacés ; négatif quand on en retire trop", () => {
  assert.deepEqual(rolls.rebalanceSummary({}), { removed: 0, added: 0, left: 25, toPlace: 0, valid: true, problem: "" });
  const partial = rolls.rebalanceSummary({ force: -10, charisme: -5, sagesse: 8 });
  assert.equal(partial.left, 10); assert.equal(partial.toPlace, 7); assert.equal(partial.valid, false);
  assert.match(partial.problem, /7 points à placer/);
  const done = rolls.rebalanceSummary({ force: -10, charisme: -15, sagesse: 20, vie: 5 });
  assert.equal(done.left, 0); assert.equal(done.valid, true);
  const tooMuch = rolls.rebalanceSummary({ force: -20, charisme: -8, sagesse: 28 });
  assert.equal(tooMuch.left, -3); assert.equal(tooMuch.valid, false);
  assert.match(tooMuch.problem, /3 points retirés en trop/);
  const overAdded = rolls.rebalanceSummary({ sagesse: 4 });
  assert.equal(overAdded.toPlace, -4); assert.equal(overAdded.valid, false);
});

test("les valeurs écrites dans la fiche : dés + écart ; la vie remplit totale et actuelle", () => {
  const fixed = rolls.rollCreationStats((dice) => ({ total: dice === "2d20+70" ? 90 : dice === "1d40-20" ? -3 : 30, detail: dice }));
  const cells = new Map(rolls.creationStatCells(fixed, { force: -5, dexterite: 5 }));
  const at = (header) => cells.get(schema.characterValueHeaders.indexOf(header));
  assert.equal(at("Force"), "25");
  assert.equal(at("Dextérité"), "35");
  assert.equal(at("Charisme"), "30");
  assert.equal(at("Vie totale"), "90");
  assert.equal(at("Vie actuelle"), "90");
  assert.equal(at("Rapidité"), "-3");
  assert.equal(cells.size, 13);
});

test("on peut lancer une statistique à la fois", () => {
  const one = rolls.rollCreationStats(() => ({ total: 31, detail: "x" }), ["force"]);
  assert.deepEqual(Object.keys(one), ["force"]);
  assert.equal(rolls.allRolled(one), false);
  assert.equal(rolls.allRolled({ ...one, ...rolls.rollCreationStats(() => ({ total: 30, detail: "y" })) }), true);
  // Une statistique pas encore lancée n'écrit rien dans la fiche.
  assert.deepEqual(rolls.creationStatCells(one, {}).length, 1);
});
