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
    headers: ["Nom", "Cible", "Couleur", "Changement de valeur", "Image", "ID", "Couleur appliquée à", "FX", "FX appliqué à"],
    rows: [
      row(["Effroi intense", "Volonté mentale", "#6b21a8", "-30", "", "EFF-1", "Page entière, Compétence liée", "Tremblement, Brume", "Compétence liée, Page entière"]),
      row(["Détermination", "Force, Dextérité", "#b8872a", "+10", "", "EFF-2", "Portrait", "Rayons", "Portrait"]),
      // Ancienne case cochée : vaut « Page entière ». FX sans « FX appliqué à » : nulle part.
      row(["Détermination forte", "Force, Dextérité", "#b8872a", "+20", "", "EFF-3", "TRUE", "Flammes", ""]),
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
  // Les FX ne se dessinent qu'où « FX appliqué à » le dit.
  assert.deepEqual(portraitOnly.fx.map((fx) => fx.name), ["Rayons"]);
  assert.deepEqual([legacyPage.fx, legacyPage.sheetFx], [[], []]);
  const fear = states.portraitLayers(catalog, [{ id: "x", name: "Effrayé", level: 2 }]);
  assert.deepEqual([fear.fx, fear.sheetFx.map((fx) => fx.name)], [[], ["Tremblement", "Brume"]]);
  assert.deepEqual(states.stateContributions(catalog, [{ id: "x", name: "Effrayé", level: 2 }], target)[0].fx.map((fx) => fx.name), ["Tremblement", "Brume"]);
  assert.deepEqual(states.stateContributions(catalog, [{ id: "ETA-5872D5A6", name: "Déterminé", level: 1 }], target)[0].fx, []);
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

test("changement de valeur : +, -, =, bornes et dés ; jets lancés depuis la fiche", async () => {
  const change = await vite.ssrLoadModule("/lib/state-change.ts");
  assert.deepEqual(change.parseValueChange("=100"), { kind: "set", value: 100 });
  assert.deepEqual(change.parseValueChange("≥1"), { kind: "min", value: 1 });
  assert.deepEqual(change.parseValueChange("<= 50"), { kind: "max", value: 50 });
  assert.deepEqual(change.parseValueChange("- 1d20 - 20"), { kind: "roll", expression: "-1d20-20" });
  // Le signe tout devant vaut pour le total des dés.
  assert.deepEqual(change.signedDice("-1d20+20"), { sign: -1, dice: "1d20+20" });
  assert.deepEqual(change.signedDice("+ 2d6"), { sign: 1, dice: "2d6" });
  assert.deepEqual(change.signedDice("1d20-20"), { sign: 1, dice: "1d20-20" });
  assert.deepEqual(change.parseValueChange("-10 PV"), { kind: "add", amount: -10 });
  const roll = change.parseRoll("1d20 : 16 & 20");
  assert.equal(roll.dice, "1d20");
  assert.equal(change.rangeLabel(roll.range), "16-20");
  assert.equal(change.rollHits(17, roll.range), true);
  assert.equal(change.rollHits(15, roll.range), false);
  assert.equal(change.rangeLabel(change.parseRoll("1d10 3 ou moins").range), "≤3");
  // Le dernier « = » l'emporte, les bornes se cumulent ; « = » d'abord, puis bornes.
  let rule = change.mergeRule(undefined, { kind: "set", value: 100 });
  rule = change.mergeRule(rule, { kind: "min", value: 1 });
  rule = change.mergeRule(rule, { kind: "max", value: 80 });
  assert.equal(change.applyRule(5, rule), 80);
  assert.equal(change.applyRule(-12, { min: 1 }), 1);

  const effectsTable = {
    tabName: "Effets",
    headers: ["Nom", "Cible", "Couleur", "Changement de valeur", "Image", "ID", "Jet", "Redéclencher l'effet"],
    rows: [
      row(["Folie forcée", "Folie", "", "=100", "", "E1", "", ""]),
      row(["Increvable", "Points de vie actuels", "", "≥1", "", "E2", "", "Non"]),
      row(["Malédiction", "Points de vie actuels", "", "-60", "", "E3", "1d20 16-20", ""]),
      row(["Saignement", "Points de vie actuels", "", "-1d20-20", "", "E4", "", ""]),
      row(["Brûlure", "Points de vie actuels", "", "-40", "", "E5", "", "Oui"]),
    ],
  };
  const statesTable = {
    tabName: "États",
    headers: ["Nom", "Description niveau 1", "Description niveau 2", "ID", "Niveau 1", "Niveau 2"],
    rows: [row(["Test", "x", "/", "T1", "Folie forcée, Increvable, Malédiction, Saignement, Brûlure", ""])],
  };
  const catalog = states.parseStatesCatalog([statesTable, effectsTable], {});
  const contributions = states.stateContributions(catalog, [{ id: "T1", name: "Test", level: 1 }], (name) => name);
  // Les effets lancés (jet, dés) ne changent rien tant qu'on ne les lance pas.
  assert.deepEqual(contributions.map((item) => [item.target, item.amount, item.label]), [["Folie", 0, "=100"], ["Points de vie actuels", 0, "≥1"]]);
  assert.deepEqual(catalog.effects.filter(states.isRolledEffect).map((effect) => effect.name), ["Malédiction", "Saignement"]);
  // « Redéclencher l'effet » coché : jamais temporaire (absent ci-dessus), déclenché à la demande.
  assert.deepEqual(states.triggeredEffectsOf(catalog, { id: "T1", name: "Test", level: 1 }).map((effect) => effect.name), ["Brûlure"]);
});

test("un état retiré emporte ce que ses effets ont écrit, sauf ce qui est décoché (dégâts sur la vie)", async () => {
  const defs = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  const effects = {
    tabName: "Effets",
    headers: ["Nom", "Cible", "Changement de valeur", "Redéclencher l'effet", "Retiré en sortant de l'état"],
    rows: [
      row(["Faiblesse", "Force", "-1d10", "Oui", "Oui"]),
      row(["Brûlure", "Points de vie actuels", "-1d6", "Oui", "Non"]),
      // Case vide (effet ajouté après coup) : cochée.
      row(["Lenteur", "Dextérité", "-5", "Oui", ""]),
    ],
  };
  const catalog = states.parseStatesCatalog([tables[0], effects], columns);
  assert.deepEqual(catalog.effects.map((effect) => [effect.name, effect.resetOnExit]), [["Faiblesse", true], ["Brûlure", false], ["Lenteur", true]]);
  // Ce que chaque lancer a écrit est noté sur l'état, et relu tel quel depuis la fiche.
  let posted = [{ id: "ETA-1", name: "Poison", level: 1 }, { id: "ETA-2", name: "Effrayé", level: 1 }];
  posted = states.withStateWrites(posted, "poison", [{ id: "w1", effect: "Faiblesse", cell: 20, delta: -7 }, { id: "w1", effect: "Brûlure", cell: 9, delta: -4 }]);
  posted = states.withStateWrites(posted, "Poison", [{ id: "w2", effect: "Faiblesse", cell: 20, delta: -3 }, { id: "w2", effect: "Lenteur", cell: 21, delta: -5 }]);
  posted = states.parseCharacterStates(JSON.parse(JSON.stringify(posted)));
  assert.equal(posted[0].written.length, 4);
  assert.equal(posted[1].written, undefined);
  // Retiré : Force +10 (deux lancers), Dextérité +5 ; la vie ne remonte pas.
  assert.deepEqual(states.writesToRevert(catalog, [posted[0]]), [{ cell: 20, delta: -10 }, { cell: 21, delta: -5 }]);
  // « Annuler » sur un lancer : il n'est plus à retirer.
  const undone = states.withoutStateWrites(posted, "w2");
  assert.deepEqual(states.writesToRevert(catalog, [undone[0]]), [{ cell: 20, delta: -7 }]);
  assert.deepEqual(states.withoutStateWrites(undone, "w1")[0], { id: "ETA-1", name: "Poison", level: 1 });
  // Un effet disparu de l'index ne retire rien.
  assert.deepEqual(states.writesToRevert(catalog, [{ id: "x", name: "X", level: 1, written: [{ id: "w", effect: "Inconnu", cell: 3, delta: 2 }] }]), []);
  // La colonne ajoutée aux index existants : cochée, sauf les effets sur la vie actuelle.
  assert.equal(defs.effectResetDefault("Force, Dextérité"), "Oui");
  assert.equal(defs.effectResetDefault("Points de vie actuels"), "Non");
  assert.equal(defs.effectResetDefault("<b>Points de vie actuels</b>, Force"), "Non");
  assert.equal(defs.effectResetDefault(""), "Oui");
  assert.ok(defs.worldIndexColumnFills.states.some((fill) => fill.column === "Retiré en sortant de l'état"));
});
