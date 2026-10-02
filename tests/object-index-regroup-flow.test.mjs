import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le vrai module de regroupement, branché sur un Drive et un Sheets en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const fake = `${root}tests/fakes/regroup-google.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true },
  resolve: { alias: [
    { find: /^@\/lib\/(google-drive|google-sheets|index-schema|index-settings)$/, replacement: fake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); });
const google = await vite.ssrLoadModule(fake);
const flow = await vite.ssrLoadModule("/lib/object-index-regroup-server.ts");

beforeEach(() => {
  google.reset();
  google.addFolder("objets", "Objets");
  google.addSpreadsheet("objet", "Index Objet", "objets", [{ sheetId: 0, title: "Index des objets", grid: [["Nom", "Type", "Description"], ["Corde", "Outil", "10 m"], ["", "", ""], ["Lanterne", "Outil", "=IMAGE(x)"]] }]);
  google.addSpreadsheet("armes", "Index armes", "objets", [{ sheetId: 7, title: "Feuille 1", grid: [["ID", "Nom", "Type"], ["ARM-1", "Épée", "Arme"], ["", "Arc", "Arme"]] }, { sheetId: 8, title: "Eraser · colonnes", grid: [["Onglet", "Colonne"], ["Feuille 1", "Type", "", "{\"kind\":\"choice\"}"]] }]);
  google.world.views.push({ index: "objects", source: "objet:0" }, { index: "objects", source: "*" });
});

const tabs = (id) => google.world.files.get(id).tabs;
const inObjects = () => [...google.world.files.values()].filter((file) => file.parent === "objets").map((file) => file.name).sort();

test("le regroupement copie, garde les identifiants, vérifie puis bascule", async () => {
  const result = await flow.regroupObjectIndexes();
  const merged = google.world.files.get(result.fileId);
  assert.equal(merged.name, "Index des objets");
  assert.equal(merged.parent, "objets");
  assert.deepEqual(inObjects(), ["Anciens index d’objets (avant regroupement)", "Index des objets"]);
  assert.deepEqual(merged.tabs.filter((tab) => !tab.title.startsWith("Eraser")).map((tab) => tab.title), ["Objets", "Armes"]);
  // Les anciens classeurs sont intacts, rangés dans la sauvegarde.
  const backup = google.world.files.get("objet").parent;
  assert.notEqual(backup, "objets");
  assert.equal(google.world.files.get("armes").parent, backup);
  assert.deepEqual(tabs("objet")[0].grid[1], ["Corde", "Outil", "10 m"]);
  // Les objets sans ID gardent celui que connaissent déjà les inventaires.
  const objets = merged.tabs.find((tab) => tab.title === "Objets");
  assert.equal(objets.grid[0][3], "ID");
  assert.equal(objets.grid[1][3], "DRIVE-objet-0-2");
  assert.equal(objets.grid[3][3], "DRIVE-objet-0-4");
  assert.equal(objets.grid[3][2], "=IMAGE(x)");
  const armes = merged.tabs.find((tab) => tab.title === "Armes");
  assert.equal(armes.grid[1][0], "ARM-1");
  assert.equal(armes.grid[2][0], "DRIVE-armes-7-3");
  // Le schéma suit l'onglet renommé ; les onglets-fenêtres aussi.
  const schema = merged.tabs.find((tab) => tab.title === "Eraser · colonnes");
  assert.deepEqual(schema.grid[1].slice(0, 2), ["Armes", "Type"]);
  assert.equal(google.world.views[0].source, `${result.fileId}:${objets.sheetId}`);
  assert.equal(google.world.views[1].source, "*");
  assert.ok(merged.tabs.find((tab) => tab.title === "Eraser · regroupement")?.hidden);
  const status = await flow.objectIndexRegroupStatus();
  assert.equal(status.state, "regroupé");
});

test("l'annulation remet les anciens classeurs et range le classeur regroupé", async () => {
  const result = await flow.regroupObjectIndexes();
  await flow.revertObjectIndexRegroup();
  assert.deepEqual(inObjects(), ["Anciens index d’objets (avant regroupement)", "Index Objet", "Index armes"]);
  const merged = google.world.files.get(result.fileId);
  assert.notEqual(merged.parent, "objets");
  assert.match(merged.name, /^Index des objets · annulé le /);
  assert.equal(google.world.views[0].source, "objet:0");
  assert.equal((await flow.objectIndexRegroupStatus()).state, "séparé");
  // Relancer est possible : le nom n'est plus pris.
  await flow.regroupObjectIndexes();
  assert.deepEqual(inObjects(), ["Anciens index d’objets (avant regroupement)", "Index des objets"]);
});

test("un classeur « Index des objets » déjà présent n'est jamais recréé", async () => {
  google.addSpreadsheet("ancien", "Index des objets", "ailleurs", [{ sheetId: 0, title: "Feuille 1", grid: [] }]);
  await assert.rejects(flow.regroupObjectIndexes(), /OBJECT_REGROUP_NAME_TAKEN/);
  assert.deepEqual(inObjects(), ["Index Objet", "Index armes"]);
});

test("une copie incomplète n'est jamais basculée", async () => {
  google.world.failCopyOf = "armes:7";
  await assert.rejects(flow.regroupObjectIndexes(), /COPY_FAILED/);
  assert.deepEqual(inObjects(), ["Anciens index d’objets (avant regroupement)", "Index Objet", "Index armes"]);
  const attempt = [...google.world.files.values()].find((file) => file.name.startsWith("Index des objets"));
  assert.match(attempt.name, /essai interrompu/);
  assert.notEqual(attempt.parent, "objets");
  assert.equal(google.world.views[0].source, "objet:0");
});

test("une case différente dans la copie bloque la bascule et dit laquelle", async () => {
  google.world.corruptCopyOf = "objet:0";
  const failure = await flow.regroupObjectIndexes().catch((error) => error);
  assert.equal(failure.message, "OBJECT_REGROUP_VERIFY_FAILED");
  assert.match(failure.details[0], /^Objets : ligne 2, colonne 2/);
  assert.deepEqual(inObjects(), ["Anciens index d’objets (avant regroupement)", "Index Objet", "Index armes"]);
  assert.equal(google.world.views[0].source, "objet:0");
});
