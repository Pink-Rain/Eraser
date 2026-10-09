import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const specifics = await vite.ssrLoadModule("/lib/class-specifics.ts");

const sheet = specifics.formulaValues([["Niveau", 5], ["Points de vie actuels", 60], ["Points de vie max", 100], ["Force", -5], ["Folie", 3]]);

test("Formules : valeurs de la fiche entre accolades, sans accents ni majuscules", () => {
  assert.deepEqual(specifics.evaluateFormula("{Points de vie max} - {points de vie actuels}", sheet), { ok: true, value: 40 });
  assert.deepEqual(specifics.evaluateFormula("{Force} * 2 + 20", sheet), { ok: true, value: 10 });
  assert.deepEqual(specifics.evaluateFormula("{Niveau}*10%", sheet), { ok: true, value: 0.5 });
  assert.deepEqual(specifics.evaluateFormula("12,5", sheet), { ok: true, value: 12.5 });
  assert.equal(specifics.evaluateFormula("{Mana} + 1", sheet).ok, false);
  assert.match(specifics.evaluateFormula("{Mana} + 1", sheet).error, /\{Mana\}/);
  assert.equal(specifics.evaluateFormula("{Force", sheet).ok, false);
  assert.equal(specifics.evaluateFormula("", sheet).ok, false);
});

test("Barre de rage : maximum = PV max, actuelle = PV manquants, calculée", () => {
  const rage = { ...specifics.emptyGauge("CLA-1", "Berserker", "JAU-1"), name: "Rage", maxMode: "formule", max: "{Points de vie max}", currentMode: "formule", current: "{Points de vie max} - {Points de vie actuels}" };
  const resolved = specifics.resolveGauge(rage, sheet, { current: 3 });
  assert.equal(resolved.max, 100);
  assert.equal(resolved.current, 40);
  assert.equal(resolved.editableCurrent, false);
  assert.equal(resolved.ratio, 40);
  assert.deepEqual(resolved.errors, []);
});

test("Jauge tenue par le joueur : départ, bornes, maximum choisi par le joueur", () => {
  const mana = { ...specifics.emptyGauge("CLA-1", "Mage", "JAU-2"), name: "Mana", maxMode: "joueur", max: "{Niveau} * 10", current: "{Maximum}", thresholds: [{ value: "{Maximum} / 2", label: "Moitié" }, { value: "{Inconnu}", label: "?" }] };
  let resolved = specifics.resolveGauge(mana, sheet);
  assert.equal(resolved.max, 50);
  assert.equal(resolved.current, 50);
  assert.equal(resolved.start, 50);
  assert.deepEqual(resolved.thresholds, [{ value: 25, label: "Moitié", ratio: 50 }]);
  assert.equal(resolved.errors.length, 1);
  resolved = specifics.resolveGauge(mana, sheet, { current: 999, max: 80 });
  assert.equal(resolved.max, 80);
  assert.equal(resolved.current, 80);
  assert.equal(specifics.resolveGauge(mana, sheet, { current: -4 }).current, 0);
});

test("L'état du joueur est rangé dans la case des sorts choisis, sans rien effacer", () => {
  const start = JSON.stringify({ choices: { "CLA-1": { 1: "S1" } }, states: [{ id: "E", name: "Peur", level: 1 }] });
  let value = specifics.withGaugeState(start, "JAU-2", { current: 12.345 });
  value = specifics.withGaugeState(value, "JAU-2", { max: 80 });
  assert.deepEqual(specifics.gaugeStatesOf(value), { "JAU-2": { current: 12.35, max: 80 } });
  assert.deepEqual(JSON.parse(value).choices, { "CLA-1": { 1: "S1" } });
  value = specifics.withGaugeState(value, "JAU-2", { current: undefined, max: undefined });
  assert.deepEqual(specifics.gaugeStatesOf(value), {});
  assert.equal(JSON.parse(value).states.length, 1);
  assert.deepEqual(specifics.gaugeStatesOf("pas du json"), {});
});

test("Une ligne de l'onglet Jauges se relit, même écrite à la main dans Sheets", () => {
  const gauge = { ...specifics.emptyGauge("CLA-1", "Berserker", "JAU-1", 2), name: "Rage", color: "#b9504e", placement: "bandeau", display: "pastilles", maxMode: "formule", max: "{Points de vie max}", thresholds: [{ value: "50", label: "Frénésie" }], description: "Monte quand il saigne." };
  const cells = specifics.gaugeCells(gauge);
  assert.equal(cells["Maximum (type)"], "Relié à la fiche");
  assert.equal(cells["Seuils"], "50 : Frénésie");
  assert.deepEqual(specifics.gaugeFromCells((header) => cells[header]), gauge);
  const handwritten = specifics.gaugeFromCells((header) => ({ "ID": "JAU-9", "Nom": "Concentration", "Maximum (type)": "formule", "Valeur actuelle (type)": "calculée", "Emplacement": "onglet sorts", "Affichage": "points", "Remise à zéro": "non", "Pas": "abc" })[header] ?? "");
  assert.equal(handwritten.maxMode, "formule");
  assert.equal(handwritten.currentMode, "formule");
  assert.equal(handwritten.placement, "sorts");
  assert.equal(handwritten.display, "pastilles");
  assert.equal(handwritten.resetButton, false);
  assert.equal(handwritten.step, 1);
  assert.equal(specifics.gaugeFromCells(() => ""), null);
  assert.equal(specifics.sanitizeGauge({ id: "JAU-3", name: "X", step: 2, resetButton: false, thresholds: [{ value: "5", label: "a" }] }).step, 2);
});

test("Les jauges d'une classe : par identifiant, sinon par nom", () => {
  const gauges = [
    { ...specifics.emptyGauge("CLA-1", "Berserker", "A", 2), name: "B" },
    { ...specifics.emptyGauge("", "berserker", "B", 1), name: "A" },
    { ...specifics.emptyGauge("CLA-2", "Mage", "C"), name: "C" },
  ];
  assert.deepEqual(specifics.gaugesOfClass(gauges, { id: "CLA-1", name: "Berserker" }).map((gauge) => gauge.id), ["B", "A"]);
});
