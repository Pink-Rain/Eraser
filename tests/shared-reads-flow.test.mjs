import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { createServer } from "vite";

// Les lectures Google partagées entre installations (lib/shared-reads.ts), avec le vrai
// lib/google-sheets.ts, un Google en mémoire et un serveur partagé en mémoire. Les autres
// installations sont jouées en écrivant directement sur le serveur partagé.
const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "eraser-shared-reads-"));
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
const shared = await vite.ssrLoadModule("/tests/fakes/shared-store.ts");
const sheets = await vite.ssrLoadModule("/lib/google-sheets.ts");
const { runWithFreshness } = await vite.ssrLoadModule("/lib/request-freshness.ts");

beforeEach(() => { google.reset(); shared.reset(); });

let serial = 0;
const fresh = (name) => `${name}-${++serial}`;
const sha = (text) => createHash("sha256").update(text).digest("hex");
const RANGE = "Feuille!A1:B2";
const scopeOf = (id, range = RANGE) => `sheet-read:${sha(`spreadsheets/${id}/values/${encodeURIComponent(range)}`).slice(0, 40)}`;
const googleReads = (id) => google.world.calls.filter((call) => call.url.includes(id)).length;

/** Ce qu'une autre installation dépose après avoir lu Google : la réponse, compressée et découpée. */
async function copyFromAnotherInstallation(id, values, { at = Date.now(), version = "0" } = {}) {
  const packed = gzipSync(Buffer.from(JSON.stringify({ range: RANGE, values }))).toString("base64");
  await shared.writeSharedRecord(scopeOf(id), "part:0", packed);
  await shared.writeSharedRecord(scopeOf(id), "manifest", JSON.stringify({ v: version, at, parts: 1, sum: sha(packed).slice(0, 24) }));
}

test("une copie récente d'une autre installation est reprise : Google n'est pas lu", async () => {
  const id = fresh("copie");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Aldor"]] }]);
  await copyFromAnotherInstallation(id, [["ID", "Nom"], ["1", "Aldor"]]);
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Aldor"]]);
  assert.equal(googleReads(id), 0);
});

test("ma lecture de Google laisse une copie que les autres installations peuvent reprendre", async () => {
  const id = fresh("depot");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Brin"]] }]);
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Brin"]]);
  assert.equal(googleReads(id), 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const records = new Map([...(shared.store.records.get(scopeOf(id)) ?? new Map())].map(([key, record]) => [key, record.value]));
  const manifest = JSON.parse(records.get("manifest"));
  assert.equal(manifest.parts, 1);
  const values = JSON.parse(gunzipSync(Buffer.from(records.get("part:0"), "base64")).toString("utf8")).values;
  assert.deepEqual(values, [["ID", "Nom"], ["1", "Brin"]]);
});

test("une écriture d'Eraser dans le classeur rend ses copies inutilisables, pour tout le monde", async () => {
  const id = fresh("ecriture");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Ancien"]] }]);
  await copyFromAnotherInstallation(id, [["ID", "Nom"], ["1", "Ancien"]]);
  await sheets.updateRange(id, "Feuille!B2", [["Nouveau"]]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(shared.store.records.get("sheet-versions")?.get(id), "la version du classeur n'a pas changé");
  sheets.clearSpreadsheetReadCache(id);
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Nouveau"]]);
});

test("après « Actualiser », une copie faite avant le clic n'est pas reprise", async () => {
  const id = fresh("actualiser");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "PV"], ["1", "7"]] }]);
  await copyFromAnotherInstallation(id, [["ID", "PV"], ["1", "10"]], { at: Date.now() - 5_000 });
  const rows = await runWithFreshness(Date.now() - 1_000, () => sheets.readRange(id, RANGE));
  assert.deepEqual(rows, [["ID", "PV"], ["1", "7"]]);
  assert.equal(googleReads(id), 1);
});

test("une autre installation lit déjà Google : on attend sa copie au lieu de lire aussi", async () => {
  const id = fresh("bail");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  await shared.writeSharedRecord(scopeOf(id), "lease", JSON.stringify({ by: "autre-installation", at: Date.now(), since: Date.now() }));
  setTimeout(() => { void copyFromAnotherInstallation(id, [["ID", "Nom"], ["1", "Copie"]]); }, 700);
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Copie"]]);
  assert.equal(googleReads(id), 0);
});

