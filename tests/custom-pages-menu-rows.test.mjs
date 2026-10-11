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
  server: { middlewareMode: true },
});
after(async () => { await vite.close(); });
const menu = await vite.ssrLoadModule("/lib/app-menu.ts");
const menuStore = await vite.ssrLoadModule("/lib/app-menu-store.ts");
const replacements = await vite.ssrLoadModule("/lib/page-replacements.ts");
const rows = await vite.ssrLoadModule("/lib/custom-pages-rows.ts");
const pages = await vite.ssrLoadModule("/lib/custom-pages.ts");
const data = await vite.ssrLoadModule("/lib/custom-pages-data.ts");
const shared = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");

beforeEach(() => { shared.reset(); });

const keys = (items) => items.map((item) => item.children ? `${item.key}[${item.children.map((child) => child.key).join(",")}]` : item.key);

test("Menu d'Eraser par défaut : chaque rôle voit ses entrées, comme avant l'éditeur", () => {
  const player = menu.resolveMenu(null, { role: "joueur", pages: {} });
  assert.deepEqual(keys(player), ["accueil", "personnage", "regles[regles/classes,regles/vocabulaire,regles/combat,regles/hors-combat]"]);
  const mj = menu.resolveMenu(null, { role: "mj", pages: {} });
  assert.deepEqual(mj.map((item) => item.key), ["accueil", "dossier", "regles", "index-rouges", "index", "bac-a-sable", "pages"]);
  assert.deepEqual(mj.find((item) => item.key === "bac-a-sable").children.map((child) => child.key), ["bac-a-sable/tabletop", "bac-a-sable/magasin", "bac-a-sable/pnjs"]);
  // « Pages » (après le Bac à sable, jamais dedans) : son « + » crée une page.
  assert.deepEqual(mj.find((item) => item.key === "pages").action, { href: "/pages?nouvelle=1", label: "Nouvelle page" });
  const admin = menu.resolveMenu(null, { role: "admin", pages: {} });
  assert.deepEqual(admin.map((item) => item.key), ["accueil", "regles", "index-rouges", "index", "bac-a-sable", "pages", "administration"]);
  // Les pages créées apparaissent sous leur section (sauf si elles sont placées ailleurs dans le menu).
  const withPages = menu.resolveMenu([{ id: "page:p-2" }], { role: "joueur", pages: { "p-2": { title: "Dieux", href: "/regles/dieux", icon: "", emoji: "" } }, sectionPages: { regles: [{ title: "Guide", href: "/regles/guide", icon: "", emoji: "" }, { title: "Dieux", href: "/regles/dieux", icon: "", emoji: "" }] } });
  assert.deepEqual(withPages.find((item) => item.key === "regles").children.at(-1).pages.map((page) => page.title), ["Guide"]);
  assert.ok(withPages.some((item) => item.key === "page:p-2"));
  assert.equal(menu.menuItemActive({ href: "/regles", prefix: true }, "/regles/combat"), true);
  assert.equal(menu.menuItemActive({ href: "/", prefix: false }, "/regles"), false);
});

