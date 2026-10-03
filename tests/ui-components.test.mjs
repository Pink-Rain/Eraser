import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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
    "/components/eraser/rich-text.tsx",
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
  // La colonne « Ligne » a disparu : seule reste la poignée, et la première colonne
  // de données est figée à gauche pour rester lisible pendant le défilement.
  assert.doesNotMatch(html, /<th[^>]*>Ligne</);
  assert.match(html, /Poignée de ligne/);
  assert.match(html, /aria-label="Ligne 2"/);
  assert.match(html, /left:30px/);
  // Toutes les cellules sont modifiables en permanence : aucun mode lecture.
  assert.equal((html.match(/contenteditable="true"/gi) || []).length, 2);
  assert.doesNotMatch(html, /<textarea/);
});

test("offers a ghost row only when the page can append one", async () => {
  const { SheetGrid } = await vite.ssrLoadModule("/components/eraser/sheet-grid.tsx");
  const props = {
    layoutKey: "test:grid",
    columns: [{ key: "nom", label: "Nom", width: 200, plain: true }],
    rows: [{ key: "2", rowNumber: 2 }],
    valueOf: () => "Épée",
    onCommit: () => {},
    empty: "Vide",
  };
  const without = renderToStaticMarkup(React.createElement(SheetGrid, props));
  assert.doesNotMatch(without, /Ajouter une ligne/);
  const withAppend = renderToStaticMarkup(React.createElement(SheetGrid, { ...props, rowCommands: { append: () => {} } }));
  assert.match(withAppend, /Ajouter une ligne/);
});

test("keeps the tab bar out of the way on the website", async () => {
  const source = await readFile(new URL("../components/eraser/app-tabs.tsx", import.meta.url), "utf8");
  // Hors de l'application Windows, le clic droit doit rendre la main au navigateur :
  // sans barre de titre, un onglet ouvert ici n'aurait nulle part où s'afficher.
  assert.match(source, /dataset\.eraserTitlebar === "true"/);
  assert.match(source, /function onContextMenu\(event: MouseEvent\) \{\n\s+if \(!isDesktop\(\)\) return/);
  // Le nouvel onglet s'ouvre en arrière-plan : aucune navigation n'est déclenchée.
  const open = source.slice(source.indexOf("const open = useCallback"), source.indexOf("const close = useCallback"));
  assert.doesNotMatch(open, /router\.push/);
});

test("keeps rich text content out of React's hands", async () => {
  const source = await readFile(new URL("../components/eraser/rich-text.tsx", import.meta.url), "utf8");
  const cell = source.slice(source.indexOf("export const RichTextSurface"), source.indexOf("export function RichTextView"));
  // React reecrit le contenu d'un element contentEditable a chaque rendu, meme quand
  // la valeur n'a pas change : confier ce contenu a React efface la frappe en cours au
  // moment ou l'enregistrement fait remonter la valeur au tableau. La cellule pose donc
  // son contenu elle-meme, une seule fois, et n'expose ni enfants ni
  // dangerouslySetInnerHTML. Verifie au navigateur ; ce test empeche le retour en arriere.
  assert.doesNotMatch(cell, /dangerouslySetInnerHTML=\{/);
  assert.match(cell, /editor\.current\.innerHTML = applied\.current/);
  assert.match(cell, /contentEditable=\{!disabled\}/);
  // Toute l'application partage ce moteur : aucun autre éditeur ne doit subsister.
  const others = await readFile(new URL("../components/eraser/sheet-grid.tsx", import.meta.url), "utf8");
  assert.match(others, /RichTextSurface/);
  assert.doesNotMatch(others, /contentEditable/);
});

test("renders the session creator with its sections", async () => {
  const { SessionCreator } = await vite.ssrLoadModule("/components/eraser/session-creator.tsx");
  const member = { id: "char-1", name: "Aelis", people: "Elfe", classes: "Rôdeuse", level: "3", honoraryTitle: "" };
  const npc = { id: "npc-1", pageLinked: "camp-1", name: "Basile Orme", title: "", occupation: "Forgeron", people: "", portrait: "", currentHp: 10, totalHp: 20, speed: 10, constitution: 1, strength: 1, dexterity: 1, intelligence: 1, wisdom: 1, charisma: 1, playerNotes: "", gmNotes: "", inCampaign: true, important: false, createdByUid: "", createdAt: "2026-01-01", updatedAt: "" };
  const session = { id: "s-1", campaignId: "camp-1", name: "Le col des brumes", bannerUrl: "", characterIds: ["char-1"], npcIds: ["npc-1"], shopIds: [], createdByUid: "", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "" };
  const { AppRouterContext } = createRequire(import.meta.url)("next/dist/shared/lib/app-router-context.shared-runtime.js");
  const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
  const render = (sessions) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router }, React.createElement(SessionCreator, { campaignId: "camp-1", initialSessions: sessions, initialSessionId: sessions[0]?.id || "", members: [member], npcs: [npc], shops: [], generatorItems: [] })));

  const empty = render([]);
  assert.match(empty, /Aucune session/);
  assert.match(empty, /Créer une nouvelle session/);

  const html = render([session]);
  assert.match(html, /Le col des brumes/);
  assert.match(html, /Aelis/);
  assert.match(html, /Basile Orme/);
  assert.match(html, /Ajouter un PNJ/);
  assert.match(html, /Ajouter un marché/);
});

test("shows a light Token button and the formatted player titles", async () => {
  const { TokenButton } = await vite.ssrLoadModule("/components/eraser/token-editor.tsx");
  const html = renderToStaticMarkup(React.createElement(TokenButton, { kind: "npc", ownerId: "npc-1", name: "Basile", source: "/api/npcs/portrait/npc-1", style: { kind: "npc" } }));
  assert.match(html, /Token/);
  assert.match(html, /\/api\/tokens\/npc\/npc-1/);

  const { displayedMultipleValue } = await vite.ssrLoadModule("/lib/multiple-values.ts");
  assert.equal(displayedMultipleValue('{"values":["Le barbu","L\'ivrogne du coin"],"selected":"L\'ivrogne du coin"}'), "L'ivrogne du coin");
  assert.equal(displayedMultipleValue('["Chamane"]', "all"), "Chamane");
  assert.equal(displayedMultipleValue("Haut-homme"), "Haut-homme");
});

test("greys a character sheet from 0 HP and turns it red at minus the total", async () => {
  const { characterLifeState } = await vite.ssrLoadModule("/lib/character-life.ts");
  assert.equal(characterLifeState("12", "50"), "alive");
  assert.equal(characterLifeState("0", "50"), "down");
  assert.equal(characterLifeState("", "50"), "down");
  assert.equal(characterLifeState("-49", "50"), "down");
  assert.equal(characterLifeState("-50", "50"), "dead");
  assert.equal(characterLifeState("-80", "50"), "dead");
  // Vie totale pas encore renseignée : la fiche reste normale.
  assert.equal(characterLifeState("0", "0"), "alive");
  assert.equal(characterLifeState("", ""), "alive");
  assert.equal(characterLifeState("-5", ""), "down");
});

