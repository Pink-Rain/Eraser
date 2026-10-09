import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Le vrai lib/google-sheets.ts et la route des classes, branchés sur un Google Sheets en
// mémoire et un serveur partagé en mémoire. Cinq joueurs épuisaient le quota Google commun :
// un refus ne doit plus se démultiplier, et un PC neuf doit voir les classes sans Google.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-google-quota-"));
process.env.ERASER_DESKTOP_DATA_DIR = dataDir;
process.env.ERASER_MIGRATIONS_DIR = join(root, "drizzle");
const fake = `${root}tests/fakes/sheets-api.ts`;
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^cloudflare:workers$/, replacement: `${root}desktop/runtime/cloudflare-workers.ts` },
    { find: /^@\/lib\/google-oauth$/, replacement: fake },
    { find: /^@\/lib\/server-auth$/, replacement: `${root}tests/fakes/server-auth.ts` },
    { find: /^@\/lib\/shared-store$/, replacement: `${root}tests/fakes/shared-store.ts` },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); rmSync(dataDir, { recursive: true, force: true }); });
const google = await vite.ssrLoadModule(fake);
const sharedStore = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const share = await vite.ssrLoadModule("/lib/class-catalog-share.ts");
const catalogRoute = await vite.ssrLoadModule("/app/api/classes/catalog/route.ts");
const { session } = await vite.ssrLoadModule("/tests/fakes/server-auth.ts");

beforeEach(() => {
  google.reset();
  sharedStore.reset();
});

test("un refus de quota (429) est retenté une fois après la pause, pas cinq fois en rafale", async () => {
  google.addSpreadsheet("quota", [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Aldor"]] }]);
  google.failReads("Feuille", { status: 429, times: 1 });
  const rows = await sheets.readRange("quota", "Feuille!A1:B2");
  assert.deepEqual(rows, [["ID", "Nom"], ["1", "Aldor"]]);
  assert.equal(google.world.calls.filter((call) => call.url.includes("Feuille")).length, 2);
});

const berserker = { id: "CLA-0001", type: "Martiale", name: "Berserker", image: "", keywords: ["", "", ""], difficulty: "X", completion: 0, accentDark: "#3a1f1f", accentLight: "#f4d6d6", accentReady: true };
const rage = { rowNumber: 2, id: "SOR-0001", name: "Rage", effect: "Frappe plus fort.", effectHtml: "", description: "", descriptionHtml: "", type: "Action", category: "action", actionKind: "", skills: [], skillsRaw: "", distance: "", distanceHtml: "", charges: null, classRanks: { "CLA-0001": 0 }, tone: { background: "", foreground: "" } };

test("un joueur sur un PC neuf voit les classes et leurs sorts sans lire Google", async () => {
  // Une autre installation a lu Google et partagé ce qu'elle a lu.
  await share.shareClassCatalog({ classes: [berserker], spells: [rage], readAt: new Date().toISOString() });
  session.account = { uid: "joueur-1", email: "", displayName: "Lina", status: "actif", role: "joueur", accountRole: "joueur" };
  try {
    const classes = await sheets.listClasses();
    assert.deepEqual(classes.map((item) => item.name), ["Berserker"]);
    const response = await catalogRoute.GET(new Request("http://localhost/api/classes/catalog"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.classes.map((item) => item.id), ["CLA-0001"]);
    assert.deepEqual(body.spells.map((item) => item.name), ["Rage"]);
  } finally {
    session.account = { uid: "admin-test", email: "", displayName: "Admin", status: "actif", role: "admin", accountRole: "admin" };
  }
});

test("les bonus de rang restent proposés quand Google refuse : copie partagée, jamais modifiable", async () => {
  const { shareRankBonuses } = share;
  const table = { bonuses: [{ rank: 1, bonuses: [{ slot: 1, target: "Rapidité", value: "5", amount: 5 }], choose: 0, customSpell: false, other: "", entries: [] }], headers: ["Rang", "Cible 1", "Valeur 1"], sheetUrl: "", exists: true };
  await shareRankBonuses(table, new Date().toISOString());
  // Aucun classeur des sorts relié : la lecture Google échoue.
  const route = await vite.ssrLoadModule("/app/api/classes/rank-bonuses/route.ts");
  session.account = { uid: "joueur-1", email: "", displayName: "Lina", status: "actif", role: "joueur", accountRole: "joueur" };
  try {
    const response = await route.GET(new Request("http://localhost/api/classes/rank-bonuses"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.bonuses[0].rank, 1);
    assert.equal(body.canEdit, false);
  } finally {
    session.account = { uid: "admin-test", email: "", displayName: "Admin", status: "actif", role: "admin", accountRole: "admin" };
  }
});

test("chaque installation se présente à Google sous son propre identifiant de quota", async () => {
  google.addSpreadsheet("quota-user", [{ title: "Feuille", grid: [["ID"], ["1"]] }]);
  await sheets.readRange("quota-user", "Feuille!A1:A2");
  const call = google.world.calls.find((item) => item.url.includes("quota-user"));
  assert.match(call.url, /[?&]quotaUser=eraser-[a-z0-9]{8,32}(&|$)/);
});
