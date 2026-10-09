import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const summons = await vite.ssrLoadModule("/lib/summons.ts");

const wolf = {
  id: "wolf",
  name: "Loup",
  color: "#4f9a8a",
  fields: [
    { id: "life", kind: "life", label: "Points de vie", current: "3", max: "12" },
    { id: "stats", kind: "stats", label: "Caractéristiques", group: "principale", stats: [{ id: "s1", name: "Force", value: "40" }] },
    { id: "bite", kind: "spell", label: "Morsure", description: "1d6", action: "Principale", charges: 3, chargesLeft: 1 },
  ],
};

test("une case vide ou abîmée donne un onglet vide, jamais une erreur", () => {
  assert.deepEqual(summons.parseSummonsData(undefined), { templates: [], summons: [] });
  assert.deepEqual(summons.parseSummonsData("n’importe quoi"), { templates: [], summons: [] });
  const parsed = summons.parseSummonsData({ templates: [{ name: "  ", fields: [{ kind: "inconnu" }, null, { kind: "spell", label: "Feu", charges: 99, chargesLeft: -3 }] }], summons: "x" });
  assert.equal(parsed.templates[0].name, "Invocation");
  assert.equal(parsed.templates[0].fields.length, 1);
  assert.equal(parsed.templates[0].fields[0].charges, 5);
  assert.equal(parsed.templates[0].fields[0].chargesLeft, 0);
  assert.deepEqual(parsed.summons, []);
});

test("ce qui est enregistré se relit à l’identique", () => {
  const data = { templates: [wolf], summons: [{ id: "a", templateId: "wolf", type: "Loup", color: "#4f9a8a", name: "Loup", fields: wolf.fields }] };
  assert.deepEqual(summons.parseSummonsData(JSON.parse(JSON.stringify(data))), data);
});

test("invoquer copie le template, vie et charges pleines, sous un nom libre", () => {
  const first = summons.summonFromTemplate(wolf, []);
  assert.equal(first.name, "Loup");
  assert.equal(first.type, "Loup");
  assert.equal(first.templateId, "wolf");
  assert.equal(first.fields[0].current, "12");
  assert.equal(first.fields[2].chargesLeft, 3);
  assert.notEqual(first.fields[0].id, "life");
  assert.notEqual(first.fields[1].stats[0].id, "s1");
  const second = summons.summonFromTemplate(wolf, [first]);
  assert.equal(second.name, "Loup 2");
  assert.equal(summons.nextSummonName("Loup", ["Loup", "loup 2"]), "Loup 3");
});

test("une invocation est figée : modifier le template ne la change pas", () => {
  const summon = summons.summonFromTemplate(wolf, []);
  const edited = { ...wolf, fields: [...wolf.fields, summons.newSummonField("text")] };
  assert.equal(summon.fields.length, 3);
  assert.equal(edited.fields.length, 4);
});

test("dupliquer garde l’état actuel sous un nouveau nom", () => {
  const summon = { ...summons.summonFromTemplate(wolf, []), name: "Loup 2" };
  summon.fields = summon.fields.map((field) => field.kind === "life" ? { ...field, current: "4" } : field.kind === "spell" ? { ...field, chargesLeft: 1 } : field);
  const copy = summons.duplicateSummon(summon, [summon]);
  assert.equal(copy.name, "Loup");
  assert.equal(copy.fields[0].current, "4");
  assert.equal(copy.fields[2].chargesLeft, 1);
  assert.notEqual(copy.id, summon.id);
});

test("les invocations sont rangées par type, celles d’un template supprimé à la fin", () => {
  const golem = { id: "golem", name: "Golem", color: "#7d7f86", fields: [] };
  const data = {
    templates: [wolf, golem],
    summons: [
      { id: "1", templateId: "golem", type: "Golem", color: "#7d7f86", name: "Golem", fields: [] },
      { id: "2", templateId: "gone", type: "Spectre", color: "#8a6fb0", name: "Spectre", fields: [] },
      { id: "3", templateId: "golem", type: "Golem", color: "#7d7f86", name: "Golem 2", fields: [] },
      { id: "4", templateId: "gone2", type: "Ange", color: "#8a6fb0", name: "Ange", fields: [] },
    ],
  };
  const groups = summons.groupSummons(data);
  assert.deepEqual(groups.map((group) => group.type), ["Golem", "Ange", "Spectre"]);
  assert.deepEqual(groups[0].summons.map((item) => item.id), ["1", "3"]);
  assert.equal(groups[1].template, undefined);
});

test("une invocation à 0 point de vie est vaincue", () => {
  assert.equal(summons.summonLife({ id: "l", kind: "life", label: "", current: "6", max: "12" }).ratio, 50);
  assert.equal(summons.summonLife({ id: "l", kind: "life", label: "", current: "0", max: "12" }).down, true);
  assert.equal(summons.summonLife({ id: "l", kind: "life", label: "", current: "", max: "" }).down, false);
});

test("un seul bloc de caractéristiques, vide au départ", () => {
  const field = summons.newSummonField("stats");
  assert.equal(field.label, "Caractéristiques");
  assert.deepEqual(field.stats, []);
  assert.equal(summons.summonFieldKinds.filter((kind) => kind.kind === "stats").length, 1);
  // Un bloc « secondaires » d’un premier template reste lu tel quel.
  const old = summons.parseSummonsData({ templates: [{ id: "t", name: "Loup", fields: [{ id: "f", kind: "stats", group: "secondaire", label: "Caractéristiques secondaires", stats: [{ id: "s", name: "Armure physique", value: "3" }] }] }] });
  assert.equal(old.templates[0].fields[0].stats[0].name, "Armure physique");
});