test("Menu réglé : ordre, libellés, masquage, sections ajoutées, pages placées ; masquer n'ouvre rien", () => {
  const items = [
    { id: "groupe:lore", label: "Le monde", icon: "globe", roles: ["joueur", "mj", "admin"], children: [{ id: "page:p-dieux", label: "Panthéon" }, { id: "regles/combat" }, { id: "lien:wiki", label: "Wiki", href: "https://exemple.fr/wiki", roles: ["joueur"] }] },
    { id: "accueil", label: "Le port" },
    { id: "regles", children: [{ id: "regles/classes", hidden: true }, { id: "regles/vocabulaire" }] },
    { id: "administration", hidden: true },
    { id: "page:p-secret" },
    { id: "obsolete-entry" },
    { id: "lien:bad", label: "Mauvais", href: "javascript:alert(1)" },
  ];
  const pagesForPlayer = { "p-dieux": { title: "Les dieux", href: "/regles/les-dieux", icon: "", emoji: "☀️" } };
  const player = menu.resolveMenu(items, { role: "joueur", pages: pagesForPlayer });
  assert.equal(player[0].key, "groupe:lore");
  assert.deepEqual(player[0].children.map((child) => [child.key, child.label]), [["page:p-dieux", "Panthéon"], ["regles/combat", "Combat"], ["lien:wiki", "Wiki"]]);
  assert.equal(player[1].label, "Le port");
  // « Classe » masquée ; « Hors combat » (absente du réglage) revient à sa place d'origine.
  assert.deepEqual(player.find((item) => item.key === "regles").children.map((child) => child.key), ["regles/vocabulaire", "regles/hors-combat"]);
  // Une page illisible pour ce compte, une entrée inconnue, un lien invalide : ignorés sans casser le menu.
  assert.ok(!JSON.stringify(player).includes("p-secret"));
  assert.ok(!JSON.stringify(player).includes("obsolete"));
  assert.ok(!JSON.stringify(player).includes("javascript"));
  // Les entrées des MJ ne s'ouvrent pas à un joueur parce qu'elles sont placées dans une section commune.
  assert.ok(!player.some((item) => item.key === "bac-a-sable"));
  const mj = menu.resolveMenu(items, { role: "mj", pages: {} });
  assert.deepEqual(mj[0].children.map((child) => child.key), ["regles/combat"]);
  // Une entrée d'Eraser absente du réglage (nouvelle version) apparaît à sa place par défaut.
  assert.ok(mj.some((item) => item.key === "bac-a-sable"));
});

test("Garde-fous : l'admin garde le Créateur de pages et l'éditeur du menu, même masqués", () => {
  const items = [{ id: "groupe:cache", label: "Rangé", hidden: true, roles: ["admin", "mj"], children: [{ id: "pages", hidden: true }] }];
  const admin = menu.resolveMenu(items, { role: "admin", pages: {} });
  const pagesEntry = admin.find((item) => item.key === "pages");
  assert.equal(pagesEntry.href, "/pages");
  assert.equal(pagesEntry.action.href, "/pages?nouvelle=1");
  const mj = menu.resolveMenu(items, { role: "mj", pages: {} });
  assert.ok(!JSON.stringify(mj).includes('"href":"/pages"'));
  // Un MJ ne règle pas les entrées réservées aux admins.
  const kept = menu.keepAdminEntries([{ id: "administration", hidden: true, label: "Caché", children: [] }, { id: "regles", hidden: true }], [{ id: "administration", label: "Admin" }]);
  assert.deepEqual(kept[0], { id: "administration", label: "Admin", children: [] });
  assert.equal(kept[1].hidden, true);
});

test("Menu sur le serveur partagé : enregistrer, refuser une version dépassée, rétablir puis remettre", async () => {
  assert.equal(await menuStore.readMenuLayout({ fresh: true }), null);
  const saved = await menuStore.saveMenuLayout([{ id: "accueil", label: "Le port" }], "", "Admin");
  assert.equal((await menuStore.readMenuLayout({ fresh: true })).items[0].label, "Le port");
  await assert.rejects(menuStore.saveMenuLayout([{ id: "accueil" }], "", "Morgane"), (error) => error.status === 409);
  await menuStore.saveMenuLayout([{ id: "accueil", label: "Le port v2" }], saved.updatedAt, "Admin");
  await menuStore.resetMenuLayout();
  assert.equal(await menuStore.readMenuLayout({ fresh: true }), null);
  assert.equal(await menuStore.hasPreviousMenu(), true);
  const restored = await menuStore.restorePreviousMenu("Admin");
  assert.equal(restored.items[0].label, "Le port v2");
  assert.equal(await menuStore.hasPreviousMenu(), false);
});

