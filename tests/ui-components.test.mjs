import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
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

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
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
  const { richTextHtml, htmlToRichText } = await vite.ssrLoadModule(
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

test("spends and recovers spell charges only at the edge of the bar", async () => {
  const { nextSpellChargeValue, SpellChargeStars } = await vite.ssrLoadModule(
    "/components/eraser/spell-charges.tsx",
  );
  assert.equal(nextSpellChargeValue(5, 5, 3), 5);
  assert.equal(nextSpellChargeValue(5, 5, 4), 4);
  assert.equal(nextSpellChargeValue(5, 3, 2), 2);
  assert.equal(nextSpellChargeValue(5, 3, 3), 4);
  assert.equal(nextSpellChargeValue(5, 3, 4), 3);
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
