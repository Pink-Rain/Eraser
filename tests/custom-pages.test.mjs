import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
// Le serveur partagé (Worker) est remplacé par des enregistrements en mémoire.
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: [
    { find: /^@\/lib\/shared-store$/, replacement: `${root}tests/fakes/shared-store.ts` },
    { find: /^@\//, replacement: root },
  ] },
  server: { middlewareMode: true },
});
after(async () => { await vite.close(); });
const pages = await vite.ssrLoadModule("/lib/custom-pages.ts");
const store = await vite.ssrLoadModule("/lib/custom-pages-store.ts");
const blockData = await vite.ssrLoadModule("/lib/custom-pages-data.ts");
const shared = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");

beforeEach(() => { shared.reset(); store.forgetCustomPages(); });

const admin = { role: "admin", uid: "admin-1" };
const mj = { role: "mj", uid: "mj-1" };
const player = { role: "joueur", uid: "joueur-1" };
const by = { uid: "admin-1", name: "Admin" };

/** Une page complète comme la garde le serveur partagé. */
function stored(overrides = {}) {
  const content = {
    title: "Guide du joueur",
    icon: "book-open",
    emoji: "",
    description: "Tout pour commencer.",
    sections: [
      { id: "s-1", layout: "2", framed: false, cols: [
        [
          { id: "b-titre", type: "title", vis: "tous", eyebrow: "Bienvenue", text: "Avant la première partie", level: "h2", align: "left" },
          { id: "b-mj", type: "callout", vis: "mj", tone: "mj", title: "Pour le MJ", html: "<p>Le traître est le forgeron.</p>" },
          { id: "b-joueurs", type: "text", vis: "joueurs", html: "<p>Bienvenue à la table !</p>" },
        ],
        [
          { id: "b-secret", type: "secret", vis: "tous", title: "La carte au trésor", html: "<p>Sous le vieux chêne.</p>" },
          { id: "b-notes", type: "notes", vis: "tous", title: "Carnet de groupe", html: "<p>À compléter</p>", editors: ["joueur", "mj", "admin"] },
          { id: "b-admin", type: "text", vis: "admin", html: "<p>Note de construction</p>" },
        ],
      ] },
    ],
  };
  return pages.parseCustomPage({
    ...content,
    id: "p-guide",
    slug: "guide-du-joueur",
    place: "regles",
    campaignId: "",
    vis: "tous",
    status: "publiee",
    createdAt: "2026-10-01T10:00:00.000Z",
    createdBy: by,
    updatedAt: "2026-10-01T10:00:00.000Z",
    updatedBy: by,
    published: content,
    publishedAt: "2026-10-01T10:00:00.000Z",
    publishedBy: by,
    trashedAt: "",
    trashedBy: null,
    live: {},
    ...overrides,
  });
}

const blockIds = (view) => view.sections.flatMap((section) => section.cols.flat()).map((block) => block.id);

test("Adresses : tirées du titre, rangées sous leur section, noms des pages d'Eraser refusés", () => {
  assert.equal(pages.slugify("Guide du joueur : l’Éveil des Œuvres"), "guide-du-joueur-l-eveil-des-oeuvres");
  assert.equal(pages.pageHref({ place: "regles", slug: "guide", campaignId: "" }), "/regles/guide");
  assert.equal(pages.pageHref({ place: "bac-a-sable", slug: "ma-page", campaignId: "" }), "/bac-a-sable/ma-page");
  assert.equal(pages.pageHref({ place: "campagne", slug: "carte", campaignId: "CAMP-1" }), "/campagne/CAMP-1/pages/carte");
  assert.equal(pages.pageHref({ place: "hors-menu", slug: "notes", campaignId: "" }), "/pages/notes");
  assert.match(pages.slugProblem("combat", "regles"), /déjà l’adresse/);
  assert.match(pages.slugProblem("index", "ressources"), /déjà l’adresse/);
  assert.match(pages.slugProblem("index-des-quetes", "ressources"), /déjà l’adresse/);
  assert.match(pages.slugProblem("magasin", "bac-a-sable"), /déjà l’adresse/);
  assert.match(pages.slugProblem("comptes-et-roles", "administration"), /déjà l’adresse/);
  assert.match(pages.slugProblem("atelier", "hors-menu"), /déjà l’adresse/);
  assert.equal(pages.slugProblem("combat", "bac-a-sable"), "");
  assert.match(pages.slugProblem("guide", "regles", ["guide"]), /Une autre page/);
  assert.match(pages.slugProblem("Guide Joueur", "regles"), /sans accent/);
});