test("Remplacements : seules les pages d'Eraser prévues, jamais les routes techniques", () => {
  for (const path of ["/api", "/api/roll20/bridge", "/api/admin/google-drive/oauth/callback", "/connexion", "/administration/comptes-et-roles", "/administration/corbeille", "/administration/google-drive", "/pages", "/pages/atelier", "/pages/menu", "/campagne/[id]/roll20", "/fiche/creatures/CRE-1"]) {
    assert.equal(replacements.isReplaceablePath(path), false, path);
    assert.equal(replacements.isForbiddenReplacement(path), true, path);
  }
  for (const path of ["/", "/regles/combat", "/campagne/[id]/journal", "/personnage/[id]", "/ressources/index-des-lieux"]) assert.equal(replacements.isReplaceablePath(path), true, path);
  assert.equal(replacements.isReplaceablePath("/regles/une-page-creee"), false);
  assert.equal(replacements.matchesReplacement("/campagne/[id]/journal", "/campagne/CAMP-1/journal"), true);
  assert.equal(replacements.matchesReplacement("/campagne/[id]/journal", "/campagne/CAMP-1/pnjs"), false);
  assert.equal(replacements.matchesReplacement("/", "/"), true);
  assert.equal(replacements.matchesReplacement("/regles/combat", "/regles/combat/"), true);
  assert.equal(replacements.matchesReplacement("/regles/combat", "/connexion"), false);
  assert.equal(replacements.cleanReplaceMode("n'importe quoi"), "after");
});

const source = {
  key: "creatures",
  title: "Créatures",
  path: "/ressources/index-des-creatures",
  tables: [
    { tabName: "Bestiaire", headers: ["ID", "Nom", "Type", "Portrait", "Notes MJ", "Secret"], rows: [
      { values: ["CRE-1", "Sylphe des brumes", "Esprit", "https://exemple.fr/sylphe.png", "Faible au sel", "x"], html: ["CRE-1", "Sylphe des brumes", "<b>Esprit</b>", "https://exemple.fr/sylphe.png", "Faible au sel", "x"] },
    ] },
  ],
  columns: { "Bestiaire": [{ header: "Secret", spec: { kind: "text", hidden: true } }, { header: "Type", spec: { kind: "rich" } }] },
};
const places = {
  key: "places",
  title: "Lieux",
  path: "/ressources/index-des-lieux",
  tables: [{ tabName: "Lieux", headers: ["ID", "Nom", "Créatures", "Notes MJ"], rows: [
    { values: ["LIE-1", "Baie d'Ysmir", "Sylphe des brumes, Crabe", ""], html: ["LIE-1", "Baie d'Ysmir", "Sylphe des brumes, Crabe", ""] },
    { values: ["LIE-2", "Tour noire", "", "Voir"], html: ["LIE-2", "Tour noire", "", "<a href=\"/reference/creatures/CRE-1\">Sylphe</a>"] },
    { values: ["LIE-3", "Marais", "Crabe", ""], html: ["LIE-3", "Marais", "Crabe", ""] },
  ] }],
  columns: { "Lieux": [{ header: "Créatures", spec: { kind: "linked-choice", multiple: true, source: { index: "creatures", tab: "Bestiaire" } } }] },
};

