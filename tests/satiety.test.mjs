import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const satiety = await vite.ssrLoadModule("/lib/satiety.ts");

const at = "2026-10-23T10:00:00.000Z";
const rest = (state, action) => satiety.applySatietyAction(state, { kind: "rest", ...action }, at);

test("une nuit sans repas enlève une charge et compte un jour dans la campagne", () => {
  const next = rest({ charges: 4, days: {} }, { mode: "night", meal: null, campaignId: "CAM-1" });
  assert.equal(next.charges, 3);
  assert.deepEqual(next.days, { "CAM-1": 1 });
});

test("une ellipse enlève une charge par jour, sans jamais passer sous zéro", () => {
  assert.equal(rest({ charges: 5, days: {} }, { mode: "ellipse", days: 3, meal: null }).charges, 2);
  const long = rest({ charges: 5, days: { "CAM-1": 2 } }, { mode: "ellipse", days: 10, meal: null, campaignId: "CAM-1" });
  assert.equal(long.charges, 0);
  assert.deepEqual(long.days, { "CAM-1": 12 });
});

test("un repas offert rend des charges (petit 1, moyen 3, grand 5), plafonnées à cinq", () => {
  assert.equal(rest({ charges: 0, days: {} }, { mode: "night", meal: "petit" }).charges, 1);
  assert.equal(rest({ charges: 1, days: {} }, { mode: "night", meal: "moyen" }).charges, 4);
  assert.equal(rest({ charges: 4, days: {} }, { mode: "night", meal: "moyen" }).charges, 5);
  assert.equal(rest({ charges: 0, days: {} }, { mode: "ellipse", days: 6, meal: "grand" }).charges, 5);
  assert.deepEqual(rest({ charges: 0, days: {} }, { mode: "ellipse", days: 6, meal: "grand", campaignId: "C" }).days, { C: 6 });
});

test("les charges réglées à la main restent entre zéro et cinq ; les jours ne bougent pas", () => {
  assert.equal(satiety.applySatietyAction({ charges: 2, days: { C: 3 } }, { kind: "set", charges: 9 }, at).charges, 5);
  assert.equal(satiety.applySatietyAction({ charges: 2, days: { C: 3 } }, { kind: "set", charges: -1 }, at).charges, 0);
  assert.deepEqual(satiety.applySatietyAction({ charges: 2, days: { C: 3 } }, { kind: "set", charges: 1 }, at).days, { C: 3 });
});

test("l'enregistrement se relit ; un personnage jamais réglé est rassasié", () => {
  assert.deepEqual(satiety.emptySatiety(), { charges: 5, days: {} });
  assert.deepEqual(satiety.parseSatiety(JSON.stringify({ charges: 7, days: { A: 2, B: -1, C: "x" }, extra: 1 })), { charges: 5, days: { A: 2 } });
  assert.equal(satiety.parseSatiety("pas du json"), null);
});

test("une action envoyée par la page est vérifiée", () => {
  assert.deepEqual(satiety.parseSatietyAction({ kind: "rest", mode: "ellipse", days: "4", meal: "grand", campaignId: "C" }), { kind: "rest", mode: "ellipse", days: 4, meal: "grand", campaignId: "C" });
  assert.deepEqual(satiety.parseSatietyAction({ kind: "rest", mode: "night" }), { kind: "rest", mode: "night", meal: null, campaignId: null });
  assert.equal(satiety.parseSatietyAction({ kind: "rest", mode: "sieste" }), null);
  assert.equal(satiety.parseSatietyAction({ kind: "rest", mode: "night", meal: "festin" }), null);
  assert.deepEqual(satiety.parseSatietyAction({ kind: "set", charges: 3.7 }), { kind: "set", charges: 3 });
  assert.equal(satiety.parseSatietyAction({ kind: "rest", mode: "ellipse", days: 0 }).days, 1);
});

test("la barre passe du rouge (vide) au vert (pleine)", () => {
  assert.equal(satiety.satietyColor(0), "#dc2626");
  assert.equal(satiety.satietyColor(5), "#16a34a");
  assert.equal(new Set([0, 1, 2, 3, 4, 5].map(satiety.satietyColor)).size, 6);
  assert.equal(satiety.describeRest({ mode: "night", meal: null }), "Nuit sans repas : −1 charge");
  assert.equal(satiety.describeRest({ mode: "ellipse", days: 3, meal: "moyen" }), "Ellipse de 3 jours · moyen repas : +3 charges");
});