test("Nettoyage : rien d'exécutable, blocs inconnus écartés, colonnes ajustées à la disposition", () => {
  const draft = pages.cleanCustomPage({
    title: "  Ma   page ",
    place: "administration",
    vis: "tous",
    sections: [{ id: "s-1", layout: "1", cols: [
      [{ id: "b-1", type: "text", vis: "tous", html: "<p onclick=\"x()\">Salut<script>alert(1)</script></p>" }],
      [{ id: "b-2", type: "image", vis: "tous", src: "javascript:alert(1)", caption: "Carte" }, { id: "b-3", type: "inconnu" }],
    ] }, { id: "s-2", layout: "3", cols: [[{ id: "b-1", type: "quote", text: "doublon" }], [{ id: "b-4", type: "link", href: "/regles/combat", title: "Combat" }]] }],
  });
  assert.equal(draft.title, "Ma page");
  assert.equal(draft.slug, "ma-page");
  // Une page d'Administration n'est montrée qu'aux admins.
  assert.equal(draft.vis, "admin");
  assert.equal(draft.sections[0].cols.length, 1);
  assert.deepEqual(draft.sections[0].cols[0].map((block) => block.id), ["b-1", "b-2"]);
  assert.equal(draft.sections[0].cols[0][0].html, "<p>Salut</p>");
  assert.equal(draft.sections[0].cols[0][1].src, "");
  assert.equal(draft.sections[1].cols.length, 3);
  assert.deepEqual(draft.sections[1].cols.flat().map((block) => block.id), ["b-4"]);
  assert.equal(draft.sections[1].cols[1][0].href, "/regles/combat");
  assert.equal(pages.cleanImageSource("https://drive.google.com/x.png"), "https://drive.google.com/x.png");
  assert.equal(pages.cleanImageSource("/api/sheet-images/abc"), "/api/sheet-images/abc");
  assert.equal(pages.cleanImageSource("http://exemple.fr/x.png"), "");
  assert.equal(pages.cleanLinkHref("http://127.0.0.1:32147/campagne/C1"), "/campagne/C1");
  assert.equal(pages.cleanLinkHref("/api/admin/accounts"), "");
  // Remplacer une page d'Eraser ; une page par ligne d'index (jamais les deux à la fois).
  const later = pages.cleanCustomPage({ title: "Combat", replaces: "/regles/combat", replaceMode: "before" });
  assert.equal(later.replaces, "/regles/combat");
  assert.equal(later.replaceMode, "before");
  assert.equal(pages.cleanCustomPage({ title: "x", replaces: "/api/admin/accounts" }).replaces, undefined);
  assert.equal(pages.cleanCustomPage({ title: "x", replaces: "/regles/combat?x=1" }).replaces, undefined);
  const row = pages.cleanCustomPage({ title: "{Nom}", replaces: "/regles/combat", rowOf: { index: "creatures", tab: "" } });
  assert.deepEqual(row.rowOf, { index: "creatures" });
  assert.equal(row.replaces, undefined);
  // Une page de campagne (lisible selon ses membres) ne remplace pas une page d'Eraser.
  assert.equal(pages.cleanCustomPage({ title: "x", place: "campagne", campaignId: "C1", replaces: "/regles/combat" }).replaces, undefined);
});