test("après « Actualiser », on attend une lecture d'une autre installation commencée après le clic", async () => {
  const id = fresh("bail-apres-clic");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "PV"], ["1", "7"]] }]);
  const click = Date.now() - 500;
  await shared.writeSharedRecord(scopeOf(id), "lease", JSON.stringify({ by: "autre-installation", at: Date.now(), since: Date.now() }));
  setTimeout(() => { void copyFromAnotherInstallation(id, [["ID", "PV"], ["1", "7 (copie)"]]); }, 600);
  const rows = await runWithFreshness(click, () => sheets.readRange(id, RANGE));
  assert.deepEqual(rows, [["ID", "PV"], ["1", "7 (copie)"]]);
  assert.equal(googleReads(id), 0);
});

test("après « Actualiser », une lecture commencée avant le clic n'est pas attendue : Google est lu aussitôt", async () => {
  const id = fresh("bail-avant-clic");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "PV"], ["1", "7"]] }]);
  const click = Date.now();
  // Bail renouvelé à l'instant, mais pour une lecture commencée une seconde avant le clic.
  await shared.writeSharedRecord(scopeOf(id), "lease", JSON.stringify({ by: "autre-installation", at: Date.now(), since: click - 1_000 }));
  const started = Date.now();
  const rows = await runWithFreshness(click, () => sheets.readRange(id, RANGE));
  assert.deepEqual(rows, [["ID", "PV"], ["1", "7"]]);
  assert.equal(googleReads(id), 1);
  assert.ok(Date.now() - started < 1_500, `attendu ${Date.now() - started} ms une copie qui ne pouvait pas convenir`);
});

test("un refus de Google n'est pas relancé par le partage : une seule requête, l'erreur remonte", async () => {
  const id = fresh("refus");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  const stop = google.failReads("Feuille", { status: 400 });
  try {
    await assert.rejects(sheets.readRange(id, RANGE));
    assert.equal(googleReads(id), 1);
  } finally {
    stop();
  }
});

test("une lecture qui décide d'une écriture (fraîche) ne prend jamais de copie", async () => {
  const id = fresh("fraiche");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  await copyFromAnotherInstallation(id, [["ID", "Nom"], ["1", "Copie"]]);
  const read = await sheets.readRangeFreshWithOffset(id, RANGE);
  assert.deepEqual(read.rows, [["ID", "Nom"], ["1", "Google"]]);
});

// ---- Les lectures froides ne paient plus de temps mort inutile ----

const callsFor = (id) => shared.store.calls.filter((call) => call.includes(scopeOf(id)));
const leaseOf = (id) => JSON.parse(shared.store.records.get(scopeOf(id))?.get("lease")?.value ?? "null");
/** Une feuille dont la réponse, compressée, dépasse ce que le serveur partagé accepte (~720 Ko). */
const hugeGrid = () => [["ID", "Nom"], ...Array.from({ length: 2_000 }, (_, index) => [String(index), randomBytes(300).toString("hex")])];

test("une copie périmée n'est pas téléchargée pour savoir s'il faut lire Google", async () => {
  const id = fresh("perimee");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  await copyFromAnotherInstallation(id, [["ID", "Nom"], ["1", "Vieille copie"]], { at: Date.now() - 60_000 });
  shared.store.calls.length = 0;
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Google"]]);
  assert.equal(googleReads(id), 1);
  assert.ok(!callsFor(id).some((call) => call.startsWith("list ")), `morceaux téléchargés pour rien : ${callsFor(id).join(", ")}`);
});

test("une réponse trop grosse pour être partagée : bail rendu avec la marque, puis Google directement", async () => {
  const id = fresh("trop-grosse");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: hugeGrid() }]);
  const range = "Feuille!A1:B2001";
  const scope = scopeOf(id, range);
  assert.equal((await sheets.readRange(id, range)).length, 2_001);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(JSON.parse(shared.store.records.get(scope)?.get("lease")?.value ?? "null")?.big, "le bail rendu ne dit pas que la réponse était trop grosse");
  assert.equal(shared.store.records.get(scope)?.get("manifest"), undefined);
  // La lecture suivante de la même plage : ni bail, ni attente, ni question au serveur partagé.
  sheets.clearSpreadsheetReadCache(id);
  shared.store.calls.length = 0;
  assert.equal((await sheets.readRange(id, range)).length, 2_001);
  assert.equal(googleReads(id), 2);
  assert.deepEqual(shared.store.calls.filter((call) => call.includes(scope)), []);
});