test("keeps every rich text editor out of a label", async () => {
  // Dans un <label>, chaque clic du texte part au bouton « Gras » de la barre (le
  // curseur saute) et le Label de l'interface bloque le double-clic sur un mot.
  const { readdir } = await import("node:fs/promises");
  const offenders = [];
  for (const folder of ["components", "app"]) {
    const files = (await readdir(new URL(`../${folder}/`, import.meta.url), { recursive: true })).filter((file) => file.endsWith(".tsx"));
    for (const file of files) {
      if (file.endsWith("rich-text.tsx")) continue;
      const source = await readFile(new URL(`../${folder}/${file}`, import.meta.url), "utf8");
      for (const field of source.matchAll(/<RichTextField\b/g)) {
        const before = source.slice(0, field.index);
        const opened = Math.max(before.lastIndexOf("<label"), before.lastIndexOf("<Label"));
        const closed = Math.max(before.lastIndexOf("</label>"), before.lastIndexOf("</Label>"));
        if (opened > closed) offenders.push(`${folder}/${file}:${before.split("\n").length}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("names rich text fields and resets their weight", async () => {
  const { RichTextField } = await vite.ssrLoadModule("/components/eraser/rich-text.tsx");
  const html = renderToStaticMarkup(React.createElement(RichTextField, { value: "<p>Bonjour</p>", onCommit() {}, ariaLabel: "Notes MJ" }));
  assert.match(html, /role="textbox"/);
  assert.match(html, /aria-label="Notes MJ"/);
  assert.match(html, /font-normal/);
});

test("types every index column from one registry", async () => {
  const { choiceCorrection, columnTypeLabel, compactRichText, isCheckedValue, checkboxValue, objectColumnSpec } = await vite.ssrLoadModule("/lib/index-columns.ts");
  const { worldColumnSpec, creatureChoices } = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  // Les fautes de liste sont reconnues et corrigées ; une valeur juste ou hors liste ne bouge pas.
  assert.equal(choiceCorrection("Aggressif", creatureChoices["Comportement"]), "Agressif");
  assert.equal(choiceCorrection("Forêt noir", creatureChoices["Emplacement principal"]), "Forêt noire");
  assert.equal(choiceCorrection("Agressif", creatureChoices["Comportement"]), null);
  assert.equal(choiceCorrection("Donjon-Ruine", creatureChoices["Emplacement principal"]), null);
  // Un texte enrichi sans mise en forme redevient du texte simple.
  assert.equal(compactRichText("Capitaine &amp; comte<br>"), "Capitaine & comte");
  assert.equal(compactRichText("<strong>Capitaine</strong>"), "<strong>Capitaine</strong>");
  // Types des index du monde, principal et secondaires, formulaire compris.
  assert.equal(worldColumnSpec("creatures", "Créatures", "Nom").kind, "name-form");
  assert.equal(worldColumnSpec("places", "Villes", "Nom").kind, "name-form");
  assert.equal(worldColumnSpec("places", "Villes", "Peuple").kind, "linked");
  assert.equal(worldColumnSpec("places", "Villes", "Type").kind, "rich");
  assert.equal(worldColumnSpec("places", "Villes", "ID").kind, "id");
  assert.equal(columnTypeLabel(worldColumnSpec("creatures", "Créatures", "Portrait")), "Fichier (images, un seul) · Formulaire");
  assert.equal(columnTypeLabel(worldColumnSpec("creatures", "Créatures", "Organisation")), "Liste · Formulaire");
  assert.equal(worldColumnSpec("creatures", "Créatures", "Environnement").kind, "archived");
  assert.equal(worldColumnSpec("creatures", "Créatures", "Sorts actifs").kind, "spells");
  // Objets : icône et image sont des fichiers image, « Actif » vide reste actif, le prix est une somme d'argent.
  const headers = ["ID", "Nom", "Icône", "Image", "Actif", "Prix"];
  assert.deepEqual(headers.map((header) => objectColumnSpec(header, headers).kind), ["id", "name-form", "file", "file", "checkbox", "number"]);
  assert.equal(objectColumnSpec("ID", headers).hidden, true);
  assert.deepEqual(objectColumnSpec("Icône", headers).file, { accept: "image" });
  assert.equal(objectColumnSpec("Prix", headers).number.unit, "money");
  assert.equal(isCheckedValue("", true), true);
  assert.equal(isCheckedValue("Non", true), false);
  assert.equal(checkboxValue(false, "TRUE"), "FALSE");
  assert.equal(checkboxValue(true, ""), "Oui");
});

test("builds grid columns from their type", async () => {
  const { indexGridColumn } = await vite.ssrLoadModule("/components/eraser/index-cells.tsx");
  const { SheetGrid } = await vite.ssrLoadModule("/components/eraser/sheet-grid.tsx");
  const context = { valueOf: (_row, column) => ({ nom: "Aldor", charges: "3", portrait: "🗡️", id: "CRE-1234ABCD" })[column] ?? "", commit: () => {} };
  const columns = [
    indexGridColumn("nom", "Nom", { kind: "name", also: ["fixed"] }, 200, context),
    indexGridColumn("charges", "Charges", { kind: "gauge", also: ["number"], gauge: { style: "icons", max: 5 } }, 120, context),
    indexGridColumn("portrait", "Icône", { kind: "file", file: { accept: "image" } }, 120, context),
    indexGridColumn("id", "ID", { kind: "id" }, 120, context),
  ];
  // Tous les noms ouvrent la fiche : un ancien « Nom » devient un Nom formulaire.
  assert.equal(typeof columns[0].control, "function");
  assert.equal(columns[0].plain, true);
  assert.equal(columns[1].typeLabel, "Jauge (icônes, sur 5) · Nombre");
  const html = renderToStaticMarkup(React.createElement(SheetGrid, {
    layoutKey: "test:types", columns, rows: [{ key: "2", rowNumber: 2 }], valueOf: context.valueOf, onCommit: () => {}, empty: "Vide",
  }));
  // Le type se lit au survol de l'en-tête.
  assert.match(html, /Type : Nom formulaire · Style imposé/);
  // Jauge en icônes : cinq étincelles, dont trois pleines.
  assert.equal((html.match(/aria-label="Charges : \d"/g) || []).length, 5);
  assert.match(html, /CRE-1234ABCD/);
  assert.match(html, /🗡️/);
  // En lecture seule, plus aucune cellule modifiable.
  const readOnly = renderToStaticMarkup(React.createElement(SheetGrid, {
    layoutKey: "test:types", columns: [{ key: "nom", label: "Nom", width: 200 }], rows: [{ key: "2", rowNumber: 2 }], valueOf: () => "Aldor", onCommit: () => {}, empty: "Vide", readOnly: true,
  }));
  assert.doesNotMatch(readOnly, /contenteditable="true"/i);
});

test("reads, converts and sorts formatted numbers", async () => {
  const { parseIndexNumber, formatIndexNumber, conversionsOf, numberSortKey, numberCorrection } = await vite.ssrLoadModule("/lib/index-numbers.ts");
  const money = { unit: "money", defaultUnit: "PO" };
  // 1 PO = 100 PC, 1 PN = 1,5 PO.
  assert.equal(parseIndexNumber("1 PO", money).base, 100);
  assert.equal(parseIndexNumber("1 PN", money).base, 150);
  assert.equal(parseIndexNumber("12", money).unit, "PO");
  assert.equal(parseIndexNumber("2 pièces d'or noir", money).unit, "PN");
  assert.equal(parseIndexNumber("3 PON", money).unit, "PN");
  // Plusieurs montants dans la même case s'additionnent.
  assert.equal(parseIndexNumber("5 PO 20 PC", money).base, 520);
  const texts = Object.fromEntries(conversionsOf(parseIndexNumber("3 PO", money), money).map((entry) => [entry.unit, entry.text]));
  assert.equal(texts.PC, "300 PC");
  assert.equal(texts.PN, "2 PN");
  // PA et PB n'existent pas : ce sont des PC, et « Corriger » les réécrit.
  const silver = parseIndexNumber("40 PA", money);
  assert.equal(silver.unit, "PC");
  assert.equal(silver.corrected, true);
  assert.equal(numberCorrection("40 PA", money), "40 PC");
  assert.equal(numberCorrection("40 PC", money), null);
  // Le tri suit la valeur, pas le texte.
  assert.ok(numberSortKey("50 PC", money) < numberSortKey("2 PO", money));
  assert.equal(numberSortKey("", money), Number.POSITIVE_INFINITY);
  // Distances et plages.
  const distance = { unit: "distance", defaultUnit: "m" };
  assert.equal(parseIndexNumber("1,5 km", distance).base, 150000);
  assert.equal(formatIndexNumber(parseIndexNumber("1500 m", distance), distance, "km"), "1,5 km");
  const range = parseIndexNumber("2-5 m", { ...distance, range: true });
  assert.equal(range.base, 200);
  assert.equal(range.baseMax, 500);
});

test("computes lookups and rollups from related rows", async () => {
  const { computeRollup } = await vite.ssrLoadModule("/lib/index-columns.ts");
  const money = { unit: "money", defaultUnit: "PO" };
  assert.equal(computeRollup("count", 3, ["a", "", "b"]), "3");
  assert.equal(computeRollup("filled", 3, ["a", "", "b"]), "2");
  assert.equal(computeRollup("unique", 3, ["Nord", "Sud", "Nord"]), "Nord, Sud");
  assert.equal(computeRollup("sum", 2, ["1 PO", "50 PC"], money), "1,5 PO");
  assert.equal(computeRollup("max", 2, ["1 PO", "150 PC"], money), "1,5 PO");
});

test("lists the schema changes of the index editor in order", async () => {
  const { operationsOf } = await vite.ssrLoadModule("/components/eraser/index-editor.tsx");
  const { headerProblem, tabProblem, objectColumnPolicy, findEntry, isTrashedEntry } = await vite.ssrLoadModule("/lib/index-schema-shared.ts");
  const policy = { rename: true, type: true, remove: true, reasons: [], allowed: "" };
  const tabs = [
    { id: "t1", original: "Villes", name: "Villes", removed: false, remove: true, addColumns: true, columns: [
      { id: "c1", original: "Type", header: "Genre", spec: { kind: "rich" }, originalSpec: { kind: "rich" }, policy, removed: false },
      { id: "c2", original: "Taille", header: "Taille", spec: { kind: "number", number: { unit: "distance" } }, originalSpec: { kind: "rich" }, policy, removed: false },
      { id: "c3", original: "Notes", header: "Notes", spec: { kind: "rich" }, originalSpec: { kind: "rich" }, policy, removed: true },
      { id: "c4", header: "Blason", spec: { kind: "file", file: { accept: "image" } }, policy, removed: false },
    ] },
    { id: "t2", original: "Ruines", name: "Ruines", removed: true, remove: true, addColumns: true, columns: [] },
    { id: "t3", name: "Ports", removed: false, remove: true, addColumns: true, columns: [{ id: "c5", header: "Couleur", spec: { kind: "color" }, policy, removed: false }] },
  ];
  const order = ["Villes", "Ruines"];
  assert.deepEqual(operationsOf(tabs, order).map((operation) => operation.op), ["rename", "spec", "remove-column", "add-column", "remove-tab", "add-tab"]);
  assert.equal(operationsOf(tabs, order)[1].header, "Taille");
  // Une colonne déplacée, un onglet renommé et réordonné.
  const indexed = (columns) => columns.map((column, index) => column.original ? { ...column, originalIndex: index } : column);
  const villes = { ...tabs[0], columns: indexed(tabs[0].columns) };
  const moved = [{ ...tabs[1], removed: false }, { ...villes, name: "Cités", columns: [villes.columns[1], villes.columns[0], villes.columns[3]] }];
  const operations = operationsOf(moved, order);
  assert.deepEqual(operations.filter((operation) => ["order-columns", "rename-tab", "order-tabs"].includes(operation.op)), [
    { op: "order-columns", tab: "Villes", headers: ["Taille", "Genre", "Blason"] },
    { op: "rename-tab", tab: "Villes", to: "Cités" },
    { op: "order-tabs", tabs: ["Ruines", "Cités"] },
  ]);
  assert.match(headerProblem("genre", ["Nom", "Genre"]), /déjà/);
  assert.equal(headerProblem("Genre", ["Nom", "Genre"], "Genre"), "");
  assert.match(tabProblem("Eraser · colonnes", []), /réservé/);
  assert.match(tabProblem("Villes/Ports", []), /ne peut pas/);
  // Les colonnes lues par l'inventaire et les boutiques sont verrouillées, avec la raison.
  const price = objectColumnPolicy("Prix");
  assert.equal(price.rename, false);
  assert.equal(price.type, true);
  assert.match(price.reasons[0], /boutiques/);
  assert.equal(objectColumnPolicy("Notes perso").remove, true);
  const entries = [{ tab: "Villes", column: "Notes", origin: "", spec: null, state: "corbeille", deletedAt: "2026-09-30" }];
  assert.equal(isTrashedEntry(findEntry(entries, "villes", "notes")), true);
});

test("hides masked columns until the toolbar shows them", async () => {
  const { SheetGrid } = await vite.ssrLoadModule("/components/eraser/sheet-grid.tsx");
  const html = renderToStaticMarkup(React.createElement(SheetGrid, {
    layoutKey: "test:hidden",
    columns: [{ key: "nom", label: "Nom", width: 200 }, { key: "id", label: "Identifiant", width: 120, hidden: true }],
    rows: [{ key: "2", rowNumber: 2 }], valueOf: () => "Aldor", onCommit: () => {}, empty: "Vide",
  }));
  assert.doesNotMatch(html, />Identifiant</);
  assert.match(html, /Colonnes masquées \(1\)/);
});

test("renders the read-only editor of a system index with its locks", async () => {
  const { spellEditorModel, npcEditorModel } = await vite.ssrLoadModule("/lib/system-index-models.ts");
  const spells = spellEditorModel("classes");
  assert.equal(spells.readOnly, true);
  assert.ok(spells.tabs[0].columns.every((column) => column.policy.reasons.length > 0));
  assert.ok(npcEditorModel().tabs[0].columns.some((column) => column.header === "ID" && column.spec.hidden));
});

test("counts each spell's own charges instead of filling a shared gauge", async () => {
  const { GaugeCell } = await vite.ssrLoadModule("/components/eraser/index-cells.tsx");
  const render = (value) => renderToStaticMarkup(React.createElement(GaugeCell, { label: "Charges", value, settings: { style: "icons", max: 5, mode: "count", unlimited: "✦" }, onChange: () => {} }));
  // « 3 » : trois étincelles, pas trois sur cinq. Seule une icône pleine a la couche des
  // traits clairs (ses détails) : on compte ces couches.
  const glyphs = (markup) => (markup.match(/stroke="#fffaf0"/g) || []).length;
  assert.equal(glyphs(render("3")), 3);
  assert.equal(glyphs(render("1")), 1);
  // « ✦ » (charges sans nombre) reste tel quel.
  assert.match(render("✦"), />✦</);
  // Une jauge à remplir au-delà de cinq icônes répond sur toute sa longueur.
  const ten = renderToStaticMarkup(React.createElement(GaugeCell, { label: "Points", value: "7", settings: { style: "icons", max: 10 }, onChange: () => {} }));
  // Maximum lu dans une autre colonne : 12 PV sur 20.
  const bar = renderToStaticMarkup(React.createElement(GaugeCell, { label: "PV", value: "12", settings: { style: "bar", max: 10, scale: "from-column", maxColumn: "PV max" }, maxValue: 20, onChange: () => {} }));
  assert.match(bar, /max="20"/);
  assert.match(bar, />12\/20</);
  // Une icône choisie (tête de mort) ou un émoji.
  const skulls = renderToStaticMarkup(React.createElement(GaugeCell, { label: "Danger", value: "2", settings: { style: "icons", max: 3, icon: "skull" }, onChange: () => {} }));
  assert.match(skulls, /lucide-skull/);
  const drops = renderToStaticMarkup(React.createElement(GaugeCell, { label: "Eau", value: "2", settings: { style: "icons", max: 3, emoji: "💧" }, onChange: () => {} }));
  assert.equal((drops.match(/💧/g) || []).length, 3);
  assert.equal((ten.match(/aria-label="Points : \d+"/g) || []).length, 10);
});

test("computes every documented formula example exactly as the guide shows it", async () => {
  const { formulaFunctions, formulaOperators, computeFormulaDisplay, formulaDisplayText, sampleFormulaContext, seededRandom } = await vite.ssrLoadModule("/lib/index-formula.ts");
  const context = sampleFormulaContext();
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  let checked = 0;
  for (const definition of formulaFunctions) {
    assert.ok(definition.examples.length > 0, `${definition.name} n'a pas d'exemple`);
    for (const example of definition.examples) {
      const display = computeFormulaDisplay(example.formula, definition.random ? sampleFormulaContext(seededRandom(example.formula)) : context);
      assert.notEqual(display.kind, "error", `${example.formula} : ${display.message}`);
      if (definition.random) continue;
      const text = display.kind === "checkbox" ? (display.value ? "VRAI" : "FAUX") : formulaDisplayText(display);
      assert.equal(normalize(text), normalize(example.result), example.formula);
      checked += 1;
    }
  }
  for (const operator of formulaOperators) {
    const display = computeFormulaDisplay(operator.example, context);
    const text = display.kind === "checkbox" ? (display.value ? "VRAI" : "FAUX") : formulaDisplayText(display);
    assert.equal(normalize(text), normalize(operator.result), operator.example);
  }
  assert.ok(checked > 60, `${checked} exemples vérifiés`);
});

test("explains formula mistakes in plain French and keeps random draws stable", async () => {
  const { formulaProblem, computeFormulaDisplay, sampleFormulaContext, seededRandom, displayFormulaValue, formulaColumns } = await vite.ssrLoadModule("/lib/index-formula.ts");
  assert.match(formulaProblem("SI({Rang} > 2; \"oui\""), /parenthèse fermante/);
  assert.match(formulaProblem("SOMME(1; 2) SOMME(3)"), /opérateur/);
  assert.match(formulaProblem("ARONDI(2,5)"), /Voulais-tu dire ARRONDI/);
  assert.match(formulaProblem("Rang + 1"), /accolades/);
  assert.match(formulaProblem("SI(1)"), /SI\(condition; si_vrai; si_faux\)/);
  assert.equal(formulaProblem("{Prix} * 2"), "");
  const missing = computeFormulaDisplay("{Inconnue} + 1", sampleFormulaContext());
  assert.equal(missing.kind, "error");
  assert.match(missing.message, /n’existe pas/);
  // 1,5 est une décimale ; « 1; 5 » ou « 1, 5 » sépare deux arguments.
  assert.equal(computeFormulaDisplay("MAX(1,5; 1)", sampleFormulaContext()).text, "1,5");
  assert.equal(computeFormulaDisplay("MAX(1, 5)", sampleFormulaContext()).text, "5");
  // Un prix de colonne est lu dans l'unité par défaut ; le résultat prend le format de la colonne.
  const doubled = computeFormulaDisplay("{Prix} * 2", sampleFormulaContext(), "number", { unit: "money", defaultUnit: "PO" });
  assert.equal(doubled.text.replace(/\s+/g, " "), "4 PO");
  // Le même germe donne le même tirage.
  const first = computeFormulaDisplay("ALEA.ENTRE(1; 1000)", sampleFormulaContext(seededRandom("ligne 12")));
  const second = computeFormulaDisplay("ALEA.ENTRE(1; 1000)", sampleFormulaContext(seededRandom("ligne 12")));
  assert.equal(first.text, second.text);
  assert.equal(displayFormulaValue(true).kind, "checkbox");
  assert.deepEqual(formulaColumns("SI({Rang} > 2; {Nom}; {Nom})"), ["Rang", "Nom"]);
});

test("draws numbers, dice, weighted options and filtered index rows", async () => {
  const { drawRandom, weightedPick } = await vite.ssrLoadModule("/lib/index-random.ts");
  const { seededRandom, sampleFormulaContext, columnFormulaValue } = await vite.ssrLoadModule("/lib/index-formula.ts");
  const context = (seed) => ({ random: seededRandom(seed), row: sampleFormulaContext() });
  for (let seed = 0; seed < 30; seed += 1) {
    const number = Number(drawRandom({ source: "number", min: 3, max: 6 }, context(`n${seed}`)).values[0]);
    assert.ok(number >= 3 && number <= 6 && Number.isInteger(number));
    const dice = drawRandom({ source: "dice", dice: "2d6+1" }, context(`d${seed}`));
    assert.ok(Number(dice.values[0]) >= 3 && Number(dice.values[0]) <= 13, dice.values[0]);
    assert.match(dice.detail, /^2d6 \[\d, \d\]$/);
  }
  // Un poids nul n'est jamais tiré ; sans doublon, chaque option sort une fois.
  for (let seed = 0; seed < 30; seed += 1) {
    assert.deepEqual(weightedPick([{ value: "a", weight: 0 }, { value: "b", weight: 2 }], seededRandom(`w${seed}`)), ["b"]);
  }
  const three = drawRandom({ source: "list", options: [{ value: "Pluie" }, { value: "Soleil" }, { value: "Brume" }], count: 3, unique: true }, context("u"));
  assert.deepEqual([...three.values].sort(), ["Brume", "Pluie", "Soleil"]);
  // Une valeur d'une autre colonne de la ligne.
  assert.ok(["Elfes", "Nains"].includes(drawRandom({ source: "column", column: "Peuples" }, context("c")).values[0]));
  // Une ligne d'un index, filtrée par une formule et pondérée.
  const creatures = [
    { name: "Loup", rang: "1", poids: "5" },
    { name: "Troll", rang: "4", poids: "1" },
    { name: "Dragon", rang: "5", poids: "0" },
  ].map((row) => ({
    name: row.name,
    cell: (header) => ({ nom: row.name, rang: row.rang, ponderation: row.poids })[header.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")] ?? "",
    formula: { column: (name) => name.toLowerCase() === "rang" ? columnFormulaValue(row.rang, { kind: "number" }) : name.toLowerCase() === "nom" ? row.name : undefined },
  }));
  for (let seed = 0; seed < 20; seed += 1) {
    const draw = drawRandom({ source: "index", index: { index: "creatures", tab: "*", filter: "{Rang} >= 2", weightColumn: "Pondération" } }, { ...context(`i${seed}`), rowsOf: () => creatures });
    assert.deepEqual(draw.values, ["Troll"]);
  }
  assert.match(drawRandom({ source: "index", index: { index: "creatures", tab: "*", filter: "{Rang} > 9" } }, { ...context("x"), rowsOf: () => creatures }).error, /Aucune ligne/);
  assert.match(drawRandom({ source: "dice", dice: "2x6" }, context("e")).error, /2d6\+1/);
});

test("runs a button's steps in order, with column templates and formulas", async () => {
  const { runActionButton, buttonVisible, resolveText, cellTextFor, actionStepCatalog } = await vite.ssrLoadModule("/lib/index-actions.ts");
  const { columnFormulaValue } = await vite.ssrLoadModule("/lib/index-formula.ts");
  const specs = { nom: { kind: "name" }, pv: { kind: "number" }, "pv max": { kind: "number" }, charges: { kind: "gauge", gauge: { style: "icons", max: 5 } }, mort: { kind: "checkbox" }, prix: { kind: "number", number: { unit: "money", defaultUnit: "PO" } } };
  const cells = { nom: "Gobelin", pv: "12", "pv max": "20", charges: "3", mort: "Non", prix: "2 PO" };
  const key = (header) => header.toLowerCase();
  const notices = [];
  const runtime = {
    row: () => ({ column: (name) => key(name) in cells ? columnFormulaValue(cells[key(name)], specs[key(name)]) : undefined }),
    cell: (header) => cells[key(header)] ?? "",
    specOf: (header) => specs[key(header)],
    setCell: async (header, value) => { cells[key(header)] = value },
    confirm: async () => true,
    notify: (message, tone) => notices.push(`${tone ?? "info"}:${message}`),
    openUrl: () => {}, navigate: () => {}, copy: async () => {},
  };
  // −1 charge, bornée à 0 ; soins jusqu'au maximum ; formule et texte.
  await runActionButton({ id: "a", label: "Charge", steps: [{ type: "increment", column: "Charges", amount: "-1", min: "0" }] }, runtime);
  assert.equal(cells.charges, "2");
  await runActionButton({ id: "b", label: "Soin", steps: [{ type: "increment", column: "PV", amount: "=DES(\"1d4\") + 100", max: "{PV max}" }] }, runtime);
  assert.equal(cells.pv, "20");
  await runActionButton({ id: "c", label: "Tuer", confirm: "Tuer {Nom} ?", steps: [{ type: "set", column: "PV", value: "0" }, { type: "toggle", column: "Mort" }, { type: "notify", message: "{Nom} est mort (=pas une formule)" }] }, runtime);
  assert.equal(cells.pv, "0");
  assert.equal(cells.mort, "Oui");
  assert.equal(notices.at(-1), "info:Gobelin est mort (=pas une formule)");
  await runActionButton({ id: "d", label: "Doubler", steps: [{ type: "set", column: "Prix", value: "={Prix} * 2" }] }, runtime);
  assert.equal(cells.prix.replace(/\s/g, " "), "4 PO");
  // Une étape impossible arrête le bouton avec un message clair.
  await runActionButton({ id: "e", label: "Dupliquer", steps: [{ type: "duplicate" }, { type: "clear", column: "Nom" }] }, runtime);
  assert.match(notices.at(-1), /^error:« Dupliquer » n’est pas possible/);
  assert.equal(cells.nom, "Gobelin");
  // Condition d'affichage.
  assert.equal(buttonVisible({ id: "f", label: "x", steps: [], condition: "{Mort}" }, runtime.row()), true);
  assert.equal(buttonVisible({ id: "g", label: "x", steps: [], condition: "NON({Mort})" }, runtime.row()), false);
  assert.equal(resolveText("{Nom} ({Inconnue})", runtime.row()), "Gobelin ({Inconnue})");
  assert.equal(cellTextFor(true, { kind: "checkbox" }, "TRUE"), "TRUE");
  assert.ok(actionStepCatalog.length >= 17);
});

test("reorders sheet columns with the fewest moves and tells display changes apart", async () => {
  const { columnMoves, isDisplayOnlyChange } = await vite.ssrLoadModule("/lib/index-schema-shared.ts");
  const apply = (headers, moves) => { const working = [...headers]; for (const move of moves) { const [item] = working.splice(move.from, 1); working.splice(move.to, 0, item) } return working };
  const headers = ["Nom", "Type", "Ancienne", "Région", "Note", "ID"];
  // « Ancienne » (à la corbeille) ne fait pas partie de l'ordre voulu : elle garde sa place.
  const desired = ["Nom", "Région", "Type", "Note", "ID"];
  const moved = apply(headers, columnMoves(headers, desired));
  assert.deepEqual(moved, ["Nom", "Région", "Ancienne", "Type", "Note", "ID"]);
  assert.deepEqual(columnMoves(headers, headers), []);
  assert.deepEqual(apply(headers, columnMoves(headers, ["ID", "Note", "Région", "Ancienne", "Type", "Nom"])), ["ID", "Note", "Région", "Ancienne", "Type", "Nom"]);
  // Style, emplacement, masquée, Nom ↔ Nom formulaire : l'affichage seulement.
  assert.equal(isDisplayOnlyChange({ kind: "name", also: ["fixed"] }, { kind: "name-form", style: { bold: true }, placement: "both" }), true);
  assert.equal(isDisplayOnlyChange({ kind: "rich" }, { kind: "rich", style: { color: "#b3261e" }, hidden: true }), true);
  assert.equal(isDisplayOnlyChange({ kind: "rich" }, { kind: "number" }), false);
  assert.equal(isDisplayOnlyChange({ kind: "choice", options: [{ value: "A" }] }, { kind: "choice", options: [{ value: "B" }] }), false);
});

test("reads the character sheet from the characteristics and skills index without moving a column", async () => {
  const catalogModule = await vite.ssrLoadModule("/lib/character-catalog.ts");
  const cellsModule = await vite.ssrLoadModule("/lib/character-sheet-cells.ts");
  const schema = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
  const { builtinCharacterCatalog, catalogFromTables, catalogSeedRows, characterLayout, planCatalogColumns, catalogGroups, CHARACTERISTICS_TAB, SKILLS_TAB } = catalogModule;

  // Une feuille existante et la liste d'origine : rien à ajouter, rien à renommer.
  const base = [...schema.characterValueHeaders];
  assert.deepEqual(planCatalogColumns(base, builtinCharacterCatalog), { append: [], rename: [] });

  // Les lignes de départ de l'index redonnent exactement la liste d'origine.
  const seed = catalogSeedRows();
  const table = (rows) => {
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row))), "ID"];
    return { headers, rows: rows.map((row, index) => headers.map((header) => header === "ID" ? `ID-${index}` : row[header] ?? "")) };
  };
  const fromSeed = catalogFromTables(table(seed[CHARACTERISTICS_TAB]), table(seed[SKILLS_TAB]));
  assert.deepEqual(fromSeed.characteristics, builtinCharacterCatalog.characteristics);
  assert.deepEqual(fromSeed.skills, builtinCharacterCatalog.skills);
  assert.equal(fromSeed.skills.find((skill) => skill.key === "Parade").defaultValue, "0");
  assert.equal(fromSeed.skills.find((skill) => skill.key === "Escalade").defaultValue, "-20");

  // Les formules d'une compétence d'origine sont celles d'avant l'index.
  const layout = characterLayout(base);
  const parade = schema.characterSkills.findIndex((skill) => skill.name === "Parade");
  const values = base.map(() => "");
  cellsModule.applySkillCells(values, 7, layout, builtinCharacterCatalog);
  const cell = (index) => cellsModule.characterValueCell(index, 7);
  const bonus = schema.characterSkillValueIndex(parade, 0);
  const modifier = schema.characterSkillValueIndex(parade, 1);
  assert.equal(values[bonus], "0");
  assert.equal(values[schema.characterSkillValueIndex(parade, 2)], cellsModule.cappedStatFormula(`${cell(30)}+${cell(bonus)}+${cell(modifier)}`));
  assert.equal(values[schema.characterSkillValueIndex(parade, 5)], `=${cell(23)}+${cell(schema.characterCriticalValueIndex(5, "success"))}+${cell(schema.characterSkillValueIndex(parade, 3))}+${cell(schema.characterSkillValueIndex(parade, 4))}`);

  // Une compétence et une caractéristique ajoutées : leurs colonnes vont à la fin, nommées d'après la ligne et reliées par leur ID.
  const added = {
    ...builtinCharacterCatalog,
    source: "index",
    characteristics: [...builtinCharacterCatalog.characteristics, { key: "CAR-1A2B3C4D", name: "Arcane", kind: "principale", defaultValue: "25" }],
    skills: [...builtinCharacterCatalog.skills, { key: "COM-5E6F7A8B", name: "Pêche à la mouche", characteristicKey: "CAR-1A2B3C4D", defaultValue: "-10" }],
  };
  const plan = planCatalogColumns(base, added);
  assert.equal(plan.append.length, 3 + 9);
  assert.equal(plan.append[0].header, "Arcane [CAR-1A2B3C4D]");
  assert.equal(plan.append[1].header, "Arcane — Réussite critique [CAR-1A2B3C4D]");
  assert.equal(plan.append[3].header, "Pêche à la mouche — Bonus/Malus de stats [COM-5E6F7A8B]");
  const extended = [...base, ...plan.append.map((column) => column.header)];
  const wide = characterLayout(extended);
  assert.equal(wide.index("CAR-1A2B3C4D"), base.length);
  assert.equal(wide.index("COM-5E6F7A8B", "Total de stats"), base.length + 5);
  assert.equal(wide.index("Parade", "Total de stats"), schema.characterSkillValueIndex(parade, 2));
  assert.deepEqual(planCatalogColumns(extended, added), { append: [], rename: [] });

  // Renommer la ligne renomme l'en-tête de ses colonnes, sans en ajouter.
  const renamed = { ...added, skills: added.skills.map((skill) => skill.key === "COM-5E6F7A8B" ? { ...skill, name: "Pêche" } : skill) };
  const renamePlan = planCatalogColumns(extended, renamed);
  assert.equal(renamePlan.append.length, 0);
  assert.equal(renamePlan.rename.length, 9);
  assert.equal(renamePlan.rename[0].header, "Pêche — Bonus/Malus de stats [COM-5E6F7A8B]");

  // Valeurs de départ et formules d'une fiche existante dans les nouvelles colonnes seulement.
  const row = extended.map(() => "");
  const only = new Set(plan.append.map((column) => column.key));
  cellsModule.applyCharacteristicDefaults(row, wide, added, only);
  cellsModule.applySkillCells(row, 4, wide, added, only);
  assert.equal(row[base.length], "25");
  assert.equal(row[wide.index("COM-5E6F7A8B", "Bonus/Malus de stats")], "-10");
  assert.match(row[wide.index("COM-5E6F7A8B", "Total de stats")], new RegExp(cellsModule.characterValueCell(base.length, 4)));
  assert.equal(row[bonus], "", "les colonnes d'origine ne sont pas touchées");

  // La fiche range la compétence sous sa caractéristique.
  const groups = catalogGroups(added);
  assert.equal(groups.at(-1).characteristic.name, "Arcane");
  assert.deepEqual(groups.at(-1).skills.map((skill) => skill.name), ["Pêche à la mouche"]);
});

test("shows a skill added to the index on the character sheet and lets items target it", async () => {
  const { CharacterSheet } = await vite.ssrLoadModule("/components/eraser/character-sheet.tsx");
  const { builtinCharacterCatalog, planCatalogColumns } = await vite.ssrLoadModule("/lib/character-catalog.ts");
  const { characterValueHeaders, characterCustomTabsIndex } = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
  const { parseItemModifiers, serializeItemModifiers, buildItemModifierTargets, characterLayout } = {
    ...(await vite.ssrLoadModule("/lib/item-modifiers.ts")),
    ...(await vite.ssrLoadModule("/lib/character-catalog.ts")),
  };
  const catalog = {
    ...builtinCharacterCatalog,
    source: "index",
    characteristics: [...builtinCharacterCatalog.characteristics, { key: "CAR-1A2B3C4D", name: "Arcane", kind: "principale", defaultValue: "25" }, { key: "CAR-9C9C9C9C", name: "Fatigue", kind: "secondaire", defaultValue: "0" }],
    skills: [...builtinCharacterCatalog.skills, { key: "COM-5E6F7A8B", name: "Pêche à la mouche", characteristicKey: "CAR-1A2B3C4D", defaultValue: "-10" }],
  };
  const headers = [...characterValueHeaders, ...planCatalogColumns([...characterValueHeaders], catalog).append.map((column) => column.header)];
  const values = headers.map(() => "");
  values[0] = "Personnage test";
  values[characterCustomTabsIndex] = "[]";
  const html = renderToStaticMarkup(React.createElement(CharacterSheet, {
    initialCharacter: { id: "PER-TEST", ownerUid: "USR-TEST", name: "Personnage test", subtitle: "", updatedAt: "2026-09-05T00:00:00.000Z", campaigns: [], values, headers },
    catalog,
    classes: [],
    classSpells: [],
  }));
  assert.match(html, /Arcane/);
  assert.match(html, /Pêche à la mouche/);
  assert.match(html, /Fatigue/);

  const targets = buildItemModifierTargets(catalog, characterLayout(headers));
  assert.ok(targets.some((target) => target.id === "comp:COM-5E6F7A8B" && target.label === "Pêche à la mouche" && target.valueIndex > characterValueHeaders.length));
  assert.ok(targets.some((target) => target.id === "carac:CAR-9C9C9C9C" && target.group === "Général"));
  const saved = serializeItemModifiers([{ value: "+3", target: "comp:COM-5E6F7A8B" }, { value: "1", target: "crit-reussite:comp:COM-5E6F7A8B" }]);
  assert.equal(parseItemModifiers(saved).length, 2);
});

test("sends builtin index definitions to the page without functions", async () => {
  const { worldIndexDefinitions, worldIndexSeeds } = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  // Une définition passe du serveur à la page : elle doit rester sérialisable.
  for (const definition of Object.values(worldIndexDefinitions)) {
    assert.deepEqual(JSON.parse(JSON.stringify(definition)), definition, `définition ${definition.key}`);
  }
  const seeds = worldIndexSeeds.skills();
  assert.equal(seeds["Compétences"].length, 78);

  assert.equal(seeds["Caractéristiques"].length, 24);
  assert.equal(seeds["Caractéristiques"].find((row) => row["Clé de fiche"] === "Folie")["Couleur"], "#8f79b5");

  // La Caractéristique d'une compétence ne propose que les principales de l'onglet Caractéristiques.
  const { worldColumnSpec } = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  const spec = worldColumnSpec("skills", "Compétences", "Caractéristique");
  assert.deepEqual(spec.source, { index: "skills", tab: "Caractéristiques", onlyTab: true, exclude: { column: "Type", value: "Secondaire" } });
  assert.equal(worldColumnSpec("skills", "Caractéristiques", "Couleur").kind, "color");
  assert.ok(worldIndexDefinitions.skills.tabs[0].headers.includes("Couleur"));

  // Une couleur choisie dans l'index est lue par la fiche ; une case vide garde la couleur d'origine.
  const { catalogFromTables } = await vite.ssrLoadModule("/lib/character-catalog.ts");
  const parsed = catalogFromTables({ headers: ["Nom", "Type", "Valeur par défaut", "Clé de fiche", "ID", "Couleur"], rows: [["Force", "Principale", "0", "Force", "CAR-1", "#123456"], ["Arcane", "Principale", "", "", "CAR-2", ""]] }, null);
  assert.equal(parsed.characteristics[0].color, "#123456");
  assert.equal(parsed.characteristics[1].color, undefined);
});

test("marks unlocked builtin columns as forced changes", async () => {
  const { operationsOf } = await vite.ssrLoadModule("/components/eraser/index-editor.tsx");
  const locked = { rename: false, type: false, remove: false, reasons: ["La fiche lit cette colonne."], allowed: "" };
  const free = { rename: true, type: true, remove: true, reasons: locked.reasons, allowed: "Tout (déverrouillée)." };
  const tabs = [{ id: "t1", original: "Succès", name: "Succès", removed: false, remove: false, addColumns: true, columns: [
    { id: "c1", original: "Couleur", header: "Teinte", spec: { kind: "color" }, originalSpec: { kind: "color" }, policy: free, lockedPolicy: locked, removed: false },
    { id: "c2", original: "Note", header: "Remarque", spec: { kind: "rich" }, originalSpec: { kind: "rich" }, policy: free, removed: false },
  ] }];
  const operations = operationsOf(tabs, ["Succès"]);
  assert.deepEqual(operations.map((operation) => [operation.header, Boolean(operation.force)]), [["Couleur", true], ["Note", false]]);
});

test("offers a rank's spell choice again once its chosen spell is removed", async () => {
  const { pendingSpellChoices } = await vite.ssrLoadModule("/components/eraser/class-progression.tsx");
  const spell = (id, rank) => ({ id, rowNumber: 1, name: id, effect: "", effectHtml: "", description: "", descriptionHtml: "", type: "Sort actif", category: "actif", actionKind: "action", skillsRaw: "", skills: [], distance: "", distanceHtml: "", charges: 1, chargesLabel: "1", classRanks: { samourai: rank }, tone: { background: "#000", foreground: "#fff" } });
  const classes = [{ id: "samourai", name: "Samouraï", accentDark: "#7f3430", accentLight: "#e9c4b0" }];
  const spells = [spell("A", 1), spell("B", 1), spell("C", 1), spell("D", 2), spell("Commun", 0)];
  // Rang 2 atteint, rien choisi : les rangs 1 et 2 attendent (le rang commun n'est pas un choix).
  assert.deepEqual(pendingSpellChoices(classes, spells, 2, "").map((choice) => choice.rank), [1, 2]);
  // Le rang 1 choisi : il ne reste que le rang 2.
  const chosen = JSON.stringify({ choices: { samourai: { "1": "B", "2": "D" } } });
  assert.deepEqual(pendingSpellChoices(classes, spells, 2, chosen), []);
  // Le sort choisi au rang 1 retiré de la fiche (ancienne façon) : le choix revient.
  const removed = JSON.stringify({ choices: { samourai: { "1": "B", "2": "D" } }, removed: ["B"] });
  const again = pendingSpellChoices(classes, spells, 2, removed);
  assert.deepEqual(again.map((choice) => [choice.rank, choice.options.map((option) => option.id)]), [[1, ["A", "B", "C"]]]);
});

test("spots items that just arrived in an inventory", async () => {
  const { receivedSlots } = await vite.ssrLoadModule("/components/eraser/new-inventory-items.ts");
  const item = (name) => ({ id: name, name });
  const inventory = (slots) => ({ containers: [{ id: "sac", slots }] });
  const before = inventory([{ id: "s1", itemId: "pomme", item: item("Pomme"), quantity: 2 }, { id: "s2", itemId: "", item: null, quantity: 0 }, { id: "s3", itemId: "corde", item: item("Corde"), quantity: 1 }]);
  const after = inventory([{ id: "s1", itemId: "pomme", item: item("Pomme"), quantity: 3 }, { id: "s2", itemId: "epee", item: item("Épée"), quantity: 1 }, { id: "s3", itemId: "corde", item: item("Corde"), quantity: 1 }]);
  assert.deepEqual(receivedSlots(before, after), ["s1", "s2"]);
  // Sans inventaire précédent (premier chargement), rien n'est « nouveau ».
  assert.deepEqual(receivedSlots(null, after), []);
});

test("keeps computed character cells out of a partial save", async () => {
  const { builtinCharacterCatalog, characterLayout } = await vite.ssrLoadModule("/lib/character-catalog.ts");
  const { computedCellIndexes } = await vite.ssrLoadModule("/lib/character-sheet-cells.ts");
  const schema = await vite.ssrLoadModule("/lib/character-sheet-schema.ts");
  const layout = characterLayout([...schema.characterValueHeaders]);
  const computed = computedCellIndexes(layout, builtinCharacterCatalog, [], () => -1);
  const skill = builtinCharacterCatalog.skills[0].key;
  const metrics = (await vite.ssrLoadModule("/lib/character-catalog.ts")).skillMetrics;
  // Le bonus se saisit ; le modificateur et le total restent des formules.
  assert.equal(computed.has(layout.index(skill, metrics[0])), false);
  assert.equal(computed.has(layout.index(skill, metrics[1])), true);
  assert.equal(computed.has(layout.index(skill, metrics[2])), true);
});

test("reads achievements and who obtained them from the index", async () => {
  const shared = await vite.ssrLoadModule("/lib/achievements-shared.ts");
  const { worldColumnSpec, worldColumnPolicy, worldIndexDefinitions } = await vite.ssrLoadModule("/lib/world-index-definitions.ts");
  const { indexColumnKinds } = await vite.ssrLoadModule("/lib/index-columns.ts");
  const row = (rowNumber, values) => ({ rowNumber, values, html: values });
  const achievements = shared.achievementsFromTable({ headers: ["Nom", "Type", "Sous-type", "Description", "Icône", "Couleur", "ID"], rows: [
    row(2, ["Premier sang", "Joueur", "Combat", "Toucher le premier", "sword", "#aa3355", "SUC-1"]),
    row(3, ["Conteur", "Maître du jeu", "", "", "", "pas une couleur", "SUC-2"]),
    row(4, ["", "Joueur", "", "", "", "", "SUC-3"]),
  ] });
  assert.deepEqual(achievements.map((item) => [item.name, item.type, item.color]), [["Premier sang", "Joueur", "#aa3355"], ["Conteur", "MJ", "#9a4f2c"]]);
  const obtained = shared.obtainedFromTable({ headers: ["Succès", "Joueur", "Attribué par", "Date", "Note", "Compte", "ID"], rows: [
    row(2, ["Premier sang", "Ayla", "Mira", "2026-10-02", "", "uid-ayla", "OBT-1"]),
    row(3, ["Conteur", "Ayla", "Mira", "2026-10-01", "", "", "OBT-2"]),
    row(4, ["Premier sang", "Bram", "Mira", "2026-10-01", "", "uid-bram", "OBT-3"]),
  ] });
  // Par identifiant de compte, ou par pseudo pour une ligne écrite à la main.
  const mine = shared.obtainedBy(obtained, { uid: "uid-ayla", displayName: "ayla" });
  assert.deepEqual(mine.map((entry) => entry.id), ["OBT-1", "OBT-2"]);
  assert.equal(shared.achievementOf(achievements, mine[1]).name, "Conteur");
  // Pas de type « Icône » : la colonne Icône est une colonne Fichier image, comme ailleurs.
  assert.equal(indexColumnKinds.icon, undefined);
  // L'index des succès : ses types de colonnes, et les colonnes lues par Eraser verrouillées.
  assert.deepEqual(worldColumnSpec("achievements", "Succès", "Icône"), { kind: "file", file: { accept: "image" } });
  assert.equal(worldColumnSpec("achievements", "Succès", "Sous-type").allowCustom, true);
  assert.deepEqual(worldColumnSpec("achievements", "Obtenus", "Succès").source, { index: "achievements", tab: "Succès", onlyTab: true });
  assert.equal(worldColumnSpec("achievements", "Obtenus", "Compte").hidden, true);
  assert.equal(worldColumnPolicy("achievements", "Succès", "Type", []).type, false);
  assert.equal(worldColumnPolicy("achievements", "Succès", "Sous-type", []).type, true);
  assert.deepEqual(worldIndexDefinitions.achievements.tabs.map((tab) => tab.name), ["Succès", "Obtenus"]);
});

test("shows existing rows in a view tab when they meet its conditions", async () => {
  const { matchesView, parseViewConditions, describeCondition } = await vite.ssrLoadModule("/lib/index-views.ts");
  const row = { Nom: "Épée runique", Type: "Arme, Rune", "Sous-type": "Épée", Prix: "120 PO", Note: "" };
  const cell = (column) => row[column] ?? "";
  // « est » vaut pour l'une des valeurs d'une case multiple, sans tenir compte des accents ni de la casse.
  assert.equal(matchesView({ match: "toutes", conditions: [{ column: "Type", operator: "est", value: "rune" }] }, cell), true);
  assert.equal(matchesView({ match: "toutes", conditions: [{ column: "Nom", operator: "contient", value: "epee" }, { column: "Prix", operator: "superieur", value: "100" }] }, cell), true);
  assert.equal(matchesView({ match: "toutes", conditions: [{ column: "Type", operator: "est", value: "Armure" }, { column: "Note", operator: "vide", value: "" }] }, cell), false);
  assert.equal(matchesView({ match: "une", conditions: [{ column: "Type", operator: "est", value: "Armure" }, { column: "Note", operator: "vide", value: "" }] }, cell), true);
  // Une colonne absente de l'onglet vaut une case vide ; sans condition, tout passe.
  assert.equal(matchesView({ match: "toutes", conditions: [{ column: "Élément", operator: "non-vide", value: "" }] }, cell), false);
  assert.equal(matchesView({ match: "toutes", conditions: [] }, cell), true);
  // Des conditions abîmées dans la feuille sont ignorées, sans rien bloquer.
  assert.deepEqual(parseViewConditions('[{"column":"Type","operator":"est","value":"Rune"},{"column":"","operator":"est"},{"column":"Nom","operator":"inconnu"}]'), [{ column: "Type", operator: "est", value: "Rune" }]);
  assert.deepEqual(parseViewConditions("pas du json"), []);
  assert.equal(describeCondition({ column: "Type", operator: "est", value: "Rune" }), "Type est « Rune »");
});

test("keeps runes, attributes and materials beside an item's links", async () => {
  const { parseItemAttachments, parseItemModifiers, serializeItemLinks } = await vite.ssrLoadModule("/lib/item-modifiers.ts");
  const raw = serializeItemLinks([{ target: "comp:Perception", value: "+5" }, { target: "comp:Perception", value: "" }], [{ kind: "rune", name: "Rune de feu" }, { kind: "rune", name: "rune de feu" }, { kind: "materiau", name: "Mithril" }, { kind: "attribut", name: " " }]);
  // Les liens chiffrés restent lus comme avant (les anciennes versions ignorent le reste)…
  assert.deepEqual(parseItemModifiers(raw), [{ target: "comp:Perception", value: "+5" }]);
  // …et les runes, attributs et matériaux sont gardés à côté, sans doublon ni nom vide.
  assert.deepEqual(parseItemAttachments(raw), [{ kind: "rune", name: "Rune de feu" }, { kind: "materiau", name: "Mithril" }]);
  assert.equal(serializeItemLinks([], []), "");
});

test("saves only reusable columns in a tab preset", async () => {
  const { presetColumnsOf, parsePresetColumns } = await vite.ssrLoadModule("/lib/index-presets.ts");
  const columns = presetColumnsOf([
    { header: "Nom", spec: { kind: "name-form" } },
    { header: "Type", spec: { kind: "choice", options: [{ value: "Rune" }] } },
    { header: "type", spec: { kind: "rich" } },
    { header: "ID", spec: { kind: "id" } },
    { header: "Prix", spec: { kind: "number", number: { unit: "money" } } },
    { header: "Ancienne", spec: { kind: "archived" } },
  ]);
  assert.deepEqual(columns.map((column) => column.header), ["Type", "Prix"]);
  assert.deepEqual(parsePresetColumns(JSON.stringify(columns)), columns);
  assert.deepEqual(parsePresetColumns("[1, {\"header\": \"X\"}]"), []);
});

test("offers a column type that sorts rows into tabs, and no second name column", async () => {
  const { indexColumnKinds } = await vite.ssrLoadModule("/lib/index-columns.ts");
  const { creatableKinds } = await vite.ssrLoadModule("/lib/index-schema-shared.ts");
  assert.ok(creatableKinds.includes("tab-sort"));
  assert.equal(creatableKinds.includes("name-form"), false);
  assert.equal(indexColumnKinds["name-form"].creatable, false);
  // Chaque type proposé a sa phrase courte, pour une liste compacte.
  for (const kind of creatableKinds) assert.ok(indexColumnKinds[kind].short, kind);
});
