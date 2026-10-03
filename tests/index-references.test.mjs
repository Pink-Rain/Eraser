import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const refs = await vite.ssrLoadModule("/lib/index-references.ts");
const cells = await vite.ssrLoadModule("/lib/index-references-cells.ts");
const columns = await vite.ssrLoadModule("/lib/index-columns.ts");

test("le lien d'une référence garde l'index, la ligne et la colonne", () => {
  const href = refs.referenceHref({ index: "states", id: "ETA-1A2B3C4D", column: "Fin de l'état" });
  assert.equal(href, "/reference/states/ETA-1A2B3C4D?colonne=Fin%20de%20l'%C3%A9tat");
  assert.deepEqual(refs.parseReferenceHref(href), { index: "states", id: "ETA-1A2B3C4D", column: "Fin de l'état" });
  // L'adresse complète que garde Google Sheets, et l'esperluette échappée du HTML.
  assert.deepEqual(refs.parseReferenceHref("http://127.0.0.1:32147/reference/objects/DRIVE-a-1-5"), { index: "objects", id: "DRIVE-a-1-5" });
  assert.deepEqual(refs.parseReferenceHref("/reference/places/LIE-1?colonne=Type&amp;x=1"), { index: "places", id: "LIE-1", column: "Type" });
  assert.equal(refs.parseReferenceHref("/ressources/index-des-etats"), null);
  assert.equal(refs.parseReferenceHref("https://example.com/reference/states/ETA-1"), null);
});

test("le libellé d'une case citée redonne le nom de la ligne", () => {
  assert.equal(refs.referenceLabel("Sérénité", "Type"), "Sérénité › Type");
  assert.equal(refs.referenceNameFromLabel("Sérénité › Type"), "Sérénité");
  assert.equal(refs.referenceNameFromLabel("Vesna: la cité"), "Vesna: la cité");
  assert.equal(refs.referenceKey({ index: "states", id: "ETA-1", column: "Type" }), refs.referenceKey({ index: "states", id: "ETA-1", column: "type " }));
});

test("les mots du menu viennent des noms d'éléments", () => {
  assert.equal(refs.entryLabelFromItemLabel("un état"), "État");
  assert.equal(refs.entryLabelFromItemLabel("un point d'intérêt"), "Point d'intérêt");
  assert.equal(refs.entryLabelFromItemLabel("une créature"), "Créature");
  assert.equal(refs.entryLabelFromItemLabel("l’arme"), "Arme");
  assert.equal(refs.entryLabelFromItemLabel("une ligne"), "");
});

test("ce qui commence comme la frappe passe devant", () => {
  const ranked = refs.rankByQuery(["Effets", "États", "État", "Lieu"], (value) => value, "ét");
  assert.deepEqual(ranked, ["États", "État", "Effets"]);
  assert.deepEqual(refs.rankByQuery(["Effets", "États", "État"], (value) => value, "état"), ["État", "États"]);
});

function table(headers, specs, values, html = values) {
  return {
    tab: "Armes", headers, columns: headers, name: headers.indexOf("Nom"),
    specs: new Map(Object.entries(specs).map(([header, spec]) => [columns.foldName(header), columns.normalizeSpec(spec)])),
    rows: [{ id: "OBJ-1", name: values[0], values, html }],
  };
}

test("une case citée s'affiche comme dans le tableau, dans le style de sa colonne", () => {
  const headers = ["Nom", "Prix", "Distance", "Action", "Description", "Couleur"];
  const specs = {
    Prix: { kind: "number", number: { unit: "money", defaultUnit: "PO" }, style: { bold: true } },
    Distance: { kind: "number", number: { unit: "distance", defaultUnit: "m" } },
    Action: { kind: "choice", options: [{ value: "Actif", color: "#b3261e" }, { value: "Passif" }] },
    Description: { kind: "rich" },
    Couleur: { kind: "color" },
  };
  const source = table(headers, specs, ["Arc'Säy", "12", "60 | 1", "Actif", "Un arc", "#285f8f"], ["Arc'Säy", "12", "60 | 1", "Actif", "<strong>Un</strong> arc", "#285f8f"]);
  const row = source.rows[0];
  const price = cells.citedCell(source, row, "prix");
  assert.equal(price.column, "Prix");
  assert.equal(price.value, "12 PO");
  assert.deepEqual(price.look.style, { bold: true });
  assert.equal(cells.citedCell(source, row, "Distance").value, "60 m | 1 m");
  // « Distance 2 » : la deuxième valeur de la case.
  assert.equal(cells.citedCell(source, row, "Distance 2").value, "1 m");
  assert.deepEqual(cells.citedCell(source, row, "Action").look.options, [{ value: "Actif", color: "#b3261e" }]);
  assert.equal(cells.citedCell(source, row, "Description").valueHtml, "<strong>Un</strong> arc");
  assert.equal(cells.citedCell(source, row, "Bidule"), null);
  const details = cells.rowDetails(source, row);
  assert.equal(details.descriptionHtml, "<strong>Un</strong> arc");
  assert.equal(details.color, "#285f8f");
});
