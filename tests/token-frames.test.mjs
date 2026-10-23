import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const frames = await vite.ssrLoadModule("/lib/token-frames.ts");

const ids = (subject) => frames.tokenFramesFor(subject).map((frame) => frame.id);

test("un joueur choisit parmi les quatre bleu vif, le deuxième par défaut", () => {
  assert.deepEqual(ids({ kind: "character" }), ["vivid-blue-1", "vivid-blue-2", "vivid-blue-3", "vivid-blue-4"]);
  assert.equal(frames.defaultTokenFrameId({ kind: "character" }), "vivid-blue-2");
});

test("les cadres par défaut des PNJ et des créatures suivent le groupe et les compagnons", () => {
  assert.equal(frames.defaultTokenFrameId({ kind: "npc", group: true }), "enamel-blue-3");
  assert.equal(frames.defaultTokenFrameId({ kind: "npc", companion: true }), "enamel-blue-3");
  assert.equal(frames.defaultTokenFrameId({ kind: "npc" }), "gold-3");
  assert.equal(frames.defaultTokenFrameId({ kind: "creature" }), "enamel-red-3");
  assert.equal(frames.defaultTokenFrameId({ kind: "creature", companion: true }), "enamel-blue-3");
});

test("PNJ et créatures : émail bleu clair, émail rouge, or et les dix cadres spéciaux", () => {
  for (const kind of ["npc", "creature"]) {
    const list = frames.tokenFramesFor({ kind });
    assert.equal(list.length, 22);
    assert.deepEqual(list.filter((frame) => frame.family === "special").map((frame) => frame.number), [1, 2, 3, 4, 8, 13, 14, 16, 19, 20]);
    for (const family of ["enamel-blue", "enamel-red", "gold"]) assert.equal(list.filter((frame) => frame.family === family).length, 4);
  }
});

test("un magasin n'a que sa porte ; un type sans porte prend celle du Marché", () => {
  assert.deepEqual(ids({ kind: "shop", shopKey: "tavern" }), ["door-tavern"]);
  assert.deepEqual(ids({ kind: "shop", shopKey: "travelling-market" }), ["door-traveling"]);
  assert.deepEqual(ids({ kind: "shop", shopKey: "poissonnerie" }), ["door-market"]);
  assert.equal(frames.shopInterior("poissonnerie"), "/token-frames/interior-market.webp");
});

test("un cadre enregistré qui n'est pas proposé pour ce token laisse la place au défaut", () => {
  assert.equal(frames.resolveTokenFrame({ kind: "npc" }, "special-lich").id, "special-lich");
  assert.equal(frames.resolveTokenFrame({ kind: "character" }, "special-lich").id, "vivid-blue-2");
  assert.equal(frames.resolveTokenFrame({ kind: "creature" }, "inconnu").id, "enamel-red-3");
  assert.equal(frames.isTokenFrameId("door-tavern"), true);
  assert.equal(frames.isTokenFrameId("../secret"), false);
});

test("chaque image de cadre est livrée avec l'application", async () => {
  const subjects = [{ kind: "character" }, { kind: "npc" }, ...["market", "bookshop", "antique", "armory", "black-market", "alchemist", "tavern", "travelling-market"].map((shopKey) => ({ kind: "shop", shopKey }))];
  const files = new Set();
  for (const subject of subjects) for (const frame of frames.tokenFramesFor(subject)) { files.add(frame.front); if (frame.back) files.add(frame.back); }
  for (const subject of subjects.filter((item) => item.kind === "shop")) files.add(frames.shopInterior(subject.shopKey));
  assert.equal(files.size, 49);
  for (const file of files) await access(new URL(`../public${file}`, import.meta.url));
});

test("une créature compagnon a son propre token, rattaché à son personnage", async () => {
  const companions = await vite.ssrLoadModule("/lib/companions.ts");
  const id = companions.companionTokenId("PER-12", "c-3f2a");
  assert.equal(id, "companion:PER-12:c-3f2a");
  assert.deepEqual(companions.companionOfTokenId(id), { characterId: "PER-12", companionId: "c-3f2a" });
  assert.equal(companions.companionOfTokenId("CRE-4"), null);
  assert.equal(companions.companionOfTokenId("companion:PER-12"), null);
  const tokens = await vite.ssrLoadModule("/lib/token-frames.ts");
  assert.equal(tokens.resolveTokenFrame({ kind: "creature", companion: true }).id, "enamel-blue-3");
});
