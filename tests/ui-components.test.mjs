import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("preserves Google Sheets rich-text runs", async () => {
  const { richTextHtml, htmlToRichText } = await vite.ssrLoadModule(
    "/lib/google-sheet-rich-text.ts",
  );
  const html = richTextHtml("Frappe rapide", [
    { startIndex: 0, format: { bold: true } },
    { startIndex: 6, format: { italic: true } },
  ]);

  assert.equal(html, "<strong>Frappe</strong><em> rapide</em>");
  const roundTrip = htmlToRichText(html);
  assert.equal(roundTrip.text, "Frappe rapide");
  assert.deepEqual(roundTrip.runs.map((run) => run.startIndex), [0, 6]);
});

test("preserves Google Sheets text colors", async () => {
  const { richTextHtml, htmlToRichText, normalizeCssColorToHex } = await vite.ssrLoadModule(
    "/lib/google-sheet-rich-text.ts",
  );
  const html = richTextHtml("Rouge vert", [
    { startIndex: 0, format: { foregroundColorStyle: { rgbColor: { red: 179 / 255, green: 38 / 255, blue: 30 / 255 } } } },
    { startIndex: 6, format: { foregroundColorStyle: { rgbColor: { red: 49 / 255, green: 91 / 255, blue: 85 / 255 } } } },
  ]);

  assert.match(html, /color:#b3261e/);
  assert.match(html, /color:#315b55/);
  const roundTrip = htmlToRichText(html);
  assert.equal(roundTrip.runs.length, 2);
  assert.equal(roundTrip.runs[0].format?.foregroundColorStyle?.rgbColor?.red > 0.69, true);
  assert.equal(roundTrip.runs[1].format?.foregroundColorStyle?.rgbColor?.green > 0.35, true);
  assert.equal(normalizeCssColorToHex("#AbC"), "#aabbcc");
  assert.equal(normalizeCssColorToHex("rgb(255, 0, 128)"), "#ff0080");
  assert.equal(normalizeCssColorToHex("rgba(128, 64, 32, 50%)"), "#804020");
  const legacy = htmlToRichText('<font color="rgb(255,0,0)">Ancien</font> <span style="color:#0f0">vert</span>');
  assert.equal(legacy.text, "Ancien vert");
  assert.equal(legacy.runs.length, 3);
  assert.equal(legacy.runs[0].format?.foregroundColorStyle?.rgbColor?.red, 1);
  assert.equal(legacy.runs[2].format?.foregroundColorStyle?.rgbColor?.green, 1);
});

test("clamps persistent table layouts to comfortable limits", async () => {
  const { clampTableColumnWidth, clampTableRowHeight } = await vite.ssrLoadModule(
    "/hooks/use-persistent-table-layout.ts",
  );
  assert.equal(clampTableColumnWidth(20), 80);
  assert.equal(clampTableColumnWidth(1200), 900);
  assert.equal(clampTableRowHeight(12), 40);
  assert.equal(clampTableRowHeight(600), 240);
});

test("rerolls only a shop stock and preserves its identity", async () => {
  const { rerollShop } = await vite.ssrLoadModule("/components/eraser/shop-generator.tsx");
  const shop = { id: "shop-1", key: "market", name: "Aux merveilles", size: "Minuscule", cityKey: "village", cityName: "Brume", items: [] };
  const updated = rerollShop([], shop);
  assert.equal(updated.id, shop.id);
  assert.equal(updated.key, shop.key);
  assert.equal(updated.name, shop.name);
  assert.equal(updated.size, shop.size);
  assert.equal(updated.cityKey, shop.cityKey);
  assert.equal(updated.cityName, shop.cityName);
  assert.notEqual(updated.items, shop.items);
});

test("shop persistence bypasses stale caches and requires a real reread", async () => {
  const [sheets, route, generator, campaignPage, sandboxPage] = await Promise.all([
    readFile(new URL("../lib/google-sheets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shops/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/eraser/shop-generator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campagne/[id]/magasin-et-fouille/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/bac-a-sable/magasin/page.tsx", import.meta.url), "utf8"),
  ]);

  const shopSection = sheets.slice(
    sheets.indexOf("export async function listSavedShops"),
    sheets.indexOf("function npcNumber"),
  );
  assert.match(shopSection, /readRangeFresh/);
  assert.doesNotMatch(shopSection, /receipt\.updatedValues/);
  assert.match(sheets, /values:batchGetByDataFilter/);
  assert.match(sheets, /dataFilters: \[\{ a1Range: range \}\]/);
  assert.match(route, /url\.searchParams\.get\("view"\) === "latest"/);
  assert.match(generator, /fetchPersistedShops<GeneratedShop>/);
  assert.match(generator, /fetchPersistedShops<SavedShopRecord>/);
  assert.match(generator, /requirePersistedShops\(selected, persisted/);
  assert.match(generator, /router\.refresh\(\)/);
  assert.match(generator, /href=\{savedHref\} prefetch=\{false\}/);
  assert.doesNotMatch(campaignPage, /listLatestShops\(campaignId\)\.catch/);
  assert.doesNotMatch(sandboxPage, /listSavedShops\("bac-a-sable"\)\.catch/);
});

test("keeps exact class spell types and detects their category", async () => {
  const { classSpellCategory, classSpellTypeSuggestions, MAX_CLASS_SPELLS_PER_RANK } = await vite.ssrLoadModule(
    "/lib/class-spell-utils.ts",
  );
  assert.equal(classSpellCategory("Actif -Action mineur"), "actif");
  assert.equal(classSpellCategory("Passif"), "passif");
  assert.equal(classSpellCategory("Bonus"), "bonus");
  assert.equal(classSpellTypeSuggestions.includes("Actif -Action instantanée"), true);
  assert.equal(MAX_CLASS_SPELLS_PER_RANK, 3);
});

test("normalizes every Google Sheets primitive before the UI reads it", async () => {
  const { normalizeGoogleSheetRows } = await vite.ssrLoadModule(
    "/lib/google-sheet-values.ts",
  );
  assert.deepEqual(
    normalizeGoogleSheetRows([["texte", 42, true, false, null, undefined]]),
    [["texte", "42", "true", "false", "", ""]],
  );
});

test("derives the sheet row number from the range Google actually read", async () => {
  const { sheetRangeStartRow } = await vite.ssrLoadModule(
    "/lib/google-sheet-values.ts",
  );
  // Plage demandée par l'application pour lister les magasins.
  assert.equal(sheetRangeStartRow("'Magasins'!A2:L"), 2);
  // Plage renvoyée par Google après un append : c'est elle qui fait foi.
  assert.equal(sheetRangeStartRow("Magasins!A57:L57"), 57);
  // Une lecture décalée doit décaler le numéro de ligne, pas rester sur 2.
  assert.equal(sheetRangeStartRow("Magasins!A9:L120"), 9);
  // Un onglet dont le nom contient « ! » ne doit pas tromper la découpe.
  assert.equal(sheetRangeStartRow("'Maga!sins'!A4:L4"), 4);
  // Sans ligne explicite, aucune déduction possible.
  assert.equal(sheetRangeStartRow("'Magasins'!A:L"), null);
  assert.equal(sheetRangeStartRow(undefined), null);
});

test("spends and recovers spell charges as a continuous bar", async () => {
  const { nextSpellChargeValue, SpellChargeStars } = await vite.ssrLoadModule(
    "/components/eraser/spell-charges.tsx",
  );
  // Cliquer une etincelle pleine vide la barre jusqu'a elle comprise.
  assert.equal(nextSpellChargeValue(5, 5, 0), 0);
  assert.equal(nextSpellChargeValue(5, 5, 3), 3);
  assert.equal(nextSpellChargeValue(5, 5, 4), 4);
  assert.equal(nextSpellChargeValue(5, 3, 2), 2);
  // Cliquer une etincelle vide remplit la barre jusqu'a elle comprise.
  assert.equal(nextSpellChargeValue(5, 0, 2), 3);
  assert.equal(nextSpellChargeValue(5, 3, 3), 4);
  assert.equal(nextSpellChargeValue(5, 3, 4), 5);
  assert.equal(nextSpellChargeValue(5, 0, 0), 1);
  const threeCharges = renderToStaticMarkup(
    React.createElement(SpellChargeStars, { total: 3 }),
  );
  assert.equal((threeCharges.match(/lucide-sparkle/g) || []).length, 3);
});

test("renders a character sheet even when a saved tab no longer exists", async () => {
  const { CharacterSheet } = await vite.ssrLoadModule(
    "/components/eraser/character-sheet.tsx",
  );
  const { characterValueHeaders, characterCustomTabsIndex } = await vite.ssrLoadModule(
    "/lib/character-sheet-schema.ts",
  );
  const values = characterValueHeaders.map(() => "");
  values[0] = "Personnage test";
  values[characterCustomTabsIndex] = "[]";
  const html = renderToStaticMarkup(
    React.createElement(CharacterSheet, {
      initialCharacter: {
        id: "PER-TEST",
        ownerUid: "USR-TEST",
        name: "Personnage test",
        subtitle: "",
        updatedAt: "2026-09-05T00:00:00.000Z",
        campaigns: [],
        values,
      },
      classes: [],
      classSpells: [],
    }),
  );

  assert.match(html, /Personnage test/);
  assert.match(html, /Compétences/);
  assert.match(html, /Inventaire/);
  assert.match(html, /Classe/);
});
test("only counts an item's modifiers once it is equipped", async () => {
  const { indexInventoryModifiers, modifierTotalFor, linkedItemsFor, serializeItemModifiers, parseItemModifiers, skillModifierTargetId } =
    await vite.ssrLoadModule("/lib/item-modifiers.ts");

  const serialized = serializeItemModifiers([
    { value: "+2", target: skillModifierTargetId("Parade") },
    { value: "-1", target: "rapidite" },
    { value: "3", target: "cible-inconnue" },
    { value: "", target: "vie" },
  ]);
  assert.equal(parseItemModifiers(serialized).length, 2);

  const container = (equipped) => ({
    id: "CNT-1",
    typeId: "TYPE-ARMES-BASE",
    name: "Armes de base",
    category: "Armes",
    capacity: 6,
    order: 0,
    isBase: true,
    used: 1,
    slots: [{
      id: "SLOT-1",
      index: 1,
      itemId: "OBJ-1",
      quantity: 1,
      equipped,
      modifiers: serialized,
      item: { id: "OBJ-1", name: "Bouclier rond", maxQuantity: 1 },
    }],
  });

  const unequipped = indexInventoryModifiers([container(false)]);
  assert.equal(modifierTotalFor(unequipped, skillModifierTargetId("Parade")), 0);
  // L'objet reste listé pour pouvoir l'équiper depuis l'onglet Compétences.
  assert.equal(linkedItemsFor(unequipped, skillModifierTargetId("Parade")).length, 1);
  assert.equal(linkedItemsFor(unequipped, skillModifierTargetId("Parade"))[0].equipped, false);

  const equipped = indexInventoryModifiers([container(true)]);
  assert.equal(modifierTotalFor(equipped, skillModifierTargetId("Parade")), 2);
  assert.equal(modifierTotalFor(equipped, "rapidite"), -1);
  assert.equal(modifierTotalFor(equipped, "vie"), 0);
});

test("adds equipped item modifiers to the skill and speed totals", async () => {
  const { CharacterSheet } = await vite.ssrLoadModule(
    "/components/eraser/character-sheet.tsx",
  );
  const { characterValueHeaders, characterCustomTabsIndex, characterSkills, characterSkillValueIndex } =
    await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
  const { serializeItemModifiers, skillModifierTargetId } = await vite.ssrLoadModule("/lib/item-modifiers.ts");

  const paradeIndex = characterSkills.findIndex((skill) => skill.name === "Parade");
  const values = characterValueHeaders.map(() => "");
  values[0] = "Personnage test";
  values[characterCustomTabsIndex] = "[]";
  values[21] = "12"; // Rapidité calculée par la feuille
  values[30] = "40"; // Force
  values[characterSkillValueIndex(paradeIndex, 0)] = "5"; // Bonus/Malus de stats
  values[characterSkillValueIndex(paradeIndex, 2)] = "45"; // Total calculé par la feuille

  const inventory = {
    containerTypes: [],
    items: [],
    containers: [{
      id: "CNT-1",
      typeId: "TYPE-EQUIPEMENT-BASE",
      name: "Équipement de base",
      category: "Équipement",
      capacity: 8,
      order: 0,
      isBase: true,
      used: 1,
      slots: [{
        id: "SLOT-1",
        index: 1,
        itemId: "OBJ-1",
        quantity: 1,
        equipped: true,
        modifiers: serializeItemModifiers([
          { value: "+7", target: skillModifierTargetId("Parade") },
          { value: "-2", target: "rapidite" },
        ]),
        item: { id: "OBJ-1", name: "Brassards gravés", maxQuantity: 1 },
      }],
    }],
  };

  const html = renderToStaticMarkup(
    React.createElement(CharacterSheet, {
      initialCharacter: {
        id: "PER-TEST",
        ownerUid: "USR-TEST",
        name: "Personnage test",
        subtitle: "",
        updatedAt: "2026-09-05T00:00:00.000Z",
        campaigns: [],
        values,
      },
      classes: [],
      classSpells: [],
      initialInventory: inventory,
    }),
  );

  // Parade : 40 (Force) + 5 (bonus) + 7 (objet équipé), borné entre 10 et 90.
  assert.match(html, />52</);
  // Rapidité : 12 - 2.
  assert.match(html, />10</);
});

test("keeps a zero as a deliberate item modifier", async () => {
  const { serializeItemModifiers, parseItemModifiers, indexInventoryModifiers, modifierTotalFor, linkedItemsFor, hasModifierAmount } =
    await vite.ssrLoadModule("/lib/item-modifiers.ts");

  assert.equal(hasModifierAmount("0"), true);
  assert.equal(hasModifierAmount(""), false);
  assert.equal(hasModifierAmount("abc"), false);

  const serialized = serializeItemModifiers([
    { value: "0", target: "vie" },
    { value: "", target: "rapidite" },
  ]);
  const parsed = parseItemModifiers(serialized);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].target, "vie");

  const index = indexInventoryModifiers([{
    id: "CNT-1",
    typeId: "TYPE-EQUIPEMENT-BASE",
    name: "Équipement de base",
    category: "Équipement",
    capacity: 8,
    order: 0,
    isBase: true,
    used: 1,
    slots: [{ id: "SLOT-1", index: 1, itemId: "OBJ-1", quantity: 1, equipped: true, modifiers: serialized, item: { id: "OBJ-1", name: "Amulette neutre", maxQuantity: 1 } }],
  }]);
  // Le lien existe et reste listé, mais il n'ajoute rien au total.
  assert.equal(modifierTotalFor(index, "vie"), 0);
  assert.equal(linkedItemsFor(index, "vie").length, 1);
});

test("converts sheet cells between rich text and plain text", async () => {
  const { richTextPlainText, escapeRichText, sanitizeRichText } = await vite.ssrLoadModule(
    "/components/eraser/rich-text-inline-editor.tsx",
  );
  assert.equal(richTextPlainText("<strong>Coup</strong> net<br>puis recul"), "Coup net\npuis recul");
  assert.equal(escapeRichText("1 < 2 & 3 > 2"), "1 &lt; 2 &amp; 3 &gt; 2");
  // La mise en forme utile survit, le script est retiré.
  const safe = sanitizeRichText('<span style="color:#b3261e">rouge</span><script>alert(1)</script>');
  assert.match(safe, /color:#b3261e/);
  assert.doesNotMatch(safe, /script/i);
});

test("renders the shared sheet grid with pinned headers and editable cells", async () => {
  const { SheetGrid } = await vite.ssrLoadModule("/components/eraser/sheet-grid.tsx");
  const html = renderToStaticMarkup(
    React.createElement(SheetGrid, {
      layoutKey: "test:grid",
      columns: [
        { key: "nom", label: "Nom", width: 200, plain: true },
        { key: "effet", label: "Effet", width: 300 },
      ],
      rows: [{ key: "2", rowNumber: 2 }],
      valueOf: (rowKey, columnKey) => (columnKey === "nom" ? "Épée" : "<strong>Tranchant</strong>"),
      onCommit: () => {},
      empty: "Vide",
    }),
  );
  // La grille se fige sous l'en-tête et occupe la hauteur visible restante.
  assert.match(html, /sticky top-0 z-20 flex h-\[calc\(100svh-3\.5rem-var\(--eraser-titlebar,0px\)\)\]/);
  // En-têtes de colonnes collés en haut du tableau.
  assert.match(html, /sticky top-0/);
  assert.match(html, /Ligne/);
  // Toutes les cellules sont modifiables en permanence : aucun mode lecture.
  assert.equal((html.match(/contenteditable="true"/gi) || []).length, 2);
  assert.doesNotMatch(html, /<textarea/);
});

test("keeps sheet cell content out of React's hands", async () => {
  const source = await readFile(new URL("../components/eraser/sheet-grid.tsx", import.meta.url), "utf8");
  const cell = source.slice(source.indexOf("const SheetCell"), source.indexOf("function SheetGridToolbar"));
  // React reecrit le contenu d'un element contentEditable a chaque rendu, meme quand
  // la valeur n'a pas change : confier ce contenu a React efface la frappe en cours au
  // moment ou l'enregistrement fait remonter la valeur au tableau. La cellule pose donc
  // son contenu elle-meme, une seule fois, et n'expose ni enfants ni
  // dangerouslySetInnerHTML. Verifie au navigateur ; ce test empeche le retour en arriere.
  assert.doesNotMatch(cell, /dangerouslySetInnerHTML=\{/);
  assert.match(cell, /editor\.current\.innerHTML = applied\.current/);
  assert.match(cell, /contentEditable=\{!disabled\}/);
});
