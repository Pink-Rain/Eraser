import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const cards = await vite.ssrLoadModule("/lib/index-cards.ts");

const sample = {
  id: "carte-1",
  name: "Portrait",
  width: "sm",
  band: true,
  accent: { column: "Couleur", color: "#927640" },
  media: { column: "Portrait", position: "top", aspect: "4/5", fit: "cover" },
  blocks: [
    { id: "b1", type: "title", column: "Nom", size: "lg", font: "display", badges: ["Type"] },
    { id: "b2", type: "line", parts: [{ column: "Classe" }, { column: "Rang", prefix: "rang " }], separator: " · ", tone: "accent" },
    { id: "b3", type: "bar", column: "PV", maxColumn: "PV max", label: "PV", showValue: true },
  ],
};

test("une carte se relit telle qu'enregistrée, et rien d'autre", () => {
  assert.deepEqual(cards.parseCardTemplate(JSON.stringify(sample)), sample);
  assert.equal(cards.parseCardTemplate(""), null);
  assert.equal(cards.parseCardTemplate("pas du json"), null);
  assert.equal(cards.parseCardTemplate({ name: "Vide", blocks: [] }), null);
  // Un bloc inconnu, une taille ou un format inconnus, une couleur qui n'en est pas une : écartés.
  const cleaned = cards.parseCardTemplate({
    name: "x",
    accent: { color: "rouge" },
    blocks: [{ type: "inconnu" }, { type: "title", column: "Nom", size: "xxl", tone: "javascript:alert(1)" }, { type: "image", column: "Image", aspect: "5/7", width: 900 }],
  });
  assert.equal(cleaned.accent, undefined);
  assert.equal(cleaned.blocks.length, 2);
  assert.equal(cleaned.blocks[0].size, undefined);
  assert.equal(cleaned.blocks[0].tone, undefined);
  assert.equal(cleaned.blocks[1].aspect, undefined);
  assert.equal(cleaned.blocks[1].width, 100);
});

test("les cartes d'un onglet : la liste, la carte par défaut, une liste vide qui reste vide", () => {
  const parsed = cards.parseTabCards({ cards: [sample, { ...sample, id: "carte-2", name: "Autre" }, sample], defaultId: "carte-2" });
  assert.deepEqual(parsed.cards.map((card) => card.id), ["carte-1", "carte-2"]);
  assert.equal(parsed.defaultId, "carte-2");
  assert.equal(cards.parseTabCards({ cards: [sample], defaultId: "absente" }).defaultId, undefined);
  assert.deepEqual(cards.parseTabCards({ cards: [] }), { cards: [] });
  assert.equal(cards.parseTabCards("{"), null);
  assert.equal(cards.pickCard(parsed, "carte-1").id, "carte-1");
  assert.equal(cards.pickCard(parsed, "inconnue").id, "carte-2");
  assert.equal(cards.pickCard({ cards: [] }, null), null);
});

test("les index qui avaient des cartes les gardent, tant que rien n'est enregistré", () => {
  for (const [index, tab] of [["characters", "Personnages"], ["campaigns", "Campagnes"], ["classes", "Classes"], ["class-spells", "Sorts"], ["creature-spells", "Sorts des créatures"], ["npcs", "PNJs"], ["achievements", "Succès"], ["states", "États"], ["weapon-modifiers", "Tout"], ["vocabulary", "Vocabulaire"], ["creatures", "Créatures"], ["objects", "Armes"]]) {
    const entry = cards.tabCardsOf({}, index, tab);
    assert.ok(entry.builtin, index);
    assert.ok(entry.cards.length > 0, `${index} a des cartes d'office`);
    // Chaque carte d'Eraser se relit à l'identique : elle peut être enregistrée telle quelle.
    for (const card of entry.cards) assert.deepEqual(cards.parseCardTemplate(card), card, `${index} › ${card.name}`);
  }
  assert.deepEqual(cards.tabCardsOf({}, "achievements", "Obtenus").cards, []);
  assert.deepEqual(cards.tabCardsOf({}, "places", "Villes").cards, []);
  // Enregistrées (même vides) : celles-là, plus celles d'Eraser.
  assert.deepEqual(cards.tabCardsOf({ Personnages: { cards: [] } }, "characters", "personnages"), { cards: [], builtin: false });
  assert.equal(cards.tabCardsOf({ Personnages: { cards: [sample] } }, "characters", "Personnages").cards[0].id, "carte-1");
});

test("une colonne renommée suit, une colonne absente est repérée", () => {
  const renamed = cards.renameCardColumns(sample, new Map([["classe", "Classe(s)"], ["pv max", "Vie totale"], ["couleur", "Teinte"]]));
  assert.equal(renamed.blocks[1].parts[0].column, "Classe(s)");
  assert.equal(renamed.blocks[2].maxColumn, "Vie totale");
  assert.equal(renamed.accent.column, "Teinte");
  assert.equal(renamed.blocks[0].column, "Nom");
  assert.deepEqual(cards.cardColumns(sample), ["Portrait", "Couleur", "Nom", "Type", "Classe", "Rang", "PV", "PV max"]);
  assert.deepEqual(cards.missingCardColumns(sample, ["Nom", "nom", "Portrait", "Type", "Classe", "Rang", "PV"]), ["Couleur", "PV max"]);
});

test("les formes de départ se remplissent avec les colonnes de l'onglet", () => {
  const columns = [
    { header: "ID", spec: { kind: "id" } },
    { header: "Nom", spec: { kind: "name-form" } },
    { header: "Portrait", spec: { kind: "file", file: { accept: "image" } } },
    { header: "Type", spec: { kind: "choice", options: [{ value: "Ville", color: "#285f8f" }] } },
    { header: "Couleur", spec: { kind: "color" } },
    { header: "Description", spec: { kind: "rich" } },
    { header: "Population", spec: { kind: "number" } },
  ];
  const roles = cards.cardRoles(columns);
  assert.equal(roles.name, "Nom");
  assert.equal(roles.image, "Portrait");
  assert.equal(roles.color, "Couleur");
  assert.equal(roles.description, "Description");
  assert.deepEqual(roles.choices, ["Type"]);
  assert.deepEqual(roles.numbers, ["Population"]);
  for (const starter of cards.cardStarters) {
    const card = starter.build(columns);
    assert.ok(cards.parseCardTemplate(card), starter.key);
    assert.deepEqual(cards.missingCardColumns(card, columns.map((column) => column.header)), [], starter.key);
    assert.ok(!cards.cardColumns(card).includes("ID"), starter.key);
  }
});

test("les valeurs d'une case se lisent comme sur une carte", () => {
  assert.equal(cards.plainCardText("<p>Une <b>épée</b>&nbsp;longue</p><p>forgée</p>"), "Une épée longue forgée");
  assert.equal(cards.readableListValue("[\"Orc des Terres Libres\",\"Elfe\"]"), "Orc des Terres Libres, Elfe");
  assert.equal(cards.readableListValue("{\"values\":[\"Le Juste\",\"Le Sans-Peur\"],\"selected\":\"Le Sans-Peur\"}"), "Le Sans-Peur");
  assert.equal(cards.readableListValue("[pas une liste"), "[pas une liste");
  assert.deepEqual(cards.cardListValues("Feu, Glace | Foudre"), ["Feu", "Glace", "Foudre"]);
  assert.equal(cards.cardNumber("18 / 24"), 18);
  assert.equal(cards.cardNumber("3,5 kg"), 3.5);
  assert.equal(cards.cardNumber("—"), null);
  assert.ok(cards.isCardColor("#aa3355"));
  assert.ok(!cards.isCardColor("rouge"));
});