test("une autre installation a signalé une réponse trop grosse : pas de bail, Google aussitôt", async () => {
  const id = fresh("signalee");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  const marked = { by: "autre-installation", at: 0, since: 0, big: Date.now() };
  await shared.writeSharedRecord(scopeOf(id), "lease", JSON.stringify(marked));
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Google"]]);
  assert.equal(googleReads(id), 1);
  assert.deepEqual(leaseOf(id), marked, "le bail a été repris pour une lecture qui ne sera jamais partagée");
});

test("l'attente d'une autre installation cesse dès qu'elle signale une réponse trop grosse", async () => {
  const id = fresh("attente-grosse");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  await shared.writeSharedRecord(scopeOf(id), "lease", JSON.stringify({ by: "autre-installation", at: Date.now(), since: Date.now() }));
  setTimeout(() => { void shared.writeSharedRecord(scopeOf(id), "lease", JSON.stringify({ by: "autre-installation", at: 0, since: 0, big: Date.now() })); }, 400);
  const started = Date.now();
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Google"]]);
  assert.equal(googleReads(id), 1);
  assert.ok(Date.now() - started < 2_000, `attendu ${Date.now() - started} ms`);
});

test("un serveur partagé lent ne retarde la lecture que d'un instant : Google est lu", async () => {
  const id = fresh("lent");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  shared.store.delayMs = 3_000;
  const started = Date.now();
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Google"]]);
  assert.equal(googleReads(id), 1);
  assert.ok(Date.now() - started < 1_500, `attendu ${Date.now() - started} ms le serveur partagé`);
});

test("plusieurs plages du même classeur lues ensemble : une seule question sur sa version", async () => {
  const id = fresh("version");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "A"]] }, { title: "Autre", grid: [["ID"], ["2"]] }]);
  shared.store.calls.length = 0;
  await Promise.all([sheets.readRange(id, RANGE), sheets.readRange(id, "Autre!A1:A2")]);
  assert.equal(shared.store.calls.filter((call) => call === `get sheet-versions ${id}`).length, 1);
});

test("une lecture froide pose son bail sans le relire : une question au serveur partagé, puis Google", async () => {
  const id = fresh("bail-rapide");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  assert.deepEqual(await sheets.readRange(id, RANGE), [["ID", "Nom"], ["1", "Google"]]);
  assert.equal(googleReads(id), 1);
  // Avant Google : la version, le manifeste et le bail (en parallèle) ; le bail est écrit sans être relu.
  const before = shared.store.calls.filter((call) => call.startsWith("get "));
  assert.deepEqual(before.map((call) => call.split(" ").at(-1)), ["" + id, "manifest", "lease"].map((part) => part === "" + id ? id : part), `questions posées : ${before.join(" | ")}`);
  assert.equal(shared.store.calls.filter((call) => call === `set ${scopeOf(id)} lease`).length, 1);
});

test("deux lectures identiques au même instant (rendu à blanc puis vrai rendu) : une seule lecture de Google, une seule série de questions", async () => {
  const id = fresh("doublon");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  shared.store.delayMs = 30;
  const [first, second] = await Promise.all([sheets.readRange(id, RANGE), sheets.readRange(id, `${RANGE}`)]);
  assert.deepEqual(first, [["ID", "Nom"], ["1", "Google"]]);
  assert.deepEqual(second, first);
  assert.equal(googleReads(id), 1);
  assert.equal(shared.store.calls.filter((call) => call.startsWith("get ") && call.includes("lease")).length, 1);
});

test("deux lectures fraîches identiques au même instant ne partent qu'une fois vers Google", async () => {
  const id = fresh("frais");
  google.addSpreadsheet(id, [{ title: "Feuille", grid: [["ID", "Nom"], ["1", "Google"]] }]);
  const [a, b] = await Promise.all([sheets.readRangeFreshWithOffset(id, RANGE), sheets.readRangeFreshWithOffset(id, RANGE)]);
  assert.deepEqual(a, b);
  assert.equal(googleReads(id), 1);
});