test("Page de ligne : valeurs lisibles par le lecteur, « {Colonne} » rempli, colonnes privées effacées", () => {
  const hidden = (column) => column === "Notes MJ";
  const forPlayer = rows.rowContextOf(source, "CRE-1", { player: true, hiddenForPlayers: hidden });
  assert.equal(forPlayer.name, "Sylphe des brumes");
  assert.deepEqual(forPlayer.columns.map((column) => column.header), ["Nom", "Type", "Portrait"]);
  assert.deepEqual(forPlayer.hidden.sort(), ["ID", "Notes MJ", "Secret"]);
  assert.equal(rows.fillRowText("{Nom} ({Type}) — {Notes MJ} {Inconnue}", forPlayer), "Sylphe des brumes (Esprit) —  {Inconnue}");
  assert.equal(rows.fillRowText("<p>{Type}</p>", forPlayer, "html"), "<p><strong>Esprit</strong></p>");
  assert.equal(rows.rowImage("{Portrait}", forPlayer), "https://exemple.fr/sylphe.png");
  assert.equal(rows.rowContextOf(source, "CRE-404", { player: false }), null);
  const forMj = rows.rowContextOf(source, "CRE-1", { player: false, hiddenForPlayers: hidden });
  assert.ok(forMj.columns.some((column) => column.header === "Notes MJ"));
  // Le modèle rempli : titre, image et textes de la page.
  const modelSections = [{ id: "s", layout: "1", cols: [[{ id: "b-1", type: "image", src: "{Portrait}", caption: "{Nom}" }, { id: "b-2", type: "text", html: "<p>Type : {Type}. {Notes MJ}</p>" }]] }];
  const template = pages.parseCustomPage({ id: "p-modele", title: "{Nom}", slug: "fiche-creature", place: "hors-menu", status: "publiee", rowOf: { index: "creatures" }, sections: modelSections, published: { title: "{Nom}", sections: modelSections } });
  assert.equal(template.sections[0].cols[0][0].src, "{Portrait}");
  const filled = rows.fillRowPage(pages.pageForViewer(template, { role: "joueur", uid: "j" }), forPlayer);
  assert.equal(filled.title, "Sylphe des brumes");
  assert.equal(filled.sections[0].cols[0][0].src, "https://exemple.fr/sylphe.png");
  assert.ok(!JSON.stringify(filled).includes("Faible au sel"));
  assert.equal(rows.rowPageHref("perso-quetes", "QUE 1"), "/fiche/perso-quetes/QUE%201");
  assert.equal(rows.templateForRow([{ rowOf: { index: "creatures" }, updatedAt: "1", trashedAt: "" }, { rowOf: { index: "creatures", tab: "Bestiaire" }, updatedAt: "0", trashedAt: "" }], "creatures", "Bestiaire").rowOf.tab, "Bestiaire");
  assert.equal(rows.templateForRow([{ rowOf: { index: "places" }, updatedAt: "1", trashedAt: "" }], "creatures", "Bestiaire"), null);
});

test("Page de ligne : vue filtrée sur la ligne, « Cité dans », liens vers les pages de ligne", () => {
  const target = { index: "creatures", id: "CRE-1", name: "Sylphe des brumes" };
  const view = data.viewBlockData(places, { tab: "Lieux", kind: "table", limit: 0, match: { column: "Créatures", ...target } }, { presentations: {}, cards: {} }, { player: true, rowPageOf: (index, tab, id) => `/fiche/${index}/${id}` });
  assert.deepEqual(view.rows.map((row) => row.name), ["Baie d'Ysmir"]);
  assert.equal(view.rows[0].href, "/fiche/places/LIE-1");
  const forMj = rows.backlinksOf([places, source], target, { player: false });
  assert.deepEqual(forMj.map((link) => [link.name, link.column]), [["Baie d'Ysmir", "Créatures"], ["Tour noire", "Notes MJ"]]);
  // Un joueur ne découvre pas un lien par une colonne qu'il ne voit pas.
  const forPlayer = rows.backlinksOf([places, source], target, { player: true, hiddenForPlayers: (column) => column === "Notes MJ", hrefOf: (index, tab, id) => `/fiche/${index}/${id}` });
  assert.deepEqual(forPlayer.map((link) => [link.name, link.href]), [["Baie d'Ysmir", "/fiche/places/LIE-1"]]);
  assert.equal(data.cellCitesRow("Forêt - Sylphe des brumes", "-", target), true);
  assert.equal(data.cellCitesRow("Sylphes", undefined, target), false);
});
