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

test("un même champ plusieurs fois : la copie se relit, se range, suit un renommage", () => {
  const parsed = layouts.parseIndexLayout({ aside: [], sections: [{ id: "s", rows: [{ id: "r", fields: [{ column: "Nom" }, { column: "copie:ab12", of: "Nom", label: "Rappel" }, { column: "copie:zz", of: "" }, { column: "copie:yy", of: "copie:ab12" }] }] }] });
  assert.deepEqual(parsed.sections[0].rows[0].fields.map((field) => [field.column, field.of]), [["Nom", undefined], ["copie:ab12", "Nom"]]);
  const arranged = layouts.arrangeLayout({ ...parsed, rest: "show" }, ["Nom", "Rôle"], (item) => item);
  assert.deepEqual(arranged.sections[0].rows[0].fields.map((field) => field.item), ["Nom", "Nom"]);
  assert.deepEqual(arranged.rest, ["Rôle"]);
  // La copie avant l'original : l'original garde sa place.
  const before = layouts.arrangeLayout({ aside: [], sections: [{ id: "s", rows: [{ id: "r", fields: [{ column: "copie:a", of: "Nom" }, { column: "Nom" }] }] }] }, ["Nom"], (item) => item);
  assert.equal(before.sections[0].rows[0].fields.length, 2);
  assert.equal(layouts.renameLayoutColumns(parsed, new Map([["nom", "Nom complet"]])).sections[0].rows[0].fields[1].of, "Nom complet");
  assert.equal(layouts.layoutPlaces({ aside: [], sections: [{ id: "s", rows: [{ id: "r", fields: [{ column: "copie:a", of: "Rôle" }] }] }] }, "rôle"), true);
});

test("la Liste : le maître-détail montre la ligne cliquée, « Ouvrir la fiche » seulement sur demande", async () => {
  const { IndexPresentation } = await vite.ssrLoadModule("/components/eraser/index-presentation.tsx");
  const views = await vite.ssrLoadModule("/lib/index-presentations.ts");
  const props = { rows: ["a", "b"], headers: ["Nom", "Type"], nameOf: (key) => key === "a" ? "Épuisante" : "Lourde", valueOf: (key, header) => header === "Type" ? "Attribut" : key, onOpen: () => undefined, empty: "vide" };
  // Un « Au clic » resté d'une autre forme ne change pas le maître-détail : la première ligne est dans le détail.
  const master = renderToStaticMarkup(React.createElement(IndexPresentation, { ...props, layout: { kind: "master-detail", click: "sheet" } }));
  assert.match(master, /<h3[^>]*>.*Épuisante/);
  assert.doesNotMatch(master, /Ouvrir la fiche/);
  const asked = renderToStaticMarkup(React.createElement(IndexPresentation, { ...props, layout: views.cleanPresentation({ kind: "master-detail", detail: { sheetButton: true } }) }));
  assert.match(asked, /Ouvrir la fiche/);
  // Sur une page, jamais.
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(IndexPresentation, { ...props, inPlace: true, layout: { kind: "master-detail", detail: { sheetButton: true } } })), /Ouvrir la fiche/);
  // La taille : bornée, en rem.
  assert.deepEqual(views.cleanPresentationLook({ maxHeight: 3, maxWidth: 999 }), { maxHeight: 8, maxWidth: 160 });
  const sized = renderToStaticMarkup(React.createElement(IndexPresentation, { ...props, layout: { kind: "list", look: { maxHeight: 20, maxWidth: 40 } } }));
  assert.match(sized, /max-width:40rem/);
  assert.match(sized, /max-height:20rem/);
});

test("une page : les largeurs réglées d'une section, l'allure d'une image, l'image du Drive par Eraser", async () => {
  const { PageSections, ImageView } = await vite.ssrLoadModule("/components/eraser/custom-page-view.tsx");
  const image = (look) => ({ id: "i", vis: "tous", type: "image", src: "https://drive.google.com/file/d/1VX_xEkd_3xheAbCdEf/view", caption: "Carte", ratio: "16/9", fit: "cover", ...(look ? { look } : {}) });
  const render = (block) => React.createElement(ImageView, { block });
  const sized = renderToStaticMarkup(React.createElement(PageSections, { sections: [{ id: "s", layout: "2", framed: false, widths: [70, 30], cols: [[image()], [image()]] }], render }));
  assert.match(sized, /--section-cols:minmax\(0,70fr\) minmax\(0,30fr\)/);
  assert.match(sized, /src="\/api\/pages\/images\/1VX_xEkd_3xheAbCdEf"/);
  // Sans réglage : la disposition, comme avant.
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(PageSections, { sections: [{ id: "s", layout: "2", framed: false, cols: [[image()], [image()]] }], render })), /--section-cols/);
  const looked = renderToStaticMarkup(React.createElement(ImageView, { block: image({ width: 40, align: "right", frame: "none", radius: 0, fade: "bottom" }) }));
  assert.match(looked, /max-width:40%/);
  assert.match(looked, /ml-auto/);
  assert.match(looked, /mask-image:linear-gradient\(to bottom, #000 60%, transparent\)/);
  assert.match(looked, /border-radius:0/);
  assert.doesNotMatch(looked, /shadow-\[/);
});
