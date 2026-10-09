import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Toutes les installations d'Eraser se partagent le quota de Google Sheets : chaque requête
// évitée compte. Les lectures groupées et la liste des onglets gardée en mémoire, avec le vrai
// lib/google-sheets.ts branché sur un Google en mémoire.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-reads-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;
beforeEach(() => google.reset());

test("Deux onglets entiers du même classeur demandés ensemble : une seule requête à Google", async () => {
  const id = fresh("onglets");
  google.addSpreadsheet(id, [
    { title: "États", grid: [["Nom", "Effet"], ["Effrayé", "-2"]] },
    { title: "Effets", grid: [["Nom"], ["Peur"]] },
  ]);
  const [states, effects] = await Promise.all([
    sheets.readFormattedSheet(id, ["États"], { light: true }),
    sheets.readFormattedSheet(id, ["Effets"], { light: true }),
  ]);
  assert.equal(google.world.calls.length, 1);
  assert.equal(states.tabName, "États");
  assert.equal(states.rows[1][0].value, "Effrayé");
  assert.equal(effects.tabName, "Effets");
  assert.equal(effects.rows[1][0].value, "Peur");
});

test("Un onglet absent dans une lecture groupée : seul celui-là échoue, les autres arrivent", async () => {
  const id = fresh("absent");
  google.addSpreadsheet(id, [{ title: "Jauges", grid: [["ID"], ["J1"]] }]);
  const [gauges, forms] = await Promise.allSettled([
    sheets.readFormattedSheet(id, ["Jauges"]),
    sheets.readFormattedSheet(id, ["Formes"]),
  ]);
  assert.equal(gauges.status, "fulfilled");
  assert.equal(gauges.value.rows[1][0].value, "J1");
  assert.equal(forms.status, "rejected");
});

test("La liste des onglets gardée en mémoire : une requête pour toutes les lectures, relue après un changement de structure", async () => {
  const id = fresh("liste");
  google.addSpreadsheet(id, [{ title: "Classes", grid: [["ID"]] }]);
  const metadata = () => google.world.calls.filter((call) => call.url.includes("fields=sheets.properties")).length;
  await sheets.cachedSpreadsheetTabs(id, ["Classes"]);
  await sheets.cachedSpreadsheetTabs(id, ["Classes"]);
  await sheets.cachedSpreadsheetTabs(id);
  assert.equal(metadata(), 1);
  // Avant de créer un onglet, la liste est toujours relue.
  await sheets.spreadsheetTabs(id);
  assert.equal(metadata(), 2);
  // Une écriture d'Eraser qui change la structure du classeur fait oublier la copie.
  sheets.clearSpreadsheetReadCache(id);
  await sheets.cachedSpreadsheetTabs(id, ["Classes"]);
  assert.equal(metadata(), 3);
});
