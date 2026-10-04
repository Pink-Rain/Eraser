import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const lists = await vite.ssrLoadModule("/lib/multiple-values.ts");

test("la fiche écrit ses listes en texte lisible, le titre choisi en premier", () => {
  assert.equal(lists.serializeListCell(["Orc des Terres Libres"]), "Orc des Terres Libres");
  assert.equal(lists.serializeListCell(["Humaine de Valhelm", "Elfe", "Elfe", " "]), "Humaine de Valhelm · Elfe");
  assert.equal(lists.serializeListCell(["Le barbu", "L'ivrogne du coin"], "L'ivrogne du coin"), "L'ivrogne du coin · Le barbu");
  assert.equal(lists.serializeListCell([]), "");
});

test("le texte lisible se relit à l'identique", () => {
  for (const [entries, selected] of [[["Chamane"], undefined], [["Le barbu", "L'ivrogne du coin"], "L'ivrogne du coin"], [["A", "B", "C"], "B"]]) {
    const parsed = lists.parseListCell(lists.serializeListCell(entries, selected));
    assert.equal(parsed.selected, selected ?? entries[0]);
    assert.deepEqual([...parsed.entries].sort(), [...entries].sort());
  }
});

test("l'ancien JSON reste lu partout", () => {
  assert.deepEqual(lists.parseListCell('["Orc des Terres Libres"]'), { entries: ["Orc des Terres Libres"], selected: "Orc des Terres Libres" });
  assert.deepEqual(lists.parseListCell('{"values":["Le barbu","L\'ivrogne du coin"],"selected":"L\'ivrogne du coin"}'), { entries: ["Le barbu", "L'ivrogne du coin"], selected: "L'ivrogne du coin" });
  assert.equal(lists.isLegacyListCell('["Chamane"]'), true);
  assert.equal(lists.isLegacyListCell("Chamane"), false);
  assert.equal(lists.isLegacyListCell("[Note] à part"), false);
  assert.deepEqual(lists.parseListCell("[Note] à part").entries, ["[Note] à part"]);
  assert.equal(lists.displayedMultipleValue('["Elfe","Humain"]', "all"), "Elfe · Humain");
  assert.equal(lists.displayedMultipleValue("Elfe · Humain", "all"), "Elfe · Humain");
  assert.equal(lists.displayedMultipleValue("Le barbu · Le sage"), "Le barbu");
  assert.equal(lists.isLegacyListCell("[]"), true);
  assert.equal(lists.displayedMultipleValue("[]", "all"), "");
});

test("un « · » sans espaces fait partie du nom (Sorcier·ère)", () => {
  assert.deepEqual(lists.parseListCell("Sorcier·ère").entries, ["Sorcier·ère"]);
  assert.deepEqual(lists.parseListCell("Sorcier·ère · Guerrier·e").entries, ["Sorcier·ère", "Guerrier·e"]);
  assert.equal(lists.serializeListCell(["Sorcier·ère", "Guerrier·e"]), "Sorcier·ère · Guerrier·e");
});
