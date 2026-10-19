import assert from "node:assert/strict";
import http from "node:http";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// Les requêtes vers Google et le serveur partagé : un délai qui dit quelle requête a expiré, et
// qui s'arrête une fois la réponse lue (avant, il pouvait se déclencher bien après, sur une
// réponse jamais lue, et remonter comme une erreur non rattrapée anonyme).
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom", configFile: false, root, server: { middlewareMode: true }, logLevel: "error",
  resolve: { alias: [{ find: "@", replacement: root }] },
});
const server = http.createServer((request, response) => {
  if (request.url === "/slow") { setTimeout(() => { response.writeHead(200); response.end("tard") }, 400); return }
  if (request.url === "/refus") { response.writeHead(429, { "content-type": "application/json" }); response.write("{\"error\":"); setTimeout(() => response.end("{}}"), 300); return }
  response.writeHead(200, { "content-type": "application/json" });
  response.end("{\"ok\":true}");
}).listen(0);
after(async () => { server.close(); await vite.close(); });
const base = `http://127.0.0.1:${server.address().port}`;
const { timedFetch, discardResponse } = await vite.ssrLoadModule("/lib/timed-fetch.ts");

const unexpected = [];
process.on("uncaughtException", (error) => unexpected.push(error));
process.on("unhandledRejection", (error) => unexpected.push(error));

test("une réponse lue arrête son délai", async () => {
  const response = await timedFetch(`${base}/ok`, {}, 150, "TEST");
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(unexpected, []);
});

test("un délai dépassé dit quelle requête n'a pas répondu, sous le nom TimeoutError", async () => {
  await assert.rejects(timedFetch(`${base}/slow`, {}, 100, "TEST"), (error) => error.name === "TimeoutError" && /TEST_TIMEOUT 127\.0\.0\.1:\d+\/slow/.test(error.message));
});

test("une réponse jetée (refus rejoué) est libérée sans erreur plus tard", async () => {
  const response = await timedFetch(`${base}/refus`, {}, 150, "TEST");
  assert.equal(response.status, 429);
  await discardResponse(response);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.deepEqual(unexpected, []);
});
