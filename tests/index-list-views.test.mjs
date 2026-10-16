import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// La Liste réunie (en-tête, barre d'outils, pied, règles, onglets des groupes, clic par rôle,
// détail modifiable), les rôles d'une ligne, les boutons des cartes et l'onglet ouvert d'abord
// selon une colonne : leurs règles pures se relisent et se bornent, les anciennes formes restent.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const views = await vite.ssrLoadModule("/lib/index-presentations.ts");
const roles = await vite.ssrLoadModule("/lib/view-roles.ts");
const cards = await vite.ssrLoadModule("/lib/index-cards.ts");
const actions = await vite.ssrLoadModule("/lib/index-actions.ts");
const layouts = await vite.ssrLoadModule("/lib/index-layouts.ts");

test("la Liste : en-tête, barre d'outils, pied, règles, onglets, clic par rôle se relisent et se bornent", () => {
  const layout = views.cleanPresentation({
    kind: "list",
    header: { title: "PNJ de Valombre", text: "Les personnages croisés.", icon: "🎭", count: true, place: "detail", bizarre: 1 },
    toolbar: { tools: [{ type: "search", placeholder: "Chercher un PNJ…", columns: ["Nom", "Rôle"] }, { type: "filter", column: "Attitude", multi: true }, { type: "sort", columns: ["Nom", "Niveau"] }, { type: "count", word: "PNJ" }, { type: "add", label: "Nouveau", roles: ["mj-owner", "admin", "pirate"] }, { type: "fly" }, { type: "filter" }], place: "detail" },
    footer: { count: true, word: "PNJ", totals: [{ op: "sum", column: "Niveau", label: "niveaux" }, { op: "median" }], limit: 2 },
    emptyText: "Aucun PNJ.",
    rules: [{ column: "PV", op: "lt", value: "15", tint: "#b3261e", icon: "🩸" }, { column: "PV", op: "huge" }, { op: "is" }],
    groupTabs: { place: "left", style: "folder", vertical: true },
    clickByRole: { player: "none", "mj-owner": "side", ghost: "page", admin: "fly" },
    detail: { kind: "form", edit: "inline", editRoles: ["player-owner", "nobody"], locked: ["Notes MJ"] },
    click: "center",
    dragSections: true,
    multiValue: "first",
  });
  assert.deepEqual(layout.header, { title: "PNJ de Valombre", text: "Les personnages croisés.", icon: "🎭", count: true, place: "detail" });
  assert.deepEqual(layout.toolbar, { tools: [{ type: "search", placeholder: "Chercher un PNJ…", columns: ["Nom", "Rôle"] }, { type: "filter", column: "Attitude", multi: true }, { type: "sort", columns: ["Nom", "Niveau"] }, { type: "count", word: "PNJ" }, { type: "add", label: "Nouveau", roles: ["mj-owner", "admin"] }], place: "detail" });
  // La limite du pied est bornée (5 au moins) ; une formule inconnue tombe.
  assert.deepEqual(layout.footer, { count: true, word: "PNJ", totals: [{ op: "sum", column: "Niveau", label: "niveaux" }], limit: 5 });
  assert.equal(layout.emptyText, "Aucun PNJ.");
  assert.deepEqual(layout.rules, [{ column: "PV", op: "lt", value: "15", tint: "#b3261e", icon: "🩸" }]);
  assert.deepEqual(layout.groupTabs, { place: "left", style: "folder", vertical: true });
  assert.deepEqual(layout.clickByRole, { player: "none", "mj-owner": "side" });
  assert.deepEqual(layout.detail, { kind: "form", edit: "inline", editRoles: ["player-owner"], locked: ["Notes MJ"] });
  assert.equal(layout.click, "center");
  assert.equal(layout.dragSections, true);
  assert.equal(layout.multiValue, "first");
  // Le dessin d'office des onglets (en haut, soulignés) ne s'écrit pas.
  assert.equal(views.cleanPresentation({ kind: "list", groupTabs: { place: "top", style: "underline" } }).groupTabs, undefined);
  // Une vue d'avant ne gagne rien.
  assert.deepEqual(views.cleanPresentation({ kind: "master-detail", detail: { kind: "form" } }), { kind: "master-detail", detail: { kind: "form" } });
});

