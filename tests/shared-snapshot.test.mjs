import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les réglages gardés sur le serveur partagé (mises en page, cartes, vues, presets…) : une copie
// périmée est servie tout de suite et relue derrière ; seules la première lecture, une lecture
// « fraîche » et celle qui suit un oubli attendent le serveur partagé.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [{ find: "@", replacement: root }] },
});
after(async () => { await vite.close(); });
const { sharedSnapshot } = await vite.ssrLoadModule("/lib/shared-snapshot.ts");
const { runWithFreshness } = await vite.ssrLoadModule("/lib/request-freshness.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function counter() {
  let reads = 0;
  let value = "v0";
  const slow = { ms: 0 };
  return {
    slow,
    set: (next) => { value = next; },
    get reads() { return reads; },
    load: async () => { reads += 1; const seen = value; await sleep(slow.ms); return seen; },
  };
}

test("une copie périmée est servie tout de suite, puis relue en arrière-plan", async () => {
  const source = counter();
  const snapshot = sharedSnapshot(source.load, { freshMs: 300 });
  assert.equal(await snapshot.read(), "v0");
  assert.equal(await snapshot.read(), "v0");
  assert.equal(source.reads, 1);
  source.set("v1");
  source.slow.ms = 200;
  await sleep(320);
  const started = Date.now();
  assert.equal(await snapshot.read(), "v0", "l'ancienne copie, sans attendre");
  assert.ok(Date.now() - started < 100);
  assert.equal(await snapshot.read(), "v0", "une seule relecture à la fois");
  assert.equal(source.reads, 2);
  await sleep(250);
  assert.equal(await snapshot.read(), "v1", "la relecture a remplacé la copie");
});

test("une lecture fraîche ou un oubli attendent le serveur partagé", async () => {
  const source = counter();
  const snapshot = sharedSnapshot(source.load, { freshMs: 60_000 });
  assert.equal(await snapshot.read(), "v0");
  source.set("v1");
  assert.equal(await snapshot.read(true), "v1");
  assert.equal(await snapshot.read(), "v1");
  source.set("v2");
  snapshot.forget();
  assert.equal(await snapshot.read(), "v2");
});

test("une relecture partie avant un oubli ne reprend pas la main", async () => {
  const source = counter();
  const snapshot = sharedSnapshot(source.load, { freshMs: 10 });
  assert.equal(await snapshot.read(), "v0");
  await sleep(20);
  source.slow.ms = 100;
  assert.equal(await snapshot.read(), "v0"); // relecture « v0 » partie en arrière-plan
  source.set("v1");
  source.slow.ms = 0;
  snapshot.forget();
  assert.equal(await snapshot.read(), "v1");
  await sleep(150);
  assert.equal(await snapshot.read(), "v1");
});

test("« Actualiser » relit ce qui date d'avant son clic", async () => {
  const source = counter();
  const snapshot = sharedSnapshot(source.load, { freshMs: 60_000 });
  assert.equal(await snapshot.read(), "v0");
  source.set("v1");
  await sleep(5);
  assert.equal(await runWithFreshness(Date.now(), () => snapshot.read()), "v1");
});

test("une relecture d'arrière-plan qui échoue garde la copie", async () => {
  let fail = false;
  let reads = 0;
  const snapshot = sharedSnapshot(async () => { reads += 1; if (fail) throw new Error("SHARED_SERVER_TIMEOUT"); return "v0"; }, { freshMs: 10 });
  assert.equal(await snapshot.read(), "v0");
  fail = true;
  await sleep(20);
  assert.equal(await snapshot.read(), "v0");
  await sleep(10);
  assert.equal(await snapshot.read(), "v0");
  assert.ok(reads >= 2);
});
