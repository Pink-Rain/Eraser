import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const states = await vite.ssrLoadModule("/lib/character-states.ts");

const row = (values) => ({ values, html: values });
// Extrait de l'Index des états réel, plus l'onglet Effets et les colonnes Niveau 1 / Niveau 2.
const tables = [
  {
    tabName: "États",
    headers: ["Nom de l'état", "Nom", "Type de l'état", "Description niveau 1", "Description niveau 2", "Règles liées aux états", "Jauge icone", "Icone", "ID", "Niveau 1", "Niveau 2"],
    rows: [
      row(["Effrayé", "Effrayé", "Emotionnel", "Vous passez votre tour jusqu'à réussir un test de Volonté mental.", "Vous passez votre tour (-30% sur cette compétence).", "", "2", "", "ETA-321A6FEC", "", "Effroi intense"]),
      row(["Folie", "Folie", "Emotionnel", "Vous perdez le contrôle de votre personnage.", "/", "", "", "", "ETA-289DCB2D", "", ""]),
      row(["Déterminé", "Déterminé", "Emotionnel", "+10% dans toutes les compétances & +10 Points de dégats", "+20% dans toutes les compétances & +20 Points de dégats", "(Octroyée par le MJ)", "", "", "ETA-5872D5A6", "Détermination", "Détermination forte"]),
    ],
  },
  {
    tabName: "Effets",
    headers: ["Nom", "Cible", "Couleur", "Changement de valeur", "Image", "ID", "Appliqué à la page"],
    rows: [
      row(["Effroi intense", "Volonté mentale", "#6b21a8", "-30", "", "EFF-1", "Page entière, Compétence liée"]),
      row(["Détermination", "Force, Dextérité", "#b8872a", "+10", "", "EFF-2", "Portrait"]),
      // Ancienne case cochée : vaut « Page entière ».
      row(["Détermination forte", "Force, Dextérité", "#b8872a", "+20", "", "EFF-3", "TRUE"]),
    ],
  },
];
const columns = { "États": [{ header: "Jauge icone", spec: { kind: "gauge", gauge: { style: "icons", max: 2, scale: "cell", icon: "clock", color: "#78716c" } } }, { header: "Icone", spec: { kind: "file", file: { accept: "image" } } }] };

test("l'Index des états est lu avec ses niveaux, ses effets et l'icône de sa jauge", () => {
  const catalog = states.parseStatesCatalog(tables, columns);
  const effraye = catalog.states.find((state) => state.name === "Effrayé");
  assert.equal(effraye.levels, 2);
  assert.equal(effraye.type, "Emotionnel");
  assert.deepEqual(effraye.effects, [[], ["Effroi intense"]]);
  assert.equal(effraye.gauge.icon, "clock");
  // « / » au niveau 2 : l'état n'a qu'un niveau.
  assert.equal(catalog.states.find((state) => state.name === "Folie").levels, 1);
  assert.equal(catalog.effects.find((effect) => effect.name === "Détermination").change, 10);
  assert.deepEqual(catalog.effects.find((effect) => effect.name === "Détermination").targets, ["Force", "Dextérité"]);
});

test("seuls les effets du niveau atteint s'appliquent : le niveau 2 remplace le niveau 1", () => {
  const catalog = states.parseStatesCatalog(tables, columns);
  const target = (name) => `carac:${name}`;
  const levelOne = states.stateContributions(catalog, [{ id: "ETA-5872D5A6", name: "Déterminé", level: 1 }], target);
  assert.deepEqual(levelOne.map((change) => [change.target, change.amount]), [["carac:Force", 10], ["carac:Dextérité", 10]]);
  const levelTwo = states.stateContributions(catalog, [{ id: "ETA-5872D5A6", name: "Déterminé", level: 2 }], target);
  assert.deepEqual(levelTwo.map((change) => change.amount), [20, 20]);
  // Effrayé n'a pas d'effet au niveau 1, un malus au niveau 2.
  assert.equal(states.stateContributions(catalog, [{ id: "x", name: "Effrayé", level: 1 }], target).length, 0);
  assert.equal(states.stateContributions(catalog, [{ id: "x", name: "Effrayé", level: 2 }], target)[0].amount, -30);
  // Une cible inconnue de la fiche est ignorée.
  assert.equal(states.stateContributions(catalog, [{ id: "x", name: "Effrayé", level: 2 }], () => null).length, 0);
});

