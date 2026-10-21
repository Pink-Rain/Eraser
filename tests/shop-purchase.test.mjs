import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const purchase = await vite.ssrLoadModule("/lib/shop-purchase.ts");

test("le prix d'un magasin se lit en pièces de cuivre", () => {
  assert.equal(purchase.priceInCopper("12 PO"), 1200);
  assert.equal(purchase.priceInCopper("1 PO 50 PC"), 150);
  assert.equal(purchase.priceInCopper("2 PN"), 300);
  assert.equal(purchase.priceInCopper("0,5 PO"), 50);
  assert.equal(purchase.priceInCopper("Sur demande"), null);
  assert.equal(purchase.priceCoin("2 PN"), "PN");
  assert.equal(purchase.formatCoins(1200, "PN"), "8 PN");
});

test("pas de cuivre : une pièce d'or est donnée et la monnaie rendue en cuivre", () => {
  const plan = purchase.planPayment({ or: 3, cuivre: 0, orNoir: 0 }, 30, "PC");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.given, { PO: 1, PC: 0, PN: 0 });
  assert.deepEqual(plan.change, { PO: 0, PC: 70, PN: 0 });
  assert.deepEqual(plan.after, { or: 2, cuivre: 70, orNoir: 0 });
});

test("payer en or noir au taux habituel, la différence revient en or et cuivre", () => {
  const plan = purchase.planPayment({ or: 0, cuivre: 0, orNoir: 2 }, 200, "PN");
  assert.deepEqual(plan.given, { PO: 0, PC: 0, PN: 2 });
  assert.deepEqual(plan.change, { PO: 1, PC: 0, PN: 0 });
  assert.deepEqual(plan.after, { or: 1, cuivre: 0, orNoir: 0 });
});

test("les pièces choisies d'abord, puis le compte juste avec les autres", () => {
  const plan = purchase.planPayment({ or: 1, cuivre: 40, orNoir: 1 }, 250, "PO");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.given, { PO: 1, PC: 0, PN: 1 });
  assert.deepEqual(plan.change, { PO: 0, PC: 0, PN: 0 });
  assert.equal(purchase.purseTotal(plan.after), purchase.purseTotal({ or: 1, cuivre: 40, orNoir: 1 }) - 250);
});

test("le complément cherche le compte juste avant de rendre la monnaie", () => {
  // 250 PC sans cuivre : 1 PO et 1 PN font le compte, plutôt que 3 PO et 50 PC rendues.
  const plan = purchase.planPayment({ or: 3, cuivre: 0, orNoir: 1 }, 250, "PC");
  assert.deepEqual(plan.given, { PO: 1, PC: 0, PN: 1 });
  assert.deepEqual(plan.change, { PO: 0, PC: 0, PN: 0 });
  // Une grosse bourse reste rapide.
  const big = purchase.planPayment({ or: 50_000, cuivre: 3, orNoir: 40_000 }, 4_000_003, "PC");
  assert.equal(big.ok, true);
  assert.equal(purchase.purseTotal(big.after), purchase.purseTotal({ or: 50_000, cuivre: 3, orNoir: 40_000 }) - 4_000_003);
});

test("une bourse trop légère dit ce qui manque, sans rien retirer", () => {
  const plan = purchase.planPayment({ or: 1, cuivre: 20, orNoir: 0 }, 300, "PO");
  assert.equal(plan.ok, false);
  assert.equal(plan.missing, 180);
});

test("un prix négocié se lit dans la pièce choisie", () => {
  assert.equal(purchase.amountInCopper("7,5", "PO"), 750);
  assert.equal(purchase.amountInCopper("3", "PN"), 450);
  assert.equal(purchase.amountInCopper("abc", "PO"), null);
  assert.equal(purchase.coinsText({ PO: 1, PC: 20, PN: 0 }), "1 PO et 20 PC");
});

test("les exemplaires d'une ligne : écrits, sinon le Nombre max, sinon un", () => {
  assert.equal(purchase.shopItemQuantity({ quantity: 0, maxQuantity: 20 }), 0);
  assert.equal(purchase.shopItemQuantity({ maxQuantity: 20 }), 20);
  assert.equal(purchase.shopItemQuantity({}), 1);
});

test("un joueur ne reçoit ni l'effet ni les traits de combat des items", () => {
  const shop = purchase.shopForPlayers({ id: "s", items: [{ id: "i", name: "Épée", description: "Une lame.", effect: "+2", effectHtml: "<b>+2</b>", skill: "Lames", value: "1d8" }] });
  assert.deepEqual(shop.items[0], { id: "i", name: "Épée", description: "Une lame.", effect: "", effectHtml: "" });
});
