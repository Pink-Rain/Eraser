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

test("journal des erreurs : les avertissements de Node et les pages fermées en route n'y entrent pas", async () => {
  const journal = await vite.ssrLoadModule("/lib/error-journal.ts");
  assert.equal(journal.isJournaledError("(node:328) [DEP0180] DeprecationWarning: fs.Stats constructor is deprecated."), false);
  assert.equal(journal.isJournaledError("[vinext] Server error: Error [ERR_STREAM_UNABLE_TO_PIPE]: Cannot pipe to a closed or destroyed stream"), false);
  assert.equal(journal.isJournaledError("WORLD_INDEX_TRASH_READ_FAILED states SHEETS_API_ERROR:429"), true);
  assert.equal(journal.isJournaledError("CLASS_COLUMNS_CHECK_FAILED SHEET_KEY_COLUMN_MISSING:Classes:ID"), true);
});

test("historique d'un personnage : chutes, retours et objets notés dans le serveur partagé, compteurs justes, taille bornée", async () => {
  const history = await vite.ssrLoadModule("/lib/character-history.ts");
  fakeStore.reset();
  assert.deepEqual(await history.readCharacterHistory("PER-1"), { since: "", events: [] });
  // Deux notes lancées ensemble ne s'écrasent pas.
  await Promise.all([
    history.noteCharacterEvent("PER-1", { kind: "chute", at: "2026-10-11T10:00:00.000Z" }),
    history.noteCharacterEvent("PER-1", { kind: "objet", at: "2026-10-11T10:01:00.000Z", name: "Épée longue", rarity: "Rare" }),
  ]);
  await history.noteCharacterEvent("PER-1", { kind: "retour", at: "2026-10-11T10:02:00.000Z" });
  await history.noteCharacterEvent("PER-1", { kind: "objet", at: "2026-10-11T10:03:00.000Z", name: "Pain", rarity: "Commun" });
  const counts = history.historyCounts(await history.readCharacterHistory("PER-1"), ["Rare", "Très rare", "Ultime"]);
  assert.equal(counts.since, "2026-10-11T10:00:00.000Z");
  assert.deepEqual([counts.falls, counts.returns, counts.items, counts.rareItems], [1, 1, 2, 1]);
  assert.deepEqual(counts.lastItems.map((item) => item.name), ["Pain", "Épée longue"]);
  // Au-delà de la taille permise, les plus anciens objets partent, jamais les chutes.
  for (let index = 0; index < 400; index += 1) await history.noteCharacterEvent("PER-2", { kind: "objet", at: `2026-10-11T11:${String(index % 60).padStart(2, "0")}:00.000Z`, name: `Objet n°${index} au nom assez long pour remplir`, rarity: "Commun" });
  await history.noteCharacterEvent("PER-2", { kind: "chute", at: "2026-10-11T12:00:00.000Z" });
  const record = fakeStore.store.records.get("character-history").get("PER-2").value;
  assert.ok(record.length <= 19_000);
  const big = history.historyCounts(await history.readCharacterHistory("PER-2"));
  assert.equal(big.falls, 1);
  assert.ok(big.items < 400 && big.items > 100);
  assert.equal(big.lastItems[0].name, "Objet n°399 au nom assez long pour remplir");
  // Un enregistrement illisible n'est jamais écrasé.
  await fakeStore.writeSharedRecord("character-history", "PER-3", "{pas du json");
  await history.noteCharacterEvent("PER-3", { kind: "chute", at: "2026-10-11T12:00:00.000Z" });
  assert.equal(fakeStore.store.records.get("character-history").get("PER-3").value, "{pas du json");
});

test("journal des erreurs : une erreur d'Eraser qui cite un code de flux reste dans le journal", async () => {
  const journal = await vite.ssrLoadModule("/lib/error-journal.ts");
  assert.equal(journal.isJournaledError("DRIVE_MEDIA_STREAM_FAILED ERR_STREAM_PREMATURE_CLOSE"), true);
});
