import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const forms = await vite.ssrLoadModule("/lib/class-forms.ts");
const specifics = await vite.ssrLoadModule("/lib/class-specifics.ts");

let counter = 0;
const newId = () => `ID${(counter += 1)}ABCD`;

const raw = {
  classId: "CLA-1", className: "Adepte d'Hepo", name: "Forme", placement: "vie",
  forms: [
    { name: "Humaine", color: "#4f9a8a", effects: [{ target: "Force", change: "+10" }] },
    { name: "Possédée", color: "#8f79b5", isDefault: false, effects: [{ target: "Folie", change: "≥3" }, { target: "Armure physique", change: "-5" }, { target: "Inconnue", change: "+2" }, { target: "Force", change: "1d6" }], description: "<p>Elle <strong>hurle</strong></p>" },
    { name: "  ", effects: [] },
  ],
};

test("Un groupe de formes reçu de l'éditeur : IDs donnés, une seule forme de départ, formes sans nom écartées", () => {
  const group = forms.sanitizeFormGroup(raw, newId);
  assert.match(group.id, /^FGR-/);
  assert.equal(group.forms.length, 2);
  assert.ok(group.forms.every((form) => /^FOR-/.test(form.id)));
  assert.deepEqual(group.forms.map((form) => form.isDefault), [true, false]);
  assert.equal(forms.sanitizeFormGroup({ ...raw, classId: "" }, newId), null);
  const twoDefaults = forms.sanitizeFormGroup({ ...raw, forms: raw.forms.map((form) => ({ ...form, isDefault: true })) }, newId);
  assert.deepEqual(twoDefaults.forms.map((form) => form.isDefault), [true, false]);
});

test("Les lignes de l'onglet Formes se relisent en groupes", () => {
  const group = forms.sanitizeFormGroup(raw, newId);
  const rows = forms.formGroupRows(group);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]["Effets"], "Folie : ≥3\nArmure physique : -5\nInconnue : +2\nForce : 1d6");
  assert.equal(rows[0]["Emplacement"], "Sous la barre de vie");
  const back = forms.formGroupsFromRows(rows.map((row) => ({ cell: (header) => row[header], rich: (header) => row[header] })));
  assert.equal(back.length, 1);
  assert.deepEqual(back[0], group);
});

test("La forme active change la fiche comme un état ; dés et cibles inconnues ignorés", () => {
  const group = forms.sanitizeFormGroup(raw, newId);
  const targetOf = (name) => ({ Force: "carac:Force", Folie: "folie", "Armure physique": "armure-physique" })[name] ?? null;
  let changes = forms.formContributions([group], {}, targetOf);
  assert.deepEqual(changes.map((change) => [change.target, change.amount]), [["carac:Force", 10]]);
  changes = forms.formContributions([group], { [group.id]: group.forms[1].id }, targetOf);
  assert.deepEqual(changes.map((change) => [change.target, change.amount, change.operation?.kind ?? null, change.label]), [["folie", 0, "min", "≥3"], ["armure-physique", -5, null, "-5"]]);
  assert.equal(changes[0].state, "Forme : Possédée");
  assert.equal(forms.activeForm(group, "inconnue").name, "Humaine");
});

test("Changer de forme garde le reste de la case et remet les jauges liées à leur départ", () => {
  const start = JSON.stringify({ choices: { "CLA-1": { 1: "S1" } }, specifics: { "JAU-1": { current: 7 }, "JAU-2": { current: 2 } } });
  const value = forms.withChosenForm(start, "FGR-1", "FOR-2", ["JAU-1"]);
  const parsed = JSON.parse(value);
  assert.deepEqual(parsed.specifics, { "JAU-2": { current: 2 }, "FGR-1": { form: "FOR-2" } });
  assert.deepEqual(parsed.choices, { "CLA-1": { 1: "S1" } });
  assert.deepEqual(forms.chosenFormsOf(value), { "FGR-1": "FOR-2" });
  assert.deepEqual(forms.chosenFormsOf("rien"), {});
});

test("Une jauge liée à des formes ne s'affiche que dans celles-ci", () => {
  const gauge = { ...specifics.emptyGauge("CLA-1", "Adepte", "JAU-1"), name: "Folie temporaire", forms: ["Possédée"], resetOnLeave: true };
  assert.equal(specifics.gaugeVisibleIn(gauge, ["Humaine"]), false);
  assert.equal(specifics.gaugeVisibleIn(gauge, ["possedee"]), true);
  assert.equal(specifics.gaugeVisibleIn({ ...gauge, forms: [] }, []), true);
  const cells = specifics.gaugeCells(gauge);
  assert.equal(cells["Formes"], "Possédée");
  assert.equal(cells["Remise à zéro en quittant la forme"], "Oui");
  assert.deepEqual(specifics.gaugeFromCells((header) => cells[header]), gauge);
});
