import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const visibility = await vite.ssrLoadModule("/lib/class-visibility.ts");

test("classe visible, cachée ou affichée comme une autre ; vide : « Aucune classe »", () => {
  const start = JSON.stringify({ choices: { "CLA-1": { 1: "S1" } }, states: [{ id: "E", name: "Effrayé", level: 1 }] });
  assert.deepEqual(visibility.classDisplayOf(start), { mode: "visible", as: "" });
  assert.equal(visibility.publicClassText("Serviteuse de Khim Tay", start), "Serviteuse de Khim Tay");
  assert.equal(visibility.publicClassText("", start), "Aucune classe");
  assert.equal(visibility.publicClassText('["Mage","Prêtre"]', ""), "Mage · Prêtre");

  const hidden = visibility.withClassDisplay(start, { mode: "hidden", as: "" });
  assert.equal(visibility.publicClassText("Serviteuse de Khim Tay", hidden), "Aucune classe");
  // Le reste de la case est gardé.
  assert.deepEqual(JSON.parse(hidden).choices, { "CLA-1": { 1: "S1" } });
  assert.equal(JSON.parse(hidden).states[0].name, "Effrayé");

  const disguised = visibility.withClassDisplay(hidden, { mode: "as", as: "  Rôdeur " });
  assert.deepEqual(visibility.classDisplayOf(disguised), { mode: "as", as: "Rôdeur" });
  assert.equal(visibility.publicClassText("Serviteuse de Khim Tay", disguised), "Rôdeur");
  // « Affichée comme » sans nom : cachée, jamais la vraie classe.
  assert.equal(visibility.publicClassText("Serviteuse de Khim Tay", JSON.stringify({ classDisplay: { mode: "as", as: " " } })), "Aucune classe");

  const back = visibility.withClassDisplay(disguised, { mode: "visible", as: "" });
  assert.equal("classDisplay" in JSON.parse(back), false);
  assert.equal(visibility.publicClassText("Serviteuse de Khim Tay", back), "Serviteuse de Khim Tay");
  // Case illisible : visible, sans planter.
  assert.equal(visibility.publicClassText("Mage", "{oups"), "Mage");
});
