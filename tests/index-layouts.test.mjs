import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const layouts = await vite.ssrLoadModule("/lib/index-layouts.ts");

const sample = {
  aside: [{ column: "Portrait" }],
  asideWidth: "lg",
  sections: [
    { id: "a", title: "Identité", rows: [{ id: "r1", fields: [{ column: "Nom", span: 8, large: true }, { column: "Rang", span: 4 }] }] },
    { id: "b", framed: true, rows: [{ id: "r2", fields: [{ column: "Description", span: 12, hideLabel: true }] }] },
  ],
};

test("une mise en page se relit telle qu'enregistrée, et rien d'autre", () => {
  const parsed = layouts.parseIndexLayout(JSON.stringify(sample));
  assert.deepEqual(parsed, sample);
  assert.equal(layouts.parseIndexLayout(""), null);
  assert.equal(layouts.parseIndexLayout("pas du json"), null);
  assert.equal(layouts.parseIndexLayout({ aside: [], sections: [] }), null);
  // Largeur inconnue écartée, colonne en double gardée une seule fois.
  const cleaned = layouts.parseIndexLayout({ aside: [{ column: "Nom" }], sections: [{ rows: [{ fields: [{ column: "Nom", span: 5 }, { column: "Rang", span: 7 }] }] }] });
  assert.deepEqual(cleaned.sections[0].rows[0].fields, [{ column: "Rang" }]);
});

test("les champs se rangent selon la mise en page, le reste à la suite ou masqué", () => {
  const items = ["Nom", "Rang", "Portrait", "Description", "Habitat"].map((header) => ({ header }));
  const arranged = layouts.arrangeLayout(sample, items, (item) => item.header);
  assert.deepEqual(arranged.aside.map((field) => field.item.header), ["Portrait"]);
  assert.deepEqual(arranged.sections[0].rows[0].fields.map((field) => [field.item.header, field.span]), [["Nom", 8], ["Rang", 4]]);
  assert.deepEqual(arranged.rest.map((item) => item.header), ["Habitat"]);
  assert.deepEqual(layouts.arrangeLayout({ ...sample, rest: "hide" }, items, (item) => item.header).rest, []);
  // Une colonne disparue est sautée ; une ligne, puis une section sans titre, vides disparaissent.
  const without = layouts.arrangeLayout(sample, items.filter((item) => item.header !== "Description"), (item) => item.header);
  assert.deepEqual(without.sections.map((section) => section.id), ["a"]);
});

test("une colonne renommée garde sa place dans la mise en page", () => {
  const renamed = layouts.renameLayoutColumns({ ...sample, subtitle: "Rang" }, new Map([["rang", "Niveau"]]));
  assert.equal(renamed.sections[0].rows[0].fields[1].column, "Niveau");
  assert.equal(renamed.subtitle, "Niveau");
  assert.equal(layouts.tabLayout({ "Créatures": { form: sample } }, "creatures", "form"), sample);
  assert.equal(layouts.tabLayout({ "Créatures": { form: sample } }, "creatures", "hover"), null);
});

test("la mise en page de départ ressemble à l'affichage automatique", () => {
  const start = layouts.startingLayout([{ header: "Nom", name: true }, { header: "Image", picture: true }, { header: "Rang" }, { header: "Type" }, { header: "Description", long: true }]);
  assert.deepEqual(start.aside, [{ column: "Image" }]);
  assert.deepEqual(start.sections[0].rows.map((row) => row.fields.map((field) => field.column)), [["Nom"], ["Rang", "Type"], ["Description"]]);
});
