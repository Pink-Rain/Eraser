import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: [
    { find: /^@\/lib\/shared-store$/, replacement: `${root}tests/fakes/shared-store.ts` },
    { find: /^@\//, replacement: root },
  ] },
  server: { middlewareMode: true, hmr: false },
});
after(async () => { await vite.close(); });
const folders = await vite.ssrLoadModule("/lib/page-folders.ts");
const store = await vite.ssrLoadModule("/lib/page-folders-store.ts");
const explorer = await vite.ssrLoadModule("/lib/page-explorer.ts");
const menu = await vite.ssrLoadModule("/lib/app-menu.ts");
const pagesIndex = await vite.ssrLoadModule("/lib/pages-index.ts");
const shared = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");

beforeEach(() => { shared.reset(); store.forgetPageFolders(); });

const tree = (state) => state.folders.map((folder) => `${folder.name}<${state.folders.find((other) => other.id === folder.parent)?.name ?? ""}`).sort();

test("Dossiers relus : boucles cassées, parents inconnus et pages rangées dans un dossier disparu remis à la racine", () => {
  const clean = folders.cleanPageFolders({
    folders: [
      { id: "d-lore", name: "  Lore  ", parent: "" },
      { id: "d-dieux", name: "Dieux", parent: "d-lore" },
      { id: "d-aaaa", name: "A", parent: "d-bbbb" },
      { id: "d-bbbb", name: "B", parent: "d-aaaa" },
      { id: "d-orphelin", name: "Orphelin", parent: "d-inconnu" },
      { id: "d-lore", name: "Doublon", parent: "" },
      { id: "pas un id", name: "Mauvais" },
    ],
    placement: { "p-1": "d-dieux", "eraser:/regles/combat": "d-lore", "p-2": "d-inconnu", "pas une clé !": "d-lore" },
  });
  assert.deepEqual(tree(clean), ["A<", "B<A", "Dieux<Lore", "Lore<", "Orphelin<"]);
  // Plus aucune boucle : chaque dossier remonte à la racine.
  for (const folder of clean.folders) assert.ok(folders.folderPath(clean, folder.id).length >= 1);
  assert.equal(clean.folders.find((folder) => folder.id === "d-lore").name, "Lore");
  assert.equal(clean.folders.find((folder) => folder.id === "d-orphelin").parent, "");
  assert.deepEqual(clean.placement, { "p-1": "d-dieux", "eraser:/regles/combat": "d-lore" });
  assert.equal(folders.cleanPageFolders("illisible").folders.length, 0);
});

test("Ranger : créer, renommer, imbriquer (jamais dans soi-même), supprimer sans rien perdre", () => {
  let state = folders.emptyFolders();
  state = folders.applyFolderOps(state, [
    { op: "create", id: "d-lore", name: "Lore", parent: "" },
    { op: "create", id: "d-dieux", name: "Dieux", parent: "d-lore" },
    { op: "create", id: "d-sud", name: "Du Sud", parent: "d-dieux" },
    { op: "place", keys: ["p-1", "p-2"], folder: "d-dieux" },
    { op: "place", keys: ["eraser:/regles/combat"], folder: "d-sud" },
    { op: "rename", id: "d-dieux", name: "Les dieux" },
  ]);
  assert.equal(folders.folderPathLabel(state, "d-sud"), "Lore › Les dieux › Du Sud");
  // Un dossier ne va ni dans lui-même ni dans un de ses sous-dossiers.
  const same = folders.applyFolderOps(state, [{ op: "move-folder", id: "d-lore", parent: "d-sud" }]);
  assert.equal(same.folders.find((folder) => folder.id === "d-lore").parent, "");
  const counts = folders.folderCounts(state, ["p-1", "p-2", "eraser:/regles/combat", "p-3"]);
  assert.equal(counts.get("d-lore"), 3);
  assert.equal(counts.get("d-sud"), 1);
  // Supprimer « Les dieux » : ses pages et « Du Sud » remontent dans « Lore ».
  const deleted = folders.applyFolderOps(state, [{ op: "delete", id: "d-dieux" }]);
  assert.deepEqual(deleted.placement, { "p-1": "d-lore", "p-2": "d-lore", "eraser:/regles/combat": "d-sud" });
  assert.equal(deleted.folders.find((folder) => folder.id === "d-sud").parent, "d-lore");
  // Retirer d'un dossier : la page redevient non rangée.
  const out = folders.applyFolderOps(deleted, [{ op: "place", keys: ["p-1"], folder: "" }]);
  assert.equal(folders.folderOf(out, "p-1"), "");
  // Une demande illisible n'est pas une opération.
  assert.equal(folders.cleanFolderOp({ op: "place", keys: ["<script>"], folder: "d-lore" }), null);
  assert.equal(folders.cleanFolderOp({ op: "effacer-tout" }), null);
});