test("la barre d'outils garde les lignes cherchées et filtrées ; une règle de couleur vraie l'emporte", () => {
  const rows = { a: { Nom: "Aldric", Rôle: "Forgeron", Attitude: "Allié", PV: "30" }, b: { Nom: "Brune", Rôle: "Espionne", Attitude: "Hostile, Allié", PV: "8" }, c: { Nom: "Corvin", Rôle: "Garde", Attitude: "", PV: "12" } };
  const valueOf = (row, column) => rows[row][column] ?? "";
  const nameOf = (row) => rows[row].Nom;
  const toolbar = { tools: [{ type: "search", columns: ["Nom", "Rôle"] }, { type: "filter", column: "Attitude", multi: true }] };
  assert.deepEqual(views.toolbarRows(["a", "b", "c"], toolbar, { query: "espion", filters: {} }, valueOf, nameOf), ["b"]);
  assert.deepEqual(views.toolbarRows(["a", "b", "c"], toolbar, { query: "", filters: { 1: ["Allié"] } }, valueOf, nameOf), ["a", "b"]);
  // « Sans valeur » : la pastille vide garde les lignes sans valeur.
  assert.deepEqual(views.toolbarRows(["a", "b", "c"], toolbar, { query: "", filters: { 1: [""] } }, valueOf, nameOf), ["c"]);
  // Sans colonnes, la recherche lit le nom ; les accents ne comptent pas.
  assert.deepEqual(views.toolbarRows(["a", "b", "c"], { tools: [{ type: "search" }] }, { query: "ALDRIC", filters: {} }, valueOf, nameOf), ["a"]);
  const rules = [{ column: "PV", op: "lt", value: "10", tint: "#b3261e" }, { column: "PV", op: "lt", value: "15", icon: "🩸" }, { column: "Attitude", op: "is", value: "Allié", dim: true }];
  assert.equal(views.ruleFor(rules, "b", valueOf).tint, "#b3261e");
  assert.equal(views.ruleFor(rules, "c", valueOf).icon, "🩸");
  assert.equal(views.ruleFor(rules, "a", valueOf).dim, true);
  assert.equal(views.ruleFor([{ column: "Attitude", op: "empty" }], "c", valueOf).op, "empty");
  assert.equal(views.ruleFor([{ column: "Attitude", op: "empty" }], "a", valueOf), undefined);
});