test("Ce que reçoit chaque rôle : blocs masqués et secrets non révélés ne quittent pas le serveur", () => {
  const page = stored();
  const forPlayer = pages.pageForViewer(page, player);
  assert.deepEqual(blockIds(forPlayer), ["b-titre", "b-joueurs", "b-notes"]);
  assert.ok(!JSON.stringify(forPlayer).includes("Sous le vieux chêne"));
  assert.ok(!JSON.stringify(forPlayer).includes("forgeron"));
  assert.equal(forPlayer.editable, false);
  assert.equal(forPlayer.canReveal, false);
  const forMj = pages.pageForViewer(page, mj);
  assert.deepEqual(blockIds(forMj), ["b-titre", "b-mj", "b-secret", "b-notes"]);
  assert.equal(forMj.editable, true);
  const forAdmin = pages.pageForViewer(page, admin);
  assert.deepEqual(blockIds(forAdmin), ["b-titre", "b-mj", "b-secret", "b-notes", "b-admin"]);
  // Révélé : le secret part vers les joueurs, avec qui l'a révélé.
  const revealed = stored({ live: { "b-secret": { revealedAt: "2026-10-02T20:00:00.000Z", revealedBy: "Morgane" } } });
  const secret = pages.pageForViewer(revealed, player).sections[0].cols[1][0];
  assert.equal(secret.id, "b-secret");
  assert.equal(secret.revealedBy, "Morgane");
  assert.match(secret.html, /vieux chêne/);
  // Le carnet montre son dernier texte ; qui peut l'écrire est dit au lecteur.
  const written = stored({ live: { "b-notes": { html: "<p>Nous avons trouvé la clé.</p>", editedAt: "2026-10-03T10:00:00.000Z", editedBy: "Lina" } } });
  const notes = pages.pageForViewer(written, player).sections[0].cols[1][0];
  assert.equal(notes.html, "<p>Nous avons trouvé la clé.</p>");
  assert.equal(notes.canEdit, true);
  assert.equal(pages.canEditNotes({ editors: ["mj", "admin"], vis: "tous" }, "joueur"), false);
  assert.equal(pages.canEditNotes({ editors: ["joueur"], vis: "mj" }, "joueur"), false);
});

test("Brouillons, visibilité de la page, campagnes et droits de l'atelier", () => {
  const draft = stored({ status: "brouillon", published: null });
  assert.equal(pages.pageForViewer(draft, player), null);
  assert.equal(pages.pageForViewer(draft, mj).draft, true);
  const mjOnly = stored({ vis: "mj" });
  assert.equal(pages.pageForViewer(mjOnly, player), null);
  assert.ok(pages.pageForViewer(mjOnly, mj));
  const adminOnly = stored({ vis: "admin" });
  assert.equal(pages.pageForViewer(adminOnly, mj), null);
  assert.equal(pages.canEditPage(adminOnly, mj), false);
  assert.equal(pages.canEditPage(stored({ place: "administration" }), mj), false);
  // Index et Bac à sable ne sont ouverts qu'aux MJ et admins.
  assert.equal(pages.pageForViewer(stored({ place: "bac-a-sable" }), player), null);
  assert.equal(pages.pageForViewer(stored({ trashedAt: "2026-10-04T00:00:00.000Z" }), admin), null);
  const campaign = stored({ place: "campagne", campaignId: "CAMP-1" });
  assert.equal(pages.pageForViewer(campaign, player), null);
  assert.ok(pages.pageForViewer(campaign, { ...player, member: true }));
  assert.equal(pages.canEditPage(campaign, { ...mj, member: true }), false);
  assert.equal(pages.canEditPage(campaign, { ...mj, member: true, manager: true }), true);
  assert.equal(pages.canEditPage(campaign, admin), true);
  // Publiée puis modifiée : les joueurs lisent la version publiée, l'atelier le brouillon.
  const edited = stored({ title: "Nouveau titre" });
  assert.equal(pages.pageForViewer(edited, player).title, "Guide du joueur");
  assert.equal(pages.pageForViewer(edited, mj).unpublished, true);
  assert.equal(pages.pageForViewer(edited, mj, { draft: true }).title, "Nouveau titre");
  assert.equal(pages.pageForViewer(edited, player, { draft: true }).title, "Guide du joueur");
});

