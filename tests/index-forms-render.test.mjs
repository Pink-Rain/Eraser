import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// Les formulaires tels qu'ils s'affichent : la fiche, le détail modifiable, la lecture et l'ajout
// lisent la même mise en page. L'onglet ouvert d'abord suit la ligne enregistrée (pas la saisie,
// ni seulement les colonnes montrées) ; une ligne neuve s'ouvre sur le premier onglet.
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });
const { IndexLayoutView } = await vite.ssrLoadModule("/components/eraser/index-layout-view.tsx");
const { IndexRowForm } = await vite.ssrLoadModule("/components/eraser/index-row-sheet.tsx");
const { IndexFormView } = await vite.ssrLoadModule("/components/eraser/index-form-view.tsx");
const { IndexEntryForm } = await vite.ssrLoadModule("/components/eraser/index-cells.tsx");
const layouts = await vite.ssrLoadModule("/lib/index-layouts.ts");

const layout = {
  aside: [],
  tabs: true,
  tabsBy: { column: "Type", map: [{ value: "Mage", section: "s2" }] },
  look: { background: "tint" },
  sections: [
    { id: "s1", title: "Général", rows: [{ id: "r1", fields: [{ column: "Nom" }, { column: "Rôle", hideLabel: true }] }] },
    { id: "s2", title: "Magie", look: "banner", color: "#6b4c9a", rows: [{ id: "r2", fields: [{ column: "Description" }] }] },
  ],
};
const activeTab = (html) => html.match(/role="tab" aria-selected="true"[^>]*>(?:<[^>]+>)*([^<]+)</)?.[1];

test("l'onglet ouvert d'abord : une colonne lue à part (tabValue) l'emporte sur les valeurs affichées", () => {
  const arranged = layouts.arrangeLayout(layout, ["Nom", "Rôle", "Description"], (item) => item);
  const render = (item) => React.createElement("span", null, item);
  const shown = renderToStaticMarkup(React.createElement(IndexLayoutView, { arranged, render, readColumn: () => "Guerrier" }));
  assert.equal(activeTab(shown), "Général");
  const fixed = renderToStaticMarkup(React.createElement(IndexLayoutView, { arranged, render, readColumn: () => "Guerrier", tabValue: () => "Mage" }));
  assert.equal(activeTab(fixed), "Magie");
  // En onglets, un bandeau garde sa couleur en cadre teinté : pas de bande vide sans titre.
  assert.doesNotMatch(fixed, /background-color:#6b4c9a/);
  assert.match(fixed, /color-mix\(in srgb, #6b4c9a 9%/);
  // L'onglet ouvert prend la couleur de sa section.
  assert.match(fixed, /aria-selected="true"[^>]*style="color:#6b4c9a"/);
  // Sans libellé à côté de champs qui en ont un : posé en bas de la ligne.
  const stacked = renderToStaticMarkup(React.createElement(IndexLayoutView, { arranged: layouts.arrangeLayout({ ...layout, tabs: undefined }, ["Nom", "Rôle", "Description"], (item) => item), render }));
  assert.match(stacked, /justify-end"><span>Rôle/);
});

const specs = { Nom: { kind: "name" }, Rôle: { kind: "rich" }, Description: { kind: "rich" } };
const fields = Object.entries(specs).map(([key, spec]) => ({ key, label: key, spec, value: key === "Nom" ? "Dame Iselle" : "" }));

test("le détail modifiable : l'onglet de la ligne, même d'une colonne qu'il ne montre pas ; son fond", () => {
  const html = renderToStaticMarkup(React.createElement(IndexRowForm, { rowKey: "r", fields, layout, onSave: () => undefined, columnValue: (column) => column === "Type" ? "Mage" : "" }));
  assert.equal(activeTab(html), "Magie");
  assert.match(html, /color-mix\(in srgb, #927640 7%, var\(--background\)\)/);
});

test("la lecture et l'ajout : la lecture suit la ligne, une ligne neuve s'ouvre sur le premier onglet", () => {
  const read = renderToStaticMarkup(React.createElement(IndexFormView, { layout, columns: [...Object.entries(specs).map(([header, spec]) => ({ header, spec })), { header: "Type", spec: { kind: "rich" } }], valueOf: (header) => header === "Type" ? "Mage" : header === "Nom" ? "Dame Iselle" : "" }));
  assert.equal(activeTab(read), "Magie");
  const entry = renderToStaticMarkup(React.createElement(IndexEntryForm, { title: "Ajouter", fields: fields.map(({ key, label, spec }) => ({ key, label, spec })), pending: false, layout, onCancel: () => undefined, onSave: () => undefined }));
  assert.equal(activeTab(entry), "Général");
});
