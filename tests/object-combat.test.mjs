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
  // « Rareté principal » et « Rareté secondaire » : déjà précisées, rien à renommer.
  assert.deepEqual(plan.renames, [{ index: 16, header: "Valeur" }]);
  assert.deepEqual(plan.append, ["Action de rechargement", "Attributs", "Matériaux", "Runes"]);
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
    assert.deepEqual(plan.renames.slice(2), [{ index: priceAt, header: "Prix" }, { index: 16, header: "Valeur" }]);
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
  assert.deepEqual(plan.renames, [{ index: 6, header: "Rareté principale" }, { index: 8, header: "Rareté secondaire" }, { index: 16, header: "Valeur" }]);
  assert.equal(combat.objectPriceColumn(next), 5);
});

test("un tableau sans colonnes de combat les reçoit toutes", () => {
  const all = ["Compétence", "Distance", "Action", "Action de rechargement", "Valeur", "Attributs", "Matériaux", "Runes"];
  assert.deepEqual(combat.planObjectCombatHeaders(["Nom", "Prix", "ID"]).append, all);
  // Sans prix, la « Valeur » existante est le prix : renommée, puis une vraie Valeur ajoutée.
  assert.deepEqual(combat.planObjectCombatHeaders(["Nom", "Valeur"]), { renames: [{ index: 1, header: "Prix" }], append: all });
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
  assert.deepEqual(spec("Compétence"), { kind: "linked-choice", multiple: true, source: { index: "skills", tab: "Caractéristiques" } });
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

test("« Armes - Modificateurs » lu pour l'affichage : nom, description, identifiant", async () => {
  const modifiers = await vite.ssrLoadModule("/lib/weapon-modifiers.ts");
  const parsed = modifiers.parseWeaponModifiers([{
    headers: ["Nom", "Type", "Description", "Nombre", "Charges", "Couleur", "ID"],
    rows: [
      { values: ["Lourde", "Attribut", "Deux mains.", "", "", "#9d174d", "MOD-1"], html: ["Lourde", "", "Deux <b>mains</b>.", "", "", "", ""] },
      { values: ["Acier trempé", "Matériaux", "+30", "10", "2", "pas une couleur", "MOD-2"], html: ["<span style=\"color:#285f8f\">Acier trempé</span>", "", "", "", "", "", ""] },
      { values: ["Lame de feu", "Rune", "", "1", "", "", "MOD-3"], html: [] },
      { values: ["lourde", "Attribut", "doublon", "", "", "", "MOD-4"], html: [] },
    ],
  }]);
  assert.deepEqual(parsed.map((entry) => entry.name), ["Lourde", "Acier trempé", "Lame de feu"]);
  assert.equal(parsed[0].descriptionHtml, "Deux <b>mains</b>.");
  assert.equal(parsed[0].nameHtml, "");
  assert.ok(parsed[1].nameHtml.includes("color:#285f8f"));
  assert.equal(parsed[1].color, "");
  // L'identifiant : une référence (menu « { ») retrouve la ligne même renommée.
  assert.deepEqual(parsed.map((entry) => entry.id), ["MOD-1", "MOD-2", "MOD-3"]);
});

test("emplacements des magasins lus par nom de colonne, Rareté en double renommée", () => {
  // Parchemins : « Emplacement principal » AVANT sa rareté, contrairement aux autres onglets.
  const read = (headers, values) => combat.objectLocationColumns(headers).map((pair) => [values[pair.rarity] ?? "", values[pair.place] ?? ""]);
  const parcheminRow = ["Chanson", "", "Parchemin", "Musical", "", "Librairie", "Rare", "Ville", "Très rare", "3 PO"];
  assert.deepEqual(read(parchemins, parcheminRow), [["Rare", "Librairie"], ["Très rare", "Ville"]]);
  const objetRow = ["Canot", "", "Objet", "Transport", "", "2 PO", "Commun", "Bateau", "Rare", "Marché ordinaire"];
  const objets = ["Nom", "Description", "Type", "Sous-type", "Effets", "Prix", "Rareté", "Emplacement principal", "Rareté", "Emplacement secondaire", ...common];
  assert.deepEqual(read(objets, objetRow), [["Commun", "Bateau"], ["Rare", "Marché ordinaire"]]);
  // Après le renommage : mêmes paires, et plus rien à renommer.
  const { next } = applied(objets);
  assert.equal(next[6], "Rareté principale");
  assert.equal(next[8], "Rareté secondaire");
  assert.deepEqual(read(next, objetRow), [["Commun", "Bateau"], ["Rare", "Marché ordinaire"]]);
  assert.deepEqual(combat.planObjectCombatHeaders(next), { renames: [], append: [] });
  // Armes : « Rareté principal » / « Rareté secondaire » déjà nommées.
  assert.deepEqual(read(armes, ["Arbalète", "", "", "", "", "5 PO", "Rare", "Armurier", "Très rare", "Bateau"]), [["Rare", "Armurier"], ["Très rare", "Bateau"]]);
});

test("Matériaux et Runes : listes multiples masquées du tableau", () => {
  const headers = ["Nom", "Matériaux", "Runes"];
  const materials = columns.objectColumnSpec("Matériaux", headers);
  assert.equal(materials.kind, "linked-choice");
  assert.equal(materials.multiple, true);
  assert.equal(materials.hidden, true);
  assert.deepEqual(materials.source.include, { column: "Type", value: "Matériau" });
  assert.deepEqual(columns.objectColumnSpec("Runes", headers).source.include, { column: "Type", value: "Rune" });
  assert.equal(columns.isSheetSpec(materials), true);
});

test("une valeur par mode : {Valeur}, {Valeur 2}, {Valeur 3}, {Distance 2}", () => {
  const item = { value: "20+ Flèche | 1d30+20 | 5", distance: "60 m | 1", action: "Actif -Action mineur | Actif -Action majeur" };
  assert.equal(combat.fillObjectTemplate("Inflige {Valeur} à {Distance} OU {Valeur 2} à {Distance 2}", item), "Inflige 20+ Flèche à 60 m OU 1d30+20 à 1 m");
  assert.equal(combat.fillObjectTemplate("{Valeur 3} {Action 2}", item), "5 Actif -Action majeur");
  // Un mode qui n'existe pas reste écrit tel quel.
  assert.equal(combat.fillObjectTemplate("{Valeur 4} {Distance 3}", item), "{Valeur 4} {Distance 3}");
  // Sans « | », {Valeur} est toute la case.
  assert.equal(combat.fillObjectTemplate("{Valeur}", { value: "1d30+30" }), "1d30+30");
  assert.deepEqual(combat.objectModes("a | b"), ["a", "b"]);
});

test("le rendu des colonnes d'objets suit les réglages de « Modifier »", () => {
  const headers = ["Nom", "Compétence", "Distance", "Action", "Valeur", "Attributs"];
  const looks = combat.objectTraitLooks(headers, {
    competence: { kind: "linked-choice", multiple: true, style: { color: "#b3261e" } },
    distance: { kind: "number", number: { unit: "distance", defaultUnit: "m" }, style: { italic: true } },
    attributs: { kind: "linked-choice", style: { color: "#b7791f" } },
  });
  assert.deepEqual(looks.skill, { style: { color: "#b3261e" } });
  assert.deepEqual(looks.distance, { style: { italic: true }, unit: "m" });
  assert.deepEqual(looks.attributes, { style: { color: "#b7791f" } });
  // Action sans réglage : ses options par défaut, aux couleurs des types de sorts.
  assert.ok(looks.action.options.some((option) => option.value === "Actif -Action majeur" && option.color));
  assert.equal(looks.action.style, undefined);
});

test("{Valeur} garde le style imposé de sa colonne", () => {
  const item = { value: "20+ Flèche | 1d30+20", looks: { value: { style: { bold: true, color: "#7f1d1d" } } } };
  assert.equal(combat.fillObjectTemplateHtml("Inflige {Valeur 2}", item), 'Inflige <span class="font-semibold" style="color:#7f1d1d">1d30+20</span>');
  assert.equal(combat.fillObjectTemplateHtml("Inflige {Valeur}", { value: "5" }), "Inflige 5");
});

test("un inventaire résumé garde les colonnes déjà apportées par le catalogue", async () => {
  const schema = await vite.ssrLoadModule("/lib/inventory-schema.ts");
  const item = (extra) => ({ id: "OBJ-1", name: "Arc", description: "", type: "Arme", subtype: "", effect: "Inflige {Valeur}", ...extra });
  const inventory = (slotItem, items = []) => ({ containerTypes: [], items, containers: [{ id: "C", slots: [{ id: "S", item: slotItem }] }] });
  const full = inventory(item({ value: "1d8", action: "Actif -Action majeur", looks: { value: {} } }), [item({ value: "1d8" })]);
  const summary = inventory(item({}));
  const kept = schema.keepCatalogFields(summary, full);
  assert.equal(kept.containers[0].slots[0].item.value, "1d8");
  assert.equal(kept.containers[0].slots[0].item.action, "Actif -Action majeur");
  assert.equal(kept.items.length, 1);
  // Sans chargement précédent : le résumé tel quel.
  assert.equal(schema.keepCatalogFields(summary, null), summary);
});

test("l'icône d'un modificateur d'arme est lue dans sa colonne Icône", async () => {
  const modifiers = await vite.ssrLoadModule("/lib/weapon-modifiers.ts");
  const [withIcon, without] = modifiers.parseWeaponModifiers([{ headers: ["Nom", "Type", "ID", "Icône"], rows: [{ values: ["Lame de feu", "Rune", "MOD-1", "flame"], html: [] }, { values: ["Lourde", "Attribut", "MOD-2", ""], html: [] }] }]);
  assert.equal(withIcon.icon, "flame");
  assert.equal(without.icon, "");
  const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  assert.equal(definitions.worldColumnSpec("weapon-modifiers", "Tout", "Icône").kind, "glyph");
});

test("un inventaire revenu sans catalogue est redemandé", async () => {
  const { loadFullInventory } = await vite.ssrLoadModule("/lib/inventory-fetch.ts");
  const replies = [{ inventory: { containers: [], containerTypes: [], items: [], catalogMissing: true } }, { inventory: { containers: [], containerTypes: [], items: [{ id: "A" }] } }];
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => replies[calls++] });
  const received = [];
  try {
    await loadFullInventory("/api/x", (inventory) => received.push(inventory), () => true, [0, 1, 1]);
  } finally { globalThis.fetch = original; }
  assert.equal(calls, 2);
  assert.equal(received.length, 2);
  assert.equal(received[1].items[0].id, "A");
});