test("les rôles d'une ligne : joueur de la campagne, propriétaire, MJ de la campagne, admin", () => {
  const player = { role: "joueur", characters: [{ id: "PJ-1", name: "Aldric", campaigns: [{ id: "CAMP-1", name: "Valombre" }] }], campaigns: [], context: [] };
  const row = (cells, name = "Brune") => ({ name, id: cells.ID, cell: (header) => cells[header] ?? "", headers: Object.keys(cells) });
  // Une ligne de la campagne du joueur : joueur de la campagne ; sa propre fiche : propriétaire.
  assert.deepEqual([...roles.viewerRolesFor(player, row({ Campagne: "Valombre" }))].sort(), ["player", "player-campaign"]);
  assert.deepEqual([...roles.viewerRolesFor(player, row({ ID: "PJ-1", Campagne: "Autre" }, "Aldric"))].sort(), ["player", "player-owner"]);
  // La ligne d'un de ses personnages (colonne « Personnage ») : propriétaire.
  assert.ok(roles.viewerRolesFor(player, row({ Personnage: "Aldric" })).has("player-owner"));
  // Sans campagne dans la ligne : celle du personnage choisi.
  assert.ok(!roles.viewerRolesFor(player, row({})).has("player-campaign"));
  assert.ok(roles.viewerRolesFor({ ...player, context: [{ id: "CAMP-1", name: "Valombre" }] }, row({})).has("player-campaign"));
  const mj = { role: "mj", characters: [], campaigns: [{ id: "CAMP-1", name: "Valombre" }], context: [{ id: "CAMP-1", name: "Valombre" }] };
  assert.deepEqual([...roles.viewerRolesFor(mj, row({}))].sort(), ["mj", "mj-owner"]);
  assert.deepEqual([...roles.viewerRolesFor(mj, row({ Campagne: "Une autre" }))], ["mj"]);
  assert.deepEqual([...roles.viewerRolesFor({ role: "admin", characters: [], campaigns: [], context: [] }, row({}))], ["admin"]);
  // Aucun rôle choisi : tout le monde ; « Joueur » couvre aussi le propriétaire.
  assert.equal(roles.allowedFor(undefined, new Set(["player"])), true);
  assert.equal(roles.allowedFor(["player"], roles.simulatedRoles("player-owner")), true);
  assert.equal(roles.allowedFor(["mj-owner", "admin"], roles.simulatedRoles("mj")), false);
  assert.equal(roles.allowedFor(["mj"], roles.simulatedRoles("mj-owner")), true);
  // Le clic du rôle le plus précis l'emporte.
  assert.equal(roles.pickForRole({ player: "none", "player-owner": "side" }, roles.simulatedRoles("player-owner"), "sheet"), "side");
  assert.equal(roles.pickForRole({ player: "none" }, roles.simulatedRoles("mj"), "sheet"), "sheet");
  assert.deepEqual(roles.cleanViewRoles(["admin", "pirate", "player"]), ["player", "admin"]);
});

test("les cartes : leur clic, le bloc Boutons et ses étapes se relisent et se bornent", () => {
  const card = cards.parseCardTemplate({
    id: "c1", name: "Carte", click: "form", clickForm: "court",
    blocks: [{ id: "b1", type: "buttons", align: "right", stretch: true, buttons: [
      { id: "x1", label: "Ouvrir", icon: "file-text", look: "outline", roles: ["mj-owner", "dragon"], steps: [{ type: "open-form", form: "court" }, { type: "evil" }] },
      { id: "x2", label: "Supprimer", color: "#b3261e", confirm: "Supprimer {Nom} ?", look: "solid", steps: [{ type: "delete" }] },
      { id: "x3", label: "Hasard", steps: [{ type: "random-row", index: "", tab: "" }, { type: "open-row", index: "places", row: "{Lieu}", form: "" }] },
    ] }],
  });
  assert.equal(card.click, "form");
  assert.equal(card.clickForm, "court");
  const block = card.blocks[0];
  assert.equal(block.type, "buttons");
  assert.equal(block.stretch, true);
  assert.deepEqual(block.buttons[0], { id: "x1", label: "Ouvrir", icon: "file-text", look: "outline", roles: ["mj-owner"], steps: [{ type: "open-form", form: "court" }] });
  // « Plein » est l'office : il ne s'écrit pas.
  assert.deepEqual(block.buttons[1], { id: "x2", label: "Supprimer", color: "#b3261e", confirm: "Supprimer {Nom} ?", steps: [{ type: "delete" }] });
  // Les réglages facultatifs vides restent absents (cet index, l'onglet de la ligne, sa fiche).
  assert.deepEqual(block.buttons[2].steps, [{ type: "random-row" }, { type: "open-row", index: "places", row: "{Lieu}" }]);
  // La fiche est l'office du clic : rien n'est écrit.
  assert.equal(cards.parseCardTemplate({ id: "c2", name: "Carte", click: "sheet", blocks: [] }).click, undefined);
  assert.equal(actions.cleanActionStep({ type: "open-eraser", href: "/ressources/index/places", extra: 1 }).href, "/ressources/index/places");
  assert.equal(actions.cleanActionStep({ type: "nope" }), null);
});