test("Modèles : contenu recopié avec de nouveaux identifiants, carnets dans leur dernier état", () => {
  const page = stored({ live: { "b-notes": { html: "<p>Texte écrit sur la page</p>", editedAt: "x", editedBy: "Lina" }, "b-secret": { revealedAt: "x", revealedBy: "M" } } });
  const content = pages.templateContent(page);
  assert.equal(pages.findBlock(content, "b-notes").html, "<p>Texte écrit sur la page</p>");
  let seed = 0;
  const copy = pages.reIdContent(content, () => (seed = (seed + 0.137) % 1));
  assert.notEqual(copy.sections[0].id, "s-1");
  assert.ok(!pages.allBlocks(copy).some((block) => block.id.startsWith("b-titre")));
  assert.equal(pages.allBlocks(copy).length, 6);
});

test("Serveur partagé : une grande page s'écrit en morceaux et se relit entière", async () => {
  const long = `<p>${"Une très longue chronique, ligne après ligne. 🐉 ".repeat(1200)}</p>`;
  const created = await store.createCustomPage({ title: "Chroniques", place: "regles", sections: [{ id: "s-1", layout: "1", cols: [[{ id: "b-1", type: "text", vis: "tous", html: long.slice(0, 19_000) }, { id: "b-2", type: "text", vis: "tous", html: long.slice(19_000, 38_000) }, { id: "b-3", type: "text", vis: "tous", html: long.slice(38_000, 57_000) }]] }] }, by);
  const records = [...shared.store.records.get(store.PAGES_SCOPE).entries()];
  assert.ok(records.length > 2, "la page est découpée");
  assert.ok(records.every(([, record]) => record.value.length <= 20_000), "chaque morceau tient dans une valeur du serveur partagé");
  store.forgetCustomPages();
  const read = await store.readCustomPage(created.id);
  assert.equal(pages.findBlock(read, "b-2").html, pages.findBlock(created, "b-2").html);
  const fresh = await store.readCustomPage(created.id, { fresh: true });
  assert.equal(JSON.stringify(fresh), JSON.stringify(read));
  // Réécrite plus courte : les anciens morceaux sont effacés.
  const saved = await store.saveCustomPage(created.id, { ...created, sections: [{ id: "s-1", layout: "1", cols: [[{ id: "b-1", type: "text", vis: "tous", html: "<p>Court</p>" }]] }] }, created.updatedAt, by);
  assert.deepEqual([...shared.store.records.get(store.PAGES_SCOPE).keys()], [created.id]);
  assert.equal(pages.findBlock(await store.readCustomPage(created.id, { fresh: true }), "b-1").html, "<p>Court</p>");
  assert.ok(saved.updatedAt > created.updatedAt);
  // Un morceau découpé ne coupe jamais un émoji en deux.
  const parts = store.splitChunks("a🐉b🐉", 2);
  assert.equal(parts.join(""), "a🐉b🐉");
  assert.ok(parts.every((part) => !/[\uD800-\uDBFF]$/.test(part)));
});

test("Deux personnes dans l'atelier : l'enregistrement parti d'une ancienne version est refusé", async () => {
  const created = await store.createCustomPage({ title: "Guide", place: "regles" }, by);
  const first = await store.saveCustomPage(created.id, { ...created, title: "Guide (Morgane)" }, created.updatedAt, { uid: "mj-1", name: "Morgane" });
  await assert.rejects(store.saveCustomPage(created.id, { ...created, title: "Guide (Noé)" }, created.updatedAt, { uid: "mj-2", name: "Noé" }), (error) => error.status === 409 && /Morgane/.test(error.userMessage));
  // Un carnet écrit sur la page ne bloque pas l'atelier.
  await store.updateLiveBlock(created.id, "b-x", (_, state) => ({ ...state, html: "<p>Note</p>", editedAt: "t", editedBy: "Lina" }));
  const again = await store.saveCustomPage(created.id, { ...first, title: "Guide (suite)" }, first.updatedAt, by);
  assert.equal(again.title, "Guide (suite)");
});

