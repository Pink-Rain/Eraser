import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Toutes les installations partagent le quota Google d'un même compte : un refus (429) doit
// mettre toute l'installation en pause, l'arrière-plan doit céder sa place, et les classes
// lues par une installation doivent pouvoir servir aux autres (copie du serveur partagé).
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [
    { find: /^@\/lib\/shared-store$/, replacement: `${root}tests/fakes/shared-store.ts` },
    { find: "@", replacement: root },
  ] },
});
after(async () => { await vite.close(); });
const quota = await vite.ssrLoadModule("/lib/google-quota.ts");
const share = await vite.ssrLoadModule("/lib/class-catalog-share.ts");
const fakeStore = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");

test("un refus de quota met toute l'installation en pause ; l'arrière-plan abandonne aussitôt", async () => {
  quota.noteQuotaRefusal("1");
  assert.ok(quota.googleQuotaPauseMs() > 500);
  await assert.rejects(quota.asBackgroundGoogleWork(() => quota.acquireSheetsSlot({ deadline: Date.now() + 60_000 })), /SHEETS_API_ERROR:429/);
  // Une page dont l'échéance tombe avant la fin de la pause est prévenue tout de suite.
  await assert.rejects(quota.acquireSheetsSlot({ deadline: Date.now() + 10 }), /SHEETS_API_ERROR:429/);
  // Une page qui peut attendre attend la fin de la pause, puis part.
  const started = Date.now();
  const release = await quota.acquireSheetsSlot({ deadline: Date.now() + 60_000 });
  assert.ok(Date.now() - started >= 500);
  release();
  quota.noteQuotaSuccess();
});

test("quelques requêtes à la fois, celles des pages d'abord", async () => {
  const held = await Promise.all([1, 2, 3, 4, 5, 6].map(() => quota.acquireSheetsSlot({ deadline: Date.now() + 60_000 })));
  const order = [];
  const background = quota.asBackgroundGoogleWork(() => quota.acquireSheetsSlot({ deadline: Date.now() + 60_000 })).then((release) => { order.push("arrière-plan"); return release; });
  const page = quota.acquireSheetsSlot({ deadline: Date.now() + 60_000 }).then((release) => { order.push("page"); return release; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(order, []);
  held[0]();
  const pageRelease = await page;
  assert.deepEqual(order, ["page"]);
  // L'arrière-plan ne prend jamais la dernière place libre.
  held[1]();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(order, ["page"]);
  held[2]();
  (await background)();
  assert.deepEqual(order, ["page", "arrière-plan"]);
  pageRelease();
  for (const release of held.slice(3)) release();
});

const classes = [{ id: "CLA-0001", type: "Martiale", name: "Berserker", image: "https://exemple/berserker.png", keywords: ["", "", ""], difficulty: "X", completion: 0, accentDark: "#000000", accentLight: "#ffffff", accentReady: true }];
const spell = (index) => ({ rowNumber: index + 2, id: `SOR-${index}`, name: `Sort ${index}`, effect: "x".repeat(400), effectHtml: "", description: "Une description assez longue pour remplir la copie. ".repeat(10), descriptionHtml: "", type: "Action", category: "action", actionKind: "", skills: [], skillsRaw: "", distance: "", distanceHtml: "", charges: null, classRanks: { "CLA-0001": index % 21 }, tone: { background: "", foreground: "" } });

test("les classes et sorts lus par une installation servent aux autres, découpés en morceaux", async () => {
  fakeStore.reset();
  const spells = Array.from({ length: 120 }, (_, index) => spell(index));
  await share.shareClassCatalog({ classes, spells, readAt: "2026-10-09T20:00:00.000Z" });
  const records = await fakeStore.listSharedRecords("class-catalog");
  assert.ok(records.filter((record) => record.key.startsWith("part:")).length > 1, "la copie dépasse la taille d'un enregistrement");
  assert.ok(records.every((record) => record.value.length <= 20_000));
  // Une autre installation (mémoire vide) relit la copie.
  const other = await vite.ssrLoadModule(`/lib/class-catalog-share.ts?installation=2`);
  const read = await other.sharedClassCatalog();
  assert.equal(read.classes[0].name, "Berserker");
  assert.equal(read.spells.length, 120);
  assert.equal(read.spells[119].id, "SOR-119");
});

test("une lecture plus ancienne ne remplace jamais une copie plus récente", async () => {
  fakeStore.reset();
  const newer = await vite.ssrLoadModule(`/lib/class-catalog-share.ts?installation=3`);
  const older = await vite.ssrLoadModule(`/lib/class-catalog-share.ts?installation=4`);
  await newer.shareClassCatalog({ classes, spells: [spell(1), spell(2)], readAt: "2026-10-09T21:00:00.000Z" });
  await older.shareClassCatalog({ classes, spells: [spell(1)], readAt: "2026-10-09T20:59:00.000Z" });
  const reader = await vite.ssrLoadModule(`/lib/class-catalog-share.ts?installation=5`);
  assert.equal((await reader.sharedClassCatalog()).spells.length, 2);
});

test("sans copie partagée, rien n'est inventé", async () => {
  fakeStore.reset();
  const reader = await vite.ssrLoadModule(`/lib/class-catalog-share.ts?installation=6`);
  assert.equal(await reader.sharedClassCatalog(), null);
});
