import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const scopeOf = (id) => `sheet-read:${sha(`spreadsheets/${id}/values/${encodeURIComponent(RANGE)}`).slice(0, 40)}`;
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