test("Publier, revenir à la version publiée, corbeille, adresses uniques", async () => {
  const created = await store.createCustomPage({ title: "Guide", place: "regles" }, by);
  const twin = await store.createCustomPage({ title: "Guide", place: "regles" }, by);
  assert.equal(twin.slug, "guide-2");
  const combat = await store.createCustomPage({ title: "Combat", place: "regles" }, by);
  assert.equal(combat.slug, "combat-2");
  await assert.rejects(store.saveCustomPage(twin.id, { ...twin, slug: "guide" }, twin.updatedAt, by), (error) => error.status === 409);
  const published = await store.publishCustomPage(created.id, created.updatedAt, by);
  assert.equal(published.status, "publiee");
  assert.equal(published.published.title, "Guide");
  const edited = await store.saveCustomPage(created.id, { ...published, title: "Guide abîmé" }, published.updatedAt, by);
  assert.equal(pages.hasUnpublishedChanges(edited), true);
  const reverted = await store.revertCustomPage(created.id, edited.updatedAt, by);
  assert.equal(reverted.title, "Guide");
  assert.equal(pages.hasUnpublishedChanges(reverted), false);
  await store.trashCustomPage(created.id, by);
  assert.equal(await store.findCustomPage("regles", "guide"), null);
  // L'adresse libérée est reprise : la page restaurée prend un numéro.
  await store.saveCustomPage(twin.id, { ...twin, slug: "guide" }, twin.updatedAt, by);
  const restored = await store.restoreCustomPage(created.id, by);
  assert.notEqual(restored.slug, "guide");
  await assert.rejects(store.deleteCustomPage(created.id), /CUSTOM_PAGE_NOT_TRASHED/);
  await store.trashCustomPage(created.id, by);
  await store.deleteCustomPage(created.id);
  assert.equal(await store.readCustomPage(created.id, { fresh: true }), null);
});

test("Modèles enregistrés sur le serveur partagé", async () => {
  const created = await store.createCustomPage({ title: "Fiche de lieu", place: "hors-menu", sections: [{ id: "s-1", layout: "2", cols: [[{ id: "b-1", type: "title", text: "Le lieu" }], [{ id: "b-2", type: "notes", title: "Rumeurs", editors: ["joueur"] }]] }] }, by);
  const template = await store.savePageTemplate(created, "Lieu", by);
  const list = await store.listPageTemplates();
  assert.deepEqual(list.map((item) => item.name), ["Lieu"]);
  assert.equal(list[0].content.sections[0].cols.length, 2);
  assert.notEqual(pages.allBlocks(list[0].content)[0].id, "b-1");
  await assert.rejects(store.savePageTemplate(created, "  ", by), /CUSTOM_TEMPLATE_NAME/);
  await store.deletePageTemplate(template.id);
  assert.deepEqual(await store.listPageTemplates(), []);
});

test("Bloc Vue : forme propre à la page gardée pour une présentation, refusée pour le tableau et les cartes", () => {
  const kept = pages.cleanBlock({ id: "b-vue1", type: "view", index: "npcs", tab: "Bibliothèque", kind: "table", viewId: "v-12", layout: { kind: "kanban", kanbanColumn: "Rang", evil: true } });
  assert.equal(kept.kind, "kanban");
  assert.deepEqual(kept.layout, { kind: "kanban", kanbanColumn: "Rang" });
  assert.equal(kept.viewId, "v-12");
  const table = pages.cleanBlock({ id: "b-vue2", type: "view", index: "npcs", tab: "Bibliothèque", kind: "table", layout: { kind: "stats" } });
  assert.equal(table.kind, "table");
  assert.equal(table.layout, undefined);
  assert.equal(table.viewId, undefined);
});