test("les états posés sont relus prudemment et teintent le portrait", () => {
  assert.deepEqual(states.parseCharacterStates([{ name: "Rage", level: 2 }, { name: "rage" }, { name: "" }, "x", { id: "ETA-1", name: "Faim", level: 7 }]), [
    { id: "etat:rage", name: "Rage", level: 2 },
    { id: "ETA-1", name: "Faim", level: 1 },
  ]);
  const catalog = states.parseStatesCatalog(tables, columns);
  // La couleur ne s'applique qu'où c'est choisi dans « Appliqué à la page ».
  const portraitOnly = states.portraitLayers(catalog, [{ id: "ETA-5872D5A6", name: "Déterminé", level: 1 }]);
  assert.deepEqual([portraitOnly.colors, portraitOnly.sheetColors], [["#b8872a"], []]);
  const legacyPage = states.portraitLayers(catalog, [{ id: "ETA-5872D5A6", name: "Déterminé", level: 2 }]);
  assert.deepEqual([legacyPage.colors, legacyPage.sheetColors], [[], ["#b8872a"]]);
  const target = (name) => `carac:${name}`;
  assert.equal(states.stateContributions(catalog, [{ id: "x", name: "Effrayé", level: 2 }], target)[0].color, "#6b21a8");
  assert.equal(states.stateContributions(catalog, [{ id: "ETA-5872D5A6", name: "Déterminé", level: 1 }], target)[0].color, "");
  assert.deepEqual(states.effectApply("portrait ; page entiere"), { page: true, skills: false, portrait: true });
  assert.equal(states.changeAmount("− 15 %"), -15);
});

test("la cible d'un effet devient la bonne case de la fiche", async () => {
  const modifiers = await vite.ssrLoadModule("/lib/item-modifiers.ts");
  const { builtinCharacterCatalog } = await vite.ssrLoadModule("/lib/character-catalog.ts");
  const target = (name) => modifiers.modifierTargetIdForName(builtinCharacterCatalog, name);
  assert.equal(target("Force"), "carac:Force");
  assert.equal(target("Rapidité"), "rapidite");
  assert.equal(target("Bonus de dégâts physiques"), "degats-physiques");
  assert.equal(target("Points de vie"), "vie");
  assert.equal(target("Classe sociale"), null);
  assert.equal(target("Inconnue"), null);
  const skill = builtinCharacterCatalog.skills.find((candidate) => candidate.name === "Perception");
  assert.equal(target("perception"), `comp:${skill.key}`);
});

test("une jauge « par ligne » garde son nombre en tête, puis son icône et sa couleur", async () => {
  const columns = await vite.ssrLoadModule("/lib/index-columns.ts");
  assert.deepEqual(columns.parseGaugeCell("2|skull|#b9504e"), { count: "2", style: { icon: "skull", color: "#b9504e" } });
  assert.deepEqual(columns.parseGaugeCell("1|💧"), { count: "1", style: { emoji: "💧" } });
  assert.deepEqual(columns.parseGaugeCell("3"), { count: "3", style: {} });
  assert.equal(columns.formatGaugeCell("2", { icon: "heart", color: "#285f8f" }), "2|heart|#285f8f");
  assert.equal(columns.formatGaugeCell("2", { icon: "heart" }), "2|heart");
  assert.equal(columns.formatGaugeCell("2", {}), "2");
  const fx = await vite.ssrLoadModule("/lib/state-fx.ts");
  assert.deepEqual(fx.parseStateFx("flammes, Désaturé, inconnu, Flammes"), ["Flammes", "Désaturé"]);
});
