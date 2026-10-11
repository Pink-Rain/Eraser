import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true }, logLevel: "error" });
after(async () => { await vite.close(); });
const wire = await vite.ssrLoadModule("/lib/index-rows-wire.ts");

test("l'html identique à la valeur est vidé à l'envoi et rétabli à l'arrivée", () => {
  const row = { rowNumber: 2, values: ["Loup", "12", "", "Bête"], html: ["Loup", "<b>12</b>", "", "Bête"] };
  const packed = wire.packRowHtml(row);
  assert.deepEqual(packed.html, ["", "<b>12</b>", "", ""]);
  assert.deepEqual(wire.unpackRowHtml(packed), row);
  // Rétablir une ligne déjà rétablie ne change rien ; une ligne sans doublon est rendue telle quelle.
  assert.deepEqual(wire.unpackRowHtml(row), row);
  assert.equal(wire.packRowHtml({ rowNumber: 3, values: ["a"], html: ["<i>a</i>"] }).html[0], "<i>a</i>");
  assert.deepEqual(wire.unpackTableRows(wire.packTableRows({ tabName: "T", rows: [row] })).rows[0], row);
});