test("Données d'un bloc Vue ou Stat : colonnes privées et masquées retirées, lignes sans lien pour un joueur", () => {
  const source = {
    key: "npcs",
    title: "PNJs",
    path: "/ressources/index-des-pnjs",
    tables: [
      { tabName: "Bibliothèque", headers: ["ID", "Nom du PNJ", "Titre", "Notes MJ", "Secret", "Rang"], rows: [
        { values: ["PNJ-1", "Aldric", "Forgeron", "Traître", "x", "2"], html: ["PNJ-1", "Aldric", "<b>Forgeron</b>", "Traître", "x", "2"] },
        { values: ["PNJ-2", "Brisa", "Aubergiste", "", "", "1"], html: ["PNJ-2", "Brisa", "Aubergiste", "", "", "1"] },
      ] },
      { tabName: "Campagne", headers: ["ID", "Nom du PNJ", "Titre"], rows: [{ values: ["PNJ-3", "Cerin", "Garde"], html: ["PNJ-3", "Cerin", "Garde"] }] },
    ],
    columns: { "Bibliothèque": [{ header: "Titre", spec: { kind: "rich" } }, { header: "Secret", spec: { kind: "text", hidden: true } }, { header: "Rang", spec: { kind: "choice", options: [{ value: "1", color: "#111111" }, { value: "2" }] } }] },
  };
  const hidden = (column) => column === "Notes MJ";
  const settings = { presentations: { "Bibliothèque": { kanban: { kind: "kanban", kanbanColumn: "Notes MJ", fields: ["Titre", "Notes MJ"] } } }, cards: {} };
  const forPlayer = blockData.viewBlockData(source, { tab: "bibliotheque", kind: "kanban", limit: 1 }, settings, { player: true, hiddenForPlayers: hidden });
  assert.deepEqual(forPlayer.headers, ["Nom du PNJ", "Titre", "Rang"]);
  assert.equal(forPlayer.rows.length, 1);
  assert.equal(forPlayer.total, 2);
  assert.equal(forPlayer.rows[0].href, undefined);
  assert.equal(forPlayer.rows[0].cells[1], "<b>Forgeron</b>");
  assert.ok(!JSON.stringify(forPlayer).includes("Traître"));
  assert.equal(forPlayer.layout.kanbanColumn, undefined);
  assert.deepEqual(forPlayer.layout.fields, ["Titre"]);
  const forMj = blockData.viewBlockData(source, { tab: "Bibliothèque", kind: "table", limit: 0 }, settings, { player: false, hiddenForPlayers: hidden });
  assert.deepEqual(forMj.headers, ["Nom du PNJ", "Titre", "Notes MJ", "Rang"]);
  assert.equal(forMj.rows[0].href, "/ressources/index-des-pnjs?ligne=PNJ-1");
  assert.equal(forMj.rows[0].name, "Aldric");
  assert.equal(blockData.viewBlockData(source, { tab: "Inconnu", kind: "table", limit: 0 }, settings, { player: false }), null);
  assert.deepEqual(blockData.viewKindsOf(settings.presentations, "Bibliothèque"), ["kanban"]);
  // Une présentation non réglée dans l'index : sa forme par défaut, jamais le tableau.
  const gallery = blockData.viewBlockData(source, { tab: "Bibliothèque", kind: "gallery", limit: 0 }, settings, { player: false });
  assert.equal(gallery.view, "gallery");
  assert.equal(gallery.layout.kind, "gallery");
  // La forme propre à la page l'emporte sur celle de l'index, colonnes cachées retirées pour un joueur.
  const own = blockData.viewBlockData(source, { tab: "Bibliothèque", kind: "kanban", limit: 0, layout: { kind: "kanban", kanbanColumn: "Rang", fields: ["Titre", "Notes MJ"] } }, settings, { player: true, hiddenForPlayers: hidden });
  assert.equal(own.layout.kanbanColumn, "Rang");
  assert.deepEqual(own.layout.fields, ["Titre"]);
  // Une vue enregistrée de l'index : seulement ses lignes (condition lue même sur une colonne masquée), avec sa présentation.
  const view = { match: "toutes", conditions: [{ column: "Secret", operator: "non-vide", value: "" }], layout: { kind: "list", fields: ["Titre"] } };
  const saved = blockData.viewBlockData(source, { tab: "Bibliothèque", kind: "list", limit: 0, view }, settings, { player: true, hiddenForPlayers: hidden });
  assert.deepEqual(saved.rows.map((row) => row.name), ["Aldric"]);
  assert.equal(saved.layout.kind, "list");
  assert.ok(!saved.headers.includes("Secret"));
  const stat = blockData.statBlockData(source, { stats: [{ id: "st-1", title: "Par rang", measure: "count", by: ["Rang"], form: "bars" }], groups: [] }, "st-1", { player: true, hiddenForPlayers: hidden });
  assert.deepEqual(stat.columns, ["Nom du PNJ", "Titre", "Rang", "Onglet"]);
  assert.equal(stat.rows.length, 3);
  assert.equal(stat.rows[2].cells[3], "Campagne");
  assert.equal(stat.stats.length, 1);
  assert.equal(stat.stats[0].pinned, true);
  assert.deepEqual(stat.options.Rang, [{ value: "1", color: "#111111" }, { value: "2" }]);
  assert.equal(blockData.statBlockData(source, { stats: [], groups: [] }, "st-1", { player: false }), null);
  // « Toutes les épinglées » : celles de l'onglet stat, dans leur ordre ; aucune : un bloc vide, pas une erreur.
  const record = { stats: [{ id: "st-1", title: "A", measure: "count", by: ["Rang"], form: "bars", pinned: true }, { id: "st-2", title: "B", measure: "count", by: ["Rang"], form: "bars" }, { id: "st-3", title: "C", measure: "count", by: ["Titre"], form: "bars", pinned: true, width: "half" }], groups: [] };
  assert.deepEqual(blockData.statBlockData(source, record, blockData.ALL_PINNED_STATS, { player: false }).stats.map((item) => item.id), ["st-1", "st-3"]);
  assert.deepEqual(blockData.statBlockData(source, { stats: [], groups: [] }, blockData.ALL_PINNED_STATS, { player: false }).stats, []);
});

