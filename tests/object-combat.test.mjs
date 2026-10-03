import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const combat = await vite.ssrLoadModule("/lib/object-combat.ts");
const columns = await vite.ssrLoadModule("/lib/index-columns.ts");

// En-têtes réels de l'« Index des objets » après la 0.1.1-alpha.114.
const common = ["Icône", "Nombre max", "ID", "Compétence", "Distance", "Action", "Dégâts"];
const armes = ["Nom", "Description", "Type", "Sous-type", "Effets", "Prix", "Rareté principal", "Emplacement principal", "Rareté secondaire", "Emplacement secondaire", ...common];
const parchemins = ["Nom", "Description", "Type", "Sous-Type", "Effets", "Emplacement principal", "Rareté ", "Emplacement secondaire", "Rareté", "Valeur", ...common];
const consommables = ["Nom", "Description", "Type", "Sous-Type", "Effets", "Valeur", "Rareté ", "Emplacement principal", "Rareté", "Emplacement secondaire", ...common];
const ressources = ["Nom", "Description", "Type", "Sous-type", "Effet", "Cout", "Rareté ", "Emplacement principal", "Rareté", "Emplacement secondaire", ...common];

function applied(headers) {
  const plan = combat.planObjectCombatHeaders(headers);
  const next = [...headers];
  for (const rename of plan.renames) next[rename.index] = rename.header;
  return { plan, next: [...next, ...plan.append] };
}

test("Dégâts devient Valeur et Attributs est ajouté, sans déplacer de colonne", () => {
  const { plan, next } = applied(armes);
  assert.deepEqual(plan.renames, [{ index: 16, header: "Valeur" }]);
  assert.deepEqual(plan.append, ["Attributs"]);
  assert.deepEqual(next.slice(0, armes.length - 1), armes.slice(0, -1));
  assert.equal(combat.objectPriceColumn(next), 5);
  assert.equal(combat.objectValueColumn(next), 16);
});

test("une Valeur qui sert de prix devient Prix, à sa place", () => {
  for (const [headers, priceAt] of [[parchemins, 9], [consommables, 5]]) {
    // Avant la mise à jour : le prix reste lu dans « Valeur », la valeur dans « Dégâts ».
    assert.equal(combat.objectPriceColumn(headers), priceAt);
    assert.equal(combat.objectValueColumn(headers), 16);
    const { plan, next } = applied(headers);
    assert.deepEqual(plan.renames, [{ index: priceAt, header: "Prix" }, { index: 16, header: "Valeur" }]);
    assert.equal(next[priceAt], "Prix");
    // Après : mêmes colonnes, mêmes données.
    assert.equal(combat.objectPriceColumn(next), priceAt);
    assert.equal(combat.objectValueColumn(next), 16);
    // Une seconde passe ne change plus rien.
    assert.deepEqual(combat.planObjectCombatHeaders(next), { renames: [], append: [] });
  }
});

test("« Cout » reste le prix : seule Dégâts est renommée", () => {
  const { plan, next } = applied(ressources);
  assert.deepEqual(plan.renames, [{ index: 16, header: "Valeur" }]);
  assert.equal(combat.objectPriceColumn(next), 5);
});

test("un tableau sans colonnes de combat les reçoit toutes", () => {
  assert.deepEqual(combat.planObjectCombatHeaders(["Nom", "Prix", "ID"]).append, ["Compétence", "Distance", "Action", "Valeur", "Attributs"]);
  // Sans prix, la « Valeur » existante est le prix : renommée, puis une vraie Valeur ajoutée.
  assert.deepEqual(combat.planObjectCombatHeaders(["Nom", "Valeur"]), { renames: [{ index: 1, header: "Prix" }], append: ["Compétence", "Distance", "Action", "Valeur", "Attributs"] });
});

test("{Valeur} et les autres accolades sont remplacées hors du tableau", () => {
  const item = { value: "1d8 + Force", distance: "12", skill: "Lames", attributes: "Lourde, Assommante" };
  assert.equal(combat.fillObjectTemplate("Inflige {Valeur} à {distance} ({Compétence})", item), "Inflige 1d8 + Force à 12 m (Lames)");
  assert.equal(combat.fillObjectTemplate("Attributs : {Attributs}. {Action} {Inconnue}", item), "Attributs : Lourde, Assommante. {Action} {Inconnue}");
  assert.equal(combat.fillObjectTemplate("Ancien nom : {Dégâts}", item), "Ancien nom : 1d8 + Force");
  assert.equal(combat.fillObjectTemplateHtml("<b>Inflige</b> {Valeur}", { value: "<3 & plus" }), "<b>Inflige</b> &lt;3 &amp; plus");
});

test("types des colonnes de combat dans l'Index des objets", () => {
  const headers = [...armes.slice(0, -1), "Valeur", "Attributs"];
  const spec = (header) => columns.objectColumnSpec(header, headers);
  assert.deepEqual(spec("Compétence"), { kind: "linked-choice", source: { index: "skills", tab: "Caractéristiques" } });
  assert.deepEqual(spec("Distance"), { kind: "number", number: { unit: "distance", defaultUnit: "m" } });
  assert.equal(spec("Action").kind, "choice");
  assert.ok(spec("Action").options.some((option) => option.value === "Actif -Action majeur"));
  assert.equal(spec("Attributs").kind, "linked-choice");
  assert.deepEqual(spec("Attributs").source.include, { column: "Type", value: "Attribut" });
  assert.equal(spec("Valeur").kind, "rich");
  assert.equal(spec("Prix").kind, "number");
  // Dans un tableau qui n'a pas encore de « Prix », la « Valeur » reste le prix.
  assert.equal(columns.objectColumnSpec("Valeur", parchemins).kind, "number");
});
