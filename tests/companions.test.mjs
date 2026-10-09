import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, logLevel: "error" });
after(async () => { await vite.close(); });
const companions = await vite.ssrLoadModule("/lib/companions.ts");

const headers = ["Nom", "Type", "Sous-type", "Rang", "Portrait", "Force", "Dextérité", "Intelligence", "Charisme", "Vitesse", "Vitalité", "Sagesse", "Sorts actifs", "Sorts passifs", "Description", "ID"];
const wolf = ["Loup gris", "Bête", "Canidé", "2", "/api/resources/creature-portraits/abc", "12", "14", "3", "5", "8", "30,5", "9", "Morsure", "Flair", "Un loup", "CRE-LOUP"];

test("Créature de l'index : ses caractéristiques lues par nom, sa Vitalité devient sa vie", () => {
  const candidate = companions.creatureCandidateFromRow(headers, wolf, wolf.map((value, index) => headers[index] === "Description" ? "<p>Un <b>loup</b></p>" : ""));
  assert.equal(candidate.sourceName, "Loup gris");
  assert.equal(candidate.sourceId, "CRE-LOUP");
  assert.equal(candidate.creatureType, "Bête · Canidé");
  assert.equal(candidate.totalHp, 30.5);
  assert.equal(candidate.strength, 12);
  assert.equal(candidate.wisdom, 9);
  assert.equal(candidate.description, "<p>Un <b>loup</b></p>");
  // Une ligne sans nom n'est pas une créature.
  assert.equal(companions.creatureCandidateFromRow(headers, ["", ...wolf.slice(1)]), null);
  // Le compagnon : vie pleine, le nom donné par le joueur (celui de l'index sinon).
  const named = companions.creatureCompanionFrom(candidate, "cmp-1", "  Croc ");
  assert.equal(named.name, "Croc");
  assert.equal(named.currentHp, 30.5);
  assert.equal(companions.creatureCompanionFrom(candidate, "cmp-2", "").name, "Loup gris");
  assert.deepEqual(companions.companionCharacteristics(named), { Force: 12, Dextérité: 14, Intelligence: 3, Sagesse: 9, Charisme: 5, Vitesse: 8, Vitalité: 30.5 });
});

test("Compagnons enregistrés dans les onglets : relus tels quels, les entrées illisibles écartées", () => {
  const candidate = companions.creatureCandidateFromRow(headers, wolf);
  const creature = { ...companions.creatureCompanionFrom(candidate, "cmp-1", "Croc"), currentHp: 12, notes: "Fidèle" };
  const tabs = JSON.stringify([
    { id: "t1", type: "invocation", label: "Invocation" },
    { id: "t2", type: "compagnon", label: "Compagnon", companions: [creature, { id: "cmp-2", kind: "npc", npcId: "PNJ-1", campaignId: "CAMP-1" }, { id: "cmp-1", kind: "npc", npcId: "doublon" }, { kind: "creature" }, "n'importe quoi"] },
  ]);
  const list = companions.companionsOfTabs(tabs);
  assert.deepEqual(list.map((item) => [item.id, item.kind]), [["cmp-1", "creature"], ["cmp-2", "npc"]]);
  assert.deepEqual(list[0], creature);
  assert.deepEqual(companions.companionsOfTabs("pas du json"), []);
  assert.deepEqual(companions.parseCompanions(undefined), []);
});

test("Charges des sorts d'un compagnon : gardées dans l'onglet, bornées, absentes tant qu'aucune n'est dépensée", () => {
  const parsed = companions.parseCompanions([
    { id: "a", kind: "npc", npcId: "PNJ-1", spellCharges: { "morsure": 1, "souffle glace": 9, "": 2, "x": "abc" } },
    { id: "b", kind: "npc", npcId: "PNJ-2", spellCharges: {} },
  ]);
  assert.deepEqual(parsed[0].spellCharges, { "morsure": 1, "souffle glace": 5 });
  assert.equal("spellCharges" in parsed[1], false);
});

test("Sac à dos d'une créature compagnon : un propriétaire à part, retrouvé depuis son identifiant", () => {
  const owner = companions.companionInventoryOwnerId("PERSO-1", "cmp-1");
  assert.equal(companions.isCompanionInventoryOwner(owner), true);
  assert.equal(companions.isCompanionInventoryOwner("PERSO-1"), false);
  assert.deepEqual(companions.companionOfInventoryOwner(owner), { characterId: "PERSO-1", companionId: "cmp-1" });
  assert.equal(companions.companionOfInventoryOwner("CAMPAGNE:X"), null);
});