test("Bloc Vue : preset, carte choisie, conditions et tri gardés à l'enregistrement", () => {
  const block = pages.cleanBlock({ id: "b-vue3", type: "view", index: "npcs", tab: "Bibliothèque", kind: "kanban", presetId: "eraser:kanban-narrow", cardId: "carte-2", where: { match: "une", conditions: [{ column: "Rang", operator: "est", value: "2" }, { column: "", operator: "est", value: "x" }, { column: "Titre", operator: "pirate", value: "x" }] }, sort: { column: "Rang", desc: true } });
  assert.equal(block.presetId, "eraser:kanban-narrow");
  assert.equal(block.cardId, "carte-2");
  assert.deepEqual(block.where, { match: "une", conditions: [{ column: "Rang", operator: "est", value: "2" }] });
  assert.deepEqual(block.sort, { column: "Rang", desc: true });
  // Une forme propre l'emporte : le preset n'est pas gardé ; sans condition lisible, pas de `where`.
  const own = pages.cleanBlock({ id: "b-vue4", type: "view", index: "npcs", tab: "Bibliothèque", kind: "list", presetId: "eraser:list-compact", layout: { kind: "list" }, where: { conditions: [] }, sort: { column: "" } });
  assert.equal(own.presetId, undefined);
  assert.equal(own.where, undefined);
  assert.equal(own.sort, undefined);
});