test("Serveur partagé : chaque enregistrement refait ses gestes sur le rangement relu (deux admins en même temps)", async () => {
  await Promise.all([
    store.updatePageFolders([{ op: "create", id: "d-lore", name: "Lore", parent: "" }], "Admin A"),
    store.updatePageFolders([{ op: "create", id: "d-sessions", name: "Sessions", parent: "" }], "Admin B"),
  ]);
  const saved = await store.readPageFolders();
  assert.deepEqual(saved.folders.map((folder) => folder.name).sort(), ["Lore", "Sessions"]);
  await store.updatePageFolders([{ op: "place", keys: ["p-1"], folder: "d-lore" }], "Admin A");
  // La copie en mémoire suit l'enregistrement : la coque n'attend rien.
  assert.equal(store.knownPageFolders().placement["p-1"], "d-lore");
  assert.ok(shared.store.calls.some((call) => call.startsWith("set custom-page-folders rangement")));
});

const summary = (overrides) => ({ id: "p-1", title: "Page", icon: "", emoji: "", description: "", href: "/pages/page", slug: "page", place: "hors-menu", campaignId: "", vis: "tous", status: "publiee", unpublished: false, blocks: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", updatedBy: "Admin", trashedAt: "", editable: true, ...overrides });
const eraserEntry = (path, label, group, page) => ({ path, label, group, icon: "swords", description: "", vis: "tous", redrawn: false, ...(page ? { page } : {}) });

test("Explorateur : pages d'Eraser et pages créées sous la même forme, une seule ligne par page", () => {
  const rows = explorer.explorerPages([
    summary({ id: "p-guide", title: "Guide du joueur", href: "/regles/guide", place: "regles" }),
    // La reprise de « Combat », jamais publiée ni modifiée : les lecteurs voient la page d'Eraser.
    summary({ id: "p-combat", title: "Combat", href: "/pages/regles-combat", status: "brouillon", unpublished: true, replaces: "/regles/combat", replaceMode: "replace" }),
    // La reprise de « Journal », modifiée depuis : publiée, « modifiée ».
    summary({ id: "p-journal", title: "Journal", status: "brouillon", unpublished: true, replaces: "/campagne/[id]/journal", replaceMode: "replace", updatedAt: "2026-10-02T00:00:00.000Z" }),
  ], [
    eraserEntry("/regles/combat", "Combat", "Règles", { id: "p-combat", title: "Combat", status: "brouillon", mode: "replace", unpublished: true }),
    eraserEntry("/campagne/[id]/journal", "Journal d’une campagne", "Campagnes", { id: "p-journal", title: "Journal", status: "brouillon", mode: "replace", unpublished: true }),
    eraserEntry("/bac-a-sable/tabletop", "Tabletop", "Bac à sable"),
  ]);
  assert.deepEqual(rows.map((row) => row.key).sort(), ["eraser:/bac-a-sable/tabletop", "eraser:/campagne/[id]/journal", "eraser:/regles/combat", "p-guide"]);
  const combat = rows.find((row) => row.key === "eraser:/regles/combat");
  assert.equal(combat.href, "/regles/combat");
  assert.equal(combat.status, "publiee");
  assert.equal(combat.unpublished, false);
  assert.equal(combat.where, "Règles");
  const journal = rows.find((row) => row.key === "eraser:/campagne/[id]/journal");
  assert.equal(journal.status, "publiee");
  assert.equal(journal.unpublished, true);
  assert.equal(journal.visitable, false);
  const tabletop = rows.find((row) => row.key === "eraser:/bac-a-sable/tabletop");
  assert.equal(tabletop.id, "");
  assert.equal(tabletop.editable, true);
  assert.equal(tabletop.status, "publiee");
});

test("Explorateur : une reprise mise à la corbeille rend la page d'Eraser, rangée au même endroit", () => {
  const rows = explorer.explorerPages([
    summary({ id: "p-combat", title: "Combat maison", replaces: "/regles/combat", replaceMode: "replace", trashedAt: "2026-10-03T00:00:00.000Z" }),
  ], [eraserEntry("/regles/combat", "Combat", "Règles")]);
  const live = rows.filter((row) => !row.trashedAt);
  const trashed = rows.filter((row) => row.trashedAt);
  assert.deepEqual(live.map((row) => [row.key, row.title, row.id]), [["eraser:/regles/combat", "Combat", ""]]);
  assert.deepEqual(trashed.map((row) => [row.key, row.id]), [["eraser:/regles/combat", "p-combat"]]);
});

test("Ranger par section : un dossier par groupe, ceux de la racine réutilisés, les pages rangées ne bougent pas", () => {
  const rows = explorer.explorerPages([summary({ id: "p-guide", title: "Guide", place: "regles" }), summary({ id: "p-note", title: "Note", place: "hors-menu" })], [eraserEntry("/regles/combat", "Combat", "Règles"), eraserEntry("/bac-a-sable/tabletop", "Tabletop", "Bac à sable")]);
  const state = folders.applyFolderOps(folders.emptyFolders(), [{ op: "create", id: "d-regles", name: "Règles", parent: "" }, { op: "create", id: "d-perso", name: "Perso", parent: "" }, { op: "place", keys: ["p-note"], folder: "d-perso" }]);
  let next = 0;
  const plan = explorer.sectionFolderPlan(rows, state, () => `d-neuf${next += 1}`);
  assert.deepEqual(plan.create, [{ id: "d-neuf1", name: "Bac à sable" }]);
  assert.deepEqual(plan.place.map((entry) => [entry.folder, entry.keys.sort()]), [["d-regles", ["eraser:/regles/combat", "p-guide"]], ["d-neuf1", ["eraser:/bac-a-sable/tabletop"]]]);
});

test("Recherche de l'explorateur : titre, adresse et chemin du dossier, sans accents", () => {
  const state = folders.applyFolderOps(folders.emptyFolders(), [{ op: "create", id: "d-lore", name: "Légendes", parent: "" }, { op: "place", keys: ["p-1"], folder: "d-lore" }]);
  const [row] = explorer.explorerPages([summary({ id: "p-1", title: "Les dieux du Sud" })], []);
  assert.ok(explorer.matchesExplorerQuery(row, "legendes dieux", state));
  assert.ok(!explorer.matchesExplorerQuery(row, "nord", state));
});

const page = (title, href) => ({ title, href, icon: "", emoji: "" });

test("Menu : un dossier au premier niveau devient une section de ses pages, un groupe par sous-dossier", () => {
  const entries = { "d-lore": { label: "Lore", pages: [page("Royaumes", "/pages/royaumes")], children: ["d-dieux", "d-vide"] }, "d-dieux": { label: "Dieux", pages: [page("Dieu du Sud", "/regles/dieu-sud")], children: [] }, "d-vide": { label: "Vide", pages: [], children: [] } };
  const items = [{ id: "accueil" }, { id: "dossier:d-lore", roles: ["joueur", "mj", "admin"] }];
  const player = menu.resolveMenu(items, { role: "joueur", pages: {}, folders: entries });
  const lore = player.find((item) => item.key === "dossier:d-lore");
  assert.equal(lore.section, true);
  assert.equal(lore.label, "Lore");
  assert.deepEqual(lore.children.map((child) => child.dynamic === "dossier-pages" ? `${child.label}:${child.pages.map((entry) => entry.title).join("+")}` : child.label), ["Royaumes", "Dieux:Dieu du Sud"]);
  // Fermé à un rôle : rien ; dossier disparu ou sans page : rien.
  assert.equal(menu.resolveMenu([{ id: "dossier:d-lore", roles: ["mj", "admin"] }], { role: "joueur", pages: {}, folders: entries }).some((item) => item.key === "dossier:d-lore"), false);
  assert.equal(menu.resolveMenu([{ id: "dossier:d-vide", roles: ["joueur"] }], { role: "joueur", pages: {}, folders: entries }).some((item) => item.key === "dossier:d-vide"), false);
});

test("Menu : un dossier dans une section liste ses pages, qui ne se répètent pas dans les pages de la section", () => {
  const entries = { "d-dieux": { label: "Dieux", pages: [page("Dieu du Sud", "/regles/dieu-sud")], children: [] } };
  const items = [{ id: "regles", children: [{ id: "regles/classes" }, { id: "dossier:d-dieux", roles: ["joueur", "mj", "admin"] }, { id: "regles/pages" }] }];
  const resolved = menu.resolveMenu(items, { role: "joueur", pages: {}, sectionPages: { regles: [page("Dieu du Sud", "/regles/dieu-sud"), page("Guide", "/regles/guide")] }, folders: entries });
  const regles = resolved.find((item) => item.key === "regles");
  const folder = regles.children.find((child) => child.key === "dossier:d-dieux");
  assert.equal(folder.dynamic, "dossier-pages");
  assert.deepEqual(folder.pages.map((entry) => entry.title), ["Dieu du Sud"]);
  assert.deepEqual(regles.children.find((child) => child.key === "regles/pages").pages.map((entry) => entry.title), ["Guide"]);
  // Le réglage garde l'entrée et ses rôles ; une clé inventée est écartée.
  assert.deepEqual(menu.cleanMenuItems([{ id: "dossier:d-dieux", roles: ["mj"] }, { id: "dossier:../../x" }]), [{ id: "dossier:d-dieux", roles: ["mj"] }]);
  assert.deepEqual(menu.menuFolderIds(items), ["d-dieux"]);
});

test("Éditeur du menu : les pages d'une section deviennent des entrées, avant l'entrée automatique ; le menu montré ne change pas", () => {
  const items = menu.mergeMenu([{ id: "page:p-dieux" }]);
  const expanded = menu.expandSectionPages(items, { regles: ["p-guide", "p-dieux"] });
  const regles = expanded.find((node) => node.id === "regles");
  const ids = regles.children.map((child) => child.id);
  assert.deepEqual(ids.slice(-2), ["page:p-guide", "regles/pages"]);
  // Déjà placée ailleurs : pas répétée.
  assert.equal(ids.includes("page:p-dieux"), false);
  const context = { role: "joueur", pages: { "p-guide": page("Guide", "/regles/guide"), "p-dieux": page("Dieux", "/regles/dieux") }, sectionPages: { regles: [page("Dieux", "/regles/dieux"), page("Guide", "/regles/guide")] } };
  const flat = (list) => list.flatMap((item) => [item.label, ...(item.children ?? []).flatMap((child) => child.pages ? child.pages.map((entry) => entry.title) : [child.label])]);
  assert.deepEqual(flat(menu.resolveMenu(expanded, context)), flat(menu.resolveMenu(items, context)));
});

test("Index des pages : la colonne « Dossier » donne le chemin du dossier de chaque page", () => {
  const state = folders.applyFolderOps(folders.emptyFolders(), [{ op: "create", id: "d-regles", name: "Règles", parent: "" }, { op: "place", keys: ["eraser:/regles/combat"], folder: "d-regles" }]);
  const rows = pagesIndex.pagesIndexRows([], { uid: "admin-1", role: "admin" }, null, { folders: state });
  assert.equal(rows.find((row) => row.id === "eraser:/regles/combat").folder, "Règles");
  assert.equal(rows.find((row) => row.id === "eraser:/regles").folder, "");
  const source = pagesIndex.pagesIndexSourceOf(rows);
  const headers = source.tables[0].headers;
  const row = source.tables[0].rows.find((entry) => entry.values[headers.indexOf("ID")] === "eraser:/regles/combat");
  assert.equal(row.values[headers.indexOf("Dossier")], "Règles");
});

test("Menu : une page placée une à une n'est pas répétée par son dossier", () => {
  const entries = { "d-lore": { label: "Lore", pages: [page("Royaumes", "/pages/royaumes"), page("Guide", "/regles/guide")], children: [] } };
  const items = [{ id: "page:p-guide" }, { id: "dossier:d-lore", roles: ["joueur", "mj", "admin"] }];
  const resolved = menu.resolveMenu(items, { role: "joueur", pages: { "p-guide": page("Guide", "/regles/guide") }, folders: entries });
  assert.deepEqual(resolved.find((item) => item.key === "dossier:d-lore").children.map((child) => child.label), ["Royaumes"]);
  assert.ok(resolved.some((item) => item.key === "page:p-guide"));
});
