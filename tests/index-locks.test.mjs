import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const locks = await vite.ssrLoadModule("/lib/index-locks.ts");
const shared = await vite.ssrLoadModule("/lib/index-schema-shared.ts");
const definitions = await vite.ssrLoadModule("/lib/world-index-definitions.ts");

const eraserLocked = { rename: false, type: false, remove: false, reasons: ["La fiche des créatures lit cette colonne par son nom."], allowed: "L’affichage." };

test("un réglage de cadenas se relit nettoyé, borné, et jamais vide", () => {
  assert.deepEqual(locks.cleanLockOverride({ locked: true, uses: [" Le tabletop ", "Le tabletop", ""], hidden: ["x"] }), { locked: true, uses: ["Le tabletop"], hidden: ["x"] });
  assert.equal(locks.cleanLockOverride({ locked: "oui" }), null);
  assert.equal(locks.cleanTabLocks(""), null);
  assert.deepEqual(locks.cleanTabLocks(JSON.stringify({ "Région": { uses: ["La carte"] }, Vide: {} })), { region: { uses: ["La carte"] } });
  assert.deepEqual(locks.lockOverrideOf({ region: { locked: true } }, "RÉGION"), { locked: true });
});

test("un cadenas d'Eraser retiré libère la colonne ; un usage ajouté la verrouille ; Nom et ID restent verrouillées", () => {
  const unlocked = locks.applyLockOverride(eraserLocked, { locked: false });
  assert.deepEqual([unlocked.rename, unlocked.type, unlocked.remove, unlocked.reasons, unlocked.unlocked], [true, true, true, [], true]);
  assert.deepEqual(unlocked.builtin, eraserLocked.reasons);
  // Les usages d'Eraser écartés disparaissent de la liste ; ceux qu'on écrit s'ajoutent.
  const mixed = locks.applyLockOverride(eraserLocked, { hidden: eraserLocked.reasons, uses: ["Le tabletop lit cette colonne"] });
  assert.deepEqual(mixed.reasons, ["Le tabletop lit cette colonne"]);
  assert.equal(mixed.rename, false);
  // Un cadenas posé sur une colonne libre, même sans usage écrit.
  const posed = locks.applyLockOverride(shared.freePolicy, { locked: true });
  assert.equal(posed.rename, false);
  assert.deepEqual(posed.reasons, []);
  // Tous les usages d'Eraser écartés sans cadenas posé : libre.
  const emptied = locks.applyLockOverride(eraserLocked, { hidden: eraserLocked.reasons });
  assert.equal(emptied.rename, true);
  // Nom et ID : permanents quoi qu'on règle.
  const name = definitions.worldColumnPolicy("places", "Lieux", "Nom", []);
  assert.equal(name.permanent, true);
  const still = locks.applyLockOverride(name, { locked: false, hidden: name.reasons });
  assert.equal(still.rename, false);
  assert.deepEqual(still.reasons, name.reasons);
  const id = shared.objectColumnPolicy("ID");
  assert.equal(id.permanent, true);
  assert.equal(locks.applyLockOverride(id, { locked: false }).remove, false);
});

test("le réglage à enregistrer est retrouvé depuis la politique affichée, et l'aller-retour est stable", () => {
  const unlocked = locks.applyLockOverride(eraserLocked, { locked: false });
  assert.deepEqual(locks.lockOverrideFor(unlocked), { locked: false });
  const added = locks.applyLockOverride(eraserLocked, { uses: ["Le tabletop"] });
  assert.deepEqual(locks.lockOverrideFor(added), { uses: ["Le tabletop"] });
  const posed = locks.applyLockOverride(shared.freePolicy, { locked: true });
  assert.deepEqual(locks.lockOverrideFor(posed), { locked: true });
  assert.equal(locks.lockOverrideFor(locks.applyLockOverride(eraserLocked, undefined)), null);
  assert.equal(locks.lockOverrideFor(locks.applyLockOverride(shared.freePolicy, undefined)), null);
  assert.equal(locks.lockOverrideFor(definitions.worldColumnPolicy("places", "Lieux", "ID", [])), null);
  assert.equal(locks.sameTabLocks({ a: { uses: ["x"] } }, { a: { uses: ["x"], hidden: [] } }), true);
  assert.equal(locks.sameTabLocks({ a: { uses: ["x"] } }, null), false);
});