test("Données d'un bloc Vue : conditions (colonnes masquées comprises), tri avant la limite, preset et carte choisis", () => {
  const source = {
    key: "creatures",
    title: "Créatures",
    path: "/ressources/index-des-creatures",
    tables: [{ tabName: "Bestiaire", headers: ["ID", "Nom", "Type", "Niveau", "Secret"], rows: [
      { values: ["C-1", "Gobelin", "Commun", "2", ""], html: ["C-1", "Gobelin", "Commun", "2", ""] },
      { values: ["C-2", "Dragon", "Boss", "12", "oui"], html: ["C-2", "Dragon", "Boss", "12", "oui"] },
      { values: ["C-3", "Liche", "Boss", "9", ""], html: ["C-3", "Liche", "Boss", "9", ""] },
      { values: ["C-4", "Rat", "Commun", "1", ""], html: ["C-4", "Rat", "Commun", "1", ""] },
    ] }],
    columns: { Bestiaire: [{ header: "Secret", spec: { kind: "text", hidden: true } }] },
  };
  const cards = { Bestiaire: { cards: [{ id: "carte-a", name: "A", blocks: [] }, { id: "carte-b", name: "B", blocks: [] }], defaultId: "carte-a" } };
  const settings = { presentations: { Bestiaire: { kanban: { kind: "kanban", kanbanColumn: "Type" } } }, cards };
  const options = { player: true };
  const bosses = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "table", limit: 0, where: { match: "toutes", conditions: [{ column: "Type", operator: "est", value: "Boss" }] } }, settings, options);
  assert.deepEqual(bosses.rows.map((row) => row.name), ["Dragon", "Liche"]);
  const notBoss = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "table", limit: 0, where: { match: "toutes", conditions: [{ column: "Type", operator: "n-est-pas", value: "boss" }] } }, settings, options);
  assert.deepEqual(notBoss.rows.map((row) => row.name), ["Gobelin", "Rat"]);
  const secret = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "table", limit: 0, where: { match: "toutes", conditions: [{ column: "Secret", operator: "non-vide", value: "" }] } }, settings, options);
  assert.deepEqual(secret.rows.map((row) => row.name), ["Dragon"]);
  assert.ok(!secret.headers.includes("Secret"));
  const either = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "table", limit: 0, where: { match: "une", conditions: [{ column: "Nom", operator: "est", value: "Rat" }, { column: "Niveau", operator: "superieur", value: "10" }] } }, settings, options);
  assert.deepEqual(either.rows.map((row) => row.name), ["Dragon", "Rat"]);
  // Le tri s'applique avant « Au plus » : les deux plus hauts niveaux.
  const top = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "table", limit: 2, sort: { column: "Niveau", desc: true } }, settings, options);
  assert.deepEqual(top.rows.map((row) => row.name), ["Dragon", "Liche"]);
  assert.equal(top.total, 4);
  // Un preset : sa forme, d'abord ; celui d'une autre présentation est ignoré.
  const preset = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "kanban", limit: 0, preset: { kind: "kanban", laneWidth: "narrow", kanbanColumn: "Niveau" } }, settings, options);
  assert.equal(preset.layout.laneWidth, "narrow");
  assert.equal(preset.layout.kanbanColumn, "Niveau");
  const wrong = blockData.viewBlockData(source, { tab: "Bestiaire", kind: "kanban", limit: 0, preset: { kind: "list", compact: true } }, settings, options);
  assert.equal(wrong.layout.kanbanColumn, "Type");
  // La carte choisie devient celle par défaut ; une carte inconnue laisse celle à l'étoile.
  assert.equal(blockData.viewBlockData(source, { tab: "Bestiaire", kind: "cards", limit: 0, cardId: "carte-b" }, settings, options).cards.defaultId, "carte-b");
  assert.equal(blockData.viewBlockData(source, { tab: "Bestiaire", kind: "cards", limit: 0, cardId: "carte-z" }, settings, options).cards.defaultId, "carte-a");
});