test("les nouvelles étapes : un formulaire ici, une ligne d'un autre index, une page d'Eraser, au hasard", async () => {
  const calls = [];
  const runtime = {
    row: () => ({ column: (name) => ({ Nom: "Brune", Lieu: "Valombre, Port-Sel" })[name] }),
    cell: () => "", specOf: () => undefined, setCell: async () => undefined, confirm: async () => true,
    notify: (message, tone) => calls.push(["notify", message, tone]), openUrl: () => undefined, navigate: (href) => calls.push(["navigate", href]), copy: async () => undefined,
    openForm: (form) => calls.push(["form", form]),
    openRow: async (index, name, form) => calls.push(["row", index, name, form]),
    randomRow: async (index, tab) => calls.push(["random", index, tab]),
    showCard: (card) => calls.push(["card", card]),
  };
  await actions.runActionButton({ id: "1", label: "", steps: [{ type: "open-form" }] }, runtime);
  await actions.runActionButton({ id: "2", label: "", steps: [{ type: "open-row", index: "places", row: "{Lieu}" }] }, runtime);
  await actions.runActionButton({ id: "3", label: "", steps: [{ type: "open-eraser", href: "/tabletop" }] }, runtime);
  await actions.runActionButton({ id: "4", label: "", steps: [{ type: "random-row" }, { type: "show-card", card: "" }] }, runtime);
  // Une page d'Eraser commence par « / » : une adresse web n'en est pas une.
  await actions.runActionButton({ id: "5", label: "", steps: [{ type: "open-eraser", href: "https://exemple.org" }] }, runtime);
  assert.deepEqual(calls.slice(0, 5), [["form", "principal"], ["row", "places", "Valombre", undefined], ["navigate", "/tabletop"], ["random", undefined, undefined], ["card", "*"]]);
  assert.equal(calls[5][0], "notify");
  assert.equal(calls[5][2], "error");
});

test("le formulaire : l'onglet ouvert d'abord selon une colonne de la ligne", () => {
  const layout = layouts.parseIndexLayout({
    aside: [],
    sections: [{ id: "s1", title: "Général", rows: [{ id: "r1", fields: [{ column: "Nom" }] }] }, { id: "s2", title: "Combat", rows: [{ id: "r2", fields: [{ column: "PV" }] }] }, { id: "s3", title: "Magie", rows: [{ id: "r3", fields: [{ column: "Sorts" }] }] }],
    tabs: true,
    tabsBy: { column: "Type", map: [{ value: "Guerrier", section: "s2" }, { value: "Mage", section: "s3" }, { value: "Fantôme", section: "s9" }, { value: "" }] },
  });
  // Un onglet disparu ou une valeur vide tombent.
  assert.deepEqual(layout.tabsBy, { column: "Type", map: [{ value: "Guerrier", section: "s2" }, { value: "Mage", section: "s3" }] });
  const ids = ["s1", "s2", "s3"];
  assert.equal(layouts.firstTabFor(layout.tabsBy, () => "Mage", ids), "s3");
  assert.equal(layouts.firstTabFor(layout.tabsBy, () => "guerrier", ids), "s2");
  // Plusieurs valeurs : la première qui a un onglet.
  assert.equal(layouts.firstTabFor(layout.tabsBy, () => "Barde, Mage", ids), "s3");
  assert.equal(layouts.firstTabFor(layout.tabsBy, () => "Barde", ids), undefined);
  // Renommer la colonne suit.
  assert.equal(layouts.renameLayoutColumns(layout, new Map([["type", "Classe"]])).tabsBy.column, "Classe");
  // Sans onglets, le réglage ne sert pas à l'affichage.
  assert.equal(layouts.arrangeLayout({ ...layout, tabs: undefined }, [], (item) => item).tabsBy, undefined);
});
