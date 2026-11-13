import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = await mkdtemp(join(tmpdir(), "eraser-roll20-companion-"));
process.env.ERASER_DESKTOP_DATA_DIR = join(work, "donnees");
process.env.ERASER_ROLL20_COMPANION_ANY_OS = "1";
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); await rm(work, { recursive: true, force: true }); });
const companion = await vite.ssrLoadModule("/lib/roll20-companion.ts");
const roll20 = await vite.ssrLoadModule("/lib/roll20-url.ts");
const source = (name) => readFile(join(root, "integrations/roll20/extension", name), "utf8");

test("les fichiers écrits sur le PC sont ceux du compagnon (integrations/roll20/extension), comme dans le ZIP", async () => {
  assert.deepEqual(Object.keys(companion.companionFiles).sort(), ["background.js", "content.css", "content.js", "manifest.json", "page.js", "token-art.js"]);
  for (const [name, text] of Object.entries(companion.companionFiles)) assert.equal(text, await source(name), name);
  // Le compagnon et le script Mod portent la même version.
  const version = JSON.parse(await source("manifest.json")).version;
  assert.match(await readFile(join(root, "integrations/roll20/eraser-bridge.mod.js"), "utf8"), new RegExp(`var VERSION = '${version.replace(/\./g, "\\.")}';`));
  assert.equal(await readFile(join(root, "public/roll20/eraser-bridge.mod.js"), "utf8"), await readFile(join(root, "integrations/roll20/eraser-bridge.mod.js"), "utf8"));
});

test("le dossier choisi : le compagnon lui-même, celui qu'il contient, un dossier vide, sinon un sous-dossier", async () => {
  const empty = join(work, "vide");
  await mkdir(empty, { recursive: true });
  assert.equal(await companion.companionFolderFrom(empty), empty);
  const downloads = join(work, "Téléchargements");
  await mkdir(downloads, { recursive: true });
  await writeFile(join(downloads, "facture.pdf"), "pdf");
  assert.equal(await companion.companionFolderFrom(downloads), join(downloads, "Eraser - Compagnon Roll20"));
  // Le ZIP décompressé dans Téléchargements : son dossier est retrouvé.
  const unzipped = join(downloads, "eraser-roll20-companion");
  await companion.writeCompanionFiles(unzipped);
  assert.equal(await companion.companionFolderFrom(downloads), unzipped);
  assert.equal(await companion.companionFolderFrom(unzipped), unzipped);
  // Une autre extension n'est jamais prise pour le compagnon.
  const other = join(work, "autre");
  await mkdir(other, { recursive: true });
  await writeFile(join(other, "manifest.json"), JSON.stringify({ name: "Autre", version: "9.9.9" }));
  assert.equal(await companion.companionVersionIn(other), "");
  assert.equal(await companion.companionFolderFrom(other), join(other, "Eraser - Compagnon Roll20"));
});

test("mettre à jour : les fichiers remplacés, le dossier retenu, les autres fichiers laissés", async () => {
  const folder = join(work, "compagnon");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "manifest.json"), JSON.stringify({ name: "Eraser — Compagnon Roll20", version: "0.1.0" }));
  await writeFile(join(folder, "content.js"), "// ancien");
  await writeFile(join(folder, "notes du MJ.txt"), "à garder");
  const chosen = await companion.rememberCompanionFolder(folder);
  assert.equal(chosen.folder, folder);
  assert.equal(chosen.folderVersion, "0.1.0");
  const state = await companion.installCompanion();
  assert.equal(state.folderVersion, state.version);
  assert.equal(await readFile(join(folder, "content.js"), "utf8"), await source("content.js"));
  assert.equal(await readFile(join(folder, "notes du MJ.txt"), "utf8"), "à garder");
  assert.equal((await readdir(folder)).some((name) => name.endsWith(".tmp")), false);
  await assert.rejects(companion.rememberCompanionFolder("relatif/dossier"), /COMPANION_FOLDER_INVALID/);
});

test("la page des scripts Mod se déduit du lien de la partie Roll20", () => {
  assert.equal(roll20.roll20ScriptsUrlFrom("https://app.roll20.net/join/12345678/AbCdEf"), "https://app.roll20.net/campaigns/scripts/12345678");
  assert.equal(roll20.roll20ScriptsUrlFrom("https://app.roll20.net/campaigns/details/987/ma-partie"), "https://app.roll20.net/campaigns/scripts/987");
  assert.equal(roll20.roll20ScriptsUrlFrom("https://app.roll20.net/editor/setcampaign/42"), "https://app.roll20.net/campaigns/scripts/42");
  assert.equal(roll20.roll20ScriptsUrlFrom("https://app.roll20.net/"), "");
  assert.equal(roll20.roll20ScriptsUrlFrom(""), "");
});
